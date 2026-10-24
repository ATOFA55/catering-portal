import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, Bell, BookOpen, Boxes, CalendarDays, ChefHat, ClipboardList, FileText, Gauge, Languages, LayoutDashboard, LogOut, Menu,
  Package, PlusCircle, ScrollText, Settings, ShieldCheck, ShoppingBag, Truck, Users, X,
} from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, post } from '../api';
import { useAuth } from '../auth';
import { ago } from '../format';

type NavItem = { to: string; label: string; icon: ReactNode; perm?: string[]; scope?: 'OWN' | 'ALL' };

/** Sidebar shows only the sections the role may open (UI-06). The server still checks every request. */
export const NAV: { section?: string; items: NavItem[] }[] = [
  { items: [{ to: '__home__', label: 'Dashboard', icon: <LayoutDashboard size={18} /> }] },
  { section: 'Ordering', items: [
    { to: '/order/new', label: 'New Order', icon: <PlusCircle size={18} />, perm: ['orders.create'] },
    { to: '/catalog', label: 'Food Catalog', icon: <BookOpen size={18} />, perm: ['catalog.view'] },
    { to: '/my-orders', label: 'My Orders', icon: <ShoppingBag size={18} />, perm: ['orders.view'], scope: 'OWN' },
    { to: '/orders', label: 'Orders', icon: <ClipboardList size={18} />, perm: ['orders.view'], scope: 'ALL' },
    { to: '/invoices', label: 'My Invoices', icon: <FileText size={18} />, perm: ['finance.view'], scope: 'OWN' },
  ] },
  { section: 'Operations', items: [
    { to: '/kitchen', label: 'Kitchen', icon: <ChefHat size={18} />, perm: ['production.view'] },
    { to: '/dispatch', label: 'Dispatch', icon: <Truck size={18} />, perm: ['delivery.manage'] },
    { to: '/driver', label: 'My Deliveries', icon: <Truck size={18} />, perm: ['delivery.perform'] },
    { to: '/inventory', label: 'Inventory', icon: <Boxes size={18} />, perm: ['inventory.view'] },
    { to: '/events', label: 'Events', icon: <CalendarDays size={18} />, perm: ['events.view'] },
  ] },
  { section: 'Management', items: [
    { to: '/executive', label: 'Executive Dashboard', icon: <Gauge size={18} />, perm: ['dashboard.executive'] },
    { to: '/finance', label: 'Finance', icon: <BarChart3 size={18} />, perm: ['reports.financial'] },
    { to: '/catalog-admin', label: 'Catalog Management', icon: <Package size={18} />, perm: ['catalog.manage'] },
  ] },
  { section: 'Administration', items: [
    { to: '/admin/users', label: 'Users', icon: <Users size={18} />, perm: ['admin.users'] },
    { to: '/admin/roles', label: 'Roles & Permissions', icon: <ShieldCheck size={18} />, perm: ['admin.roles'] },
    { to: '/admin/audit', label: 'Audit Log', icon: <ScrollText size={18} />, perm: ['admin.audit'] },
    { to: '/admin/settings', label: 'Settings', icon: <Settings size={18} />, perm: ['admin.settings'] },
  ] },
];

