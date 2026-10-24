import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, MapPin, Navigation, Phone, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, post } from '../api';
import { Empty, ErrorBox, Field, Modal, Q, StatusBadge, useToast, denied } from '../components/ui';
import { time } from '../format';

const REASONS = ['Customer not reachable', 'Reception closed', 'Wrong address', 'Customer refused the order', 'Vehicle problem'];

/** Driver View - phone first. Only the driver's own deliveries; no prices (FR-38, BR-12, BR-35). */
export default function Driver() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const mine = useQuery({ queryKey: ['my-deliveries'], queryFn: () => api('/delivery/mine'), refetchInterval: 15_000 });
  const dash = useQuery({ queryKey: ['dash-me'], queryFn: () => api('/dashboard/me'), refetchInterval: 15_000 });
  const [m, setM] = useState<null | { kind: 'done' | 'fail'; d: any }>(null);
  const [recipient, setRecipient] = useState('');
  const [proof, setProof] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [other, setOther] = useState('');
  const act = useMutation({
    mutationFn: () => m!.kind === 'done' ? post(`/delivery/${m!.d.id}/complete`, { recipientName: recipient, proofNote: proof }) : post(`/delivery/${m!.d.id}/fail`, { reason: other ? `${reason}: ${other}` : reason }),
    onSuccess: () => { toast(m!.kind === 'done' ? t('Delivered. Customer notified.') : t('Failure recorded. Delivery Manager notified.'), m!.kind === 'done' ? 'ok' : 'info'); setM(null); qc.invalidateQueries(); },
  });
  const status = useMutation({ mutationFn: (s: string) => post('/delivery/mine/status', { status: s }), onSuccess: () => qc.invalidateQueries(), onError: (e: any) => toast(e.message, 'bad') });

  const deny = denied(mine);
  if (deny) return deny;
  const st = dash.data?.tiles?.status;
  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-xl font-bold">{t('My Deliveries')}</h1>
          <p className="text-sm text-ink-3">{dash.data ? `${dash.data.tiles.assigned} ${t('assigned')} · ${dash.data.tiles.delivered_today} ${t('delivered today')}` : ''}</p></div>
        {st && <button className={`btn-sm btn ${st === 'AVAILABLE' ? 'bg-ok text-white' : st === 'ON_DELIVERY' ? 'bg-brand-500 text-white' : 'bg-slate-200 text-ink-2'}`} disabled={st === 'ON_DELIVERY' || status.isPending}
          onClick={() => status.mutate(st === 'AVAILABLE' ? 'OFF_DUTY' : 'AVAILABLE')}>{t(st === 'AVAILABLE' ? 'Available' : st === 'ON_DELIVERY' ? 'On delivery' : 'Off duty')}</button>}
      </div>
      <Q q={mine}>{(rows: any[]) => {
        const active = rows.filter((r) => r.status === 'ASSIGNED');
        const closed = rows.filter((r) => r.status !== 'ASSIGNED');
        return (
          <>
            {!active.length && <div className="card"><Empty text={t('No deliveries assigned to you right now.')} icon={<Navigation />} /></div>}
            <div className="space-y-4">
              {active.map((d) => (
                <div key={d.id} className="card overflow-hidden">
                  <div className="bg-brand-500 text-white px-4 py-2.5 flex justify-between items-center"><span className="font-bold">{d.order.number}</span><span className="flex items-center gap-1 text-sm font-semibold"><Clock size={15} />{time(d.order.deliveryAt)}</span></div>
                  <div className="p-4 space-y-3">
                    <a className="flex gap-3 items-start" href={`https://maps.google.com/?q=${encodeURIComponent(d.order.addressText)}`} target="_blank" rel="noreferrer">
                      <MapPin className="text-brand-500 shrink-0" size={20} /><span className="text-[15px] text-ink font-medium">{d.order.addressText}</span></a>
                    <a className="flex gap-3 items-center" href={`tel:${d.order.contactPhone}`}><Phone className="text-brand-500 shrink-0" size={20} /><span className="text-[15px]">{d.order.contactName} · <span className="text-brand-600 font-semibold">{d.order.contactPhone}</span></span></a>
                    <ul className="text-sm text-ink-3 bg-canvas rounded-lg p-3">{d.items.map((i: any, k: number) => <li key={k}>{i.qty} × {i.name}</li>)}</ul>
                    {d.order.notes && <p className="text-sm text-ink-3">{t('Notes')}: {d.order.notes}</p>}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button className="btn-success py-3 text-base" onClick={() => { act.reset(); setRecipient(d.order.contactName); setProof(''); setM({ kind: 'done', d }); }}><CheckCircle2 size={19} />{t('Delivered')}</button>
                      <button className="btn-danger py-3 text-base" onClick={() => { act.reset(); setOther(''); setReason(REASONS[0]); setM({ kind: 'fail', d }); }}><XCircle size={19} />{t('Failed')}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {closed.length > 0 && (
              <div className="mt-6"><h2 className="text-sm font-bold text-ink-3 uppercase mb-2">{t('Today')}</h2>
                <div className="card divide-y divide-line/70">{closed.map((d) => (
                  <div key={d.id} className="flex justify-between items-center px-4 py-3 text-sm"><div><div className="font-semibold">{d.order.number}</div><div className="text-xs text-ink-4">{d.recipientName ?? d.failureReason}</div></div><StatusBadge status={d.status} /></div>
                ))}</div></div>
            )}
          </>
        );
      }}</Q>
      <Modal open={!!m} onClose={() => setM(null)} title={m?.kind === 'done' ? t('Proof of delivery') : t('Delivery failed')} footer={<>
        <button className="btn-secondary" onClick={() => setM(null)}>{t('Close')}</button>
        <button className={m?.kind === 'done' ? 'btn-success' : 'btn-danger'} disabled={act.isPending || (m?.kind === 'done' && !recipient.trim())} onClick={() => act.mutate()}>{t('Save')}</button>
      </>}>
        {m?.kind === 'done' ? (
          <>
            <Field label={t('Received by')}><input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></Field>
            <Field label={t('Note (optional)')} hint={t('Delivery time is recorded automatically.')}><input className="input" value={proof} onChange={(e) => setProof(e.target.value)} placeholder={t('e.g. left with reception, 3 boxes')} /></Field>
          </>
        ) : (
          <>
            <Field label={t('Reason')}><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></Field>
            <Field label={t('Details (optional)')}><input className="input" value={other} onChange={(e) => setOther(e.target.value)} /></Field>
          </>
        )}
        <ErrorBox error={act.error} />
      </Modal>
    </div>
  );
}
