import { Inject, Injectable } from '@nestjs/common';
import { DB, Db } from '../db/db.module';
import { auditLogs } from '../db/schema';

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private db: Db) {}

  async log(userId: number | null, action: string, resource: string, result: 'SUCCESS' | 'FAILED' | 'DENIED', details?: unknown, ip?: string) {
    await this.db.insert(auditLogs).values({ userId, action, resource, result, details: (details ?? null) as object, ip: ip ?? null });
  }
}
