import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, post, put } from '../api';
import { Card, ErrorBox, Field, KpiTile, Modal, PageHeader, Q, Tabs, Tag, TileRow, useToast, denied } from '../components/ui';
import { dateTime, money } from '../format';

const TYPES = [['ALL', 'All'], ['FOOD_ITEM', 'Food items'], ['PACKAGE', 'Packages'], ['EVENT_MENU', 'Event menus'], ['SERVICE', 'Services']] as const;
const UNITS = ['portion', 'bottle', 'cup', 'piece', 'package', 'guest', 'hour', 'event'];

/** Catalog Manager (UC-07, FR-44 to FR-49, FR-61). Price changes never touch confirmed orders (FR-63). */
export default function CatalogAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState<(typeof TYPES)[number][0]>('ALL');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const list = useQuery({ queryKey: ['catalog', 'all'], queryFn: () => api('/catalog/products?all=true') });
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api('/catalog/categories') });
  const toggle = useMutation({ mutationFn: (p: any) => post(`/catalog/products/${p.id}/active`, { isActive: !p.isActive }),
    onSuccess: (_d, p) => { toast(p.isActive ? t('Offer deactivated - customers no longer see it') : t('Offer activated')); qc.invalidateQueries({ queryKey: ['catalog'] }); } });
  const save = useMutation({
    mutationFn: (p: any) => {
      const body = { sku: p.sku, type: p.type, name: p.name, nameAr: p.nameAr, description: p.description, categoryId: Number(p.categoryId), price: Number(p.price), unit: p.unit,
        minQty: Number(p.minQty), leadTimeHours: Number(p.leadTimeHours), image: p.image, isActive: p.isActive,
        dietaryTags: String(p.dietaryTags).split(',').map((s) => s.trim()).filter(Boolean), allergens: String(p.allergens).split(',').map((s) => s.trim()).filter(Boolean) };
      return p.id ? put(`/catalog/products/${p.id}`, body) : post('/catalog/products', body);
    },
    onSuccess: () => { toast(t('Saved. Confirmed orders keep their agreed prices.')); setEdit(null); qc.invalidateQueries({ queryKey: ['catalog'] }); },
  });
  const open = (p?: any) => { save.reset(); setEdit(p ? { ...p, categoryId: p.category.id, dietaryTags: p.dietaryTags.join(', '), allergens: p.allergens.join(', ') }
    : { sku: '', type: 'FOOD_ITEM', name: '', nameAr: '', description: '', categoryId: cats.data?.[0]?.id ?? '', price: '', unit: 'portion', minQty: 1, leadTimeHours: 24, image: '🍽️', isActive: true, dietaryTags: '', allergens: '' }); };

  const deny = denied(list);
  if (deny) return deny;
  return (
    <div>
      <PageHeader title={t('Catalog Management')} subtitle={t('Food items, packages, event menus, services and their prices.')} actions={<button className="btn-primary" onClick={() => open()}><Plus size={16} />{t('New offer')}</button>} />
      <Q q={list}>{(rows: any[]) => {
        const shown = rows.filter((p) => (type === 'ALL' || p.type === type) && (!q || `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase())));
        return (
          <>
            <TileRow>
              {TYPES.slice(1).map(([k, l], i) => <KpiTile key={k} label={t(l)} value={rows.filter((p) => p.type === k && p.isActive).length} sub={`${rows.filter((p) => p.type === k && !p.isActive).length} ${t('inactive')}`} tone={(['blue', 'navy', 'green', 'slate'] as const)[i]} />)}
            </TileRow>
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <Tabs tabs={TYPES.map(([id, l]) => ({ id, label: t(l) }))} value={type} onChange={setType} />
              <div className="relative w-full sm:w-64 mb-4"><Search size={16} className="absolute start-3 top-2.5 text-ink-4" /><input className="input ps-9" placeholder={t('Search name or SKU')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            </div>
            <Card pad={false}><div className="overflow-x-auto"><table className="table">
              <thead><tr><th>{t('Offer')}</th><th>{t('SKU')}</th><th>{t('Type')}</th><th className="text-end">{t('Price')}</th><th>{t('Min.')}</th><th>{t('Contents / recipe')}</th><th>{t('Updated')}</th><th>{t('Active')}</th><th></th></tr></thead>
              <tbody>{shown.map((p) => (
                <tr key={p.id} className={p.isActive ? '' : 'opacity-60'}>
                  <td><div className="flex items-center gap-2"><span className="text-xl">{p.image}</span><div><div className="font-medium text-ink">{p.name}</div><div className="text-[11px] text-ink-4">{p.category.name}</div></div></div></td>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td><Tag tone={p.type === 'SERVICE' ? 'slate' : p.type === 'FOOD_ITEM' ? 'green' : 'blue'}>{t(TYPES.find(([k]) => k === p.type)![1])}</Tag></td>
                  <td className="text-end tabular-nums font-semibold whitespace-nowrap">{money(p.price)} <span className="text-[11px] text-ink-4 font-normal">/ {t(p.unit)}</span></td>
                  <td className="tabular-nums">{p.minQty}</td>
                  <td className="text-xs text-ink-3 max-w-[260px]">{p.components.length ? p.components.map((c: any) => `${c.qty}× ${c.item.name}`).join(', ') : p.recipe?.length ? p.recipe.map((r: any) => `${r.ingredient.name} ${r.qtyPerPortion}${r.ingredient.unit}`).join(', ') : '—'}
                    {p.options.length > 0 && <div className="text-brand-600 mt-0.5">{p.options.length} {t('allowed changes')}</div>}</td>
                  <td className="text-xs text-ink-4 whitespace-nowrap">{dateTime(p.updatedAt)}</td>
                  <td><button role="switch" aria-checked={p.isActive} aria-label={t('Active')} onClick={() => toggle.mutate(p)} className={`w-10 h-6 rounded-full relative transition ${p.isActive ? 'bg-ok' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${p.isActive ? 'start-[18px]' : 'start-0.5'}`} /></button></td>
                  <td><button className="btn-ghost btn-sm" onClick={() => open(p)}><Pencil size={14} />{t('Edit')}</button></td>
                </tr>
              ))}</tbody>
            </table></div></Card>
          </>
        );
      }}</Q>
      <Modal wide open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `${t('Edit')}: ${edit.name}` : t('New offer')} footer={<>
        <button className="btn-secondary" onClick={() => setEdit(null)}>{t('Close')}</button>
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate(edit)}>{t('Save')}</button>
      </>}>
        {edit && <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label={t('Name (English)')}><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label={t('Name (Arabic)')}><input className="input" dir="rtl" value={edit.nameAr} onChange={(e) => setEdit({ ...edit, nameAr: e.target.value })} /></Field>
          <Field label={t('SKU')}><input className="input" value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} disabled={!!edit.id} /></Field>
          <Field label={t('Type')}><select className="input" value={edit.type} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{TYPES.slice(1).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></Field>
          <Field label={t('Category')}><select className="input" value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}>{cats.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <div className="grid grid-cols-[1fr_1fr_70px] gap-2">
            <Field label={t('Price (EGP)')}><input className="input" type="number" step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
            <Field label={t('Per')}><select className="input" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>{UNITS.map((u) => <option key={u} value={u}>{t(u)}</option>)}</select></Field>
            <Field label={t('Icon')}><input className="input text-center" value={edit.image} onChange={(e) => setEdit({ ...edit, image: e.target.value })} /></Field>
          </div>
          <Field label={t('Minimum quantity')}><input className="input" type="number" min={1} value={edit.minQty} onChange={(e) => setEdit({ ...edit, minQty: e.target.value })} /></Field>
          <Field label={t('Lead time (hours)')}><input className="input" type="number" min={0} value={edit.leadTimeHours} onChange={(e) => setEdit({ ...edit, leadTimeHours: e.target.value })} /></Field>
          <Field label={t('Dietary tags')} hint={t('Comma separated, e.g. vegan, gluten-free')}><input className="input" value={edit.dietaryTags} onChange={(e) => setEdit({ ...edit, dietaryTags: e.target.value })} /></Field>
          <Field label={t('Allergens')} hint={t('Comma separated, e.g. nuts, dairy')}><input className="input" value={edit.allergens} onChange={(e) => setEdit({ ...edit, allergens: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label={t('Description')}><textarea className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field></div>
          <div className="sm:col-span-2 text-xs text-ink-4">{t('Package contents, allowed changes and recipes are set up with the seed data in this prototype; editing them in the screen is planned for the next phase.')}</div>
          <div className="sm:col-span-2 mt-2"><ErrorBox error={save.error} /></div>
        </div>}
      </Modal>
    </div>
  );
}
