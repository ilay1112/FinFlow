import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Israeli Esek Zair normative deduction: 30% of revenue is treated as deductible
 * without receipts (2024–2026 reform). Single source of truth for this rate.
 */
export const NORMATIVE_DEDUCTION_RATE = 0.30;

/**
 * Calculates progressive income tax based on Israeli tax brackets (2026).
 * https://www.kolzchut.org.il/he/מדרגות_מס_הכנסה
 */
export function calculateProgressiveTax(income: number): number {
  if (income <= 0) return 0;

  const brackets = [
    { limit: 84120, rate: 0.10 },
    { limit: 120720, rate: 0.14 },
    { limit: 228000, rate: 0.20 },
    { limit: 301200, rate: 0.31 },
    { limit: 560280, rate: 0.35 },
    { limit: 721560, rate: 0.47 },
    { limit: Infinity, rate: 0.50 }
  ];

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
