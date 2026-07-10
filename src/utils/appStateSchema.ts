import type { AppState } from '../services/googleDrive';
import type {
  Expense,
  Client,
  Invoice,
  InvoiceItem,
  PaymentLine,
  BookingAgent,
  BusinessSettings,
  BusinessType,
  DocumentType,
  PaymentMethod,
  VatDeductibility,
  VatTreatment,
} from '../context/FinanceContext';
import { DEFAULT_BUSINESS_SETTINGS, DEFAULT_CATEGORIES } from '../config/defaults';

/**
 * F-7 — `app_data.json` is the application's only data store and lives in the user's
 * own Google Drive, where it (or anyone with write access to a shared workspace) can
 * edit it freely. It is therefore an UNTRUSTED input and the trust boundary that feeds
 * the email/Drive-query/HTML sinks (F-2/F-4/F-6) and the financial math.
 *
 * This module validates and NORMALIZES the parsed JSON before any of it is used:
 * - strips dangerous keys (`__proto__`/`constructor`/`prototype`) to block prototype
 *   pollution from a tampered file,
 * - coerces every field to its expected type, dropping records that can't be repaired,
 * - bounds numbers (no NaN/Infinity/negative totals) so corrupted figures can't poison
 *   downstream math,
 * - whitelists enum-like fields (business/document/payment types).
 *
 * It is intentionally resilient: a slightly-off file degrades gracefully (bad records
 * are dropped, missing fields defaulted) rather than crashing the app, but nothing raw
 * is trusted downstream.
 */

const BUSINESS_TYPES: readonly BusinessType[] = ['EsekPatur', 'EsekMorshe', 'Company'];
const DOCUMENT_TYPES: readonly DocumentType[] = ['TaxInvoice', 'Receipt', 'TaxInvoiceReceipt', 'TransactionInvoice'];
const PAYMENT_METHODS: readonly PaymentMethod[] = ['Cash', 'Digital', 'Card', 'BankWire'];
const VAT_DEDUCTIBILITY: readonly VatDeductibility[] = ['full', 'two_thirds', 'none'];
const VAT_TREATMENTS: readonly VatTreatment[] = ['standard', 'zero_rated', 'exempt'];
const INVOICE_STATUSES: readonly Invoice['status'][] = ['Draft', 'Sent', 'Paid', 'Overdue', 'Refunded', 'Cancelled'];
const RECEIPT_STATUSES: readonly Expense['receiptStatus'][] = ['Uploaded', 'Missing'];

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** True for a non-null, non-array plain object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively strips prototype-pollution keys from any parsed JSON value. Run this on
 * the raw `JSON.parse` result before touching it so a `"__proto__": {...}` payload in
 * the Drive file can never reach `Object.prototype`.
 */
export function stripDangerousKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripDangerousKeys) as unknown as T;
  }
  if (isObject(value)) {
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      clean[key] = stripDangerousKeys(val);
    }
    return clean as T;
  }
  return value;
}

function toStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function toOptionalStr(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * F-2 (root defense) — constrains an invoice id to a safe charset before it can flow
 * into a header sink. The id is interpolated into the email attachment filename
 * (`Content-Type`/`Content-Disposition` of buildMimeMessage); a tampered app_data.json
 * must never carry CR/LF, control chars, or double-quotes in an id that could escape a
 * quoted MIME parameter or start a new header. Strips those characters here so the value
 * is safe at the source as well as at the sink. Ids are otherwise free-form
 * (e.g. `INV-0001`), so we only remove the dangerous characters rather than reformat.
 */
function toSafeId(value: unknown): string {
  // eslint-disable-next-line no-control-regex
  return toStr(value).replace(/[\r\n\x00-\x1f\x7f"]/g, '');
}

/** Coerces to a finite number; returns `fallback` for NaN/Infinity/non-numbers. */
function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/** A finite number clamped to be >= 0 (totals/amounts are never negative). */
function toNonNegNum(value: unknown, fallback = 0): number {
  const n = toNum(value, fallback);
  return n < 0 ? fallback : n;
}

function toBool(value: unknown): boolean {
  return value === true;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function oneOfOptional<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Keeps an array, returns [] for anything else. */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeInvoiceItem(raw: unknown): InvoiceItem | null {
  if (!isObject(raw)) return null;
  return {
    id: toStr(raw.id),
    description: toStr(raw.description),
    quantity: toNonNegNum(raw.quantity),
    unitPrice: toNonNegNum(raw.unitPrice),
  };
}

function normalizePaymentLine(raw: unknown): PaymentLine | null {
  if (!isObject(raw)) return null;
  const amount = toNonNegNum(raw.amount);
  if (amount <= 0) return null;
  return {
    id: toStr(raw.id),
    method: oneOf(raw.method, PAYMENT_METHODS, 'Digital'),
    amount,
  };
}

function normalizeExpense(raw: unknown): Expense | null {
  if (!isObject(raw)) return null;
  const id = toStr(raw.id);
  if (!id) return null;
  return {
    id,
    date: toStr(raw.date),
    vendor: toStr(raw.vendor),
    category: toStr(raw.category),
    amount: toNonNegNum(raw.amount),
    receiptStatus: oneOf(raw.receiptStatus, RECEIPT_STATUSES, 'Missing'),
    receiptName: toOptionalStr(raw.receiptName),
    receiptUrl: toOptionalStr(raw.receiptUrl),
    bookingAgentId: toOptionalStr(raw.bookingAgentId),
    netAmount: raw.netAmount === undefined ? undefined : toNonNegNum(raw.netAmount),
    vatRate: raw.vatRate === undefined ? undefined : toNonNegNum(raw.vatRate),
    vatAmount: raw.vatAmount === undefined ? undefined : toNonNegNum(raw.vatAmount),
    vatDeductibility: oneOfOptional(raw.vatDeductibility, VAT_DEDUCTIBILITY),
    hasValidTaxInvoice: raw.hasValidTaxInvoice === undefined ? undefined : toBool(raw.hasValidTaxInvoice),
    supplierAllocationNumber: toOptionalStr(raw.supplierAllocationNumber),
  };
}

function normalizeClient(raw: unknown): Client | null {
  if (!isObject(raw)) return null;
  const id = toStr(raw.id);
  if (!id) return null;
  return {
    id,
    name: toStr(raw.name),
    email: toStr(raw.email),
    phone: toStr(raw.phone),
    address: toStr(raw.address),
    totalBilled: toNum(raw.totalBilled),
    idNumber: toOptionalStr(raw.idNumber),
  };
}

function normalizeBookingAgent(raw: unknown): BookingAgent | null {
  if (!isObject(raw)) return null;
  const id = toStr(raw.id);
  if (!id) return null;
  return {
    id,
    name: toStr(raw.name),
    email: toStr(raw.email),
    phone: toStr(raw.phone),
    commissionRate: toNonNegNum(raw.commissionRate),
    minCommission: raw.minCommission === undefined ? undefined : toNonNegNum(raw.minCommission),
    totalCommissions: toNum(raw.totalCommissions),
    totalPaid: toNum(raw.totalPaid),
  };
}

function normalizeInvoice(raw: unknown): Invoice | null {
  if (!isObject(raw)) return null;
  // F-2 — constrain the id charset at the source: it reaches the email attachment
  // filename header sink, so strip any CR/LF/control/quote chars a tampered file carries.
  const id = toSafeId(raw.id);
  if (!id) return null;

  const items = asArray(raw.items)
    .map(normalizeInvoiceItem)
    .filter((i): i is InvoiceItem => i !== null);

  const rawPaymentLines = raw.paymentLines;
  const paymentLines = rawPaymentLines === undefined
    ? undefined
    : asArray(rawPaymentLines)
        .map(normalizePaymentLine)
        .filter((p): p is PaymentLine => p !== null);

  return {
    id,
    clientId: toStr(raw.clientId),
    clientName: toStr(raw.clientName),
    clientIdNumber: toOptionalStr(raw.clientIdNumber),
    bookingAgentId: toOptionalStr(raw.bookingAgentId),
    bookingAgentName: toOptionalStr(raw.bookingAgentName),
    commissionAmount: raw.commissionAmount === undefined ? undefined : toNonNegNum(raw.commissionAmount),
    date: toStr(raw.date),
    dueDate: toStr(raw.dueDate),
    items,
    taxRate: toNonNegNum(raw.taxRate),
    total: toNonNegNum(raw.total),
    status: oneOf(raw.status, INVOICE_STATUSES, 'Draft'),
    documentType: oneOfOptional(raw.documentType, DOCUMENT_TYPES),
    paymentMethod: oneOfOptional(raw.paymentMethod, PAYMENT_METHODS),
    paymentLines,
    pdfUrl: toOptionalStr(raw.pdfUrl),
    sentAt: toOptionalStr(raw.sentAt),
    firstIssuedAt: toOptionalStr(raw.firstIssuedAt),
    allocationNumber: toOptionalStr(raw.allocationNumber),
    vatTreatment: oneOfOptional(raw.vatTreatment, VAT_TREATMENTS),
    sourceInvoiceId: toOptionalStr(raw.sourceInvoiceId),
  };
}

function normalizeDocCounters(raw: unknown): BusinessSettings['docCounters'] {
  if (!isObject(raw)) return undefined;
  const counters: Partial<Record<DocumentType, number>> = {};
  for (const type of DOCUMENT_TYPES) {
    const value = raw[type];
    if (value !== undefined) {
      const n = toNonNegNum(value);
      counters[type] = Math.floor(n);
    }
  }
  return Object.keys(counters).length > 0 ? counters : undefined;
}

function normalizeBusinessSettings(raw: unknown): BusinessSettings {
  if (!isObject(raw)) return { ...DEFAULT_BUSINESS_SETTINGS };
  return {
    name: toStr(raw.name),
    idNumber: toStr(raw.idNumber),
    address: toStr(raw.address),
    phone: toStr(raw.phone),
    email: toStr(raw.email),
    type: oneOf(raw.type, BUSINESS_TYPES, 'EsekPatur'),
    docCounters: normalizeDocCounters(raw.docCounters),
    vatReportingPeriod: oneOf(raw.vatReportingPeriod, ['monthly', 'bimonthly'] as const, 'bimonthly'),
    vatCashBasis: toBool(raw.vatCashBasis),
    isDetailedFiler: toBool(raw.isDetailedFiler),
  };
}

function normalizeCategories(raw: unknown): string[] {
  const arr = asArray(raw).filter((c): c is string => typeof c === 'string' && c.length > 0);
  return arr.length > 0 ? Array.from(new Set(arr)) : [...DEFAULT_CATEGORIES];
}

/**
 * Validates and normalizes an untrusted, freshly-parsed `app_data.json` (or cached
 * localStorage blob) into a trusted, well-shaped {@link AppState}. Never throws on a
 * malformed file — bad records are dropped and missing fields defaulted.
 */
export function normalizeAppState(raw: unknown): AppState {
  const safe = stripDangerousKeys(raw);
  const obj = isObject(safe) ? safe : {};

  return {
    expenses: asArray(obj.expenses).map(normalizeExpense).filter((e): e is Expense => e !== null),
    clients: asArray(obj.clients).map(normalizeClient).filter((c): c is Client => c !== null),
    invoices: asArray(obj.invoices).map(normalizeInvoice).filter((i): i is Invoice => i !== null),
    bookingAgents: asArray(obj.bookingAgents).map(normalizeBookingAgent).filter((a): a is BookingAgent => a !== null),
    categories: normalizeCategories(obj.categories),
    businessSettings: normalizeBusinessSettings(obj.businessSettings),
  };
}
