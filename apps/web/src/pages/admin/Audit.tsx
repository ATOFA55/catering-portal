import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { Card, PageHeader, Q, Tabs, Tag } from '../../components/ui';
import { dateTime } from '../../format';

/** NFR-09: logins, failed logins, access denials, user and permission changes. */
export default function Audit() {
  const { t } = useTranslation();
  const [f, setF] = useState<'' | 'DENIED' | 'FAILED' | 'SUCCESS'>('');
  const q = useQuery({ queryKey: ['audit', f], queryFn: () => api(`/admin/audit${f ? `?result=${f}` : ''}`), refetchInterval: 10_000 });
  return (
    <div>
      <PageHeader title={t('Audit Log')} subtitle={t('Who did what and when - including every refused access attempt.')} />
      <Tabs tabs={[{ id: '', label: t('All') }, { id: 'DENIED', label: t('Access denied') }, { id: 'FAILED', label: t('Failed') }, { id: 'SUCCESS', label: t('Success') }]} value={f} onChange={setF} />
      <Card pad={false}><Q q={q}>{(rows: any[]) => (
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>{t('Time')}</th><th>{t('User')}</th><th>{t('Action')}</th><th>{t('Resource')}</th><th>{t('Result')}</th><th>{t('Details')}</th></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id}>
              <td className="text-xs whitespace-nowrap">{dateTime(a.createdAt)}</td><td className="text-sm">{a.userName ?? '—'}</td><td className="font-mono text-xs">{a.action}</td>
              <td className="font-mono text-xs break-all">{a.resource}</td>
              <td><Tag tone={a.result === 'DENIED' ? 'red' : a.result === 'FAILED' ? 'orange' : 'green'}>{t(a.result)}</Tag></td>
              <td className="font-mono text-[11px] text-ink-4 max-w-[280px] truncate" title={a.details ? JSON.stringify(a.details) : ''}>{a.details ? JSON.stringify(a.details) : ''}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}</Q></Card>
    </div>
  );
}
