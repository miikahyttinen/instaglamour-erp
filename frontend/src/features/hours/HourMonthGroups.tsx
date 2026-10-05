import { useTranslation } from 'react-i18next';
import type { HourEntry } from '../../api/types';
import { SectionLabel } from '../../components/SectionLabel';
import { useLang } from '../../i18n/useLang';
import { formatHours } from '../../lib/format';
import { HourEntryList } from './HourEntryList';
import { groupByMonth } from './hoursLogic';

interface Props {
  entries: HourEntry[];
  /** Own entries are edited inline; others are read-only. */
  editable: boolean;
  onSaved?: (entry: HourEntry) => void;
  /** Heading level of the month names (h2 on My hours, h3 inside the totals list). */
  headingAs?: 'h2' | 'h3';
}

/** Entries grouped by month (newest first), each with its month total (UC-018, UC-019). */
export function HourMonthGroups({ entries, editable, onSaved, headingAs = 'h2' }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <>
      {groupByMonth(entries).map((group) => {
        const monthName = t(`hours.months.m${group.month}`);
        return (
          <section key={group.month} className="hours-month" aria-label={monthName}>
            <div className="hours-month-head">
              <SectionLabel as={headingAs}>{monthName}</SectionLabel>
              <span className="hours-month-total" aria-label={`${t('hours.monthTotal')} ${monthName}`}>
                {formatHours(group.total, lang)}
              </span>
            </div>
            <HourEntryList entries={group.entries} editable={editable} onSaved={onSaved} />
          </section>
        );
      })}
    </>
  );
}
