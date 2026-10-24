// CateringPro data model - Business Requirements v4.0, Section 6.
// Money and quantities are NUMERIC in PostgreSQL (exact) and read back as JS numbers.
import { relations } from 'drizzle-orm';
import {
  boolean, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, serial, text, timestamp,
} from 'drizzle-orm/pg-core';

const money = (name?: string) => numeric(name as string, { precision: 12, scale: 2, mode: 'number' });
const qty = (name?: string) => numeric(name as string, { precision: 12, scale: 4, mode: 'number' });
const ts = (name?: string) => timestamp(name as string, { withTimezone: true, mode: 'date' });

// ---------------------------------------------------------------- enums
export const permissionScope = pgEnum('permission_scope', ['ALL', 'OWN', 'ASSIGNED']);
export const driverStatus = pgEnum('driver_status', ['AVAILABLE', 'ON_DELIVERY', 'OFF_DUTY']);
export const productType = pgEnum('product_type', ['FOOD_ITEM', 'PACKAGE', 'EVENT_MENU', 'SERVICE']);
export const optionKind = pgEnum('option_kind', ['SUBSTITUTION', 'EXTRA']);
export const movementType = pgEnum('movement_type', ['RECEIPT', 'RESERVE', 'RELEASE', 'ISSUE', 'WASTE', 'ADJUST']);
export const reservationStatus = pgEnum('reservation_status', ['ACTIVE', 'RELEASED', 'ISSUED']);
export const orderStatus = pgEnum('order_status', [
  'DRAFT', 'PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'CONFIRMED', 'PREPARING',
  'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'CANCELLED',
]);
export const orderType = pgEnum('order_type', ['DAILY', 'EVENT']);
export const orderMode = pgEnum('order_mode', ['DIRECT', 'PACKAGE', 'CUSTOM', 'EVENT']);
export const productionStatus = pgEnum('production_status', ['PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED']);
export const deliveryStatus = pgEnum('delivery_status', ['ASSIGNED', 'DELIVERED', 'FAILED', 'CANCELLED']);
export const invoiceStatus = pgEnum('invoice_status', ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'REFUNDED', 'CANCELLED']);

export type OrderStatus = (typeof orderStatus.enumValues)[number];
export type ProductType = (typeof productType.enumValues)[number];
export type Scope = (typeof permissionScope.enumValues)[number];

// ---------------------------------------------------------------- access control (permissions stored as data, NFR-11)
export const roles = pgTable('roles', {
  id: serial().primaryKey(),
  code: text().notNull().unique(),
  name: text().notNull(),
  nameAr: text().notNull(),
  homePath: text().notNull(),
});

export const permissions = pgTable('permissions', {
  code: text().primaryKey(),
  description: text().notNull(),
  group: text().notNull(),
});

export const rolePermissions = pgTable('role_permissions', {
  roleId: integer().notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionCode: text().notNull().references(() => permissions.code, { onDelete: 'cascade' }),
  scope: permissionScope().notNull().default('ALL'),
}, (t) => [primaryKey({ columns: [t.roleId, t.permissionCode] })]);

