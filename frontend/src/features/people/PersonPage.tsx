import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { Id, PersonCostLine } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { StatusBadge } from '../../gigs/StatusBadge';
import { costTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatMoney } from '../../lib/format';
import { NoticeBox, type Notice } from './Notices';
import { PersonControls } from './PersonControls';
import { usePeopleList, usePersonCostLines } from './queries';
import './people.css';

/** One person: name, rename / activate, and their cost lines in the selected year (UC-014 A2). */
export function PersonPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  // No GET /api/people/{id} in the contract: the person comes from the full list.
  const people = usePeopleList('all');
  const person = people.data?.find((p) => p.id === id);
  const [notice, setNotice] = useState<Notice | null>(null);

  return (
    <section className="page people-page">
      <p className="back-link">
        <Link to="/people">{t('people.back')}</Link>
      </p>
      {people.isPending && <p className="muted">{t('app.loading')}</p>}
      {people.isError && (
        <div className="notice notice-error" role="alert">
          <p>{t('app.loadFailed')}</p>
          <button type="button" className="btn btn-small" onClick={() => void people.refetch()}>
            {t('app.retry')}
          </button>
        </div>
      )}
      {people.data && !person && <p className="notice notice-error">{t('people.notFound')}</p>}
      {person && (
        <>
          <div className="page-head">
            <h1>
              {person.name}{' '}
              {!person.active && (
                <span className="badge badge-cancelled">{t('people.inactiveBadge')}</span>
              )}
            </h1>
            <PersonControls person={person} onNotice={setNotice} />
          </div>
          <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />
          <CostLines personId={person.id} />
        </>
      )}
    </section>
  );
}

function CostLines({ personId }: { personId: Id }) {
  const { t } = useTranslation();
  const lang = useLang();
  const year = useSelectedYear();
  const query = usePersonCostLines(personId, year);
  const title = t('people.lines.title', { year });

  if (query.isPending) {
    return (
      <>
        <h2>{title}</h2>
        <p className="muted">{t('app.loading')}</p>
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <h2>{title}</h2>
        <div className="notice notice-error" role="alert">
          <p>{t('app.loadFailed')}</p>
          <button type="button" className="btn btn-small" onClick={() => void query.refetch()}>
            {t('app.retry')}
          </button>
        </div>
      </>
    );
  }

  const { lines, totals } = query.data;
  const money = (cents: number | null) => formatMoney(cents, lang);
  const typeText = (line: PersonCostLine) => {
    const label = costTypeLabel(t, line.costLine.type);
    return line.costLine.description ? `${label}: ${line.costLine.description}` : label;
  };

  return (
    <>
      <h2 id="person-lines-title">{title}</h2>
      {lines.length === 0 ? (
        <p className="muted empty">{t('people.lines.empty', { year })}</p>
      ) : (
        <table className="person-lines" aria-labelledby="person-lines-title">
          <thead>
            <tr>
              <th scope="col">{t('people.lines.date')}</th>
              <th scope="col">{t('people.lines.lineup')}</th>
              <th scope="col">{t('people.lines.venue')}</th>
              <th scope="col">{t('people.lines.type')}</th>
              <th scope="col" className="num">
                {t('people.lines.budgeted')}
              </th>
              <th scope="col" className="num">
                {t('people.lines.actual')}
              </th>
              <th scope="col">{t('people.lines.paid')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const paid = line.costLine.paidAt !== null;
              return (
                <tr key={line.costLine.id} className={paid ? 'is-paid' : undefined}>
                  <td data-label={t('people.lines.date')}>
                    <Link to={`/gigs/${line.gigId}`}>{formatDate(line.gigStartDate, lang)}</Link>
                  </td>
                  <td data-label={t('people.lines.lineup')}>
                    {line.gigLineupName}
                    {line.gigStatus === 'CANCELLED' && (
                      <>
                        {' '}
                        <StatusBadge status="CANCELLED" />
                      </>
                    )}
                  </td>
                  <td data-label={t('people.lines.venue')}>{line.gigVenue}</td>
                  <td data-label={t('people.lines.type')}>{typeText(line)}</td>
                  <td data-label={t('people.lines.budgeted')} className="num">
                    {money(line.costLine.budgetedCents)}
                  </td>
                  <td data-label={t('people.lines.actual')} className="num">
                    {paid ? money(line.costLine.actualCents ?? 0) : '–'}
                  </td>
                  <td data-label={t('people.lines.paid')}>
                    {paid ? formatDate(line.costLine.paidAt, lang) : t('people.lines.notPaid')}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="person-lines-total">
              <th scope="row" colSpan={4}>
                {t('people.lines.total')}
              </th>
              <td data-label={t('people.lines.budgeted')} className="num">
                {money(totals.budgetedCents)}
              </td>
              <td data-label={t('people.lines.actual')} className="num">
                {money(totals.actualCents)}
              </td>
              <td className="person-lines-empty-cell" />
            </tr>
          </tfoot>
        </table>
      )}
    </>
  );
}
