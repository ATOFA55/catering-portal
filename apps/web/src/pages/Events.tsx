import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock, MapPin, Phone, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty, KpiTile, PageHeader, Q, StatusBadge, TileRow, denied } from '../components/ui';
import { dateTime, num } from '../format';

const STAGES = [['CONFIRMED', 'Confirmed'], ['PREPARING', 'Preparation'], ['OUT_FOR_DELIVERY', 'Dispatch'], ['DELIVERED', 'Service completed']] as const;
const rank = (s: string) => ({ PENDING: 0, AWAITING_CUSTOMER_APPROVAL: 0, CONFIRMED: 1, PREPARING: 2, READY_FOR_DISPATCH: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4 } as Record<string, number>)[s] ?? 0;

/** Event Coordinator: guests, venue, services, schedule and progress (FR-73, FR-76, FR-77). No prices. */
export default function Events() {
  const { t } = useTranslation();
  const { me, can } = useAuth();
  const list = useQuery({ queryKey: ['events'], queryFn: () => api('/events') });
  const dash = useQuery({ queryKey: ['dash-me'], queryFn: () => api('/dashboard/me'), enabled: me?.role.code === 'EVENT_COORDINATOR' });
  const deny = denied(list);
  if (deny) return deny;
  const tl = dash.data?.tiles;
  return (
    <div>
      <PageHeader title={t('Event Planning')} subtitle={t('Upcoming events with guest counts, venues, services and progress.')} />
      {tl && (
        <TileRow>
          <KpiTile label={t('Upcoming events')} value={tl.upcoming} tone="blue" icon={<CalendarDays />} />
          <KpiTile label={t('Guests to serve')} value={num(tl.guests)} tone="navy" icon={<Users />} />
          <KpiTile label={t('Events this week')} value={tl.this_week} tone="green" icon={<Clock />} />
          <KpiTile label={t('Waiting for confirmation')} value={tl.pending} tone="orange" icon={<Clock />} />
        </TileRow>
      )}
      <Q q={list}>{(rows: any[]) => rows.length === 0 ? <div className="card"><Empty text={t('No upcoming events.')} /></div> : (
        <div className="grid lg:grid-cols-2 gap-4">
          {rows.map((e) => (
            <div key={e.id} className="card p-4">
              <div className="flex justify-between gap-3">
                <div><div className="text-xs text-ink-4">{e.number} · {e.company}</div><div className="font-bold text-ink text-lg leading-tight">{e.eventLocation ?? e.addressText}</div></div>
                <StatusBadge status={e.status} delayed={e.isDelayed} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                <div className="flex gap-2"><Users size={16} className="text-ink-4 mt-0.5" /><div><div className="text-[11px] text-ink-4">{t('Guests')}</div><div className="font-semibold">{e.guestCount}</div></div></div>
                <div className="flex gap-2"><CalendarDays size={16} className="text-ink-4 mt-0.5" /><div><div className="text-[11px] text-ink-4">{t('Service starts')}</div><div className="font-semibold">{dateTime(e.deliveryAt)}</div></div></div>
                <div className="flex gap-2"><Clock size={16} className="text-ink-4 mt-0.5" /><div><div className="text-[11px] text-ink-4">{t('Setup')}</div><div className="font-semibold">{dateTime(e.setupAt)}</div></div></div>
                <div className="flex gap-2"><Phone size={16} className="text-ink-4 mt-0.5" /><div><div className="text-[11px] text-ink-4">{t('Contact')}</div><div className="font-semibold">{e.contactName}</div><div className="text-xs">{e.contactPhone}</div></div></div>
              </div>
              <div className="mt-3 text-sm"><span className="text-ink-4 text-xs">{t('Menu')}:</span> {e.menu.map((m: any) => `${m.name} × ${m.qty}`).join(', ')}</div>
              <div className="mt-1 text-sm"><span className="text-ink-4 text-xs">{t('Services')}:</span> {e.services.length ? e.services.map((m: any) => `${m.name} × ${m.qty} ${t(m.unit)}`).join(', ') : '—'}</div>
              {e.allergyNotes && <div className="mt-2 text-sm text-bad font-semibold">⚠ {e.allergyNotes}</div>}
              <ol className="flex gap-1 mt-4">
                {STAGES.map(([s, l], i) => <li key={s} className="flex-1"><div className={`h-1.5 rounded-full ${rank(e.status) > i ? 'bg-brand-500' : 'bg-line'}`} /><div className={`text-[11px] mt-1 ${rank(e.status) > i ? 'text-ink font-semibold' : 'text-ink-4'}`}>{t(l)}</div></li>)}
              </ol>
              {can('orders.view') && <Link to={`/orders/${e.id}`} className="btn-ghost btn-sm mt-3 -ms-2"><MapPin size={14} />{t('Open order')}</Link>}
            </div>
          ))}
        </div>
      )}</Q>
    </div>
  );
}
