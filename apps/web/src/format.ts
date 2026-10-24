import i18n from './i18n';

const loc = () => (i18n.language === 'ar' ? 'ar-EG' : 'en-GB');
export const money = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? '—' : `${new Intl.NumberFormat(loc(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)} ${i18n.language === 'ar' ? 'ج.م' : 'EGP'}`;
export const num = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? '—' : new Intl.NumberFormat(loc(), { maximumFractionDigits: digits }).format(n));
export const dateTime = (d: string | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat(loc(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '—';
export const date = (d: string | Date | null | undefined) => (d ? new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)) : '—');
export const time = (d: string | Date | null | undefined) => (d ? new Intl.DateTimeFormat(loc(), { hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '—');
export const ago = (d: string | Date) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: 'auto' });
  if (Math.abs(s) < 60) return rtf.format(-Math.round(s), 'second');
  if (Math.abs(s) < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
};
/** value for <input type="datetime-local"> in the browser's time zone */
export const toLocalInput = (d: Date) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 16); };
export const fromLocalInput = (s: string) => new Date(s).toISOString();
