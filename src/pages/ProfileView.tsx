import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFinance, type BusinessSettings, type BusinessType } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { CheckCircle, Cloud, LogOut } from 'lucide-react';

export default function ProfileView() {
  const { t } = useTranslation();
  const { businessSettings, updateBusinessSettings } = useFinance();
  const { user, isAuthenticated, logout, login } = useAuth();
  const [formData, setFormData] = useState<BusinessSettings>(businessSettings);
  const [isSaved, setIsSaved] = useState(false);

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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('profile.title')}</h1>
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
                value={formData.type}
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

            <div className="pt-4 flex items-center gap-4">
              <Button type="submit" className="px-8">
                {t('common.save')}
              </Button>
              {isSaved && (
                <span className="text-green-600 text-sm flex items-center gap-1 animate-in fade-in">
                  <CheckCircle className="h-4 w-4" /> {t('profile.save_success')}
                </span>
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
                alt={user?.name} 
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
    </div>
  );
}
