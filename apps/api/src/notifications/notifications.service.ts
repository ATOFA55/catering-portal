import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DB, Db, DbOrTx } from '../db/db.module';
import { notifications, roles, users } from '../db/schema';

/** In-app notification centre (FR-84, FR-85). Email/SMS channels would plug in here. */
@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private db: Db) {}

  async notify(tx: DbOrTx, userIds: number[], title: string, body: string, opts: { orderId?: number; link?: string } = {}) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    await tx.insert(notifications).values(ids.map((userId) => ({ userId, title, body, orderId: opts.orderId ?? null, link: opts.link ?? null })));
  }

  async notifyRoles(tx: DbOrTx, roleCodes: string[], title: string, body: string, opts: { orderId?: number; link?: string } = {}) {
    const rows = await tx.select({ id: users.id }).from(users).innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(inArray(roles.code, roleCodes), eq(users.isActive, true)));
    await this.notify(tx, rows.map((r) => r.id), title, body, opts);
  }

  async list(userId: number) {
    const items = await this.db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(30);
    const [{ unread }] = await this.db.select({ unread: sql<number>`count(*)::int` }).from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return { unread, items };
  }

  async markRead(userId: number, id?: number) {
    const where = id ? and(eq(notifications.userId, userId), eq(notifications.id, id)) : eq(notifications.userId, userId);
    await this.db.update(notifications).set({ readAt: new Date() }).where(and(where, isNull(notifications.readAt)));
    return { ok: true };
  }
}
