import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Ban, CalendarClock, Check, CheckCircle2, Clock, FileText, MapPin, Phone, RefreshCw, Send, Star, Truck, X } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, post } from '../api';
import { useAuth } from '../auth';
import { Card, ErrorBox, Field, Modal, PageHeader, Q, StatusBadge, Tag, useToast } from '../components/ui';
import { dateTime, fromLocalInput, money, toLocalInput } from '../format';

const FLOW = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const FLOW_LABEL: Record<string, string> = { PENDING: 'Submitted', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', READY_FOR_DISPATCH: 'Ready', OUT_FOR_DELIVERY: 'On the way', DELIVERED: 'Delivered' };

function Progress({ status }: { status: string }) {
  const { t } = useTranslation();
  const idx = status === 'AWAITING_CUSTOMER_APPROVAL' ? 0 : status === 'DELIVERY_FAILED' ? 4 : FLOW.indexOf(status);
  if (status === 'CANCELLED' || status === 'DRAFT') return null;
  return (
    <ol className="grid grid-cols-6 gap-1 mb-5">
      {FLOW.map((s, i) => (
        <li key={s} className="flex flex-col items-center text-center">
          <div className="flex items-center w-full">
            <span className={`h-1 flex-1 ${i === 0 ? 'invisible' : i <= idx ? 'bg-brand-500' : 'bg-line'}`} />
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i < idx || (i === idx && status === 'DELIVERED') ? 'bg-brand-500 text-white' : i === idx ? (status === 'DELIVERY_FAILED' ? 'bg-bad text-white' : 'bg-white border-2 border-brand-500 text-brand-600') : 'bg-white border border-line text-ink-4'}`}>
              {i < idx || (i === idx && status === 'DELIVERED') ? <Check size={15} /> : i + 1}
            </span>
            <span className={`h-1 flex-1 ${i === FLOW.length - 1 ? 'invisible' : i < idx ? 'bg-brand-500' : 'bg-line'}`} />
          </div>
          <span className={`text-[11px] mt-1.5 font-semibold ${i <= idx ? 'text-ink' : 'text-ink-4'}`}>{t(FLOW_LABEL[s])}</span>
        </li>
      ))}
    </ol>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { me, can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api(`/orders/${id}`) });
  const [modal, setModal] = useState<null | 'change' | 'delay' | 'cancel' | 'rate'>(null);
  const [err, setErr] = useState<unknown>(null);

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; ok: string }) => post(`/orders/${id}/${path}`, body ?? {}),
    onSuccess: (_d, v) => { toast(v.ok); setModal(null); setErr(null); qc.invalidateQueries(); },
    onError: (e) => setErr(e),
  });
  const ar = i18n.language === 'ar';

  return (
    <Q q={q}>{(o: any) => {
      const isOwner = o.customerId === me?.id;
      const manager = can('orders.manage');
      const pc = o.pendingChange;
      return (
        <div>
          <Link to={isOwner ? '/my-orders' : '/orders'} className="inline-flex items-center gap-1 text-sm text-brand-600 font-semibold mb-3 no-print"><ArrowLeft size={15} className="rtl:rotate-180" />{t('Back to orders')}</Link>
          <PageHeader title={`${t('Order')} ${o.number}`}
            subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={o.status} delayed={o.isDelayed} />{o.isDelayed && o.delayedUntil && <span className="text-bad text-xs font-semibold">{t('New expected time')}: {dateTime(o.delayedUntil)}</span>}<span>· {o.customer.company ?? o.customer.name}</span></span>}
            actions={<>
              {manager && o.status === 'PENDING' && <button className="btn-success" disabled={act.isPending} onClick={() => act.mutate({ path: 'confirm', ok: t('Order confirmed. Stock reserved and production order created.') })}><CheckCircle2 size={16} />{t('Confirm order')}</button>}
              {manager && o.status === 'PENDING' && <button className="btn-secondary" onClick={() => setModal('change')}><CalendarClock size={16} />{t('Change time or price')}</button>}
              {manager && !['DELIVERED', 'CANCELLED', 'DRAFT'].includes(o.status) && <button className="btn-secondary" onClick={() => setModal('delay')}><Clock size={16} />{o.isDelayed ? t('Update delay') : t('Flag as delayed')}</button>}
              {isOwner && o.status === 'DRAFT' && <button className="btn-primary" disabled={act.isPending} onClick={() => act.mutate({ path: 'submit', ok: t('Order submitted') })}><Send size={16} />{t('Submit order')}</button>}
              {o.canRate && <button className="btn-primary" onClick={() => setModal('rate')}><Star size={16} />{t('Rate this order')}</button>}
              {isOwner && ['DELIVERED', 'CANCELLED'].includes(o.status) && <button className="btn-secondary" onClick={() => nav(`/order/new?reorder=${o.id}`)}><RefreshCw size={16} />{t('Order again')}</button>}
              {o.canCancel && <button className="btn-secondary text-bad" onClick={() => setModal('cancel')}><Ban size={16} />{t('Cancel order')}</button>}
              <button className="btn-secondary" onClick={() => window.print()}><FileText size={16} />{t('Print')}</button>
            </>} />
          {!!err && !modal && <div className="mb-4"><ErrorBox error={err} /></div>}

          {o.status === 'AWAITING_CUSTOMER_APPROVAL' && pc && (
            <div className="card border-warn/40 bg-warn-bg p-4 mb-5 flex flex-wrap items-center gap-4 justify-between">
              <div className="flex gap-3">
                <AlertTriangle className="text-warn shrink-0" />
                <div>
                  <div className="font-bold text-ink">{isOwner ? t('Please approve a change to your order') : t('Waiting for the customer to approve a change')}</div>
                  <div className="text-sm text-ink-2 mt-1">{pc.reason}</div>
                  <ul className="text-sm mt-1 text-ink-2">
                    {pc.deliveryAt && <li>{t('New delivery time')}: <b>{dateTime(pc.deliveryAt)}</b> ({t('was')} {dateTime(o.deliveryAt)})</li>}
                    {pc.discount && <li>{t('Discount')}: <b>{money(pc.discount)}</b></li>}
                  </ul>
                </div>
              </div>
              {isOwner && (
                <div className="flex gap-2">
                  <button className="btn-success" disabled={act.isPending} onClick={() => act.mutate({ path: 'respond-change', body: { approve: true }, ok: t('Change approved') })}><Check size={16} />{t('Approve')}</button>
                  <button className="btn-danger" disabled={act.isPending} onClick={() => confirm(t('Rejecting the change cancels the order. Continue?')) && act.mutate({ path: 'respond-change', body: { approve: false }, ok: t('Change rejected') })}><X size={16} />{t('Reject')}</button>
                </div>
              )}
            </div>
          )}

          <Progress status={o.status} />

          <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
            <div className="space-y-5 min-w-0">
              <Card title={t('Items')} pad={false}>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>{t('Item')}</th><th className="text-end">{t('Qty')}</th><th className="text-end">{t('Unit price')}</th><th className="text-end">{t('Line total')}</th></tr></thead>
                    <tbody>
                      {o.lines.map((l: any) => (
                        <tr key={l.id}>
                          <td><div className="font-medium text-ink">{ar ? l.productNameAr : l.productName}</div>
                            {l.customizations.map((c: any) => <div key={c.id} className="text-xs text-ink-3">↳ {c.label} × {c.qty}{c.priceDelta ? ` (${c.priceDelta > 0 ? '+' : ''}${money(c.priceDelta)} ${t('each')})` : ''}</div>)}</td>
                          <td className="text-end tabular-nums whitespace-nowrap">{l.qty} {t(l.unit)}</td>
                          <td className="text-end tabular-nums">{money(l.unitPrice)}</td>
                          <td className="text-end tabular-nums font-medium">{money(l.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <dl className="p-4 text-sm space-y-1.5 max-w-xs ms-auto">
                  <Row k={t('Subtotal')} v={money(o.subtotal)} />
                  <Row k={t('Delivery')} v={money(o.deliveryFee)} />
                  {o.serviceFee > 0 && <Row k={t('Service fee')} v={money(o.serviceFee)} />}
                  {o.discount > 0 && <Row k={t('Discount')} v={`− ${money(o.discount)}`} />}
                  <Row k={t('Tax')} v={money(o.tax)} />
                  <div className="flex justify-between pt-2 border-t border-line font-bold text-ink"><span>{t('Total')}</span><span className="tabular-nums">{money(o.total)}</span></div>
                  <p className="text-[11px] text-ink-4 pt-1">{t('Prices are fixed when the order is placed. Later catalog changes do not affect this order.')}</p>
                </dl>
              </Card>

              <Card title={t('Order history')}>
                <ol className="relative border-s-2 border-line ms-2 space-y-4">
                  {o.history.slice().reverse().map((h: any) => (
                    <li key={h.id} className="ms-4">
                      <span className="absolute -start-[7px] w-3 h-3 rounded-full bg-brand-500 ring-4 ring-white" />
                      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={h.toStatus} /><span className="text-xs text-ink-4">{dateTime(h.createdAt)}</span>{h.userName && <span className="text-xs text-ink-3">· {h.userName}</span>}</div>
                      {h.comment && <div className="text-sm text-ink-2 mt-0.5">{h.comment}</div>}
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            <div className="space-y-5">
              <Card title={o.type === 'EVENT' ? t('Event details') : t('Delivery details')}>
                <ul className="space-y-2.5 text-sm">
                  <Info icon={<CalendarClock size={16} />} k={o.type === 'EVENT' ? t('Service starts') : t('Delivery time')} v={dateTime(o.deliveryAt)} />
                  {o.type === 'EVENT' && <Info icon={<CalendarClock size={16} />} k={t('Setup time')} v={dateTime(o.setupAt)} />}
                  {o.type === 'EVENT' && <Info icon={<MapPin size={16} />} k={t('Event location')} v={`${o.eventLocation ?? '—'} · ${o.guestCount} ${t('guests')}`} />}
                  <Info icon={<MapPin size={16} />} k={t('Address')} v={`${o.addressText} (${o.zone?.name})`} />
                  <Info icon={<Phone size={16} />} k={t('Contact')} v={`${o.contactName} · ${o.contactPhone}`} />
                </ul>
                {o.allergyNotes && <div className="mt-3 rounded-lg bg-bad-bg text-bad text-sm px-3 py-2 font-semibold">⚠ {t('Allergy notes')}: {o.allergyNotes}</div>}
                {o.notes && <div className="mt-3 text-sm text-ink-3"><b className="text-ink-2">{t('Notes')}:</b> {o.notes}</div>}
                {o.cancelReason && <div className="mt-3 text-sm text-bad"><b>{t('Cancelled')}:</b> {o.cancelReason}</div>}
                {o.canCancel && o.status === 'CONFIRMED' && isOwner && <p className="text-[11px] text-ink-4 mt-3">{t('Free cancellation until')} {dateTime(o.cancellationCutoff)}</p>}
              </Card>

              {o.deliveries.length > 0 && (
                <Card title={t('Delivery')}>
                  {o.deliveries.map((d: any) => (
                    <div key={d.id} className="text-sm py-2 border-b border-line/60 last:border-0">
                      <div className="flex justify-between items-center"><span className="flex items-center gap-2 font-medium text-ink"><Truck size={15} />{d.driver.name}</span><StatusBadge status={d.status} /></div>
                      {d.recipientName && <div className="text-xs text-ink-3 mt-1">{t('Received by')} {d.recipientName} · {dateTime(d.completedAt)}</div>}
                      {d.proofNote && <div className="text-xs text-ink-3">{d.proofNote}</div>}
                      {d.failureReason && d.status === 'FAILED' && <div className="text-xs text-bad mt-1">{d.failureReason}</div>}
                    </div>
                  ))}
                </Card>
              )}

              {o.production && !isOwner && (
                <Card title={t('Production')}>
                  <div className="flex justify-between text-sm mb-2"><span className="text-ink-3">{t('Status')}</span><StatusBadge status={o.production.status} /></div>
                  <ul className="text-sm space-y-1">{o.production.items.map((i: any) => <li key={i.id} className="flex justify-between"><span>{i.name}</span><span className="tabular-nums text-ink-3">{i.portions}</span></li>)}</ul>
                </Card>
              )}

              {o.invoice && (
                <Card title={t('Invoice')}>
                  <div className="flex justify-between text-sm"><span className="font-semibold text-ink">{o.invoice.number}</span><StatusBadge status={o.invoice.status} /></div>
                  <div className="text-sm text-ink-3 mt-1">{money(o.invoice.amount)} · {t('due')} {dateTime(o.invoice.dueAt)}</div>
                  {o.invoice.payments.map((p: any) => <div key={p.id} className="text-xs text-ok mt-1">✓ {t('Paid')} {money(p.amount)} · {t(p.method)} · {dateTime(p.paidAt)}</div>)}
                </Card>
              )}

              {o.rating && (
                <Card title={t('Customer rating')}>
                  {[['Food', o.rating.food], ['Punctuality', o.rating.punctuality], ['Service', o.rating.service]].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm"><span>{t(k as string)}</span><span className="text-warn">{'★'.repeat(v as number)}<span className="text-line">{'★'.repeat(5 - (v as number))}</span></span></div>
                  ))}
                  {o.rating.comment && <p className="text-sm text-ink-3 mt-2">“{o.rating.comment}”</p>}
                </Card>
              )}
            </div>
          </div>

          <ChangeModal open={modal === 'change'} onClose={() => setModal(null)} order={o} err={err} busy={act.isPending}
            onSubmit={(body) => act.mutate({ path: 'propose-change', body, ok: t('Change sent to the customer for approval') })} />
          <DelayModal open={modal === 'delay'} onClose={() => setModal(null)} order={o} err={err} busy={act.isPending}
            onSubmit={(body) => act.mutate({ path: 'delay', body, ok: body.delayed ? t('Order flagged as delayed; customer notified') : t('Delay flag cleared') })} />
          <CancelModal open={modal === 'cancel'} onClose={() => setModal(null)} err={err} busy={act.isPending}
            onSubmit={(reason) => act.mutate({ path: 'cancel', body: { reason }, ok: t('Order cancelled') })} />
          <RateModal open={modal === 'rate'} onClose={() => setModal(null)} err={err} busy={act.isPending}
            onSubmit={(body) => act.mutate({ path: 'rate', body, ok: t('Thank you for your rating!') })} />
        </div>
      );
    }}</Q>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-3"><span className="text-ink-3">{k}</span><span className="tabular-nums">{v}</span></div>;
const Info = ({ icon, k, v }: { icon: ReactNode; k: string; v: ReactNode }) => (
  <li className="flex gap-2.5"><span className="text-ink-4 mt-0.5">{icon}</span><div><div className="text-[11px] text-ink-4">{k}</div><div className="text-ink">{v}</div></div></li>
);

function ChangeModal({ open, onClose, order, onSubmit, err, busy }: { open: boolean; onClose: () => void; order: any; onSubmit: (b: any) => void; err: unknown; busy: boolean }) {
  const { t } = useTranslation();
  const [at, setAt] = useState(toLocalInput(new Date(order.deliveryAt)));
  const [disc, setDisc] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={t('Propose a change')} footer={<>
      <button className="btn-secondary" onClick={onClose}>{t('Close')}</button>
      <button className="btn-primary" disabled={busy || !reason.trim()} onClick={() => onSubmit({ deliveryAt: at !== toLocalInput(new Date(order.deliveryAt)) ? fromLocalInput(at) : undefined, discountPercent: disc ? Number(disc) : undefined, reason })}>{t('Send to customer')}</button>
    </>}>
      <p className="text-sm text-ink-3 mb-4">{t('The change applies only after the customer approves it. Approval confirms the order.')}</p>
      <Field label={t('New delivery time')}><input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
      <Field label={t('Discount (%)')} hint={t('Order Managers can give up to 10%. Higher discounts need the CEO.')}><input className="input" type="number" min={0} max={100} value={disc} onChange={(e) => setDisc(e.target.value)} /></Field>
      <Field label={t('Reason (shown to the customer)')}><textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('e.g. The 1 pm slot is full; we can deliver at 2 pm')} /></Field>
      <ErrorBox error={err} />
    </Modal>
  );
}

function DelayModal({ open, onClose, order, onSubmit, err, busy }: { open: boolean; onClose: () => void; order: any; onSubmit: (b: any) => void; err: unknown; busy: boolean }) {
  const { t } = useTranslation();
  const [at, setAt] = useState(toLocalInput(new Date(Math.max(Date.now(), new Date(order.deliveryAt).getTime()) + 3600_000)));
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={t('Flag as delayed')} footer={<>
      {order.isDelayed && <button className="btn-secondary me-auto" disabled={busy} onClick={() => onSubmit({ delayed: false })}>{t('Clear delay')}</button>}
      <button className="btn-secondary" onClick={onClose}>{t('Close')}</button>
      <button className="btn-danger" disabled={busy} onClick={() => onSubmit({ delayed: true, delayedUntil: fromLocalInput(at), reason })}>{t('Flag and notify customer')}</button>
    </>}>
      <p className="text-sm text-ink-3 mb-4">{t('Delayed is a flag on top of the current status. The customer sees the new expected time.')}</p>
      <Field label={t('New expected time')}><input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
      <Field label={t('Reason')}><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorBox error={err} />
    </Modal>
  );
}

function CancelModal({ open, onClose, onSubmit, err, busy }: { open: boolean; onClose: () => void; onSubmit: (r: string) => void; err: unknown; busy: boolean }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={t('Cancel order')} footer={<>
      <button className="btn-secondary" onClick={onClose}>{t('Keep order')}</button>
      <button className="btn-danger" disabled={busy} onClick={() => onSubmit(reason)}>{t('Cancel order')}</button>
    </>}>
      <p className="text-sm text-ink-3 mb-4">{t('Reserved ingredients are released. If you already paid, a refund request goes to our accountant.')}</p>
      <Field label={t('Reason')}><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorBox error={err} />
    </Modal>
  );
}

function RateModal({ open, onClose, onSubmit, err, busy }: { open: boolean; onClose: () => void; onSubmit: (b: any) => void; err: unknown; busy: boolean }) {
  const { t } = useTranslation();
  const [r, setR] = useState({ food: 5, punctuality: 5, service: 5 });
  const [comment, setComment] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={t('Rate this order')} footer={<>
      <button className="btn-secondary" onClick={onClose}>{t('Close')}</button>
      <button className="btn-primary" disabled={busy} onClick={() => onSubmit({ ...r, comment })}>{t('Send rating')}</button>
    </>}>
      {(['food', 'punctuality', 'service'] as const).map((k) => (
        <div key={k} className="flex items-center justify-between py-2">
          <span className="text-sm font-medium">{t(k[0].toUpperCase() + k.slice(1))}</span>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n}`} onClick={() => setR({ ...r, [k]: n })} className={`text-2xl leading-none ${n <= r[k] ? 'text-warn' : 'text-line'}`}>★</button>
          ))}</div>
        </div>
      ))}
      <Field label={t('Comment')}><textarea className="input" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <Tag tone="blue">{t('Ratings of 2 or less alert the Order Manager to follow up.')}</Tag>
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}
