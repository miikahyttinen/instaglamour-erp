import { Route, Routes } from 'react-router-dom';
import { NewOfferPage } from './NewOfferPage';
import { OfferListPage } from './OfferListPage';
import { OfferPage } from './OfferPage';

/** /offers, /offers/new, /offers/:id (UC-028, UC-029, UC-031). */
export function OffersRoutes() {
  return (
    <Routes>
      <Route index element={<OfferListPage />} />
      <Route path="new" element={<NewOfferPage />} />
      <Route path=":id" element={<OfferPage />} />
    </Routes>
  );
}
