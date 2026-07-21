import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { getIncomeTaxBrackets, todayIso } from "../config/taxConfig"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Structural deep-equality for plain JSON-shaped form state (strings, numbers,
 * booleans, arrays, plain objects). Used by the unsaved-changes guards (FF-WEB-11)
 * to compare a form's current values against the snapshot captured when it was
 * opened, so a no-op edit (typed then deleted back to the original) reads as
 * clean rather than "any render touched state" dirty.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object' || typeof b === 'undefined') {
    return a === b;
  }
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;
  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

/**
 * Israeli Esek Zair normative deduction: 30% of revenue is treated as deductible
 * without receipts (2024–2026 reform). Single source of truth for this rate.
 */
export const NORMATIVE_DEDUCTION_RATE = 0.30;

/**
 * Calculates progressive income tax based on Israeli tax brackets.
 * Brackets are resolved from the dated config (src/config/taxConfig.ts) for the
 * given date so the table is maintained in one place.
 * https://www.kolzchut.org.il/he/מדרגות_מס_הכנסה
 */
export function calculateProgressiveTax(income: number, date: string = todayIso()): number {
  if (income <= 0) return 0;

  const brackets = getIncomeTaxBrackets(date);

  let tax = 0;
  let remainingIncome = income;
  let previousLimit = 0;

  for (const bracket of brackets) {
    const taxableInBracket = Math.min(
      Math.max(0, remainingIncome), 
      bracket.limit - previousLimit
    );
    tax += taxableInBracket * bracket.rate;
    remainingIncome -= taxableInBracket;
    previousLimit = bracket.limit;
    if (remainingIncome <= 0) break;
  }

  return tax;
}
