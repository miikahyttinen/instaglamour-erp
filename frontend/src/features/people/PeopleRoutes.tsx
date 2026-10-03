import { Route, Routes } from 'react-router-dom';
import { PeoplePage } from './PeoplePage';
import { PersonPage } from './PersonPage';

/** /people, /people/:id */
export function PeopleRoutes() {
  return (
    <Routes>
      <Route index element={<PeoplePage />} />
      <Route path=":id" element={<PersonPage />} />
    </Routes>
  );
}
