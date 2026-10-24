import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, CalendarClock, Check, CheckCircle2, Loader2, Minus, PartyPopper, Plus, Save, Send, Sparkles, UtensilsCrossed } from 'lucide-react';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, post } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Field, Loading, PageHeader, Tag, useToast } from '../components/ui';
import { dateTime, fromLocalInput, money, toLocalInput } from '../format';

type Mode = 'DIRECT' | 'PACKAGE' | 'CUSTOM' | 'EVENT';
type Line = { productId: number; qty: number; custom: Record<number, number> };
export type Product = {
  id: number; sku: string; type: 'FOOD_ITEM' | 'PACKAGE' | 'EVENT_MENU' | 'SERVICE'; name: string; nameAr: string; description: string; price: number; unit: string;
  minQty: number; leadTimeHours: number; dietaryTags: string[]; allergens: string[]; image: string; isActive: boolean; category: { id: number; name: string; nameAr: string };
  components: { id: number; qty: number; item: { id: number; name: string; nameAr: string; image: string } }[];
  options: { id: number; kind: 'SUBSTITUTION' | 'EXTRA'; label: string; labelAr: string; priceDelta: number; fromItemId: number | null; toItemId: number }[];
};

const STEPS = ['Order type', 'Ordering method', 'Quantity & schedule', 'Customization', 'Price review'];

const defaultTime = (type: 'DAILY' | 'EVENT') => {
  const d = new Date();
  d.setDate(d.getDate() + (type === 'EVENT' ? 4 : 2));
  d.setHours(type === 'EVENT' ? 13 : 12, 0, 0, 0);
  return toLocalInput(d);
};

