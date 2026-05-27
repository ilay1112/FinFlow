import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  Receipt, 
  FileText, 
  Users, 
  Calculator, 
  Menu,
  CreditCard,
  X,
  LogOut,
  Cloud,
  CloudOff,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { cn } from '../utils/utils';
import { Button } from '../components/ui/Button';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAuth } from '../context/AuthContext';
import { useFinance } from '../context/FinanceContext';

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const { user, logout, isAuthenticated } = useAuth();
  const { isLoading, isSyncing, syncError } = useFinance();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const isRtl = i18n.language === 'he';

  const navigation = [
    { name: t('common.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('common.expenses'), href: '/expenses', icon: Receipt },
    { name: t('common.invoices'), href: '/invoices', icon: FileText },
    { name: t('common.clients'), href: '/clients', icon: Users },
    { name: t('common.taxes'), href: '/taxes', icon: Calculator },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Sync Status Overlay / Loading */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/80 z-[100] flex items-center justify-center backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="h-10 w-10 text-primary animate-spin" />
            <p className="text-slate-600 font-medium animate-pulse">{t('common.syncing') || 'Syncing with Drive...'}</p>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 z-50 w-64 bg-white border-e transform transition-transform duration-200 md:relative md:translate-x-0",
        isRtl ? "right-0" : "left-0",
        isSidebarOpen 
          ? "translate-x-0" 
          : isRtl ? "translate-x-full" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-primary rounded-lg p-2">
                <CreditCard className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">FinFlow</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden" 
              onClick={() => setIsSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t bg-slate-50 flex flex-col gap-3">
            <div className="px-2">
              <LanguageSwitcher />
            </div>

            {isAuthenticated && (
              <div className="space-y-3">
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm text-xs font-bold uppercase tracking-wider transition-all",
                  isSyncing ? "bg-indigo-50 border-indigo-200" : 
                  syncError ? "bg-red-50 border-red-200" : 
                  "bg-white border-slate-200"
                )}>
                  {isSyncing ? (
                    <RefreshCw className="h-4 w-4 text-indigo-500 animate-spin" />
                  ) : syncError ? (
                    <CloudOff className="h-4 w-4 text-red-500" />
                  ) : (
                    <Cloud className="h-4 w-4 text-green-500" />
                  )}
                  <span className={cn(
                    "flex-1 truncate",
                    isSyncing ? "text-indigo-700" :
                    syncError ? "text-red-700" : "text-slate-700"
                  )}>
                    {isSyncing ? 'Syncing...' : syncError ? 'Offline' : 'Drive Synced'}
                  </span>
                </div>

                <div className="flex items-center gap-3 px-2">
                  <NavLink 
                    to="/profile" 
                    onClick={() => setIsSidebarOpen(false)}
                    className="shrink-0 hover:ring-2 hover:ring-primary/20 rounded-full transition-all active:scale-95"
                  >
                    <img src={user?.picture} alt={user?.name} className="h-10 w-10 rounded-full border-2 border-white shadow-md" />
                  </NavLink>
                  <div className="flex-1 overflow-hidden">
                    <NavLink 
                      to="/profile" 
                      onClick={() => setIsSidebarOpen(false)}
                      className="text-sm font-bold text-slate-900 truncate block hover:text-primary transition-colors"
                    >
                      {user?.name}
                    </NavLink>
                    <button 
                      onClick={logout}
                      className="text-[10px] text-slate-500 hover:text-red-600 flex items-center gap-1 transition-colors font-medium mt-0.5"
                    >
                      <LogOut className="h-3 w-3" /> Sign Out
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center justify-between px-4 md:px-8 sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden" 
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </Button>
            
            <div className="hidden md:flex items-center gap-2 text-sm font-medium text-slate-500">
              <span>Workspace</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-900">Small Business</span>
            </div>
          </div>
          
          <div className="flex-1 md:hidden text-center font-bold text-xl">
            FinFlow
          </div>

          <div className="flex items-center gap-4">
            {syncError && (
              <div className="hidden md:flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 px-3 py-1.5 rounded-full border border-red-100">
                <AlertCircle className="h-3.5 w-3.5" />
                {syncError}
              </div>
            )}
            {isAuthenticated && (
               <NavLink to="/profile" className="hidden md:block">
                 <img src={user?.picture} alt={user?.name} className="h-8 w-8 rounded-full border shadow-sm hover:ring-2 hover:ring-primary/20 transition-all" />
               </NavLink>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50/50">
          <div className="max-w-7xl mx-auto p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
