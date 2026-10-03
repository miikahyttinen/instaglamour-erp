import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { SignInPage } from './auth/SignInPage';
import { TasksPage } from './features/tasks/TasksPage';
import { HoursRoutes } from './features/hours/HoursRoutes';
import { YearPage } from './features/year/YearPage';
import { GigsRoutes } from './gigs/GigsRoutes';
import { BudgetPage } from './features/budget/BudgetPage';
import { PeopleRoutes } from './features/people/PeopleRoutes';
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
        <Route index element={<YearPage />} />
        <Route path="gigs/*" element={<GigsRoutes />} />
        <Route path="tasks/*" element={<TasksPage />} />
        <Route path="hours/*" element={<HoursRoutes />} />
        <Route path="budget/*" element={<BudgetPage />} />
        <Route path="people/*" element={<PeopleRoutes />} />
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
