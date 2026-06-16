/**
 * Single source of truth for date-sensitive Israeli tax parameters.
 *
 * Rates, thresholds and brackets change frequently and are legally significant.
 * Every value here is keyed by an effective date (ISO `YYYY-MM-DD`) so that an
 * invoice/document is always resolved against the rule that applied on its own
 * issue date — never silently against "today's" constant.
 *
 * Sources & figures are taken verbatim from ISRAELI_TAX_COMPLIANCE_REPORT.md
 * (researched 2026-06-16). Do NOT re-derive or "correct" the income-tax bracket
 * numbers here — that re-verification is a separate, advisor-blocked task. The
 * brackets below were relocated UNCHANGED from src/utils/utils.ts.
 */

/** A value that took effect on `effectiveFrom` (ISO date) and applies until the next entry. */
interface DatedValue<T> {
  effectiveFrom: string;
  value: T;
}

/**
 * Resolves the entry whose `effectiveFrom` is the latest date that is still on or
 * before `date`. Entries may be supplied in any order. Returns the earliest entry
 * as a fallback if `date` predates every entry (so callers always get a value).
 */
function resolveDated<T>(table: DatedValue<T>[], date: string): T {
  const sorted = [...table].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let resolved = sorted[0];
  for (const entry of sorted) {
    if (entry.effectiveFrom <= date) {
      resolved = entry;
    } else {
      break;
    }
  }
  return resolved.value;
}

/** Standard VAT rate (%) by effective date. 18% since 2025-01-01. */
const VAT_RATE_TABLE: DatedValue<number>[] = [
  { effectiveFrom: '2025-01-01', value: 18 },
];

/**
 * Allocation-number (מספר הקצאה) threshold in ₪ *before VAT* by effective date.
 * A tax invoice at/above the threshold requires a real-time ITA allocation number.
 * Ratcheting down: 20,000 (2025) → 10,000 (2026-01-01) → 5,000 (2026-06-01).
 */
const ALLOCATION_THRESHOLD_TABLE: DatedValue<number>[] = [
  { effectiveFrom: '2025-01-01', value: 20000 },
  { effectiveFrom: '2026-01-01', value: 10000 },
  { effectiveFrom: '2026-06-01', value: 5000 },
];

export interface TaxBracket {
  /** Upper income limit of this bracket (inclusive); `Infinity` for the top band. */
  limit: number;
  /** Marginal rate applied within the band, as a fraction (e.g. 0.10 = 10%). */
  rate: number;
}

/**
 * Progressive income-tax brackets by effective date.
 *
 * The figures below match the 2026 brackets as widened by Amendment 288. A
 * רו"ח / יועץ מס review is still warranted before relying on tax estimates.
 */
const INCOME_TAX_BRACKETS_TABLE: DatedValue<TaxBracket[]>[] = [
  {
    effectiveFrom: '2026-01-01',
    value: [
      { limit: 84120, rate: 0.10 },
      { limit: 120720, rate: 0.14 },
      { limit: 228000, rate: 0.20 },
      { limit: 301200, rate: 0.31 },
      { limit: 560280, rate: 0.35 },
      { limit: 721560, rate: 0.47 },
      { limit: Infinity, rate: 0.50 },
    ],
  },
];

/** Returns the VAT rate (%) effective on the given ISO date. */
export function getVatRate(date: string): number {
  return resolveDated(VAT_RATE_TABLE, date);
}

/** Returns the allocation-number threshold (₪ before VAT) effective on the given ISO date. */
export function getAllocationThreshold(date: string): number {
  return resolveDated(ALLOCATION_THRESHOLD_TABLE, date);
}

/** Returns the progressive income-tax brackets effective on the given ISO date. */
export function getIncomeTaxBrackets(date: string): TaxBracket[] {
  return resolveDated(INCOME_TAX_BRACKETS_TABLE, date);
}

/** Today's ISO date (`YYYY-MM-DD`), convenience for "current" lookups. */
export function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}
