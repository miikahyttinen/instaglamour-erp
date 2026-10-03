import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useSelectedYear } from '../../auth/SignedInContext';
import { HoursTotalsPage } from './HoursTotalsPage';
import { MyHoursPage } from './MyHoursPage';
import './hours.css';

function HoursLayout() {
  const { t } = useTranslation();
  const year = useSelectedYear();
  return (
    <section className="page hours-page">
      <h1>{t('pages.hours', { year })}</h1>
      <nav className="hours-tabs" aria-label={t('hours.tabs.label')}>
        <NavLink to="/hours" end>
          {t('hours.tabs.mine')}
        </NavLink>
        <NavLink to="/hours/totals">{t('hours.tabs.totals')}</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}

/** /hours (my hours, UC-018) and /hours/totals (everyone's totals, UC-019). */
export function HoursRoutes() {
  return (
    <Routes>
      <Route element={<HoursLayout />}>
        <Route index element={<MyHoursPage />} />
        <Route path="totals" element={<HoursTotalsPage />} />
      </Route>
    </Routes>
  );
}
