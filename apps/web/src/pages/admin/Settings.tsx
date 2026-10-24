import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, put } from '../../api';
import { Card, PageHeader, Q, useToast } from '../../components/ui';

/** FR-100 / NFR-12: business rules stored as configuration. */
export default function SettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api('/admin/settings') });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const save = useMutation({ mutationFn: ([k, v]: [string, string]) => put(`/admin/settings/${k}`, { value: v }),
    onSuccess: (_d, [k]) => { toast(t('Setting saved')); setEdits((e) => { const n = { ...e }; delete n[k]; return n; }); qc.invalidateQueries({ queryKey: ['settings'] }); }, onError: (e: any) => toast(e.message, 'bad') });
  return (
    <div>
      <PageHeader title={t('Settings')} subtitle={t('Tax, fees, discounts, cut-offs and capacity. Values are examples - the company sets them.')} />
      <Card pad={false}><Q q={q}>{(rows: any[]) => (
        <table className="table"><tbody>{rows.map((s) => {
          const v = edits[s.key] ?? s.value;
          return (
            <tr key={s.key}>
              <td><div className="font-medium text-ink">{t(s.label)}</div><div className="font-mono text-[11px] text-ink-4">{s.key}</div></td>
              <td className="w-56">{s.key === 'invoiceOn'
                ? <select className="input" value={v} onChange={(e) => setEdits({ ...edits, [s.key]: e.target.value })}><option value="CONFIRMATION">{t('On confirmation')}</option><option value="DELIVERY">{t('When delivered')}</option></select>
                : <input className="input" value={v} onChange={(e) => setEdits({ ...edits, [s.key]: e.target.value })} />}</td>
              <td className="w-24">{edits[s.key] !== undefined && edits[s.key] !== s.value && <button className="btn-primary btn-sm" onClick={() => save.mutate([s.key, v])}><Save size={14} />{t('Save')}</button>}</td>
            </tr>
          );
        })}</tbody></table>
      )}</Q></Card>
    </div>
  );
}
