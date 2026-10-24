import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, Boxes, CalendarX, Lock, PackagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, post } from '../api';
import { useAuth } from '../auth';
import { Card, ErrorBox, Field, KpiTile, Modal, PageHeader, Q, Tabs, Tag, TileRow, useToast, denied } from '../components/ui';
import { date, dateTime, money, num } from '../format';

/** Inventory Manager: stock levels, batches & expiry, reservations, movements (FR-39, FR-67 to FR-71). */
export default function Inventory() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'levels' | 'batches' | 'reservations' | 'movements'>('levels');
  const levels = useQuery({ queryKey: ['inv', 'levels'], queryFn: () => api('/inventory/levels') });
  const batches = useQuery({ queryKey: ['inv', 'batches'], queryFn: () => api('/inventory/batches'), enabled: tab === 'batches' });
  const res = useQuery({ queryKey: ['inv', 'res'], queryFn: () => api('/inventory/reservations'), enabled: tab === 'reservations' });
  const mov = useQuery({ queryKey: ['inv', 'mov'], queryFn: () => api('/inventory/movements'), enabled: tab === 'movements' });
  const dash = useQuery({ queryKey: ['dash-me'], queryFn: () => api('/dashboard/me') });
  const [recv, setRecv] = useState<any>(null);
  const [waste, setWaste] = useState<any>(null);
  const exp = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const receive = useMutation({ mutationFn: (b: any) => post('/inventory/receive', b), onSuccess: () => { toast(t('Goods received')); setRecv(null); qc.invalidateQueries(); } });
  const adjust = useMutation({ mutationFn: (b: any) => post('/inventory/adjust', b), onSuccess: () => { toast(t('Stock adjusted')); setWaste(null); qc.invalidateQueries(); } });
  const manage = can('inventory.manage');
  const nm = (x: any) => (i18n.language === 'ar' && x.nameAr ? x.nameAr : x.name);
  const tl = dash.data?.tiles;

  const deny = denied(levels);
  if (deny) return deny;
  return (
    <div>
      <PageHeader title={t('Inventory')} subtitle={t('Ingredient stock, expiry, reservations for confirmed orders and every movement.')}
        actions={manage && <button className="btn-primary" onClick={() => { receive.reset(); setRecv({ ingredientId: '', qty: '', lotNo: '', expiresAt: exp, location: 'Cold room 1' }); }}><PackagePlus size={16} />{t('Receive goods')}</button>} />
      {tl && tl.low !== undefined && (
        <TileRow>
          <KpiTile label={t('Low stock items')} value={tl.low} tone="red" icon={<AlertTriangle />} />
          <KpiTile label={t('Expiring within 3 days')} value={tl.expiring} tone="orange" icon={<CalendarX />} />
          <KpiTile label={t('Items with expired batches')} value={tl.expired} tone="slate" icon={<Archive />} />
          <KpiTile label={t('Orders with reserved stock')} value={tl.reservedOrders} tone="blue" icon={<Lock />} />
          <KpiTile label={t('Stock value')} value={money(tl.stockValue, 0)} tone="navy" icon={<Boxes />} />
        </TileRow>
      )}
      <Tabs tabs={[{ id: 'levels', label: t('Stock levels') }, { id: 'batches', label: t('Batches & expiry') }, { id: 'reservations', label: t('Reservations') }, { id: 'movements', label: t('Movements') }]} value={tab} onChange={setTab} />
      {tab === 'levels' && <Q q={levels}>{(rows: any[]) => (
        <Card pad={false}><div className="overflow-x-auto"><table className="table">
          <thead><tr><th>{t('Ingredient')}</th><th className="text-end">{t('On hand')}</th><th className="text-end">{t('Reserved')}</th><th className="text-end">{t('Available')}</th><th className="text-end">{t('Low-stock level')}</th><th>{t('Next expiry')}</th><th>{t('Supplier')}</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className={r.low ? 'bg-bad-bg/40' : ''}>
              <td className="font-medium text-ink">{nm(r)}</td>
              <td className="text-end tabular-nums">{num(r.onHand, 2)} {r.unit}</td>
              <td className="text-end tabular-nums text-brand-600">{num(r.reserved, 2)}</td>
              <td className={`text-end tabular-nums font-bold ${r.low ? 'text-bad' : 'text-ink'}`}>{num(r.available, 2)}</td>
              <td className="text-end tabular-nums text-ink-4">{num(r.lowStockThreshold, 1)}</td>
              <td className="whitespace-nowrap">{date(r.nextExpiry)}</td>
              <td className="text-xs text-ink-3">{r.supplier}</td>
              <td className="whitespace-nowrap">{r.low && <Tag tone="red">{t('Low stock')}</Tag>} {r.expiringSoon && <Tag tone="orange">{t('Expiring')}</Tag>} {r.expired > 0 && <Tag>{t('Expired')}: {num(r.expired, 1)}</Tag>}</td>
            </tr>
          ))}</tbody></table></div></Card>
      )}</Q>}
      {tab === 'batches' && <Q q={batches}>{(rows: any[]) => (
        <Card pad={false}><div className="overflow-x-auto"><table className="table">
          <thead><tr><th>{t('Ingredient')}</th><th>{t('Lot')}</th><th className="text-end">{t('Quantity')}</th><th>{t('Expires')}</th><th>{t('Location')}</th><th>{t('Received')}</th>{manage && <th></th>}</tr></thead>
          <tbody>{rows.map((b) => (
            <tr key={b.id} className={b.expired ? 'opacity-70' : ''}>
              <td className="font-medium text-ink">{b.name}</td><td className="font-mono text-xs">{b.lotNo}</td><td className="text-end tabular-nums">{num(b.qty, 2)} {b.unit}</td>
              <td>{b.expired ? <Tag tone="red">{t('Expired')} {date(b.expiresAt)}</Tag> : date(b.expiresAt)}</td><td>{b.location}</td><td className="text-xs text-ink-4">{date(b.receivedAt)}</td>
              {manage && <td><button className="btn-ghost btn-sm text-bad" onClick={() => { adjust.reset(); setWaste({ batchId: b.id, label: `${b.name} · ${b.lotNo}`, max: b.qty, qty: b.expired ? b.qty : '', type: 'WASTE', note: b.expired ? 'Expired batch disposed' : '' }); }}><Trash2 size={14} />{t('Waste')}</button></td>}
            </tr>
          ))}</tbody></table></div>
          <p className="text-xs text-ink-4 p-3">{t('Expired batches are never allocated to production (BR-25). Ingredients are issued earliest-expiry first.')}</p></Card>
      )}</Q>}
      {tab === 'reservations' && <Q q={res}>{(rows: any[]) => (
        <Card pad={false}><table className="table"><thead><tr><th>{t('Order')}</th><th>{t('For')}</th><th>{t('Ingredient')}</th><th className="text-end">{t('Reserved')}</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td className="font-semibold text-brand-600">{r.orderNumber}</td><td>{dateTime(r.forDate)}</td><td>{r.name}</td><td className="text-end tabular-nums">{num(r.qty, 3)} {r.unit}</td></tr>)}</tbody></table></Card>
      )}</Q>}
      {tab === 'movements' && <Q q={mov}>{(rows: any[]) => (
        <Card pad={false}><div className="overflow-x-auto"><table className="table"><thead><tr><th>{t('Time')}</th><th>{t('Type')}</th><th>{t('Ingredient')}</th><th className="text-end">{t('Quantity')}</th><th>{t('Note')}</th><th>{t('By')}</th></tr></thead>
          <tbody>{rows.map((m) => (
            <tr key={m.id}><td className="whitespace-nowrap text-xs">{dateTime(m.createdAt)}</td>
              <td><Tag tone={({ RECEIPT: 'green', RESERVE: 'blue', RELEASE: 'slate', ISSUE: 'orange', WASTE: 'red', ADJUST: 'slate' } as const)[m.type as 'RECEIPT']}>{t(m.type)}</Tag></td>
              <td>{m.name}</td><td className="text-end tabular-nums">{num(m.qty, 3)} {m.unit}</td><td className="text-xs text-ink-3">{m.note}</td><td className="text-xs">{m.userName}</td></tr>
          ))}</tbody></table></div></Card>
      )}</Q>}

      <Modal open={!!recv} onClose={() => setRecv(null)} title={t('Receive goods')} footer={<>
        <button className="btn-secondary" onClick={() => setRecv(null)}>{t('Close')}</button>
        <button className="btn-primary" disabled={receive.isPending || !recv?.ingredientId || !recv?.qty || !recv?.lotNo} onClick={() => receive.mutate({ ...recv, ingredientId: Number(recv.ingredientId), qty: Number(recv.qty), expiresAt: new Date(recv.expiresAt).toISOString() })}>{t('Save')}</button>
      </>}>
        {recv && <>
          <Field label={t('Ingredient')}><select className="input" value={recv.ingredientId} onChange={(e) => setRecv({ ...recv, ingredientId: e.target.value })}><option value="">{t('Choose')}</option>{levels.data?.map((l: any) => <option key={l.id} value={l.id}>{nm(l)} ({l.unit})</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Quantity')}><input className="input" type="number" step="0.01" value={recv.qty} onChange={(e) => setRecv({ ...recv, qty: e.target.value })} /></Field>
            <Field label={t('Lot number')}><input className="input" value={recv.lotNo} onChange={(e) => setRecv({ ...recv, lotNo: e.target.value })} /></Field>
            <Field label={t('Expiry date')}><input className="input" type="date" value={recv.expiresAt} onChange={(e) => setRecv({ ...recv, expiresAt: e.target.value })} /></Field>
            <Field label={t('Location')}><input className="input" value={recv.location} onChange={(e) => setRecv({ ...recv, location: e.target.value })} /></Field>
          </div>
          <ErrorBox error={receive.error} />
        </>}
      </Modal>
      <Modal open={!!waste} onClose={() => setWaste(null)} title={`${t('Record waste')}: ${waste?.label ?? ''}`} footer={<>
        <button className="btn-secondary" onClick={() => setWaste(null)}>{t('Close')}</button>
        <button className="btn-danger" disabled={adjust.isPending || !waste?.qty} onClick={() => adjust.mutate({ batchId: waste.batchId, qty: Number(waste.qty), type: waste.type, note: waste.note })}>{t('Save')}</button>
      </>}>
        {waste && <>
          <Field label={`${t('Quantity')} (${t('max')} ${num(waste.max, 3)})`}><input className="input" type="number" step="0.001" value={waste.qty} onChange={(e) => setWaste({ ...waste, qty: e.target.value })} /></Field>
          <Field label={t('Type')}><select className="input" value={waste.type} onChange={(e) => setWaste({ ...waste, type: e.target.value })}><option value="WASTE">{t('Waste')}</option><option value="ADJUST">{t('Count correction')}</option></select></Field>
          <Field label={t('Note')}><input className="input" value={waste.note} onChange={(e) => setWaste({ ...waste, note: e.target.value })} /></Field>
          <ErrorBox error={adjust.error} />
        </>}
      </Modal>
    </div>
  );
}
