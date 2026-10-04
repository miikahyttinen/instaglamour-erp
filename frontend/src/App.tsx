import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { LucideProvider } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { SignInPage } from './auth/SignInPage';
import { BudgetPage } from './features/budget/BudgetPage';
import { GigsRoutes } from './features/gigs/GigsRoutes';
import { HoursRoutes } from './features/hours/HoursRoutes';
import { PeopleRoutes } from './features/people/PeopleRoutes';
import { TasksPage } from './features/tasks/TasksPage';
import { YearPage } from './features/year/YearPage';
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
        {/* Same order as the navigation (layout/navItems.ts). */}
        <Route index element={<YearPage />} />
        <Route path="gigs/*" element={<GigsRoutes />} />
        <Route path="people/*" element={<PeopleRoutes />} />
        <Route path="tasks/*" element={<TasksPage />} />
        <Route path="hours/*" element={<HoursRoutes />} />
        <Route path="budget/*" element={<BudgetPage />} />
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
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </LucideProvider>
    </QueryClientProvider>
  );
}
