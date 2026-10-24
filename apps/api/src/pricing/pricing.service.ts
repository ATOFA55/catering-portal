import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, gt, gte, inArray, lt, ne, notInArray, sql } from 'drizzle-orm';
import { addHours, round2, round3, startOfHour, fmt } from '../common/util';
import { DbOrTx } from '../db/db.module';
import {
  deliveryZones, ingredients, inventoryBatches, orders, packageComponents, packageOptions, products, recipeLines, stockReservations,
} from '../db/schema';
import { SettingsService } from '../settings/settings.service';

export interface CustomizationInput { optionId: number; qty: number }
export interface LineInput { productId: number; qty: number; customizations?: CustomizationInput[] }
export interface QuoteInput {
  type: 'DAILY' | 'EVENT';
  lines: LineInput[];
  zoneId: number;
  deliveryAt: string | Date;
  guestCount?: number | null;
  manualDiscount?: number;
  excludeOrderId?: number;
  skipLeadTime?: boolean;
}

type ProductRow = typeof products.$inferSelect & {
  components: (typeof packageComponents.$inferSelect)[];
  options: (typeof packageOptions.$inferSelect)[];
  recipe: (typeof recipeLines.$inferSelect)[];
};

export interface QuoteLine {
  productId: number; productName: string; productNameAr: string; productType: ProductRow['type']; unit: string; image: string;
  qty: number; unitPrice: number; lineTotal: number;
  customizations: { optionId: number; kind: 'SUBSTITUTION' | 'EXTRA'; label: string; qty: number; priceDelta: number; fromItemId: number | null; toItemId: number }[];
}
export interface Shortage { ingredientId: number; name: string; unit: string; needed: number; available: number }
export interface Quote {
  lines: QuoteLine[];
  subtotal: number; deliveryFee: number; serviceFee: number; discount: number; discountReason: string; taxRate: number; tax: number; total: number;
  currency: string;
  errors: string[];
  suggestedSlot: string | null;
  availability: { status: 'AVAILABLE' | 'SHORTAGE'; shortages: Shortage[] };
  portions: { productId: number; name: string; portions: number }[];
  needs: { ingredientId: number; qty: number }[];
}

/** Order Builder pricing (FR-59, FR-60), validation (FR-54) and availability estimate (FR-66, BR-23). */
@Injectable()
export class PricingService {
  constructor(private settings: SettingsService) {}

  async loadProducts(tx: DbOrTx, ids: number[]): Promise<Map<number, ProductRow>> {
    const map = new Map<number, ProductRow>();
    let pending = [...new Set(ids)];
    while (pending.length) {
      const rows = (await tx.query.products.findMany({
        where: inArray(products.id, pending), with: { components: true, options: true, recipe: true },
      })) as ProductRow[];
      pending = [];
      for (const r of rows) {
        map.set(r.id, r);
        for (const c of r.components) if (!map.has(c.itemId)) pending.push(c.itemId);
        for (const o of r.options) {
          if (!map.has(o.toItemId)) pending.push(o.toItemId);
          if (o.fromItemId && !map.has(o.fromItemId)) pending.push(o.fromItemId);
        }
      }
      pending = [...new Set(pending)].filter((id) => !map.has(id));
    }
    return map;
  }

  /** Package breakdown then recipe explosion (FR-64, FR-65): customer's final selection -> portions -> ingredients. */
  explode(lines: LineInput[], catalog: Map<number, ProductRow>) {
    const portions = new Map<number, number>();
    const add = (id: number, n: number) => portions.set(id, (portions.get(id) ?? 0) + n);
    for (const l of lines) {
      const p = catalog.get(l.productId);
      if (!p) continue;
      if (p.type === 'FOOD_ITEM') add(p.id, l.qty);
      if (p.type === 'PACKAGE' || p.type === 'EVENT_MENU') {
        for (const c of p.components) add(c.itemId, c.qty * l.qty);
        for (const cu of l.customizations ?? []) {
          const o = p.options.find((x) => x.id === cu.optionId);
          if (!o) continue;
          if (o.kind === 'SUBSTITUTION' && o.fromItemId) {
            const per = p.components.find((c) => c.itemId === o.fromItemId)?.qty ?? 1;
            add(o.fromItemId, -per * cu.qty);
            add(o.toItemId, per * cu.qty);
          } else add(o.toItemId, cu.qty);
        }
      }
    }
    const needs = new Map<number, number>();
    for (const [itemId, n] of portions) {
      if (n <= 0) continue;
      for (const r of catalog.get(itemId)?.recipe ?? []) needs.set(r.ingredientId, round3((needs.get(r.ingredientId) ?? 0) + n * r.qtyPerPortion));
    }
    return { portions, needs };
  }

