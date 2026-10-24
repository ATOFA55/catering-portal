import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { rolePermissions, roles, Scope, users } from '../db/schema';
import { AuthUser } from './auth.types';

/** Loads a user's role and permissions from the database (permissions are data, NFR-11). Cached briefly. */
@Injectable()
export class AccessService {
  private cache = new Map<number, { at: number; user: AuthUser | null }>();
  constructor(@Inject(DB) private db: Db) {}

  invalidate() { this.cache.clear(); }

  async load(userId: number): Promise<AuthUser | null> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < 15_000) return hit.user;
    const [row] = await this.db.select({ u: users, r: roles }).from(users).innerJoin(roles, eq(users.roleId, roles.id)).where(eq(users.id, userId));
    let user: AuthUser | null = null;
    if (row && row.u.isActive) {
      const grants = await this.db.select().from(rolePermissions).where(eq(rolePermissions.roleId, row.r.id));
      const perms: Record<string, Scope> = {};
      for (const g of grants) perms[g.permissionCode] = g.scope;
      user = {
        id: row.u.id, name: row.u.name, email: row.u.email, roleId: row.r.id, roleCode: row.r.code,
        roleName: row.r.name, homePath: row.r.homePath, isSuperAdmin: row.u.isSuperAdmin, perms,
      };
    }
    this.cache.set(userId, { at: Date.now(), user });
    return user;
  }
}
