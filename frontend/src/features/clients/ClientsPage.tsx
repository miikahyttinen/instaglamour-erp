import { Search } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { ClientListItem } from '../../api/types';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { CLIENT_PAGE_SIZE, useUrlPaging } from '../../components/pagination';
import { SectionLabel } from '../../components/SectionLabel';
import { apiErrorMessage } from '../../i18n/labels';
import { ClientForm } from './ClientForm';
import { useClientList } from './queries';
import './clients.css';

/**
 * Client register (UC-027): searchable list (name · events · offers) and the add form. The search
 * (`?q=`) and the page (`?page=`, TASK-193) are in the URL, so back / refresh keep them.
 */
export function ClientsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const deletedName = (location.state as { deletedClient?: string } | null)?.deletedClient;
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDeferredValue(search.trim());
  const list = useClientList(q);
  const paging = useUrlPaging(CLIENT_PAGE_SIZE);

  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set('q', q);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [q, params, setParams]);
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null);

  const columns: DataTableColumn<ClientListItem>[] = [
    {
      key: 'name',
      label: t('clients.columns.name'),
      primary: true,
      cell: (client) => (
        <Link to={client.id} className="client-link">
          {client.name}
        </Link>
      ),
    },
    {
      key: 'events',
      label: t('clients.columns.events'),
      numeric: true,
      className: 'client-count',
      cell: (client) => client.eventCount,
    },
    {
      key: 'offers',
      label: t('clients.columns.offers'),
      numeric: true,
      className: 'client-count',
      cell: (client) => client.offerCount,
    },
  ];

  return (
    <section className="page clients-page">
      <PageHead title={t('pages.clients')} />

      <section className="clients-add" aria-labelledby="clients-add-title">
        <SectionLabel id="clients-add-title">{t('clients.addTitle')}</SectionLabel>
        <ClientForm onCreated={(client) => setAdded({ id: client.id, name: client.name })} />
      </section>

      {added ? (
        <Notice tone="ok" role="status" className="clients-notice">
          <p>
            {t('clients.added')}{' '}
            <Link to={added.id}>{added.name}</Link>
          </p>
          <Button size="sm" onClick={() => setAdded(null)}>
            {t('common.dismiss')}
          </Button>
        </Notice>
      ) : deletedName ? (
        <Notice tone="ok" role="status">
          <p>{t('clients.deleted', { name: deletedName })}</p>
        </Notice>
      ) : null}

      <div className="clients-search">
        <label htmlFor="client-search">{t('clients.search')}</label>
        <div className="clients-search-input">
          <Search className="clients-search-icon" />
          <input
            id="client-search"
            type="search"
            value={search}
            placeholder={t('clients.searchPlaceholder')}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {list.isPending && (
        <p role="status" className="meta">
          {t('app.loading')}
        </p>
      )}
      {list.isError && (
        <Notice tone="danger" role="alert" className="clients-load-error">
          <p>{apiErrorMessage(t, list.error)}</p>
          <Button size="sm" onClick={() => void list.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {list.data && (
        <DataTable
          className="clients-table"
          caption={t('pages.clients')}
          columns={columns}
          rows={list.data}
          rowKey={(client) => client.id}
          paging={paging}
          empty={<p className="empty">{q ? t('clients.emptyFiltered') : t('clients.empty')}</p>}
        />
      )}
    </section>
  );
}
