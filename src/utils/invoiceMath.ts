import type { Invoice, InvoiceItem, DocumentType } from '../context/FinanceContext';

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
