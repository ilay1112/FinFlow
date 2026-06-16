/**
 * Pure VAT-reporting math for an Osek Murshe (Doch Maam / דוח תקופתי).
 *
 * No React, no I/O — mirrors `invoiceMath.ts` so it is unit-testable in isolation.
 * VAT rates and allocation thresholds are always resolved from the date-keyed
 * `taxConfig.ts` helpers; this module never hardcodes 18.
 *
 * Implements VAT_OSEK_MURSHE_SPEC.md §4 (calculation), §5 (period logic) and §7
 * (edge cases). Doc fields 1–7 map to the periodic VAT return summary fields.
 */
import type { Invoice, Expense, VatDeductibility, VatTreatment } from '../context/FinanceContext';
import { computeTotals } from './invoiceMath';

export type VatPeriodType = 'monthly' | 'bimonthly';

export interface VatPeriodKey {
  year: number;
  /** 1–12 for monthly; 1–6 for bimonthly (Jan-Feb=1 … Nov-Dec=6). */
  index: number;
  type: VatPeriodType;
}

/** A single input-VAT line that was disallowed, with the reason for the warnings panel. */
export interface ExcludedInputVatItem {
  expenseId: string;
  vendor: string;
  date: string;
  /** VAT amount that would have been claimable were it not blocked (₪). */
  vat: number;
  /** Machine-readable reason key (maps to an i18n string in the UI). */
  reason: BlockedReason;
}

/** Why an expense's input VAT was disallowed. */
export type BlockedReason =
  | 'no_tax_invoice'
  | 'missing_supplier_allocation'
  | 'non_deductible';

/**
 * An invoice whose cash-basis recognition date is an approximation, not a real
 * payment date. Collected for the warnings panel so the user knows the period
 * placement is best-effort.
 *
 * TODO(paidAt): the root-cause fix is to model an explicit `paidAt` timestamp on
 * the invoice (set on the Sent→Paid transition) and recognize cash-basis output
 * VAT from it. Until then we approximate from `sentAt` / `invoice.date` and flag it.
 */
export interface CashBasisApproxItem {
  invoiceId: string;
  clientName: string;
  /** The recognition date we used (ISO `YYYY-MM-DD`). */
  date: string;
  /** Why it is an approximation (maps to an i18n string in the UI). */
  reason: CashBasisApproxReason;
}

/** Why a cash-basis recognition date is approximate. */
export type CashBasisApproxReason =
  /** Recognized from `sentAt` (send date ≈ payment date, but not guaranteed). */
  | 'from_sent_at'
  /** No `sentAt` either — fell back to the invoice issue date. */
  | 'fallback_invoice_date';

/** A per-document/expense CSV line, derived through the SAME math as the on-screen report. */
export interface VatLineItem {
  kind: 'invoice' | 'expense';
  /** invoice.id or expense.id. */
  id: string;
  date: string;
  /** clientName (invoice) or vendor (expense). */
  party: string;
  /** Pre-VAT base (₪). */
  net: number;
  /** VAT amount (₪). */
  vat: number;
  /** invoice category-ish descriptor: vatTreatment / status (invoice) or category / deductibility (expense). */
  treatment: string;
  /** allocationNumber (invoice) or supplierAllocationNumber (expense); '' if none. */
  allocation: string;
  /** status (invoice) only; '' for expenses. */
  status: string;
}

/** The 7 summary fields of the periodic VAT return (doch tkufati) + UI diagnostics. */
export interface VatReport {
  period: VatPeriodKey;
  taxableSalesBase: number; // Field 1 — net (pre-VAT) of standard-rated sales
  zeroRatedSales: number; // Field 2 — exports / Eilat (base; VAT = 0)
  exemptSales: number; // Field 3 — exempt sales (base)
  outputVat: number; // Field 4 — Σ VAT on standard sales
  taxableInputsBase: number; // Field 5 — net base of deductible purchases
  inputVat: number; // Field 6 — Σ claimable input VAT (after deductibility factor)
  netVat: number; // Field 7 — outputVat - inputVat (>0 pay, <0 refund)
  // diagnostics for the UI, not Doch Maam fields:
  excludedInputVat: number; // Σ VAT on non-deductible/blocked expenses
  excludedInputVatItems: ExcludedInputVatItem[]; // per-expense reasons for the warnings panel
  invoicesMissingAllocation: string[]; // invoice ids >= threshold without allocationNumber
  cashBasisApproxItems: CashBasisApproxItem[]; // cash-basis invoices whose recognition date is approximated
  lineItems: VatLineItem[]; // the per-invoice/per-expense rows behind the summary (single math path; for CSV)
}