export const users = pgTable('users', {
  id: serial().primaryKey(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  name: text().notNull(),
  phone: text(),
  company: text(),
  roleId: integer().notNull().references(() => roles.id),
  isActive: boolean().notNull().default(true),
  isSuperAdmin: boolean().notNull().default(false),
  failedLogins: integer().notNull().default(0),
  lockedUntil: ts(),
  language: text().notNull().default('en'),
  driverStatus: driverStatus(),
  createdAt: ts().notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial().primaryKey(),
  userId: integer().references(() => users.id),
  action: text().notNull(),
  resource: text().notNull(),
  result: text().notNull(), // SUCCESS | FAILED | DENIED
  details: jsonb(),
  ip: text(),
  createdAt: ts().notNull().defaultNow(),
}, (t) => [index().on(t.createdAt)]);

export const settings = pgTable('settings', {
  key: text().primaryKey(),
  value: text().notNull(),
  label: text().notNull(),
});

// ---------------------------------------------------------------- catalog (UC-07)
export const categories = pgTable('categories', {
  id: serial().primaryKey(),
  name: text().notNull(),
  nameAr: text().notNull(),
  sort: integer().notNull().default(0),
});

export const products = pgTable('products', {
  id: serial().primaryKey(),
  sku: text().notNull().unique(),
  type: productType().notNull(),
  name: text().notNull(),
  nameAr: text().notNull(),
  description: text().notNull().default(''),
  descriptionAr: text().notNull().default(''),
  categoryId: integer().notNull().references(() => categories.id),
  price: money().notNull(),
  unit: text().notNull(), // portion, bottle, piece, package, guest, hour, event
  minQty: integer().notNull().default(1),
  leadTimeHours: integer().notNull().default(24),
  dietaryTags: text().array().notNull().default([]),
  allergens: text().array().notNull().default([]),
  image: text().notNull().default('🍽️'),
  isActive: boolean().notNull().default(true),
  updatedAt: ts().notNull().defaultNow(),
});

export const packageComponents = pgTable('package_components', {
  id: serial().primaryKey(),
  packageId: integer().notNull().references(() => products.id, { onDelete: 'cascade' }),
  itemId: integer().notNull().references(() => products.id),
  qty: qty().notNull(),
});

export const packageOptions = pgTable('package_options', {
  id: serial().primaryKey(),
  packageId: integer().notNull().references(() => products.id, { onDelete: 'cascade' }),
  kind: optionKind().notNull(),
  label: text().notNull(),
  labelAr: text().notNull(),
  fromItemId: integer().references(() => products.id),
  toItemId: integer().notNull().references(() => products.id),
  priceDelta: money().notNull(),
});

// ---------------------------------------------------------------- inventory (UC-10)
export const ingredients = pgTable('ingredients', {
  id: serial().primaryKey(),
  name: text().notNull(),
  nameAr: text().notNull(),
  unit: text().notNull(),
  lowStockThreshold: qty().notNull(),
  costPerUnit: money().notNull(),
  supplier: text().notNull().default(''),
});

export const recipeLines = pgTable('recipe_lines', {
  id: serial().primaryKey(),
  productId: integer().notNull().references(() => products.id, { onDelete: 'cascade' }),
  ingredientId: integer().notNull().references(() => ingredients.id),
  qtyPerPortion: qty().notNull(),
});

export const inventoryBatches = pgTable('inventory_batches', {
  id: serial().primaryKey(),
  ingredientId: integer().notNull().references(() => ingredients.id),
  lotNo: text().notNull(),
  qty: qty().notNull(),
  expiresAt: ts().notNull(),
  location: text().notNull(),
  receivedAt: ts().notNull().defaultNow(),
});

export const stockMovements = pgTable('stock_movements', {
  id: serial().primaryKey(),
  ingredientId: integer().notNull().references(() => ingredients.id),
  batchId: integer(),
  type: movementType().notNull(),
  qty: qty().notNull(),
  orderId: integer(),
  userId: integer(),
  note: text().notNull().default(''),
  createdAt: ts().notNull().defaultNow(),
});

export const stockReservations = pgTable('stock_reservations', {
  id: serial().primaryKey(),
  orderId: integer().notNull().references(() => orders.id),
  ingredientId: integer().notNull().references(() => ingredients.id),
  qty: qty().notNull(),
  forDate: ts().notNull(),
  status: reservationStatus().notNull().default('ACTIVE'),
  createdAt: ts().notNull().defaultNow(),
});

// ---------------------------------------------------------------- customers & delivery set-up
export const deliveryZones = pgTable('delivery_zones', {
  id: serial().primaryKey(),
  name: text().notNull(),
  nameAr: text().notNull(),
  fee: money().notNull(),
  minOrder: money().notNull(),
  isActive: boolean().notNull().default(true),
});

export const addresses = pgTable('addresses', {
  id: serial().primaryKey(),
  userId: integer().notNull().references(() => users.id),
  label: text().notNull(),
  line: text().notNull(),
  zoneId: integer().notNull().references(() => deliveryZones.id),
  contactName: text().notNull(),
  contactPhone: text().notNull(),
});

// ---------------------------------------------------------------- orders (UC-01, UC-02, UC-08)
export const orders = pgTable('orders', {
  id: serial().primaryKey(),
  number: text().notNull().unique(),
  customerId: integer().notNull().references(() => users.id),
  type: orderType().notNull(),
  mode: orderMode().notNull(),
  status: orderStatus().notNull().default('DRAFT'),
  isDelayed: boolean().notNull().default(false),
  delayedUntil: ts(),
  deliveryAt: ts().notNull(),
  addressText: text().notNull(),
  zoneId: integer().notNull().references(() => deliveryZones.id),
  contactName: text().notNull(),
  contactPhone: text().notNull(),
  notes: text().notNull().default(''),
  allergyNotes: text().notNull().default(''),
  allergenChecked: boolean().notNull().default(false),
  guestCount: integer(),
  eventLocation: text(),
  setupAt: ts(),
  subtotal: money().notNull(),
  deliveryFee: money().notNull(),
  serviceFee: money().notNull(),
  discount: money().notNull(),
  tax: money().notNull(),
  total: money().notNull(),
  pendingChange: jsonb().$type<{ deliveryAt?: string; discount?: number; reason: string; requestedBy: number } | null>(),
  cancelReason: text(),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
  submittedAt: ts(),
  confirmedAt: ts(),
  deliveredAt: ts(),
}, (t) => [index().on(t.status), index().on(t.deliveryAt), index().on(t.customerId)]);

export const orderLines = pgTable('order_lines', {
  id: serial().primaryKey(),
  orderId: integer().notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: integer().notNull().references(() => products.id),
  productName: text().notNull(), // snapshot (FR-55)
  productNameAr: text().notNull(),
  productType: productType().notNull(),
  unit: text().notNull(),
  qty: integer().notNull(),
  unitPrice: money().notNull(),
  lineTotal: money().notNull(),
});

export const orderLineCustomizations = pgTable('order_line_customizations', {
  id: serial().primaryKey(),
  lineId: integer().notNull().references(() => orderLines.id, { onDelete: 'cascade' }),
  kind: optionKind().notNull(),
  optionId: integer().notNull(),
  label: text().notNull(),
  qty: integer().notNull(),
  priceDelta: money().notNull(),
  fromItemId: integer(),
  toItemId: integer().notNull(),
});

export const orderStatusHistory = pgTable('order_status_history', {
  id: serial().primaryKey(),
  orderId: integer().notNull().references(() => orders.id, { onDelete: 'cascade' }),
  fromStatus: orderStatus(),
  toStatus: orderStatus().notNull(),
  userId: integer().references(() => users.id),
  comment: text().notNull().default(''),
  createdAt: ts().notNull().defaultNow(),
});

// ---------------------------------------------------------------- production, delivery, finance
export const productionOrders = pgTable('production_orders', {
  id: serial().primaryKey(),
  orderId: integer().notNull().unique().references(() => orders.id),
  status: productionStatus().notNull().default('PLANNED'),
  scheduledFor: ts().notNull(),
  startedAt: ts(),
  completedAt: ts(),
  qualityNote: text().notNull().default(''),
});

export const productionItems = pgTable('production_items', {
  id: serial().primaryKey(),
  productionOrderId: integer().notNull().references(() => productionOrders.id, { onDelete: 'cascade' }),
  productId: integer().notNull(),
  name: text().notNull(),
  portions: qty().notNull(),
});

export const deliveries = pgTable('deliveries', {
  id: serial().primaryKey(),
  orderId: integer().notNull().references(() => orders.id),
  driverId: integer().notNull().references(() => users.id),
  departAt: ts().notNull(),
  status: deliveryStatus().notNull().default('ASSIGNED'),
  recipientName: text(),
  proofNote: text(),
  failureReason: text(),
  completedAt: ts(),
  createdAt: ts().notNull().defaultNow(),
});

export const invoices = pgTable('invoices', {
  id: serial().primaryKey(),
  number: text().notNull().unique(),
  orderId: integer().notNull().unique().references(() => orders.id),
  amount: money().notNull(),
  tax: money().notNull(),
  status: invoiceStatus().notNull().default('UNPAID'),
  issuedAt: ts().notNull().defaultNow(),
  dueAt: ts().notNull(),
});

export const payments = pgTable('payments', {
  id: serial().primaryKey(),
  invoiceId: integer().notNull().references(() => invoices.id),
  amount: money().notNull(),
  method: text().notNull(), // CASH | BANK_TRANSFER | CARD
  reference: text().notNull().default(''),
  paidAt: ts().notNull().defaultNow(),
  recordedById: integer(),
});

export const ratings = pgTable('ratings', {
  id: serial().primaryKey(),
  orderId: integer().notNull().unique().references(() => orders.id),
  food: integer().notNull(),
  punctuality: integer().notNull(),
  service: integer().notNull(),
  comment: text().notNull().default(''),
  createdAt: ts().notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: serial().primaryKey(),
  userId: integer().notNull().references(() => users.id),
  title: text().notNull(),
  body: text().notNull(),
  orderId: integer(),
  link: text(),
  readAt: ts(),
  createdAt: ts().notNull().defaultNow(),
}, (t) => [index().on(t.userId, t.readAt)]);

// ---------------------------------------------------------------- relations (for db.query.* with nested data)
export const rolesRel = relations(roles, ({ many }) => ({ permissions: many(rolePermissions), users: many(users) }));
export const rolePermissionsRel = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionCode], references: [permissions.code] }),
}));
export const usersRel = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  addresses: many(addresses),
}));
export const categoriesRel = relations(categories, ({ many }) => ({ products: many(products) }));
export const productsRel = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  components: many(packageComponents, { relationName: 'pkg' }),
  options: many(packageOptions),
  recipe: many(recipeLines),
}));
export const packageComponentsRel = relations(packageComponents, ({ one }) => ({
  package: one(products, { fields: [packageComponents.packageId], references: [products.id], relationName: 'pkg' }),
  item: one(products, { fields: [packageComponents.itemId], references: [products.id] }),
}));
export const packageOptionsRel = relations(packageOptions, ({ one }) => ({
  package: one(products, { fields: [packageOptions.packageId], references: [products.id] }),
}));
export const recipeLinesRel = relations(recipeLines, ({ one }) => ({
  product: one(products, { fields: [recipeLines.productId], references: [products.id] }),
  ingredient: one(ingredients, { fields: [recipeLines.ingredientId], references: [ingredients.id] }),
}));
export const ingredientsRel = relations(ingredients, ({ many }) => ({ batches: many(inventoryBatches), recipeLines: many(recipeLines) }));
export const batchesRel = relations(inventoryBatches, ({ one }) => ({
  ingredient: one(ingredients, { fields: [inventoryBatches.ingredientId], references: [ingredients.id] }),
}));
export const addressesRel = relations(addresses, ({ one }) => ({
  user: one(users, { fields: [addresses.userId], references: [users.id] }),
  zone: one(deliveryZones, { fields: [addresses.zoneId], references: [deliveryZones.id] }),
}));
export const ordersRel = relations(orders, ({ one, many }) => ({
  customer: one(users, { fields: [orders.customerId], references: [users.id] }),
  zone: one(deliveryZones, { fields: [orders.zoneId], references: [deliveryZones.id] }),
  lines: many(orderLines),
  history: many(orderStatusHistory),
  reservations: many(stockReservations),
  production: one(productionOrders),
  deliveries: many(deliveries),
  invoice: one(invoices),
  rating: one(ratings),
}));
export const orderLinesRel = relations(orderLines, ({ one, many }) => ({
  order: one(orders, { fields: [orderLines.orderId], references: [orders.id] }),
  customizations: many(orderLineCustomizations),
}));
export const customizationsRel = relations(orderLineCustomizations, ({ one }) => ({
  line: one(orderLines, { fields: [orderLineCustomizations.lineId], references: [orderLines.id] }),
}));
export const historyRel = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, { fields: [orderStatusHistory.orderId], references: [orders.id] }),
  user: one(users, { fields: [orderStatusHistory.userId], references: [users.id] }),
}));
export const reservationsRel = relations(stockReservations, ({ one }) => ({
  order: one(orders, { fields: [stockReservations.orderId], references: [orders.id] }),
  ingredient: one(ingredients, { fields: [stockReservations.ingredientId], references: [ingredients.id] }),
}));
export const productionRel = relations(productionOrders, ({ one, many }) => ({
  order: one(orders, { fields: [productionOrders.orderId], references: [orders.id] }),
  items: many(productionItems),
}));
export const productionItemsRel = relations(productionItems, ({ one }) => ({
  productionOrder: one(productionOrders, { fields: [productionItems.productionOrderId], references: [productionOrders.id] }),
}));
export const deliveriesRel = relations(deliveries, ({ one }) => ({
  order: one(orders, { fields: [deliveries.orderId], references: [orders.id] }),
  driver: one(users, { fields: [deliveries.driverId], references: [users.id] }),
}));
export const invoicesRel = relations(invoices, ({ one, many }) => ({
  order: one(orders, { fields: [invoices.orderId], references: [orders.id] }),
  payments: many(payments),
}));
export const paymentsRel = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
}));
export const ratingsRel = relations(ratings, ({ one }) => ({
  order: one(orders, { fields: [ratings.orderId], references: [orders.id] }),
}));
