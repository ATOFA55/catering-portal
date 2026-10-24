import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql, SQL } from 'drizzle-orm';
import { AuthUser, scopeOf } from '../common/auth.types';
import { round2 } from '../common/util';
import { DB, Db } from '../db/db.module';
import { invoices, orders, payments, users } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

/** Invoicing and payments (FR-96 to FR-98, BR-31). */
@Injectable()
export class FinanceService {
  constructor(@Inject(DB) private db: Db, private notify: NotificationsService) {}

  async list(user: AuthUser, status?: string) {
    const where: SQL[] = [];
    if (scopeOf(user, 'finance.view') === 'OWN') where.push(eq(orders.customerId, user.id));
    if (status) where.push(inArray(invoices.status, status.split(',') as ('UNPAID' | 'PAID')[]));
    const rows = await this.db.select({
      id: invoices.id, number: invoices.number, amount: invoices.amount, tax: invoices.tax, status: invoices.status, issuedAt: invoices.issuedAt, dueAt: invoices.dueAt,
      orderId: orders.id, orderNumber: orders.number, customer: users.name, company: users.company,
      paid: sql<string>`coalesce((select sum(p.amount) from payments p where p.invoice_id = ${invoices.id}),0)`,
    }).from(invoices).innerJoin(orders, eq(invoices.orderId, orders.id)).innerJoin(users, eq(orders.customerId, users.id))
      .where(where.length ? and(...where) : undefined).orderBy(desc(invoices.issuedAt)).limit(200);
    return rows.map((r) => ({ ...r, paid: Number(r.paid), outstanding: r.status === 'CANCELLED' ? 0 : round2(r.amount - Number(r.paid)) }));
  }

  async get(user: AuthUser, id: number) {
    const inv = await this.db.query.invoices.findFirst({ where: eq(invoices.id, id), with: { payments: true, order: { with: { lines: { with: { customizations: true } }, customer: { columns: { name: true, company: true, email: true } } } } } });
    if (!inv || (scopeOf(user, 'finance.view') === 'OWN' && inv.order.customerId !== user.id)) throw new NotFoundException('Invoice not found');
    return inv;
  }

  /** FR-98: ageing report and headline figures. */
  async summary() {
    const list = await this.list({ perms: { 'finance.view': 'ALL' } } as unknown as AuthUser);
    const live = list.filter((i) => i.status !== 'CANCELLED');
    const now = Date.now();
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const i of live) {
      if (i.outstanding <= 0) continue;
      const days = Math.max(0, (now - new Date(i.issuedAt).getTime()) / 86_400_000);
      const k = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
      buckets[k] = round2(buckets[k] + i.outstanding);
    }
    const monthly = await this.db.execute(sql`select to_char(date_trunc('month', paid_at), 'YYYY-MM') as month, sum(amount)::float as collected from payments group by 1 order by 1 desc limit 6`);
    return {
      invoiced: round2(live.reduce((a, i) => a + i.amount, 0)),
      collected: round2(live.reduce((a, i) => a + i.paid, 0)),
      outstanding: round2(live.reduce((a, i) => a + i.outstanding, 0)),
      overdue: round2(live.filter((i) => i.status === 'OVERDUE').reduce((a, i) => a + i.outstanding, 0)),
      overdueCount: live.filter((i) => i.status === 'OVERDUE').length,
      unpaidCount: live.filter((i) => i.outstanding > 0).length,
      ageing: buckets,
      monthly: (monthly.rows as { month: string; collected: number }[]).reverse(),
    };
  }

  async recordPayment(user: AuthUser, id: number, body: { amount: number; method: string; reference?: string }) {
    if (!(body.amount > 0)) throw new BadRequestException('Enter the amount received');
    return this.db.transaction(async (tx) => {
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, id)).for('update');
      if (!inv) throw new NotFoundException('Invoice not found');
      if (['CANCELLED', 'REFUNDED', 'PAID'].includes(inv.status)) throw new ConflictException(`This invoice is ${inv.status.toLowerCase()}`);
      const [{ paid }] = await tx.select({ paid: sql<string>`coalesce(sum(${payments.amount}),0)` }).from(payments).where(eq(payments.invoiceId, id));
      const outstanding = round2(inv.amount - Number(paid));
      if (body.amount > outstanding + 0.001) throw new BadRequestException(`The amount is more than the outstanding ${outstanding}`);
      await tx.insert(payments).values({ invoiceId: id, amount: round2(body.amount), method: body.method, reference: body.reference ?? '', recordedById: user.id });
      const left = round2(outstanding - body.amount);
      const status = left <= 0 ? 'PAID' : 'PARTIALLY_PAID';
      await tx.update(invoices).set({ status }).where(eq(invoices.id, id));
      const [o] = await tx.select().from(orders).where(eq(orders.id, inv.orderId));
      await this.notify.notify(tx, [o.customerId], `Payment received for ${inv.number}`, `Thank you. ${status === 'PAID' ? 'Invoice fully paid.' : `Outstanding: ${left}`}`, { orderId: o.id, link: '/invoices' });
      return { id, status, outstanding: left };
    });
  }

  /** Background job: unpaid invoices past their due date become Overdue. */
  async flagOverdue() {
    const r = await this.db.update(invoices).set({ status: 'OVERDUE' })
      .where(and(inArray(invoices.status, ['UNPAID', 'PARTIALLY_PAID']), lt(invoices.dueAt, new Date()))).returning({ id: invoices.id });
    return r.length;
  }
}
