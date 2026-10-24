/* End-to-end run of the presentation demo script (Business Requirements v4.0, Section 15.3).
 * Usage: start the API (:3000) and web (:5173), reset the demo data, then:  node e2e/demo-script.cjs
 * Screenshots are written to docs/screenshots/. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.WEB_URL || 'http://localhost:5173';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

let browser;
const errors = [];
async function session(email, width = 1440, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email}: ${e.message}`));
  await page.goto(`${BASE}/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'Demo@123');
  await page.click('form button.btn-primary');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await page.waitForLoadState('networkidle');
  return { ctx, page };
}
const shot = async (page, name, full = false) => { await page.waitForTimeout(600); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }); };
const step = (n, text) => console.log(`\n[Step ${n}] ${text}`);
const ok = (text) => console.log(`   ✓ ${text}`);

(async () => {
  browser = await chromium.launch();

  // ---------------------------------------------------------------- 1-2 customer builds and submits an order
  step(1, 'Customer browses the catalog and builds 50 Standard Lunch boxes with 10 vegetarian swaps');
  const cust = await session('customer@cateringpro.demo');
  await shot(cust.page, '01-customer-portal');
  await cust.page.goto(`${BASE}/catalog`);
  await cust.page.getByText('Standard Lunch Box').first().click();
  await shot(cust.page, '02-catalog-detail');
  await cust.page.getByRole('button', { name: 'Order this' }).click();
  await cust.page.waitForURL(/order\/new/);
  // the catalog pre-selects a fixed package; go back to choose "Customized package"
  await cust.page.getByRole('button', { name: /Ordering method/ }).click();
  await cust.page.getByRole('button', { name: /Customized package/ }).click();
  await cust.page.getByRole('button', { name: /^Next/ }).click();
  const card = cust.page.locator('div.rounded-xl', { hasText: 'Standard Lunch Box' }).first();
  await card.getByLabel('Quantity').fill('50');
  await cust.page.waitForTimeout(800);
  await shot(cust.page, '03-builder-quantity', true);
  await cust.page.getByRole('button', { name: /^Next/ }).click();
  await cust.page.locator('div.flex.items-center.justify-between', { hasText: 'Vegetarian: moussaka' }).locator('input').fill('10');
  await cust.page.getByPlaceholder('e.g. 2 guests have a nut allergy').fill('1 guest has a nut allergy');
  await cust.page.getByPlaceholder('e.g. deliver to the 14th floor reception').fill('Demo order - deliver to the main reception');
  await cust.page.waitForTimeout(900);
  await shot(cust.page, '04-builder-customize', true);
  ok('50 packages, 10 vegetarian swaps, allergy note entered');

  step(2, 'Customer reviews the full price breakdown and availability, then submits');
  await cust.page.getByRole('button', { name: /^Next/ }).click();
  await cust.page.waitForTimeout(900);
  const summary = await cust.page.locator('aside.card').innerText();
  if (!/Total/.test(summary) || !/Available for this date/.test(summary)) throw new Error('Price summary or availability missing');
  await shot(cust.page, '05-builder-review', true);
  await cust.page.getByRole('button', { name: 'Submit order' }).click();
  await cust.page.waitForURL(/\/orders\/\d+$/);
  const orderUrl = cust.page.url();
  const orderId = orderUrl.split('/').pop();
  const number = (await cust.page.locator('h1').innerText()).replace('Order ', '').trim();
  await shot(cust.page, '06-order-submitted');
  ok(`Order ${number} submitted (status Pending)`);

  // ---------------------------------------------------------------- 3 change-approval loop on the seeded pending order
  step(3, 'Order Manager proposes a new delivery time on a seeded order; the customer approves, which confirms it');
  const om = await session('ordermanager@cateringpro.demo');
  await shot(om.page, '07-order-manager-desk');
  await om.page.goto(`${BASE}/orders?status=PENDING`);
  await om.page.waitForLoadState('networkidle');
  const seeded = om.page.locator('tbody tr', { hasText: 'Acme Technologies' }).filter({ hasNotText: number }).first();
  await seeded.click();
  await om.page.waitForURL(/\/orders\/\d+$/);
  const seededId = om.page.url().split('/').pop();
  await om.page.getByRole('button', { name: 'Change time or price' }).click();
  const dt = om.page.locator('[role=dialog] input[type=datetime-local]');
  const cur = await dt.inputValue();
  const later = cur.replace(/T(\d\d)/, (_, h) => `T${String(Math.min(20, Number(h) + 1)).padStart(2, '0')}`);
  await dt.fill(later);
  await om.page.locator('[role=dialog] textarea').fill('The 1 pm slot is busy; we can deliver one hour later.');
  await shot(om.page, '08-propose-change');
  await om.page.getByRole('button', { name: 'Send to customer' }).click();
  await om.page.getByText('Waiting for the customer to approve a change').waitFor();
  await cust.page.goto(`${BASE}/orders/${seededId}`);
  await cust.page.getByText('Please approve a change to your order').waitFor();
  await shot(cust.page, '09-customer-approves');
  await cust.page.getByRole('button', { name: 'Approve' }).click();
  await cust.page.locator('main').getByText('Confirmed', { exact: true }).first().waitFor();
  ok('Change approved - seeded order is now Confirmed');

  // ---------------------------------------------------------------- 4 manager confirms the new order
  step(4, `Order Manager confirms ${number}: stock reserved, production order and invoice created`);
  await om.page.goto(`${BASE}/orders/${orderId}`);
  await om.page.getByRole('button', { name: 'Confirm order' }).click();
  await om.page.getByText(/Stock reserved and production order created/).waitFor();
  await om.page.waitForTimeout(800);
  await shot(om.page, '10-order-confirmed', true);
  ok('Confirmed');

  // ---------------------------------------------------------------- 5 kitchen
  step(5, 'Kitchen opens the production order (allergy note highlighted), starts it, then marks it ready after the allergen check');
  const k = await session('kitchen@cateringpro.demo');
  const ticket = () => k.page.locator('div.card', { hasText: number }).first();
  await ticket().waitFor();
  await shot(k.page, '11-kitchen-board', true);
  await ticket().getByRole('button', { name: 'Start preparing' }).click();
  await k.page.waitForTimeout(1200);
  await ticket().getByRole('button', { name: 'Mark ready for dispatch' }).click();
  const confirmBtn = k.page.getByRole('button', { name: 'Confirm quality check' });
  await confirmBtn.click();
  await k.page.locator('[role=dialog]').getByText(/Confirm the allergen check/).waitFor();
  ok('Ready without the allergen check is refused (BR-32)');
  await k.page.locator('[role=dialog] input[type=checkbox]').check();
  await shot(k.page, '12-kitchen-allergen-check');
  await confirmBtn.click();
  await k.page.getByText(/Marked Ready for Dispatch/).waitFor();
  ok('Ready for Dispatch');

  // ---------------------------------------------------------------- 6 dispatch
  step(6, 'Delivery Manager assigns an available driver (Karim)');
  const dm = await session('delivery@cateringpro.demo');
  const dcard = dm.page.locator('div.card', { hasText: number }).first();
  await dcard.waitFor();
  await shot(dm.page, '13-dispatch-board');
  await dcard.getByRole('button', { name: 'Assign driver' }).click();
  await dm.page.locator('[role=dialog] select').selectOption({ label: 'Karim Ali - Available' });
  await dm.page.getByRole('button', { name: 'Save' }).click();
  await dm.page.getByText(/Driver assigned/).waitFor();
  ok('Out for delivery with Karim Ali');

  // ---------------------------------------------------------------- 7 driver on a phone-size screen
  step(7, 'Driver marks the order Delivered with proof, on a phone-size screen');
  const drv = await session('driver@cateringpro.demo', 390, 844);
  const dc = drv.page.locator('div.card', { hasText: number }).first();
  await dc.waitFor();
  await shot(drv.page, '14-driver-phone');
  await dc.getByRole('button', { name: 'Delivered' }).click();
  await drv.page.locator('[role=dialog] input').nth(1).fill('3 boxes left with reception');
  await drv.page.getByRole('button', { name: 'Save' }).click();
  await drv.page.getByText(/Delivered. Customer notified/).waitFor();
  ok('Delivered, proof recorded');

  // ---------------------------------------------------------------- 8 customer timeline + rating
  step(8, 'Customer sees the full timeline and rates the order');
  await cust.page.goto(orderUrl);
  await cust.page.getByRole('button', { name: 'Rate this order' }).click();
  await cust.page.locator('[role=dialog] textarea').fill('Great food and right on time!');
  await cust.page.getByRole('button', { name: 'Send rating' }).click();
  await cust.page.getByText('Thank you for your rating!').waitFor();
  await cust.page.waitForTimeout(800);
  await shot(cust.page, '15-customer-timeline-rated', true);
  ok('Rated');

  // ---------------------------------------------------------------- 9 accountant
  step(9, 'Accountant sees the invoice (from the order price snapshot) and records the payment');
  const acc = await session('accountant@cateringpro.demo');
  const row = acc.page.locator('tbody tr', { hasText: number }).first();
  await row.waitFor();
  await shot(acc.page, '16-finance');
  await row.getByRole('button', { name: 'Record payment' }).click();
  await acc.page.locator('[role=dialog] input').nth(1).fill('TRX-DEMO-001');
  await acc.page.getByRole('button', { name: 'Save' }).click();
  await acc.page.getByText(/Payment recorded/).waitFor();
  await acc.page.waitForTimeout(700);
  if (!(await acc.page.locator('tbody tr', { hasText: number }).first().innerText()).includes('Paid')) throw new Error('Invoice not marked Paid');
  ok('Invoice Paid');

  // ---------------------------------------------------------------- 10 CEO
  step(10, 'CEO sees KPI tiles, charts and the KPI scorecard');
  const ceo = await session('ceo@cateringpro.demo');
  await ceo.page.getByText('KPI scorecard').waitFor();
  await shot(ceo.page, '17-executive-dashboard', true);
  await ceo.page.getByText('Delayed orders now').click();
  await ceo.page.waitForURL(/delayed=true/);
  ok('Executive dashboard and drill-down work');

  // ---------------------------------------------------------------- 11 RBAC
  step(11, 'Driver types the address of the finance page directly into the browser');
  await drv.page.setViewportSize({ width: 1280, height: 800 });
  await drv.page.goto(`${BASE}/finance`);
  await drv.page.getByText('Access denied', { exact: true }).waitFor();
  await shot(drv.page, '18-driver-access-denied');
  await ceo.page.goto(`${BASE}/admin/audit`);
  await ceo.page.getByRole('button', { name: 'Access denied' }).click();
  await ceo.page.locator('tbody tr', { hasText: 'Karim Ali' }).first().waitFor();
  await shot(ceo.page, '19-audit-log-denied');
  ok('Server refused (403) and the attempt is in the audit log');

  // ---------------------------------------------------------------- extra screens for the presentation
  await ceo.page.goto(`${BASE}/admin/roles`); await shot(ceo.page, '20-roles-permissions');
  const inv = await session('inventory@cateringpro.demo'); await shot(inv.page, '21-inventory');
  const ev = await session('events@cateringpro.demo'); await shot(ev.page, '22-events');
  const cm = await session('catalog@cateringpro.demo'); await shot(cm.page, '23-catalog-management');
  await cust.page.evaluate(() => localStorage.setItem('cp_lang', 'ar'));
  await cust.page.goto(`${BASE}/portal`); await cust.page.waitForLoadState('networkidle'); await shot(cust.page, '24-customer-portal-arabic');
  await cust.page.evaluate(() => localStorage.setItem('cp_lang', 'en'));

  console.log(errors.length ? `\nPage errors:\n${errors.join('\n')}` : '\nNo page errors.');
  console.log(`\nAll 11 steps passed. Screenshots in ${OUT}`);
  await browser.close();
})().catch(async (e) => { console.error('\nFAILED:', e.message); await browser?.close(); process.exit(1); });
