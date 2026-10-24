import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, post, put } from '../../api';
import { useAuth } from '../../auth';
import { Card, ErrorBox, Field, Modal, PageHeader, Q, Tag, useToast } from '../../components/ui';
import { date } from '../../format';

/** UC-06: create accounts, change roles, enable/disable (FR-42, BR-14). */
export default function UsersPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [nu, setNu] = useState<any>(null);
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api('/admin/users') });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api('/admin/roles') });
  const upd = useMutation({ mutationFn: ({ id, body }: any) => put(`/admin/users/${id}`, body), onSuccess: () => { toast(t('User updated. Change recorded in the audit log.')); qc.invalidateQueries({ queryKey: ['admin-users'] }); }, onError: (e: any) => toast(e.message, 'bad') });
  const create = useMutation({ mutationFn: (b: any) => post('/admin/users', { ...b, roleId: Number(b.roleId) }), onSuccess: () => { toast(t('User created')); setNu(null); qc.invalidateQueries({ queryKey: ['admin-users'] }); } });
  const canEdit = me?.isSuperAdmin;
  return (
    <div>
      <PageHeader title={t('Users')} subtitle={t('Every account has exactly one role. Only the Super Admin can change users and roles.')}
        actions={canEdit && <button className="btn-primary" onClick={() => { create.reset(); setNu({ name: '', email: '', password: '', roleId: roles.data?.roles[0]?.id, phone: '', company: '' }); }}><Plus size={16} />{t('New user')}</button>} />
      <Card pad={false}>
        <div className="p-3 border-b border-line"><div className="relative max-w-xs"><Search size={16} className="absolute start-3 top-2.5 text-ink-4" /><input className="input ps-9" placeholder={t('Search name or email')} value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
        <Q q={users}>{(rows: any[]) => (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>{t('Name')}</th><th>{t('Email')}</th><th>{t('Role')}</th><th>{t('Created')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>{rows.filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())).map((u) => (
              <tr key={u.id}>
                <td><div className="font-medium text-ink">{u.name}</div>{u.company && <div className="text-xs text-ink-4">{u.company}</div>}{u.isSuperAdmin && <Tag tone="blue">{t('Super Admin')}</Tag>}</td>
                <td className="text-sm">{u.email}</td>
                <td>{canEdit ? (
                  <select className="input py-1 w-auto text-sm" value={u.roleId} onChange={(e) => upd.mutate({ id: u.id, body: { roleId: Number(e.target.value) } })}>
                    {roles.data?.roles.map((r: any) => <option key={r.id} value={r.id}>{t(r.name)}</option>)}
                  </select>) : t(u.roleName)}</td>
                <td className="text-xs text-ink-4">{date(u.createdAt)}</td>
                <td>{canEdit && u.id !== me?.id ? (
                  <button onClick={() => upd.mutate({ id: u.id, body: { isActive: !u.isActive } })} className={`chip px-2.5 py-1 ${u.isActive ? 'bg-ok-bg text-ok' : 'bg-slate-100 text-slate-500'}`}>{u.isActive ? t('Active') : t('Disabled')}</button>
                ) : <Tag tone={u.isActive ? 'green' : 'slate'}>{u.isActive ? t('Active') : t('Disabled')}</Tag>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}</Q>
      </Card>
      <Modal open={!!nu} onClose={() => setNu(null)} title={t('New user')} footer={<>
        <button className="btn-secondary" onClick={() => setNu(null)}>{t('Close')}</button>
        <button className="btn-primary" disabled={create.isPending} onClick={() => create.mutate(nu)}>{t('Create')}</button>
      </>}>
        {nu && <>
          <Field label={t('Full name')}><input className="input" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></Field>
          <Field label={t('Email')}><input className="input" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></Field>
          <Field label={t('Temporary password')} hint={t('At least 8 characters')}><input className="input" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></Field>
          <Field label={t('Role')}><select className="input" value={nu.roleId} onChange={(e) => setNu({ ...nu, roleId: e.target.value })}>{roles.data?.roles.map((r: any) => <option key={r.id} value={r.id}>{t(r.name)}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label={t('Phone')}><input className="input" value={nu.phone} onChange={(e) => setNu({ ...nu, phone: e.target.value })} /></Field><Field label={t('Company')}><input className="input" value={nu.company} onChange={(e) => setNu({ ...nu, company: e.target.value })} /></Field></div>
          <ErrorBox error={create.error} />
        </>}
      </Modal>
    </div>
  );
}