function Notifications() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ unread: number; items: any[] }>('/notifications'), refetchInterval: 15_000 });
  const readAll = useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const unread = q.data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button className="relative p-2 rounded-lg hover:bg-white/10" onClick={() => setOpen(!open)} aria-label={t('Notifications')}>
        <Bell size={19} />
        {unread > 0 && <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-[10px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute end-0 mt-2 w-[min(360px,92vw)] bg-white text-ink-2 rounded-xl shadow-xl border border-line z-50">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
            <span className="font-bold text-sm text-ink">{t('Notifications')}</span>
            {unread > 0 && <button className="text-xs text-brand-600 font-semibold" onClick={() => readAll.mutate()}>{t('Mark all as read')}</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!q.data?.items.length && <div className="p-6 text-center text-sm text-ink-4">{t('No notifications yet')}</div>}
            {q.data?.items.map((n) => (
              <button key={n.id} onClick={() => { setOpen(false); post(`/notifications/${n.id}/read`).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })); if (n.link) nav(n.link); }}
                className={`w-full text-start px-4 py-2.5 border-b border-line/60 hover:bg-brand-50 ${n.readAt ? '' : 'bg-brand-50/60'}`}>
                <div className="flex justify-between gap-2"><span className="text-sm font-semibold text-ink">{n.title}</span>{!n.readAt && <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />}</div>
                <div className="text-xs text-ink-3 line-clamp-2">{n.body}</div>
                <div className="text-[11px] text-ink-4 mt-0.5">{ago(n.createdAt)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { me, logout, can, scope } = useAuth();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  if (!me) return null;

  const visible = (it: NavItem) => {
    if (it.to === '__home__') return true;
    if (!it.perm) return true;
    if (!can(...it.perm)) return false;
    if (it.scope) return scope(it.perm[0]) === it.scope;
    return true;
  };
  const toggleLang = () => {
    const l = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(l);
    post('/auth/language', { language: l }).catch(() => {});
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 bg-ink text-white flex items-center gap-2 px-3 sm:px-4 sticky top-0 z-40 no-print">
        <button className="lg:hidden p-2 -ms-1 rounded-lg hover:bg-white/10" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X size={20} /> : <Menu size={20} />}</button>
        <Link to="/" className="flex items-center gap-2 font-bold text-[17px] tracking-tight me-2">
          <img src="/favicon.svg" alt="" className="w-7 h-7" /><span>catering<span className="text-brand-400">pro</span></span>
        </Link>
        <span className="hidden md:inline text-xs text-white/50 border-s border-white/15 ps-3">{t(me.role.name)}</span>
        <div className="flex-1" />
        {can('orders.create') && <Link to="/order/new" className="btn btn-sm bg-brand-500 hover:bg-brand-400 text-white hidden sm:inline-flex"><PlusCircle size={15} />{t('New Order')}</Link>}
        <button onClick={toggleLang} className="p-2 rounded-lg hover:bg-white/10 flex items-center gap-1 text-xs font-semibold" aria-label="Language"><Languages size={18} />{i18n.language === 'ar' ? 'EN' : 'ع'}</button>
        <Notifications />
        <div className="flex items-center gap-2 ps-2 border-s border-white/15">
          <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-sm font-bold">{me.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
          <div className="hidden sm:block leading-tight"><div className="text-sm font-semibold">{me.name}</div><div className="text-[11px] text-white/60">{me.email}</div></div>
          <button onClick={logout} className="p-2 rounded-lg hover:bg-white/10" aria-label={t('Log out')} title={t('Log out')}><LogOut size={18} /></button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className={`no-print fixed lg:sticky top-14 z-30 h-[calc(100vh-3.5rem)] w-64 shrink-0 bg-brand-600 text-white overflow-y-auto transition-transform
          ${open ? 'translate-x-0' : 'max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full'}`}>
          <nav className="py-3">
            {NAV.map((g, gi) => {
              const items = g.items.filter(visible);
              if (!items.length) return null;
              return (
                <div key={gi} className="mb-2">
                  {g.section && <div className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-widest text-white/50 font-bold">{t(g.section)}</div>}
                  {items.map((it) => {
                    const to = it.to === '__home__' ? me.role.homePath : it.to;
                    return (
                      <NavLink key={it.to} to={to} end={to === '/orders'}
                        className={({ isActive }) => `flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-white text-brand-700 shadow' : 'text-white/90 hover:bg-white/10'}`}>
                        {it.icon}<span>{t(it.label)}</span>
                      </NavLink>
                    );
                  })}
                </div>
              );
            })}
          </nav>
          <div className="px-5 py-4 text-[11px] text-white/50 border-t border-white/10">{t('Signed in as')} {t(me.role.name)}{me.isSuperAdmin ? ` · ${t('Super Admin')}` : ''}</div>
        </aside>
        {open && <div className="fixed inset-0 top-14 bg-ink/40 z-20 lg:hidden" onClick={() => setOpen(false)} />}
        <main className="flex-1 min-w-0 p-4 sm:p-6 max-w-[1500px]"><Outlet /></main>
      </div>
    </div>
  );
}
