import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { addHours, round3, fmt } from '../common/util';
import { DbOrTx } from '../db/db.module';
import {
  invoices, orderLineCustomizations, orderLines, orders, orderStatusHistory, OrderStatus, productionItems, productionOrders, stockMovements, stockReservations,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingService } from '../pricing/pricing.service';
import { SettingsService } from '../settings/settings.service';
import { STATUS_LABEL, TRANSITIONS } from './lifecycle';

export type OrderRow = typeof orders.$inferSelect;

@Injectable()
export class OrderOps {
  constructor(private pricing: PricingService, private notify: NotificationsService, private settings: SettingsService) {}

  async lockOrder(tx: DbOrTx, id: number): Promise<OrderRow> {
    const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    if (!o) throw new NotFoundException('Order not found');
    return o;
  }

  /** The only way an order status changes: checked against the lifecycle and written to the history (FR-79, FR-80). */
  async transition(tx: DbOrTx, order: OrderRow, to: OrderStatus, userId: number | null, comment = '', extra: Partial<OrderRow> = {}) {
    if (!TRANSITIONS[order.status].includes(to)) {
      throw new ConflictException(`An order cannot move from "${STATUS_LABEL[order.status]}" to "${STATUS_LABEL[to]}".`);
    }
    await tx.update(orders).set({ ...extra, status: to, updatedAt: new Date() }).where(eq(orders.id, order.id));
    await tx.insert(orderStatusHistory).values({ orderId: order.id, fromStatus: order.status, toStatus: to, userId, comment });
    order.status = to;
  }

  async lineInputs(tx: DbOrTx, orderId: number) {
    const lines = await tx.query.orderLines.findMany({ where: eq(orderLines.orderId, orderId), with: { customizations: true } });
    return lines.map((l) => ({ productId: l.productId, qty: l.qty, customizations: l.customizations.map((c) => ({ optionId: c.optionId, qty: c.qty })) }));
  }

  /**
   * Confirmation (FR-57, FR-67, FR-72): check availability for the fulfilment date, reserve the stock,
   * create the production order and (by policy) the invoice. A shortage blocks confirmation and alerts inventory (FR-68).
   */
  async confirm(tx: DbOrTx, order: OrderRow, userId: number, comment = 'Order confirmed') {
    const inputs = await this.lineInputs(tx, order.id);
    const catalog = await this.pricing.loadProducts(tx, inputs.map((l) => l.productId));
    const { portions, needs } = this.pricing.explode(inputs, catalog);
    const avail = await this.pricing.availability(tx, needs, order.deliveryAt, order.id);
    if (avail.status === 'SHORTAGE') {
      const list = avail.shortages.map((s) => `${s.name}: need ${s.needed} ${s.unit}, available ${s.available}`).join('; ');
      await this.notify.notifyRoles(tx, ['INVENTORY_MANAGER', 'KITCHEN'], `Shortage blocks order ${order.number}`, list, { orderId: order.id, link: '/inventory' });
      throw new ConflictException({ message: `Cannot confirm ${order.number}: not enough stock for the delivery date.`, shortages: avail.shortages });
    }
    for (const [ingredientId, q] of needs) {
      if (q <= 0) continue;
      await tx.insert(stockReservations).values({ orderId: order.id, ingredientId, qty: round3(q), forDate: order.deliveryAt });
      await tx.insert(stockMovements).values({ ingredientId, type: 'RESERVE', qty: round3(q), orderId: order.id, userId, note: `Reserved for ${order.number}` });
    }
    const [po] = await tx.insert(productionOrders).values({ orderId: order.id, scheduledFor: addHours(order.deliveryAt, -2) }).returning();
    const items = [...portions].filter(([, n]) => n > 0);
    if (items.length) {
      await tx.insert(productionItems).values(items.map(([productId, n]) => ({ productionOrderId: po.id, productId, name: catalog.get(productId)?.name ?? '', portions: n })));
    }
    await this.transition(tx, order, 'CONFIRMED', userId, comment, { confirmedAt: new Date() });
    const s = await this.settings.all();
    if (s.invoiceOn === 'CONFIRMATION') await this.issueInvoice(tx, order);
    await this.notify.notify(tx, [order.customerId], `Order ${order.number} confirmed`, `Your order for ${fmt(order.deliveryAt)} is confirmed.`, { orderId: order.id, link: `/orders/${order.id}` });
    await this.notify.notifyRoles(tx, ['KITCHEN'], `New production order for ${order.number}`, `${items.length} dishes to prepare.`, { orderId: order.id, link: '/kitchen' });
  }

  async releaseReservations(tx: DbOrTx, order: OrderRow, userId: number | null) {
    const active = await tx.select().from(stockReservations).where(and(eq(stockReservations.orderId, order.id), eq(stockReservations.status, 'ACTIVE')));
    for (const r of active) {
      await tx.insert(stockMovements).values({ ingredientId: r.ingredientId, type: 'RELEASE', qty: r.qty, orderId: order.id, userId, note: `Released: ${order.number} cancelled` });
    }
    if (active.length) await tx.update(stockReservations).set({ status: 'RELEASED' }).where(inArray(stockReservations.id, active.map((r) => r.id)));
    await tx.update(productionOrders).set({ status: 'CANCELLED' }).where(and(eq(productionOrders.orderId, order.id), inArray(productionOrders.status, ['PLANNED'])));
  }

  /** FR-96: invoice lines come from the order's own price snapshot, never today's catalog (BR-20). */
  async issueInvoice(tx: DbOrTx, order: OrderRow) {
    const existing = await tx.select().from(invoices).where(eq(invoices.orderId, order.id));
    if (existing.length) return existing[0];
    const [fresh] = await tx.select().from(orders).where(eq(orders.id, order.id));
    const s = await this.settings.all();
    const [inv] = await tx.insert(invoices).values({
      number: `TMP-${order.id}-${Date.now()}`, orderId: order.id, amount: fresh.total, tax: fresh.tax, dueAt: addHours(new Date(), s.invoiceDueDays * 24),
    }).returning();
    const d = new Date();
    const number = `INV-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(inv.id).padStart(5, '0')}`;
    await tx.update(invoices).set({ number }).where(eq(invoices.id, inv.id));
    await this.notify.notify(tx, [order.customerId], `Invoice ${number} issued`, `Amount ${fresh.total} ${s.currency}, due in ${s.invoiceDueDays} days.`, { orderId: order.id, link: '/invoices' });
    return { ...inv, number };
  }

  /** Writes the price snapshot lines (FR-55). */
  async writeLines(tx: DbOrTx, orderId: number, lines: Awaited<ReturnType<PricingService['quote']>>['lines']) {
    for (const l of lines) {
      const [row] = await tx.insert(orderLines).values({
        orderId, productId: l.productId, productName: l.productName, productNameAr: l.productNameAr, productType: l.productType,
        unit: l.unit, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal,
      }).returning();
      if (l.customizations.length) {
        await tx.insert(orderLineCustomizations).values(l.customizations.map((c) => ({ lineId: row.id, ...c })));
      }
    }
  }
}