/** Statuses excluded entirely from the VAT report (§7). */
const EXCLUDED_STATUSES: ReadonlyArray<Invoice['status']> = ['Draft', 'Cancelled'];

/** The claimable fraction of vatAmount for each deductibility class. */
const DEDUCTIBILITY_FACTOR: Record<VatDeductibility, number> = {
  full: 1,
  two_thirds: 2 / 3,
  none: 0,
};

/** Local-calendar ISO date (`YYYY-MM-DD`) for a Date — avoids the UTC shift of `toISOString()`. */
function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Map any ISO date to its VAT period under the given cadence. */
export function periodFor(dateIso: string, type: VatPeriodType): VatPeriodKey {
  const d = new Date(dateIso);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1–12
  if (type === 'monthly') {
    return { year, index: month, type };
  }
  // Bi-monthly: Jan-Feb=1 … Nov-Dec=6.
  return { year, index: Math.ceil(month / 2), type };
}

/** Stable string key, e.g. "2026-M03" or "2026-B02", for grouping/sorting. */
export function periodKeyString(p: VatPeriodKey): string {
  const tag = p.type === 'monthly' ? 'M' : 'B';
  return `${p.year}-${tag}${String(p.index).padStart(2, '0')}`;
}

/** True when two period keys denote the same period. */
function samePeriod(a: VatPeriodKey, b: VatPeriodKey): boolean {
  return a.type === b.type && a.year === b.year && a.index === b.index;
}

/**
 * Output-VAT recognition date for an invoice.
 * - accrual (default): invoice.date
 * - cash basis: payment date — approximated by sentAt; if unavailable, fall back
 *   to invoice.date. (A precise paid-transition timestamp is not modelled today —
 *   see §9 Q2 advisor-confirm.)
 * Cancelled/Draft invoices are excluded by the caller. Refunded invoices reduce the
 * period their recognition date falls in (see §7).
 */
export function outputRecognitionDate(inv: Invoice, cashBasis: boolean): string {
  return resolveOutputRecognition(inv, cashBasis).date;
}

/**
 * Output-VAT recognition date plus a diagnostic flag describing how it was derived.
 * `approxReason` is set only on cash basis, when the date is an approximation rather
 * than a real payment date (see {@link CashBasisApproxItem}). On accrual basis, or
 * when a real payment date is ever modelled, `approxReason` is undefined.
 *
 * TODO(paidAt): once an explicit `paidAt` lands on Invoice, prefer it here and only
 * fall back (with a reason) when it is absent.
 */
export function resolveOutputRecognition(
  inv: Invoice,
  cashBasis: boolean
): { date: string; approxReason?: CashBasisApproxReason } {
  if (!cashBasis) {
    return { date: inv.date };
  }
  if (inv.sentAt) {
    return { date: inv.sentAt.split('T')[0], approxReason: 'from_sent_at' };
  }
  return { date: inv.date, approxReason: 'fallback_invoice_date' };
}

/**
 * Claimable input VAT for one expense, applying the derivation rule (§3.1), the
 * deductibility factor and the validity gates (valid tax invoice + supplier
 * allocation number above the dated threshold).
 *
 * @param standardRateOnDate VAT rate (%) effective on the expense's date.
 * @param allocationThreshold pre-VAT allocation threshold (₪) effective on the date.
 */
export function expenseInputVat(
  exp: Expense,
  standardRateOnDate: number,
  allocationThreshold: number
): { net: number; vat: number; claimable: number; blockedReason?: BlockedReason } {
  // Resolve the net/VAT split (single source of truth, §3.1).
  let net: number;
  let vat: number;
  if (exp.netAmount !== undefined && exp.vatAmount !== undefined) {
    net = exp.netAmount;
    vat = exp.vatAmount;
  } else if (exp.vatRate !== undefined) {
    // Split the gross-inclusive `amount` at the expense's own rate.
    net = exp.vatRate > 0 ? exp.amount / (1 + exp.vatRate / 100) : exp.amount;
    vat = exp.amount - net;
  } else if (exp.hasValidTaxInvoice === true && standardRateOnDate > 0) {
    // No explicit split but the user has confirmed it is a tax-invoice expense:
    // split the gross at the standard rate effective on its date (§3.1).
    net = exp.amount / (1 + standardRateOnDate / 100);
    vat = exp.amount - net;
  } else {
    // Legacy row with no VAT info and not confirmed: do not infer a claim
    // (§3.1 / §8 — historical rows are never silently claimed). Treat as no VAT.
    net = exp.amount;
    vat = 0;
  }

  const deductibility: VatDeductibility = exp.vatDeductibility ?? 'none';

  // Gate 1: a valid tax invoice with the supplier TIN is a precondition for any claim.
  if (exp.hasValidTaxInvoice === false || exp.hasValidTaxInvoice === undefined) {
    return { net, vat, claimable: 0, blockedReason: 'no_tax_invoice' };
  }

  // Gate 2: deductibility class (entertainment/private → none).
  if (deductibility === 'none') {
    return { net, vat, claimable: 0, blockedReason: 'non_deductible' };
  }

  // Gate 3: above the allocation threshold the supplier's allocation number is required.
  if (net >= allocationThreshold && !exp.supplierAllocationNumber) {
    return { net, vat, claimable: 0, blockedReason: 'missing_supplier_allocation' };
  }

  const claimable = vat * DEDUCTIBILITY_FACTOR[deductibility];
  return { net, vat, claimable };
}

