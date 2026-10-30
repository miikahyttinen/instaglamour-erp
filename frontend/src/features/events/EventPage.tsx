import { ChevronDown, ChevronLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { EventDetail, EventUpdateResponse, Person, Warning } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice as NoticeBox } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { StatGrid, StatTile } from '../../components/StatTile';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, costTypeLabel, eventDisplayStatus } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatDateRange, formatMoney, formatPercent } from '../../lib/format';
import { Attachments } from './Attachments';
import { CostList } from './CostList';
import { EventActions } from './EventActions';
import { EventBasicFields, EventPriceFields } from './EventInfoFields';
import { EventDeletedTag, EventStatusTag } from './EventStatusTag';
import { EventOfferLink } from './EventOfferLink';
import { History } from './History';
import { ReadyForInvoice } from './ReadyForInvoice';
import { personName, useEvent, usePeople } from './queries';
import './eventPage.css';

type Notice =
  | { kind: 'saved'; movedLines: string[] }
  | { kind: 'moved' | 'uncancelled' | 'restored' }
  | { kind: 'cancelled' };

function Section({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <details className={`event-section${wide ? ' event-section-wide' : ''}`} open>
      <summary>
        <ChevronDown className="event-section-chevron" />
        <h2>{title}</h2>
      </summary>
      <div className="event-section-body">{children}</div>
    </details>
  );
}

/** Which Sales / Production lines moved to another person after a seller/producer change. */
function movedLineTexts(
  t: ReturnType<typeof useTranslation>['t'],
  result: EventUpdateResponse,
  before: EventDetail,
  people: Person[] | undefined,
): string[] {
  return result.movedCostLineIds.map((id) => {
    const after = result.event.costLines.find((l) => l.id === id);
    const old = before.costLines.find((l) => l.id === id);
    return t('event.movedLine', {
      type: after ? costTypeLabel(t, after.type) : '–',
      from: personName(people, old?.personId ?? null) ?? '–',
      to: personName(people, after?.personId ?? null) ?? '–',
    });
  });
}

