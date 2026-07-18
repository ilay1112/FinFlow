import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { GuideOverlay } from './GuideOverlay';
import { GUIDE_STEPS, GUIDE_TITLE_KEYS } from './guideSteps';
import { useFinance } from '../../context/FinanceContext';
import {
  disableAllGuides,
  hasSeenGuide,
  isGuideGloballyDisabled,
  markGuideSeen,
  type GuideViewId,
} from '../../utils/guideStorage';
import { cn } from '../../utils/utils';

interface GuideButtonProps {
  viewId: GuideViewId;
  className?: string;
}

/**
 * FF-WEB-9 — per-view guide entry point: a small "?" icon (consistent placement
 * next to each view's <h1>) that re-opens the view's guide anytime, plus the
 * auto-open-on-first-visit behavior. Fully self-contained (owns its own overlay
 * state) so it unmounts cleanly on route change with no app-wide guide context.
 */
export function GuideButton({ viewId, className }: GuideButtonProps) {
  const { t } = useTranslation();
  const { sessionExpired } = useFinance();

  // The "?" trigger is always mounted (only the overlay is conditional), so this
  // ref stays valid across the guide's whole open/close lifecycle — including the
  // first-visit auto-open, which has no prior click to restore focus to. Per
  // WCAG 2.4.3, closing the guide by any path must return focus to a predictable,
  // visible location rather than dropping it to <body>; the trigger is that spot.
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Auto-open on this device's FIRST visit to the view. A lazy initializer (runs
  // once, synchronously, at mount) rather than an effect — this is a one-time
  // "read external state to seed this render" decision, not a subscription.
  const [isOpen, setIsOpen] = React.useState(() => {
    if (sessionExpired) return false;
    if (isGuideGloballyDisabled()) return false;
    if (hasSeenGuide(viewId)) return false;
    return true;
  });
  // Bumped on every (re)open so <GuideOverlay> remounts and starts back at its
  // first step — cheaper than a reset effect inside the overlay itself.
  const [openKey, setOpenKey] = React.useState(0);

  // If the session expires WHILE the guide is open, close it so it stops
  // fighting the session-expired sign-in prompt for focus. Adjusts state during
  // render on the sessionExpired edge (no effect) — the same pattern already
  // used for the session modal in layouts/AppLayout.tsx.
  const [prevSessionExpired, setPrevSessionExpired] = React.useState(sessionExpired);
  if (prevSessionExpired !== sessionExpired) {
    setPrevSessionExpired(sessionExpired);
    if (sessionExpired) setIsOpen(false);
  }

  const steps = GUIDE_STEPS[viewId];
  if (!steps || steps.length === 0) return null;

  const handleClose = () => {
    markGuideSeen(viewId);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleSkip = () => {
    disableAllGuides();
    markGuideSeen(viewId);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleReopen = () => {
    setOpenKey(k => k + 1);
    setIsOpen(true);
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={handleReopen}
        aria-label={t('guide.reopen_aria')}
        title={t('guide.reopen_aria')}
        className={cn(
          'inline-flex items-center justify-center h-7 w-7 rounded-full border border-slate-200 bg-white text-slate-500 hover:text-primary hover:border-primary/40 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <GuideOverlay
        key={openKey}
        isOpen={isOpen}
        steps={steps}
        guideTitleKey={GUIDE_TITLE_KEYS[viewId]}
        onClose={handleClose}
        onSkip={handleSkip}
      />
    </>
  );
}
