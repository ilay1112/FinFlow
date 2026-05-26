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
  X
} from 'lucide-react';
import { cn } from '../utils/utils';
import { Button } from '../components/ui/Button';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function AppLayout() {
  const { t, i18n } = useTranslation();
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
    <div className="min-h-screen bg-slate-50 flex">
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
        // Position logic: LTR uses left-0, RTL uses right-0
        isRtl ? "right-0" : "left-0",
        // Visibility logic: 
        // When open: translate-x-0 (both)
        // When closed: -translate-x-full (LTR), translate-x-full (RTL)
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

          <div className="p-4 border-t bg-slate-50 flex flex-col gap-2">
            <LanguageSwitcher />
            
            <NavLink
              to="/profile"
              className="flex items-center gap-3 px-4 py-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0">
                JD
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium text-slate-900 truncate">John Doe</p>
                <p className="text-xs text-slate-500 truncate">{t('common.profile')}</p>
              </div>
            </NavLink>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b flex items-center justify-between px-4 md:px-8 sticky top-0 z-30">
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden" 
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>
          
          <div className="flex-1 md:hidden text-center font-bold text-xl">
            FinFlow
          </div>

          <div className="hidden md:flex items-center gap-4">
            <h1 className="text-sm font-medium text-slate-500">Workspace / Small Business</h1>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
