import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { GigDetail, GigUpdateResponse, Person, Warning } from '../../api/types';
import { apiErrorMessage, costTypeLabel, gigDisplayStatus, technicalSetupLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatDateRange, formatMoney, formatPercent } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { Attachments } from './Attachments';
import { CostList } from './CostList';
import { GigActions } from './GigActions';
import { GigEditForm, type EditSection } from './GigEditForm';
import { History } from './History';
import { personName, useGig, usePeople } from './queries';
import { StatusBadge } from './StatusBadge';

type Notice =
  | { kind: 'saved'; movedLines: string[] }
  | { kind: 'moved' | 'uncancelled' | 'restored' }
  | { kind: 'cancelled' };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="gig-section" open>
      <summary>
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
      <section className="page">
        <p className="back-link">
          <Link to="/gigs">‹ {t('gig.back')}</Link>
        </p>
        <p className="notice notice-error" role="alert">
          {apiErrorMessage(t, gigQuery.error)}
        </p>
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
      <p className="back-link">
        <Link to="/gigs">‹ {t('gig.back')}</Link>
      </p>
      <GigHeader gig={gig} />

      {readOnly && (
        <p className="notice notice-error" role="note">
          {t('gig.deletedBanner')}
        </p>
      )}

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

      {notice && (
        <div className="notice" role="status">
          {notice.kind === 'cancelled' ? (
            <>
              <p>{t('gig.cancelledReminder')}</p>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setEditing('price');
                  setNotice(null);
                }}
              >
                {t('gig.editPriceNow')}
              </button>
            </>
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
          <button type="button" className="btn btn-small" onClick={() => setNotice(null)}>
            {t('common.dismiss')}
          </button>
        </div>
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

        <Section title={t('gig.sections.economics')}>
          <Economics gig={gig} />
        </Section>

        <Section title={t('gig.sections.costs')}>
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

function GigHeader({ gig }: { gig: GigDetail }) {
  const lang = useLang();
  return (
    <header className="gig-header">
      <p className="gig-header-date">{formatDateRange(gig.startDate, gig.endDate, lang)}</p>
      <h1>
        {gig.lineupName} · {gig.venue}
      </h1>
      <StatusBadge status={gigDisplayStatus(gig)} />
    </header>
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
    <div className="notice notice-warn" role="alert">
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
      <button type="button" className="btn btn-small" onClick={onDismiss}>
        {t('common.dismiss')}
      </button>
    </div>
  );
}

function InfoList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="info-list">
      {items.map(([label, value]) => (
        <div key={label}>
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
      />
      {onEdit && (
        <button type="button" className="btn" onClick={onEdit} aria-label={t('gig.editBasic')}>
          {t('common.edit')}
        </button>
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
          [t('gigForm.totalPrice'), <strong>{formatMoney(gig.totalPriceCents, lang)}</strong>],
        ]}
      />
      {onEdit && (
        <button type="button" className="btn" onClick={onEdit} aria-label={t('gig.editPrice')}>
          {t('common.edit')}
        </button>
      )}
    </>
  );
}

function Economics({ gig }: { gig: GigDetail }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <table className="econ-table">
      <thead>
        <tr>
          <th scope="col">
            <span className="visually-hidden">{t('gig.sections.economics')}</span>
          </th>
          <th scope="col">{t('gig.budget')}</th>
          <th scope="col">{t('gig.actual')}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">{t('gigs.totalPrice')}</th>
          <td>{formatMoney(gig.totalPriceCents, lang)}</td>
          <td>{formatMoney(gig.totalPriceCents, lang)}</td>
        </tr>
        <tr>
          <th scope="row">{t('gig.costs')}</th>
          <td>{formatMoney(gig.budgetedCostsCents, lang)}</td>
          <td>{formatMoney(gig.actualCostsCents, lang)}</td>
        </tr>
        <tr>
          <th scope="row">{t('gig.margin')}</th>
          <td>{formatMoney(gig.marginBudgetCents, lang)}</td>
          <td>{formatMoney(gig.marginActualCents, lang)}</td>
        </tr>
        <tr>
          <th scope="row">{t('gigs.marginPct')}</th>
          <td>{formatPercent(gig.marginBudgetPct, lang)}</td>
          <td>{formatPercent(gig.marginActualPct, lang)}</td>
        </tr>
      </tbody>
    </table>
  );
}
