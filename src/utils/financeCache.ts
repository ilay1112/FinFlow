/**
 * F-3 — Central list of the `finance_*` localStorage keys that cache the user's
 * financial dataset (expenses, invoices, clients, agents, settings, active workspace).
 *
 * Logout and account-switch must purge these so the next person on a shared device —
 * or the next Google account signed in — cannot read the previous user's PII/financial
 * records straight out of localStorage (or via the app's hydrate-from-cache path).
 *
 * Single source of truth so the producer (FinanceContext persistence) and the consumers
 * (logout / account-switch wipe) can never drift apart.
 */
export const FINANCE_CACHE_KEYS = [
  'finance_expenses',
  'finance_categories',
  'finance_clients',
  'finance_booking_agents',
  'finance_invoices',
  'finance_business_settings',
  'finance_active_business',
  // Durable "unsynced edits pending" flag (see FinanceContext). It only refers to
  // the data above, so it must be purged on the same logout/account-switch wipe —
  // a stale dirty flag against another user's (now-cleared) data is meaningless.
  'finance_pending_save',
] as const;

/**
 * localStorage key carrying the durable dirty flag: set when a Drive save fails (so
 * the most recent edits live only in the local cache) and cleared once a save
 * succeeds. It survives reload so the app knows, on next launch, that the cached
 * data is ahead of Drive and must be flushed rather than overwritten.
 */
export const FINANCE_PENDING_SAVE_KEY = 'finance_pending_save';

/** Removes every cached `finance_*` key from localStorage. Safe to call repeatedly. */
export function clearFinanceCache(): void {
  try {
    for (const key of FINANCE_CACHE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('Could not clear finance cache from localStorage', error);
  }
}
