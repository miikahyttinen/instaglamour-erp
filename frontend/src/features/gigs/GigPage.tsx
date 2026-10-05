import { ChevronDown, ChevronLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { GigDetail, GigUpdateResponse, Person, Warning } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice as NoticeBox } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { StatGrid, StatTile } from '../../components/StatTile';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, costTypeLabel, gigDisplayStatus } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatDateRange, formatMoney, formatPercent } from '../../lib/format';
import { Attachments } from './Attachments';
import { CostList } from './CostList';
import { GigActions } from './GigActions';
import { GigBasicFields, GigPriceFields } from './GigInfoFields';
import { GigDeletedTag, GigStatusTag } from './GigStatusTag';
import { History } from './History';
import { personName, useGig, usePeople } from './queries';
import './gigPage.css';

type Notice =
  | { kind: 'saved'; movedLines: string[] }
  | { kind: 'moved' | 'uncancelled' | 'restored' }
  | { kind: 'cancelled' };

function Section({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <details className={`gig-section${wide ? ' gig-section-wide' : ''}`} open>
      <summary>
        <ChevronDown className="gig-section-chevron" />
        <h2>{title}</h2>
      </summary>
      <div className="gig-section-body">{children}</div>
    </details>
  );
}

/** Which Sales / Production lines moved to another person after a seller/producer change. */
function movedLineTexts(
  t: ReturnType<typeof useTranslation>['t'],
  result: GigUpdateResponse,
  before: GigDetail,
  people: Person[] | undefined,
): string[] {
  return result.movedCostLineIds.map((id) => {
    const after = result.gig.costLines.find((l) => l.id === id);
    const old = before.costLines.find((l) => l.id === id);
    return t('gig.movedLine', {
      type: after ? costTypeLabel(t, after.type) : '–',
      from: personName(people, old?.personId ?? null) ?? '–',
      to: personName(people, after?.personId ?? null) ?? '–',
    });
  });
}

