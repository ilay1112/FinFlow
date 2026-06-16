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

// Receipts get their own RCPT-XXXX sequence (from 0001); everything else uses
// INV-XXXX (seeded at 3999 so the first invoice is INV-4000).
const RECEIPT_SEQUENCE = { prefix: 'RCPT', seed: 0 } as const;
const INVOICE_SEQUENCE = { prefix: 'INV', seed: 3999 } as const;

/**
 * Returns the next document id for the given document type: the highest existing
 * number of that prefix + 1, zero-padded to 4 digits.
 */
export function nextInvoiceId(
  invoices: Pick<Invoice, 'id'>[],
  documentType?: DocumentType
): string {
  const { prefix, seed } = documentType === 'Receipt' ? RECEIPT_SEQUENCE : INVOICE_SEQUENCE;
  const prefixRe = new RegExp(`^${prefix}-(\\d+)$`);

  const nextNumber =
    invoices.reduce((max: number, inv) => {
      const match = inv.id.match(prefixRe);
      const num = match ? parseInt(match[1], 10) : 0;
      return num > max ? num : max;
    }, seed as number) + 1;

  return `${prefix}-${String(nextNumber).padStart(4, '0')}`;
}
