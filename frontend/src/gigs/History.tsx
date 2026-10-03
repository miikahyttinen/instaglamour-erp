import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Id, Person } from '../api/types';
import { apiErrorMessage } from '../i18n/labels';
import { useLang } from '../i18n/useLang';
import { formatDateTime } from '../lib/format';
import { useReference } from '../reference/useReference';
import { describeEvent, HISTORY_FILTERS, matchesFilter, type HistoryFilter } from './historyText';
import { useGigHistory } from './queries';

/** Read-only change log, newest first, with a type filter (UC-013). */
export function History({ gigId, people }: { gigId: Id; people: Person[] | undefined }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: reference } = useReference();
  const history = useGigHistory(gigId);
  const [filter, setFilter] = useState<HistoryFilter>('all');

  if (history.isPending) return <p role="status">{t('app.loading')}</p>;
  if (history.isError) {
    return (
      <p className="notice notice-error" role="alert">
        {apiErrorMessage(t, history.error)}
      </p>
    );
  }
  const events = history.data.filter((e) => matchesFilter(e, filter));
  const ctx = { partners: reference?.partners, people };

  return (
    <div className="history">
      <div className="field history-filter">
        <label htmlFor={`history-filter-${gigId}`}>{t('history.filter')}</label>
        <select
          id={`history-filter-${gigId}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value as HistoryFilter)}
        >
          {HISTORY_FILTERS.map((f) => (
            <option key={f} value={f}>
              {t(`history.filters.${f}`)}
            </option>
          ))}
        </select>
      </div>
      {events.length === 0 ? (
        <p className="muted">{t('history.empty')}</p>
      ) : (
        <ol className="history-list" aria-label={t('gig.sections.history')}>
          {events.map((event) => {
            const { title, lines } = describeEvent(t, lang, event, ctx);
            const partner = reference?.partners.find((p) => p.id === event.partnerId)?.name ?? '–';
            return (
              <li key={event.id} className="history-item">
                <div className="history-title">
                  <strong>{title}</strong>
                  <span className="muted small">
                    {formatDateTime(event.at, lang)} · {partner}
                  </span>
                </div>
                {lines.map((line, i) => (
                  <p key={i} className="history-line">
                    {line}
                  </p>
                ))}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
