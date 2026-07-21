import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  Receipt, 
  FileText, 
  Users, 
  Calculator,
  Percent,
  Menu,
  CreditCard,
  LogOut,
  Cloud,
  CloudOff,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  Plus,
  Briefcase
} from 'lucide-react';
import { cn } from '../utils/utils';
import { Button } from '../components/ui/Button';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAuth } from '../context/AuthContext';
import { useFinance } from '../context/FinanceContext';
import { useGuardedNavigate } from '../context/NavigationGuardContext';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { FloatingActionButton } from '../components/FloatingActionButton';
import { SessionExpiredModal } from '../components/SessionExpiredModal';

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const { user, logout, login, isAuthenticated } = useAuth();
  const { isLoading, isSyncing, syncError, hasUnsyncedChanges, sessionExpired, businesses, activeBusiness, switchBusiness, createBusiness, businessSettings } = useFinance();
  const navigate = useNavigate();
  // FF-WEB-11 — routes every exit reachable from the shell (sidebar links, the
  // business switcher, Sign Out) through whatever unsaved-changes guard a dirty
  // page (currently only InvoiceFormPage) has registered; a no-op when none has.
  const guardedNavigate = useGuardedNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBusinessDropdownOpen, setIsBusinessDropdownOpen] = useState(false);
  const [isCreateBusinessModalOpen, setIsCreateBusinessModalOpen] = useState(false);
  const [newBusinessName, setNewBusinessName] = useState('');
  const businessDropdownRef = useRef<HTMLDivElement>(null);
  // The session-expired prompt must not nag: a dismissal holds for the whole expiry
  // episode, and only a NEW episode (sessionExpired edge) clears it. Openness is
  // derived, so a successful re-login (sessionExpired → false) closes the modal with
  // no extra wiring, and a session already expired at mount (failed restore on app
  // open) prompts immediately.
  const [sessionModalDismissed, setSessionModalDismissed] = useState(false);
  const [prevSessionExpired, setPrevSessionExpired] = useState(sessionExpired);
  if (prevSessionExpired !== sessionExpired) {
    setPrevSessionExpired(sessionExpired);
    setSessionModalDismissed(false);
  }
  const isSessionModalOpen = isAuthenticated && sessionExpired && !sessionModalDismissed;

  const isRtl = i18n.language === 'he';

  // Single derived sync status for the status pill, in priority order:
  // reconnect (session expired) > syncing > unsynced (save pending) > error > synced.
  type SyncStatus = 'reconnect' | 'syncing' | 'unsynced' | 'error' | 'synced';
  const syncStatus: SyncStatus =
    sessionExpired ? 'reconnect'
    : isSyncing ? 'syncing'
    : hasUnsyncedChanges ? 'unsynced'
    : syncError ? 'error'
    : 'synced';
  const isProblem = syncStatus === 'reconnect' || syncStatus === 'error' || syncStatus === 'unsynced';
  const syncLabel =
    syncStatus === 'reconnect' ? t('common.sync_reconnect')
    : syncStatus === 'syncing' ? t('common.sync_syncing')
    : syncStatus === 'unsynced' ? t('common.sync_unsynced')
    : syncStatus === 'error' ? t('common.sync_offline')
    : t('common.sync_synced');

  const handleLogout = () => {
    guardedNavigate(async () => {
      await logout();
      navigate('/login');
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (businessDropdownRef.current && !businessDropdownRef.current.contains(event.target as Node)) {
        setIsBusinessDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Prevent background scrolling when sidebar is open on mobile
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isSidebarOpen]);

  // Unsaved-changes guard (FF-WEB-11): the only "data" this modal can lose is a
  // typed-but-unsubmitted workspace name.
  const isCreateBusinessFormDirty = newBusinessName.trim().length > 0;

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
    { name: t('common.invoices_receipts') || t('common.invoices'), href: '/invoices', icon: FileText },
    { name: t('common.clients'), href: '/clients', icon: Users },
    { name: t('common.booking_agents') || 'Booking Agents', href: '/booking-agents', icon: Briefcase },
    { name: t('common.taxes'), href: '/taxes', icon: Calculator },
    // VAT reporting only applies to a VAT-registered business; an Osek Patur files
    // no Doch Maam, so the nav item is hidden for them.
    ...(businessSettings.type !== 'EsekPatur'
      ? [{ name: t('common.vat'), href: '/vat', icon: Percent }]
      : []),
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
                  <span className="text-xs text-slate-500 uppercase font-bold tracking-wider leading-none mb-1">{t('common.workspace')}</span>
                  <span className="text-sm font-bold text-slate-900 tracking-tight truncate leading-none">
                    {activeBusiness ? activeBusiness.name : 'tbiz'}
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
                        setIsBusinessDropdownOpen(false);
                        // Switching workspace mid-edit would pull the rug out from
                        // under whatever record a dirty form is editing — guard it
                        // the same as a route change.
                        guardedNavigate(() => switchBusiness(business.id));
                      }}
                    >
                      {business.name}
                    </button>
                  ))}
                </div>
                <div className="p-1 border-t bg-slate-50 space-y-1">
                  <NavLink
                    to="/profile"
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsBusinessDropdownOpen(false);
                      setIsSidebarOpen(false);
                      guardedNavigate(() => navigate('/profile'));
                    }}
                  >
                    <div className="bg-white rounded p-1 shadow-sm border border-slate-200">
                      <Users className="h-3 w-3 text-slate-600" />
                    </div>
                    {t('common.profile') || 'Business Profile'}
                  </NavLink>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
                    onClick={() => {
                      setIsCreateBusinessModalOpen(true);
                      setIsBusinessDropdownOpen(false);
                    }}
                  >
                    <div className="bg-white rounded p-1 shadow-sm border border-slate-200">
                      <Plus className="h-3 w-3 text-slate-600" />
                    </div>
                    {t('common.create_workspace')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  setIsSidebarOpen(false);
                  guardedNavigate(() => navigate(item.href));
                }}
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
            {/* Desktop View */}
            <div className="hidden md:flex flex-col gap-3">
              <div className="px-2">
                <LanguageSwitcher />
              </div>

              {isAuthenticated && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={syncStatus === 'reconnect' ? login : undefined}
                    disabled={syncStatus !== 'reconnect'}
                    title={syncStatus === 'reconnect' ? t('common.sync_reconnect_hint') : undefined}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm text-xs font-bold uppercase tracking-wider transition-all text-left",
                      syncStatus === 'reconnect' ? "bg-amber-50 border-amber-200 cursor-pointer hover:bg-amber-100" :
                      syncStatus === 'syncing' ? "bg-indigo-50 border-indigo-200 cursor-default" :
                      syncStatus === 'unsynced' ? "bg-amber-50 border-amber-200 cursor-default" :
                      syncStatus === 'error' ? "bg-red-50 border-red-200 cursor-default" :
                      "bg-white border-slate-200 cursor-default"
                    )}
                  >
                    {syncStatus === 'syncing' ? (
                      <RefreshCw className="h-4 w-4 text-indigo-500 animate-spin" />
                    ) : syncStatus === 'reconnect' || syncStatus === 'unsynced' ? (
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    ) : syncStatus === 'error' ? (
                      <CloudOff className="h-4 w-4 text-red-500" />
                    ) : (
                      <Cloud className="h-4 w-4 text-green-500" />
                    )}
                    <span className={cn(
                      "flex-1 truncate",
                      syncStatus === 'syncing' ? "text-indigo-700" :
                      syncStatus === 'reconnect' || syncStatus === 'unsynced' ? "text-amber-700" :
                      syncStatus === 'error' ? "text-red-700" : "text-slate-700"
                    )}>
                      {syncLabel}
                    </span>
                  </button>

                  <div className="flex flex-col gap-3 px-1">
                    <div className="flex items-center gap-3">
                      <img 
                        src={user?.picture} 
                        alt={user?.name || "User Avatar"}
                        width="40"
                        height="40"
                        loading="lazy"
                        className="h-10 w-10 rounded-full border-2 border-slate-200 shadow-sm"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random`;
                        }}
                      />
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-bold text-slate-900 truncate block">
                          {user?.name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                      </div>
                    </div>
                    
                    <Button 
                      variant="outline"
                      onClick={handleLogout}
                      className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 font-bold justify-center mt-2"
                    >
                      <LogOut className="h-4 w-4 mr-2" /> Sign Out
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile View */}
            <div className="md:hidden flex flex-col gap-4">
              <div className="flex items-center justify-between px-2">
                <LanguageSwitcher mini />
                
                <button
                  type="button"
                  onClick={syncStatus === 'reconnect' ? login : undefined}
                  disabled={syncStatus !== 'reconnect'}
                  aria-label={syncLabel}
                  title={syncStatus === 'reconnect' ? t('common.sync_reconnect_hint') : syncLabel}
                  className={cn(
                    "flex items-center justify-center h-9 w-9 rounded-xl border shadow-sm transition-all",
                    syncStatus === 'syncing' ? "bg-indigo-50 border-indigo-200" :
                    syncStatus === 'reconnect' || syncStatus === 'unsynced' ? "bg-amber-50 border-amber-200" :
                    syncStatus === 'error' ? "bg-red-50 border-red-200" :
                    "bg-white border-slate-200"
                  )}
                >
                  {syncStatus === 'syncing' ? (
                    <RefreshCw className="h-4 w-4 text-indigo-500 animate-spin" />
                  ) : syncStatus === 'reconnect' || syncStatus === 'unsynced' ? (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  ) : syncStatus === 'error' ? (
                    <CloudOff className="h-4 w-4 text-red-500" />
                  ) : (
                    <Cloud className="h-4 w-4 text-green-500" />
                  )}
                </button>

                {isAuthenticated && (
                  <img 
                    src={user?.picture} 
                    alt={user?.name || "User Avatar"} 
                    width="36"
                    height="36"
                    loading="lazy"
                    className="h-9 w-9 rounded-full border-2 border-slate-200 shadow-sm"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random`;
                    }}
                  />
                )}
              </div>
              
              {isAuthenticated && (
                <Button 
                  variant="outline"
                  onClick={handleLogout}
                  className="w-full text-red-600 border-red-200 h-10 font-bold text-xs"
                >
                  <LogOut className="h-3.5 w-3.5 mr-2" /> Sign Out
                </Button>
              )}
            </div>
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
              <span>{t('common.workspace')}</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-900">{activeBusiness ? activeBusiness.name : 'tbiz'}</span>
            </div>
          </div>
          
          <div className="flex-1 md:hidden text-center font-bold text-xl">
            {activeBusiness ? activeBusiness.name : 'tbiz'}
          </div>

          <div className="flex items-center gap-4">
            {isProblem && (
              syncStatus === 'reconnect' ? (
                <button
                  type="button"
                  onClick={login}
                  title={t('common.sync_reconnect_hint')}
                  className="hidden md:flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200 hover:bg-amber-100 transition-colors"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  {syncLabel}
                </button>
              ) : (
                <div className={cn(
                  "hidden md:flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border",
                  syncStatus === 'unsynced' ? "text-amber-700 bg-amber-50 border-amber-200" : "text-red-600 bg-red-50 border-red-100"
                )}>
                  <AlertCircle className="h-3.5 w-3.5" />
                  {syncStatus === 'error' && syncError ? syncError : syncLabel}
                </div>
              )
            )}
            </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50/50">
          <div className="max-w-7xl mx-auto p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>

      <FloatingActionButton isSidebarOpen={isSidebarOpen} onCloseSidebar={() => setIsSidebarOpen(false)} />

      {/* Session-expired sign-in prompt. The Google popup demands a direct user
          gesture (popup blockers), so login() can't be auto-launched — this modal puts
          the gesture one click away the moment silent renewal fails. The amber header
          pill remains as the fallback entry point after a dismissal. */}
      <SessionExpiredModal
        isOpen={isSessionModalOpen}
        onClose={() => setSessionModalDismissed(true)}
        onSignIn={login}
        hasUnsyncedChanges={hasUnsyncedChanges}
      />

      {/* Create Workspace Modal */}
      <Modal
        isOpen={isCreateBusinessModalOpen}
        onClose={() => setIsCreateBusinessModalOpen(false)}
        confirmClose={isCreateBusinessFormDirty}
        title={t('common.create_workspace')}
      >
        {({ requestClose }) => (
        <form onSubmit={handleCreateBusiness} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('common.workspace_name')}</label>
            <Input
              placeholder={t('common.workspace_placeholder')}
              value={newBusinessName}
              onChange={(e) => setNewBusinessName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={requestClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!newBusinessName.trim() || isLoading}>
              {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('common.create_and_switch')}
            </Button>
          </div>
        </form>
        )}
      </Modal>
    </div>
  );
}
