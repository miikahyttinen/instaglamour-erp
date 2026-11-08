import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectedYear } from '../auth/SignedInContext';
import { useUpdateMe } from '../auth/useMe';
import { apiErrorMessage } from '../i18n/labels';
import { YearSelector } from './YearSelector';

/**
 * Page-level year selector (BR-081 revised 2026-10-30) for the year pages: Budjetti,
 * Tunnit, Keikat. Reads and writes `Me.selectedYear` (PATCH /api/me, optimistic), so the three
 * pages share the year. Render it in the page head (`<PageHead>` children, above the title).
 */
export function PageYearSelector() {
  const { t } = useTranslation();
  const year = useSelectedYear();
  const updateMe = useUpdateMe();
  const { reset, isError } = updateMe;

  useEffect(() => {
    if (!isError) return undefined;
    const timer = window.setTimeout(reset, 6000);
    return () => window.clearTimeout(timer);
  }, [isError, reset]);

  return (
    <div className="page-year">
      <YearSelector year={year} onChange={(selectedYear) => updateMe.mutate({ selectedYear })} />
      {updateMe.isError && (
        <p className="page-year-error" role="alert">
          {t('header.saveFailed')} ({apiErrorMessage(t, updateMe.error)})
        </p>
      )}
    </div>
  );
}
