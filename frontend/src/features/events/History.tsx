import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Id, Person } from '../../api/types';
import { Notice } from '../../components/Notice';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDateTime } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { useClientList } from '../clients/queries';
import { describeEntry, HISTORY_FILTERS, matchesFilter, type HistoryFilter } from './historyText';
import { useEventHistory } from './queries';

/** Read-only change log, newest first, with a type filter (UC-013). */
export function History({ eventId, people }: { eventId: Id; people: Person[] | undefined }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: reference } = useReference();
  const history = useEventHistory(eventId);
  const { data: clients } = useClientList();
  const [filter, setFilter] = useState<HistoryFilter>('all');

  if (history.isPending) return <p role="status">{t('app.loading')}</p>;
  if (history.isError) {
    return (
      <Notice tone="danger" role="alert">
        <p>{apiErrorMessage(t, history.error)}</p>
      </Notice>
    );
  }
  const entries = history.data.filter((e) => matchesFilter(e, filter));
  const ctx = { partners: reference?.partners, people, clients };

  return (
    <div className="history">
      <div className="field history-filter">
        <label htmlFor={`history-filter-${eventId}`}>{t('history.filter')}</label>
        <select
          id={`history-filter-${eventId}`}
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
      {entries.length === 0 ? (
        <p className="muted">{t('history.empty')}</p>
      ) : (
        <ol className="history-list" aria-label={t('event.sections.history')}>
          {entries.map((entry) => {
            const { title, lines } = describeEntry(t, lang, entry, ctx);
            const partner = reference?.partners.find((p) => p.id === entry.partnerId)?.name ?? '–';
            return (
              <li key={entry.id} className="history-item">
                <div className="history-title">
                  <strong className="history-event">{title}</strong>
                  <span className="meta history-meta">
                    {formatDateTime(entry.at, lang)} · {partner}
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
