import { useQuery } from '@tanstack/react-query';
import { Search, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty, Modal, PageHeader, Q, Tabs, Tag } from '../components/ui';
import { money } from '../format';
import type { Product } from './OrderBuilder';

const TYPES = [['ALL', 'All'], ['FOOD_ITEM', 'Food items'], ['PACKAGE', 'Packages'], ['EVENT_MENU', 'Event menus'], ['SERVICE', 'Services']] as const;

export default function Catalog() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const nav = useNavigate();
  const ar = i18n.language === 'ar';
  const [type, setType] = useState<(typeof TYPES)[number][0]>('ALL');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Product | null>(null);
  const list = useQuery({ queryKey: ['catalog'], queryFn: () => api<Product[]>('/catalog/products') });
  const nm = (p: { name: string; nameAr?: string }) => (ar && p.nameAr ? p.nameAr : p.name);

  return (
    <div>
      <PageHeader title={t('Food Catalog')} subtitle={t('Everything we sell: dishes, packages, event menus and services.')} />
      <Q q={list}>{(items) => {
        const shown = items.filter((p) => (type === 'ALL' || p.type === type) && (!q || `${p.name} ${p.nameAr} ${p.description}`.toLowerCase().includes(q.toLowerCase())));
        const cats = [...new Map(shown.map((p) => [p.category.id, p.category])).values()];
        return (
          <>
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <Tabs tabs={TYPES.map(([id, l]) => ({ id, label: t(l), count: id === 'ALL' ? items.length : items.filter((p) => p.type === id).length }))} value={type} onChange={setType} />
              <div className="relative w-full sm:w-72 mb-4"><Search size={16} className="absolute start-3 top-2.5 text-ink-4" /><input className="input ps-9" placeholder={t('Search the catalog')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            </div>
            {!shown.length && <Empty text={t('Nothing matches your search.')} />}
            {cats.map((c) => (
              <section key={c.id} className="mb-6">
                <h2 className="text-sm font-bold text-ink-3 uppercase tracking-wide mb-2">{nm(c)}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                  {shown.filter((p) => p.category.id === c.id).map((p) => (
                    <button key={p.id} onClick={() => setSel(p)} className="card p-4 text-start hover:border-brand-300 hover:shadow-md transition flex flex-col">
                      <div className="flex gap-3"><div className="text-3xl w-12 h-12 rounded-lg bg-canvas flex items-center justify-center shrink-0">{p.image}</div>
                        <div className="min-w-0"><div className="font-semibold text-ink leading-tight">{nm(p)}</div><div className="text-xs text-ink-3 mt-1 line-clamp-2">{p.description}</div></div></div>
                      <div className="flex flex-wrap gap-1 mt-3">{p.dietaryTags.slice(0, 2).map((d) => <Tag key={d} tone="green">{t(d)}</Tag>)}{p.allergens.map((a) => <Tag key={a} tone="orange">⚠ {t(a)}</Tag>)}</div>
                      <div className="mt-auto pt-3 flex items-baseline justify-between"><span className="font-bold text-ink">{money(p.price)}</span><span className="text-xs text-ink-4">{t('per')} {t(p.unit)}</span></div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        );
      }}</Q>
      {sel && (
        <Modal open onClose={() => setSel(null)} title={nm(sel)} footer={can('orders.create') ? <button className="btn-primary" onClick={() => nav(`/order/new?product=${sel.id}`)}><ShoppingCart size={16} />{t('Order this')}</button> : undefined}>
          <div className="flex gap-4">
            <div className="text-5xl w-20 h-20 rounded-xl bg-canvas flex items-center justify-center shrink-0">{sel.image}</div>
            <div><p className="text-sm text-ink-2">{sel.description}</p><div className="mt-2 text-lg font-bold text-ink">{money(sel.price)} <span className="text-sm font-normal text-ink-4">{t('per')} {t(sel.unit)}</span></div>
              <div className="text-xs text-ink-4">{t('Minimum')} {sel.minQty} · {t('Order at least')} {sel.leadTimeHours} {t('hours ahead')}</div></div>
          </div>
          {sel.components.length > 0 && (<><h3 className="font-bold text-sm mt-5 mb-2">{sel.type === 'EVENT_MENU' ? t('Per guest') : t('What is included')}</h3>
            <ul className="text-sm space-y-1">{sel.components.map((c) => <li key={c.id} className="flex justify-between"><span>{c.item.image} {nm(c.item)}</span><span className="text-ink-4">× {c.qty}</span></li>)}</ul></>)}
          {sel.options.length > 0 && (<><h3 className="font-bold text-sm mt-5 mb-2">{t('Allowed changes')}</h3>
            <ul className="text-sm space-y-1">{sel.options.map((o) => <li key={o.id} className="flex justify-between gap-3"><span>{ar ? o.labelAr : o.label}</span><span className="text-ink-4 whitespace-nowrap">{o.priceDelta === 0 ? t('no extra cost') : `${o.priceDelta > 0 ? '+' : ''}${money(o.priceDelta)}`}</span></li>)}</ul></>)}
          <div className="flex flex-wrap gap-1 mt-5">{sel.dietaryTags.map((d) => <Tag key={d} tone="green">{t(d)}</Tag>)}{sel.allergens.length ? sel.allergens.map((a) => <Tag key={a} tone="orange">⚠ {t('Contains')} {t(a)}</Tag>) : <Tag>{t('No listed allergens')}</Tag>}</div>
        </Modal>
      )}
    </div>
  );
}
