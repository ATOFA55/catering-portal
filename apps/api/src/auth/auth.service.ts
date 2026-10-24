import { HttpException, HttpStatus, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { AccessService } from '../common/access.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.types';
import { DB, Db } from '../db/db.module';
import { users } from '../db/schema';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private log = new Logger('Auth');
  constructor(@Inject(DB) private db: Db, private jwt: JwtService, private access: AccessService, private audit: AuditService) {}

  profile(u: AuthUser) {
    return { id: u.id, name: u.name, email: u.email, role: { id: u.roleId, code: u.roleCode, name: u.roleName, homePath: u.homePath },
      isSuperAdmin: u.isSuperAdmin, permissions: u.perms };
  }

  async login(email: string, password: string, ip?: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
    if (!user) {
      await this.audit.log(null, 'LOGIN', email, 'FAILED', { reason: 'unknown email' }, ip);
      throw new UnauthorizedException('Email or password is incorrect');
    }
    if (!user.isActive) throw new UnauthorizedException('This account is disabled. Contact the administrator.');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(`Account locked after ${MAX_FAILED} failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString()}.`, HttpStatus.LOCKED);
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const failed = user.failedLogins + 1;
      const lockedUntil = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
      await this.db.update(users).set({ failedLogins: lockedUntil ? 0 : failed, lockedUntil }).where(eq(users.id, user.id));
      await this.audit.log(user.id, 'LOGIN', email, 'FAILED', { failed }, ip);
      throw new UnauthorizedException(lockedUntil ? `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.` : 'Email or password is incorrect');
    }
    await this.db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
    await this.audit.log(user.id, 'LOGIN', email, 'SUCCESS', null, ip);
    const auth = await this.access.load(user.id);
    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, user: this.profile(auth!) };
  }

  /** FR-102: in this prototype the reset link is written to the server log instead of being emailed. */
  async forgotPassword(email: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
    if (user) {
      const token = await this.jwt.signAsync({ sub: user.id, purpose: 'reset' }, { expiresIn: '30m' });
      this.log.log(`Password reset link for ${user.email}: http://localhost:5173/reset-password?token=${token}`);
      await this.audit.log(user.id, 'PASSWORD_RESET_REQUEST', user.email, 'SUCCESS');
    }
    return { message: 'If this email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    let payload: { sub: number; purpose?: string };
    try { payload = await this.jwt.verifyAsync(token); } catch { throw new UnauthorizedException('The reset link is invalid or has expired'); }
    if (payload.purpose !== 'reset') throw new UnauthorizedException('Invalid reset link');
    await this.db.update(users).set({ passwordHash: await bcrypt.hash(newPassword, 10), failedLogins: 0, lockedUntil: null }).where(eq(users.id, payload.sub));
    await this.audit.log(payload.sub, 'PASSWORD_RESET', String(payload.sub), 'SUCCESS');
    return { message: 'Password changed. You can log in now.' };
  }

  async changeLanguage(userId: number, language: 'en' | 'ar') {
    await this.db.update(users).set({ language }).where(eq(users.id, userId));
    return { language };
  }
}
