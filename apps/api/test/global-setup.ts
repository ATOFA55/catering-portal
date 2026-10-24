// Creates and seeds a separate "<db>_test" database so tests never touch the demo data.
import { execSync } from 'child_process';
import 'dotenv/config';
import { Client } from 'pg';

export default async function () {
  const base = new URL(process.env.DATABASE_URL as string);
  const testDb = `${base.pathname.slice(1)}_test`;
  const testUrl = new URL(base.toString()); testUrl.pathname = `/${testDb}`;
  const admin = new URL(base.toString()); admin.pathname = '/postgres';
  const c = new Client({ connectionString: admin.toString() });
  await c.connect();
  const r = await c.query('select 1 from pg_database where datname = $1', [testDb]);
  if (!r.rowCount) await c.query(`create database "${testDb}"`);
  await c.end();
  const env = { ...process.env, DATABASE_URL: testUrl.toString(), DISABLE_JOBS: '1' };
  execSync('npx ts-node --transpile-only src/db/reset.ts && npx drizzle-kit migrate && npx ts-node --transpile-only src/db/seed.ts', { env, stdio: 'ignore', shell: true as unknown as string });
  process.env.TEST_DATABASE_URL = testUrl.toString();
}
