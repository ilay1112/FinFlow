import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Receipt, FileText, UserPlus } from 'lucide-react';
import { cn } from '../utils/utils';

interface Props {
  isSidebarOpen?: boolean;
  onCloseSidebar?: () => void;
}

const HIDE_ON: RegExp[] = [
  /^\/invoices\/new$/,
  /^\/invoices\/.+\/edit$/,
];

export function FloatingActionButton({ isSidebarOpen, onCloseSidebar }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  useEffect(() => { setIsOpen(false); }, [location.pathname]);

  if (HIDE_ON.some(re => re.test(location.pathname))) return null;

  const actions = [
    {
      label: t('dashboard.new_expense'),
      icon: Receipt,
      bg: 'bg-amber-500',
      onClick: () => navigate('/expenses?action=new'),
    },
    {
      label: t('dashboard.new_invoice_receipt'),
      icon: FileText,
      bg: 'bg-primary',
      onClick: () => navigate('/invoices/new'),
    },
    {
      label: t('dashboard.new_client'),
      icon: UserPlus,
      bg: 'bg-emerald-500',
      onClick: () => navigate('/clients?action=new'),
    },
  ];

  // Move to left when sidebar is open (sidebar slides in from the right in RTL)
  const side: React.CSSProperties = isSidebarOpen
    ? { left: '1.5rem' }
    : { right: '1.5rem' };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[75] bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Fixed anchor — the FAB button never moves */}
      <div
        className="fixed z-[80] md:hidden transition-all duration-200"
        style={{
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          ...side,
        }}
      >
        {/* Action items float above the button */}
        {isOpen && (
          <div
            className={cn(
              'absolute bottom-full mb-3 flex flex-col gap-3',
              // Align items to the same edge the FAB is on
              isSidebarOpen ? 'items-start left-0' : 'items-end right-0',
            )}
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            {actions.map((action, i) => (
              <button
                key={action.label}
                className={cn(
                  'flex items-center gap-3 h-12 px-4 rounded-2xl text-white font-bold text-sm whitespace-nowrap',
                  'shadow-xl active:scale-95 transition-transform duration-100',
                  'animate-in slide-in-from-bottom-3 fade-in',
                  action.bg,
                )}
                style={{
                  animationDuration: '180ms',
                  animationDelay: `${i * 55}ms`,
                  animationFillMode: 'backwards',
                }}
                onClick={() => { setIsOpen(false); onCloseSidebar?.(); action.onClick(); }}
              >
                <div className="bg-white/25 p-1.5 rounded-xl shrink-0">
                  <action.icon className="h-4 w-4" strokeWidth={2.5} />
                </div>
                <span className="pe-1">{action.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Main FAB button */}
        <button
          className={cn(
            'h-14 w-14 rounded-full bg-primary text-primary-foreground',
            'flex items-center justify-center shadow-xl shadow-primary/30',
            'transition-transform duration-300 active:scale-90',
            isOpen && 'rotate-45',
          )}
          onClick={() => setIsOpen(prev => !prev)}
          aria-label="Quick actions"
          aria-expanded={isOpen}
        >
          <Plus className="h-7 w-7" strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}
