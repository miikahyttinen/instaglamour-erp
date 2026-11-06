import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import type { MusicianRole } from '../../api/enums';
import type { PeopleActiveFilter, Person } from '../../api/types';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { nextSort, readTableParams, type SortDir } from '../../components/excelTableState';
import { Notice as NoticeMessage } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { StatusTag } from '../../components/StatusTag';
import { costTypeLabel, warningMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { TABLET_QUERY, useMediaQuery } from '../../lib/useMediaQuery';
import { usePersonRoles } from '../../reference/usePersonRoles';
import { NameForm } from './NameForm';
import { NoticeBox, type Notice } from './Notices';
import { isPartner } from './partnerRules';
import { PartnerTag } from './PartnerStatus';
import { PEOPLE_SORT_KEYS, parsePeopleSort, sortPeople, type PeopleSort, type PeopleSortKey } from './peopleSort';
import { useCreatePerson, usePeopleList } from './queries';
import './people.css';

const FILTERS: { value: PeopleActiveFilter; labelKey: string }[] = [
  { value: 'true', labelKey: 'people.filters.active' },
  { value: 'false', labelKey: 'people.filters.inactive' },
  { value: 'all', labelKey: 'people.filters.all' },
];

const SORT_LABELS: Record<PeopleSortKey, string> = {
  name: 'people.name',
  eventCount: 'people.eventCount',
  partner: 'people.partner.column',
};

function parseFilter(value: string | null): PeopleActiveFilter {
  return value === 'false' || value === 'all' ? value : 'true';
}

/** `?partner=true` = only active partners (UC-032); anything else = no partner filter. */
function parseOnlyPartners(value: string | null): boolean {
  return value === 'true';
}

/** `?role=<person role>`; unknown codes (and OTHER_ROLE, not a person role) are ignored. */
function parseRole(roles: readonly MusicianRole[], value: string | null): MusicianRole | undefined {
  return (roles as readonly string[]).includes(value ?? '') ? (value as MusicianRole) : undefined;
}

/**
 * Accessible names must be unique per row, but duplicate names are allowed (DUPLICATE_NAME is a
 * warning): repeated names get " (2)", " (3)"… in list order.
 */
function rowNames(people: readonly Person[]): Map<string, string> {
  const total = new Map<string, number>();
  for (const p of people) total.set(p.name, (total.get(p.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  for (const p of people) {
    const n = (seen.get(p.name) ?? 0) + 1;
    seen.set(p.name, n);
    names.set(p.id, (total.get(p.name) ?? 0) > 1 ? `${p.name} (${n})` : p.name);
  }
  return names;
}

/**
 * People register (UC-014): list (active by default), add. The list is read-only (TASK-169): the
 * name links to the person page, where name, active status and roles are edited. Partners have an
 * "Osakas" tag; each row shows the person's roles and played event count. Filters on one line:
 * active status, role (`?role=`) and "only partners" (`?partner=true`), all kept in the URL.
 * Sorted client-side (TASK-156) by name / event count / partnership via the column headers (phones:
 * a "Järjestys" select); `?sort=name|eventCount|partner&dir=asc|desc`, default name ascending.
 */
export function PeoplePage() {
  const { t } = useTranslation();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get('active'));
  const onlyPartners = parseOnlyPartners(params.get('partner'));
  const personRoles = usePersonRoles();
  const role = parseRole(personRoles, params.get('role'));
  const sort = parsePeopleSort(readTableParams(params).sort);
  const wide = useMediaQuery(TABLET_QUERY);
  const list = usePeopleList(filter, onlyPartners ? 'true' : undefined, role);
  const create = useCreatePerson();
  const [notice, setNotice] = useState<Notice | null>(null);

  const setParam = (key: string, value: string | undefined) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };
  const setFilter = (value: PeopleActiveFilter) => setParam('active', value === 'true' ? undefined : value);
  const setOnlyPartners = (checked: boolean) => setParam('partner', checked ? 'true' : undefined);
  const setRole = (value: string) => setParam('role', parseRole(personRoles, value));
  const setSort = (next: PeopleSort) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('sort', next.key);
        p.set('dir', next.dir);
        return p;
      },
      { replace: true },
    );
  const toggleSort = (key: PeopleSortKey) => setSort(nextSort(sort, key) as PeopleSort);
  const sortProps = (key: PeopleSortKey) => ({
    sort: sort.key === key ? sort.dir : undefined,
    onSort: () => toggleSort(key),
  });

  const add = async (name: string) => {
    const result = await create.mutateAsync(name);
    setNotice({
      text: t('people.added', { name: result.person.name }),
      warnings: result.warnings.map((w) => warningMessage(t, w, lang)),
    });
  };

  const people = sortPeople(list.data ?? [], sort);
  const names = rowNames(people);
  const nameOf = (person: Person) => names.get(person.id) ?? person.name;

  const columns: DataTableColumn<Person>[] = [
    {
      key: 'name',
      label: t('people.name'),
      primary: true,
      ...sortProps('name'),
      cell: (person) => {
        const label = nameOf(person);
        return (
          <Link
            to={person.id}
            className="people-name-link"
            aria-label={label === person.name ? undefined : label}
          >
            {person.name}
          </Link>
        );
      },
    },
    {
      key: 'roles',
      phoneBare: true,
      label: t('people.roles'),
      className: 'people-roles-cell',
      cell: (person) =>
        person.roles.length > 0 ? (
          <span className="people-roles">
            {person.roles.map((r) => (
              <StatusTag key={r}>{costTypeLabel(t, r)}</StatusTag>
            ))}
          </span>
        ) : (
          <span className="muted" title={t('people.noRoles')}>
            –
          </span>
        ),
    },
    {
      key: 'eventCount',
      label: t('people.eventCount'),
      numeric: true,
      className: 'people-events-cell',
      ...sortProps('eventCount'),
      cell: (person) => person.eventCount,
    },
    {
      key: 'partner',
      phoneBare: true,
      label: t('people.partner.column'),
      className: 'people-partner-cell',
      ...sortProps('partner'),
      cell: (person) => (isPartner(person) ? <PartnerTag /> : null),
    },
    {
      key: 'active',
      phoneMain: true,
      label: t('people.active'),
      className: 'people-active-cell',
      cell: (person) =>
        person.active ? (
          <StatusTag tone="ok">{t('people.active')}</StatusTag>
        ) : (
          <StatusTag tone="muted">{t('people.inactiveBadge')}</StatusTag>
        ),
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
        <label className="people-role-filter">
          <span className="visually-hidden">{t('people.roleFilter')}</span>
          <select value={role ?? ''} onChange={(e) => setRole(e.target.value)}>
            <option value="">{t('people.allRoles')}</option>
            {personRoles.map((r) => (
              <option key={r} value={r}>
                {costTypeLabel(t, r)}
              </option>
            ))}
          </select>
        </label>
        <label className="check people-only-partners">
          <input
            type="checkbox"
            checked={onlyPartners}
            onChange={(e) => setOnlyPartners(e.target.checked)}
          />
          {t('people.onlyPartners')}
        </label>
        {!wide && (
          <div className="people-sort">
            <label className="people-sort-key">
              <span className="people-sort-label">{t('table.sortBy')}</span>
              <select value={sort.key} onChange={(e) => setSort({ key: e.target.value as PeopleSortKey, dir: sort.dir })}>
                {PEOPLE_SORT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t(SORT_LABELS[key])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="visually-hidden">{t('table.sortDir')}</span>
              <select value={sort.dir} onChange={(e) => setSort({ key: sort.key, dir: e.target.value as SortDir })}>
                <option value="asc">{t('table.asc')}</option>
                <option value="desc">{t('table.desc')}</option>
              </select>
            </label>
          </div>
        )}
      </div>
      <p className="muted small people-hint">{t('people.inactiveHint')}</p>

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
          rows={people}
          rowKey={(person) => person.id}
          rowClassName={(person) => (person.active ? undefined : 'is-inactive')}
          empty={<p className="empty">{t('people.empty')}</p>}
        />
      )}
    </section>
  );
}
