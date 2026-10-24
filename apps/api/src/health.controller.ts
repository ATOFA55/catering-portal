import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from './common/decorators';
import { DB, Db } from './db/db.module';

/** NFR-23: health-check endpoint for monitoring. */
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private db: Db) {}
  @Public() @Get()
  async check() {
    await this.db.execute(sql`select 1`);
    return { status: 'ok', time: new Date().toISOString() };
  }
}
