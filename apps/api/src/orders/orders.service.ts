import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, SQL, sql } from 'drizzle-orm';
import { AuthUser, can, scopeOf } from '../common/auth.types';
import { addHours, round2, fmt } from '../common/util';
import { DB, Db } from '../db/db.module';
import { addresses, invoices, orders, orderStatusHistory, OrderStatus, payments, ratings, roles, users } from '../db/schema';
import { Tx } from '../db/db.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingService, QuoteInput } from '../pricing/pricing.service';
import { SettingsService } from '../settings/settings.service';
import { CreateOrderDto, ListOrdersQuery } from './orders.dto';
import { OrderOps } from './order-ops.service';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DB) private db: Db, private pricing: PricingService, private ops: OrderOps,
    private notify: NotificationsService, private settings: SettingsService,
  ) {}

  private toQuoteInput(dto: CreateOrderDto, excludeOrderId?: number): QuoteInput {
    return { type: dto.type, lines: dto.lines, zoneId: dto.zoneId, deliveryAt: dto.deliveryAt, guestCount: dto.guestCount, excludeOrderId };
  }

  quote(dto: CreateOrderDto) {
    return this.pricing.quote(this.db, this.toQuoteInput(dto));
  }

  /** UC-01 / UC-08: save a draft or submit (status Pending, unique number, Order Manager notified). */
  async create(user: AuthUser, dto: CreateOrderDto) {
    let customerId = user.id;
    if (dto.customerId && dto.customerId !== user.id) {
      if (scopeOf(user, 'orders.create') !== 'ALL') throw new ForbiddenException('You can only create orders for yourself');
      customerId = dto.customerId;
    }
    if (dto.addressId) {
      const [a] = await this.db.select().from(addresses).where(and(eq(addresses.id, dto.addressId), eq(addresses.userId, customerId)));
      if (!a) throw new BadRequestException('Address not found');
      dto.addressText = a.line; dto.zoneId = a.zoneId; dto.contactName ||= a.contactName; dto.contactPhone ||= a.contactPhone;
    }
    const missing = [!dto.addressText && 'delivery address', !dto.contactName && 'contact name', !dto.contactPhone && 'contact phone'].filter(Boolean);
    if (dto.submit && missing.length) throw new BadRequestException({ message: `Please fill in: ${missing.join(', ')}`, fields: missing }); // FR-08

    return this.db.transaction(async (tx) => {
      const q = await this.pricing.quote(tx, this.toQuoteInput(dto));
      if (dto.submit && q.errors.length) throw new BadRequestException({ message: q.errors[0], errors: q.errors, suggestedSlot: q.suggestedSlot });
      const now = new Date();
      const [o] = await tx.insert(orders).values({
        number: `TMP-${Date.now()}-${Math.random()}`, customerId, type: dto.type, mode: dto.mode, status: 'DRAFT',
        deliveryAt: new Date(dto.deliveryAt), addressText: dto.addressText ?? '', zoneId: dto.zoneId,
        contactName: dto.contactName ?? '', contactPhone: dto.contactPhone ?? '', notes: dto.notes ?? '', allergyNotes: dto.allergyNotes ?? '',
        guestCount: dto.guestCount ?? null, eventLocation: dto.eventLocation ?? null, setupAt: dto.setupAt ? new Date(dto.setupAt) : null,
        subtotal: q.subtotal, deliveryFee: q.deliveryFee, serviceFee: q.serviceFee, discount: q.discount, tax: q.tax, total: q.total,
      }).returning();
      const number = `CP-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}-${String(o.id).padStart(5, '0')}`;
      await tx.update(orders).set({ number }).where(eq(orders.id, o.id));
      o.number = number;
      await this.ops.writeLines(tx, o.id, q.lines);
      await tx.insert(orderStatusHistory).values({ orderId: o.id, fromStatus: null, toStatus: 'DRAFT', userId: user.id, comment: 'Order created' });
      if (dto.submit) await this.submitInTx(tx, o, user.id);
      return { id: o.id, number, status: o.status, total: q.total };
    });
  }

  private async submitInTx(tx: Tx, o: typeof orders.$inferSelect, userId: number) {
    await this.ops.transition(tx, o, 'PENDING', userId, 'Order submitted', { submittedAt: new Date() });
    await this.notify.notifyRoles(tx, ['ORDER_MANAGER'], `New order ${o.number}`, `A new ${o.type.toLowerCase()} order is waiting for review.`, { orderId: o.id, link: `/orders/${o.id}` });
    await this.notify.notify(tx, [o.customerId], `Order ${o.number} received`, 'We received your order and will confirm it shortly.', { orderId: o.id, link: `/orders/${o.id}` });
  }

  async submitDraft(user: AuthUser, id: number) {
    const o = await this.getRow(user, id);
    if (o.status !== 'DRAFT') throw new ConflictException('Only drafts can be submitted');
    const lines = await this.ops.lineInputs(this.db, id);
    const q = await this.pricing.quote(this.db, { type: o.type, lines, zoneId: o.zoneId, deliveryAt: o.deliveryAt, guestCount: o.guestCount, excludeOrderId: o.id });
    if (q.errors.length) throw new BadRequestException({ message: q.errors[0], errors: q.errors, suggestedSlot: q.suggestedSlot });
    if (!o.addressText || !o.contactName || !o.contactPhone) throw new BadRequestException('Please complete the delivery details first');
    return this.db.transaction(async (tx) => {
      const row = await this.ops.lockOrder(tx, id);
      await this.submitInTx(tx, row, user.id);
      return { id, status: row.status };
    });
  }

  private scopeWhere(user: AuthUser): SQL | undefined {
    const scope = scopeOf(user, 'orders.view');
    if (scope === 'ALL') return undefined;
    if (scope === 'OWN') return eq(orders.customerId, user.id);
    throw new ForbiddenException('Access denied');
  }

  async list(user: AuthUser, q: ListOrdersQuery) {
    const where: (SQL | undefined)[] = [this.scopeWhere(user)];
    if (q.status) where.push(inArray(orders.status, q.status.split(',') as OrderStatus[]));
    if (q.delayed === 'true') where.push(eq(orders.isDelayed, true));
    if (q.type) where.push(eq(orders.type, q.type as 'DAILY' | 'EVENT'));
    if (q.from) where.push(gte(orders.deliveryAt, new Date(q.from)));
    if (q.to) where.push(lte(orders.deliveryAt, new Date(q.to)));
    if (q.q) {
      const like = `%${q.q}%`;
      where.push(or(ilike(orders.number, like), ilike(users.name, like), ilike(users.company, like), ilike(orders.contactPhone, like)));
    }
    const page = Math.max(1, Number(q.page ?? 1));
    const size = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)));
    const cond = and(...where.filter(Boolean));
    const sortCol = q.sort === 'created' ? orders.createdAt : orders.deliveryAt;
    const rows = await this.db.select({
      id: orders.id, number: orders.number, status: orders.status, type: orders.type, mode: orders.mode, isDelayed: orders.isDelayed,
      delayedUntil: orders.delayedUntil, deliveryAt: orders.deliveryAt, total: orders.total, createdAt: orders.createdAt, updatedAt: orders.updatedAt,
      guestCount: orders.guestCount, customerName: users.name, company: users.company, allergyNotes: orders.allergyNotes,
    }).from(orders).innerJoin(users, eq(orders.customerId, users.id)).where(cond)
      .orderBy(q.dir === 'asc' ? asc(sortCol) : desc(sortCol)).limit(size).offset((page - 1) * size);
    const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` }).from(orders).innerJoin(users, eq(orders.customerId, users.id)).where(cond);
    return { items: rows, total, page, pageSize: size };
  }

  private async getRow(user: AuthUser, id: number) {
    const [o] = await this.db.select().from(orders).where(eq(orders.id, id));
    // Out-of-scope orders look exactly like missing ones (BR-06, BR-10).
    if (!o || (scopeOf(user, 'orders.view') === 'OWN' && o.customerId !== user.id)) throw new NotFoundException('Order not found');
    if (!scopeOf(user, 'orders.view')) throw new ForbiddenException('Access denied');
    return o;
  }

  async get(user: AuthUser, id: number) {
    await this.getRow(user, id);
    const o = await this.db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: {
        lines: { with: { customizations: true } }, zone: true,
        history: { with: { user: { columns: { name: true } } }, orderBy: (h, { asc: a }) => [a(h.createdAt)] },
        production: { with: { items: true } }, invoice: { with: { payments: true } }, rating: true,
        deliveries: { with: { driver: { columns: { id: true, name: true, phone: true } } }, orderBy: (d, { desc: ds }) => [ds(d.createdAt)] },
        customer: { columns: { id: true, name: true, email: true, phone: true, company: true } },
      },
    });
    const s = await this.settings.all();
    const cutoff = addHours(o!.deliveryAt, -s.cancellationCutoffHours);
    const isOwner = o!.customerId === user.id;
    return {
      ...o!,
      cancellationCutoff: cutoff,
      canCancel: (['DRAFT', 'PENDING', 'AWAITING_CUSTOMER_APPROVAL'].includes(o!.status) || (o!.status === 'CONFIRMED' && (new Date() < cutoff || can(user, 'orders.manage'))))
        && (isOwner || can(user, 'orders.manage')),
      canRate: isOwner && o!.status === 'DELIVERED' && !o!.rating,
      history: o!.history.map((h) => ({ ...h, userName: isOwner && !can(user, 'orders.manage') ? undefined : h.user?.name })),
    };
  }

  async confirm(user: AuthUser, id: number) {
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, id);
      if (o.status !== 'PENDING') throw new ConflictException('Only pending orders can be confirmed');
      await this.ops.confirm(tx, o, user.id);
      return { id, status: o.status };
    });
  }

  /** FR-11 / BR-02: the Order Manager proposes a new time or discount; it applies only after the customer approves. */
  async proposeChange(user: AuthUser, id: number, body: { deliveryAt?: string; discountPercent?: number; reason: string }) {
    if (!body.reason?.trim()) throw new BadRequestException('Give a reason for the change');
    if (!body.deliveryAt && !body.discountPercent) throw new BadRequestException('Change the delivery time or give a discount');
    const s = await this.settings.all();
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, id);
      if (o.status !== 'PENDING') throw new ConflictException('Changes can be proposed only while the order is pending');
      let discount: number | undefined;
      if (body.discountPercent) {
        const limit = s.discountApprovalLimit * 100;
        if (body.discountPercent > limit && user.roleCode !== 'CEO_ADMIN') throw new ForbiddenException(`Discounts above ${limit}% need CEO approval`);
        discount = round2(o.subtotal * body.discountPercent / 100);
      }
      if (body.deliveryAt) {
        const lines = await this.ops.lineInputs(tx, id);
        const q = await this.pricing.quote(tx, { type: o.type, lines, zoneId: o.zoneId, deliveryAt: body.deliveryAt, guestCount: o.guestCount, excludeOrderId: id, skipLeadTime: true });
        const slotErr = q.errors.find((e) => e.includes('slot'));
        if (slotErr) throw new BadRequestException({ message: slotErr, suggestedSlot: q.suggestedSlot });
      }
      const change = { deliveryAt: body.deliveryAt, discount, reason: body.reason.trim(), requestedBy: user.id };
      await this.ops.transition(tx, o, 'AWAITING_CUSTOMER_APPROVAL', user.id, `Change proposed: ${body.reason.trim()}`, { pendingChange: change });
      await this.notify.notify(tx, [o.customerId], `Please approve a change to ${o.number}`, body.reason.trim(), { orderId: id, link: `/orders/${id}` });
      return { id, status: o.status, pendingChange: change };
    });
  }

  /** Customer approves (order is confirmed) or rejects (order is cancelled) - Section 13.1. */
  async respondChange(user: AuthUser, id: number, approve: boolean) {
    const row = await this.getRow(user, id);
    if (row.customerId !== user.id) throw new ForbiddenException('Only the customer can approve this change');
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, id);
      if (o.status !== 'AWAITING_CUSTOMER_APPROVAL' || !o.pendingChange) throw new ConflictException('There is no change waiting for your approval');
      const ch = o.pendingChange;
      const managerId = ch.requestedBy;
      if (!approve) {
        await this.ops.transition(tx, o, 'CANCELLED', user.id, 'Customer rejected the proposed change', { pendingChange: null, cancelReason: 'Customer rejected the proposed change' });
        await this.notify.notify(tx, [managerId], `${o.number}: change rejected`, 'The customer rejected the change and the order was cancelled.', { orderId: id, link: `/orders/${id}` });
        return { id, status: o.status };
      }
      const lines = await this.ops.lineInputs(tx, id);
      const deliveryAt = ch.deliveryAt ? new Date(ch.deliveryAt) : o.deliveryAt;
      const q = await this.pricing.quote(tx, { type: o.type, lines, zoneId: o.zoneId, deliveryAt, guestCount: o.guestCount, excludeOrderId: id, manualDiscount: ch.discount, skipLeadTime: true });
      await tx.update(orders).set({ deliveryAt, subtotal: q.subtotal, deliveryFee: q.deliveryFee, serviceFee: q.serviceFee, discount: q.discount, tax: q.tax, total: q.total, pendingChange: null }).where(eq(orders.id, id));
      Object.assign(o, { deliveryAt, total: q.total, pendingChange: null });
      try {
        await tx.transaction(async (sp) => { await this.ops.confirm(sp, o, user.id, 'Customer approved the change; order confirmed'); });
      } catch (e) {
        if (!(e instanceof ConflictException)) throw e;
        o.status = 'AWAITING_CUSTOMER_APPROVAL';
        await this.ops.transition(tx, o, 'PENDING', user.id, 'Customer approved the change; confirmation is waiting for stock');
        await this.notify.notify(tx, [managerId], `${o.number}: approved, stock needed`, 'The customer approved, but stock is short for the new date.', { orderId: id, link: `/orders/${id}` });
      }
      return { id, status: o.status };
    });
  }

  /** FR-81, FR-82, BR-28, BR-29. */
  async cancel(user: AuthUser, id: number, reason: string) {
    const row = await this.getRow(user, id);
    const s = await this.settings.all();
    const isManager = can(user, 'orders.manage');
    if (!isManager && row.customerId !== user.id) throw new NotFoundException('Order not found');
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, id);
      if (o.status === 'DELIVERED') throw new ConflictException('A delivered order cannot be cancelled. Please raise a complaint instead.');
      if (o.status === 'CONFIRMED' && !isManager && new Date() > addHours(o.deliveryAt, -s.cancellationCutoffHours)) {
        throw new ConflictException(`Free cancellation closes ${s.cancellationCutoffHours} hours before delivery. Please contact us to cancel.`);
      }
      await this.ops.transition(tx, o, 'CANCELLED', user.id, reason ? `Cancelled: ${reason}` : 'Cancelled', { cancelReason: reason || 'Cancelled', pendingChange: null });
      await this.ops.releaseReservations(tx, o, user.id);
      const [inv] = await tx.select().from(invoices).where(eq(invoices.orderId, id));
      if (inv) {
        const [{ paid }] = await tx.select({ paid: sql<string>`coalesce(sum(${payments.amount}),0)` }).from(payments).where(eq(payments.invoiceId, inv.id));
        if (Number(paid) > 0) {
          await this.notify.notifyRoles(tx, ['ACCOUNTANT'], `Refund needed for ${o.number}`, `Customer paid ${paid} ${s.currency} before cancelling.`, { orderId: id, link: '/finance' });
        } else await tx.update(invoices).set({ status: 'CANCELLED' }).where(eq(invoices.id, inv.id));
      }
      if (o.customerId !== user.id) await this.notify.notify(tx, [o.customerId], `Order ${o.number} cancelled`, reason || 'Your order was cancelled.', { orderId: id, link: `/orders/${id}` });
      else await this.notify.notifyRoles(tx, ['ORDER_MANAGER'], `Order ${o.number} cancelled by customer`, reason || '', { orderId: id, link: `/orders/${id}` });
      return { id, status: o.status };
    });
  }

  /** FR-17: Delayed is a flag on top of the current status. */
  async setDelay(user: AuthUser, id: number, body: { delayed: boolean; delayedUntil?: string; reason?: string }) {
    return this.db.transaction(async (tx) => {
      const o = await this.ops.lockOrder(tx, id);
      if (['DELIVERED', 'CANCELLED', 'DRAFT'].includes(o.status)) throw new ConflictException('Only active orders can be flagged as delayed');
      const until = body.delayed ? (body.delayedUntil ? new Date(body.delayedUntil) : addHours(new Date(), 1)) : null;
      await tx.update(orders).set({ isDelayed: body.delayed, delayedUntil: until, updatedAt: new Date() }).where(eq(orders.id, id));
      await tx.insert(orderStatusHistory).values({ orderId: id, fromStatus: o.status, toStatus: o.status, userId: user.id,
        comment: body.delayed ? `Flagged as delayed. New expected time ${fmt(until!)}${body.reason ? ` - ${body.reason}` : ''}` : 'Delay flag cleared' });
      if (body.delayed) await this.notify.notify(tx, [o.customerId], `Order ${o.number} is delayed`, `New expected time: ${fmt(until!)}`, { orderId: id, link: `/orders/${id}` });
      return { id, isDelayed: body.delayed, delayedUntil: until };
    });
  }

  /** FR-91: rating; 2 or less alerts the Order Manager. */
  async rate(user: AuthUser, id: number, body: { food: number; punctuality: number; service: number; comment?: string }) {
    const o = await this.getRow(user, id);
    if (o.customerId !== user.id) throw new ForbiddenException('Only the customer can rate this order');
    if (o.status !== 'DELIVERED') throw new ConflictException('You can rate an order after it is delivered');
    const vals = [body.food, body.punctuality, body.service];
    if (vals.some((v) => !(v >= 1 && v <= 5))) throw new BadRequestException('Ratings are from 1 to 5');
    return this.db.transaction(async (tx) => {
      const exists = await tx.select().from(ratings).where(eq(ratings.orderId, id));
      if (exists.length) throw new ConflictException('This order is already rated');
      await tx.insert(ratings).values({ orderId: id, ...body, comment: body.comment ?? '' });
      const avg = vals.reduce((a, b) => a + b, 0) / 3;
      if (Math.min(...vals) <= 2) {
        await this.notify.notifyRoles(tx, ['ORDER_MANAGER'], `Low rating on ${o.number}`, `Average ${avg.toFixed(1)}/5. ${body.comment ?? ''}`, { orderId: id, link: `/orders/${id}` });
      }
      return { ok: true };
    });
  }

  /** FR-87: one-step reorder - returns a builder payload; prices are recalculated with today's catalog. */
  async reorderTemplate(user: AuthUser, id: number) {
    const o = await this.getRow(user, id);
    const lines = await this.ops.lineInputs(this.db, id);
    return { type: o.type, mode: o.mode, zoneId: o.zoneId, addressText: o.addressText, contactName: o.contactName, contactPhone: o.contactPhone,
      notes: o.notes, allergyNotes: o.allergyNotes, guestCount: o.guestCount, eventLocation: o.eventLocation, lines };
  }

  async customerAddresses(user: AuthUser) {
    return this.db.select().from(addresses).where(eq(addresses.userId, user.id));
  }

  async customers() {
    return this.db.select({ id: users.id, name: users.name, company: users.company }).from(users).innerJoin(roles, eq(users.roleId, roles.id)).where(eq(roles.code, 'CUSTOMER'));
  }
}
