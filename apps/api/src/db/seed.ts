/* eslint-disable no-console */
// Demo data for the CateringPro prototype. Run: npm run db:seed (after db:migrate). Password for every account: Demo@123
process.env.TZ ??= 'Africa/Cairo';
process.env.DISABLE_JOBS = '1';
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { eq, inArray, sql } from 'drizzle-orm';
import { AppModule } from '../app.module';
import { AccessService } from '../common/access.service';
import { PERMISSIONS, ROLES } from '../common/permissions';
import { addHours, round2, round3, startOfDay } from '../common/util';
import { DeliveryService } from '../delivery/delivery.service';
import { OrdersService } from '../orders/orders.service';
import { PricingService, LineInput } from '../pricing/pricing.service';
import { ProductionService } from '../production/production.service';
import { SETTING_DEFAULTS } from '../settings/settings.service';
import { DB, Db } from './db.module';
import * as s from './schema';

// deterministic pseudo-random numbers so every reset gives the same demo
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const at = (dayOffset: number, hour: number, minute = 0) => { const d = startOfDay(new Date()); d.setDate(d.getDate() + dayOffset); d.setHours(hour, minute, 0, 0); return d; };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get<Db>(DB);

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users);
  if (n > 0) { console.log('Database already has data. Run "npm run db:reset" to start over.'); await app.close(); return; }

  console.log('Seeding roles and permissions...');
  await db.insert(s.permissions).values(PERMISSIONS);
  const roleIds: Record<string, number> = {};
  for (const r of ROLES) {
    const [row] = await db.insert(s.roles).values({ code: r.code, name: r.name, nameAr: r.nameAr, homePath: r.homePath }).returning();
    roleIds[r.code] = row.id;
    await db.insert(s.rolePermissions).values(r.grants.map(([code, scope]) => ({ roleId: row.id, permissionCode: code, scope: scope ?? 'ALL' })));
  }
  await db.insert(s.settings).values(Object.entries(SETTING_DEFAULTS).map(([key, v]) => ({ key, value: v.value, label: v.label })));

  console.log('Seeding users...');
  const hash = await bcrypt.hash('Demo@123', 10);
  const U = async (email: string, name: string, role: string, extra: Partial<typeof s.users.$inferInsert> = {}) =>
    (await db.insert(s.users).values({ email, name, roleId: roleIds[role], passwordHash: hash, ...extra }).returning())[0];
  const nour = await U('customer@cateringpro.demo', 'Nour Hassan', 'CUSTOMER', { company: 'Acme Technologies', phone: '+20 100 111 2233' });
  const omar = await U('omar@nilebank.demo', 'Omar Farouk', 'CUSTOMER', { company: 'Nile Bank', phone: '+20 122 444 5566' });
  const sara = await U('sara@deltaevents.demo', 'Sara Adel', 'CUSTOMER', { company: 'Delta Events', phone: '+20 111 777 8899' });
  const mona = await U('ordermanager@cateringpro.demo', 'Mona Ibrahim', 'ORDER_MANAGER', { phone: '+20 100 200 3001' });
  const hany = await U('kitchen@cateringpro.demo', 'Chef Hany Mostafa', 'KITCHEN', { phone: '+20 100 200 3002' });
  const tamer = await U('delivery@cateringpro.demo', 'Tamer Saleh', 'DELIVERY_MANAGER', { phone: '+20 100 200 3003' });
  const karim = await U('driver@cateringpro.demo', 'Karim Ali', 'DRIVER', { phone: '+20 100 200 3004', driverStatus: 'AVAILABLE' });
  const youssef = await U('driver2@cateringpro.demo', 'Youssef Nabil', 'DRIVER', { phone: '+20 100 200 3005', driverStatus: 'AVAILABLE' });
  const ahmed = await U('driver3@cateringpro.demo', 'Ahmed Samir', 'DRIVER', { phone: '+20 100 200 3006', driverStatus: 'OFF_DUTY' });
  const laila = await U('inventory@cateringpro.demo', 'Laila Fathy', 'INVENTORY_MANAGER', { phone: '+20 100 200 3007' });
  await U('accountant@cateringpro.demo', 'Rania Kamal', 'ACCOUNTANT', { phone: '+20 100 200 3008' });
  await U('ceo@cateringpro.demo', 'Khaled Mansour', 'CEO_ADMIN', { phone: '+20 100 200 3009', isSuperAdmin: true });
  await U('catalog@cateringpro.demo', 'Dina Youssef', 'CATALOG_MANAGER', { phone: '+20 100 200 3010' });
  await U('events@cateringpro.demo', 'Hossam Reda', 'EVENT_COORDINATOR', { phone: '+20 100 200 3011' });

  console.log('Seeding zones and addresses...');
  const zoneRows = await db.insert(s.deliveryZones).values([
    { name: 'New Cairo', nameAr: 'القاهرة الجديدة', fee: 80, minOrder: 1000 },
    { name: 'Nasr City', nameAr: 'مدينة نصر', fee: 60, minOrder: 800 },
    { name: 'Downtown', nameAr: 'وسط البلد', fee: 50, minOrder: 600 },
    { name: 'Maadi', nameAr: 'المعادي', fee: 70, minOrder: 800 },
    { name: 'Heliopolis', nameAr: 'مصر الجديدة', fee: 60, minOrder: 800 },
    { name: 'Sheikh Zayed', nameAr: 'الشيخ زايد', fee: 120, minOrder: 1500 },
  ]).returning();
  const Z = Object.fromEntries(zoneRows.map((z) => [z.name, z.id]));
  const addr = {
    nour: { line: 'Acme Technologies HQ, Building B2, 90th Street, Fifth Settlement', zoneId: Z['New Cairo'], contactName: 'Nour Hassan', contactPhone: '+20 100 111 2233' },
    omar: { line: 'Nile Bank Tower, 12 Corniche El Nil, Floor 14', zoneId: Z.Downtown, contactName: 'Omar Farouk', contactPhone: '+20 122 444 5566' },
    sara: { line: 'Delta Events Studio, 9 Road 233, Degla', zoneId: Z.Maadi, contactName: 'Sara Adel', contactPhone: '+20 111 777 8899' },
  };
  await db.insert(s.addresses).values([
    { userId: nour.id, label: 'Office', ...addr.nour },
    { userId: nour.id, label: 'Training centre', line: 'Acme Academy, 15 Abbas El Akkad, Nasr City', zoneId: Z['Nasr City'], contactName: 'Mahmoud (reception)', contactPhone: '+20 100 333 4455' },
    { userId: omar.id, label: 'Head office', ...addr.omar },
    { userId: sara.id, label: 'Studio', ...addr.sara },
  ]);

  console.log('Seeding catalog, ingredients and recipes...');
  const cats = await db.insert(s.categories).values([
    { name: 'Main Dishes', nameAr: 'أطباق رئيسية', sort: 1 }, { name: 'Sides', nameAr: 'أطباق جانبية', sort: 2 },
    { name: 'Salads & Dips', nameAr: 'سلطات وصوصات', sort: 3 }, { name: 'Drinks', nameAr: 'مشروبات', sort: 4 },
    { name: 'Desserts & Bakery', nameAr: 'حلويات ومخبوزات', sort: 5 }, { name: 'Lunch & Breakfast Packages', nameAr: 'باقات الغداء والإفطار', sort: 6 },
    { name: 'Event Menus', nameAr: 'قوائم الفعاليات', sort: 7 }, { name: 'Catering Services', nameAr: 'خدمات التموين', sort: 8 },
  ]).returning();
  const C = Object.fromEntries(cats.map((c) => [c.name, c.id]));

  const ingDefs: [string, string, string, number, number, string][] = [
    ['Chicken breast', 'صدور دجاج', 'kg', 10, 180, 'Cairo Poultry Co.'], ['Beef mince', 'لحم مفروم', 'kg', 8, 420, 'Al Ahram Meats'],
    ['Eggplant', 'باذنجان', 'kg', 5, 25, 'Obour Market'], ['Sea bass fillet', 'فيليه قاروص', 'kg', 5, 380, 'Red Sea Fisheries'],
    ['Egyptian rice', 'أرز مصري', 'kg', 10, 40, 'Delta Grains'], ['Penne pasta', 'مكرونة قلم', 'kg', 5, 45, 'Delta Grains'],
    ['Lettuce', 'خس', 'kg', 3, 30, 'Obour Market'], ['Tomatoes', 'طماطم', 'kg', 5, 20, 'Obour Market'],
    ['Cucumber', 'خيار', 'kg', 3, 18, 'Obour Market'], ['Onions', 'بصل', 'kg', 3, 15, 'Obour Market'],
    ['Olive oil', 'زيت زيتون', 'l', 3, 250, 'Siwa Oils'], ['Spice mix', 'خلطة توابل', 'kg', 1, 300, 'Harraz Spices'],
    ['Lemons', 'ليمون', 'kg', 1, 35, 'Obour Market'], ['Sesame paste', 'طحينة خام', 'kg', 2, 160, 'El Rashidi'],
    ['Mineral water 600ml', 'مياه معدنية', 'pcs', 100, 5, 'Nestlé Pure Life'], ['Oranges', 'برتقال', 'kg', 10, 25, 'Obour Market'],
    ['Semolina', 'سميد', 'kg', 3, 30, 'Delta Grains'], ['Sugar', 'سكر', 'kg', 3, 35, 'Delta Grains'],
    ['Butter', 'زبدة', 'kg', 2, 380, 'Juhayna'], ['Almonds', 'لوز', 'kg', 1, 600, 'Harraz Spices'],
    ['Mixed fruit', 'فواكه مشكلة', 'kg', 5, 60, 'Obour Market'], ['Flour', 'دقيق', 'kg', 5, 25, 'Delta Grains'],
    ['Coffee beans', 'بن', 'kg', 1, 900, 'Abu Auf'],
  ];
  const ingRows = await db.insert(s.ingredients).values(ingDefs.map(([name, nameAr, unit, th, cost, supplier]) => ({ name, nameAr, unit, lowStockThreshold: th, costPerUnit: cost, supplier }))).returning();
  const I = Object.fromEntries(ingRows.map((i) => [i.name, i.id]));

  type ItemDef = { sku: string; name: string; nameAr: string; cat: string; price: number; unit: string; tags: string[]; allergens: string[]; image: string; desc: string; recipe: [string, number][] };
  const items: ItemDef[] = [
    { sku: 'F-CHK', name: 'Grilled Chicken Breast', nameAr: 'صدور دجاج مشوية', cat: 'Main Dishes', price: 85, unit: 'portion', tags: ['halal', 'high-protein'], allergens: [], image: '🍗', desc: 'Marinated chicken breast, chargrilled, 180 g', recipe: [['Chicken breast', 0.2], ['Spice mix', 0.005], ['Olive oil', 0.01]] },
    { sku: 'F-KFT', name: 'Beef Kofta', nameAr: 'كفتة لحم', cat: 'Main Dishes', price: 95, unit: 'portion', tags: ['halal'], allergens: [], image: '🍢', desc: 'Charcoal beef kofta with onion and parsley', recipe: [['Beef mince', 0.18], ['Onions', 0.03], ['Spice mix', 0.005]] },
    { sku: 'F-MSK', name: 'Vegetable Moussaka', nameAr: 'مسقعة خضار', cat: 'Main Dishes', price: 70, unit: 'portion', tags: ['vegetarian', 'vegan'], allergens: [], image: '🍆', desc: 'Oven-baked eggplant in tomato sauce', recipe: [['Eggplant', 0.25], ['Tomatoes', 0.08], ['Olive oil', 0.02]] },
    { sku: 'F-FSH', name: 'Grilled Sea Bass Fillet', nameAr: 'فيليه قاروص مشوي', cat: 'Main Dishes', price: 120, unit: 'portion', tags: ['pescatarian'], allergens: ['fish'], image: '🐟', desc: 'Sea bass fillet with lemon and herbs', recipe: [['Sea bass fillet', 0.2], ['Lemons', 0.03], ['Olive oil', 0.01]] },
    { sku: 'F-RCE', name: 'Vermicelli Rice', nameAr: 'أرز بالشعرية', cat: 'Sides', price: 25, unit: 'portion', tags: ['vegetarian'], allergens: ['gluten'], image: '🍚', desc: 'Egyptian rice with toasted vermicelli', recipe: [['Egyptian rice', 0.1], ['Butter', 0.005]] },
    { sku: 'F-PST', name: 'Penne Arrabbiata', nameAr: 'مكرونة أرابياتا', cat: 'Sides', price: 35, unit: 'portion', tags: ['vegetarian'], allergens: ['gluten'], image: '🍝', desc: 'Penne in spicy tomato sauce', recipe: [['Penne pasta', 0.12], ['Tomatoes', 0.06], ['Olive oil', 0.01]] },
    { sku: 'F-SLD', name: 'Green Salad', nameAr: 'سلطة خضراء', cat: 'Salads & Dips', price: 30, unit: 'portion', tags: ['vegan', 'gluten-free'], allergens: [], image: '🥗', desc: 'Lettuce, tomato and cucumber with lemon dressing', recipe: [['Lettuce', 0.08], ['Tomatoes', 0.05], ['Cucumber', 0.05], ['Olive oil', 0.01]] },
    { sku: 'F-TAH', name: 'Tahini Dip', nameAr: 'طحينة', cat: 'Salads & Dips', price: 15, unit: 'portion', tags: ['vegan', 'gluten-free'], allergens: ['sesame'], image: '🥣', desc: 'Sesame tahini with lemon', recipe: [['Sesame paste', 0.04], ['Lemons', 0.01]] },
    { sku: 'F-WTR', name: 'Mineral Water 600 ml', nameAr: 'مياه معدنية ٦٠٠ مل', cat: 'Drinks', price: 10, unit: 'bottle', tags: ['vegan'], allergens: [], image: '💧', desc: 'Chilled mineral water', recipe: [['Mineral water 600ml', 1]] },
    { sku: 'F-OJ', name: 'Fresh Orange Juice', nameAr: 'عصير برتقال طازج', cat: 'Drinks', price: 25, unit: 'bottle', tags: ['vegan', 'gluten-free'], allergens: [], image: '🍊', desc: 'Freshly squeezed, 330 ml', recipe: [['Oranges', 0.35]] },
    { sku: 'F-CFE', name: 'Coffee', nameAr: 'قهوة', cat: 'Drinks', price: 15, unit: 'cup', tags: ['vegan'], allergens: [], image: '☕', desc: 'Freshly brewed coffee', recipe: [['Coffee beans', 0.012]] },
    { sku: 'F-BSB', name: 'Basbousa', nameAr: 'بسبوسة', cat: 'Desserts & Bakery', price: 25, unit: 'piece', tags: ['vegetarian'], allergens: ['gluten', 'dairy', 'nuts'], image: '🍰', desc: 'Semolina cake with syrup and almonds', recipe: [['Semolina', 0.06], ['Sugar', 0.03], ['Butter', 0.01], ['Almonds', 0.005]] },
    { sku: 'F-FRT', name: 'Fresh Fruit Cup', nameAr: 'كوب فواكه طازجة', cat: 'Desserts & Bakery', price: 30, unit: 'piece', tags: ['vegan', 'gluten-free'], allergens: [], image: '🍓', desc: 'Seasonal fruit, 150 g', recipe: [['Mixed fruit', 0.15]] },
    { sku: 'F-CRS', name: 'Butter Croissant', nameAr: 'كرواسون بالزبدة', cat: 'Desserts & Bakery', price: 20, unit: 'piece', tags: ['vegetarian'], allergens: ['gluten', 'dairy', 'eggs'], image: '🥐', desc: 'Freshly baked every morning', recipe: [['Flour', 0.06], ['Butter', 0.02]] },
  ];
  const P: Record<string, number> = {};
  for (const it of items) {
    const [p] = await db.insert(s.products).values({ sku: it.sku, type: 'FOOD_ITEM', name: it.name, nameAr: it.nameAr, description: it.desc, categoryId: C[it.cat], price: it.price,
      unit: it.unit, dietaryTags: it.tags, allergens: it.allergens, image: it.image }).returning();
    P[it.sku] = p.id;
    await db.insert(s.recipeLines).values(it.recipe.map(([ing, q]) => ({ productId: p.id, ingredientId: I[ing], qtyPerPortion: q })));
  }

  type PkgDef = { sku: string; type: 'PACKAGE' | 'EVENT_MENU'; name: string; nameAr: string; cat: string; price: number; unit: string; min: number; lead: number; image: string; desc: string; tags: string[]; allergens: string[];
    comps: [string, number][]; opts: { kind: 'SUBSTITUTION' | 'EXTRA'; label: string; labelAr: string; from?: string; to: string; delta: number }[] };
  const pkgs: PkgDef[] = [
    { sku: 'P-STD', type: 'PACKAGE', name: 'Standard Lunch Box', nameAr: 'علبة غداء قياسية', cat: 'Lunch & Breakfast Packages', price: 150, unit: 'package', min: 10, lead: 24, image: '🍱',
      desc: 'Grilled chicken, vermicelli rice, green salad and water', tags: ['halal'], allergens: ['gluten'],
      comps: [['F-CHK', 1], ['F-RCE', 1], ['F-SLD', 1], ['F-WTR', 1]],
      opts: [
        { kind: 'SUBSTITUTION', label: 'Vegetarian: moussaka instead of chicken', labelAr: 'نباتي: مسقعة بدل الدجاج', from: 'F-CHK', to: 'F-MSK', delta: 0 },
        { kind: 'SUBSTITUTION', label: 'Beef kofta instead of chicken', labelAr: 'كفتة بدل الدجاج', from: 'F-CHK', to: 'F-KFT', delta: 15 },
        { kind: 'EXTRA', label: 'Add basbousa dessert', labelAr: 'إضافة بسبوسة', to: 'F-BSB', delta: 20 },
        { kind: 'EXTRA', label: 'Add fresh orange juice', labelAr: 'إضافة عصير برتقال', to: 'F-OJ', delta: 20 },
      ] },
    { sku: 'P-PRM', type: 'PACKAGE', name: 'Premium Lunch Box', nameAr: 'علبة غداء مميزة', cat: 'Lunch & Breakfast Packages', price: 260, unit: 'package', min: 10, lead: 24, image: '🥡',
      desc: 'Sea bass fillet, rice, salad, tahini, fruit cup and water', tags: ['pescatarian'], allergens: ['fish', 'gluten', 'sesame'],
      comps: [['F-FSH', 1], ['F-RCE', 1], ['F-SLD', 1], ['F-TAH', 1], ['F-FRT', 1], ['F-WTR', 1]],
      opts: [
        { kind: 'SUBSTITUTION', label: 'Chicken instead of sea bass', labelAr: 'دجاج بدل القاروص', from: 'F-FSH', to: 'F-CHK', delta: -20 },
        { kind: 'SUBSTITUTION', label: 'Vegetarian: moussaka instead of sea bass', labelAr: 'نباتي: مسقعة بدل القاروص', from: 'F-FSH', to: 'F-MSK', delta: -30 },
        { kind: 'EXTRA', label: 'Add fresh orange juice', labelAr: 'إضافة عصير برتقال', to: 'F-OJ', delta: 20 },
      ] },
    { sku: 'P-BRK', type: 'PACKAGE', name: 'Breakfast Box', nameAr: 'علبة إفطار', cat: 'Lunch & Breakfast Packages', price: 90, unit: 'package', min: 10, lead: 24, image: '🥐',
      desc: 'Two croissants, fruit cup and fresh orange juice', tags: ['vegetarian'], allergens: ['gluten', 'dairy', 'eggs'],
      comps: [['F-CRS', 2], ['F-FRT', 1], ['F-OJ', 1]], opts: [{ kind: 'EXTRA', label: 'Add coffee', labelAr: 'إضافة قهوة', to: 'F-CFE', delta: 15 }] },
    { sku: 'P-CFB', type: 'PACKAGE', name: 'Coffee Break (per person)', nameAr: 'استراحة قهوة (للفرد)', cat: 'Lunch & Breakfast Packages', price: 60, unit: 'package', min: 20, lead: 24, image: '☕',
      desc: 'Coffee, croissant, basbousa and water', tags: ['vegetarian'], allergens: ['gluten', 'dairy', 'nuts', 'eggs'],
      comps: [['F-CFE', 1], ['F-CRS', 1], ['F-BSB', 1], ['F-WTR', 1]],
      opts: [{ kind: 'SUBSTITUTION', label: 'Nut-free: fruit cup instead of basbousa', labelAr: 'بدون مكسرات: فواكه بدل البسبوسة', from: 'F-BSB', to: 'F-FRT', delta: 5 }] },
    { sku: 'E-CONF', type: 'EVENT_MENU', name: 'Corporate Conference Menu', nameAr: 'قائمة المؤتمرات', cat: 'Event Menus', price: 420, unit: 'guest', min: 50, lead: 72, image: '🎤',
      desc: 'Buffet lunch: chicken, rice, penne, salad, basbousa, water and coffee - priced per guest', tags: ['halal'], allergens: ['gluten', 'dairy', 'nuts'],
      comps: [['F-CHK', 1], ['F-RCE', 1], ['F-PST', 0.5], ['F-SLD', 1], ['F-BSB', 1], ['F-WTR', 2], ['F-CFE', 1]],
      opts: [
        { kind: 'SUBSTITUTION', label: 'Vegetarian guest: moussaka instead of chicken', labelAr: 'ضيف نباتي: مسقعة بدل الدجاج', from: 'F-CHK', to: 'F-MSK', delta: 0 },
        { kind: 'SUBSTITUTION', label: 'Sea bass instead of chicken', labelAr: 'قاروص بدل الدجاج', from: 'F-CHK', to: 'F-FSH', delta: 40 },
        { kind: 'SUBSTITUTION', label: 'Nut-free guest: fruit instead of basbousa', labelAr: 'ضيف بدون مكسرات: فواكه بدل البسبوسة', from: 'F-BSB', to: 'F-FRT', delta: 0 },
      ] },
    { sku: 'E-WED', type: 'EVENT_MENU', name: 'Wedding Buffet', nameAr: 'بوفيه زفاف', cat: 'Event Menus', price: 650, unit: 'guest', min: 100, lead: 168, image: '💍',
      desc: 'Kofta, chicken, rice, salad, tahini, basbousa, fruit and juice - priced per guest', tags: ['halal'], allergens: ['gluten', 'dairy', 'nuts', 'sesame'],
      comps: [['F-KFT', 1], ['F-CHK', 1], ['F-RCE', 1], ['F-SLD', 1], ['F-TAH', 1], ['F-BSB', 1], ['F-FRT', 1], ['F-OJ', 1]],
      opts: [{ kind: 'SUBSTITUTION', label: 'Vegetarian guest: moussaka instead of kofta', labelAr: 'ضيف نباتي: مسقعة بدل الكفتة', from: 'F-KFT', to: 'F-MSK', delta: 0 }] },
    { sku: 'E-EXD', type: 'EVENT_MENU', name: 'Executive Dinner', nameAr: 'عشاء تنفيذي', cat: 'Event Menus', price: 780, unit: 'guest', min: 20, lead: 72, image: '🍷',
      desc: 'Plated dinner: sea bass, penne, salad, fruit and juice', tags: ['pescatarian'], allergens: ['fish', 'gluten'],
      comps: [['F-FSH', 1], ['F-PST', 1], ['F-SLD', 1], ['F-FRT', 1], ['F-OJ', 1]],
      opts: [{ kind: 'SUBSTITUTION', label: 'Chicken instead of sea bass', labelAr: 'دجاج بدل القاروص', from: 'F-FSH', to: 'F-CHK', delta: -40 }] },
  ];
  for (const pk of pkgs) {
    const [p] = await db.insert(s.products).values({ sku: pk.sku, type: pk.type, name: pk.name, nameAr: pk.nameAr, description: pk.desc, categoryId: C[pk.cat], price: pk.price,
      unit: pk.unit, minQty: pk.min, leadTimeHours: pk.lead, dietaryTags: pk.tags, allergens: pk.allergens, image: pk.image }).returning();
    P[pk.sku] = p.id;
    await db.insert(s.packageComponents).values(pk.comps.map(([sku, q]) => ({ packageId: p.id, itemId: P[sku], qty: q })));
    await db.insert(s.packageOptions).values(pk.opts.map((o) => ({ packageId: p.id, kind: o.kind, label: o.label, labelAr: o.labelAr, fromItemId: o.from ? P[o.from] : null, toItemId: P[o.to], priceDelta: o.delta })));
  }
  const services: [string, string, string, number, string, number, string, string][] = [
    ['S-WTR', 'Waiter service', 'خدمة نُدُل', 150, 'hour', 4, '🤵', 'Per waiter per hour, uniformed staff'],
    ['S-BUF', 'Buffet setup & equipment', 'تجهيز البوفيه', 1800, 'event', 1, '🍽️', 'Buffet tables, chafing dishes, linen and setup crew'],
    ['S-TBL', 'Tableware rental', 'تأجير أدوات المائدة', 18, 'guest', 20, '🍴', 'Plates, cutlery and glasses per guest'],
    ['S-CLN', 'Event cleanup', 'تنظيف بعد الفعالية', 1200, 'event', 1, '🧹', 'Cleanup crew after the event'],
    ['S-VAN', 'Refrigerated delivery van', 'سيارة توصيل مبردة', 450, 'event', 1, '🚚', 'For large or long-distance deliveries'],
  ];
  for (const [sku, name, nameAr, price, unit, min, image, desc] of services) {
    const [p] = await db.insert(s.products).values({ sku, type: 'SERVICE', name, nameAr, description: desc, categoryId: C['Catering Services'], price, unit, minQty: min, leadTimeHours: 72, image }).returning();
    P[sku] = p.id;
  }

  console.log('Seeding stock batches...');
  const batch = (ing: string, qty: number, expDays: number, lot: string, loc = 'Cold room 1') => ({ ingredientId: I[ing], qty, expiresAt: addHours(new Date(), expDays * 24), lotNo: lot, location: loc, receivedAt: addHours(new Date(), -48) });
  const batches = [
    batch('Chicken breast', 30, 6, 'CH-2410-A'), batch('Chicken breast', 30, 10, 'CH-2410-B'), batch('Chicken breast', 4, -1, 'CH-2409-Z'),
    batch('Beef mince', 22, 5, 'BF-2410-A'), batch('Eggplant', 25, 7, 'EG-2410-A', 'Vegetable store'), batch('Sea bass fillet', 3.2, 4, 'SB-2410-A', 'Freezer 1'),
    batch('Egyptian rice', 60, 180, 'RC-2409-A', 'Dry store'), batch('Penne pasta', 20, 200, 'PS-2408-A', 'Dry store'),
    batch('Lettuce', 9, 2, 'LT-2410-A', 'Vegetable store'), batch('Lettuce', 30, 8, 'LT-2410-B', 'Vegetable store'),
    batch('Tomatoes', 30, 6, 'TM-2410-A', 'Vegetable store'), batch('Cucumber', 15, 6, 'CU-2410-A', 'Vegetable store'), batch('Onions', 12, 25, 'ON-2410-A', 'Dry store'),
    batch('Olive oil', 18, 300, 'OO-2407-A', 'Dry store'), batch('Spice mix', 4, 200, 'SP-2408-A', 'Dry store'), batch('Lemons', 6, 12, 'LM-2410-A', 'Vegetable store'),
    batch('Sesame paste', 8, 120, 'TH-2409-A', 'Dry store'), batch('Mineral water 600ml', 900, 365, 'WT-2410-A', 'Drinks store'),
    batch('Oranges', 60, 9, 'OR-2410-A', 'Vegetable store'), batch('Semolina', 15, 150, 'SM-2409-A', 'Dry store'), batch('Sugar', 20, 365, 'SG-2409-A', 'Dry store'),
    batch('Butter', 9, 30, 'BT-2410-A'), batch('Almonds', 2.5, 120, 'AL-2409-A', 'Dry store'), batch('Mixed fruit', 25, 4, 'FR-2410-A', 'Cold room 2'), batch('Mixed fruit', 12, 9, 'FR-2410-B', 'Cold room 2'),
    batch('Flour', 30, 150, 'FL-2409-A', 'Dry store'), batch('Coffee beans', 5, 120, 'CF-2409-A', 'Dry store'),
  ];
  const bRows = await db.insert(s.inventoryBatches).values(batches).returning();
  await db.insert(s.stockMovements).values(bRows.map((b) => ({ ingredientId: b.ingredientId, batchId: b.id, type: 'RECEIPT' as const, qty: b.qty, userId: laila.id, note: `Goods in, lot ${b.lotNo}`, createdAt: b.receivedAt })));

  console.log('Seeding 60 days of order history...');
  const pricing = app.get(PricingService);
  const customers = [nour, omar, sara];
  const addrOf = (id: number) => (id === nour.id ? addr.nour : id === omar.id ? addr.omar : addr.sara);
  const drivers = [karim, youssef, ahmed];
  const templates: (() => LineInput[])[] = [
    () => [{ productId: P['P-STD'], qty: between(15, 60), customizations: rnd() < 0.6 ? [{ optionId: 0, qty: 0 }] : [] }],
    () => [{ productId: P['P-PRM'], qty: between(10, 30) }],
    () => [{ productId: P['P-BRK'], qty: between(15, 40) }],
    () => [{ productId: P['P-CFB'], qty: between(20, 60) }],
    () => [{ productId: P['P-STD'], qty: between(20, 40) }, { productId: P['F-OJ'], qty: between(10, 30) }],
    () => [{ productId: P['F-CHK'], qty: between(10, 25) }, { productId: P['F-RCE'], qty: between(10, 25) }, { productId: P['F-SLD'], qty: between(10, 25) }, { productId: P['F-WTR'], qty: between(20, 40) }],
  ];
  const stdOpts = await db.select().from(s.packageOptions).where(eq(s.packageOptions.packageId, P['P-STD']));
  const ingCost = Object.fromEntries(ingRows.map((i) => [i.id, i]));
  let made = 0;
  for (let day = -60; day <= -1; day++) {
    const count = between(1, 4);
    for (let k = 0; k < count; k++) {
      const cust = pick(customers);
      let lines = pick(templates)();
      lines = lines.map((l) => ({ ...l, customizations: (l.customizations ?? []).filter(() => true).map(() => ({ optionId: pick(stdOpts).id, qty: Math.max(1, Math.floor(l.qty * 0.2)) })) }));
      const deliveryAt = at(day, between(10, 14), pick([0, 30]));
      const a = addrOf(cust.id);
      const q = await pricing.quote(db, { type: 'DAILY', lines, zoneId: a.zoneId, deliveryAt, skipLeadTime: true });
      if (q.errors.some((e) => !e.includes('slot'))) continue;
      const cancelled = rnd() < 0.05;
      const late = !cancelled && rnd() < 0.08;
      const submittedAt = addHours(deliveryAt, -between(26, 72));
      const confirmedAt = new Date(submittedAt.getTime() + between(6, 45) * 60_000);
      const deliveredAt = cancelled ? null : new Date(deliveryAt.getTime() + (late ? between(25, 70) : between(-20, 10)) * 60_000);
      const [o] = await db.insert(s.orders).values({
        number: `TMP-H-${day}-${k}`, customerId: cust.id, type: 'DAILY', mode: lines.length > 1 || lines[0].productId === P['F-CHK'] ? 'DIRECT' : lines[0].customizations?.length ? 'CUSTOM' : 'PACKAGE',
        status: cancelled ? 'CANCELLED' : 'DELIVERED', deliveryAt, addressText: a.line, zoneId: a.zoneId, contactName: a.contactName, contactPhone: a.contactPhone,
        subtotal: q.subtotal, deliveryFee: q.deliveryFee, serviceFee: q.serviceFee, discount: q.discount, tax: q.tax, total: q.total,
        createdAt: submittedAt, updatedAt: deliveredAt ?? submittedAt, submittedAt, confirmedAt: cancelled ? null : confirmedAt, deliveredAt, cancelReason: cancelled ? 'Meeting cancelled' : null,
      }).returning();
      const number = `CP-${String(deliveryAt.getFullYear()).slice(2)}${String(deliveryAt.getMonth() + 1).padStart(2, '0')}-${String(o.id).padStart(5, '0')}`;
      await db.update(s.orders).set({ number }).where(eq(s.orders.id, o.id));
      for (const l of q.lines) {
        const [row] = await db.insert(s.orderLines).values({ orderId: o.id, productId: l.productId, productName: l.productName, productNameAr: l.productNameAr, productType: l.productType, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal }).returning();
        if (l.customizations.length) await db.insert(s.orderLineCustomizations).values(l.customizations.map((c) => ({ lineId: row.id, ...c })));
      }
      const hist: [s.OrderStatus | null, s.OrderStatus, Date, number | null, string][] = [[null, 'DRAFT', submittedAt, cust.id, 'Order created'], ['DRAFT', 'PENDING', submittedAt, cust.id, 'Order submitted']];
      if (cancelled) hist.push(['PENDING', 'CANCELLED', addHours(submittedAt, 3), cust.id, 'Cancelled: Meeting cancelled']);
      else {
        const drv = pick(drivers);
        hist.push(['PENDING', 'CONFIRMED', confirmedAt, mona.id, 'Order confirmed'], ['CONFIRMED', 'PREPARING', addHours(deliveryAt, -3), hany.id, 'Kitchen started preparation; ingredients issued'],
          ['PREPARING', 'READY_FOR_DISPATCH', addHours(deliveryAt, -1.2), hany.id, 'Quality check passed'], ['READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', addHours(deliveryAt, -1), tamer.id, `Assigned to ${drv.name}`]);
        const failedFirst = rnd() < 0.03;
        if (failedFirst) {
          hist.push(['OUT_FOR_DELIVERY', 'DELIVERY_FAILED', addHours(deliveryAt, -0.4), drv.id, 'Delivery failed: Reception closed'], ['DELIVERY_FAILED', 'READY_FOR_DISPATCH', addHours(deliveryAt, -0.3), tamer.id, 'Delivery rescheduled'],
            ['READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', addHours(deliveryAt, -0.25), tamer.id, `Assigned to ${drv.name}`]);
          await db.insert(s.deliveries).values({ orderId: o.id, driverId: drv.id, departAt: addHours(deliveryAt, -1), status: 'FAILED', failureReason: 'Reception closed', completedAt: addHours(deliveryAt, -0.4), createdAt: addHours(deliveryAt, -1) });
        }
        hist.push(['OUT_FOR_DELIVERY', 'DELIVERED', deliveredAt!, drv.id, `Delivered to ${a.contactName}`]);
        await db.insert(s.deliveries).values({ orderId: o.id, driverId: drv.id, departAt: addHours(deliveryAt, -1), status: 'DELIVERED', recipientName: a.contactName, completedAt: deliveredAt, createdAt: addHours(deliveryAt, -1) });
        // production order and stock issue history (feeds food cost and waste KPIs)
        const [po] = await db.insert(s.productionOrders).values({ orderId: o.id, status: 'DONE', scheduledFor: addHours(deliveryAt, -2), startedAt: addHours(deliveryAt, -3), completedAt: addHours(deliveryAt, -1.2), qualityNote: '' }).returning();
        await db.insert(s.productionItems).values(q.portions.map((p) => ({ productionOrderId: po.id, productId: p.productId, name: p.name, portions: p.portions })));
        const mv = q.needs.map((nd) => ({ ingredientId: nd.ingredientId, type: 'ISSUE' as const, qty: nd.qty, orderId: o.id, userId: hany.id, note: `Issued to production ${number}`, createdAt: addHours(deliveryAt, -3) }));
        if (rnd() < 0.3 && q.needs.length) { const w = pick(q.needs); mv.push({ ingredientId: w.ingredientId, type: 'WASTE' as any, qty: round3(w.qty * 0.04), orderId: o.id, userId: hany.id, note: `Waste recorded for ${number}`, createdAt: addHours(deliveryAt, -1.2) }); }
        await db.insert(s.stockMovements).values(mv);
        // invoice and payment
        const dueAt = addHours(confirmedAt, 14 * 24);
        const paid = rnd() < (day < -20 ? 0.92 : 0.6);
        const [inv] = await db.insert(s.invoices).values({ number: `TMP-I-${o.id}`, orderId: o.id, amount: q.total, tax: q.tax, issuedAt: confirmedAt, dueAt,
          status: paid ? 'PAID' : dueAt < new Date() ? 'OVERDUE' : 'UNPAID' }).returning();
        await db.update(s.invoices).set({ number: `INV-${String(confirmedAt.getFullYear()).slice(2)}${String(confirmedAt.getMonth() + 1).padStart(2, '0')}-${String(inv.id).padStart(5, '0')}` }).where(eq(s.invoices.id, inv.id));
        if (paid) await db.insert(s.payments).values({ invoiceId: inv.id, amount: q.total, method: pick(['BANK_TRANSFER', 'BANK_TRANSFER', 'CASH', 'CARD']), reference: `REF-${between(100000, 999999)}`, paidAt: addHours(deliveryAt, between(2, 240)) });
        if (rnd() < 0.6) {
          const lowR = rnd() < 0.07;
          await db.insert(s.ratings).values({ orderId: o.id, food: lowR ? 2 : between(4, 5), punctuality: late ? between(2, 3) : between(4, 5), service: lowR ? 2 : between(4, 5),
            comment: lowR ? 'Food arrived cold.' : pick(['Great food, thank you!', 'On time and tasty.', 'Team loved the kofta.', '', '']), createdAt: addHours(deliveredAt!, 3) });
        }
      }
      await db.insert(s.orderStatusHistory).values(hist.map(([f, t, c, u, cm]) => ({ orderId: o.id, fromStatus: f, toStatus: t, createdAt: c, userId: u, comment: cm })));
      made++;
    }
  }
  console.log(`  ${made} historical orders`);

  console.log('Creating live orders through the real services...');
  const access = app.get(AccessService);
  const ordersSvc = app.get(OrdersService);
  const prod = app.get(ProductionService);
  const delivery = app.get(DeliveryService);
  const as = async (u: { id: number }) => (await access.load(u.id))!;
  const [uNour, uOmar, uSara, uMona, uHany, uTamer] = await Promise.all([nour, omar, sara, mona, hany, tamer].map(as));
  const base = (who: 'nour' | 'omar' | 'sara') => ({ addressText: addr[who].line, zoneId: addr[who].zoneId, contactName: addr[who].contactName, contactPhone: addr[who].contactPhone });
  const opt = async (pkgSku: string, label: string) => (await db.select().from(s.packageOptions).where(eq(s.packageOptions.packageId, P[pkgSku]))).find((o) => o.label.startsWith(label))!.id;

  // A: pending - used for the change-approval demo (step 3)
  await ordersSvc.create(uNour, { type: 'DAILY', mode: 'PACKAGE', lines: [{ productId: P['P-STD'], qty: 30 }], deliveryAt: at(2, 13).toISOString(), ...base('nour'), notes: 'Weekly team lunch', submit: true });
  // draft for the customer
  await ordersSvc.create(uNour, { type: 'DAILY', mode: 'PACKAGE', lines: [{ productId: P['P-BRK'], qty: 20 }], deliveryAt: at(4, 9).toISOString(), ...base('nour'), notes: 'Board meeting breakfast' });
  // B: confirmed, allergy notes
  const b = await ordersSvc.create(uOmar, { type: 'DAILY', mode: 'CUSTOM', lines: [{ productId: P['P-STD'], qty: 40, customizations: [{ optionId: await opt('P-STD', 'Beef kofta'), qty: 8 }, { optionId: await opt('P-STD', 'Vegetarian'), qty: 6 }] }],
    deliveryAt: at(2, 12).toISOString(), ...base('omar'), allergyNotes: '2 guests: nut allergy', notes: 'Deliver to floor 14 reception', submit: true });
  await ordersSvc.confirm(uMona, b.id);
  // C: preparing (moved to today)
  const c = await ordersSvc.create(uOmar, { type: 'DAILY', mode: 'PACKAGE', lines: [{ productId: P['P-PRM'], qty: 12 }], deliveryAt: at(2, 14).toISOString(), ...base('omar'), submit: true });
  await ordersSvc.confirm(uMona, c.id);
  // D: ready for dispatch (today) - for the delivery manager
  const d = await ordersSvc.create(uSara, { type: 'DAILY', mode: 'PACKAGE', lines: [{ productId: P['P-CFB'], qty: 30 }], deliveryAt: at(3, 10).toISOString(), ...base('sara'), submit: true });
  await ordersSvc.confirm(uMona, d.id);
  // E: out for delivery with Youssef
  const e = await ordersSvc.create(uNour, { type: 'DAILY', mode: 'PACKAGE', lines: [{ productId: P['P-STD'], qty: 20 }], deliveryAt: at(3, 13).toISOString(), ...base('nour'), submit: true });
  await ordersSvc.confirm(uMona, e.id);
  const poOf = async (orderId: number) => (await db.select().from(s.productionOrders).where(eq(s.productionOrders.orderId, orderId)))[0].id;
  for (const id of [c.id, d.id, e.id]) await prod.start(uHany, await poOf(id));
  for (const id of [d.id, e.id]) await prod.ready(uHany, await poOf(id), { qualityNote: 'Checked by Chef Hany' });
  await delivery.assign(uTamer, e.id, { driverId: youssef.id });
  const moveToToday = async (id: number, hour: number, minute = 0) => {
    const when = new Date(); when.setHours(hour, minute, 0, 0);
    const t = when < new Date() ? addHours(new Date(), 1.5) : when;
    await db.update(s.orders).set({ deliveryAt: t }).where(eq(s.orders.id, id));
    await db.update(s.productionOrders).set({ scheduledFor: addHours(t, -2) }).where(eq(s.productionOrders.orderId, id));
  };
  const now = new Date();
  await moveToToday(c.id, Math.min(23, now.getHours() + 3));
  await moveToToday(d.id, Math.min(23, now.getHours() + 2));
  await moveToToday(e.id, Math.min(23, now.getHours() + 1), 30);
  // F: confirmed corporate event in 5 days
  const f = await ordersSvc.create(uOmar, { type: 'EVENT', mode: 'EVENT', guestCount: 120, eventLocation: 'Nile Bank Annual Conference - Fairmont Nile City, Ballroom A',
    setupAt: at(5, 10).toISOString(), deliveryAt: at(5, 12, 30).toISOString(), ...base('omar'), allergyNotes: '15 vegetarian guests; 3 nut-free',
    lines: [
      { productId: P['E-CONF'], qty: 120, customizations: [{ optionId: await opt('E-CONF', 'Vegetarian'), qty: 15 }, { optionId: await opt('E-CONF', 'Nut-free'), qty: 3 }] },
      { productId: P['S-WTR'], qty: 24 }, { productId: P['S-BUF'], qty: 1 }, { productId: P['S-TBL'], qty: 120 },
    ], submit: true });
  await ordersSvc.confirm(uMona, f.id);
  // G: pending wedding in 12 days
  await ordersSvc.create(uSara, { type: 'EVENT', mode: 'EVENT', guestCount: 220, eventLocation: 'Kempinski Nile Hotel - Garden Terrace', setupAt: at(12, 17).toISOString(),
    deliveryAt: at(12, 19).toISOString(), ...base('sara'), notes: 'Client: Hana & Adam wedding', lines: [
      { productId: P['E-WED'], qty: 220, customizations: [{ optionId: await opt('E-WED', 'Vegetarian'), qty: 20 }] },
      { productId: P['S-WTR'], qty: 48 }, { productId: P['S-BUF'], qty: 1 }, { productId: P['S-CLN'], qty: 1 }, { productId: P['S-VAN'], qty: 1 },
    ], submit: true });

  // keep the demo inbox tidy: mark seed notifications older than this run as read for staff, keep a few fresh ones
  await db.update(s.notifications).set({ readAt: new Date() }).where(inArray(s.notifications.userId, [laila.id]));
  console.log('\nDone. Log in with any demo account - password: Demo@123');
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