  /** Available = stock not expired by the fulfilment date - stock reserved by other orders (BR-23, BR-25). */
  async availability(tx: DbOrTx, needs: Map<number, number>, forDate: Date, excludeOrderId?: number) {
    const ids = [...needs.keys()];
    if (!ids.length) return { status: 'AVAILABLE' as const, shortages: [] as Shortage[] };
    const ings = await tx.select().from(ingredients).where(inArray(ingredients.id, ids));
    const onHand = await tx.select({ id: inventoryBatches.ingredientId, q: sql<string>`coalesce(sum(${inventoryBatches.qty}),0)` })
      .from(inventoryBatches).where(and(inArray(inventoryBatches.ingredientId, ids), gt(inventoryBatches.expiresAt, forDate), gt(inventoryBatches.qty, 0)))
      .groupBy(inventoryBatches.ingredientId);
    const resWhere = [inArray(stockReservations.ingredientId, ids), eq(stockReservations.status, 'ACTIVE' as const)];
    if (excludeOrderId) resWhere.push(ne(stockReservations.orderId, excludeOrderId));
    const reserved = await tx.select({ id: stockReservations.ingredientId, q: sql<string>`coalesce(sum(${stockReservations.qty}),0)` })
      .from(stockReservations).where(and(...resWhere)).groupBy(stockReservations.ingredientId);
    const shortages: Shortage[] = [];
    for (const ing of ings) {
      const have = Number(onHand.find((x) => x.id === ing.id)?.q ?? 0) - Number(reserved.find((x) => x.id === ing.id)?.q ?? 0);
      const need = needs.get(ing.id) ?? 0;
      if (need > have + 1e-9) shortages.push({ ingredientId: ing.id, name: ing.name, unit: ing.unit, needed: round3(need), available: round3(Math.max(have, 0)) });
    }
    return { status: shortages.length ? ('SHORTAGE' as const) : ('AVAILABLE' as const), shortages };
  }

