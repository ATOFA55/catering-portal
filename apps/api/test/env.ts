import 'dotenv/config';
const base = new URL(process.env.DATABASE_URL as string);
base.pathname = `${base.pathname}_test`;
process.env.DATABASE_URL = base.toString();
process.env.DISABLE_JOBS = '1';
process.env.TZ = process.env.APP_TIMEZONE ?? 'Africa/Cairo';
