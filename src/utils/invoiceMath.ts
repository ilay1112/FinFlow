import type {
  Invoice,
  InvoiceItem,
  DocumentType,
  PaymentMethod,
  PaymentLine,
} from '../context/FinanceContext';
import type { CashLimit } from '../config/taxConfig';

/**
 * Single source of truth mapping each document type to its i18n key. Consumed by
 * the invoice form and the PDF template so the displayed label never diverges.
 */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  TaxInvoice: 'invoices.doc_tax_invoice',
  Receipt: 'invoices.doc_receipt',
  TaxInvoiceReceipt: 'invoices.doc_tax_invoice_receipt',
  TransactionInvoice: 'invoices.doc_transaction_invoice',
};

/** Single source of truth mapping each payment method to its i18n key. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  Cash: 'invoices.payment_cash',
  Digital: 'invoices.payment_digital',
  Card: 'invoices.payment_card',
  BankWire: 'invoices.payment_bank_wire',
};

/** Selectable payment methods, in display order. */
export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Digital', 'Card', 'BankWire'];

/**
 * Legal original/copy designation for a generated document. The first PDF issued
 * for a document is the מקור (original); any re-download or re-send afterwards is
 * an העתק (copy). A document counts as already issued once it has a first-issue
 * timestamp, a persisted PDF (pdfUrl) or a send timestamp (sentAt).
 */
export function resolveCopyType(
  invoice: Pick<Invoice, 'firstIssuedAt' | 'pdfUrl' | 'sentAt'>
): 'original' | 'copy' {
  return invoice.firstIssuedAt || invoice.pdfUrl || invoice.sentAt ? 'copy' : 'original';
}

export interface InvoiceTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

