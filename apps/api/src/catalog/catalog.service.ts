import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AuthUser, can } from '../common/auth.types';
import { DB, Db } from '../db/db.module';
import { categories, deliveryZones, ingredients, packageComponents, packageOptions, products, recipeLines } from '../db/schema';
import { ProductDto } from './catalog.dto';

/** One catalog for everything the company sells (UC-07, FR-44 to FR-50). */
@Injectable()
export class CatalogService {
  constructor(@Inject(DB) private db: Db) {}

  async list(user: AuthUser, includeInactive = false) {
    const manager = can(user, 'catalog.manage');
    const rows = await this.db.query.products.findMany({
      where: includeInactive && manager ? undefined : eq(products.isActive, true),
      with: { category: true, components: { with: { item: { columns: { id: true, name: true, nameAr: true, image: true } } } }, options: true,
        recipe: manager ? { with: { ingredient: { columns: { id: true, name: true, unit: true } } } } : undefined },
      orderBy: [asc(products.categoryId), asc(products.name)],
    });
    return rows;
  }

  async get(user: AuthUser, id: number) {
    const p = await this.db.query.products.findFirst({
      where: eq(products.id, id),
      with: { category: true, components: { with: { item: true } }, options: true, recipe: { with: { ingredient: true } } },
    });
    if (!p || (!p.isActive && !can(user, 'catalog.manage'))) throw new NotFoundException('Item not found');
    return p;
  }

  categories() { return this.db.select().from(categories).orderBy(asc(categories.sort)); }
  zones() { return this.db.select().from(deliveryZones).where(eq(deliveryZones.isActive, true)).orderBy(asc(deliveryZones.name)); }
  ingredients() { return this.db.select().from(ingredients).orderBy(asc(ingredients.name)); }

  /** FR-46: create or edit. Confirmed orders keep their own price snapshot (FR-63). */
  async save(id: number | null, dto: ProductDto) {
    return this.db.transaction(async (tx) => {
      const values = {
        sku: dto.sku, type: dto.type, name: dto.name, nameAr: dto.nameAr ?? dto.name, description: dto.description ?? '', descriptionAr: dto.descriptionAr ?? '',
        categoryId: dto.categoryId, price: dto.price, unit: dto.unit, minQty: dto.minQty ?? 1, leadTimeHours: dto.leadTimeHours ?? 24,
        dietaryTags: dto.dietaryTags ?? [], allergens: dto.allergens ?? [], image: dto.image ?? '🍽️', isActive: dto.isActive ?? true, updatedAt: new Date(),
      };
      let pid = id;
      if (pid) {
        const r = await tx.update(products).set(values).where(eq(products.id, pid)).returning({ id: products.id });
        if (!r.length) throw new NotFoundException('Item not found');
      } else {
        const exists = await tx.select().from(products).where(eq(products.sku, dto.sku));
        if (exists.length) throw new BadRequestException('This SKU is already used');
        [{ id: pid }] = await tx.insert(products).values(values).returning({ id: products.id });
      }
      if (dto.components) {
        if (dto.type === 'FOOD_ITEM' || dto.type === 'SERVICE') throw new BadRequestException('Only packages and event menus have components');
        await tx.delete(packageComponents).where(eq(packageComponents.packageId, pid!));
        if (dto.components.length) await tx.insert(packageComponents).values(dto.components.map((c) => ({ packageId: pid!, itemId: c.itemId, qty: c.qty })));
      }
      if (dto.options) {
        await tx.delete(packageOptions).where(eq(packageOptions.packageId, pid!));
        if (dto.options.length) await tx.insert(packageOptions).values(dto.options.map((o) => ({ packageId: pid!, kind: o.kind, label: o.label, labelAr: o.labelAr ?? o.label, fromItemId: o.fromItemId ?? null, toItemId: o.toItemId, priceDelta: o.priceDelta })));
      }
      if (dto.recipe) {
        if (dto.type !== 'FOOD_ITEM') throw new BadRequestException('Only food items have recipes');
        await tx.delete(recipeLines).where(eq(recipeLines.productId, pid!));
        if (dto.recipe.length) await tx.insert(recipeLines).values(dto.recipe.map((r) => ({ productId: pid!, ingredientId: r.ingredientId, qtyPerPortion: r.qtyPerPortion })));
      }
      return { id: pid };
    });
  }

  async setActive(id: number, isActive: boolean) {
    const r = await this.db.update(products).set({ isActive, updatedAt: new Date() }).where(eq(products.id, id)).returning({ id: products.id });
    if (!r.length) throw new NotFoundException('Item not found');
    return { id, isActive };
  }

  async byIds(ids: number[]) {
    return ids.length ? this.db.select().from(products).where(and(inArray(products.id, ids))) : [];
  }
}
