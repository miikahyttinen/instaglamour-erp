import { Route, Routes } from 'react-router-dom';
import { EventListPage } from './EventListPage';
import { EventPage } from './EventPage';
import { NewEventPage } from './NewEventPage';

/** /gigs, /gigs/new, /gigs/:id (UI route; the API and code say `event`) */
export function EventsRoutes() {
  return (
    <Routes>
      <Route index element={<EventListPage />} />
      <Route path="new" element={<NewEventPage />} />
      <Route path=":id" element={<EventPage />} />
    </Routes>
  );
}
