import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { cn } from '../../utils/utils';

/** A single table-row action, rendered inline (≥1200px) or inside the kebab menu (<1200px). */
export interface RowAction {
  /** Stable key for the list. */
  key: string;
  icon: LucideIcon;
  /** Localized label — the inline button's tooltip and the menu item's text. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Red styling for delete/cancel-style actions. */
  destructive?: boolean;
  /** Extra classes for the inline icon button (e.g. a hover color). */
  inlineClassName?: string;
}

const MENU_WIDTH = 224; // w-56

/**
 * Per-row actions for a data table. At ≥1200px it renders the actions as the usual
 * inline ghost icon buttons; below 1200px it collapses them into a single kebab that
 * opens a dropdown menu, so a crowded action column never overflows on narrow screens.
 *
 * The menu is portaled to <body> with fixed positioning because the tables live inside
 * an `overflow-x-auto` scroll container that would otherwise clip an absolutely
 * positioned dropdown.
 */
export function RowActions({ actions }: { actions: RowAction[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Align the menu's end edge under the kebab, then clamp on-screen (works for both
    // LTR and RTL since we resolve to a pixel left offset).
    let left = r.right - MENU_WIDTH;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));
    setCoords({ top: r.bottom + 4, left });
  }, []);

  const openMenu = () => { place(); setOpen(true); };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEsc);
    // Any scroll (incl. the table's own horizontal scroll) or resize invalidates the
    // anchored position — just close rather than chase it.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      {/* Inline icon buttons — ≥1200px */}
      <div className="hidden min-[1200px]:flex justify-end gap-1">
        {actions.map(a => (
          <Button
            key={a.key}
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8 text-slate-400', a.inlineClassName)}
            disabled={a.disabled}
            onClick={a.onClick}
            title={a.label}
          >
            <a.icon className="h-4 w-4" />
          </Button>
        ))}
      </div>

      {/* Kebab trigger — <1200px */}
      <div className="flex min-[1200px]:hidden justify-end">
        <Button
          ref={btnRef}
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-slate-500"
          aria-haspopup="menu"
          aria-expanded={open}
          title={t('common.actions')}
          onClick={() => (open ? setOpen(false) : openMenu())}
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
      </div>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: MENU_WIDTH, zIndex: 200 }}
          className="bg-white border rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-150"
        >
          {actions.map(a => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-start transition-colors disabled:opacity-40 disabled:pointer-events-none',
                a.destructive ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'
              )}
              onClick={() => { setOpen(false); a.onClick(); }}
            >
              <a.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{a.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
