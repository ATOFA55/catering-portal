import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChefHat, Flame, Play, Printer, Utensils } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, post } from '../api';
import { Card, Empty, ErrorBox, Field, KpiTile, Modal, PageHeader, Q, StatusBadge, Tabs, TileRow, useToast, denied } from '../components/ui';
import { date, dateTime, num, time } from '../format';

/** Kitchen Dashboard (FR-37, FR-72, FR-93 to FR-95). No prices or payment data (BR-11). */
export default function Kitchen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'board' | 'schedule' | 'done'>('board');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [ready, setReady] = useState<any>(null);
  const [check, setCheck] = useState(false);
  const [note, setNote] = useState('');
  const board = useQuery({ queryKey: ['production', 'board'], queryFn: () => api('/production'), refetchInterval: 15_000 });
  const done = useQuery({ queryKey: ['production', 'done'], queryFn: () => api('/production?status=DONE'), enabled: tab === 'done' });
  const sched = useQuery({ queryKey: ['production', 'schedule', day], queryFn: () => api(`/production/schedule?date=${day}`), enabled: tab === 'schedule' });
  const dash = useQuery({ queryKey: ['dash-me'], queryFn: () => api('/dashboard/me'), refetchInterval: 15_000 });
  const start = useMutation({ mutationFn: (id: number) => post(`/production/${id}/start`), onSuccess: () => { toast(t('Production started. Ingredients issued from stock.')); qc.invalidateQueries(); }, onError: (e: any) => toast(e.message, 'bad') });
  const finish = useMutation({
    mutationFn: () => post(`/production/${ready.id}/ready`, { allergenChecked: check, qualityNote: note }),
    onSuccess: () => { toast(t('Marked Ready for Dispatch. Delivery Manager notified.')); setReady(null); setCheck(false); setNote(''); qc.invalidateQueries(); },
  });

  const Ticket = ({ p }: { p: any }) => (
    <div className={`card p-4 ${p.allergyNotes ? 'border-bad/50' : ''}`}>
      <div className="flex justify-between gap-2">
        <div><div className="font-bold text-ink">{p.orderNumber}</div><div className="text-xs text-ink-3">{p.customer} · {p.type === 'EVENT' ? `${t('Event')} · ${p.guestCount} ${t('guests')}` : t('Daily')}</div></div>
        <div className="text-end"><div className="text-sm font-bold text-ink">{time(p.deliveryAt)}</div><div className="text-[11px] text-ink-4">{date(p.deliveryAt)}</div>{p.isDelayed && <span className="chip bg-bad text-white mt-1">{t('Delayed')}</span>}</div>
      </div>
      <ul className="mt-3 divide-y divide-line/60 text-sm">
        {p.items.map((i: any) => <li key={i.name} className="flex justify-between py-1.5"><span>{i.name}</span><span className="font-bold tabular-nums text-ink">{num(i.portions, 1)}</span></li>)}
      </ul>
      {p.allergyNotes && <div className="mt-3 rounded-lg bg-bad text-white text-sm px-3 py-2 font-semibold flex gap-2"><AlertTriangle size={17} className="shrink-0" />{p.allergyNotes}</div>}
      {p.notes && <div className="mt-2 text-xs text-ink-3">{t('Notes')}: {p.notes}</div>}
      <div className="mt-3 flex justify-end">
        {p.status === 'PLANNED' && <button className="btn-primary btn-sm" disabled={start.isPending} onClick={() => start.mutate(p.id)}><Play size={14} />{t('Start preparing')}</button>}
        {p.status === 'IN_PROGRESS' && <button className="btn-success btn-sm" onClick={() => { setReady(p); finish.reset(); }}><CheckCircle2 size={14} />{t('Mark ready for dispatch')}</button>}
      </div>
    </div>
  );

  const deny = denied(board);
  if (deny) return deny;
  const tl = dash.data?.tiles;
  return (
    <div>
      <PageHeader title={t('Kitchen Dashboard')} subtitle={t('Confirmed orders to prepare, with meals, quantities and dietary notes.')} />
      {tl && (
        <TileRow>
          <KpiTile label={t('Orders to prepare')} value={tl.planned} tone="orange" icon={<Utensils />} />
          <KpiTile label={t('In progress')} value={tl.in_progress} tone="blue" icon={<Flame />} />
          <KpiTile label={t('Ready today')} value={tl.done_today} tone="green" icon={<CheckCircle2 />} />
          <KpiTile label={t('With allergy notes')} value={tl.allergy} tone="red" icon={<AlertTriangle />} />
        </TileRow>
      )}
      <Tabs tabs={[{ id: 'board', label: t('Production board') }, { id: 'schedule', label: t('Daily schedule') }, { id: 'done', label: t('Completed') }]} value={tab} onChange={setTab} />
      {tab === 'board' && <Q q={board}>{(rows: any[]) => (
        <div className="grid lg:grid-cols-2 gap-5">
          {(['PLANNED', 'IN_PROGRESS'] as const).map((st) => (
            <div key={st}>
              <h2 className="font-bold text-ink mb-3 flex items-center gap-2"><StatusBadge status={st} /><span className="text-ink-4 text-sm">{rows.filter((r) => r.status === st).length}</span></h2>
              <div className="space-y-3">{rows.filter((r) => r.status === st).map((p) => <Ticket key={p.id} p={p} />)}
                {!rows.some((r) => r.status === st) && <div className="card"><Empty text={t('Nothing here right now.')} icon={<ChefHat />} /></div>}</div>
            </div>
          ))}
        </div>
      )}</Q>}
      {tab === 'schedule' && (
        <Card title={`${t('Production schedule')} · ${date(day)}`} actions={<><input type="date" className="input py-1 w-auto" value={day} onChange={(e) => setDay(e.target.value)} /><button className="btn-secondary btn-sm" onClick={() => window.print()}><Printer size={14} />{t('Print')}</button></>}>
          <Q q={sched}>{(s: any) => s.dishes.length === 0 ? <Empty text={t('No production planned for this day.')} /> : (
            <table className="table"><thead><tr><th>{t('Dish')}</th><th className="text-end">{t('Portions')}</th><th className="text-end">{t('Orders')}</th></tr></thead>
              <tbody>{s.dishes.map((d: any) => <tr key={d.name}><td className="font-medium text-ink">{d.name}</td><td className="text-end tabular-nums font-bold">{num(d.portions, 1)}</td><td className="text-end tabular-nums">{d.orders}</td></tr>)}</tbody></table>
          )}</Q>
          <Q q={board}>{(rows: any[]) => (
            <div className="mt-6">
              <h3 className="font-bold text-sm mb-2">{t('Packing labels')}</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {rows.filter((r) => r.deliveryAt.slice(0, 10) === day).map((r) => (
                  <div key={r.id} className="border-2 border-dashed border-line rounded-lg p-3 text-sm">
                    <div className="font-bold text-ink">{r.orderNumber} · {time(r.deliveryAt)}</div><div className="text-xs text-ink-3">{r.customer}</div>
                    <div className="text-xs mt-1">{r.items.map((i: any) => `${i.name} × ${num(i.portions, 1)}`).join(', ')}</div>
                    {r.allergyNotes && <div className="text-xs font-bold text-bad mt-1">⚠ {r.allergyNotes}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}</Q>
        </Card>
      )}
      {tab === 'done' && <Q q={done}>{(rows: any[]) => (
        <Card pad={false}><table className="table"><thead><tr><th>{t('Order')}</th><th>{t('Delivery')}</th><th>{t('Completed')}</th><th>{t('Items')}</th></tr></thead>
          <tbody>{rows.map((p) => <tr key={p.id}><td className="font-semibold">{p.orderNumber}</td><td>{dateTime(p.deliveryAt)}</td><td>{dateTime(p.completedAt)}</td><td className="text-xs text-ink-3">{p.items.map((i: any) => `${i.name} × ${num(i.portions, 1)}`).join(', ')}</td></tr>)}</tbody></table>
          {!rows.length && <Empty text={t('Nothing here right now.')} />}</Card>
      )}</Q>}

      <Modal open={!!ready} onClose={() => setReady(null)} title={`${t('Ready for dispatch')}: ${ready?.orderNumber ?? ''}`} footer={<>
        <button className="btn-secondary" onClick={() => setReady(null)}>{t('Close')}</button>
        <button className="btn-success" disabled={finish.isPending} onClick={() => finish.mutate()}>{t('Confirm quality check')}</button>
      </>}>
        {ready?.allergyNotes && (
          <label className="flex gap-3 items-start rounded-lg bg-bad-bg p-3 mb-4 cursor-pointer">
            <input type="checkbox" className="mt-1 w-4 h-4" checked={check} onChange={(e) => setCheck(e.target.checked)} />
            <span className="text-sm"><b className="text-bad">{t('Allergen check')}:</b> {ready.allergyNotes}<span className="block text-xs text-ink-3 mt-1">{t('Required before dispatch (BR-32).')}</span></span>
          </label>
        )}
        <Field label={t('Quality note (optional)')}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. temperature 72°C, packed in insulated boxes')} /></Field>
        <ErrorBox error={finish.error} />
      </Modal>
    </div>
  );
}
