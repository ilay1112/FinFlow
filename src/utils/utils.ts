import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { getIncomeTaxBrackets, todayIso } from "../config/taxConfig"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
