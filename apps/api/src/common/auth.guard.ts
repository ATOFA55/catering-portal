import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AccessService } from './access.service';
import { AuditService } from './audit.service';
import { IS_PUBLIC, PERMS } from './decorators';

/**
 * Global guard: authentication (who are you?) then authorization (what may you do?).
 * Hiding buttons is not enough - every API request is checked here, and refusals are audit-logged (FR-34, NFR-08, NFR-09).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private access: AccessService, private audit: AuditService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Please log in');
    let payload: { sub: number; purpose?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Your session has expired. Please log in again.');
    }
    if (payload.purpose) throw new UnauthorizedException('Invalid token');
    const user = await this.access.load(payload.sub);
    if (!user) throw new UnauthorizedException('Account disabled or not found');
    req.user = user;

    const needed = this.reflector.getAllAndOverride<string[]>(PERMS, targets);
    if (needed?.length && !needed.some((p) => p in user.perms)) {
      await this.audit.log(user.id, 'ACCESS', `${req.method} ${req.originalUrl}`, 'DENIED', { needed, role: user.roleCode }, req.ip);
      throw new ForbiddenException('Access denied: your role does not allow this action.');
    }
    return true;
  }
}
