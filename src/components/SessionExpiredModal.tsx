import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, LogIn } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Invoked synchronously from the primary button's click. Browser popup blockers only
   * allow the Google sign-in popup inside a direct user gesture — that constraint is
   * why this modal exists at all instead of auto-launching login() when the session
   * expires. Never call this outside a click handler.
   */
  onSignIn: () => void;
  hasUnsyncedChanges: boolean;
}

/**
 * Shown automatically when silent token renewal fails for a signed-in identity.
 * Editing stays offline-first while it's open; on successful re-login the parent
 * closes it (sessionExpired flips false) and FinanceContext flushes pending edits.
 */
export function SessionExpiredModal({ isOpen, onClose, onSignIn, hasUnsyncedChanges }: Props) {
  const { t } = useTranslation();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('session.expired_title')}>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="bg-amber-100 p-3 rounded-full shrink-0">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{t('session.expired_body')}</p>
        </div>

        {hasUnsyncedChanges && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">{t('session.expired_unsynced')}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 pt-1">
          <Button className="h-12 font-bold gap-2" onClick={onSignIn}>
            <LogIn className="h-4 w-4" />
            {t('session.sign_in_google')}
          </Button>
          <Button variant="outline" className="h-12" onClick={onClose}>
            {t('session.continue_offline')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