  async slotLoad(tx: DbOrTx, slotStart: Date, excludeOrderId?: number) {
    const where = [gte(orders.deliveryAt, slotStart), lt(orders.deliveryAt, addHours(slotStart, 1)), notInArray(orders.status, ['DRAFT', 'CANCELLED'] as const)];
    if (excludeOrderId) where.push(ne(orders.id, excludeOrderId));
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(...where));
    return n;
  }

  async quote(tx: DbOrTx, input: QuoteInput): Promise<Quote> {
    const s = await this.settings.all();
    const errors: string[] = [];
    const deliveryAt = new Date(input.deliveryAt);
    if (Number.isNaN(deliveryAt.getTime())) throw new BadRequestException('Delivery date and time are required');
    if (!input.lines?.length) throw new BadRequestException('Add at least one item to the order');

    const catalog = await this.loadProducts(tx, input.lines.map((l) => l.productId));
    const lines: QuoteLine[] = [];
    let maxLead = input.type === 'DAILY' ? s.defaultLeadTimeHours : 0;
    let bulkUnits = 0;

    for (const l of input.lines) {
      const p = catalog.get(l.productId);
      if (!p || !p.isActive) { errors.push(`Item #${l.productId} is not available`); continue; }
      const qty = Math.floor(Number(l.qty));
      if (!(qty >= 1)) { errors.push(`Enter a quantity for ${p.name}`); continue; }
      if (p.type === 'EVENT_MENU') {
        if (input.type !== 'EVENT') errors.push(`${p.name} can only be ordered as an event order`);
        if (input.guestCount && qty !== input.guestCount) errors.push(`${p.name} must be ordered for the full guest count (${input.guestCount})`);
      }
      if (qty < p.minQty) errors.push(`Minimum quantity for ${p.name} is ${p.minQty} ${p.unit}${p.minQty > 1 ? 's' : ''}`);
      maxLead = Math.max(maxLead, p.leadTimeHours);
      if (p.type === 'PACKAGE' || p.type === 'EVENT_MENU') bulkUnits += qty;

      const customizations: QuoteLine['customizations'] = [];
      const subTotals = new Map<number, number>();
      for (const c of l.customizations ?? []) {
        const o = p.options.find((x) => x.id === c.optionId);
        const cq = Math.floor(Number(c.qty));
        if (!o) { errors.push(`That option is not allowed for ${p.name}`); continue; } // BR-19
        if (!(cq >= 1)) continue;
        if (cq > qty) errors.push(`"${o.label}" cannot apply to more than ${qty} ${p.unit}s`);
        if (o.kind === 'SUBSTITUTION' && o.fromItemId) {
          const t = (subTotals.get(o.fromItemId) ?? 0) + cq;
          subTotals.set(o.fromItemId, t);
          if (t > qty) errors.push(`Too many substitutions for ${catalog.get(o.fromItemId)?.name ?? 'an item'} in ${p.name}`);
        }
        customizations.push({ optionId: o.id, kind: o.kind, label: o.label, qty: cq, priceDelta: o.priceDelta, fromItemId: o.fromItemId, toItemId: o.toItemId });
      }
      const extras = customizations.reduce((a, c) => a + c.priceDelta * c.qty, 0);
      lines.push({
        productId: p.id, productName: p.name, productNameAr: p.nameAr, productType: p.type, unit: p.unit, image: p.image,
        qty, unitPrice: p.price, lineTotal: round2(qty * p.price + extras), customizations,
      });
    }

    if (input.type === 'EVENT' && !(Number(input.guestCount) > 0)) errors.push('Enter the number of guests for the event');

    const subtotal = round2(lines.reduce((a, l) => a + l.lineTotal, 0));
    const [zone] = await tx.select().from(deliveryZones).where(eq(deliveryZones.id, input.zoneId));
    if (!zone || !zone.isActive) errors.push('We do not deliver to this area yet');
    else if (subtotal < zone.minOrder) errors.push(`Minimum order for ${zone.name} is ${zone.minOrder} ${s.currency}`);
    const deliveryFee = zone ? zone.fee : 0;
    const serviceFee = input.type === 'EVENT' ? round2(subtotal * s.eventServiceFeeRate) : 0;

    let discount = 0;
    let discountReason = '';
    if (bulkUnits >= s.quantityDiscountThreshold) {
      discount = round2(subtotal * s.quantityDiscountRate);
      discountReason = `Quantity discount ${Math.round(s.quantityDiscountRate * 100)}% (${s.quantityDiscountThreshold}+ units)`;
    }
    if (input.manualDiscount && input.manualDiscount > discount) {
      discount = round2(input.manualDiscount);
      discountReason = 'Discount approved by the Order Manager';
    }

    const taxBase = subtotal + deliveryFee + serviceFee - discount;
    const tax = round2(taxBase * s.taxRate);
    const total = round2(taxBase + tax); // FR-60: subtotal + delivery + service fees + tax - discount

    // lead time (FR-54) and slot capacity (FR-09)
    if (!input.skipLeadTime) {
      const earliest = addHours(new Date(), maxLead);
      if (deliveryAt < earliest) errors.push(`This order needs at least ${maxLead} hours' notice. Earliest delivery: ${fmt(earliest)}`);
    }
    let suggestedSlot: string | null = null;
    const slot = startOfHour(deliveryAt);
    if ((await this.slotLoad(tx, slot, input.excludeOrderId)) >= s.slotCapacity) {
      for (let h = 1; h <= 72; h++) {
        const cand = addHours(slot, h);
        if ((await this.slotLoad(tx, cand, input.excludeOrderId)) < s.slotCapacity) { suggestedSlot = cand.toISOString(); break; }
      }
      errors.push('This delivery time slot is fully booked. Please choose another time.');
    }

    const { portions, needs } = this.explode(input.lines, catalog);
    const availability = await this.availability(tx, needs, deliveryAt, input.excludeOrderId);

    return {
      lines, subtotal, deliveryFee, serviceFee, discount, discountReason, taxRate: s.taxRate, tax, total, currency: s.currency,
      errors, suggestedSlot, availability,
      portions: [...portions].filter(([, n]) => n > 0).map(([productId, n]) => ({ productId, name: catalog.get(productId)?.name ?? '', portions: round2(n) })),
      needs: [...needs].map(([ingredientId, q]) => ({ ingredientId, qty: q })),
    };
  }
}
