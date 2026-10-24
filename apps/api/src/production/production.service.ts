import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, lt, sql } from 'drizzle-orm';
import { AuthUser } from '../common/auth.types';
import { addHours, round3, startOfDay } from '../common/util';
import { DB, Db } from '../db/db.module';
import { inventoryBatches, orders, productionItems, productionOrders, stockMovements, stockReservations, users } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderOps } from '../orders/order-ops.service';

/** Kitchen (FR-37, FR-69, FR-72, FR-93 to FR-95). Kitchen staff never see prices or payments (BR-11). */
@Injectable()
export class ProductionService {
  constructor(@Inject(DB) private db: Db, private ops: OrderOps, private notify: NotificationsService) {}

  async list(status?: string) {
    const st = (status ? status.split(',') : ['PLANNED', 'IN_PROGRESS']) as ('PLANNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED')[];
    const rows = await this.db.select({
      id: productionOrders.id, status: productionOrders.status, scheduledFor: productionOrders.scheduledFor, startedAt: productionOrders.startedAt,
      completedAt: productionOrders.completedAt, orderId: orders.id, orderNumber: orders.number, orderStatus: orders.status, deliveryAt: orders.deliveryAt,
      type: orders.type, guestCount: orders.guestCount, notes: orders.notes, allergyNotes: orders.allergyNotes, isDelayed: orders.isDelayed, customer: users.company,
    }).from(productionOrders).innerJoin(orders, eq(productionOrders.orderId, orders.id)).innerJoin(users, eq(orders.customerId, users.id))
      .where(inArray(productionOrders.status, st)).orderBy(asc(orders.deliveryAt)).limit(100);
    const ids = rows.map((r) => r.id);
    const items = ids.length ? await this.db.select().from(productionItems).where(inArray(productionItems.productionOrderId, ids)) : [];
    return rows.map((r) => ({ ...r, items: items.filter((i) => i.productionOrderId === r.id).map((i) => ({ name: i.name, portions: i.portions })) }));
  }

  /** FR-94: daily production schedule totalled by dish. */
  async schedule(date?: string) {
    const day = startOfDay(date ? new Date(date) : new Date());
    const rows = await this.db.select({ name: productionItems.name, portions: sql<string>`sum(${productionItems.portions})`, orders: sql<number>`count(distinct ${orders.id})::int` })
      .from(productionItems).innerJoin(productionOrders, eq(productionItems.productionOrderId, productionOrders.id)).innerJoin(orders, eq(productionOrders.orderId, orders.id))
      .where(and(gte(orders.deliveryAt, day), lt(orders.deliveryAt, addHours(day, 24)), inArray(productionOrders.status, ['PLANNED', 'IN_PROGRESS', 'DONE'])))
      .groupBy(productionItems.name).orderBy(productionItems.name);
    return { date: day, dishes: rows.map((r) => ({ name: r.name, portions: Number(r.portions), orders: r.orders })) };
  }

  private async load(id: number) {
    const [po] = await this.db.select().from(productionOrders).where(eq(productionOrders.id, id));
    if (!po) throw new NotFoundException('Production order not found');
    return po;
  }

  /** Production begins: issue reserved ingredients, earliest expiry first; expired batches are never used (BR-24, BR-25). */
  async start(user: AuthUser, id: number) {
    const po = await this.load(id);
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, po.orderId);
      if (po.status !== 'PLANNED') throw new ConflictException('This production order has already started');
      const res = await tx.select().from(stockReservations).where(and(eq(stockReservations.orderId, o.id), eq(stockReservations.status, 'ACTIVE')));
      const now = new Date();
      for (const r of res) {
        let left = r.qty;
        const batches = await tx.select().from(inventoryBatches)
          .where(and(eq(inventoryBatches.ingredientId, r.ingredientId), gt(inventoryBatches.qty, 0), gt(inventoryBatches.expiresAt, now)))
          .orderBy(asc(inventoryBatches.expiresAt)).for('update');
        for (const b of batches) {
          if (left <= 0) break;
          const take = round3(Math.min(b.qty, left));
          await tx.update(inventoryBatches).set({ qty: round3(b.qty - take) }).where(eq(inventoryBatches.id, b.id));
          await tx.insert(stockMovements).values({ ingredientId: r.ingredientId, batchId: b.id, type: 'ISSUE', qty: take, orderId: o.id, userId: user.id, note: `Issued to production ${o.number} (lot ${b.lotNo})` });
          left = round3(left - take);
        }
        if (left > 0.0005) throw new ConflictException('Not enough usable stock to start production. Ask the Inventory Manager to check expired batches.');
      }
      if (res.length) await tx.update(stockReservations).set({ status: 'ISSUED' }).where(inArray(stockReservations.id, res.map((r) => r.id)));
      await tx.update(productionOrders).set({ status: 'IN_PROGRESS', startedAt: now }).where(eq(productionOrders.id, id));
      await this.ops.transition(tx, o, 'PREPARING', user.id, 'Kitchen started preparation; ingredients issued');
      await this.notify.notify(tx, [o.customerId], `Order ${o.number} is being prepared`, 'Our kitchen has started preparing your order.', { orderId: o.id, link: `/orders/${o.id}` });
      return { id, status: 'IN_PROGRESS' };
    });
  }

  /** Ready for dispatch after quality and allergen checks (FR-95, BR-32); waste is recorded (FR-69). */
  async ready(user: AuthUser, id: number, body: { allergenChecked?: boolean; qualityNote?: string; waste?: { ingredientId: number; qty: number }[] }) {
    const po = await this.load(id);
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, po.orderId);
      if (po.status !== 'IN_PROGRESS') throw new ConflictException('Start production before marking it ready');
      if (o.allergyNotes.trim() && !body.allergenChecked) {
        throw new BadRequestException(`This order has allergy notes ("${o.allergyNotes}"). Confirm the allergen check before dispatch.`);
      }
      for (const w of body.waste ?? []) {
        if (w.qty > 0) await tx.insert(stockMovements).values({ ingredientId: w.ingredientId, type: 'WASTE', qty: w.qty, orderId: o.id, userId: user.id, note: `Waste recorded for ${o.number}` });
      }
      await tx.update(productionOrders).set({ status: 'DONE', completedAt: new Date(), qualityNote: body.qualityNote ?? '' }).where(eq(productionOrders.id, id));
      await this.ops.transition(tx, o, 'READY_FOR_DISPATCH', user.id, `Quality check passed${o.allergyNotes ? '; allergen check confirmed' : ''}${body.qualityNote ? ` - ${body.qualityNote}` : ''}`, { allergenChecked: !!body.allergenChecked });
      await this.notify.notifyRoles(tx, ['DELIVERY_MANAGER'], `${o.number} ready for dispatch`, 'Assign a driver.', { orderId: o.id, link: '/dispatch' });
      return { id, status: 'DONE' };
    });
  }
}
