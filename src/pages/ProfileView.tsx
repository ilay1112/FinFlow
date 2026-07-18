import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFinance, type BusinessSettings, type BusinessType } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { AlertDialog } from '../components/ui/AlertDialog';
import { GuideButton } from '../components/guide/GuideButton';
import { cn } from '../utils/utils';
import { CheckCircle, Cloud, LogOut, AlertCircle, Trash2, RefreshCw } from 'lucide-react';

export default function ProfileView() {
  const { t } = useTranslation();
  const { businessSettings, activeBusiness, updateBusinessSettings, deleteBusiness, isLoading } = useFinance();
  const { user, isAuthenticated, logout, login } = useAuth();
  const [formData, setFormData] = useState<BusinessSettings>(businessSettings);
  const [isSaved, setIsSaved] = useState(false);

  // Delete State
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isDeleteVerifyModalOpen, setIsDeleteVerifyModalOpen] = useState(false);
  const [deleteVerificationText, setDeleteVerificationText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Check if profile is incomplete (forced onboarding state)
  const isProfileIncomplete = !businessSettings.name;

  useEffect(() => {
    requestAnimationFrame(() => {
      setFormData(businessSettings);
    });
  }, [businessSettings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateBusinessSettings(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleDeleteInitial = () => {
    setIsDeleteAlertOpen(true);
  };

  const handleConfirmInitialDelete = () => {
    setIsDeleteAlertOpen(false);
    setDeleteVerificationText('');
    setDeleteError(null);
    setIsDeleteVerifyModalOpen(true);
  };

  const handleFinalDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;

    const verifyWord = t('profile.delete_verify_word');
    const expectedText = `${verifyWord} ${activeBusiness.name}`;
    if (deleteVerificationText.trim().toLowerCase() !== expectedText.toLowerCase()) {
      setDeleteError(t('profile.delete_verify_error'));
      return;
    }

    try {
      await deleteBusiness(activeBusiness.id);
      setIsDeleteVerifyModalOpen(false);
    } catch (error) {
      setDeleteError('An unexpected error occurred during deletion.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {isProfileIncomplete && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{t('profile.incomplete_error')}</p>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold text-slate-900">{t('profile.title')}</h1>
          <GuideButton viewId="profile" />
        </div>
        <p className="text-slate-500 mt-1">{t('profile.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.identity_title')}</CardTitle>
          <CardDescription>{t('profile.identity_subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('profile.business_name')}</label>
                <Input 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('profile.id_number')}</label>
                <Input 
                  value={formData.idNumber}
                  onChange={(e) => setFormData({...formData, idNumber: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('profile.business_type')}</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.type || 'EsekPatur'}
                onChange={(e) => setFormData({...formData, type: e.target.value as BusinessType})}
              >
                <option value="EsekPatur">{t('profile.type_patur')}</option>
                <option value="EsekMorshe">{t('profile.type_morshe')}</option>
                <option value="Company">{t('profile.type_company')}</option>
              </select>
              <p className="text-xs text-slate-400 mt-1">
                {t('profile.type_help')}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('profile.address')}</label>
              <Input 
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('profile.phone')}</label>
                <Input 
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('profile.email')}</label>
                <Input 
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Button type="submit" className="px-8" disabled={isLoading}>
                  {t('common.save')}
                </Button>
                {isSaved && (
                  <span className="text-green-600 text-sm flex items-center gap-1 animate-in fade-in">
                    <CheckCircle className="h-4 w-4" /> {t('profile.save_success')}
                  </span>
                )}
              </div>
              
              {!isProfileIncomplete && activeBusiness && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-2"
                  onClick={handleDeleteInitial}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('profile.delete_business')}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Cloud Sync Status */}
      <Card className="border-indigo-100 bg-indigo-50/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-700">
              <Cloud className="h-5 w-5" />
              <CardTitle className="text-indigo-900">Cloud Synchronization</CardTitle>
            </div>
            {isAuthenticated ? (
              <Button variant="outline" size="sm" onClick={logout} className="text-red-600 border-red-200 hover:bg-red-50">
                <LogOut className="h-4 w-4 mr-2" /> Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={login}>Connect Drive</Button>
            )}
          </div>
          <CardDescription>
            {isAuthenticated 
              ? `Connected to ${user?.email}. Your data is automatically backed up to Google Drive.`
              : 'Connect your Google account to sync data across devices and backup receipts.'}
          </CardDescription>
        </CardHeader>
        {isAuthenticated && (
          <CardContent>
            <div className="flex items-center gap-4 p-3 bg-white rounded-lg border border-indigo-100 shadow-sm">
              <img 
                src={user?.picture} 
                alt={user?.name || "User Avatar"} 
                width="48"
                height="48"
                loading="lazy"
                className="h-12 w-12 rounded-full border-2 border-indigo-200" 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random`;
                }}
              />
              <div>
                <p className="font-bold text-slate-900">{user?.name}</p>
                <p className="text-sm text-slate-500">{user?.email}</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Delete Confirmation Dialog 1 */}
      <AlertDialog
        isOpen={isDeleteAlertOpen}
        onClose={() => setIsDeleteAlertOpen(false)}
        onConfirm={handleConfirmInitialDelete}
        title={t('profile.delete_confirm_title')}
        description={t('profile.delete_confirm_desc')}
        confirmText={t('profile.delete_continue')}
        cancelText={t('common.cancel')}
        variant="destructive"
      />

      {/* Delete Confirmation Modal 2 (Text Verification) */}
      <Modal
        isOpen={isDeleteVerifyModalOpen}
        onClose={() => setIsDeleteVerifyModalOpen(false)}
        title={t('profile.delete_confirm_title')}
      >
        <form onSubmit={handleFinalDelete} className="space-y-4">
          <div className="bg-red-50 p-4 rounded-lg border border-red-100 flex gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 leading-relaxed font-medium">
              {t('profile.delete_confirm_desc')}
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <label className="text-sm font-bold text-slate-700">
              {t('profile.delete_verify_label', { word: t('profile.delete_verify_word'), name: activeBusiness?.name })}
            </label>
            <Input
              value={deleteVerificationText}
              onChange={(e) => {
                setDeleteVerificationText(e.target.value);
                setDeleteError(null);
              }}
              placeholder={`${t('profile.delete_verify_word')} ${activeBusiness?.name}`}
              className={cn("h-11 border-2", deleteError ? "border-red-500 bg-red-50" : "focus:border-primary")}
              autoFocus
            />
            {deleteError && (
              <p className="text-xs font-bold text-red-600 animate-in fade-in slide-in-from-top-1">
                {deleteError}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsDeleteVerifyModalOpen(false)}
              className="h-11 md:h-10 order-2 sm:order-1"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              variant="destructive"
              className="h-11 md:h-10 px-8 order-1 sm:order-2 font-bold"
              disabled={isLoading || !deleteVerificationText}
            >
              {isLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('profile.delete_business')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