/** Computes subtotal, VAT amount and grand total for a set of invoice line items. */
export function computeTotals(
  items: Pick<InvoiceItem, 'quantity' | 'unitPrice'>[],
  taxRate: number
): InvoiceTotals {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

/** Booking-agent commission = max(subtotal · rate%, minimum commission floor). */
export function computeCommission(
  subtotal: number,
  agent: { commissionRate: number; minCommission?: number }
): number {
  const calc = subtotal * (agent.commissionRate / 100);
  return agent.minCommission && calc < agent.minCommission ? agent.minCommission : calc;
}

// ---------------------------------------------------------------------------
// Cash Law compliance & multi-method payments (CASH_LAW_PAYMENTS_SPEC.md)
// ---------------------------------------------------------------------------

/** Float tolerance (₪0.01) for all payment equality / over-cap comparisons. */
const PAYMENT_EPS = 0.01;

/**
 * Whether a document type RECORDS actual receipt of payment (קבלה / חשבונית
 * מס-קבלה). Only these carry `paymentLines` and are subject to the Cash Law cash
 * cap. TaxInvoice / TransactionInvoice are demand/pro-forma documents and do not.
 */
export function recordsPayment(documentType?: DocumentType): boolean {
  return documentType === 'Receipt' || documentType === 'TaxInvoiceReceipt';
}

/**
 * Whether a document is an ACCOUNTING event — i.e. it contributes to turnover,
 * revenue, client billing, agent commissions and VAT. A חשבון עסקה
 * (TransactionInvoice) is a demand/quote, not a tax or income event, so it is the
 * one document type that counts for NONE of those figures; the קבלה (or tax invoice)
 * issued for it is the real accounting event. Single source of truth for that rule.
 */
export function isAccountingDocument(documentType?: DocumentType): boolean {
  return documentType !== 'TransactionInvoice';
}

/** Total tendered across all payment lines. */
export function sumPayments(lines: PaymentLine[]): number {
  return lines.reduce((sum, line) => sum + (line.amount || 0), 0);
}

/** Total tendered specifically as cash. */
export function sumCashPayments(lines: PaymentLine[]): number {
  return lines.reduce((sum, line) => sum + (line.method === 'Cash' ? line.amount || 0 : 0), 0);
}

/**
 * The legal cash cap for a single deal under the Israeli Cash Reduction Law
 * (חוק לצמצום השימוש במזומן, effective 2022-08-01). `total` is the transaction
 * value including VAT; `limit.flatCap` is the ₪6,000 threshold and
 * `limit.dealFraction` is the 0.10 fraction.
 *
 *   - Condition A — total <= threshold: the whole transaction may be cash (cap = total).
 *   - Condition B — total >  threshold: cap = min(dealFraction * total, threshold).
 *
 * The caller resolves `limit` via getCashLimit(date) so this stays pure and
 * config-agnostic.
 */
export function cashCapForTotal(total: number, limit: CashLimit): number {
  const threshold = limit.flatCap;
  if (total <= threshold) {
    return total;
  }
  return Math.min(limit.dealFraction * total, threshold);
}

/**
 * `total - sumPayments(lines)`. Positive = still to allocate; negative =
 * over-allocated.
 */
export function remainingToAllocate(total: number, lines: PaymentLine[]): number {
  return total - sumPayments(lines);
}

/** Result of validating a payment-recording document's payment lines against a total. */
export interface PaymentValidation {
  /** `|remaining| <= EPS` — lines sum to the total within tolerance. */
  balanced: boolean;
  /** `total - sumPayments` (signed). */
  remaining: number;
  /** The effective cash cap, per cashCapForTotal (Cash Law Condition A/B). */
  cashCap: number;
  /** Total tendered as cash. */
  cashTotal: number;
  /** `cashTotal > cashCap + EPS` — the cash portion breaches the legal cap. */
  cashOverCap: boolean;
  /** True iff balanced, not over the cash cap, and every line amount > 0. */
  ok: boolean;
}

/**
 * Single validation entry point for the payment-lines model. Called by the invoice
 * form (live) and by addInvoice / updateInvoice (defense-in-depth). Pure — the
 * caller resolves `limit` via getCashLimit(date).
 */
export function validatePayments(
  total: number,
  lines: PaymentLine[],
  limit: CashLimit
): PaymentValidation {
  const remaining = remainingToAllocate(total, lines);
  const balanced = Math.abs(remaining) <= PAYMENT_EPS;
  const cashCap = cashCapForTotal(total, limit);
  const cashTotal = sumCashPayments(lines);
  const cashOverCap = cashTotal > cashCap + PAYMENT_EPS;
  const allPositive = lines.length > 0 && lines.every(line => line.amount > 0);
  return {
    balanced,
    remaining,
    cashCap,
    cashTotal,
    cashOverCap,
    ok: balanced && !cashOverCap && allPositive,
  };
}

/**
 * Lazily resolves a document's payment lines (read-time migration, §8): prefers the
 * stored `paymentLines`; otherwise maps a legacy single `paymentMethod` to one
 * full-total line; otherwise none. Never mutates / rewrites the stored invoice.
 */
export function paymentLinesOf(
  inv: Pick<Invoice, 'paymentLines' | 'paymentMethod' | 'total'>
): PaymentLine[] {
  if (inv.paymentLines?.length) return inv.paymentLines;
  if (inv.paymentMethod) return [{ id: 'legacy', method: inv.paymentMethod, amount: inv.total }];
  return [];
}

/**
 * Year-to-date turnover (מחזור) for the given calendar year, on an ISSUED-document
 * basis: the sum of totals of every document issued in that year that is not a
 * Draft and not Cancelled. This is the legally relevant turnover figure for the
 * Esek Patur ceiling — distinct from the paid-only "revenue" the dashboard/taxes
 * screens display — because a document counts toward turnover once it is issued
 * (by its issue date), regardless of whether it has been paid yet.
 *
 * For an Esek Patur (0% VAT) the document total already equals the net turnover,
 * so no VAT is stripped here.
 */
export function computeYtdTurnover(
  invoices: Pick<Invoice, 'date' | 'status' | 'total' | 'documentType'>[],
  year: number
): number {
  return invoices
    .filter(
      inv =>
        inv.status !== 'Draft' &&
        inv.status !== 'Cancelled' &&
        isAccountingDocument(inv.documentType) &&
        new Date(inv.date).getFullYear() === year
    )
    .reduce((sum, inv) => sum + inv.total, 0);
}

// Each legal document type gets its own gapless, monotonic series (1a). Seeds are
// the *last used* number (next document is seed + 1) — so the first TaxInvoice is
// INV-4000, the first receipt RCPT-0001, etc.
//
// Back-compat: TaxInvoice keeps the historical `INV-` prefix and 3999 seed so
// existing INV-XXXX documents stay in the same series. TaxInvoiceReceipt and
// TransactionInvoice — which previously interleaved into the shared `INV-` series —
// now get their own distinct prefixes/series as the law requires.
const DOCUMENT_SEQUENCES: Record<DocumentType, { prefix: string; seed: number }> = {
  TaxInvoice: { prefix: 'INV', seed: 3999 },
  Receipt: { prefix: 'RCPT', seed: 0 },
  TaxInvoiceReceipt: { prefix: 'INVR', seed: 0 },
  TransactionInvoice: { prefix: 'TXN', seed: 0 },
};

// Documents created before per-type numbering existed used a single `INV-` series
// for everything that wasn't a receipt. Default any unknown/legacy type to it so
// migration seeding finds those documents.
const DEFAULT_DOCUMENT_TYPE: DocumentType = 'TaxInvoice';

/** Persisted per-document-type counters. The value is the last-used number. */
export type DocCounters = Partial<Record<DocumentType, number>>;

function sequenceFor(documentType?: DocumentType) {
  return DOCUMENT_SEQUENCES[documentType ?? DEFAULT_DOCUMENT_TYPE];
}

/**
 * Highest number currently used in the array for the given type's prefix, or the
 * sequence seed if none exist. Used only to seed the persisted counter once, on
 * first load (migration), so existing documents keep their place in the series.
 */
function maxExistingNumber(invoices: Pick<Invoice, 'id'>[], documentType?: DocumentType): number {
  const { prefix, seed } = sequenceFor(documentType);
  const prefixRe = new RegExp(`^${prefix}-(\\d+)$`);
  return invoices.reduce((max: number, inv) => {
    const match = inv.id.match(prefixRe);
    const num = match ? parseInt(match[1], 10) : 0;
    return num > max ? num : max;
  }, seed);
}

/**
 * Seeds the persisted per-type counters from existing documents (one-time
 * migration). For each document type the counter is `max(existing number, seed)`,
 * so the next document continues the series without reusing a number. Counters
 * already present are kept as-is.
 */
export function seedDocCounters(
  invoices: Pick<Invoice, 'id'>[],
  existing: DocCounters = {}
): DocCounters {
  const seeded: DocCounters = { ...existing };
  for (const type of Object.keys(DOCUMENT_SEQUENCES) as DocumentType[]) {
    if (seeded[type] === undefined) {
      seeded[type] = maxExistingNumber(invoices, type);
    }
  }
  return seeded;
}

/**
 * Allocates the next gapless document id for the given type by incrementing the
 * persisted counter. Returns the new id AND the updated counters map — the caller
 * persists the counters as part of business settings so the increment goes
 * through the optimistic-concurrency save guard and can never be double-allocated
 * by a concurrent device, nor reused after a delete/cancel.
 */
export function allocateInvoiceId(
  counters: DocCounters,
  documentType?: DocumentType
): { id: string; counters: DocCounters } {
  const type = documentType ?? DEFAULT_DOCUMENT_TYPE;
  const { prefix, seed } = sequenceFor(type);
  const current = counters[type] ?? seed;
  const next = current + 1;
  return {
    id: `${prefix}-${String(next).padStart(4, '0')}`,
    counters: { ...counters, [type]: next },
  };
}
