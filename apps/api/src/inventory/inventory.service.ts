import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { AuthUser } from '../common/auth.types';
import { addHours, round2, round3 } from '../common/util';
import { DB, Db } from '../db/db.module';
import { ingredients, inventoryBatches, orders, stockMovements, stockReservations, users } from '../db/schema';

/** Inventory (FR-39, FR-67 to FR-71, NFR-14). Every change is a stock movement. */
@Injectable()
export class InventoryService {
  constructor(@Inject(DB) private db: Db) {}

  async levels() {
    const now = new Date();
    const ings = await this.db.select().from(ingredients).orderBy(ingredients.name);
    const onHand = await this.db.select({ id: inventoryBatches.ingredientId, q: sql<string>`sum(${inventoryBatches.qty})`, next: sql<Date>`min(${inventoryBatches.expiresAt})` })
      .from(inventoryBatches).where(and(gt(inventoryBatches.qty, 0), gt(inventoryBatches.expiresAt, now))).groupBy(inventoryBatches.ingredientId);
    const expired = await this.db.select({ id: inventoryBatches.ingredientId, q: sql<string>`sum(${inventoryBatches.qty})` })
      .from(inventoryBatches).where(and(gt(inventoryBatches.qty, 0), sql`${inventoryBatches.expiresAt} <= ${now}`)).groupBy(inventoryBatches.ingredientId);
    const reserved = await this.db.select({ id: stockReservations.ingredientId, q: sql<string>`sum(${stockReservations.qty})` })
      .from(stockReservations).where(eq(stockReservations.status, 'ACTIVE')).groupBy(stockReservations.ingredientId);
    return ings.map((i) => {
      const h = Number(onHand.find((x) => x.id === i.id)?.q ?? 0);
      const r = Number(reserved.find((x) => x.id === i.id)?.q ?? 0);
      const nextExpiry = onHand.find((x) => x.id === i.id)?.next ?? null;
      const available = round3(h - r);
      return { ...i, onHand: round3(h), reserved: round3(r), available, expired: round3(Number(expired.find((x) => x.id === i.id)?.q ?? 0)),
        nextExpiry, value: round2(h * i.costPerUnit), low: available < i.lowStockThreshold,
        expiringSoon: !!nextExpiry && new Date(nextExpiry) < addHours(now, 72) };
    });
  }

  async batches(ingredientId?: number) {
    return this.db.select({ b: inventoryBatches, name: ingredients.name, unit: ingredients.unit }).from(inventoryBatches)
      .innerJoin(ingredients, eq(inventoryBatches.ingredientId, ingredients.id))
      .where(and(gt(inventoryBatches.qty, 0), ingredientId ? eq(inventoryBatches.ingredientId, ingredientId) : undefined))
      .orderBy(asc(inventoryBatches.expiresAt)).then((r) => r.map((x) => ({ ...x.b, name: x.name, unit: x.unit, expired: x.b.expiresAt <= new Date() })));
  }

  async movements(limit = 60) {
    return this.db.select({ m: stockMovements, name: ingredients.name, unit: ingredients.unit, userName: users.name }).from(stockMovements)
      .innerJoin(ingredients, eq(stockMovements.ingredientId, ingredients.id)).leftJoin(users, eq(stockMovements.userId, users.id))
      .orderBy(desc(stockMovements.createdAt)).limit(limit).then((r) => r.map((x) => ({ ...x.m, name: x.name, unit: x.unit, userName: x.userName })));
  }

  async reservations() {
    return this.db.select({ id: stockReservations.id, qty: stockReservations.qty, forDate: stockReservations.forDate, name: ingredients.name, unit: ingredients.unit, orderNumber: orders.number, orderId: orders.id })
      .from(stockReservations).innerJoin(ingredients, eq(stockReservations.ingredientId, ingredients.id)).innerJoin(orders, eq(stockReservations.orderId, orders.id))
      .where(eq(stockReservations.status, 'ACTIVE')).orderBy(asc(stockReservations.forDate));
  }

  /** Goods in (FR-70): a new batch with lot number, expiry and location. */
  async receive(user: AuthUser, body: { ingredientId: number; qty: number; lotNo: string; expiresAt: string; location: string }) {
    if (!(body.qty > 0)) throw new BadRequestException('Quantity must be more than zero');
    if (new Date(body.expiresAt) <= new Date()) throw new BadRequestException('Expiry date must be in the future');
    return this.db.transaction(async (tx) => {
      const [b] = await tx.insert(inventoryBatches).values({ ingredientId: body.ingredientId, qty: round3(body.qty), lotNo: body.lotNo, expiresAt: new Date(body.expiresAt), location: body.location }).returning();
      await tx.insert(stockMovements).values({ ingredientId: body.ingredientId, batchId: b.id, type: 'RECEIPT', qty: round3(body.qty), userId: user.id, note: `Goods in, lot ${body.lotNo}` });
      return b;
    });
  }

  /** Waste or count correction on a batch. */
  async adjust(user: AuthUser, body: { batchId: number; qty: number; type: 'WASTE' | 'ADJUST'; note?: string }) {
    return this.db.transaction(async (tx) => {
      const [b] = await tx.select().from(inventoryBatches).where(eq(inventoryBatches.id, body.batchId)).for('update');
      if (!b) throw new BadRequestException('Batch not found');
      const newQty = round3(b.qty - body.qty);
      if (newQty < 0) throw new BadRequestException('You cannot remove more than the batch holds');
      await tx.update(inventoryBatches).set({ qty: newQty }).where(eq(inventoryBatches.id, b.id));
      await tx.insert(stockMovements).values({ ingredientId: b.ingredientId, batchId: b.id, type: body.type, qty: round3(body.qty), userId: user.id, note: body.note ?? '' });
      return { batchId: b.id, qty: newQty };
    });
  }
}
