import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { Id } from '../../api/types';
import { useSelectedYear, useSignedInPartner } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { useReference } from '../../reference/useReference';
import { HoursTable } from './HoursTable';
import { toHourRows } from './hoursLogic';
import { usePartnersHourEntries } from './queries';

const NO_PARTNERS: readonly { id: Id; name: string }[] = [];

/**
 * Hours totals (UC-019): every entry of the year in one flat table (Date | Partner | Comment |
 * Hours) with a total row. A partner filter (kept in the URL as `?partner=`) narrows the rows, so
 * the total row is that partner's year hours. Own rows are edited inline; others are read-only.
 */
export function HoursTotalsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const year = useSelectedYear();
  const me = useSignedInPartner();
  const reference = useReference();
  const [params, setParams] = useSearchParams();
  const filterId = useId();
  const [savedOtherYear, setSavedOtherYear] = useState<number | null>(null);

  const partners = useMemo(
    () =>
      [...(reference.data?.partners ?? NO_PARTNERS)].sort((a, b) =>
        a.name.localeCompare(b.name, lang === 'fi' ? 'fi-FI' : 'en-GB'),
      ),
    [reference.data, lang],
  );
  // Unknown ids in the URL count as "all".
  const selected = partners.find((p) => p.id === params.get('partner')) ?? null;
  const shown = useMemo(() => (selected ? [selected] : partners), [selected, partners]);
  const entries = usePartnersHourEntries(
    year,
    useMemo(() => shown.map((p) => p.id), [shown]),
  );
  const rows = useMemo(
    () =>
      entries.data?.flatMap(({ partnerId, entries: list }) =>
        toHourRows(list, shown.find((p) => p.id === partnerId)?.name ?? ''),
      ) ?? [],
    [entries.data, shown],
  );

  const setPartner = (id: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('partner', id);
        else next.delete('partner');
        return next;
      },
      { replace: true },
    );

  if (reference.isError) {
    return (
      <div className="notice notice-error" role="alert">
        <p>{apiErrorMessage(t, reference.error)}</p>
        <Button size="sm" onClick={() => void reference.refetch()}>
          {t('app.retry')}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="hours-filters">
        <div className="hours-filter">
          <label htmlFor={filterId}>{t('hours.partner')}</label>
          <select
            id={filterId}
            value={selected?.id ?? ''}
            disabled={!reference.data}
            onChange={(e) => setPartner(e.target.value)}
          >
            <option value="">{t('hours.allPartners')}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {shown.some((p) => p.id !== me.id) && <p className="meta hours-read-only">{t('hours.readOnly')}</p>}
      </div>

      {savedOtherYear !== null && (
        <p className="notice" role="status">
          {t('hours.savedOtherYear', { year: savedOtherYear })}
        </p>
      )}

      {(reference.isPending || (entries.isPending && !entries.error)) && (
        <p className="muted">{t('app.loading')}</p>
      )}
      {Boolean(entries.error) && (
        <div className="notice notice-error" role="alert">
          <p>{apiErrorMessage(t, entries.error)}</p>
          <Button size="sm" onClick={entries.refetch}>
            {t('app.retry')}
          </Button>
        </div>
      )}
      {reference.data && entries.data && (
        <HoursTable
          rows={rows}
          caption={t('hours.tableAll', { year })}
          showPartner
          ownPartnerId={me.id}
          empty={
            <p className="muted">
              {selected
                ? t('hours.emptyPartner', { partner: selected.name, year })
                : t('hours.empty', { year })}
            </p>
          }
          onSaved={(entry) => {
            const entryYear = Number(entry.date.slice(0, 4));
            if (entryYear !== year) setSavedOtherYear(entryYear);
          }}
        />
      )}
    </>
  );
}
