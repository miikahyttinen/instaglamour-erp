import { Route, Routes } from 'react-router-dom';
import { GigListPage } from './GigListPage';
import { GigPage } from './GigPage';
import { NewGigPage } from './NewGigPage';

/** /gigs, /gigs/new, /gigs/:id */
export function GigsRoutes() {
  return (
    <Routes>
      <Route index element={<GigListPage />} />
      <Route path="new" element={<NewGigPage />} />
      <Route path=":id" element={<GigPage />} />
    </Routes>
  );
}
