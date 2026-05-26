import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { FinanceProvider } from './context/FinanceContext';
import { AppLayout } from './layouts/AppLayout';

// Lazy load pages for code-splitting
const DashboardPage = lazy(() => import('./pages/DashboardView'));
const ExpensesPage = lazy(() => import('./pages/ExpensesView'));
const InvoicesPage = lazy(() => import('./pages/InvoicesView'));
const ClientsPage = lazy(() => import('./pages/ClientsView'));
const TaxesPage = lazy(() => import('./pages/TaxesView'));
const ProfilePage = lazy(() => import('./pages/ProfileView'));

// Loading fallback
const Loading = () => (
  <div className="h-screen w-full flex items-center justify-center bg-slate-50">
    <div className="flex flex-col items-center gap-4">
      <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-500 font-medium animate-pulse text-sm uppercase tracking-widest">FinFlow Loading...</p>
    </div>
  </div>
);

function App() {
  return (
    <FinanceProvider>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="taxes" element={<TaxesPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </FinanceProvider>
  );
}

export default App;
