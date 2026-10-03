import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { SignInPage } from './auth/SignInPage';
import { TasksPage } from './features/tasks/TasksPage';
import { HoursRoutes } from './features/hours/HoursRoutes';
import { GigsRoutes } from './gigs/GigsRoutes';
import { AppShell } from './layout/AppShell';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

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
        <Route index element={<PlaceholderPage page="year" />} />
        <Route path="gigs/*" element={<GigsRoutes />} />
        <Route path="people/*" element={<PlaceholderPage page="people" />} />
        <Route path="tasks/*" element={<TasksPage />} />
        <Route path="hours/*" element={<HoursRoutes />} />
        <Route path="budget/*" element={<PlaceholderPage page="budget" />} />
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
