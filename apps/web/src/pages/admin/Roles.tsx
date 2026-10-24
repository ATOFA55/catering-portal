import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, put } from '../../api';
import { useAuth } from '../../auth';
import { Card, PageHeader, Q, useToast } from '../../components/ui';

/** FR-43: the permission matrix, stored as data and editable without a new release (NFR-11). */
export default function Roles() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const data = useQuery({ queryKey: ['admin-roles'], queryFn: () => api('/admin/roles') });
  const set = useMutation({ mutationFn: ({ roleId, code, scope }: any) => put(`/admin/roles/${roleId}/permissions`, { code, scope }),
    onSuccess: () => { toast(t('Permission updated. Change recorded in the audit log.')); qc.invalidateQueries({ queryKey: ['admin-roles'] }); }, onError: (e: any) => toast(e.message, 'bad') });
  return (
    <div>
      <PageHeader title={t('Roles & Permissions')} subtitle={t('What each role can see and do. Changes apply on the next request - no new release needed.')} />
      <Q q={data}>{(d: any) => {
        const groups = [...new Set(d.permissions.map((p: any) => p.group))] as string[];
        return (
          <Card pad={false}><div className="overflow-x-auto"><table className="table text-xs">
            <thead><tr><th className="sticky start-0 bg-canvas z-10 min-w-[220px]">{t('Permission')}</th>{d.roles.map((r: any) => <th key={r.id} className="text-center !normal-case min-w-[92px]">{t(r.name)}<div className="font-normal text-ink-4">{r.users} {t('users')}</div></th>)}</tr></thead>
            <tbody>{groups.map((g) => [
              <tr key={g}><td colSpan={d.roles.length + 1} className="bg-brand-50 font-bold text-brand-700 text-[11px] uppercase tracking-wide">{t(g)}</td></tr>,
              ...d.permissions.filter((p: any) => p.group === g).map((p: any) => (
                <tr key={p.code}>
                  <td className="sticky start-0 bg-white z-10"><div className="font-mono text-[11px] text-ink">{p.code}</div><div className="text-[11px] text-ink-4">{t(p.description)}</div></td>
                  {d.roles.map((r: any) => {
                    const grant = r.permissions.find((x: any) => x.permissionCode === p.code);
                    return (
                      <td key={r.id} className="text-center">
                        <select disabled={!me?.isSuperAdmin} aria-label={`${r.name} ${p.code}`} value={grant?.scope ?? ''} onChange={(e) => set.mutate({ roleId: r.id, code: p.code, scope: e.target.value || null })}
                          className={`rounded-md border px-1 py-1 text-[11px] font-semibold ${grant ? (grant.scope === 'ALL' ? 'bg-ok-bg text-ok border-ok/30' : 'bg-brand-100 text-brand-700 border-brand-200') : 'bg-white text-ink-4 border-line'}`}>
                          <option value="">—</option><option value="ALL">{t('All')}</option><option value="OWN">{t('Own')}</option><option value="ASSIGNED">{t('Assigned')}</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              )),
            ])}</tbody>
          </table></div>
          <p className="text-xs text-ink-4 p-3">{t('All = full access. Own = own records only. Assigned = records assigned to that user. — = no access.')}</p></Card>
        );
      }}</Q>
    </div>
  );
}
