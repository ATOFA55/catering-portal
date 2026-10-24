import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { AccessService } from '../common/access.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.types';
import { DB, Db } from '../db/db.module';
import { auditLogs, permissions, rolePermissions, roles, Scope, users } from '../db/schema';
import { SettingKey, SETTING_DEFAULTS, SettingsService } from '../settings/settings.service';

/** UC-06 Manage Users and Roles (FR-42, FR-43, BR-14) and system settings (FR-100). */
@Injectable()
export class AdminService {
  constructor(@Inject(DB) private db: Db, private access: AccessService, private audit: AuditService, private settings: SettingsService) {}

  private superOnly(u: AuthUser) {
    if (!u.isSuperAdmin) throw new ForbiddenException('Only the Super Admin can change users, roles and permissions (BR-14)');
  }

  async users(q?: string) {
    return this.db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, company: users.company, isActive: users.isActive,
      isSuperAdmin: users.isSuperAdmin, roleId: users.roleId, roleCode: roles.code, roleName: roles.name, createdAt: users.createdAt, lockedUntil: users.lockedUntil })
      .from(users).innerJoin(roles, eq(users.roleId, roles.id))
      .where(q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined).orderBy(roles.id, users.name);
  }

  async createUser(actor: AuthUser, body: { name: string; email: string; password: string; roleId: number; phone?: string; company?: string }) {
    this.superOnly(actor);
    const email = body.email.trim().toLowerCase();
    if ((await this.db.select().from(users).where(eq(users.email, email))).length) throw new BadRequestException('This email is already used');
    const [role] = await this.db.select().from(roles).where(eq(roles.id, body.roleId));
    if (!role) throw new BadRequestException('Unknown role');
    const [u] = await this.db.insert(users).values({ name: body.name, email, passwordHash: await bcrypt.hash(body.password, 10), roleId: role.id,
      phone: body.phone ?? null, company: body.company ?? null, driverStatus: role.code === 'DRIVER' ? 'AVAILABLE' : null }).returning({ id: users.id });
    await this.audit.log(actor.id, 'USER_CREATE', email, 'SUCCESS', { role: role.code });
    return u;
  }

  async updateUser(actor: AuthUser, id: number, body: { roleId?: number; isActive?: boolean }) {
    this.superOnly(actor);
    if (id === actor.id && body.isActive === false) throw new BadRequestException('You cannot disable your own account');
    const [before] = await this.db.select().from(users).where(eq(users.id, id));
    if (!before) throw new NotFoundException('User not found');
    const set: Partial<typeof users.$inferInsert> = {};
    if (body.roleId !== undefined) set.roleId = body.roleId;
    if (body.isActive !== undefined) set.isActive = body.isActive;
    await this.db.update(users).set(set).where(eq(users.id, id));
    this.access.invalidate();
    await this.audit.log(actor.id, body.roleId !== undefined ? 'ROLE_CHANGE' : 'USER_STATUS', before.email, 'SUCCESS', { from: { roleId: before.roleId, isActive: before.isActive }, to: body });
    return { id };
  }

  async roles() {
    const rs = await this.db.query.roles.findMany({ with: { permissions: true }, orderBy: (r, { asc }) => [asc(r.id)] });
    const perms = await this.db.select().from(permissions);
    const counts = await this.db.select({ roleId: users.roleId, n: sql<number>`count(*)::int` }).from(users).groupBy(users.roleId);
    return { roles: rs.map((r) => ({ ...r, users: counts.find((c) => c.roleId === r.id)?.n ?? 0 })), permissions: perms };
  }

  /** FR-43: edit a role's permissions; recorded in the audit log. */
  async setPermission(actor: AuthUser, roleId: number, code: string, scope: Scope | null) {
    this.superOnly(actor);
    const [role] = await this.db.select().from(roles).where(eq(roles.id, roleId));
    if (!role) throw new NotFoundException('Role not found');
    if (role.code === 'CEO_ADMIN' && code.startsWith('admin.')) throw new BadRequestException('Administration permissions cannot be removed from the CEO / Admin role');
    await this.db.delete(rolePermissions).where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionCode, code)));
    if (scope) await this.db.insert(rolePermissions).values({ roleId, permissionCode: code, scope });
    this.access.invalidate();
    await this.audit.log(actor.id, 'PERMISSION_CHANGE', `${role.code}:${code}`, 'SUCCESS', { scope });
    return { roleId, code, scope };
  }

  async auditLog(result?: string) {
    return this.db.select({ a: auditLogs, userName: users.name }).from(auditLogs).leftJoin(users, eq(auditLogs.userId, users.id))
      .where(result ? eq(auditLogs.result, result) : undefined).orderBy(desc(auditLogs.createdAt)).limit(200)
      .then((r) => r.map((x) => ({ ...x.a, userName: x.userName })));
  }

  settingsList() { return this.settings.list(); }

  async updateSetting(actor: AuthUser, key: string, value: string) {
    if (!(key in SETTING_DEFAULTS)) throw new BadRequestException('Unknown setting');
    if (key === 'invoiceOn' && !['CONFIRMATION', 'DELIVERY'].includes(value)) throw new BadRequestException('Use CONFIRMATION or DELIVERY');
    if (!['invoiceOn', 'currency'].includes(key) && Number.isNaN(Number(value))) throw new BadRequestException('Enter a number');
    await this.settings.update(key as SettingKey, value);
    await this.audit.log(actor.id, 'SETTING_CHANGE', key, 'SUCCESS', { value });
    return { key, value };
  }
}
