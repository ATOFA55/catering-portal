import { UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info, Loader2, Lock, X, XCircle } from 'lucide-react';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiError } from '../api';

// ---------------------------------------------------------------- status (UI-07 colour rules)
export const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-slate-100 text-slate-600' },
  PENDING: { label: 'Pending', cls: 'bg-warn-bg text-warn' },
  AWAITING_CUSTOMER_APPROVAL: { label: 'Awaiting Customer Approval', cls: 'bg-warn-bg text-warn' },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-brand-100 text-brand-700' },
  PREPARING: { label: 'Preparing', cls: 'bg-indigo-50 text-indigo-700' },
  READY_FOR_DISPATCH: { label: 'Ready for Dispatch', cls: 'bg-cyan-50 text-cyan-800' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', cls: 'bg-brand-500 text-white' },
  DELIVERED: { label: 'Delivered', cls: 'bg-ok-bg text-ok' },
  DELIVERY_FAILED: { label: 'Delivery Failed', cls: 'bg-bad-bg text-bad' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 line-through' },
  // invoices / production / deliveries
  UNPAID: { label: 'Unpaid', cls: 'bg-bad-bg text-bad' },
  PARTIALLY_PAID: { label: 'Partially Paid', cls: 'bg-warn-bg text-warn' },
  PAID: { label: 'Paid', cls: 'bg-ok-bg text-ok' },
  OVERDUE: { label: 'Overdue', cls: 'bg-bad text-white' },
  REFUNDED: { label: 'Refunded', cls: 'bg-slate-100 text-slate-600' },
  PLANNED: { label: 'To prepare', cls: 'bg-warn-bg text-warn' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-indigo-50 text-indigo-700' },
  DONE: { label: 'Done', cls: 'bg-ok-bg text-ok' },
  ASSIGNED: { label: 'Assigned', cls: 'bg-brand-100 text-brand-700' },
  FAILED: { label: 'Failed', cls: 'bg-bad-bg text-bad' },
  AVAILABLE: { label: 'Available', cls: 'bg-ok-bg text-ok' },
  ON_DELIVERY: { label: 'On delivery', cls: 'bg-brand-100 text-brand-700' },
  OFF_DUTY: { label: 'Off duty', cls: 'bg-slate-100 text-slate-500' },
};

export function StatusBadge({ status, delayed }: { status: string; delayed?: boolean }) {
  const { t } = useTranslation();
  const s = STATUS[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className={`chip ${s.cls}`}>{t(s.label)}</span>
      {delayed && <span className="chip bg-bad text-white">{t('Delayed')}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- layout pieces
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-3 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '', pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line/70">
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          {actions && <div className="flex gap-2 no-print">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

const TONES = {
  blue: 'from-brand-500 to-brand-600', navy: 'from-brand-700 to-brand-800', green: 'from-[#2E8B57] to-[#257349]',
  orange: 'from-[#E08E0B] to-[#C77700]', red: 'from-[#C0392B] to-[#A93226]', slate: 'from-[#5A6B7B] to-[#37414B]',
};
export function KpiTile({ label, value, sub, tone = 'blue', icon, onClick, to }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: keyof typeof TONES; icon?: ReactNode; onClick?: () => void; to?: string;
}) {
  const inner = (
    <div className={`h-full rounded-xl bg-gradient-to-br ${TONES[tone]} text-white p-4 shadow-card relative overflow-hidden ${onClick || to ? 'hover:brightness-110 transition cursor-pointer' : ''}`}>
      <div className="absolute -end-3 -top-3 opacity-15 [&>svg]:w-20 [&>svg]:h-20">{icon}</div>
      <div className="text-2xl xl:text-[26px] font-bold tabular-nums leading-tight break-words">{value}</div>
      <div className="text-[13px] font-medium opacity-90 mt-1">{label}</div>
      {sub && <div className="text-[11px] opacity-80 mt-1">{sub}</div>}
    </div>
  );
  if (to) return <Link to={to} className="block">{inner}</Link>;
  return onClick ? <button type="button" onClick={onClick} className="text-start w-full">{inner}</button> : inner;
}

export const TileRow = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-5">{children}</div>;

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line mb-4 no-print">
      {tabs.map((tb) => (
        <button key={tb.id} onClick={() => onChange(tb.id)}
          className={`px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${value === tb.id ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-3 hover:text-ink'}`}>
          {tb.label}{tb.count !== undefined && <span className="ms-1.5 chip bg-canvas text-ink-3">{tb.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 p-0 sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className={`bg-white w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col`}>
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h3 className="font-bold text-ink">{title}</h3>
          <button className="p-1 rounded hover:bg-canvas" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-line flex justify-end gap-2 flex-wrap">{footer}</footer>}
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) => (
  <label className="block mb-3"><span className="label">{label}</span>{children}{hint && <span className="block text-[11px] text-ink-4 mt-1">{hint}</span>}</label>
);

export const Empty = ({ text, icon }: { text: string; icon?: ReactNode }) => (
  <div className="text-center py-10 text-ink-4 text-sm flex flex-col items-center gap-2">{icon}{text}</div>
);

export const Loading = () => {
  const { t } = useTranslation();
  return <div className="flex items-center justify-center gap-2 py-16 text-ink-4 text-sm"><Loader2 className="animate-spin" size={18} />{t('Loading...')}</div>;
};

export function AccessDenied({ message }: { message?: string }) {
  const { t } = useTranslation();
  return (
    <div className="card max-w-lg mx-auto mt-10 p-8 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-bad-bg text-bad flex items-center justify-center mb-4"><Lock /></div>
      <h1 className="text-lg font-bold">{t('Access denied')}</h1>
      <p className="text-sm text-ink-3 mt-2">{message ?? t('Your role does not allow this page.')}</p>
      <p className="text-xs text-ink-4 mt-3">{t('The server refused the request and recorded the attempt in the audit log.')}</p>
      <Link to="/" className="btn-primary mt-5">{t('Back to my dashboard')}</Link>
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;
  const e = error as ApiError;
  const list = (e.data?.errors as string[] | undefined) ?? [];
  const shortages = (e.data?.shortages as { name: string; needed: number; available: number; unit: string }[] | undefined) ?? [];
  return (
    <div className="rounded-lg border border-bad/30 bg-bad-bg text-bad px-3 py-2.5 text-sm flex gap-2">
      <XCircle size={18} className="shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold">{t(e.message ?? 'Something went wrong')}</div>
        {list.length > 1 && <ul className="list-disc ms-4 mt-1">{list.map((x) => <li key={x}>{x}</li>)}</ul>}
        {shortages.length > 0 && <ul className="list-disc ms-4 mt-1">{shortages.map((s) => <li key={s.name}>{s.name}: {t('need')} {s.needed} {s.unit}, {t('available')} {s.available}</li>)}</ul>}
      </div>
    </div>
  );
}

/** Renders loading / error / access denied for a query, then the content. */
export function Q<T>({ q, children }: { q: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (q.isLoading) return <Loading />;
  if (q.error) {
    const e = q.error as ApiError;
    if (e.status === 403) return <AccessDenied message={e.message} />;
    if (e.status === 404) return <div className="card p-8 text-center text-ink-3">{e.message}</div>;
    return <ErrorBox error={e} />;
  }
  return <>{children(q.data as T)}</>;
}

/** If the server refused any of these queries (403), the whole page shows one "Access denied" screen. */
export function denied(...qs: UseQueryResult<unknown>[]) {
  const e = qs.find((q) => (q.error as ApiError | null)?.status === 403)?.error as ApiError | undefined;
  return e ? <AccessDenied message={e.message} /> : null;
}

// ---------------------------------------------------------------- toasts
type Toast = { id: number; text: string; tone: 'ok' | 'bad' | 'info' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 end-4 z-[60] flex flex-col gap-2 max-w-sm no-print" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`flex gap-2 items-start rounded-lg px-3.5 py-2.5 text-sm shadow-lg text-white ${i.tone === 'ok' ? 'bg-ok' : i.tone === 'bad' ? 'bg-bad' : 'bg-ink'}`}>
            {i.tone === 'ok' ? <CheckCircle2 size={18} /> : i.tone === 'bad' ? <AlertTriangle size={18} /> : <Info size={18} />}<span>{i.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export const Tag = ({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'orange' | 'blue' }) => {
  const cls = { slate: 'bg-canvas text-ink-3', green: 'bg-ok-bg text-ok', red: 'bg-bad-bg text-bad', orange: 'bg-warn-bg text-warn', blue: 'bg-brand-100 text-brand-700' }[tone];
  return <span className={`chip ${cls}`}>{children}</span>;
};
