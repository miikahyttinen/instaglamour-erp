import { useTranslation } from 'react-i18next';
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { PageHead } from '../../components/PageHead';
import { DataImportPage } from '../dataImport/DataImportPage';
import { LineupPage } from './LineupPage';
import { LineupsPage } from './LineupsPage';
import './settings.css';

/** Page head + tabs (Lineups / Data import); they stay mounted while switching tabs. */
function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <section className="page settings-page">
      <PageHead title={t('pages.settings')} />
      <nav className="settings-tabs" aria-label={t('settings.tabs.label')}>
        <NavLink to="/settings/lineups">{t('settings.tabs.lineups')}</NavLink>
        <NavLink to="/settings/import">{t('settings.tabs.import')}</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}

/** /settings → /settings/lineups (default tab), /settings/lineups/:id, /settings/import. */
export function SettingsRoutes() {
  return (
    <Routes>
      <Route element={<SettingsLayout />}>
        <Route index element={<Navigate to="lineups" replace />} />
        <Route path="lineups" element={<LineupsPage />} />
        <Route path="lineups/:id" element={<LineupPage />} />
        <Route path="import" element={<DataImportPage />} />
        <Route path="*" element={<Navigate to="/settings/lineups" replace />} />
      </Route>
    </Routes>
  );
}
