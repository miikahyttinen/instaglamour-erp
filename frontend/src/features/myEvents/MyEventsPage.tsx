import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { MyEvent } from '../../api/types';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { myEventDate, myRoleLabel } from './myEventText';
import { useMyEvents } from './queries';
import './myEvents.css';

/**
 * My gigs (owner request 2026-11-08): the signed-in partner's upcoming gigs where they are the
 * producer or play, soonest first. Start page (`/my-gigs`); no year selector.
 */
export function MyEventsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const query = useMyEvents();

  const columns: DataTableColumn<MyEvent>[] = [
    {
      key: 'date',
      phoneBare: true,
      label: t('myEvents.columns.date'),
      className: 'my-events-date',
      cell: (event) => myEventDate(event, lang),
    },
    {
      key: 'event',
      label: t('myEvents.columns.event'),
      primary: true,
      cell: (event) => (
        <Link to={`/gigs/${event.eventId}`} className="my-events-link" title={event.lineupName}>
          {event.lineupName}
        </Link>
      ),
    },
    {
      key: 'venue',
      phoneBare: true,
      label: t('myEvents.columns.venue'),
      cell: (event) => (event.clientName ? `${event.venue} · ${event.clientName}` : event.venue),
    },
    {
      key: 'roles',
      phoneBare: true,
      label: t('myEvents.columns.roles'),
      cell: (event) => (
        <span className="my-events-roles">
          {event.roles.map((role, i) => (
            <StatusTag key={i} className="my-events-role">
              {myRoleLabel(t, role)}
            </StatusTag>
          ))}
        </span>
      ),
    },
    {
      key: 'staffing',
      phoneEnd: true,
      label: t('myEvents.columns.staffing'),
      className: 'my-events-staffing',
      cell: (event) => event.notFullyStaffed && <StatusTag tone="warn">{t('events.notFullyStaffed')}</StatusTag>,
    },
  ];

  return (
    <section className="page my-events-page">
      <PageHead title={t('pages.myEvents')} subtitle={t('myEvents.subtitle')} />
      {query.isPending && (
        <p className="meta" role="status">
          {t('app.loading')}
        </p>
      )}
      {query.isError && (
        <Notice tone="danger" role="alert">
          <p>{apiErrorMessage(t, query.error)}</p>
          <Button size="sm" onClick={() => void query.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {query.data && (
        <DataTable
          columns={columns}
          rows={query.data}
          rowKey={(event) => event.eventId}
          caption={t('pages.myEvents')}
          empty={t('myEvents.empty')}
          className="my-events-table"
        />
      )}
    </section>
  );
}
