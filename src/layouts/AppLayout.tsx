import React, { useState, useRef, useEffect } from 'react';
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
  AlertCircle,
  ChevronDown,
  Plus
} from 'lucide-react';
import { cn } from '../utils/utils';
import { Button } from '../components/ui/Button';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAuth } from '../context/AuthContext';
import { useFinance } from '../context/FinanceContext';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const { user, logout, isAuthenticated } = useAuth();
  const { isLoading, isSyncing, syncError, businesses, activeBusiness, switchBusiness, createBusiness } = useFinance();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBusinessDropdownOpen, setIsBusinessDropdownOpen] = useState(false);
  const [isCreateBusinessModalOpen, setIsCreateBusinessModalOpen] = useState(false);
  const [newBusinessName, setNewBusinessName] = useState('');
  const businessDropdownRef = useRef<HTMLDivElement>(null);
  
  const isRtl = i18n.language === 'he';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (businessDropdownRef.current && !businessDropdownRef.current.contains(event.target as Node)) {
        setIsBusinessDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newBusinessName.trim()) {
      await createBusiness(newBusinessName.trim());
      setNewBusinessName('');
      setIsCreateBusinessModalOpen(false);
      setIsBusinessDropdownOpen(false);
    }
  };

  const navigation = [
    { name: t('common.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('common.expenses'), href: '/expenses', icon: Receipt },
    { name: t('common.invoices'), href: '/invoices', icon: FileText },
    { name: t('common.clients'), href: '/clients', icon: Users },
    { name: t('common.taxes'), href: '/taxes', icon: Calculator },
  ];

  return (
    <div className="h-screen h-[100dvh] bg-slate-50 flex overflow-hidden pb-[env(safe-area-inset-bottom,0px)]" dir={isRtl ? 'rtl' : 'ltr'}>
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
        "fixed inset-y-0 z-50 w-64 bg-white border-e transform transition-transform duration-200 md:relative md:translate-x-0 pt-[env(safe-area-inset-top,0px)]",
        isRtl ? "right-0" : "left-0",
        isSidebarOpen 
          ? "translate-x-0" 
          : isRtl ? "translate-x-full" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <div className="p-4 border-b relative" ref={businessDropdownRef}>
            <button 
              className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 p-2 rounded-lg transition-colors text-left"
              onClick={() => setIsBusinessDropdownOpen(!isBusinessDropdownOpen)}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="bg-primary rounded-lg p-2 shrink-0">
                  <CreditCard className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs text-slate-500 uppercase font-bold tracking-wider leading-none mb-1">Workspace</span>
                  <span className="text-sm font-bold text-slate-900 tracking-tight truncate leading-none">
                    {activeBusiness ? activeBusiness.name : 'FinFlow'}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
            </button>

            {isBusinessDropdownOpen && (
              <div className="absolute top-full left-4 right-4 mt-2 bg-white border shadow-xl rounded-lg z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="max-h-60 overflow-y-auto p-1">
                  {businesses.map((business) => (
                    <button
                      key={business.id}
                      className={cn(
                        "w-full text-start px-3 py-2 text-sm font-medium rounded-md transition-colors",
                        activeBusiness?.id === business.id ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100"
                      )}
                      onClick={() => {
                        switchBusiness(business.id);
                        setIsBusinessDropdownOpen(false);
                      }}
                    >
                      {business.name}
                    </button>
                  ))}
                </div>
                <div className="p-1 border-t bg-slate-50">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
                    onClick={() => {
                      setIsCreateBusinessModalOpen(true);
                    }}
                  >
                    <div className="bg-white rounded p-1 shadow-sm border border-slate-200">
                      <Plus className="h-3 w-3 text-slate-600" />
                    </div>
                    Create Workspace
                  </button>
                </div>
              </div>
            )}
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden absolute top-4 right-4" 
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
                    <img 
                      src={user?.picture} 
                      alt={user?.name} 
                      className="h-10 w-10 rounded-full border-2 border-white shadow-md"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random`;
                      }}
                    />
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
        <header className="h-[calc(4rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] bg-white border-b flex items-center justify-between px-4 md:px-8 sticky top-0 z-30 shrink-0">
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
              <span className="text-slate-900">{activeBusiness ? activeBusiness.name : 'FinFlow'}</span>
            </div>
          </div>
          
          <div className="flex-1 md:hidden text-center font-bold text-xl">
            {activeBusiness ? activeBusiness.name : 'FinFlow'}
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
                 <img 
                   src={user?.picture} 
                   alt={user?.name} 
                   className="h-8 w-8 rounded-full border shadow-sm hover:ring-2 hover:ring-primary/20 transition-all" 
                   onError={(e) => {
                     (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random`;
                   }}
                 />
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

      {/* Create Workspace Modal */}
      <Modal 
        isOpen={isCreateBusinessModalOpen} 
        onClose={() => setIsCreateBusinessModalOpen(false)} 
        title="Create Workspace"
      >
        <form onSubmit={handleCreateBusiness} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Workspace Name</label>
            <Input 
              placeholder="e.g. My Side Hustle" 
              value={newBusinessName}
              onChange={(e) => setNewBusinessName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsCreateBusinessModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!newBusinessName.trim() || isLoading}>
              {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Create & Switch'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
