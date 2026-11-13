import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { LucideProvider } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { SignInPage } from './auth/SignInPage';
import { BudgetPage } from './features/budget/BudgetPage';
import { ClientsRoutes } from './features/clients/ClientsRoutes';
import { EventsRoutes } from './features/events/EventsRoutes';
import { LegacyEventsRedirect } from './features/events/LegacyEventsRedirect';
import { FreelancerPage } from './features/freelancer/FreelancerPage';
import { HoursRoutes } from './features/hours/HoursRoutes';
import { InvoicingPage } from './features/invoicing/InvoicingPage';
import { OffersRoutes } from './features/offers/OffersRoutes';
import { PublicOfferPage } from './features/offers/PublicOfferPage';
import { PeopleRoutes } from './features/people/PeopleRoutes';
import { PurchaseOrdersRoutes } from './features/purchaseOrders/PurchaseOrdersRoutes';
import { SettingsRoutes } from './features/settings/SettingsRoutes';
import { TasksPage } from './features/tasks/TasksPage';
import { MyEventsPage } from './features/myEvents/MyEventsPage';
import { AppShell } from './layout/AppShell';
import { NotFoundPage } from './pages/NotFoundPage';

// Component reference for the screen restyles. Dev server only: the import is dropped from
// production builds, and the page is not in the navigation.
const StyleguidePage = import.meta.env.DEV
  ? lazy(() => import('./styleguide/StyleguidePage'))
  : null;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<SignInPage />} />
      {StyleguidePage && (
        <Route
          path="/styleguide"
          element={
            <Suspense fallback={null}>
              <StyleguidePage />
            </Suspense>
          }
        />
      )}
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        {/* Start page: My gigs. The Year page was replaced by it (2026-11-08); old `/year` links
            land there too. */}
        <Route index element={<Navigate to="/my-gigs" replace />} />
        <Route path="year/*" element={<Navigate to="/my-gigs" replace />} />
        {/* Same order as the navigation (layout/navItems.ts). */}
        <Route path="my-gigs" element={<MyEventsPage />} />
        <Route path="offers/*" element={<OffersRoutes />} />
        <Route path="gigs/*" element={<EventsRoutes />} />
        <Route path="events/*" element={<LegacyEventsRedirect />} />
        <Route path="invoicing" element={<InvoicingPage />} />
        <Route path="purchase-orders/*" element={<PurchaseOrdersRoutes />} />
        <Route path="clients/*" element={<ClientsRoutes />} />
        <Route path="people/*" element={<PeopleRoutes />} />
        <Route path="tasks/*" element={<TasksPage />} />
        <Route path="hours/*" element={<HoursRoutes />} />
        <Route path="budget/*" element={<BudgetPage />} />
        <Route path="settings/*" element={<SettingsRoutes />} />
        {/* Old data import URL (before the settings page). */}
        <Route path="import" element={<Navigate to="/settings/import" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

/** Providers + routes. The router is supplied by the caller (BrowserRouter / MemoryRouter). */
export function App({ queryClient }: { queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Icons: thin line, 16 px, stroke 1.5 (docs/design.md). Pass `size` to override. */}
      <LucideProvider size={16} strokeWidth={1.5}>
        <Routes>
          {/* Public offer link (UC-030): outside the auth provider and the shell, so it never
              calls an authenticated endpoint (not even /api/me). */}
          <Route path="/o/:token" element={<PublicOfferPage />} />
          {/* Freelancer link (UC-033): same rules, no auth provider and no shell. */}
          <Route path="/f/:token" element={<FreelancerPage />} />
          <Route
            path="*"
            element={
              <AuthProvider>
                <AppRoutes />
              </AuthProvider>
            }
          />
        </Routes>
      </LucideProvider>
    </QueryClientProvider>
  );
}
