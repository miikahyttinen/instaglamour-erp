import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { Id, PersonCostLine } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Notice as NoticeMessage } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { StatGrid, StatTile } from '../../components/StatTile';
import { StatusTag } from '../../components/StatusTag';
import { costTypeLabel, gigStatusLabel } from '../../i18n/labels';
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

  const backLink = (
    <p className="back-link">
      <Link to="/people">{t('people.back')}</Link>
    </p>
  );

  return (
    <section className="page people-page">
      {!person && backLink}
      {people.isPending && <p className="muted">{t('app.loading')}</p>}
      {people.isError && (
        <NoticeMessage tone="danger" role="alert" className="people-load-error">
          <p>{t('app.loadFailed')}</p>
          <Button size="sm" onClick={() => void people.refetch()}>
            {t('app.retry')}
          </Button>
        </NoticeMessage>
      )}
      {people.data && !person && <NoticeMessage tone="danger">{t('people.notFound')}</NoticeMessage>}
      {person && (
        <>
          <PageHead
            title={person.name}
            subtitle={
              person.active ? undefined : (
                <StatusTag tone="muted">{t('people.inactiveBadge')}</StatusTag>
              )
            }
            actions={<PersonControls person={person} onNotice={setNotice} />}
          >
            {backLink}
          </PageHead>
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
  const heading = (
    <SectionLabel id="person-lines-title" className="person-lines-label">
      {title}
    </SectionLabel>
  );

  if (query.isPending) {
    return (
      <>
        {heading}
        <p className="muted">{t('app.loading')}</p>
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        {heading}
        <NoticeMessage tone="danger" role="alert" className="people-load-error">
          <p>{t('app.loadFailed')}</p>
          <Button size="sm" onClick={() => void query.refetch()}>
            {t('app.retry')}
          </Button>
        </NoticeMessage>
      </>
    );
  }

  const { lines, totals } = query.data;
  const money = (cents: number | null) => formatMoney(cents, lang);
  const typeText = (line: PersonCostLine) => {
    const label = costTypeLabel(t, line.costLine.type);
    return line.costLine.description ? `${label}: ${line.costLine.description}` : label;
  };
  const isPaid = (line: PersonCostLine) => line.costLine.paidAt !== null;
  const paidCount = lines.filter(isPaid).length;

  const columns: DataTableColumn<PersonCostLine>[] = [
    {
      key: 'date',
      label: t('people.lines.date'),
      primary: true,
      className: 'person-lines-date',
      cell: (line) => <Link to={`/gigs/${line.gigId}`}>{formatDate(line.gigStartDate, lang)}</Link>,
    },
    {
      key: 'lineup',
      label: t('people.lines.lineup'),
      cell: (line) => (
        <span className="person-lines-lineup">
          {line.gigLineupName}
          {line.gigStatus === 'CANCELLED' && (
            <>
              {' '}
              <StatusTag tone="danger">{gigStatusLabel(t, 'CANCELLED')}</StatusTag>
            </>
          )}
        </span>
      ),
    },
    { key: 'venue', label: t('people.lines.venue'), cell: (line) => line.gigVenue },
    { key: 'type', label: t('people.lines.type'), cell: typeText },
    {
      key: 'budgeted',
      label: t('people.lines.budgeted'),
      numeric: true,
      cell: (line) => money(line.costLine.budgetedCents),
    },
    {
      key: 'actual',
      label: t('people.lines.actual'),
      numeric: true,
      cell: (line) => (isPaid(line) ? money(line.costLine.actualCents ?? 0) : '–'),
    },
    {
      key: 'paid',
      label: t('people.lines.paid'),
      className: 'person-lines-paid',
      cell: (line) =>
        isPaid(line) ? (
          formatDate(line.costLine.paidAt, lang)
        ) : (
          <span className="muted">{t('people.lines.notPaid')}</span>
        ),
    },
  ];

  return (
    <>
      {heading}
      {lines.length === 0 ? (
        <p className="empty">{t('people.lines.empty', { year })}</p>
      ) : (
        <>
          <StatGrid className="person-totals">
            <StatTile
              label={t('people.lines.totalBudgeted', { year })}
              value={money(totals.budgetedCents)}
              caption={t('people.lines.lineCount', { count: lines.length })}
            />
            <StatTile
              label={t('people.lines.totalActual', { year })}
              value={money(totals.actualCents)}
              caption={t('people.lines.paidCount', { count: paidCount })}
            />
          </StatGrid>
          <DataTable
            className="person-lines"
            caption={title}
            columns={columns}
            rows={lines}
            rowKey={(line) => line.costLine.id}
            rowClassName={(line) => (isPaid(line) ? 'is-paid' : undefined)}
            footer={
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
                <td className="hide-phone" />
              </tr>
            }
          />
        </>
      )}
    </>
  );
}
