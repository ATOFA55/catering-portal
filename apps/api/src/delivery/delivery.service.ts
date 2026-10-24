import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { AuthUser } from '../common/auth.types';
import { startOfDay, fmt } from '../common/util';
import { DB, Db } from '../db/db.module';
import { deliveries, orderLines, orders, orderStatusHistory, roles, users } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderOps } from '../orders/order-ops.service';
import { SettingsService } from '../settings/settings.service';

/** UC-03 Assign Delivery (FR-19 to FR-25, FR-103, FR-104). */
@Injectable()
export class DeliveryService {
  constructor(@Inject(DB) private db: Db, private ops: OrderOps, private notify: NotificationsService, private settings: SettingsService) {}

  async drivers() {
    const today = startOfDay(new Date());
    const rows = await this.db.select({ id: users.id, name: users.name, phone: users.phone, status: users.driverStatus })
      .from(users).innerJoin(roles, eq(users.roleId, roles.id)).where(and(eq(roles.code, 'DRIVER'), eq(users.isActive, true))).orderBy(users.name);
    const load = await this.db.select({ driverId: deliveries.driverId, total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${deliveries.status} = 'DELIVERED')::int` })
      .from(deliveries).where(gte(deliveries.createdAt, today)).groupBy(deliveries.driverId);
    return rows.map((d) => ({ ...d, today: load.find((l) => l.driverId === d.id) ?? { total: 0, done: 0 } }));
  }

  async board() {
    const rows = await this.db.select({
      id: orders.id, number: orders.number, status: orders.status, deliveryAt: orders.deliveryAt, isDelayed: orders.isDelayed,
      addressText: orders.addressText, contactName: orders.contactName, contactPhone: orders.contactPhone, type: orders.type, customer: users.company,
    }).from(orders).innerJoin(users, eq(orders.customerId, users.id))
      .where(inArray(orders.status, ['READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'])).orderBy(asc(orders.deliveryAt));
    const ids = rows.map((r) => r.id);
    const dels = ids.length ? await this.db.select({ d: deliveries, driverName: users.name }).from(deliveries).innerJoin(users, eq(deliveries.driverId, users.id))
      .where(inArray(deliveries.orderId, ids)).orderBy(desc(deliveries.createdAt)) : [];
    const items = ids.length ? await this.db.select({ orderId: orderLines.orderId, n: sql<number>`sum(${orderLines.qty})::int` }).from(orderLines)
      .where(inArray(orderLines.orderId, ids)).groupBy(orderLines.orderId) : [];
    return {
      orders: rows.map((r) => {
        const last = dels.find((x) => x.d.orderId === r.id);
        return { ...r, units: items.find((i) => i.orderId === r.id)?.n ?? 0, lastDelivery: last ? { ...last.d, driverName: last.driverName } : null };
      }),
      drivers: await this.drivers(),
    };
  }

  private async driver(id: number) {
    const [d] = await this.db.select({ u: users, code: roles.code }).from(users).innerJoin(roles, eq(users.roleId, roles.id)).where(eq(users.id, id));
    if (!d || d.code !== 'DRIVER' || !d.u.isActive) throw new BadRequestException('Choose a registered driver');
    return d.u;
  }

  /** BR-03: only Ready for Dispatch orders, only available drivers. FR-25: if none is available the order waits. */
  async assign(user: AuthUser, orderId: number, body: { driverId: number; departAt?: string }) {
    const driver = await this.driver(body.driverId);
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, orderId);
      if (o.status !== 'READY_FOR_DISPATCH') throw new ConflictException('A driver can be assigned only when the order is Ready for Dispatch');
      const [fresh] = await tx.select().from(users).where(eq(users.id, driver.id)).for('update');
      if (fresh.driverStatus !== 'AVAILABLE') {
        const avail = (await this.drivers()).filter((d) => d.status === 'AVAILABLE').length;
        throw new ConflictException(avail ? `${driver.name} is not available. Choose another driver.` : 'No driver is available right now. The order stays Ready for Dispatch until a driver is free.');
      }
      const departAt = body.departAt ? new Date(body.departAt) : new Date();
      await tx.insert(deliveries).values({ orderId, driverId: driver.id, departAt });
      await tx.update(users).set({ driverStatus: 'ON_DELIVERY' }).where(eq(users.id, driver.id));
      await this.ops.transition(tx, o, 'OUT_FOR_DELIVERY', user.id, `Assigned to ${driver.name}, departing ${fmt(departAt)}`);
      await this.notify.notify(tx, [o.customerId], `Order ${o.number} is on the way`, `Your driver ${driver.name} has left with your order.`, { orderId, link: `/orders/${orderId}` });
      await this.notify.notify(tx, [driver.id], `New delivery: ${o.number}`, o.addressText, { orderId, link: '/driver' });
      return { orderId, status: o.status };
    });
  }

  /** FR-24: reassign, both drivers notified. */
  async reassign(user: AuthUser, orderId: number, body: { driverId: number }) {
    const driver = await this.driver(body.driverId);
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, orderId);
      if (o.status !== 'OUT_FOR_DELIVERY') throw new ConflictException('Only orders out for delivery can be reassigned');
      const [cur] = await tx.select().from(deliveries).where(and(eq(deliveries.orderId, orderId), eq(deliveries.status, 'ASSIGNED')));
      if (!cur) throw new ConflictException('No active delivery to reassign');
      if (cur.driverId === driver.id) throw new BadRequestException('The order is already assigned to this driver');
      if (driver.driverStatus !== 'AVAILABLE') throw new ConflictException(`${driver.name} is not available`);
      await tx.update(deliveries).set({ status: 'CANCELLED', completedAt: new Date(), failureReason: 'Reassigned' }).where(eq(deliveries.id, cur.id));
      await tx.update(users).set({ driverStatus: 'AVAILABLE' }).where(eq(users.id, cur.driverId));
      await tx.insert(deliveries).values({ orderId, driverId: driver.id, departAt: new Date() });
      await tx.update(users).set({ driverStatus: 'ON_DELIVERY' }).where(eq(users.id, driver.id));
      await tx.insert(orderStatusHistory).values({ orderId, fromStatus: o.status, toStatus: o.status, userId: user.id, comment: `Reassigned to ${driver.name}` });
      await this.notify.notify(tx, [cur.driverId], `${o.number} reassigned`, 'This delivery was moved to another driver.', { orderId, link: '/driver' });
      await this.notify.notify(tx, [driver.id], `New delivery: ${o.number}`, o.addressText, { orderId, link: '/driver' });
      return { orderId };
    });
  }

  /** BR-05: a failed delivery is rescheduled by the Delivery Manager. */
  async reschedule(user: AuthUser, orderId: number, body: { deliveryAt: string }) {
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, orderId);
      if (o.status !== 'DELIVERY_FAILED') throw new ConflictException('Only failed deliveries can be rescheduled');
      const at = new Date(body.deliveryAt);
      await this.ops.transition(tx, o, 'READY_FOR_DISPATCH', user.id, `Delivery rescheduled to ${fmt(at)}`, { deliveryAt: at, isDelayed: false, delayedUntil: null });
      await this.notify.notify(tx, [o.customerId], `New delivery time for ${o.number}`, fmt(at), { orderId, link: `/orders/${orderId}` });
      return { orderId, status: o.status };
    });
  }

  /** Driver view: only their own deliveries, with address and contact - no prices (FR-38, BR-12, BR-35). */
  async mine(user: AuthUser) {
    const today = startOfDay(new Date());
    const rows = await this.db.select({ d: deliveries, o: { id: orders.id, number: orders.number, status: orders.status, deliveryAt: orders.deliveryAt,
      addressText: orders.addressText, contactName: orders.contactName, contactPhone: orders.contactPhone, notes: orders.notes, isDelayed: orders.isDelayed } })
      .from(deliveries).innerJoin(orders, eq(deliveries.orderId, orders.id))
      .where(and(eq(deliveries.driverId, user.id), sql`(${deliveries.status} = 'ASSIGNED' or ${deliveries.createdAt} >= ${today})`))
      .orderBy(asc(orders.deliveryAt));
    const ids = rows.map((r) => r.o.id);
    const lines = ids.length ? await this.db.select({ orderId: orderLines.orderId, name: orderLines.productName, qty: orderLines.qty, unit: orderLines.unit })
      .from(orderLines).where(inArray(orderLines.orderId, ids)) : [];
    return rows.map(({ d, o }) => {
      const closed = d.status !== 'ASSIGNED';
      return { ...d, order: { ...o, contactPhone: closed ? null : o.contactPhone, addressText: closed ? '(hidden after delivery)' : o.addressText },
        items: lines.filter((l) => l.orderId === o.id) };
    });
  }

  private async ownDelivery(user: AuthUser, id: number) {
    const [d] = await this.db.select().from(deliveries).where(eq(deliveries.id, id));
    if (!d || d.driverId !== user.id) throw new NotFoundException('Delivery not found'); // ASSIGNED scope
    if (d.status !== 'ASSIGNED') throw new ConflictException('This delivery is already closed');
    return d;
  }

  async complete(user: AuthUser, id: number, body: { recipientName: string; proofNote?: string }) {
    if (!body.recipientName?.trim()) throw new BadRequestException('Enter the name of the person who received the order');
    const d = await this.ownDelivery(user, id);
    const s = await this.settings.all();
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, d.orderId);
      const now = new Date();
      await tx.update(deliveries).set({ status: 'DELIVERED', recipientName: body.recipientName.trim(), proofNote: body.proofNote ?? '', completedAt: now }).where(eq(deliveries.id, id));
      await tx.update(users).set({ driverStatus: 'AVAILABLE' }).where(eq(users.id, user.id));
      await this.ops.transition(tx, o, 'DELIVERED', user.id, `Delivered to ${body.recipientName.trim()}`, { deliveredAt: now, isDelayed: false });
      if (s.invoiceOn === 'DELIVERY') await this.ops.issueInvoice(tx, o);
      await this.notify.notify(tx, [o.customerId], `Order ${o.number} delivered`, 'Enjoy your meal! Please rate your order.', { orderId: o.id, link: `/orders/${o.id}` });
      return { id, status: 'DELIVERED' };
    });
  }

  async fail(user: AuthUser, id: number, body: { reason: string }) {
    if (!body.reason?.trim()) throw new BadRequestException('A failure reason is required');
    const d = await this.ownDelivery(user, id);
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, d.orderId);
      await tx.update(deliveries).set({ status: 'FAILED', failureReason: body.reason.trim(), completedAt: new Date() }).where(eq(deliveries.id, id));
      await tx.update(users).set({ driverStatus: 'AVAILABLE' }).where(eq(users.id, user.id));
      await this.ops.transition(tx, o, 'DELIVERY_FAILED', user.id, `Delivery failed: ${body.reason.trim()}`);
      await this.notify.notifyRoles(tx, ['DELIVERY_MANAGER'], `Delivery failed: ${o.number}`, body.reason.trim(), { orderId: o.id, link: '/dispatch' });
      return { id, status: 'FAILED' };
    });
  }

  async setMyStatus(user: AuthUser, status: 'AVAILABLE' | 'OFF_DUTY') {
    const [me] = await this.db.select().from(users).where(eq(users.id, user.id));
    if (me.driverStatus === 'ON_DELIVERY') throw new ConflictException('Finish your current delivery first');
    await this.db.update(users).set({ driverStatus: status }).where(eq(users.id, user.id));
    return { status };
  }
}
