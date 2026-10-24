export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
export const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3600_000);
export const startOfHour = (d: Date) => { const x = new Date(d); x.setMinutes(0, 0, 0); return x; };
export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Human-readable local time for history comments and notifications. */
export const fmt = (d: Date | string) =>
  new Date(d).toLocaleString('en-GB', { timeZone: process.env.APP_TIMEZONE ?? 'Africa/Cairo', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
