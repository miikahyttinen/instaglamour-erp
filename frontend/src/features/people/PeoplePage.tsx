import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import type { PeopleActiveFilter, Person } from '../../api/types';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Notice as NoticeMessage } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { StatusTag } from '../../components/StatusTag';
import { warningMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { NameForm } from './NameForm';
import { NoticeBox, type Notice } from './Notices';
import { PersonControls } from './PersonControls';
import { useCreatePerson, usePeopleList } from './queries';
import './people.css';

const FILTERS: { value: PeopleActiveFilter; labelKey: string }[] = [
  { value: 'true', labelKey: 'people.filters.active' },
  { value: 'false', labelKey: 'people.filters.inactive' },
  { value: 'all', labelKey: 'people.filters.all' },
];

function parseFilter(value: string | null): PeopleActiveFilter {
  return value === 'false' || value === 'all' ? value : 'true';
}

/** People register: list (active by default), add, rename, activate/deactivate (UC-014). */
export function PeoplePage() {
  const { t } = useTranslation();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get('active'));
  const list = usePeopleList(filter);
  const create = useCreatePerson();
  const [notice, setNotice] = useState<Notice | null>(null);

  const setFilter = (value: PeopleActiveFilter) => {
    setParams(value === 'true' ? {} : { active: value }, { replace: true });
  };

  const add = async (name: string) => {
    const result = await create.mutateAsync(name);
    setNotice({
      text: t('people.added', { name: result.person.name }),
      warnings: result.warnings.map((w) => warningMessage(t, w, lang)),
    });
  };

  const columns: DataTableColumn<Person>[] = [
    {
      key: 'name',
      label: t('people.name'),
      primary: true,
      cell: (person) => (
        <span className="people-name">
          <Link to={person.id}>{person.name}</Link>
          {!person.active && <StatusTag tone="muted">{t('people.inactiveBadge')}</StatusTag>}
        </span>
      ),
    },
    {
      key: 'actions',
      label: t('people.actions'),
      header: <span className="visually-hidden">{t('people.actions')}</span>,
      className: 'people-actions-cell',
      cell: (person) => <PersonControls person={person} onNotice={setNotice} />,
    },
  ];

  return (
    <section className="page people-page">
      <PageHead title={t('pages.people')} />

      <section className="people-add" aria-labelledby="people-add-title">
        <SectionLabel id="people-add-title">{t('people.addTitle')}</SectionLabel>
        <NameForm
          label={t('people.name')}
          submitLabel={t('people.add')}
          pending={create.isPending}
          error={create.error}
          onSubmit={add}
          clearOnSuccess
          inline
        />
      </section>

      <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />

      <div className="filters people-filters">
        <div className="segmented" role="group" aria-label={t('people.filterLabel')}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
        <p className="muted small people-hint">{t('people.inactiveHint')}</p>
      </div>

      {list.isPending && <p className="muted">{t('app.loading')}</p>}
      {list.isError && (
        <NoticeMessage tone="danger" role="alert" className="people-load-error">
          <p>{t('app.loadFailed')}</p>
          <Button size="sm" onClick={() => void list.refetch()}>
            {t('app.retry')}
          </Button>
        </NoticeMessage>
      )}
      {list.data && (
        <DataTable
          className="people-table"
          caption={t('pages.people')}
          columns={columns}
          rows={list.data}
          rowKey={(person) => person.id}
          rowClassName={(person) => (person.active ? undefined : 'is-inactive')}
          empty={<p className="empty">{t('people.empty')}</p>}
        />
      )}
    </section>
  );
}
