import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { AppLayout } from './layouts/AppLayout';
import { AlertCircle } from 'lucide-react';

// Google Client ID from environment variables
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

import LoginPage from './pages/LoginView';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import DashboardPage from './pages/DashboardView';
import ExpensesPage from './pages/ExpensesView';
import InvoicesPage from './pages/InvoicesView';
import InvoiceFormPage from './pages/InvoiceFormPage';
import ClientsPage from './pages/ClientsView';
import BookingAgentsPage from './pages/BookingAgentsView';
import TaxesPage from './pages/TaxesView';
import VatReportPage from './pages/VatReportView';
import ProfilePage from './pages/ProfileView';

// Loading fallback
const Loading = () => (
  <div className="h-screen w-full flex items-center justify-center bg-slate-50">
    <div className="flex flex-col items-center gap-4">
      <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-500 font-medium animate-pulse text-sm uppercase tracking-widest">tbiz Loading...</p>
    </div>
  </div>
);

// Protected Route Wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isInitialized, businessSettings } = useFinance();
  const location = useLocation();

  if (authLoading) return <Loading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (!isInitialized) return <Loading />;

  // Enforce onboarding for first-time users
  if (!businessSettings.name && location.pathname !== '/profile') {
    return <Navigate to="/profile" replace />;
  }

  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Pages */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />

      {/* Protected Application Routes */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/new" element={<InvoiceFormPage />} />
        <Route path="invoices/:id/edit" element={<InvoiceFormPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="booking-agents" element={<BookingAgentsPage />} />
        <Route path="taxes" element={<TaxesPage />} />
        <Route path="vat" element={<VatReportPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { Component, type ReactNode } from 'react';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-600 bg-red-50 border border-red-200 rounded-lg m-4">
          <h2 className="text-xl font-bold">Application Error</h2>
          <p className="mt-2 text-sm font-mono">{this.state.error?.message}</p>
          <button 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md text-sm font-bold"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const isConfigured = GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith("YOUR_");

  if (!isConfigured) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl border max-w-md space-y-4">
          <div className="bg-amber-100 p-3 rounded-full w-fit mx-auto">
            <AlertCircle className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Config Required</h2>
          <p className="text-slate-600 text-sm">Please set your Google Client ID in App.tsx.</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <AuthProvider>
          <FinanceProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </FinanceProvider>
        </AuthProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
