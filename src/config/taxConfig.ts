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

/**
 * Annual turnover ceiling (₪) above which an Esek Patur loses exempt status and
 * must register as an Osek Murshe, by effective date. The figure is set per
 * calendar year and changes most years; resolve it against a date within the
 * relevant year (e.g. `${year}-12-31`).
 *
 * Verified by shlomit (ISRAELI_TAX_COMPLIANCE_REPORT.md): ₪122,833 for 2026.
 */
const OSEK_PATUR_CEILING_TABLE: DatedValue<number>[] = [
  { effectiveFrom: '2026-01-01', value: 122833 },
];

/**
 * Annual turnover (₪) at/above which an Osek Murshe must file VAT MONTHLY rather
 * than bi-monthly, by effective date. The statutory figure is VAT Law §67 =
 * ₪1,500,000; it is CPI-indexed and the indexed value is ~₪1,502,000. We carry the
 * statutory ₪1,500,000 here (shlomit verified live against VAT Law §67, 2026-06).
 *
 * ADVISOR-CONFIRM (report §9 Q1): confirm the exact indexed figure (~₪1,502,000)
 * with a רו"ח / יועץ מס before relying on it to auto-suggest monthly filing.
 */
const VAT_MONTHLY_FILING_THRESHOLD_TABLE: DatedValue<number>[] = [
  { effectiveFrom: '2026-01-01', value: 1500000 },
];

/**
 * Israeli Cash Law (חוק לצמצום השימוש במזומן) parameters for a transaction where one
 * side is a business (עוסק) — tbiz's issuer is always an עוסק, so this rule governs
 * every receipt the app issues. The cash cap is computed in
 * invoiceMath.cashCapForTotal: up to `flatCap` (the threshold) the whole deal may be
 * cash; above it the cap is the lower of `dealFraction * total` and `flatCap`.
 */
export interface CashLimit {
  /** Cash threshold, ₪: deals at/below it may be 100% cash; the absolute cash cap above it. */
  flatCap: number;
  /** Fraction-of-deal cap above the threshold (e.g. 0.10 = 10% of the transaction value). */
  dealFraction: number;
}

/**
 * Cash Law business-transaction cap by effective date. Verified by shlomit
 * (CASH_LAW_PAYMENTS_SPEC.md, researched 2026-06-17): deals up to the ₪6,000 threshold
 * may be settled fully in cash; above it the cash portion is capped at the lower of
 * 10% of the transaction value or ₪6,000. In force since 1 August 2022 (reduced from
 * ₪11,000). The 10% rule binds between ₪6,000 and ₪60,000; the flat ₪6,000 binds at/
 * above ₪60,000.
 */
const CASH_LIMIT_TABLE: DatedValue<CashLimit>[] = [
  { effectiveFrom: '2022-08-01', value: { flatCap: 6000, dealFraction: 0.1 } },
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

/** Returns the Esek Patur annual turnover ceiling (₪) effective on the given ISO date. */
export function getOsekPaturCeiling(date: string): number {
  return resolveDated(OSEK_PATUR_CEILING_TABLE, date);
}

/**
 * Returns the annual turnover (₪) at/above which an Osek Murshe must file VAT
 * monthly (rather than bi-monthly), effective on the given ISO date.
 * ADVISOR-CONFIRM the exact indexed figure (report §9 Q1).
 */
export function getVatMonthlyFilingThreshold(date: string): number {
  return resolveDated(VAT_MONTHLY_FILING_THRESHOLD_TABLE, date);
}

/** Returns the progressive income-tax brackets effective on the given ISO date. */
export function getIncomeTaxBrackets(date: string): TaxBracket[] {
  return resolveDated(INCOME_TAX_BRACKETS_TABLE, date);
}

/**
 * Returns the Cash Law business-transaction cap parameters effective on the given
 * ISO date. The effective cap on the cash portion of a deal is computed in
 * invoiceMath.cashCapForTotal (Condition A up to the threshold, Condition B above it).
 */
export function getCashLimit(date: string): CashLimit {
  return resolveDated(CASH_LIMIT_TABLE, date);
}

/** Today's ISO date (`YYYY-MM-DD`), convenience for "current" lookups. */
export function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}
