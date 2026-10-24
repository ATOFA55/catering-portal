import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, CheckCircle2, CircleDashed, ClipboardList, Download, FileText, Printer, Star, TrendingUp, Wallet, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { Card, Empty, ErrorBox, KpiTile, Loading, PageHeader, TileRow, denied } from '../components/ui';
import { money, num } from '../format';
import { exportXlsx } from '../xlsx';

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#E08E0B', AWAITING_CUSTOMER_APPROVAL: '#E08E0B', CONFIRMED: '#3A8DBE', PREPARING: '#3A8DBE', READY_FOR_DISPATCH: '#3A8DBE',
  OUT_FOR_DELIVERY: '#286E9B', DELIVERED: '#2E8B57', DELIVERY_FAILED: '#C0392B', CANCELLED: '#9AA5B1',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending', AWAITING_CUSTOMER_APPROVAL: 'Awaiting approval', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', READY_FOR_DISPATCH: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', DELIVERY_FAILED: 'Failed', CANCELLED: 'Cancelled',
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PERIODS = [['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']] as const;
const axis = { fontSize: 11, fill: '#5A6B7B' };
const tipStyle = { borderRadius: 8, border: '1px solid #D7DDE3', fontSize: 12, boxShadow: '0 4px 12px rgba(30,42,54,.12)' };

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const { t } = useTranslation();
  if (!prev) return <span>{t('no earlier data')}</span>;
  const d = ((cur - prev) / prev) * 100;
  return <span className="inline-flex items-center gap-0.5">{d >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(d).toFixed(1)}% {t('vs previous period')}</span>;
}

