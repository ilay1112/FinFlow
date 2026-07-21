import * as React from "react"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "./Button"
import { ConfirmDialogBody } from "./ConfirmDialogBody"

/** Helpers handed to function-as-children so a form's own Cancel button can route
 * through the exact same "attempt close → confirm if dirty" flow as the X/backdrop/
 * Escape paths, instead of closing directly and bypassing the guard (FF-WEB-11). */
interface ModalChildHelpers {
  requestClose: () => void
}

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode | ((helpers: ModalChildHelpers) => React.ReactNode)
  /**
   * When true, all close paths (X button, backdrop click, Escape, and — for
   * function-as-children consumers — the `requestClose` helper) first show a
   * "discard unsaved changes?" confirm instead of closing immediately; `onClose`
   * is only invoked once the user confirms the discard. Pass the consumer's live
   * isDirty boolean. Defaults to false — unguarded modals behave exactly as before
   * (no regression for the many non-form modals: previews, history lists, etc.).
   */
  confirmClose?: boolean
}

// Reference-counted body-scroll lock so nested modals (the guarded modal + its own
// discard-confirm overlay) don't stomp on each other's `overflow` cleanup — only the
// last one closing re-enables page scroll.
let openModalCount = 0;
function lockBodyScroll() {
  openModalCount += 1;
  document.body.style.overflow = "hidden";
}
function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) {
    document.body.style.overflow = "unset";
  }
}

// Broader than GuideOverlay's button-only trap (GuideOverlay.tsx:94) because arbitrary
// Modal content includes form fields, not just buttons (FF-WEB-11 a11y fix).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Tab-cycle trap, mirroring GuideOverlay.tsx:91-105 — keeps focus inside `container`
// instead of leaking into the still-interactive page/modal behind it.
function trapTabKey(container: HTMLElement | null, e: React.KeyboardEvent) {
  if (!container) return;
  const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
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

export function Modal({ isOpen, onClose, title, children, confirmClose = false }: ModalProps) {
  const { t } = useTranslation();
  const [showDiscardConfirm, setShowDiscardConfirm] = React.useState(false);
  const titleId = React.useId();
  const confirmTitleId = React.useId();

  // Dialog semantics + focus trap/restore for the base modal (WCAG 4.1.2 / 2.4.3 /
  // 2.1.2). `previouslyFocusedRef` restores focus to whatever triggered the modal
  // (e.g. GuideButton's `triggerRef` pattern in GuideButton.tsx:36,67,74) once it closes.
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

  // Same trio for the nested discard-confirm overlay — it gets its own dialog role,
  // trap, and focus in/out so it behaves as an independent (if visually stacked) dialog.
  const confirmDialogRef = React.useRef<HTMLDivElement>(null);
  const confirmCloseButtonRef = React.useRef<HTMLButtonElement>(null);
  const previouslyFocusedBeforeConfirmRef = React.useRef<HTMLElement | null>(null);

  const attemptClose = React.useCallback(() => {
    if (confirmClose) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [confirmClose, onClose]);

  // Read via refs inside the keydown listener so the effect below only needs to
  // subscribe/unsubscribe once per open/close cycle of THIS modal instance (not on
  // every render), keeping the body-scroll lock a clean single increment/decrement.
  // Synced in their own effects (not written during render) — they only need to be
  // current by the time a keydown can actually happen, well after commit.
  const attemptCloseRef = React.useRef(attemptClose);
  React.useEffect(() => {
    attemptCloseRef.current = attemptClose;
  }, [attemptClose]);
  const showDiscardConfirmRef = React.useRef(showDiscardConfirm);
  React.useEffect(() => {
    showDiscardConfirmRef.current = showDiscardConfirm;
  }, [showDiscardConfirm]);

  React.useEffect(() => {
    // Closing (or never opening) clears any stale confirm state left over from a
    // previous open — the next open should never resume mid-confirm.
    if (!isOpen) setShowDiscardConfirm(false);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // If the discard-confirm is already up, Escape dismisses IT ("keep editing")
      // rather than re-triggering the guard.
      if (showDiscardConfirmRef.current) {
        setShowDiscardConfirm(false);
      } else {
        attemptCloseRef.current();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    lockBodyScroll();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      unlockBodyScroll();
    };
  }, [isOpen]);

  // Initial focus + focus restore for the base modal (mirrors GuideOverlay.tsx:40-49,
  // plus restoring focus to whatever was focused before open — GuideOverlay leaves
  // that restore to its caller via a stable `triggerRef`, but Modal has no single
  // caller-owned trigger to lean on, so it captures/restores `document.activeElement`
  // itself).
  React.useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen]);

  // Same pattern for the nested discard-confirm overlay: focus moves into it on open
  // and returns to the modal (not the page behind it) on close.
  React.useEffect(() => {
    if (!showDiscardConfirm) return;
    previouslyFocusedBeforeConfirmRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => confirmCloseButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      previouslyFocusedBeforeConfirmRef.current?.focus();
    };
  }, [showDiscardConfirm]);

  if (!isOpen) return null;

  const requestClose = attemptClose;
  const content = typeof children === "function" ? children({ requestClose }) : children;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 touch-pan-y overflow-x-hidden overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget) attemptClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-background rounded-lg shadow-lg w-full max-w-lg border overflow-hidden animate-in zoom-in-95 duration-200 touch-pan-y overscroll-contain"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Tab") trapTabKey(dialogRef.current, e);
        }}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
          <Button ref={closeButtonRef} variant="ghost" size="icon" onClick={attemptClose} aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-6 touch-pan-y">
          {content}
        </div>
      </div>

      {/* Discard-unsaved-changes confirm — rendered as a sibling AFTER the modal's
          own content so it paints above it (same z-[100] stacking context, later in
          DOM order wins the tie). Built from the same ConfirmDialogBody AlertDialog
          uses, so it's visually identical to the shared AlertDialog component; it
          isn't literally <AlertDialog> to avoid a Modal↔AlertDialog circular import
          and to avoid a second modal instance double-managing the body-scroll lock. */}
      {confirmClose && showDiscardConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDiscardConfirm(false);
          }}
        >
          <div
            ref={confirmDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            className="bg-background rounded-lg shadow-lg w-full max-w-md border overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Tab") trapTabKey(confirmDialogRef.current, e);
            }}
          >
            <div className="flex items-center justify-between p-6 border-b">
              <h2 id={confirmTitleId} className="text-xl font-semibold">{t('common.unsaved_changes_title')}</h2>
              <Button ref={confirmCloseButtonRef} variant="ghost" size="icon" onClick={() => setShowDiscardConfirm(false)} aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6">
              <ConfirmDialogBody
                description={t('common.unsaved_changes_description')}
                cancelText={t('common.keep_editing')}
                confirmText={t('common.discard')}
                variant="destructive"
                onCancel={() => setShowDiscardConfirm(false)}
                onConfirm={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