/** Everything about one gig on one page (UC-004). */
export function GigPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const gigQuery = useGig(id);
  const { data: people } = usePeople();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);

  if (gigQuery.isPending) {
    return (
      <section className="page">
        <p role="status">{t('app.loading')}</p>
      </section>
    );
  }
  if (gigQuery.isError) {
    return (
      <section className="page gig-page">
        <BackLink />
        <NoticeBox tone="danger" role="alert">
          <p>{apiErrorMessage(t, gigQuery.error)}</p>
        </NoticeBox>
      </section>
    );
  }
  const gig = gigQuery.data;
  const readOnly = gig.deletedAt !== null;

  // Each field shows its own saved state; the page notice only names moved lines (BR-027).
  const onPartnerSaved = (result: GigUpdateResponse, before: GigDetail) => {
    const movedLines = movedLineTexts(t, result, before, people);
    if (movedLines.length > 0) setNotice({ kind: 'saved', movedLines });
  };

  return (
    <section className="page gig-page">
      <GigHeader
        gig={gig}
        actions={
          <GigActions
            gig={gig}
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

      {readOnly && (
        <NoticeBox tone="danger" role="note">
          <p>{t('gig.deletedBanner')}</p>
        </NoticeBox>
      )}

      {notice && (
        <NoticeBox tone={notice.kind === 'cancelled' ? 'warn' : 'ok'} role="status" className="gig-notice">
          <div className="gig-notice-text">
            {notice.kind === 'cancelled' ? (
              <p>{t('gig.cancelledReminder')}</p>
            ) : notice.kind === 'saved' ? (
              <>
                <p>{t('gig.saved')}</p>
                {notice.movedLines.length > 0 && (
                  <>
                    <p>{t('gig.movedLines')}</p>
                    <ul>
                      {notice.movedLines.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p>{t(`gig.notice.${notice.kind}`)}</p>
            )}
          </div>
          <div className="gig-notice-actions">
            <Button size="sm" onClick={() => setNotice(null)}>
              {t('common.dismiss')}
            </Button>
          </div>
        </NoticeBox>
      )}

      <WarningList warnings={warnings} people={people} onDismiss={() => setWarnings([])} />

      <div className="gig-sections">
        <Section title={t('gig.sections.basic')}>
          <GigBasicFields gig={gig} readOnly={readOnly} onPartnerSaved={onPartnerSaved} />
        </Section>

        <Section title={t('gig.sections.price')}>
          <GigPriceFields gig={gig} readOnly={readOnly} />
        </Section>

        <Section title={t('gig.sections.economics')} wide>
          <Economics gig={gig} />
        </Section>

        <Section title={t('gig.sections.costs')} wide>
          <CostList gig={gig} people={people} readOnly={readOnly} onWarnings={setWarnings} />
        </Section>

        <Section title={t('gig.sections.attachments')}>
          <Attachments gig={gig} readOnly={readOnly} />
        </Section>

        <Section title={t('gig.sections.history')}>
          <History gigId={gig.id} people={people} />
        </Section>
      </div>
    </section>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <p className="gig-back">
      <Link to="/gigs">
        <ChevronLeft />
        {t('gig.back')}
      </Link>
    </p>
  );
}

function GigHeader({ gig, actions }: { gig: GigDetail; actions: ReactNode }) {
  const { t } = useTranslation();
  const lang = useLang();
  const status = gigDisplayStatus(gig);
  return (
    <PageHead
      title={`${gig.lineupName} · ${gig.venue}`}
      subtitle={
        <>
          <span className="gig-header-date">{formatDateRange(gig.startDate, gig.endDate, lang)}</span>
          <span className="gig-header-tags">
            <GigStatusTag status={status} />
            {gig.deletedAt !== null && <GigDeletedTag />}
            {gig.notFullyStaffed && gig.deletedAt === null && (
              <StatusTag tone="warn">{t('gigs.notFullyStaffed')}</StatusTag>
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
    <NoticeBox tone="warn" role="alert" className="gig-notice">
      <div className="gig-notice-text">
      <p>
        <strong>{t('gig.warningsTitle')}</strong>
      </p>
      <ul>
        {warnings.map((w, i) =>
          w.code === 'PERSON_DOUBLE_BOOKED' ? (
            <li key={`${w.personId}-${w.otherGigId}`}>
              {t('gig.doubleBooked', {
                person: personName(people, w.personId) ?? '–',
                date: formatDate(w.otherGigStartDate, lang),
              })}{' '}
              <Link to={`/gigs/${w.otherGigId}`}>{w.otherGigLineupName}</Link>
            </li>
          ) : (
            <li key={i}>{t(`warnings.${w.code}`)}</li>
          ),
        )}
      </ul>
      </div>
      <div className="gig-notice-actions">
        <Button size="sm" onClick={onDismiss}>
          {t('common.dismiss')}
        </Button>
      </div>
    </NoticeBox>
  );
}

function Economics({ gig }: { gig: GigDetail }) {
  const { t } = useTranslation();
  const lang = useLang();
  const pair = (label: string, budget: string, actual: string) => (
    <StatTile
      label={label}
      value={budget}
      caption={t('gig.budget')}
      secondaryValue={actual}
      secondaryCaption={t('gig.actual')}
    />
  );
  return (
    <StatGrid className="gig-econ-grid">
      <StatTile label={t('gigs.totalPrice')} value={formatMoney(gig.totalPriceCents, lang)} />
      {pair(t('gig.costs'), formatMoney(gig.budgetedCostsCents, lang), formatMoney(gig.actualCostsCents, lang))}
      {pair(t('gig.margin'), formatMoney(gig.marginBudgetCents, lang), formatMoney(gig.marginActualCents, lang))}
      {pair(
        t('gigs.marginPct'),
        formatPercent(gig.marginBudgetPct, lang),
        formatPercent(gig.marginActualPct, lang),
      )}
    </StatGrid>
  );
}
