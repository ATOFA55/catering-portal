import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { addHours, fmt } from '../common/util';
import { DB, Db } from '../db/db.module';
import { orders, orderStatusHistory } from '../db/schema';
import { FinanceService } from '../finance/finance.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Background jobs (Section 15.1): flag late orders as Delayed (FR-17) and invoices as Overdue (FR-98). */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Jobs');
  private timer?: NodeJS.Timeout;
  constructor(@Inject(DB) private db: Db, private notify: NotificationsService, private finance: FinanceService) {}

  onModuleInit() {
    if (process.env.DISABLE_JOBS === '1') return;
    this.timer = setInterval(() => this.tick().catch((e) => this.log.error(e)), 60_000);
    setTimeout(() => this.tick().catch((e) => this.log.error(e)), 5_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    const now = new Date();
    const late = await this.db.select().from(orders).where(and(
      inArray(orders.status, ['CONFIRMED', 'PREPARING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED']), eq(orders.isDelayed, false), lt(orders.deliveryAt, now)));
    for (const o of late) {
      const until = addHours(now, 1);
      await this.db.transaction(async (tx) => {
        await tx.update(orders).set({ isDelayed: true, delayedUntil: until }).where(eq(orders.id, o.id));
        await tx.insert(orderStatusHistory).values({ orderId: o.id, fromStatus: o.status, toStatus: o.status, userId: null, comment: `Automatically flagged as delayed. New expected time ${fmt(until)}` });
        await this.notify.notify(tx, [o.customerId], `Order ${o.number} is delayed`, `New expected time: ${fmt(until)}`, { orderId: o.id, link: `/orders/${o.id}` });
        await this.notify.notifyRoles(tx, ['ORDER_MANAGER'], `Order ${o.number} is late`, 'Flagged as delayed automatically.', { orderId: o.id, link: `/orders/${o.id}` });
      });
    }
    const overdue = await this.finance.flagOverdue();
    if (late.length || overdue) this.log.log(`Flagged ${late.length} delayed orders, ${overdue} overdue invoices`);
  }
}
