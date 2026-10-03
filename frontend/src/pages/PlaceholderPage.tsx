import { useTranslation } from 'react-i18next';
import { useSelectedYear } from '../auth/SignedInContext';

type PageKey = 'year' | 'gigs' | 'people' | 'tasks' | 'hours' | 'budget';

/** Placeholder until the feature tasks (TASK-102, TASK-103) build the real page. */
export function PlaceholderPage({ page }: { page: PageKey }) {
  const { t } = useTranslation();
  const year = useSelectedYear();
  return (
    <section className="page">
      <h1>{t(`pages.${page}`, { year })}</h1>
      <p className="muted">{t('pages.comingSoon')}</p>
    </section>
  );
}
