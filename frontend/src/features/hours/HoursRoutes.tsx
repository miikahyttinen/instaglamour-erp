import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, Route, Routes, useMatch } from 'react-router-dom';
import { useSelectedYear } from '../../auth/SignedInContext';
import { PageHead } from '../../components/PageHead';
import { PageYearSelector } from '../../components/PageYearSelector';
import type { HoursOutletContext } from './hoursOutlet';
import { HoursTotalsPage } from './HoursTotalsPage';
import { MyHoursPage } from './MyHoursPage';
import './hours.css';

/**
 * Page head + tabs stay mounted while switching tabs (keeps focus on the tab link). A page puts
 * its action button into the head through a portal (`actionsSlot` in the outlet context). Only
 * "My hours" has an action, so the slot is rendered only there (no empty actions box on totals).
 */
function HoursLayout() {
  const { t } = useTranslation();
  const year = useSelectedYear();
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const onMyHours = useMatch('/hours') !== null;
  const context: HoursOutletContext = { actionsSlot };
  return (
    <section className="page hours-page">
      <PageHead
        title={t('pages.hours', { year })}
        actions={onMyHours ? <div ref={setActionsSlot} className="hours-head-actions" /> : undefined}
      >
        <PageYearSelector />
      </PageHead>
      <nav className="hours-tabs" aria-label={t('hours.tabs.label')}>
        <NavLink to="/hours" end>
          {t('hours.tabs.mine')}
        </NavLink>
        <NavLink to="/hours/totals">{t('hours.tabs.totals')}</NavLink>
      </nav>
      <Outlet context={context} />
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
