import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, MapPin, Package, Phone, Truck, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, post } from '../api';
import { Card, Empty, ErrorBox, Field, KpiTile, Modal, PageHeader, Q, StatusBadge, TileRow, useToast, denied } from '../components/ui';
import { dateTime, fromLocalInput, time, toLocalInput } from '../format';

/** Delivery Manager: assign, reassign, reschedule (UC-03, FR-19 to FR-25, FR-104). */
export default function Dispatch() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const board = useQuery({ queryKey: ['delivery-board'], queryFn: () => api('/delivery/board'), refetchInterval: 15_000 });
  const dash = useQuery({ queryKey: ['dash-me'], queryFn: () => api('/dashboard/me'), refetchInterval: 15_000 });
  const [m, setM] = useState<null | { kind: 'assign' | 'reassign' | 'reschedule'; order: any }>(null);
  const [driverId, setDriverId] = useState<number | ''>('');
  const [when, setWhen] = useState(toLocalInput(new Date()));
  const act = useMutation({
    mutationFn: () => {
      const id = m!.order.id;
      if (m!.kind === 'assign') return post(`/delivery/orders/${id}/assign`, { driverId, departAt: fromLocalInput(when) });
      if (m!.kind === 'reassign') return post(`/delivery/orders/${id}/reassign`, { driverId });
      return post(`/delivery/orders/${id}/reschedule`, { deliveryAt: fromLocalInput(when) });
    },
    onSuccess: () => { toast(m!.kind === 'assign' ? t('Driver assigned. Customer notified that the order is on the way.') : m!.kind === 'reassign' ? t('Reassigned. Both drivers notified.') : t('Delivery rescheduled')); setM(null); qc.invalidateQueries(); },
  });
  const open = (kind: 'assign' | 'reassign' | 'reschedule', order: any) => { act.reset(); setDriverId(''); setWhen(toLocalInput(kind === 'reschedule' ? new Date(Date.now() + 3600_000) : new Date())); setM({ kind, order }); };
  const deny = denied(board);
  if (deny) return deny;
  const tl = dash.data?.tiles;

  return (
    <div>
      <PageHeader title={t('Dispatch')} subtitle={t('Assign drivers to ready orders and follow every delivery.')} />
      {tl && (
        <TileRow>
          <KpiTile label={t('Ready for dispatch')} value={tl.ready} tone="orange" icon={<Package />} />
          <KpiTile label={t('Out for delivery')} value={tl.out} tone="blue" icon={<Truck />} />
          <KpiTile label={t('Failed deliveries')} value={tl.failed} tone="red" icon={<AlertTriangle />} />
          <KpiTile label={t('Delivered today')} value={tl.delivered_today} tone="green" icon={<CheckCircle2 />} />
          <KpiTile label={t('Drivers available')} value={`${tl.availableDrivers} / ${tl.drivers}`} tone="navy" icon={<UserCheck />} />
        </TileRow>
      )}
      <Q q={board}>{(b: any) => {
        const avail = b.drivers.filter((d: any) => d.status === 'AVAILABLE');
        const col = (st: string) => b.orders.filter((o: any) => o.status === st);
        const OrderCard = ({ o }: { o: any }) => (
          <div className="card p-3.5">
            <div className="flex justify-between gap-2"><div><div className="font-bold text-ink">{o.number}</div><div className="text-xs text-ink-3">{o.customer} · {o.units} {t('units')}</div></div>
              <div className="text-end"><div className="font-bold text-sm">{time(o.deliveryAt)}</div><StatusBadge status={o.status} delayed={o.isDelayed} /></div></div>
            <div className="text-xs text-ink-3 mt-2 flex gap-1.5"><MapPin size={13} className="shrink-0 mt-0.5" />{o.addressText}</div>
            <div className="text-xs text-ink-3 mt-1 flex gap-1.5"><Phone size={13} className="shrink-0 mt-0.5" />{o.contactName} · {o.contactPhone}</div>
            {o.lastDelivery && <div className="text-xs mt-2 rounded bg-canvas px-2 py-1">{t('Driver')}: <b>{o.lastDelivery.driverName}</b>{o.lastDelivery.failureReason && o.status === 'DELIVERY_FAILED' && <span className="text-bad"> · {o.lastDelivery.failureReason}</span>}</div>}
            <div className="flex justify-end mt-3">
              {o.status === 'READY_FOR_DISPATCH' && <button className="btn-primary btn-sm" onClick={() => open('assign', o)}><Truck size={14} />{t('Assign driver')}</button>}
              {o.status === 'OUT_FOR_DELIVERY' && <button className="btn-secondary btn-sm" onClick={() => open('reassign', o)}>{t('Reassign')}</button>}
              {o.status === 'DELIVERY_FAILED' && <button className="btn-danger btn-sm" onClick={() => open('reschedule', o)}>{t('Reschedule')}</button>}
            </div>
          </div>
        );
        return (
          <>
            {avail.length === 0 && col('READY_FOR_DISPATCH').length > 0 && (
              <div className="mb-4 rounded-lg bg-warn-bg text-warn px-4 py-3 text-sm font-semibold flex gap-2"><AlertTriangle size={18} />{t('No driver is available right now. Ready orders wait until a driver is free.')}</div>
            )}
            <div className="grid xl:grid-cols-[1fr_1fr_1fr_300px] lg:grid-cols-3 gap-4 items-start">
              {[['READY_FOR_DISPATCH', 'Ready for dispatch'], ['OUT_FOR_DELIVERY', 'Out for delivery'], ['DELIVERY_FAILED', 'Failed - to reschedule']].map(([st, label]) => (
                <div key={st}>
                  <h2 className="font-bold text-ink mb-3 text-sm uppercase tracking-wide">{t(label)} <span className="text-ink-4">({col(st).length})</span></h2>
                  <div className="space-y-3">{col(st).map((o: any) => <OrderCard key={o.id} o={o} />)}{!col(st).length && <div className="card"><Empty text={t('Nothing here right now.')} /></div>}</div>
                </div>
              ))}
              <Card title={t('Drivers today')} className="lg:col-span-3 xl:col-span-1">
                <ul className="space-y-2.5">
                  {b.drivers.map((d: any) => (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <div><div className="text-sm font-semibold text-ink">{d.name}</div><div className="text-[11px] text-ink-4">{d.today.done}/{d.today.total} {t('deliveries today')}</div></div>
                      <StatusBadge status={d.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
            <Modal open={!!m} onClose={() => setM(null)} title={m ? `${t(m.kind === 'assign' ? 'Assign driver' : m.kind === 'reassign' ? 'Reassign' : 'Reschedule')}: ${m.order.number}` : ''} footer={<>
              <button className="btn-secondary" onClick={() => setM(null)}>{t('Close')}</button>
              <button className="btn-primary" disabled={act.isPending || (m?.kind !== 'reschedule' && !driverId)} onClick={() => act.mutate()}>{t('Save')}</button>
            </>}>
              {m && m.kind !== 'reschedule' && (
                <Field label={t('Driver')} hint={t('Only available drivers can be assigned (BR-03).')}>
                  <select className="input" value={driverId} onChange={(e) => setDriverId(Number(e.target.value) || '')}>
                    <option value="">{t('Choose a driver')}</option>
                    {b.drivers.map((d: any) => <option key={d.id} value={d.id} disabled={d.status !== 'AVAILABLE'}>{d.name} - {t(d.status === 'AVAILABLE' ? 'Available' : d.status === 'ON_DELIVERY' ? 'On delivery' : 'Off duty')}</option>)}
                  </select>
                </Field>
              )}
              {m && m.kind !== 'reassign' && <Field label={m.kind === 'assign' ? t('Departure time') : t('New delivery time')}><input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>}
              {m && <p className="text-xs text-ink-4">{t('Delivery time')}: {dateTime(m.order.deliveryAt)}</p>}
              <div className="mt-3"><ErrorBox error={act.error} /></div>
            </Modal>
          </>
        );
      }}</Q>
    </div>
  );
}
