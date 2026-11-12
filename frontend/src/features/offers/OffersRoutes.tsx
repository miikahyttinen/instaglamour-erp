import { Navigate, Route, Routes } from 'react-router-dom';
import { NewOfferPage } from './NewOfferPage';
import { OfferListPage } from './OfferListPage';
import { OfferPage } from './OfferPage';

/**
 * /offers, /offers/new, /offers/:id (UC-028, UC-029, UC-031). The old /offers/references URL
 * redirects to the settings tab /settings/references (BR-108).
 */
export function OffersRoutes() {
  return (
    <Routes>
      <Route index element={<OfferListPage />} />
      <Route path="new" element={<NewOfferPage />} />
      <Route path="references" element={<Navigate to="/settings/references" replace />} />
      <Route path=":id" element={<OfferPage />} />
    </Routes>
  );
}