export default function OrderBuilder() {
  const { t, i18n } = useTranslation();
  const { scope } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const ar = i18n.language === 'ar';
  const nm = (p: { name: string; nameAr?: string }) => (ar && p.nameAr ? p.nameAr : p.name);

  const [step, setStep] = useState(0);
  const [type, setType] = useState<'DAILY' | 'EVENT'>('DAILY');
  const [mode, setMode] = useState<Mode>('PACKAGE');
  const [lines, setLines] = useState<Line[]>([]);
  const [guestCount, setGuestCount] = useState(100);
  const [eventLocation, setEventLocation] = useState('');
  const [setupAt, setSetupAt] = useState('');
  const [deliveryAt, setDeliveryAt] = useState(defaultTime('DAILY'));
  const [addressId, setAddressId] = useState<number | 'new' | null>(null);
  const [addressText, setAddressText] = useState('');
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [allergyNotes, setAllergyNotes] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [busy, setBusy] = useState<'submit' | 'draft' | null>(null);
  const [submitErr, setSubmitErr] = useState<unknown>(null);
  const onBehalf = scope('orders.create') === 'ALL';

  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api<Product[]>('/catalog/products') });
  const zones = useQuery({ queryKey: ['zones'], queryFn: () => api<{ id: number; name: string; nameAr: string; fee: number; minOrder: number }[]>('/catalog/zones') });
  const addresses = useQuery({ queryKey: ['my-addresses'], queryFn: () => api<{ id: number; label: string; line: string; zoneId: number; contactName: string; contactPhone: string }[]>('/orders/my-addresses') });
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => api<{ id: number; name: string; company: string }[]>('/orders/customers'), enabled: onBehalf });
  const products = catalog.data ?? [];
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // default address
  useEffect(() => {
    if (addressId !== null || !addresses.data) return;
    if (addresses.data.length) {
      const a = addresses.data[0];
      setAddressId(a.id); setZoneId(a.zoneId); setContactName(a.contactName); setContactPhone(a.contactPhone);
    } else setAddressId('new');
  }, [addresses.data, addressId]);

  // prefill from catalog (?product=) or reorder (?reorder=)
  useEffect(() => {
    if (!products.length) return;
    const pid = Number(params.get('product'));
    const re = Number(params.get('reorder'));
    if (pid && byId.get(pid) && !lines.length) {
      const p = byId.get(pid)!;
      if (p.type === 'EVENT_MENU' || p.type === 'SERVICE') { pickType('EVENT'); setMode('EVENT'); }
      else { setType('DAILY'); setMode(p.type === 'PACKAGE' ? 'PACKAGE' : 'DIRECT'); }
      setLines([{ productId: pid, qty: p.type === 'EVENT_MENU' ? Math.max(p.minQty, 100) : p.minQty, custom: {} }]);
      setStep(2);
    }
    if (re && !lines.length) {
      api(`/orders/${re}/reorder`).then((r) => {
        setType(r.type); setMode(r.mode); setDeliveryAt(defaultTime(r.type));
        setLines(r.lines.map((l: any) => ({ productId: l.productId, qty: l.qty, custom: Object.fromEntries(l.customizations.map((c: any) => [c.optionId, c.qty])) })));
        setAddressId('new'); setAddressText(r.addressText); setZoneId(r.zoneId); setContactName(r.contactName); setContactPhone(r.contactPhone);
        setNotes(r.notes); setAllergyNotes(r.allergyNotes); if (r.guestCount) setGuestCount(r.guestCount); if (r.eventLocation) setEventLocation(r.eventLocation);
        setStep(4);
        toast(t('Previous order loaded. Prices are recalculated with today\'s catalog.'), 'info');
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  const pickType = (tp: 'DAILY' | 'EVENT') => {
    setType(tp); setLines([]); setDeliveryAt(defaultTime(tp));
    setMode(tp === 'EVENT' ? 'EVENT' : 'PACKAGE');
  };

  // event menu lines always follow the guest count (FR-48)
  useEffect(() => {
    if (type !== 'EVENT') return;
    setLines((ls) => ls.map((l) => (byId.get(l.productId)?.type === 'EVENT_MENU' ? { ...l, qty: guestCount } : l)));
  }, [guestCount, type, byId]);

  const visible = products.filter((p) => {
    if (mode === 'DIRECT') return p.type === 'FOOD_ITEM';
    if (mode === 'PACKAGE' || mode === 'CUSTOM') return p.type === 'PACKAGE';
    return p.type === 'EVENT_MENU' || p.type === 'SERVICE';
  });

  const qtyOf = (id: number) => lines.find((l) => l.productId === id)?.qty ?? 0;
  const setQty = (id: number, qty: number) => {
    setLines((ls) => {
      const p = byId.get(id)!;
      if (p.type === 'EVENT_MENU') {
        const others = ls.filter((l) => byId.get(l.productId)?.type !== 'EVENT_MENU');
        return qty > 0 ? [{ productId: id, qty: guestCount, custom: {} }, ...others] : others;
      }
      const rest = ls.filter((l) => l.productId !== id);
      if (qty <= 0) return rest;
      const cur = ls.find((l) => l.productId === id);
      return [...rest, { productId: id, qty, custom: cur?.custom ?? {} }];
    });
  };
  const setCustom = (pid: number, optionId: number, n: number) =>
    setLines((ls) => ls.map((l) => (l.productId === pid ? { ...l, custom: { ...l.custom, [optionId]: Math.max(0, n) } } : l)));

  const selAddress = addresses.data?.find((a) => a.id === addressId);
  const effZone = addressId === 'new' || !selAddress ? zoneId : selAddress.zoneId;
  const payload = {
    type, mode,
    lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, customizations: Object.entries(l.custom).filter(([, n]) => n > 0).map(([o, n]) => ({ optionId: Number(o), qty: n })) })),
    zoneId: effZone ?? 0, deliveryAt: deliveryAt ? fromLocalInput(deliveryAt) : '',
    addressId: typeof addressId === 'number' ? addressId : undefined,
    addressText: addressId === 'new' ? addressText : selAddress?.line, contactName, contactPhone, notes, allergyNotes,
    guestCount: type === 'EVENT' ? guestCount : undefined, eventLocation: type === 'EVENT' ? eventLocation : undefined,
    setupAt: type === 'EVENT' && setupAt ? fromLocalInput(setupAt) : undefined,
    customerId: onBehalf && customerId ? customerId : undefined,
  };

  // live quote (FR-54, FR-56, UI-09) - debounced
  const [debounced, setDebounced] = useState(payload);
  const key = JSON.stringify({ l: payload.lines, z: payload.zoneId, d: payload.deliveryAt, t: type, g: payload.guestCount });
  useEffect(() => { const h = setTimeout(() => setDebounced(payload), 350); return () => clearTimeout(h); /* eslint-disable-next-line */ }, [key]);
  const quote = useQuery({
    queryKey: ['quote', JSON.stringify({ l: debounced.lines, z: debounced.zoneId, d: debounced.deliveryAt, t: debounced.type, g: debounced.guestCount })],
    queryFn: () => post('/orders/quote', debounced),
    enabled: debounced.lines.length > 0 && !!debounced.zoneId && !!debounced.deliveryAt,
    placeholderData: (prev) => prev,
    retry: false,
  });

  const submit = async (asDraft: boolean) => {
    setBusy(asDraft ? 'draft' : 'submit'); setSubmitErr(null);
    try {
      const r = await post('/orders', { ...payload, submit: !asDraft });
      toast(asDraft ? t('Draft saved') : `${t('Order submitted')}: ${r.number}`);
      nav(`/orders/${r.id}`);
    } catch (e) { setSubmitErr(e); } finally { setBusy(null); }
  };

  const canNext = [true, true, lines.length > 0 && !!effZone && !!deliveryAt && (type === 'DAILY' || guestCount > 0), true, true][step];
  if (catalog.isLoading) return <Loading />;

  const Choice = ({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; text: string }) => (
    <button type="button" onClick={onClick} className={`text-start rounded-xl border-2 p-4 transition ${active ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:border-brand-200'}`}>
      <div className="flex items-start justify-between"><div className={`w-10 h-10 rounded-lg flex items-center justify-center ${active ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-3'}`}>{icon}</div>{active && <CheckCircle2 className="text-brand-500" size={20} />}</div>
      <div className="font-bold text-ink mt-3">{title}</div><div className="text-sm text-ink-3 mt-1">{text}</div>
    </button>
  );

  return (
    <div>
      <PageHeader title={t('Order Builder')} subtitle={t('Build your order step by step. The price and availability update as you go.')} />
      {/* stepper */}
      <ol className="flex items-center gap-1 sm:gap-2 mb-5 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button onClick={() => i < step && setStep(i)} disabled={i > step}
              className={`flex items-center gap-2 rounded-full ps-1 pe-3 py-1 text-xs sm:text-sm font-semibold ${i === step ? 'bg-brand-500 text-white' : i < step ? 'bg-brand-100 text-brand-700' : 'bg-white text-ink-4 border border-line'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${i === step ? 'bg-white text-brand-600' : i < step ? 'bg-brand-500 text-white' : 'bg-canvas'}`}>{i < step ? <Check size={13} /> : i + 1}</span>{t(s)}
            </button>
            {i < STEPS.length - 1 && <span className="w-4 sm:w-6 h-px bg-line" />}
          </li>
        ))}
      </ol>

      <div className="grid xl:grid-cols-[1fr_380px] gap-5 items-start">
        <div className="card p-4 sm:p-5 min-w-0">
          {step === 0 && (
            <>
              <h2 className="font-bold text-lg mb-1">{t('What are you ordering for?')}</h2>
              <p className="text-sm text-ink-3 mb-4">{t('Daily catering is delivered to your office. Events include menus per guest, staff and setup.')}</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <Choice active={type === 'DAILY'} onClick={() => pickType('DAILY')} icon={<Building2 size={20} />} title={t('Daily catering')} text={t('Lunch boxes, breakfast and coffee breaks for your team.')} />
                <Choice active={type === 'EVENT'} onClick={() => pickType('EVENT')} icon={<PartyPopper size={20} />} title={t('Event catering')} text={t('Conferences, weddings and dinners, priced per guest with services.')} />
              </div>
              {onBehalf && (
                <div className="mt-5 max-w-sm">
                  <Field label={t('Order on behalf of customer')} hint={t('Order Managers can place orders for a customer.')}>
                    <select className="input" value={customerId ?? ''} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">{t('Choose a customer')}</option>
                      {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.company} - {c.name}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="font-bold text-lg mb-4">{t('How would you like to order?')}</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                {type === 'DAILY' ? (
                  <>
                    <Choice active={mode === 'DIRECT'} onClick={() => { setMode('DIRECT'); setLines([]); }} icon={<UtensilsCrossed size={20} />} title={t('Individual items')} text={t('Pick dishes and drinks one by one.')} />
                    <Choice active={mode === 'PACKAGE'} onClick={() => { setMode('PACKAGE'); setLines([]); }} icon={<Building2 size={20} />} title={t('Fixed package')} text={t('Ready-made lunch or breakfast boxes.')} />
                    <Choice active={mode === 'CUSTOM'} onClick={() => { setMode('CUSTOM'); setLines([]); }} icon={<Sparkles size={20} />} title={t('Customized package')} text={t('A package with allowed swaps and extras.')} />
                  </>
                ) : (
                  <Choice active onClick={() => {}} icon={<PartyPopper size={20} />} title={t('Event menu')} text={t('Choose a menu, the guest count and services.')} />
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {type === 'EVENT' && (
                <div className="grid sm:grid-cols-3 gap-3 mb-5">
                  <Field label={t('Number of guests')}><input className="input" type="number" min={1} value={guestCount} onChange={(e) => setGuestCount(Math.max(0, Number(e.target.value)))} /></Field>
                  <Field label={t('Event location')}><input className="input" value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder={t('Venue and hall')} /></Field>
                  <Field label={t('Setup time')}><input className="input" type="datetime-local" value={setupAt} onChange={(e) => setSetupAt(e.target.value)} /></Field>
                </div>
              )}
              <h2 className="font-bold mb-3">{mode === 'DIRECT' ? t('Choose items') : mode === 'EVENT' ? t('Choose an event menu and services') : t('Choose packages')}</h2>
              <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-3">
                {visible.map((p) => {
                  const q = qtyOf(p.id);
                  const isMenu = p.type === 'EVENT_MENU';
                  return (
                    <div key={p.id} className={`rounded-xl border p-3 flex flex-col ${q ? 'border-brand-400 bg-brand-50/50' : 'border-line bg-white'}`}>
                      <div className="flex gap-3">
                        <div className="text-3xl w-12 h-12 rounded-lg bg-canvas flex items-center justify-center shrink-0">{p.image}</div>
                        <div className="min-w-0">
                          <div className="font-semibold text-ink leading-tight">{nm(p)}</div>
                          <div className="text-xs text-ink-3 mt-0.5 line-clamp-2">{p.description}</div>
                        </div>
                      </div>
                      {p.components.length > 0 && <div className="text-[11px] text-ink-4 mt-2">{p.components.map((c) => `${c.qty !== 1 ? `${c.qty}× ` : ''}${nm(c.item)}`).join(' · ')}</div>}
                      <div className="flex flex-wrap gap-1 mt-2">{p.dietaryTags.map((d) => <Tag key={d} tone="green">{t(d)}</Tag>)}{p.allergens.map((a) => <Tag key={a} tone="orange">⚠ {t(a)}</Tag>)}</div>
                      <div className="flex items-end justify-between mt-auto pt-3 gap-2">
                        <div><div className="font-bold text-ink">{money(p.price)}</div><div className="text-[11px] text-ink-4">{t('per')} {t(p.unit)} · {t('min.')} {p.minQty}</div></div>
                        {isMenu ? (
                          <button className={q ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setQty(p.id, q ? 0 : 1)}>{q ? <><Check size={14} />{t('Selected')}</> : t('Select')}</button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button className="btn-secondary btn-sm px-2" aria-label="less" onClick={() => setQty(p.id, q - 1 < p.minQty ? 0 : q - 1)}><Minus size={14} /></button>
                            <input aria-label={t('Quantity')} className="input w-16 text-center py-1.5 px-1" type="number" min={0} value={q || ''} placeholder="0" onChange={(e) => setQty(p.id, Number(e.target.value))} />
                            <button className="btn-secondary btn-sm px-2" aria-label="more" onClick={() => setQty(p.id, q ? q + 1 : p.minQty)}><Plus size={14} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <h2 className="font-bold mt-6 mb-3 flex items-center gap-2"><CalendarClock size={18} />{t('Delivery details')}</h2>
              <div className="grid sm:grid-cols-2 gap-x-3">
                <Field label={type === 'EVENT' ? t('Service start time') : t('Delivery date and time')}><input className="input" type="datetime-local" value={deliveryAt} onChange={(e) => setDeliveryAt(e.target.value)} /></Field>
                <Field label={t('Address')}>
                  <select className="input" value={addressId ?? ''} onChange={(e) => {
                    const v = e.target.value === 'new' ? 'new' : Number(e.target.value);
                    setAddressId(v);
                    const a = addresses.data?.find((x) => x.id === v);
                    if (a) { setZoneId(a.zoneId); setContactName(a.contactName); setContactPhone(a.contactPhone); }
                  }}>
                    {addresses.data?.map((a) => <option key={a.id} value={a.id}>{a.label}: {a.line}</option>)}
                    <option value="new">{t('New address...')}</option>
                  </select>
                </Field>
                {addressId === 'new' && (
                  <>
                    <Field label={t('Street address')}><input className="input" value={addressText} onChange={(e) => setAddressText(e.target.value)} /></Field>
                    <Field label={t('Delivery area')}>
                      <select className="input" value={zoneId ?? ''} onChange={(e) => setZoneId(Number(e.target.value) || null)}>
                        <option value="">{t('Choose an area')}</option>
                        {zones.data?.map((z) => <option key={z.id} value={z.id}>{nm(z)} - {t('fee')} {money(z.fee, 0)}, {t('min.')} {money(z.minOrder, 0)}</option>)}
                      </select>
                    </Field>
                  </>
                )}
                <Field label={t('Contact name')}><input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} /></Field>
                <Field label={t('Contact phone')}><input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></Field>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-bold text-lg mb-1">{mode === 'CUSTOM' || mode === 'EVENT' ? t('Customize your selection') : t('Dietary needs and notes')}</h2>
              <p className="text-sm text-ink-3 mb-4">{mode === 'CUSTOM' || mode === 'EVENT' ? t('You can change only the swaps and extras each package allows.') : t('Tell the kitchen about allergies or special requests.')}</p>
              {(mode === 'CUSTOM' || mode === 'EVENT') && lines.filter((l) => byId.get(l.productId)?.options.length).map((l) => {
                const p = byId.get(l.productId)!;
                return (
                  <div key={l.productId} className="rounded-xl border border-line p-4 mb-3">
                    <div className="font-semibold text-ink mb-2">{p.image} {nm(p)} <span className="text-ink-4 font-normal text-sm">× {l.qty}</span></div>
                    {p.options.map((o) => (
                      <div key={o.id} className="flex items-center justify-between gap-3 py-2 border-t border-line/60">
                        <div className="min-w-0">
                          <div className="text-sm text-ink">{ar ? o.labelAr : o.label}</div>
                          <div className="text-[11px] text-ink-4">{o.kind === 'SUBSTITUTION' ? t('Swap') : t('Extra')} · {o.priceDelta === 0 ? t('no extra cost') : `${o.priceDelta > 0 ? '+' : ''}${money(o.priceDelta)} ${t('each')}`}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-ink-4">{t('for')}</span>
                          <input className="input w-20 text-center py-1.5" type="number" min={0} max={l.qty} value={l.custom[o.id] || ''} placeholder="0" onChange={(e) => setCustom(l.productId, o.id, Number(e.target.value))} />
                          <span className="text-xs text-ink-4">/ {l.qty}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                <Field label={t('Allergy notes')} hint={t('Shown highlighted to the kitchen and on packing labels.')}>
                  <textarea className="input min-h-[84px]" value={allergyNotes} onChange={(e) => setAllergyNotes(e.target.value)} placeholder={t('e.g. 2 guests have a nut allergy')} />
                </Field>
                <Field label={t('Notes for our team')}><textarea className="input min-h-[84px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('e.g. deliver to the 14th floor reception')} /></Field>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="font-bold text-lg mb-3">{t('Review and submit')}</h2>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
                <div><dt className="text-ink-4 text-xs">{t('Order type')}</dt><dd className="font-medium">{type === 'DAILY' ? t('Daily catering') : t('Event catering')} · {t(mode === 'DIRECT' ? 'Individual items' : mode === 'PACKAGE' ? 'Fixed package' : mode === 'CUSTOM' ? 'Customized package' : 'Event menu')}</dd></div>
                <div><dt className="text-ink-4 text-xs">{t('Delivery')}</dt><dd className="font-medium">{dateTime(payload.deliveryAt)}</dd></div>
                <div><dt className="text-ink-4 text-xs">{t('Address')}</dt><dd className="font-medium">{payload.addressText || '—'}</dd></div>
                <div><dt className="text-ink-4 text-xs">{t('Contact')}</dt><dd className="font-medium">{contactName} · {contactPhone}</dd></div>
                {type === 'EVENT' && <div><dt className="text-ink-4 text-xs">{t('Event')}</dt><dd className="font-medium">{guestCount} {t('guests')} · {eventLocation || '—'}</dd></div>}
                {allergyNotes && <div><dt className="text-ink-4 text-xs">{t('Allergy notes')}</dt><dd className="font-medium text-bad">{allergyNotes}</dd></div>}
              </dl>
              <p className="text-sm text-ink-3">{type === 'EVENT' ? t('Event orders are reviewed by our team. We confirm after checking ingredients, staff and equipment.') : t('After you submit, the Order Manager confirms your order and reserves the ingredients.')}</p>
              {!!submitErr && <div className="mt-3"><ErrorBox error={submitErr} /></div>}
              {(submitErr as ApiError)?.data?.suggestedSlot && (
                <button className="btn-secondary mt-2" onClick={() => setDeliveryAt(toLocalInput(new Date((submitErr as ApiError).data.suggestedSlot as string)))}>{t('Use the nearest free time')}: {dateTime((submitErr as ApiError).data.suggestedSlot as string)}</button>
              )}
              <div className="flex flex-wrap gap-2 mt-5">
                <button className="btn-primary" disabled={!!busy || !quote.data || quote.data.errors.length > 0} onClick={() => submit(false)}>{busy === 'submit' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{t('Submit order')}</button>
                <button className="btn-secondary" disabled={!!busy || !lines.length} onClick={() => submit(true)}>{busy === 'draft' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{t('Save as draft')}</button>
              </div>
            </>
          )}

          <div className="flex justify-between mt-6 pt-4 border-t border-line">
            <button className="btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} className="rtl:rotate-180" />{t('Back')}</button>
            {step < 4 && <button className="btn-primary" disabled={!canNext} onClick={() => setStep(step === 1 && type === 'EVENT' ? 2 : step + 1)}>{t('Next')}<ArrowRight size={16} className="rtl:rotate-180" /></button>}
          </div>
        </div>

        {/* live summary - full price breakdown and availability (UI-09) */}
        <aside className="card p-4 xl:sticky xl:top-20">
          <h3 className="font-bold text-ink mb-3 flex items-center justify-between">{t('Order summary')}{quote.isFetching && <Loader2 size={15} className="animate-spin text-ink-4" />}</h3>
          {!lines.length && <p className="text-sm text-ink-4">{t('Add items to see the price.')}</p>}
          {quote.data && lines.length > 0 && (
            <>
              <ul className="space-y-2 text-sm">
                {quote.data.lines.map((l: any) => (
                  <li key={l.productId}>
                    <div className="flex justify-between gap-2"><span className="text-ink">{l.image} {ar ? l.productNameAr : l.productName} <span className="text-ink-4">× {l.qty}</span></span><span className="tabular-nums font-medium">{money(l.lineTotal)}</span></div>
                    {l.customizations.map((c: any) => <div key={c.optionId} className="text-[11px] text-ink-4 ps-6">↳ {c.label} × {c.qty}{c.priceDelta ? ` (${c.priceDelta > 0 ? '+' : ''}${money(c.priceDelta * c.qty)})` : ''}</div>)}
                  </li>
                ))}
              </ul>
              <dl className="mt-3 pt-3 border-t border-line text-sm space-y-1.5">
                <Row k={t('Subtotal')} v={money(quote.data.subtotal)} />
                <Row k={t('Delivery')} v={money(quote.data.deliveryFee)} />
                {quote.data.serviceFee > 0 && <Row k={t('Service fee')} v={money(quote.data.serviceFee)} />}
                {quote.data.discount > 0 && <Row k={`${t('Discount')}`} v={`− ${money(quote.data.discount)}`} cls="text-ok" sub={quote.data.discountReason} />}
                <Row k={`${t('Tax')} (${Math.round(quote.data.taxRate * 100)}%)`} v={money(quote.data.tax)} />
                <div className="flex justify-between pt-2 border-t border-line text-base font-bold text-ink"><span>{t('Total')}</span><span className="tabular-nums">{money(quote.data.total)}</span></div>
              </dl>
              <div className={`mt-3 rounded-lg px-3 py-2 text-sm flex gap-2 ${quote.data.availability.status === 'AVAILABLE' ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn'}`}>
                {quote.data.availability.status === 'AVAILABLE' ? <CheckCircle2 size={17} className="shrink-0 mt-0.5" /> : <AlertTriangle size={17} className="shrink-0 mt-0.5" />}
                <div>
                  <div className="font-semibold">{quote.data.availability.status === 'AVAILABLE' ? t('Available for this date') : t('Some ingredients are short for this date')}</div>
                  {quote.data.availability.status !== 'AVAILABLE' && <div className="text-xs">{t('You can still submit; our team will confirm or suggest changes.')}</div>}
                </div>
              </div>
              {quote.data.errors.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {quote.data.errors.map((e: string) => <li key={e} className="text-xs text-bad flex gap-1.5"><AlertTriangle size={14} className="shrink-0" />{t(e)}</li>)}
                </ul>
              )}
              {quote.data.suggestedSlot && (
                <button className="btn-secondary btn-sm mt-2 w-full" onClick={() => setDeliveryAt(toLocalInput(new Date(quote.data.suggestedSlot)))}>{t('Use the nearest free time')}: {dateTime(quote.data.suggestedSlot)}</button>
              )}
            </>
          )}
          {quote.error && <ErrorBox error={quote.error} />}
        </aside>
      </div>
    </div>
  );
}

const Row = ({ k, v, cls = '', sub }: { k: string; v: string; cls?: string; sub?: string }) => (
  <div className={`flex justify-between gap-2 ${cls}`}><span className="text-ink-3">{k}{sub && <span className="block text-[11px] text-ink-4">{sub}</span>}</span><span className="tabular-nums">{v}</span></div>
);
