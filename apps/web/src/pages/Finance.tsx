import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Banknote, Download, FileText, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, post } from '../api';
import { useAuth } from '../auth';
import { Card, Empty, ErrorBox, Field, KpiTile, Modal, PageHeader, Q, StatusBadge, TileRow, useToast, denied } from '../components/ui';
import { date, money, num } from '../format';
import { exportXlsx } from '../xlsx';

function InvoiceTable({ rows, onPay, showCustomer }: { rows: any[]; onPay?: (i: any) => void; showCustomer: boolean }) {
  const { t } = useTranslation();
  if (!rows.length) return <Empty text={t('No invoices yet.')} />;
  return (
    <div className="overflow-x-auto"><table className="table">
      <thead><tr><th>{t('Invoice')}</th><th>{t('Order')}</th>{showCustomer && <th>{t('Customer')}</th>}<th>{t('Issued')}</th><th>{t('Due')}</th><th className="text-end">{t('Amount')}</th><th className="text-end">{t('Paid')}</th><th className="text-end">{t('Outstanding')}</th><th>{t('Status')}</th>{onPay && <th></th>}</tr></thead>
      <tbody>{rows.map((i) => (
        <tr key={i.id}>
          <td className="font-semibold text-ink whitespace-nowrap">{i.number}</td>
          <td><Link to={`/orders/${i.orderId}`} className="text-brand-600 font-medium">{i.orderNumber}</Link></td>
          {showCustomer && <td className="text-sm">{i.company ?? i.customer}</td>}
          <td className="whitespace-nowrap text-xs">{date(i.issuedAt)}</td><td className="whitespace-nowrap text-xs">{date(i.dueAt)}</td>
          <td className="text-end tabular-nums">{money(i.amount)}</td><td className="text-end tabular-nums text-ok">{money(i.paid)}</td>
          <td className={`text-end tabular-nums font-bold ${i.outstanding > 0 ? 'text-bad' : 'text-ink-4'}`}>{money(i.outstanding)}</td>
          <td><StatusBadge status={i.status} /></td>
          {onPay && <td>{i.outstanding > 0 && !['CANCELLED', 'REFUNDED'].includes(i.status) && <button className="btn-primary btn-sm" onClick={() => onPay(i)}>{t('Record payment')}</button>}</td>}
        </tr>
      ))}</tbody>
    </table></div>
  );
}

