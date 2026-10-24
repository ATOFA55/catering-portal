// Drops all tables so "npm run db:reset" can rebuild the demo from scratch.
import 'dotenv/config';
import { Client } from 'pg';

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await c.end();
  console.log('Database cleared.');
})().catch((e) => { console.error(e); process.exit(1); });
