import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { GuideStepContent } from './guideSteps';

interface GuideOverlayProps {
  isOpen: boolean;
  steps: GuideStepContent[];
  /** i18n key for the small eyebrow label above the step title (the view's name). */
  guideTitleKey: string;
  /** Dismisses just this view's guide (X, Esc, backdrop click, or Done on the last step). */
  onClose: () => void;
  /** "Skip guide" — disables auto-open for every view, globally. */
  onSkip: () => void;
}

/**
 * FF-WEB-9 — reusable step-by-step card overlay for the first-time in-app guide.
 * Deliberately a plain centered card (no element-anchoring): anchoring to
 * `data-guide` element rects was in-scope but risked RTL/layout bugs for a v1, so
 * per the ticket's explicit "skip if it risks RTL/layout bugs" allowance we ship
 * the always-safe centered sequence instead.
 *
 * RTL: no left/right physical CSS anywhere below — layout is a plain centered flex
 * card, gaps/padding use logical Tailwind utilities, and `dir` is set explicitly
 * from the active language so buttons and copy alignment mirror correctly.
 */
export function GuideOverlay({ isOpen, steps, guideTitleKey, onClose, onSkip }: GuideOverlayProps) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  // No reset-on-reopen effect needed: the caller (GuideButton) remounts this
  // component (via a bumped `key`) on every re-open, so this initial value is
  // naturally fresh each time the guide opens.
  const [stepIndex, setStepIndex] = React.useState(0);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const nextButtonRef = React.useRef<HTMLButtonElement>(null);

  // Lock background scroll and move focus into the dialog while open.
  React.useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => nextButtonRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const totalSteps = steps.length;
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;

  const goNext = React.useCallback(() => {
    setStepIndex(i => {
      if (i >= totalSteps - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [totalSteps, onClose]);

  const goBack = React.useCallback(() => {
    setStepIndex(i => Math.max(i - 1, 0));
  }, []);

  // Esc closes; ArrowRight/ArrowLeft + Enter navigate; Tab is trapped inside the card.
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      goNext();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goNext();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack();
      return;
    }
    if (e.key === 'Tab') {
      const container = cardRef.current;
      if (!container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [goNext, goBack, onClose]);

  if (!isOpen || totalSteps === 0) return null;

  const step = steps[stepIndex];

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-step-title"
        aria-describedby="guide-step-body"
        dir={isRtl ? 'rtl' : 'ltr'}
        className="bg-background rounded-2xl shadow-2xl w-full max-w-sm border overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Progress bar */}
        <div className="h-1 w-full bg-slate-100">
          <div
            className="h-1 bg-primary transition-all duration-200"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">{t(guideTitleKey)}</p>
            <h2 id="guide-step-title" className="text-base font-bold text-slate-900 mt-1">
              {t(step.titleKey)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('guide.close') as string}
            className="shrink-0 p-1.5 -m-1.5 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-4">
          <p id="guide-step-body" className="text-sm text-slate-600 leading-relaxed">
            {t(step.bodyKey)}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t bg-slate-50">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {t('guide.skip')}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500 tabular-nums px-1">
              {t('guide.step_counter', { current: stepIndex + 1, total: totalSteps })}
            </span>
            {!isFirstStep && (
              <Button type="button" variant="outline" size="sm" onClick={goBack} className="h-8 px-3 text-xs">
                {t('guide.back')}
              </Button>
            )}
            <Button type="button" size="sm" onClick={goNext} ref={nextButtonRef} className="h-8 px-3 text-xs">
              {isLastStep ? t('guide.done') : t('guide.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