/** Accountant: invoices, payments, outstanding amounts and ageing (FR-40, FR-96 to FR-98). */
export default function Finance() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const summary = useQuery({ queryKey: ['fin-summary'], queryFn: () => api('/finance/summary') });
  const list = useQuery({ queryKey: ['invoices', filter], queryFn: () => api(`/finance/invoices${filter ? `?status=${filter}` : ''}`) });
  const [pay, setPay] = useState<any>(null);
  const record = useMutation({ mutationFn: () => post(`/finance/invoices/${pay.id}/payments`, { amount: Number(pay.amount), method: pay.method, reference: pay.reference }),
    onSuccess: () => { toast(t('Payment recorded. Customer notified.')); setPay(null); qc.invalidateQueries(); } });

  const deny = denied(summary, list);
  if (deny) return deny;
  return (
    <div>
      <PageHeader title={t('Invoices and Payments')} subtitle={t('Follow invoices, record payments and watch outstanding amounts.')}
        actions={<button className="btn-secondary" onClick={() => list.data && exportXlsx('invoices.xlsx', [
          { header: 'Invoice', get: (r: any) => r.number }, { header: 'Order', get: (r: any) => r.orderNumber }, { header: 'Customer', get: (r: any) => r.company ?? r.customer },
          { header: 'Issued', get: (r: any) => new Date(r.issuedAt) }, { header: 'Due', get: (r: any) => new Date(r.dueAt) }, { header: 'Amount', get: (r: any) => r.amount },
          { header: 'Paid', get: (r: any) => r.paid }, { header: 'Outstanding', get: (r: any) => r.outstanding }, { header: 'Status', get: (r: any) => r.status }], list.data)}><Download size={16} />{t('Export Excel')}</button>} />
      <Q q={summary}>{(s: any) => (
        <>
          <TileRow>
            <KpiTile label={t('Invoiced')} value={money(s.invoiced, 0)} tone="blue" icon={<FileText />} />
            <KpiTile label={t('Collected')} value={money(s.collected, 0)} tone="green" icon={<Banknote />} />
            <KpiTile label={t('Outstanding')} value={money(s.outstanding, 0)} sub={`${s.unpaidCount} ${t('invoices')}`} tone="orange" icon={<Wallet />} onClick={() => setFilter('UNPAID,PARTIALLY_PAID,OVERDUE')} />
            <KpiTile label={t('Overdue')} value={money(s.overdue, 0)} sub={`${s.overdueCount} ${t('invoices')}`} tone="red" icon={<AlertTriangle />} onClick={() => setFilter('OVERDUE')} />
          </TileRow>
          <div className="grid lg:grid-cols-2 gap-5 mb-5">
            <Card title={t('Outstanding by age (days)')}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={Object.entries(s.ageing).map(([k, v]) => ({ k, v }))}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E9EE" /><XAxis dataKey="k" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => num(v / 1000) + 'k'} /><Tooltip formatter={(v: number) => money(v)} cursor={{ fill: '#EEF6FB' }} contentStyle={{ borderRadius: 8, fontSize: 12 }} /><Bar dataKey="v" name={t('Outstanding')} fill="#E08E0B" radius={[4, 4, 0, 0]} maxBarSize={48} /></BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title={t('Monthly collections')}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={s.monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E9EE" /><XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => num(v / 1000) + 'k'} /><Tooltip formatter={(v: number) => money(v)} cursor={{ fill: '#EEF6FB' }} contentStyle={{ borderRadius: 8, fontSize: 12 }} /><Bar dataKey="collected" name={t('Collected')} fill="#2E8B57" radius={[4, 4, 0, 0]} maxBarSize={48} /></BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>
      )}</Q>
      <Card title={t('Invoices')} pad={false} actions={
        <select className="input py-1 w-auto text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">{t('All')}</option><option value="UNPAID,PARTIALLY_PAID,OVERDUE">{t('Outstanding')}</option><option value="OVERDUE">{t('Overdue')}</option><option value="PAID">{t('Paid')}</option><option value="CANCELLED">{t('Cancelled')}</option>
        </select>}>
        <Q q={list}>{(rows: any[]) => <InvoiceTable rows={rows} showCustomer onPay={can('finance.manage') ? (i) => { record.reset(); setPay({ ...i, amount: i.outstanding, method: 'BANK_TRANSFER', reference: '' }); } : undefined} />}</Q>
      </Card>
      <Modal open={!!pay} onClose={() => setPay(null)} title={`${t('Record payment')}: ${pay?.number ?? ''}`} footer={<>
        <button className="btn-secondary" onClick={() => setPay(null)}>{t('Close')}</button>
        <button className="btn-primary" disabled={record.isPending} onClick={() => record.mutate()}>{t('Save')}</button>
      </>}>
        {pay && <>
          <p className="text-sm text-ink-3 mb-3">{t('Outstanding')}: <b className="text-ink">{money(pay.outstanding)}</b></p>
          <Field label={t('Amount received')}><input className="input" type="number" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label={t('Method')}><select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="BANK_TRANSFER">{t('Bank transfer')}</option><option value="CASH">{t('Cash')}</option><option value="CARD">{t('Card')}</option></select></Field>
          <Field label={t('Reference')}><input className="input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
          <ErrorBox error={record.error} />
        </>}
      </Modal>
    </div>
  );
}

/** Customer: own invoices only (FR-35). */
export function MyInvoices() {
  const { t } = useTranslation();
  const list = useQuery({ queryKey: ['invoices', 'mine'], queryFn: () => api('/finance/invoices') });
  return (
    <div>
      <PageHeader title={t('My Invoices')} subtitle={t('Your invoices and payments.')} />
      <Card pad={false}><Q q={list}>{(rows: any[]) => <InvoiceTable rows={rows} showCustomer={false} />}</Q></Card>
    </div>
  );
}