/** Resolve an invoice's net/VAT split via the shared math path (never trust `total` blindly). */
function invoiceNetVat(inv: Invoice): { base: number; vat: number } {
  const { subtotal, taxAmount } = computeTotals(inv.items, inv.taxRate);
  return { base: subtotal, vat: taxAmount };
}

/** Effective VAT treatment of an invoice, defaulting legacy rows to 'standard' (§8). */
function treatmentOf(inv: Invoice): VatTreatment {
  return inv.vatTreatment ?? 'standard';
}

/**
 * Build a full VatReport for one period from all invoices + expenses. Pure.
 */
export function buildVatReport(
  period: VatPeriodKey,
  invoices: Invoice[],
  expenses: Expense[],
  opts: {
    cashBasis: boolean;
    /** pre-VAT allocation threshold (₪) effective on a given ISO date. */
    allocationThresholdFor: (dateIso: string) => number;
    /** standard VAT rate (%) effective on a given ISO date. */
    standardRateFor: (dateIso: string) => number;
  }
): VatReport {
  const report: VatReport = {
    period,
    taxableSalesBase: 0,
    zeroRatedSales: 0,
    exemptSales: 0,
    outputVat: 0,
    taxableInputsBase: 0,
    inputVat: 0,
    netVat: 0,
    excludedInputVat: 0,
    excludedInputVatItems: [],
    invoicesMissingAllocation: [],
    cashBasisApproxItems: [],
    lineItems: [],
  };

  // ----- Output side (invoices) -----
  for (const inv of invoices) {
    if (EXCLUDED_STATUSES.includes(inv.status)) continue;
    const { date: recognition, approxReason } = resolveOutputRecognition(inv, opts.cashBasis);
    if (!samePeriod(periodFor(recognition, period.type), period)) continue;

    const { base, vat } = invoiceNetVat(inv);
    // Refunded documents net out of the period (negative contribution, §7).
    const sign = inv.status === 'Refunded' ? -1 : 1;
    const treatment = treatmentOf(inv);

    if (treatment === 'zero_rated') {
      report.zeroRatedSales += sign * base;
    } else if (treatment === 'exempt') {
      report.exemptSales += sign * base;
    } else {
      report.taxableSalesBase += sign * base;
      report.outputVat += sign * vat;
    }

    // CSV/line-item source: the same net/VAT split that fed the summary above.
    report.lineItems.push({
      kind: 'invoice',
      id: inv.id,
      date: recognition,
      party: inv.clientName ?? '',
      net: sign * base,
      vat: treatment === 'standard' ? sign * vat : 0,
      treatment,
      allocation: inv.allocationNumber ?? '',
      status: inv.status,
    });

    // Cash-basis recognition-date approximation diagnostic (§9 Q2). Mirrors the
    // excludedInputVatItems pattern: collect id/date/reason for the warnings panel.
    if (approxReason) {
      report.cashBasisApproxItems.push({
        invoiceId: inv.id,
        clientName: inv.clientName ?? '',
        date: recognition,
        reason: approxReason,
      });
    }

    // Allocation check (output side): a standard/zero-rated tax invoice at/above the
    // dated threshold must carry an allocation number. Refunds are not flagged here.
    if (
      sign === 1 &&
      (treatment === 'standard' || treatment === 'zero_rated') &&
      (inv.documentType === 'TaxInvoice' || inv.documentType === 'TaxInvoiceReceipt') &&
      base >= opts.allocationThresholdFor(inv.date) &&
      !inv.allocationNumber
    ) {
      report.invoicesMissingAllocation.push(inv.id);
    }
  }

  // ----- Input side (expenses) -----
  for (const exp of expenses) {
    if (!samePeriod(periodFor(exp.date, period.type), period)) continue;

    const { net, vat, claimable, blockedReason } = expenseInputVat(
      exp,
      opts.standardRateFor(exp.date),
      opts.allocationThresholdFor(exp.date)
    );

    // CSV/line-item source: the same net/VAT split expenseInputVat resolved.
    report.lineItems.push({
      kind: 'expense',
      id: exp.id,
      date: exp.date,
      party: exp.vendor ?? '',
      net,
      vat,
      treatment: `${exp.category ?? ''}${exp.vatDeductibility ? ` / ${exp.vatDeductibility}` : ''}`,
      allocation: exp.supplierAllocationNumber ?? '',
      status: '',
    });

    if (blockedReason) {
      // Track the gross VAT (pre-factor) that would have been at stake so the
      // warnings panel can show it. Skip rows that carry no VAT at all.
      if (vat > 0) {
        report.excludedInputVat += vat;
        report.excludedInputVatItems.push({
          expenseId: exp.id,
          vendor: exp.vendor,
          date: exp.date,
          vat,
          reason: blockedReason,
        });
      }
      continue;
    }

    report.taxableInputsBase += net;
    report.inputVat += claimable;
  }

  report.netVat = report.outputVat - report.inputVat;
  return report;
}

