import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';

let app: INestApplication;
const http = () => request(app.getHttpServer());
const tokens: Record<string, string> = {};
const login = async (email: string) => {
  if (tokens[email]) return tokens[email];
  const r = await http().post('/api/auth/login').send({ email, password: 'Demo@123' }).expect(201);
  return (tokens[email] = r.body.token);
};
const as = (email: string) => ({
  get: async (url: string) => http().get(url).set('Authorization', `Bearer ${await login(email)}`),
  post: async (url: string, body: object = {}) => http().post(url).set('Authorization', `Bearer ${await login(email)}`).send(body),
  put: async (url: string, body: object = {}) => http().put(url).set('Authorization', `Bearer ${await login(email)}`).send(body),
});
const C = as('customer@cateringpro.demo'), OTHER = as('omar@nilebank.demo'), OM = as('ordermanager@cateringpro.demo'), K = as('kitchen@cateringpro.demo');
const DM = as('delivery@cateringpro.demo'), DRV = as('driver@cateringpro.demo'), ACC = as('accountant@cateringpro.demo'), CEO = as('ceo@cateringpro.demo'), INV = as('inventory@cateringpro.demo');

let P: Record<string, any> = {};
let zoneNewCairo = 0;
const days = (n: number, h = 12) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const base = () => ({ type: 'DAILY', mode: 'PACKAGE', zoneId: zoneNewCairo, addressText: 'Test address', contactName: 'Tester', contactPhone: '0100' });

beforeAll(async () => {
  app = await createApp();
  await app.listen(0);
  const cat = await C.get('/api/catalog/products');
  P = Object.fromEntries(cat.body.map((p: any) => [p.sku, p]));
  zoneNewCairo = (await C.get('/api/catalog/zones')).body.find((z: any) => z.name === 'New Cairo').id;
});
afterAll(async () => { await app.close(); });

describe('Authentication and RBAC (UC-05, FR-31 to FR-34, NFR-09)', () => {
  it('rejects a wrong password and locks after 5 failures', async () => {
    for (let i = 0; i < 4; i++) await http().post('/api/auth/login').send({ email: 'driver3@cateringpro.demo', password: 'wrong' }).expect(401);
    const fifth = await http().post('/api/auth/login').send({ email: 'driver3@cateringpro.demo', password: 'wrong' }).expect(401);
    expect(fifth.body.message).toMatch(/locked/i);
    await http().post('/api/auth/login').send({ email: 'driver3@cateringpro.demo', password: 'Demo@123' }).expect(423);
  });

  it('lets a new user self-register, always as a Customer, and logs them in', async () => {
    const r = await http().post('/api/auth/register').send({ name: 'New Guest', email: 'newguest@cateringpro.demo', password: 'Demo@123' }).expect(201);
    expect(r.body.token).toBeTruthy();
    expect(r.body.user.role.code).toBe('CUSTOMER');
    expect(r.body.user.isSuperAdmin).toBe(false);
    await http().post('/api/auth/register').send({ name: 'Dup', email: 'newguest@cateringpro.demo', password: 'Demo@123' }).expect(400);
  });

  it('refuses requests without a token', () => http().get('/api/orders').expect(401));

  it('refuses a driver calling the finance API directly, and records it in the audit log', async () => {
    const r = await DRV.get('/api/finance/invoices');
    expect(r.status).toBe(403);
    const audit = await CEO.get('/api/admin/audit?result=DENIED');
    expect(audit.body.some((a: any) => a.resource.includes('/api/finance/invoices') && a.userName === 'Karim Ali')).toBe(true);
  });

  it('opens the right home per role', async () => {
    const me = await K.get('/api/auth/me');
    expect(me.body.role.homePath).toBe('/kitchen');
    expect(me.body.permissions['finance.view']).toBeUndefined();
  });

  it('customers see only their own orders (BR-10)', async () => {
    const mine = await C.get('/api/orders?pageSize=100');
    const others = await OTHER.get('/api/orders?pageSize=100');
    const foreign = others.body.items[0];
    expect(mine.body.items.every((o: any) => o.customerName === 'Nour Hassan')).toBe(true);
    expect((await C.get(`/api/orders/${foreign.id}`)).status).toBe(404);
  });

  it('only the Super Admin can change permissions (BR-14)', async () => {
    const r = await OM.put('/api/admin/roles/1/permissions', { code: 'orders.view', scope: 'ALL' });
    expect(r.status).toBe(403);
  });
});

