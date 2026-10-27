import { Route, Routes } from 'react-router-dom';
import { EventListPage } from './EventListPage';
import { EventPage } from './EventPage';
import { NewEventPage } from './NewEventPage';

/** /events, /events/new, /events/:id */
export function EventsRoutes() {
  return (
    <Routes>
      <Route index element={<EventListPage />} />
      <Route path="new" element={<NewEventPage />} />
      <Route path=":id" element={<EventPage />} />
    </Routes>
  );
}