/**
 * Group every transaction into its period and return reports sorted descending
 * (most recent first). Lists EVERY period from the earliest transaction to the
 * current period — including zero-activity periods — because an Osek Murshe must
 * file even with no activity (§5).
 */
export function buildAllVatReports(
  invoices: Invoice[],
  expenses: Expense[],
  opts: {
    type: VatPeriodType;
    cashBasis: boolean;
    allocationThresholdFor: (dateIso: string) => number;
    standardRateFor: (dateIso: string) => number;
    /** "Now" — defaults to the current date; injectable for testing. */
    now?: Date;
  }
): VatReport[] {
  const now = opts.now ?? new Date();
  // Derive "now" from LOCAL calendar components so the month boundary matches the
  // local-date `getMonth()` used inside periodFor (no UTC `toISOString()` mismatch).
  const nowPeriod = periodFor(localIsoDate(now), opts.type);

  // Earliest transaction date across both collections (recognition date for invoices).
  const dates: string[] = [];
  for (const inv of invoices) {
    if (EXCLUDED_STATUSES.includes(inv.status)) continue;
    dates.push(outputRecognitionDate(inv, opts.cashBasis));
  }
  for (const exp of expenses) dates.push(exp.date);

  if (dates.length === 0) {
    // No data yet — still surface the current period so the filing obligation shows.
    return [
      buildVatReport(nowPeriod, invoices, expenses, {
        cashBasis: opts.cashBasis,
        allocationThresholdFor: opts.allocationThresholdFor,
        standardRateFor: opts.standardRateFor,
      }),
    ];
  }

  const earliest = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
  const startPeriod = periodFor(earliest, opts.type);

  // Enumerate every period from startPeriod through nowPeriod (inclusive).
  const periods: VatPeriodKey[] = [];
  const perYear = opts.type === 'monthly' ? 12 : 6;
  let { year, index } = startPeriod;
  const endOrdinal = nowPeriod.year * perYear + nowPeriod.index;
  while (year * perYear + index <= endOrdinal) {
    periods.push({ year, index, type: opts.type });
    index += 1;
    if (index > perYear) {
      index = 1;
      year += 1;
    }
  }

  const reports = periods.map(p =>
    buildVatReport(p, invoices, expenses, {
      cashBasis: opts.cashBasis,
      allocationThresholdFor: opts.allocationThresholdFor,
      standardRateFor: opts.standardRateFor,
    })
  );

  // Sort descending: most recent period first.
  return reports.sort((a, b) => periodKeyString(b.period).localeCompare(periodKeyString(a.period)));
}

/** Inclusive month range (1-based) covered by a period. */
export function periodMonthRange(p: VatPeriodKey): { startMonth: number; endMonth: number } {
  if (p.type === 'monthly') return { startMonth: p.index, endMonth: p.index };
  return { startMonth: p.index * 2 - 1, endMonth: p.index * 2 };
}

/**
 * Nominal filing/payment deadlines for a period (display only, §5). The real
 * deadline shifts if it lands on Shabbat/חג — out of scope to compute precisely;
 * the UI shows the nominal date with a verify note.
 */
