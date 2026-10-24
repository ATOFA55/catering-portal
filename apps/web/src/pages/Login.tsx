import { ChefHat, ClipboardList, Gauge, Loader2, ShieldCheck, Truck } from 'lucide-react';
import { ChangeEvent, FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../api';
import { RegisterInput, useAuth } from '../auth';
import { ErrorBox, Field } from '../components/ui';

const DEMO = [
  ['customer@cateringpro.demo', 'Customer', 'Nour · Acme Technologies'],
  ['ordermanager@cateringpro.demo', 'Order Manager', 'Mona'],
  ['kitchen@cateringpro.demo', 'Kitchen Staff', 'Chef Hany'],
  ['delivery@cateringpro.demo', 'Delivery Manager', 'Tamer'],
  ['driver@cateringpro.demo', 'Driver', 'Karim'],
  ['inventory@cateringpro.demo', 'Inventory Manager', 'Laila'],
  ['accountant@cateringpro.demo', 'Accountant', 'Rania'],
  ['ceo@cateringpro.demo', 'CEO / Admin', 'Khaled · Super Admin'],
  ['catalog@cateringpro.demo', 'Catalog Manager', 'Dina'],
  ['events@cateringpro.demo', 'Event Coordinator', 'Hossam'],
];

export default function Login() {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const go = async (e?: FormEvent, em = email, pw = password) => {
    e?.preventDefault();
    setBusy(true); setErr(null);
    try { const me = await login(em, pw); nav(me.role.homePath, { replace: true }); } catch (x) { setErr(x); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-brand-600 via-brand-700 to-ink text-white p-12">
        <div className="flex items-center gap-2 text-xl font-bold"><img src="/favicon.svg" className="w-9 h-9" alt="" />catering<span className="text-brand-200">pro</span></div>
        <div>
          <h1 className="text-4xl font-bold leading-tight text-white">{t('One portal for the whole catering business.')}</h1>
          <p className="mt-4 text-white/80 max-w-md">{t('Customers order and track online. Kitchen, inventory, delivery and finance work from the same order.')}</p>
          <ul className="mt-8 space-y-3 text-sm text-white/90">
            {[[<ClipboardList key="a" size={18} />, 'Order Builder with live pricing and availability'], [<ChefHat key="b" size={18} />, 'Recipe-based stock reservation and production orders'],
              [<Truck key="c" size={18} />, 'Dispatch, driver view and proof of delivery'], [<Gauge key="d" size={18} />, 'Executive KPIs, invoices and payments'],
              [<ShieldCheck key="e" size={18} />, 'Ten roles, checked by the server on every request']].map(([i, s]) => (
              <li key={s as string} className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">{i}</span>{t(s as string)}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/50">{t('Prototype for the Business Requirements v4.0 - sample data only.')}</p>
      </div>

      <div className="flex flex-col justify-center p-6 sm:p-10">
        <div className="w-full max-w-md mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div className="lg:hidden flex items-center gap-2 text-lg font-bold text-ink"><img src="/favicon.svg" className="w-8 h-8" alt="" />catering<span className="text-brand-500">pro</span></div>
            <button className="btn-ghost btn-sm ms-auto" onClick={() => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}>{i18n.language === 'ar' ? 'English' : 'العربية'}</button>
          </div>
          <h2 className="text-2xl font-bold">{t('Sign in')}</h2>
          <p className="text-sm text-ink-3 mt-1 mb-6">{t('Use your company account.')}</p>
          <form onSubmit={go} className="card p-5">
            <Field label={t('Email')}><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label={t('Password')}><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {!!err && <div className="mb-3"><ErrorBox error={err} /></div>}
            <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}{t('Sign in')}</button>
            <Link to="/forgot-password" className="block text-center text-xs text-brand-600 font-semibold mt-3">{t('Forgot your password?')}</Link>
          </form>
          <p className="text-center text-sm text-ink-3 mt-4">
            {t('New here?')} <Link to="/register" className="text-brand-600 font-semibold">{t('Create a customer account')}</Link>
          </p>

          <div className="mt-7">
            <div className="text-xs font-bold text-ink-3 uppercase tracking-wide mb-2">{t('Demo accounts')} <span className="normal-case font-normal text-ink-4">· {t('password')} Demo@123</span></div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map(([em, role, who]) => (
                <button key={em} disabled={busy} onClick={() => { setEmail(em); setPassword('Demo@123'); go(undefined, em, 'Demo@123'); }}
                  className="text-start rounded-lg border border-line bg-white px-3 py-2 hover:border-brand-400 hover:bg-brand-50 transition">
                  <div className="text-[13px] font-semibold text-ink">{t(role)}</div><div className="text-[11px] text-ink-4 truncate">{who}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form className="card p-6 w-full max-w-sm" onSubmit={async (e) => { e.preventDefault(); const r = await post('/auth/forgot-password', { email }); setMsg(r.message); }}>
        <h1 className="text-lg font-bold mb-1">{t('Reset your password')}</h1>
        <p className="text-sm text-ink-3 mb-4">{t('We will send a reset link to your email.')}</p>
        <Field label={t('Email')}><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        {msg && <p className="text-sm text-ok mb-3">{t(msg)} <span className="block text-xs text-ink-4">{t('(Prototype: the link is printed in the API server log.)')}</span></p>}
        <button className="btn-primary w-full">{t('Send reset link')}</button>
        <Link to="/login" className="block text-center text-xs text-brand-600 font-semibold mt-3">{t('Back to sign in')}</Link>
      </form>
    </div>
  );
}

export function ResetPassword() {
  const { t } = useTranslation();
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form className="card p-6 w-full max-w-sm" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { const r = await post('/auth/reset-password', { token, newPassword: pw }); setMsg(r.message); } catch (x) { setErr(x); } }}>
        <h1 className="text-lg font-bold mb-4">{t('Choose a new password')}</h1>
        <Field label={t('New password')} hint={t('At least 8 characters')}><input className="input" type="password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
        {msg && <p className="text-sm text-ok mb-3">{t(msg)}</p>}
        {!!err && <div className="mb-3"><ErrorBox error={err} /></div>}
        <button className="btn-primary w-full">{t('Save password')}</button>
        <Link to="/login" className="block text-center text-xs text-brand-600 font-semibold mt-3">{t('Back to sign in')}</Link>
      </form>
    </div>
  );
}

export function Register() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState<RegisterInput>({ name: '', email: '', password: '', phone: '', company: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: keyof RegisterInput) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const me = await register({ ...form, phone: form.phone || undefined, company: form.company || undefined });
      nav(me.role.homePath, { replace: true });
    } catch (x) { setErr(x); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="card p-6 w-full max-w-sm">
        <h1 className="text-lg font-bold mb-1">{t('Create your account')}</h1>
        <p className="text-sm text-ink-3 mb-4">{t('Register as a customer to browse the catalog and place orders.')}</p>
        <Field label={t('Full name')}><input className="input" value={form.name} onChange={set('name')} required minLength={2} /></Field>
        <Field label={t('Email')}><input className="input" type="email" autoComplete="username" value={form.email} onChange={set('email')} required /></Field>
        <Field label={t('Password')} hint={t('At least 8 characters')}>
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set('password')} required />
        </Field>
        <Field label={t('Phone')} hint={t('Optional')}><input className="input" value={form.phone} onChange={set('phone')} /></Field>
        <Field label={t('Company')} hint={t('Optional')}><input className="input" value={form.company} onChange={set('company')} /></Field>
        {!!err && <div className="mb-3"><ErrorBox error={err} /></div>}
        <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}{t('Create account')}</button>
        <Link to="/login" className="block text-center text-xs text-brand-600 font-semibold mt-3">{t('Already have an account? Sign in')}</Link>
      </form>
    </div>
  );
}