/** UC-04 Executive Dashboard: KPIs with period filter, drill-down, charts and export (FR-26 to FR-30, Section 14). */
export default function Executive() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>('month');
  const q = useQuery({ queryKey: ['exec', period], queryFn: () => api(`/dashboard/executive?period=${period}`), refetchInterval: 60_000 });

  const doExport = () => {
    const d = q.data;
    exportXlsx(`kpi-report-${period}.xlsx`, [
      { header: 'KPI', get: (r: any) => r.name }, { header: 'Value', get: (r: any) => r.value ?? '' }, { header: 'Unit', get: (r: any) => r.unit },
      { header: 'Target', get: (r: any) => r.target }, { header: 'On target', get: (r: any) => (r.ok === null ? '' : r.ok ? 'Yes' : 'No') }, { header: 'Owner', get: (r: any) => r.owner },
    ], [
      { name: 'Total orders', value: d.tiles.totalOrders, unit: '', target: '', ok: null, owner: 'CEO' },
      { name: 'Revenue', value: d.tiles.revenue, unit: 'EGP', target: '', ok: null, owner: 'CEO' },
      ...d.kpis,
    ]);
  };

  const deny = denied(q);
  if (deny) return deny;
  return (
    <div>
      <PageHeader title={t('Executive Dashboard')} subtitle={t('Sales, deliveries, stock and unpaid invoices in real time.')}
        actions={<>
          <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label={t('Period')}>
            {PERIODS.map(([v, l]) => <button key={v} onClick={() => setPeriod(v)} className={`px-3 py-1.5 text-sm font-semibold rounded-md ${period === v ? 'bg-brand-500 text-white' : 'text-ink-3 hover:bg-brand-50'}`}>{t(l)}</button>)}
          </div>
          <button className="btn-secondary" onClick={doExport} disabled={!q.data}><Download size={16} />{t('Excel')}</button>
          <button className="btn-secondary" onClick={() => window.print()}><Printer size={16} />{t('PDF')}</button>
        </>} />
      {q.isLoading && <Loading />}
      {q.error && (
        <div className="card p-6 text-center">
          <ErrorBox error={q.error} />
          <button className="btn-primary mt-4" onClick={() => q.refetch()}>{t('Retry')}</button>
        </div>
      )}
      {q.data && (() => {
        const d = q.data;
        const tl = d.tiles;
        const noData = tl.totalOrders === 0;
        const byStatus = d.charts.byStatus.map((s: any) => ({ ...s, label: t(STATUS_LABEL[s.status] ?? s.status) })).sort((a: any, b: any) => b.n - a.n);
        return (
          <>
            <TileRow>
              <KpiTile label={t('Total orders')} value={num(tl.totalOrders)} sub={<Delta cur={tl.totalOrders} prev={tl.totalOrdersPrev} />} tone="blue" icon={<ClipboardList />} to="/orders" />
              <KpiTile label={t('Revenue')} value={money(tl.revenue, 0)} sub={<Delta cur={tl.revenue} prev={tl.revenuePrev} />} tone="navy" icon={<TrendingUp />} />
              <KpiTile label={t('On-time delivery')} value={tl.onTimeRate === null ? '—' : `${tl.onTimeRate}%`} sub={`${t('Target')} ≥ 95%`} tone={tl.onTimeRate !== null && tl.onTimeRate >= 95 ? 'green' : 'orange'} icon={<CheckCircle2 />} />
              <KpiTile label={t('Low-stock items')} value={tl.lowStock} tone="red" icon={<Boxes />} to="/inventory" />
              <KpiTile label={t('Unpaid invoices')} value={money(tl.unpaidAmount, 0)} sub={`${tl.unpaidCount} ${t('invoices')}`} tone="orange" icon={<Wallet />} to="/finance" />
            </TileRow>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { l: 'Delayed orders now', v: tl.delayed, icon: <AlertTriangle size={18} />, cls: 'text-bad', to: '/orders?delayed=true' },
                { l: 'Average rating', v: `${tl.avgRating || '—'} / 5`, icon: <Star size={18} />, cls: 'text-warn' },
                { l: 'Cancelled in period', v: tl.cancelled, icon: <XCircle size={18} />, cls: 'text-ink-3', to: '/orders?status=CANCELLED' },
                { l: 'Average order value', v: money(d.kpis.find((k: any) => k.key === 'aov')?.value, 0), icon: <FileText size={18} />, cls: 'text-brand-600' },
              ].map((x) => (
                <button key={x.l} disabled={!x.to} onClick={() => x.to && nav(x.to)} className="card px-4 py-3 text-start flex items-center gap-3 enabled:hover:border-brand-300">
                  <span className={x.cls}>{x.icon}</span><div><div className="text-lg font-bold text-ink tabular-nums">{x.v}</div><div className="text-xs text-ink-3">{t(x.l)}</div></div>
                </button>
              ))}
            </div>

            {noData ? <div className="card"><Empty text={t('No data available for this period.')} /></div> : (
              <div className="grid lg:grid-cols-2 gap-5">
                <Card title={period === 'year' ? t('Sales by month') : t('Sales by day')}>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={d.charts.sales} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3A8DBE" stopOpacity={0.28} /><stop offset="100%" stopColor="#3A8DBE" stopOpacity={0.02} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E9EE" />
                      <XAxis dataKey="d" tick={axis} tickFormatter={(v: string) => (period === 'year' ? v : v.slice(5))} minTickGap={16} />
                      <YAxis tick={axis} tickFormatter={(v) => `${num(v / 1000)}k`} width={44} />
                      <Tooltip contentStyle={tipStyle} formatter={(v: number, k) => (k === 'revenue' ? [money(v), t('Revenue')] : [v, t('Orders')])} cursor={{ stroke: '#828C96', strokeDasharray: '3 3' }} />
                      <Area type="monotone" dataKey="revenue" stroke="#286E9B" strokeWidth={2} fill="url(#rev)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
                <Card title={t('Orders by status')} actions={<span className="text-[11px] text-ink-4">{t('Click a bar to see the orders')}</span>}>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={byStatus} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap={4}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E9EE" />
                      <XAxis type="number" tick={axis} allowDecimals={false} />
                      <YAxis type="category" dataKey="label" tick={axis} width={110} />
                      <Tooltip contentStyle={tipStyle} formatter={(v: number) => [v, t('Orders')]} cursor={{ fill: '#EEF6FB' }} />
                      <Bar dataKey="n" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(e: any) => nav(`/orders?status=${e.status}`)}>
                        {byStatus.map((s: any) => <Cell key={s.status} fill={STATUS_COLOR[s.status] ?? '#3A8DBE'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card title={t('Busiest days of the week')}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={d.charts.weekdays.map((w: any) => ({ ...w, day: t(DAYS[w.dow]) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E9EE" />
                      <XAxis dataKey="day" tick={axis} /><YAxis tick={axis} allowDecimals={false} width={32} />
                      <Tooltip contentStyle={tipStyle} formatter={(v: number) => [v, t('Orders')]} cursor={{ fill: '#EEF6FB' }} />
                      <Bar dataKey="n" fill="#3A8DBE" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card title={t('Top sellers by revenue')}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={d.charts.top} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E9EE" />
                      <XAxis type="number" tick={axis} tickFormatter={(v) => `${num(v / 1000)}k`} />
                      <YAxis type="category" dataKey="name" tick={axis} width={140} />
                      <Tooltip contentStyle={tipStyle} formatter={(v: number) => [money(v), t('Revenue')]} cursor={{ fill: '#EEF6FB' }} />
                      <Bar dataKey="revenue" fill="#286E9B" radius={[0, 4, 4, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}

            <Card title={t('KPI scorecard')} className="mt-5" pad={false} actions={<span className="text-[11px] text-ink-4">{t('Targets are proposals for discussion (Section 14)')}</span>}>
              <div className="overflow-x-auto"><table className="table">
                <thead><tr><th>{t('KPI')}</th><th className="text-end">{t('Value')}</th><th>{t('Target')}</th><th>{t('Status')}</th><th>{t('Owner')}</th></tr></thead>
                <tbody>{d.kpis.map((k: any) => (
                  <tr key={k.key}>
                    <td className="font-medium text-ink">{t(k.name)}</td>
                    <td className="text-end tabular-nums font-bold text-ink">{k.value === null ? '—' : k.unit === 'EGP' ? money(k.value, 0) : `${num(k.value, 2)} ${k.unit}`}</td>
                    <td className="text-ink-3">{t(k.target)}</td>
                    <td>{k.ok === null ? <span className="chip bg-canvas text-ink-3"><CircleDashed size={12} />{t('Tracked')}</span> : k.ok
                      ? <span className="chip bg-ok-bg text-ok"><CheckCircle2 size={12} />{t('On target')}</span>
                      : <span className="chip bg-bad-bg text-bad"><AlertTriangle size={12} />{t('Below target')}</span>}</td>
                    <td className="text-xs text-ink-3">{t(k.owner)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </Card>
          </>
        );
      })()}
    </div>
  );
}
