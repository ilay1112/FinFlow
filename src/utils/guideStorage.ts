/**
 * FF-WEB-9 — localStorage for the first-time in-app guide (per-view walkthroughs).
 *
 * This is a per-device UI preference ("has this device's user seen/skipped the
 * tour"), not part of the user's financial dataset — so it deliberately does NOT
 * live in the `finance_*` registry (see `utils/financeCache.ts`) and must never be
 * cleared by `clearFinanceCache()` / the logout or workspace-switch wipe. A user who
 * dismissed or skipped the guide should not have it reappear just because they
 * signed out, switched Google accounts, or switched workspaces on the same device.
 * Standalone `tbiz_guide_*` key, single source of truth for producer (this module)
 * and consumer (GuideButton).
 */

export type GuideViewId =
  | 'dashboard'
  | 'income'
  | 'invoiceForm'
  | 'expenses'
  | 'clients'
  | 'bookingAgents'
  | 'taxes'
  | 'vat'
  | 'profile';

const STORAGE_KEY = 'tbiz_guide_state_v1';

interface GuideStorageState {
  /** "Skip guide" — set on ANY step of ANY view; disables auto-open everywhere. */
  disabled: boolean;
  /** Per-view "has this device's user already been shown/dismissed this guide". */
  seen: Partial<Record<GuideViewId, boolean>>;
}

function readState(): GuideStorageState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { disabled: false, seen: {} };
    const parsed = JSON.parse(raw);
    return {
      disabled: !!parsed?.disabled,
      seen: parsed?.seen && typeof parsed.seen === 'object' ? parsed.seen : {},
    };
  } catch {
    // Corrupt/unavailable storage (private mode, quota) — behave as if fresh.
    return { disabled: false, seen: {} };
  }
}

function writeState(state: GuideStorageState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort only — worst case the guide re-shows next visit.
  }
}

export function isGuideGloballyDisabled(): boolean {
  return readState().disabled;
}

export function hasSeenGuide(viewId: GuideViewId): boolean {
  return !!readState().seen[viewId];
}

/** Marks a single view's guide as seen, without touching the global disable flag. */
export function markGuideSeen(viewId: GuideViewId): void {
  const state = readState();
  if (state.seen[viewId]) return;
  writeState({ ...state, seen: { ...state.seen, [viewId]: true } });
}

/** "Skip guide" — disables auto-open for every view, globally, on this device.
 * The per-view "?" re-open button still works afterwards (explicit re-open wins). */
export function disableAllGuides(): void {
  const state = readState();
  if (state.disabled) return;
  writeState({ ...state, disabled: true });
}
