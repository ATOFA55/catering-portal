import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, ClipboardCheck, Clock, Download, Hourglass, PlusCircle, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty, KpiTile, PageHeader, Q, StatusBadge, TileRow, denied } from '../components/ui';
import { dateTime, money } from '../format';
import { exportXlsx } from '../xlsx';

const FILTERS: [string, string][] = [
  ['', 'All'], ['PENDING', 'Pending'], ['AWAITING_CUSTOMER_APPROVAL', 'Awaiting approval'], ['CONFIRMED', 'Confirmed'], ['PREPARING', 'Preparing'],
  ['READY_FOR_DISPATCH', 'Ready'], ['OUT_FOR_DELIVERY', 'Out for delivery'], ['DELIVERED', 'Delivered'], ['DELIVERY_FAILED', 'Failed'], ['CANCELLED', 'Cancelled'], ['DRAFT', 'Drafts'],
];

export default function OrdersPage() {
  const { t } = useTranslation();
  const { me, scope, can } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const own = scope('orders.view') === 'OWN';
  const status = sp.get('status') ?? '';
  const delayed = sp.get('delayed') === 'true';
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [from, setFrom] = useState(sp.get('from') ?? '');
  const [to, setTo] = useState(sp.get('to') ?? '');
  const page = Number(sp.get('page') ?? 1);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n); };

  const activeFilter = ['PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'CONFIRMED', 'PREPARING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'].includes(status) || delayed;
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', sort: !own && activeFilter ? 'delivery' : 'created', dir: !own && activeFilter ? 'asc' : 'desc' });
  if (status) qs.set('status', status);
  if (delayed) qs.set('delayed', 'true');
  if (sp.get('q')) qs.set('q', sp.get('q')!);
  if (from) qs.set('from', new Date(from).toISOString());
  if (to) qs.set('to', new Date(to + 'T23:59:59').toISOString());
  const list = useQuery({ queryKey: ['orders', qs.toString()], queryFn: () => api(`/orders?${qs}`), placeholderData: keepPreviousData });
  const tiles = useQuery({ queryKey: ['dash-me'], queryFn: () => api('/dashboard/me'), enabled: me?.role.code === 'ORDER_MANAGER', refetchInterval: 20_000 });

  const doExport = async () => {
    const all = await api(`/orders?${new URLSearchParams({ ...Object.fromEntries(qs), page: '1', pageSize: '100' })}`);
    await exportXlsx('orders.xlsx', [
      { header: 'Order', get: (r: any) => r.number }, { header: 'Customer', get: (r: any) => r.company ?? r.customerName },
      { header: 'Delivery', get: (r: any) => new Date(r.deliveryAt) }, { header: 'Type', get: (r: any) => r.type }, { header: 'Status', get: (r: any) => r.status },
      { header: 'Delayed', get: (r: any) => (r.isDelayed ? 'Yes' : '') }, { header: 'Total (EGP)', get: (r: any) => r.total },
    ], all.items);
  };

  const deny = denied(list);
  if (deny) return deny;
  const tl = tiles.data?.tiles;
  return (
    <div>
      <PageHeader title={own ? t('My Orders') : t('Order Management')} subtitle={own ? t('Track your orders and see their status.') : t('Review, confirm and follow every order.')}
        actions={<>
          {can('orders.create') && <Link to="/order/new" className="btn-primary"><PlusCircle size={16} />{t('New Order')}</Link>}
          {!own && <button className="btn-secondary" onClick={doExport}><Download size={16} />{t('Export Excel')}</button>}
        </>} />
      {tl && (
        <TileRow>
          <KpiTile label={t('New orders to confirm')} value={tl.pending} tone="orange" icon={<ClipboardCheck />} onClick={() => set('status', 'PENDING')} />
          <KpiTile label={t('Awaiting customer approval')} value={tl.awaiting} tone="slate" icon={<Hourglass />} onClick={() => set('status', 'AWAITING_CUSTOMER_APPROVAL')} />
          <KpiTile label={t('Delayed orders')} value={tl.delayed} tone="red" icon={<AlertTriangle />} onClick={() => { const n = new URLSearchParams(); n.set('delayed', 'true'); setSp(n); }} />
          <KpiTile label={t("Today's deliveries")} value={tl.today} tone="blue" icon={<CalendarClock />} />
          <KpiTile label={t('Orders received today')} value={tl.new_today} tone="navy" icon={<Clock />} />
        </TileRow>
      )}
      <div className="card">
        <div className="p-3 border-b border-line flex flex-col gap-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTERS.filter(([v]) => own || v !== 'DRAFT').map(([v, l]) => (
              <button key={v} onClick={() => { const n = new URLSearchParams(sp); n.delete('delayed'); n.delete('page'); if (v) n.set('status', v); else n.delete('status'); setSp(n); }}
                className={`chip px-3 py-1.5 text-xs whitespace-nowrap ${status === v && !delayed ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-3 hover:bg-brand-50'}`}>{t(l)}</button>
            ))}
            {delayed && <span className="chip px-3 py-1.5 bg-bad text-white">{t('Delayed')}</span>}
          </div>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); set('q', q); }}>
            <div className="relative flex-1 min-w-[200px]"><Search size={16} className="absolute start-3 top-2.5 text-ink-4" />
              <input className="input ps-9" placeholder={own ? t('Search by order number') : t('Search order number, customer or phone')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <input type="date" className="input w-auto" value={from} onChange={(e) => { setFrom(e.target.value); set('from', e.target.value); }} aria-label={t('From')} />
            <input type="date" className="input w-auto" value={to} onChange={(e) => { setTo(e.target.value); set('to', e.target.value); }} aria-label={t('To')} />
            <button className="btn-secondary">{t('Search')}</button>
          </form>
        </div>
        <Q q={list}>{(d: any) => d.items.length === 0 ? (
          <Empty text={sp.get('q') ? t('Order not found') : t('No orders match these filters.')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>{t('Order')}</th>{!own && <th>{t('Customer')}</th>}<th>{t('Delivery')}</th><th>{t('Type')}</th><th>{t('Status')}</th><th className="text-end">{t('Total')}</th><th>{t('Last update')}</th></tr></thead>
                <tbody>
                  {d.items.map((o: any) => (
                    <tr key={o.id} className="cursor-pointer" onClick={() => nav(`/orders/${o.id}`)}>
                      <td className="font-semibold text-brand-600 whitespace-nowrap">{o.number}{o.allergyNotes && <span title={o.allergyNotes} className="ms-1 text-bad">⚠</span>}</td>
                      {!own && <td><div className="font-medium text-ink">{o.company}</div><div className="text-xs text-ink-4">{o.customerName}</div></td>}
                      <td className="whitespace-nowrap">{dateTime(o.deliveryAt)}</td>
                      <td>{o.type === 'EVENT' ? <span className="chip bg-purple-50 text-purple-700">{t('Event')} · {o.guestCount}</span> : <span className="text-ink-3">{t('Daily')}</span>}</td>
                      <td><StatusBadge status={o.status} delayed={o.isDelayed} /></td>
                      <td className="text-end tabular-nums font-medium whitespace-nowrap">{money(o.total)}</td>
                      <td className="text-xs text-ink-4 whitespace-nowrap">{dateTime(o.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between p-3 text-sm text-ink-3">
              <span>{d.total} {t('orders')}</span>
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>{t('Previous')}</button>
                <button className="btn-secondary btn-sm" disabled={page * d.pageSize >= d.total} onClick={() => set('page', String(page + 1))}>{t('Next')}</button>
              </div>
            </div>
          </>
        )}</Q>
      </div>
    </div>
  );
}