describe('Pricing and validation (FR-54, FR-59, FR-60)', () => {
  it('prices a fixed package: subtotal + delivery + tax', async () => {
    const r = await C.post('/api/orders/quote', { ...base(), deliveryAt: days(3), lines: [{ productId: P['P-STD'].id, qty: 30 }] });
    expect(r.status).toBe(201);
    expect(r.body.subtotal).toBe(4500);
    expect(r.body.deliveryFee).toBe(80);
    expect(r.body.tax).toBe(641.2);
    expect(r.body.total).toBe(5221.2);
    expect(r.body.errors).toEqual([]);
  });

  it('applies paid extras and the quantity discount', async () => {
    const opt = P['P-STD'].options.find((o: any) => o.label.startsWith('Beef kofta'));
    const r = await C.post('/api/orders/quote', { ...base(), mode: 'CUSTOM', deliveryAt: days(3), lines: [{ productId: P['P-STD'].id, qty: 100, customizations: [{ optionId: opt.id, qty: 10 }] }] });
    expect(r.body.subtotal).toBe(15150); // 100 x 150 + 10 x 15
    expect(r.body.discount).toBe(757.5); // 5% for 100+ units
    expect(r.body.total).toBe(Math.round((15150 + 80 - 757.5) * 1.14 * 100) / 100);
  });

  it('reports minimum quantity and lead time problems', async () => {
    const soon = new Date(Date.now() + 3 * 3600_000).toISOString();
    const r = await C.post('/api/orders/quote', { ...base(), deliveryAt: soon, lines: [{ productId: P['P-STD'].id, qty: 5 }] });
    expect(r.body.errors.join(' ')).toMatch(/Minimum quantity/);
    expect(r.body.errors.join(' ')).toMatch(/notice/);
  });

  it('rejects options that the package does not allow (BR-19)', async () => {
    const foreignOpt = P['P-PRM'].options[0];
    const r = await C.post('/api/orders/quote', { ...base(), deliveryAt: days(3), lines: [{ productId: P['P-STD'].id, qty: 20, customizations: [{ optionId: foreignOpt.id, qty: 2 }] }] });
    expect(r.body.errors.join(' ')).toMatch(/not allowed/);
  });

  it('a submit with errors is refused', async () => {
    const r = await C.post('/api/orders', { ...base(), deliveryAt: days(3), submit: true, lines: [{ productId: P['P-STD'].id, qty: 2 }] });
    expect(r.status).toBe(400);
  });
});

