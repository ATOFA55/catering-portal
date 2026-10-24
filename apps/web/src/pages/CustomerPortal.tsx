import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, FileText, PlusCircle, RefreshCw, ShoppingBag, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Card, Empty, KpiTile, PageHeader, Q, StatusBadge, TileRow, denied } from '../components/ui';
import { dateTime, money } from '../format';

export default function CustomerPortal() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const dash = useQuery({ queryKey: ['dash-me'], queryFn: () => api('/dashboard/me'), refetchInterval: 20_000 });
  const recent = useQuery({ queryKey: ['orders', 'recent'], queryFn: () => api('/orders?pageSize=6&sort=created&dir=desc') });
  const latestId = dash.data?.latestOrderId;
  const latest = useQuery({ queryKey: ['order', String(latestId)], queryFn: () => api(`/orders/${latestId}`), enabled: !!latestId });
  const deny = denied(recent);
  if (deny) return deny;

  return (
    <div>
      <PageHeader title={`${t('Welcome')}, ${me?.name.split(' ')[0]}`} subtitle={t('Order catering for your team and follow every order here.')}
        actions={<><Link to="/order/new" className="btn-primary"><PlusCircle size={16} />{t('New Order')}</Link><Link to="/catalog" className="btn-secondary"><BookOpen size={16} />{t('Browse catalog')}</Link></>} />
      <Q q={dash}>{(d: any) => (
        <>
          <TileRow>
            <KpiTile label={t('Active orders')} value={d.tiles.active} tone="blue" icon={<ShoppingBag />} to="/my-orders" />
            <KpiTile label={t('Delivered orders')} value={d.tiles.delivered} tone="green" icon={<CheckCircle2 />} to="/my-orders?status=DELIVERED" />
            <KpiTile label={t('Changes waiting for you')} value={d.tiles.awaiting} tone="orange" icon={<AlertTriangle />} to="/my-orders?status=AWAITING_CUSTOMER_APPROVAL" />
            <KpiTile label={t('Unpaid amount')} value={money(d.tiles.unpaid, 0)} tone="red" icon={<FileText />} to="/invoices" />
            <KpiTile label={t('Drafts')} value={d.tiles.drafts} tone="slate" icon={<RefreshCw />} to="/my-orders?status=DRAFT" />
          </TileRow>
        </>
      )}</Q>
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-5">
        <Card title={t('Latest order')} actions={latest.data && <Link to={`/orders/${latest.data.id}`} className="btn-ghost btn-sm">{t('Open')}<ArrowRight size={14} className="rtl:rotate-180" /></Link>}>
          {!latestId ? <Empty text={t('You have no orders yet.')} icon={<Truck />} /> : latest.data ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><div className="font-bold text-ink">{latest.data.number}</div><div className="text-sm text-ink-3">{dateTime(latest.data.deliveryAt)} · {money(latest.data.total)}</div></div>
                <StatusBadge status={latest.data.status} delayed={latest.data.isDelayed} />
              </div>
              <ol className="mt-4 space-y-3">
                {latest.data.history.slice(-5).reverse().map((h: any) => (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                    <div><div className="font-medium text-ink">{h.comment || h.toStatus}</div><div className="text-xs text-ink-4">{dateTime(h.createdAt)}</div></div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </Card>
        <Card title={t('My recent orders')} pad={false} actions={<Link to="/my-orders" className="btn-ghost btn-sm">{t('All orders')}</Link>}>
          <Q q={recent}>{(r: any) => r.items.length === 0 ? <Empty text={t('You have no orders yet.')} /> : (
            <ul>
              {r.items.map((o: any) => (
                <li key={o.id}>
                  <Link to={`/orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line/60 hover:bg-brand-50/50">
                    <div className="min-w-0"><div className="font-semibold text-ink">{o.number}</div><div className="text-xs text-ink-4">{dateTime(o.deliveryAt)}</div></div>
                    <div className="text-end shrink-0"><StatusBadge status={o.status} delayed={o.isDelayed} /><div className="text-xs text-ink-3 mt-1 tabular-nums">{money(o.total)}</div></div>
                  </Link>
                </li>
              ))}
            </ul>
          )}</Q>
        </Card>
      </div>
    </div>
  );
}
