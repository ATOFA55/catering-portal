import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { AuthUser } from '../common/auth.types';
import { addHours, round2, startOfDay } from '../common/util';
import { DB, Db } from '../db/db.module';
import { orders, users } from '../db/schema';
import { FinanceService } from '../finance/finance.service';
import { InventoryService } from '../inventory/inventory.service';

type Period = 'today' | 'week' | 'month' | 'year';

const num = (v: unknown) => Number(v ?? 0);

@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private db: Db, private inventory: InventoryService, private finance: FinanceService) {}

  private range(period: Period) {
    const end = addHours(startOfDay(new Date()), 24);
    const days = { today: 1, week: 7, month: 30, year: 365 }[period] ?? 30;
    const start = addHours(end, -24 * days);
    return { start, end, prevStart: addHours(start, -24 * days), days };
  }

  private async one<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T> {
    const r = await this.db.execute(q);
    return r.rows[0] as T;
  }
  private async rows<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T[]> {
    return (await this.db.execute(q)).rows as T[];
  }

  /** UC-04 / FR-26 to FR-28 and the KPI proposal in Section 14. */
  async executive(period: Period = 'month') {
    const { start, end, prevStart, days } = this.range(period);
    const live = sql`status not in ('DRAFT','CANCELLED')`;
    const cur = await this.one(sql`select count(*)::int n, coalesce(sum(total),0)::float revenue from orders where ${live} and delivery_at >= ${start} and delivery_at < ${end}`);
    const prev = await this.one(sql`select count(*)::int n, coalesce(sum(total),0)::float revenue from orders where ${live} and delivery_at >= ${prevStart} and delivery_at < ${start}`);
    const del = await this.one(sql`select count(*)::int delivered,
        count(*) filter (where delivered_at <= delivery_at + interval '15 minutes')::int on_time
        from orders where status = 'DELIVERED' and delivery_at >= ${start} and delivery_at < ${end}`);
    const attempts = await this.one(sql`select count(*)::int n, count(*) filter (where d.status = 'FAILED')::int failed
        from deliveries d join orders o on o.id = d.order_id where d.status in ('DELIVERED','FAILED') and o.delivery_at >= ${start} and o.delivery_at < ${end}`);
    const conf = await this.one(sql`select coalesce(avg(extract(epoch from (confirmed_at - submitted_at)) / 60),0)::float minutes
        from orders where confirmed_at is not null and submitted_at is not null and delivery_at >= ${start} and delivery_at < ${end}`);
    const rating = await this.one(sql`select coalesce(avg((r.food + r.punctuality + r.service) / 3.0),0)::float avg, count(*)::int n
        from ratings r join orders o on o.id = r.order_id where o.delivery_at >= ${start} and o.delivery_at < ${end}`);
    const lowRated = await this.one(sql`select count(*)::int n from ratings r join orders o on o.id = r.order_id
        where least(r.food, r.punctuality, r.service) <= 2 and o.delivery_at >= ${start} and o.delivery_at < ${end}`);
    const foodCost = await this.one(sql`select coalesce(sum(m.qty * i.cost_per_unit),0)::float cost,
        coalesce(sum(m.qty) filter (where m.type = 'WASTE'),0)::float waste, coalesce(sum(m.qty) filter (where m.type = 'ISSUE'),0)::float issued
        from stock_movements m join ingredients i on i.id = m.ingredient_id where m.type in ('ISSUE','WASTE') and m.created_at >= ${start} and m.created_at < ${end}`);
    const repeat = await this.one(sql`select count(*)::int active, count(*) filter (where n >= 2)::int repeaters from
        (select customer_id, count(*) n from orders where ${live} and delivery_at >= ${start} and delivery_at < ${end} group by customer_id) t`);
    const delayed = await this.one(sql`select count(*)::int n from orders where is_delayed and status not in ('DELIVERED','CANCELLED','DRAFT')`);
    const cancelled = await this.one(sql`select count(*)::int n from orders where status = 'CANCELLED' and delivery_at >= ${start} and delivery_at < ${end}`);

    const byStatus = await this.rows<{ status: string; n: number }>(sql`select status, count(*)::int n from orders where status <> 'DRAFT' and delivery_at >= ${start} and delivery_at < ${end} group by status`);
    const bucket = period === 'year' ? sql`'month'` : sql`'day'`;
    const sales = await this.rows<{ d: string; revenue: number; n: number }>(sql`select to_char(date_trunc(${bucket}, delivery_at), ${period === 'year' ? 'YYYY-MM' : 'YYYY-MM-DD'}) d,
        coalesce(sum(total),0)::float revenue, count(*)::int n from orders where ${live} and delivery_at >= ${start} and delivery_at < ${end} group by 1 order by 1`);
    const weekdays = await this.rows<{ dow: number; n: number }>(sql`select extract(dow from delivery_at)::int dow, count(*)::int n from orders where ${live} and delivery_at >= ${start} and delivery_at < ${end} group by 1 order by 1`);
    const top = await this.rows<{ name: string; qty: number; revenue: number }>(sql`select l.product_name name, sum(l.qty)::int qty, sum(l.line_total)::float revenue
        from order_lines l join orders o on o.id = l.order_id where o.status not in ('DRAFT','CANCELLED') and o.delivery_at >= ${start} and o.delivery_at < ${end}
        group by 1 order by revenue desc limit 6`);

    const levels = await this.inventory.levels();
    const fin = await this.finance.summary();

    const n = num(cur.n), revenue = round2(num(cur.revenue));
    const delivered = num(del.delivered), onTime = delivered ? round2((num(del.on_time) / delivered) * 100) : null;
    const failedRate = num(attempts.n) ? round2((num(attempts.failed) / num(attempts.n)) * 100) : null;
    const foodCostPct = revenue ? round2((num(foodCost.cost) / revenue) * 100) : null;
    const wastePct = num(foodCost.issued) ? round2((num(foodCost.waste) / num(foodCost.issued)) * 100) : null;
    const accuracy = delivered ? round2(((delivered - num(lowRated.n)) / delivered) * 100) : null;

    return {
      period, start, end,
      tiles: {
        totalOrders: n, totalOrdersPrev: num(prev.n), revenue, revenuePrev: round2(num(prev.revenue)),
        onTimeRate: onTime, lowStock: levels.filter((l) => l.low).length, unpaidAmount: fin.outstanding, unpaidCount: fin.unpaidCount,
        delayed: num(delayed.n), avgRating: round2(num(rating.avg)), cancelled: num(cancelled.n),
      },
      kpis: [
        { key: 'onTime', name: 'On-time delivery rate', value: onTime, unit: '%', target: '≥ 95%', ok: onTime === null ? null : onTime >= 95, owner: 'Delivery Manager' },
        { key: 'failed', name: 'Failed delivery rate', value: failedRate, unit: '%', target: '≤ 2%', ok: failedRate === null ? null : failedRate <= 2, owner: 'Delivery Manager' },
        { key: 'confirm', name: 'Order confirmation time', value: round2(num(conf.minutes)), unit: 'min', target: '≤ 30 min', ok: num(conf.minutes) <= 30, owner: 'Order Manager' },
        { key: 'accuracy', name: 'Order accuracy (no complaint)', value: accuracy, unit: '%', target: '≥ 98%', ok: accuracy === null ? null : accuracy >= 98, owner: 'Order Manager, Kitchen' },
        { key: 'csat', name: 'Customer satisfaction', value: round2(num(rating.avg)), unit: '/ 5', target: '≥ 4.5', ok: num(rating.n) ? num(rating.avg) >= 4.5 : null, owner: 'CEO' },
        { key: 'aov', name: 'Average order value', value: n ? round2(revenue / n) : 0, unit: 'EGP', target: 'Growth', ok: null, owner: 'CEO, Accountant' },
        { key: 'foodCost', name: 'Food cost percentage', value: foodCostPct, unit: '%', target: 'Company policy', ok: null, owner: 'CEO, Inventory' },
        { key: 'waste', name: 'Waste rate', value: wastePct, unit: '%', target: 'Falling', ok: null, owner: 'Kitchen Manager' },
        { key: 'receivables', name: 'Outstanding receivables', value: fin.outstanding, unit: 'EGP', target: 'None > 60 days', ok: fin.ageing['61-90'] + fin.ageing['90+'] === 0, owner: 'Accountant' },
        { key: 'repeat', name: 'Repeat customer rate', value: num(repeat.active) ? round2((num(repeat.repeaters) / num(repeat.active)) * 100) : null, unit: '%', target: 'Rising', ok: null, owner: 'CEO' },
      ],
      charts: {
        byStatus, sales,
        weekdays: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dow: d, n: weekdays.find((w) => w.dow === d)?.n ?? 0 })),
        top,
      },
      days,
    };
  }

  /** Home-screen KPI tiles per role (UI-03). */
  async mine(user: AuthUser) {
    const today = startOfDay(new Date()), tomorrow = addHours(today, 24);
    switch (user.roleCode) {
      case 'CUSTOMER': {
        const r = await this.one(sql`select
          count(*) filter (where status in ('PENDING','AWAITING_CUSTOMER_APPROVAL','CONFIRMED','PREPARING','READY_FOR_DISPATCH','OUT_FOR_DELIVERY','DELIVERY_FAILED'))::int active,
          count(*) filter (where status = 'DELIVERED')::int delivered,
          count(*) filter (where status = 'AWAITING_CUSTOMER_APPROVAL')::int awaiting,
          count(*) filter (where status = 'DRAFT')::int drafts
          from orders where customer_id = ${user.id}`);
        const unpaid = await this.one(sql`select coalesce(sum(i.amount - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id),0)),0)::float amount
          from invoices i join orders o on o.id = i.order_id where o.customer_id = ${user.id} and i.status in ('UNPAID','PARTIALLY_PAID','OVERDUE')`);
        const [latest] = await this.db.select({ id: orders.id }).from(orders)
          .where(and(eq(orders.customerId, user.id), sql`${orders.status} not in ('DRAFT','CANCELLED')`)).orderBy(sql`${orders.updatedAt} desc`).limit(1);
        return { tiles: { ...r, unpaid: round2(num(unpaid.amount)) }, latestOrderId: latest?.id ?? null };
      }
      case 'ORDER_MANAGER': {
        const r = await this.one(sql`select count(*) filter (where status = 'PENDING')::int pending,
          count(*) filter (where status = 'AWAITING_CUSTOMER_APPROVAL')::int awaiting,
          count(*) filter (where is_delayed and status not in ('DELIVERED','CANCELLED'))::int delayed,
          count(*) filter (where delivery_at >= ${today} and delivery_at < ${tomorrow} and status not in ('DRAFT','CANCELLED'))::int today,
          count(*) filter (where created_at >= ${today} and status <> 'DRAFT')::int new_today
          from orders`);
        const byStatus = await this.rows(sql`select status, count(*)::int n from orders where status not in ('DRAFT') and delivery_at >= ${addHours(today, -24 * 7)} group by status`);
        return { tiles: r, byStatus };
      }
      case 'KITCHEN': {
        const r = await this.one(sql`select count(*) filter (where p.status = 'PLANNED')::int planned, count(*) filter (where p.status = 'IN_PROGRESS')::int in_progress,
          count(*) filter (where p.status = 'DONE' and p.completed_at >= ${today})::int done_today,
          count(*) filter (where p.status in ('PLANNED','IN_PROGRESS') and o.allergy_notes <> '')::int allergy
          from production_orders p join orders o on o.id = p.order_id`);
        return { tiles: r };
      }
      case 'DELIVERY_MANAGER': {
        const r = await this.one(sql`select count(*) filter (where status = 'READY_FOR_DISPATCH')::int ready, count(*) filter (where status = 'OUT_FOR_DELIVERY')::int out,
          count(*) filter (where status = 'DELIVERY_FAILED')::int failed, count(*) filter (where status = 'DELIVERED' and delivered_at >= ${today})::int delivered_today from orders`);
        const d = await this.one(sql`select count(*) filter (where u.driver_status = 'AVAILABLE')::int available, count(*)::int total from users u join roles r on r.id = u.role_id where r.code = 'DRIVER' and u.is_active`);
        return { tiles: { ...r, availableDrivers: d.available, drivers: d.total } };
      }
      case 'DRIVER': {
        const r = await this.one(sql`select count(*) filter (where status = 'ASSIGNED')::int assigned, count(*) filter (where status = 'DELIVERED' and completed_at >= ${today})::int delivered_today,
          count(*) filter (where status = 'FAILED' and completed_at >= ${today})::int failed_today from deliveries where driver_id = ${user.id}`);
        const [me] = await this.db.select({ s: users.driverStatus }).from(users).where(eq(users.id, user.id));
        return { tiles: { ...r, status: me.s } };
      }
      case 'INVENTORY_MANAGER': {
        const levels = await this.inventory.levels();
        const res = await this.one(sql`select count(distinct order_id)::int orders from stock_reservations where status = 'ACTIVE'`);
        return { tiles: { low: levels.filter((l) => l.low).length, expiring: levels.filter((l) => l.expiringSoon).length,
          reservedOrders: res.orders, stockValue: round2(levels.reduce((a, l) => a + l.value, 0)), expired: levels.filter((l) => l.expired > 0).length } };
      }
      case 'ACCOUNTANT': return { tiles: await this.finance.summary() };
      case 'CATALOG_MANAGER': {
        const r = await this.rows(sql`select type, count(*) filter (where is_active)::int active, count(*) filter (where not is_active)::int inactive from products group by type`);
        return { tiles: r };
      }
      case 'EVENT_COORDINATOR': {
        const r = await this.one(sql`select count(*)::int upcoming, coalesce(sum(guest_count),0)::int guests,
          count(*) filter (where delivery_at < ${addHours(today, 24 * 7)})::int this_week, count(*) filter (where status = 'PENDING')::int pending
          from orders where type = 'EVENT' and status not in ('DRAFT','CANCELLED','DELIVERED') and delivery_at >= ${today}`);
        return { tiles: r };
      }
      default: return this.executive('month');
    }
  }
}