/** Everything about one event on one page (UC-004). */
export function EventPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const eventQuery = useEvent(id);
  const { data: people } = usePeople();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);

  if (eventQuery.isPending) {
    return (
      <section className="page">
        <p role="status">{t('app.loading')}</p>
      </section>
    );
  }
  if (eventQuery.isError) {
    return (
      <section className="page event-page">
        <BackLink />
        <NoticeBox tone="danger" role="alert">
          <p>{apiErrorMessage(t, eventQuery.error)}</p>
        </NoticeBox>
      </section>
    );
  }
  const event = eventQuery.data;
  const readOnly = event.deletedAt !== null;

  // Each field shows its own saved state; the page notice only names moved lines (BR-027).
  const onPartnerSaved = (result: EventUpdateResponse, before: EventDetail) => {
    const movedLines = movedLineTexts(t, result, before, people);
    if (movedLines.length > 0) setNotice({ kind: 'saved', movedLines });
  };

  return (
    <section className="page event-page">
      <EventHeader
        event={event}
        actions={
          <EventActions
            event={event}
            onMoved={(w) => {
              setWarnings(w);
              setNotice({ kind: 'moved' });
            }}
            onCancelled={() => setNotice({ kind: 'cancelled' })}
            onUncancelled={() => setNotice({ kind: 'uncancelled' })}
            onRestored={() => setNotice({ kind: 'restored' })}
          />
        }
      />

      <ReadyForInvoice event={event} />

      {event.offerId && <EventOfferLink offerId={event.offerId} />}

      {readOnly && (
        <NoticeBox tone="danger" role="note">
          <p>{t('event.deletedBanner')}</p>
        </NoticeBox>
      )}

      {notice && (
        <NoticeBox tone={notice.kind === 'cancelled' ? 'warn' : 'ok'} role="status" className="event-notice">
          <div className="event-notice-text">
            {notice.kind === 'cancelled' ? (
              <p>{t('event.cancelledReminder')}</p>
            ) : notice.kind === 'saved' ? (
              <>
                <p>{t('event.saved')}</p>
                {notice.movedLines.length > 0 && (
                  <>
                    <p>{t('event.movedLines')}</p>
                    <ul>
                      {notice.movedLines.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p>{t(`event.notice.${notice.kind}`)}</p>
            )}
          </div>
          <div className="event-notice-actions">
            <Button size="sm" onClick={() => setNotice(null)}>
              {t('common.dismiss')}
            </Button>
          </div>
        </NoticeBox>
      )}

      <WarningList warnings={warnings} people={people} onDismiss={() => setWarnings([])} />

      <div className="event-sections">
        <Section title={t('event.sections.basic')}>
          <EventBasicFields event={event} readOnly={readOnly} onPartnerSaved={onPartnerSaved} />
        </Section>

        <Section title={t('event.sections.price')}>
          <EventPriceFields event={event} readOnly={readOnly} />
        </Section>

        <Section title={t('event.sections.economics')} wide>
          <Economics event={event} />
        </Section>

        <Section title={t('event.sections.costs')} wide>
          <CostList event={event} people={people} readOnly={readOnly} onWarnings={setWarnings} />
        </Section>

        <Section title={t('event.sections.attachments')}>
          <Attachments event={event} readOnly={readOnly} />
        </Section>

        <Section title={t('event.sections.history')}>
          <History eventId={event.id} people={people} />
        </Section>
      </div>
    </section>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <p className="event-back">
      <Link to="/gigs">
        <ChevronLeft />
        {t('event.back')}
      </Link>
    </p>
  );
}

function EventHeader({ event, actions }: { event: EventDetail; actions: ReactNode }) {
  const { t } = useTranslation();
  const lang = useLang();
  const status = eventDisplayStatus(event);
  return (
    <PageHead
      title={`${event.lineupName} · ${event.venue}`}
      subtitle={
        <>
          <span className="event-header-date">{formatDateRange(event.startDate, event.endDate, lang)}</span>
          <span className="event-header-tags">
            <EventStatusTag status={status} />
            {event.deletedAt !== null && <EventDeletedTag />}
            {event.notFullyStaffed && event.deletedAt === null && (
              <StatusTag tone="warn">{t('events.notFullyStaffed')}</StatusTag>
            )}
          </span>
        </>
      }
      actions={actions}
    >
      <BackLink />
    </PageHead>
  );
}

function WarningList({
  warnings,
  people,
  onDismiss,
}: {
  warnings: Warning[];
  people: Person[] | undefined;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  if (warnings.length === 0) return null;
  return (
    <NoticeBox tone="warn" role="alert" className="event-notice">
      <div className="event-notice-text">
      <p>
        <strong>{t('event.warningsTitle')}</strong>
      </p>
      <ul>
        {warnings.map((w, i) =>
          w.code === 'PERSON_DOUBLE_BOOKED' ? (
            <li key={`${w.personId}-${w.otherEventId}`}>
              {t('event.doubleBooked', {
                person: personName(people, w.personId) ?? '–',
                date: formatDate(w.otherEventStartDate, lang),
              })}{' '}
              <Link to={`/gigs/${w.otherEventId}`}>{w.otherEventLineupName}</Link>
            </li>
          ) : (
            <li key={i}>{t(`warnings.${w.code}`)}</li>
          ),
        )}
      </ul>
      </div>
      <div className="event-notice-actions">
        <Button size="sm" onClick={onDismiss}>
          {t('common.dismiss')}
        </Button>
      </div>
    </NoticeBox>
  );
}

function Economics({ event }: { event: EventDetail }) {
  const { t } = useTranslation();
  const lang = useLang();
  const pair = (label: string, budget: string, actual: string) => (
    <StatTile
      label={label}
      value={budget}
      caption={t('event.budget')}
      secondaryValue={actual}
      secondaryCaption={t('event.actual')}
    />
  );
  return (
    <StatGrid className="event-econ-grid">
      <StatTile label={t('events.totalPrice')} value={formatMoney(event.totalPriceCents, lang)} />
      {pair(t('event.costs'), formatMoney(event.budgetedCostsCents, lang), formatMoney(event.actualCostsCents, lang))}
      {pair(t('event.margin'), formatMoney(event.marginBudgetCents, lang), formatMoney(event.marginActualCents, lang))}
      {pair(
        t('events.marginPct'),
        formatPercent(event.marginBudgetPct, lang),
        formatPercent(event.marginActualPct, lang),
      )}
    </StatGrid>
  );
}