export function periodDeadlines(p: VatPeriodKey): {
  /** Manual filing deadline — 15th of the month after the period ends. */
  manual: string;
  /** Online (SHAAM) filing deadline — 19th. */
  online: string;
  /** PCN874 / detailed-filer payment deadline — 23rd. */
  detailed: string;
} {
  const { endMonth } = periodMonthRange(p);
  // Month after the period ends (handle December → January rollover).
  let dueYear = p.year;
  let dueMonth = endMonth + 1;
  if (dueMonth > 12) {
    dueMonth = 1;
    dueYear += 1;
  }
  const mm = String(dueMonth).padStart(2, '0');
  return {
    manual: `${dueYear}-${mm}-15`,
    online: `${dueYear}-${mm}-19`,
    detailed: `${dueYear}-${mm}-23`,
  };
}

/** Minimal translator shape — lets this module stay framework-free while reusing i18n keys. */
export type Translate = (key: string) => string;

/** Escape a single CSV cell: strip commas/newlines that would break the simple join. */
function csvCell(value: string | number): string {
  return String(value).replace(/[,\n\r]/g, ' ');
}

/**
 * Build the CSV text for a VatReport. Pure — the view just wraps the result in a
 * Blob and triggers the download. Uses the SAME numbers as the on-screen Doch Maam:
 * the 7 summary fields come straight off the report, and the per-line invoice/expense
 * rows come from `report.lineItems` (populated by `buildVatReport` via the shared
 * `computeTotals` / `expenseInputVat` math) — there is no second math path here.
 *
 * @param periodLabel localized period label (e.g. "Jan–Feb 2026"); the view formats it.
 */
export function buildVatReportCsv(report: VatReport, t: Translate, periodLabel: string): string {
  const lines: string[] = [];

  // Section 1 — the 7 Doch Maam summary fields.
  lines.push(csvCell(t('vat.csv_summary_heading')));
  lines.push([csvCell(t('vat.period')), csvCell(periodLabel)].join(','));
  lines.push([csvCell(t('vat.field_taxable_sales_base')), report.taxableSalesBase.toFixed(2)].join(','));
  lines.push([csvCell(t('vat.field_zero_rated_sales')), report.zeroRatedSales.toFixed(2)].join(','));
  lines.push([csvCell(t('vat.field_exempt_sales')), report.exemptSales.toFixed(2)].join(','));
  lines.push([csvCell(t('vat.field_output_vat')), report.outputVat.toFixed(2)].join(','));
  lines.push([csvCell(t('vat.field_taxable_inputs_base')), report.taxableInputsBase.toFixed(2)].join(','));
  lines.push([csvCell(t('vat.field_input_vat')), report.inputVat.toFixed(2)].join(','));
  lines.push([csvCell(t('vat.field_net_vat')), report.netVat.toFixed(2)].join(','));
  lines.push('');

  const invoiceItems = report.lineItems.filter(li => li.kind === 'invoice');
  const expenseItems = report.lineItems.filter(li => li.kind === 'expense');

  // Section 2 — underlying invoices in the period (accountant havila).
  lines.push(csvCell(t('vat.csv_invoices_heading')));
  lines.push(
    [
      t('invoices.invoice_id'),
      t('common.date'),
      t('invoices.client'),
      t('invoices.subtotal'),
      t('invoices.tax'),
      t('invoices.vat_treatment'),
      t('invoices.allocation_number'),
      t('common.status'),
    ]
      .map(csvCell)
      .join(',')
  );
  for (const li of invoiceItems) {
    lines.push(
      [
        csvCell(li.id),
        csvCell(li.date),
        csvCell(li.party),
        li.net.toFixed(2),
        li.vat.toFixed(2),
        csvCell(li.treatment),
        csvCell(li.allocation),
        csvCell(li.status),
      ].join(',')
    );
  }
  lines.push('');

  // Section 3 — underlying expenses in the period.
  lines.push(csvCell(t('vat.csv_expenses_heading')));
  lines.push(
    [
      t('common.date'),
      t('expenses.vendor'),
      t('expenses.vat.net'),
      t('expenses.vat.vat'),
      t('expenses.vat.deductibility'),
      t('expenses.vat.supplier_allocation'),
    ]
      .map(csvCell)
      .join(',')
  );
  for (const li of expenseItems) {
    lines.push(
      [
        csvCell(li.date),
        csvCell(li.party),
        li.net.toFixed(2),
        li.vat.toFixed(2),
        csvCell(li.treatment),
        csvCell(li.allocation),
      ].join(',')
    );
  }

  return lines.join('\n');
}
