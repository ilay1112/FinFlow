import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import {
  CreditCard,
  LayoutDashboard,
  Receipt,
  FileText,
  Calculator,
  ShieldCheck,
  Globe,
  Cloud,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { Navigate, Link } from 'react-router-dom';
import { cn } from '../utils/utils';
import { SEO } from '../components/SEO';

export default function LoginView() {
  const { t, i18n } = useTranslation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const isRtl = i18n.language === 'he';

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const features = [
    {
      title: t('common.dashboard'),
      description: t('login.feature_dashboard_desc'),
      icon: LayoutDashboard,
      color: 'text-blue-600',
      bg: 'bg-blue-100'
    },
    {
      title: t('common.expenses'),
      description: t('login.feature_expenses_desc'),
      icon: Receipt,
      color: 'text-amber-600',
      bg: 'bg-amber-100'
    },
    {
      title: t('common.invoices'),
      description: t('login.feature_invoices_desc'),
      icon: FileText,
      color: 'text-indigo-600',
      bg: 'bg-indigo-100'
    },
    {
      title: t('common.taxes'),
      description: t('login.feature_taxes_desc'),
      icon: Calculator,
      color: 'text-green-600',
      bg: 'bg-green-100'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
      <SEO />
      {/* Header */}
      <header className="h-16 bg-white border-b flex items-center justify-between px-6 md:px-12 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-primary rounded-lg p-1.5">
            <CreditCard className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">FinFlow</span>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* Hero Section */}
        <section className="bg-white border-b overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8 text-center lg:text-start">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-100 text-xs font-bold uppercase tracking-wider">
                <Zap className="h-3 w-3" /> {t('login.free_forever')}
              </div>
              <h1 className="text-4xl md:text-6xl font-black text-slate-900 leading-[1.1]">
                <span className="block text-sm md:text-base text-primary font-bold tracking-widest uppercase mb-4">
                  {isRtl ? 'ניהול הוצאות לעסקים קטנים בישראל' : 'Business Expense Management Israel'}
                </span>
                {t('login.hero_title')}
              </h1>
              <h2 className="text-lg md:text-xl text-slate-600 max-w-xl mx-auto lg:mx-0 font-medium">
                {t('login.hero_subtitle')}
              </h2>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                <Button 
                  size="lg" 
                  className="h-14 px-8 text-lg font-bold gap-3 w-full sm:w-auto shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                  onClick={login}
                  disabled={isLoading}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"
                    />
                  </svg>
                  {t('login.get_started')}
                </Button>
                <p className="text-sm text-slate-400 font-medium">{t('login.no_credit_card')}</p>
              </div>

              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 pt-4 grayscale opacity-50">
                <div className="flex items-center gap-2 font-bold text-slate-500">
                  <ShieldCheck className="h-5 w-5" /> {t('login.secure')}
                </div>
                <div className="flex items-center gap-2 font-bold text-slate-500">
                  <Globe className="h-5 w-5" /> {t('login.bilingual')}
                </div>
                <div className="flex items-center gap-2 font-bold text-slate-500">
                  <Cloud className="h-5 w-5" /> {t('login.drive_sync')}
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 bg-primary/10 rounded-[2rem] blur-2xl -z-10 animate-pulse"></div>
              <div className="bg-slate-900 rounded-[2rem] p-4 shadow-2xl border-4 border-slate-800 transform rotate-2 hover:rotate-0 transition-transform duration-500 overflow-hidden group">
                <div className="bg-white rounded-xl overflow-hidden h-[400px] md:h-[500px] flex flex-col">
                   <div className="h-12 bg-slate-100 flex items-center px-4 gap-2 border-b">
                     <div className="w-3 h-3 rounded-full bg-red-400"></div>
                     <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                     <div className="w-3 h-3 rounded-full bg-green-400"></div>
                     <div className="ml-4 h-6 w-48 bg-white rounded border flex items-center px-2 text-[10px] text-slate-300">finflow.app/dashboard</div>
                   </div>
                   <div className="p-6 space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="h-24 rounded-lg bg-slate-50 border p-4 space-y-2">
                           <div className="h-3 w-1/2 bg-slate-200 rounded"></div>
                           <div className="h-6 w-3/4 bg-primary/20 rounded"></div>
                        </div>
                        <div className="h-24 rounded-lg bg-slate-50 border p-4 space-y-2">
                           <div className="h-3 w-1/2 bg-slate-200 rounded"></div>
                           <div className="h-6 w-3/4 bg-amber-200 rounded"></div>
                        </div>
                      </div>
                      <div className="h-48 rounded-lg bg-slate-50 border flex flex-col p-4 gap-4">
                        <div className="h-4 w-1/3 bg-slate-200 rounded"></div>
                        <div className="flex-1 flex items-end gap-2">
                           <div className="flex-1 h-3/4 bg-primary/30 rounded-t"></div>
                           <div className="flex-1 h-1/2 bg-primary/30 rounded-t"></div>
                           <div className="flex-1 h-full bg-primary/40 rounded-t"></div>
                           <div className="flex-1 h-2/3 bg-primary/30 rounded-t"></div>
                        </div>
                      </div>
                   </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                   <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white hover:text-slate-900" onClick={login}>
                     {t('login.see_demo')} <ArrowRight className="ms-2 h-4 w-4" />
                   </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">{t('login.features_title')}</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">{t('login.features_subtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, i) => (
              <Card key={i} className="hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-8 space-y-4 text-center lg:text-start">
                  <div className={cn("inline-flex p-3 rounded-2xl", feature.bg)}>
                    <feature.icon className={cn("h-6 w-6", feature.color)} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{feature.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Drive Explanation Section */}
        <section className="bg-slate-900 text-white py-20 overflow-hidden relative">
          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px]"></div>
          <div className="max-w-4xl mx-auto px-6 text-center relative z-10 space-y-8">
            <div className="inline-flex p-4 rounded-full bg-white/10 backdrop-blur-md mb-4 border border-white/20 shadow-2xl">
              <svg viewBox="0 0 24 24" className="h-10 w-10">
                <path fill="#4285F4" d="M15.43,11.01l4.38,7.59c0.11,0.2,0.11,0.44,0,0.64l-2.12,7.59c-0.11,0.2-0.33,0.32-0.55,0.32H4.86c-0.22,0-0.44-0.12-0.55-0.32l-2.12-7.59c-0.11-0.2-0.11-0.44,0-0.64l4.38-7.59c0.11-0.2,0.33-0.32,0.55-0.32h8.76C15.1,10.69,15.31,10.81,15.43,11.01z" transform="scale(0.85) translate(2,2)"/>
                <path fill="#000000" d="M12,2L4.5,15.8h15L12,2z" opacity="0.1"/>
                <path fill="#34A853" d="M12,1.33l7.5,13h-15L12,1.33z" transform="scale(0.6) translate(4,10)"/>
                <path fill="#FBBC04" d="M12,1.33l7.5,13h-15L12,1.33z" transform="rotate(120,12,12) scale(0.6) translate(4,10)"/>
                <path fill="#EA4335" d="M12,1.33l7.5,13h-15L12,1.33z" transform="rotate(240,12,12) scale(0.6) translate(4,10)"/>
              </svg>
            </div>
            <h2 className="text-3xl md:text-5xl font-black">{t('login.drive_title')}</h2>
            <p className="text-lg md:text-xl text-slate-400">
              {t('login.drive_desc')}
            </p>
            <Button size="lg" className="h-14 px-10 text-lg font-bold bg-white text-slate-900 hover:bg-slate-100" onClick={login}>
              {t('login.connect_now')}
            </Button>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-white border-t py-12 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="bg-primary rounded-lg p-1">
                <CreditCard className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-slate-900">FinFlow</span>
              <span className="text-slate-400 text-sm ml-2">{t('login.footer_rights')}</span>
            </div>
            <div className="flex gap-8 text-sm font-bold text-slate-500">
              <Link to="/privacy" className="hover:text-primary transition-colors">{t('login.privacy')}</Link>
              <Link to="/terms" className="hover:text-primary transition-colors">{t('login.terms')}</Link>
              <a 
                href="https://github.com/ilay1112/FinFlow" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-primary flex items-center gap-1.5 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.082.824-.26.824-.578 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                </svg>
                {t('login.github')}
              </a>
            </div>
            <div className="text-slate-400 text-xs text-center md:text-start">
              {t('login.built_with')}
            </div>
          </div>
        </footer>
      </main>

    </div>
  );
}