describe('Order lifecycle, stock and fulfilment (Section 13, UC-08 to UC-10)', () => {
  let orderId = 0;
  let poId = 0;

  it('customer submits; order is Pending with a number', async () => {
    const veg = P['P-STD'].options.find((o: any) => o.label.startsWith('Vegetarian'));
    const r = await C.post('/api/orders', { ...base(), mode: 'CUSTOM', deliveryAt: days(3, 13), submit: true, allergyNotes: '1 guest: nut allergy',
      lines: [{ productId: P['P-STD'].id, qty: 50, customizations: [{ optionId: veg.id, qty: 10 }] }] });
    expect(r.status).toBe(201);
    expect(r.body.number).toMatch(/^CP-\d{4}-\d{5}$/);
    orderId = r.body.id;
    expect((await C.get(`/api/orders/${orderId}`)).body.status).toBe('PENDING');
  });

  it('kitchen staff cannot confirm orders', async () => {
    expect((await K.post(`/api/orders/${orderId}/confirm`)).status).toBe(403);
  });

  it('confirmation reserves stock from the recipes and creates production + invoice', async () => {
    const before = (await INV.get('/api/inventory/levels')).body.find((i: any) => i.name === 'Chicken breast').reserved;
    const r = await OM.post(`/api/orders/${orderId}/confirm`);
    expect(r.status).toBe(201);
    const o = (await OM.get(`/api/orders/${orderId}`)).body;
    expect(o.status).toBe('CONFIRMED');
    expect(o.invoice.number).toMatch(/^INV-/);
    const items = Object.fromEntries(o.production.items.map((i: any) => [i.name, Number(i.portions)]));
    expect(items['Grilled Chicken Breast']).toBe(40); // 50 packages - 10 vegetarian swaps
    expect(items['Vegetable Moussaka']).toBe(10);
    poId = o.production.id;
    const after = (await INV.get('/api/inventory/levels')).body.find((i: any) => i.name === 'Chicken breast').reserved;
    expect(Math.round((after - before) * 1000) / 1000).toBe(8); // 40 portions x 0.2 kg
  });

  it('refuses an invalid transition', async () => {
    const r = await OM.post(`/api/orders/${orderId}/confirm`);
    expect(r.status).toBe(409);
  });

  it('catalog price changes do not touch confirmed orders (FR-63)', async () => {
    const p = P['P-STD'];
    const body = { sku: p.sku, type: p.type, name: p.name, nameAr: p.nameAr, categoryId: p.category.id, price: 999, unit: p.unit, minQty: p.minQty, leadTimeHours: p.leadTimeHours };
    expect((await CEO.put(`/api/catalog/products/${p.id}`, body)).status).toBe(200);
    const o = (await OM.get(`/api/orders/${orderId}`)).body;
    expect(o.lines[0].unitPrice).toBe(150);
    await CEO.put(`/api/catalog/products/${p.id}`, { ...body, price: 150 });
  });

  it('allergen check is required before dispatch (BR-32)', async () => {
    expect((await K.post(`/api/production/${poId}/start`)).status).toBe(201);
    const bad = await K.post(`/api/production/${poId}/ready`, {});
    expect(bad.status).toBe(400);
    expect((await K.post(`/api/production/${poId}/ready`, { allergenChecked: true })).status).toBe(201);
  });

  it('assigns a driver; only that driver can complete it', async () => {
    const drivers = (await DM.get('/api/delivery/drivers')).body;
    const karim = drivers.find((d: any) => d.name === 'Karim Ali');
    expect((await DM.post(`/api/delivery/orders/${orderId}/assign`, { driverId: karim.id })).status).toBe(201);
    const ahmed = drivers.find((d: any) => d.name === 'Ahmed Samir');
    expect((await DM.post(`/api/delivery/orders/${orderId}/assign`, { driverId: ahmed.id })).status).toBe(409);
    const mine = (await DRV.get('/api/delivery/mine')).body.find((d: any) => d.orderId === orderId);
    const other = as('driver2@cateringpro.demo');
    expect((await other.post(`/api/delivery/${mine.id}/complete`, { recipientName: 'X' })).status).toBe(404);
    expect((await DRV.post(`/api/delivery/${mine.id}/complete`, { recipientName: 'Tester' })).status).toBe(201);
    expect((await C.get(`/api/orders/${orderId}`)).body.status).toBe('DELIVERED');
  });

  it('a delivered order cannot be cancelled (BR-29) but can be rated', async () => {
    expect((await C.post(`/api/orders/${orderId}/cancel`, { reason: 'x' })).status).toBe(409);
    expect((await C.post(`/api/orders/${orderId}/rate`, { food: 5, punctuality: 4, service: 5 })).status).toBe(201);
  });

  it('accountant records the payment; invoice becomes Paid', async () => {
    const inv = (await OM.get(`/api/orders/${orderId}`)).body.invoice;
    const r = await ACC.post(`/api/finance/invoices/${inv.id}/payments`, { amount: inv.amount, method: 'BANK_TRANSFER', reference: 'T1' });
    expect(r.body.status).toBe('PAID');
  });

  it('cancelling a confirmed order releases its reservations', async () => {
    const r = await C.post('/api/orders', { ...base(), deliveryAt: days(4), submit: true, lines: [{ productId: P['P-STD'].id, qty: 20 }] });
    await OM.post(`/api/orders/${r.body.id}/confirm`);
    const reservedBefore = (await INV.get('/api/inventory/reservations')).body.filter((x: any) => x.orderId === r.body.id).length;
    expect(reservedBefore).toBeGreaterThan(0);
    expect((await C.post(`/api/orders/${r.body.id}/cancel`, { reason: 'Meeting moved' })).status).toBe(201);
    const reservedAfter = (await INV.get('/api/inventory/reservations')).body.filter((x: any) => x.orderId === r.body.id).length;
    expect(reservedAfter).toBe(0);
  });

  it('a stock shortage blocks confirmation and returns the shortage list (FR-68)', async () => {
    const r = await C.post('/api/orders', { ...base(), deliveryAt: days(3, 15), submit: true, lines: [{ productId: P['P-PRM'].id, qty: 60 }] });
    expect(r.status).toBe(201);
    const c = await OM.post(`/api/orders/${r.body.id}/confirm`);
    expect(c.status).toBe(409);
    expect(c.body.shortages.some((s: any) => s.name === 'Sea bass fillet')).toBe(true);
  });

  it('change proposal: customer approval confirms the order (BR-02)', async () => {
    const r = await C.post('/api/orders', { ...base(), deliveryAt: days(5, 12), submit: true, lines: [{ productId: P['P-STD'].id, qty: 15 }] });
    const p = await OM.post(`/api/orders/${r.body.id}/propose-change`, { deliveryAt: days(5, 14), reason: 'Slot full', discountPercent: 5 });
    expect(p.status).toBe(201);
    expect((await OM.post(`/api/orders/${r.body.id}/propose-change`, { discountPercent: 50, reason: 'too much' })).status).toBe(409);
    const a = await C.post(`/api/orders/${r.body.id}/respond-change`, { approve: true });
    expect(a.body.status).toBe('CONFIRMED');
    const o = (await C.get(`/api/orders/${r.body.id}`)).body;
    expect(o.discount).toBe(112.5);
    expect(new Date(o.deliveryAt).toISOString()).toBe(days(5, 14));
  });
});

describe('Dashboards (UC-04)', () => {
  it('executive KPIs are available to the CEO only', async () => {
    const r = await CEO.get('/api/dashboard/executive?period=month');
    expect(r.status).toBe(200);
    expect(r.body.kpis.length).toBe(10);
    expect((await OM.get('/api/dashboard/executive')).status).toBe(403);
  });
});
