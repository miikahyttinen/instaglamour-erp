import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
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

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<SignInPage />} />
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
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </QueryClientProvider>
  );
}
