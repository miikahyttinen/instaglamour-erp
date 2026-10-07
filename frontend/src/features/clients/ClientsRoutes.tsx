import { Route, Routes } from 'react-router-dom';
import { ClientPage } from './ClientPage';
import { ClientsPage } from './ClientsPage';

/** /clients, /clients/:id (UC-027). */
export function ClientsRoutes() {
  return (
    <Routes>
      <Route index element={<ClientsPage />} />
      <Route path=":id" element={<ClientPage />} />
    </Routes>
  );
}
