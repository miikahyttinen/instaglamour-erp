import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { SignInPage } from './auth/SignInPage';
import { GigsRoutes } from './gigs/GigsRoutes';
import { PeopleRoutes } from './features/people/PeopleRoutes';
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
        <Route path="people/*" element={<PeopleRoutes />} />
        <Route path="tasks/*" element={<PlaceholderPage page="tasks" />} />
        <Route path="hours/*" element={<PlaceholderPage page="hours" />} />
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
