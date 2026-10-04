import { ChevronDown, ChevronLeft, Pencil } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { GigDisplayStatus } from '../../api/enums';
import type { GigDetail, GigUpdateResponse, Person, Warning } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice as NoticeBox } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { StatGrid, StatTile } from '../../components/StatTile';
import { StatusTag, type StatusTone } from '../../components/StatusTag';
import {
  apiErrorMessage,
  costTypeLabel,
  gigDisplayStatus,
  gigStatusLabel,
  technicalSetupLabel,
} from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatDateRange, formatMoney, formatPercent } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { Attachments } from './Attachments';
import { CostList } from './CostList';
import { GigActions } from './GigActions';
import { GigEditForm, type EditSection } from './GigEditForm';
import { History } from './History';
import { personName, useGig, usePeople } from './queries';
import './gigPage.css';

type Notice =
  | { kind: 'saved'; movedLines: string[] }
  | { kind: 'moved' | 'uncancelled' | 'restored' }
  | { kind: 'cancelled' };

const STATUS_TONE: Record<GigDisplayStatus, StatusTone> = {
  SOLD: 'info',
  PLAYED: 'info',
  CANCELLED: 'danger',
};

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
  const [editing, setEditing] = useState<EditSection | null>(null);

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

  const onSaved = (result: GigUpdateResponse, before: GigDetail) => {
    setEditing(null);
    setNotice({ kind: 'saved', movedLines: movedLineTexts(t, result, before, people) });
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
            {notice.kind === 'cancelled' && (
              <Button
                size="sm"
                icon={Pencil}
                onClick={() => {
                  setEditing('price');
                  setNotice(null);
                }}
              >
                {t('gig.editPriceNow')}
              </Button>
            )}
            <Button size="sm" onClick={() => setNotice(null)}>
              {t('common.dismiss')}
            </Button>
          </div>
        </NoticeBox>
      )}

      <WarningList warnings={warnings} people={people} onDismiss={() => setWarnings([])} />

      <div className="gig-sections">
        <Section title={t('gig.sections.basic')}>
          {editing === 'basic' ? (
            <GigEditForm gig={gig} section="basic" onSaved={onSaved} onCancel={() => setEditing(null)} />
          ) : (
            <BasicInfo gig={gig} onEdit={readOnly ? undefined : () => setEditing('basic')} />
          )}
        </Section>

        <Section title={t('gig.sections.price')}>
          {editing === 'price' ? (
            <GigEditForm gig={gig} section="price" onSaved={onSaved} onCancel={() => setEditing(null)} />
          ) : (
            <PriceInfo gig={gig} onEdit={readOnly ? undefined : () => setEditing('price')} />
          )}
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
            <StatusTag tone={STATUS_TONE[status]}>{gigStatusLabel(t, status)}</StatusTag>
            {gig.deletedAt !== null && <StatusTag tone="danger">{t('gigs.views.deleted')}</StatusTag>}
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

function InfoList({ items, wideFrom }: { items: [string, ReactNode][]; wideFrom?: number }) {
  return (
    <dl className="gig-info">
      {items.map(([label, value], i) => (
        <div key={label} className={wideFrom !== undefined && i >= wideFrom ? 'gig-info-wide' : undefined}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BasicInfo({ gig, onEdit }: { gig: GigDetail; onEdit?: () => void }) {
  const { t } = useTranslation();
  const { data: reference } = useReference();
  const partner = (id: string) => reference?.partners.find((p) => p.id === id)?.name ?? '–';
  return (
    <>
      <InfoList
        items={[
          [t('gigForm.lineupName'), gig.lineupName],
          [t('gigForm.venue'), gig.venue],
          [
            t('gigForm.technicalSetup'),
            gig.technicalSetup.length > 0
              ? gig.technicalSetup.map((c) => technicalSetupLabel(t, c)).join(', ')
              : '–',
          ],
          [t('gigForm.seller'), partner(gig.sellerId)],
          [t('gigForm.producer'), partner(gig.producerId)],
          [t('gigForm.notes'), <span className="pre-wrap">{gig.notes ?? '–'}</span>],
        ]}
        wideFrom={5}
      />
      {onEdit && (
        <div className="gig-info-actions">
          <Button size="sm" icon={Pencil} onClick={onEdit} aria-label={t('gig.editBasic')}>
            {t('common.edit')}
          </Button>
        </div>
      )}
    </>
  );
}

function PriceInfo({ gig, onEdit }: { gig: GigDetail; onEdit?: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <>
      <InfoList
        items={[
          [t('gigForm.price'), formatMoney(gig.priceCents, lang)],
          [t('gigForm.additionalSales'), formatMoney(gig.additionalSalesCents, lang)],
          [t('gigForm.additionalSalesDescription'), gig.additionalSalesDescription ?? '–'],
          [t('gigForm.totalPrice'), <strong className="gig-info-figure">{formatMoney(gig.totalPriceCents, lang)}</strong>],
        ]}
      />
      {onEdit && (
        <div className="gig-info-actions">
          <Button size="sm" icon={Pencil} onClick={onEdit} aria-label={t('gig.editPrice')}>
            {t('common.edit')}
          </Button>
        </div>
      )}
    </>
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
