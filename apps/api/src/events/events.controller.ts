import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { RequirePermission } from '../common/decorators';
import { DB, Db } from '../db/db.module';
import { orderLines, orders, users } from '../db/schema';

/** Event Coordinator home (FR-76, FR-77): upcoming events with guests, services and progress. No prices or payments. */
@ApiTags('Events') @ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(@Inject(DB) private db: Db) {}

  @Get() @RequirePermission('events.view')
  async list() {
    const rows = await this.db.select({
      id: orders.id, number: orders.number, status: orders.status, deliveryAt: orders.deliveryAt, setupAt: orders.setupAt, guestCount: orders.guestCount,
      eventLocation: orders.eventLocation, addressText: orders.addressText, notes: orders.notes, allergyNotes: orders.allergyNotes, isDelayed: orders.isDelayed,
      customer: users.name, company: users.company, contactName: orders.contactName, contactPhone: orders.contactPhone,
    }).from(orders).innerJoin(users, eq(orders.customerId, users.id))
      .where(and(eq(orders.type, 'EVENT'), inArray(orders.status, ['PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'CONFIRMED', 'PREPARING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'])))
      .orderBy(asc(orders.deliveryAt));
    const ids = rows.map((r) => r.id);
    const lines = ids.length ? await this.db.select({ orderId: orderLines.orderId, name: orderLines.productName, type: orderLines.productType, qty: orderLines.qty, unit: orderLines.unit })
      .from(orderLines).where(inArray(orderLines.orderId, ids)) : [];
    return rows.map((r) => ({
      ...r,
      menu: lines.filter((l) => l.orderId === r.id && l.type !== 'SERVICE'),
      services: lines.filter((l) => l.orderId === r.id && l.type === 'SERVICE'),
    }));
  }
}
