import * as React from 'react';

type InterceptFn = (action: () => void) => void;

interface NavigationGuardContextValue {
  guardedNavigate: (action: () => void) => void;
  registerGuard: (intercept: InterceptFn | null) => void;
}

const noopContext: NavigationGuardContextValue = {
  guardedNavigate: (action) => action(),
  registerGuard: () => {},
};

const NavigationGuardContext = React.createContext<NavigationGuardContextValue>(noopContext);

/**
 * App-wide seam for the FF-WEB-11 unsaved-changes guard (InvoiceFormPage's leave
 * guard, currently the only user). A dirty page registers an intercept via
 * `useUnsavedChangesLeaveGuard`; every OTHER place that triggers navigation while
 * that page might be on screen (sidebar links, the business switcher, logout — see
 * AppLayout) routes its `navigate(...)` call through `guardedNavigate` so it gets
 * the same "discard unsaved changes?" confirm no matter where the click came from.
 *
 * This exists instead of react-router's `useBlocker` because `useBlocker` only
 * works within a data router (`createBrowserRouter`/`RouterProvider`), and
 * switching this app's plain `<BrowserRouter>` to a data router pulled in ~17 KB
 * gzip of router runtime the ~500 KB bundle budget doesn't have room for.
 */
export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const interceptRef = React.useRef<InterceptFn | null>(null);

  const registerGuard = React.useCallback((intercept: InterceptFn | null) => {
    interceptRef.current = intercept;
  }, []);

  const guardedNavigate = React.useCallback((action: () => void) => {
    if (interceptRef.current) {
      interceptRef.current(action);
    } else {
      action();
    }
  }, []);

  const value = React.useMemo(() => ({ guardedNavigate, registerGuard }), [guardedNavigate, registerGuard]);

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

/** For any component that triggers navigation and wants to respect whatever
 * unsaved-changes guard is currently active — wrap the existing call:
 * `guardedNavigate(() => navigate('/x'))`. A no-op passthrough outside the
 * provider (and whenever nothing is currently guarding), so it's always safe to use. */
export function useGuardedNavigate() {
  return React.useContext(NavigationGuardContext).guardedNavigate;
}

/**
 * A page with unsaved changes calls this with its live `isDirty` to intercept every
 * navigation attempt that goes through `guardedNavigate` — from this page's own
 * buttons AND from anywhere else in the app — while it's mounted and dirty,
 * surfacing a single "discard unsaved changes?" confirm.
 */
export function useUnsavedChangesLeaveGuard(isDirty: boolean) {
  const { registerGuard } = React.useContext(NavigationGuardContext);
  const [pendingAction, setPendingAction] = React.useState<(() => void) | null>(null);

  React.useEffect(() => {
    if (!isDirty) {
      registerGuard(null);
      return;
    }
    registerGuard((action) => setPendingAction(() => action));
    return () => registerGuard(null);
  }, [isDirty, registerGuard]);

  return {
    isBlocked: pendingAction !== null,
    confirmDiscard: () => {
      const action = pendingAction;
      setPendingAction(null);
      action?.();
    },
    cancelDiscard: () => setPendingAction(null),
  };
}
