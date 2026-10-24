import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { settings } from '../db/schema';

/** Business configuration stored as data (NFR-12, FR-100). Values are illustrative and set by the company. */
export const SETTING_DEFAULTS = {
  taxRate: { value: '0.14', label: 'Tax rate (VAT)' },
  eventServiceFeeRate: { value: '0.10', label: 'Service fee rate for event orders' },
  quantityDiscountThreshold: { value: '100', label: 'Units for quantity discount' },
  quantityDiscountRate: { value: '0.05', label: 'Quantity discount rate' },
  discountApprovalLimit: { value: '0.10', label: 'Max discount an Order Manager can give' },
  cancellationCutoffHours: { value: '24', label: 'Free cancellation cut-off (hours before delivery)' },
  defaultLeadTimeHours: { value: '24', label: 'Minimum notice for daily orders (hours)' },
  slotCapacity: { value: '6', label: 'Orders per one-hour delivery slot' },
  invoiceOn: { value: 'CONFIRMATION', label: 'Issue invoice on (CONFIRMATION or DELIVERY)' },
  invoiceDueDays: { value: '14', label: 'Invoice due after (days)' },
  refundApprovalLimit: { value: '5000', label: 'Refunds above this need CEO approval (EGP)' },
  currency: { value: 'EGP', label: 'Currency' },
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export interface AppSettings {
  taxRate: number; eventServiceFeeRate: number; quantityDiscountThreshold: number; quantityDiscountRate: number;
  discountApprovalLimit: number; cancellationCutoffHours: number; defaultLeadTimeHours: number; slotCapacity: number;
  invoiceOn: 'CONFIRMATION' | 'DELIVERY'; invoiceDueDays: number; refundApprovalLimit: number; currency: string;
}

@Injectable()
export class SettingsService {
  private cached: { at: number; s: AppSettings } | null = null;
  constructor(@Inject(DB) private db: Db) {}

  async all(): Promise<AppSettings> {
    if (this.cached && Date.now() - this.cached.at < 10_000) return this.cached.s;
    const rows = await this.db.select().from(settings);
    const map: Record<string, string> = {};
    for (const k of Object.keys(SETTING_DEFAULTS) as SettingKey[]) map[k] = SETTING_DEFAULTS[k].value;
    for (const r of rows) map[r.key] = r.value;
    const s = {} as Record<string, number | string>;
    for (const [k, v] of Object.entries(map)) s[k] = ['invoiceOn', 'currency'].includes(k) ? v : Number(v);
    this.cached = { at: Date.now(), s: s as unknown as AppSettings };
    return this.cached.s;
  }

  async list() {
    const s = await this.all();
    return (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((k) => ({ key: k, label: SETTING_DEFAULTS[k].label, value: String(s[k]) }));
  }

  async update(key: SettingKey, value: string) {
    const label = SETTING_DEFAULTS[key].label;
    const existing = await this.db.select().from(settings).where(eq(settings.key, key));
    if (existing.length) await this.db.update(settings).set({ value }).where(eq(settings.key, key));
    else await this.db.insert(settings).values({ key, value, label });
    this.cached = null;
  }
}
