import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { MUSICIAN_ROLES, type MusicianRole } from '../../api/enums';
import type { PeopleActiveFilter, Person } from '../../api/types';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Notice as NoticeMessage } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { StatusTag } from '../../components/StatusTag';
import { costTypeLabel, warningMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { NameForm } from './NameForm';
import { NoticeBox, type Notice } from './Notices';
import { isPartner } from './partnerRules';
import { PartnerTag } from './PartnerStatus';
import { PersonActiveSwitch, PersonNameField } from './PersonFields';
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

/** `?partner=true` = only active partners (UC-032); anything else = no partner filter. */
function parseOnlyPartners(value: string | null): boolean {
  return value === 'true';
}

/** `?role=<MusicianRole>`; unknown codes are ignored (no role filter). */
function parseRole(value: string | null): MusicianRole | undefined {
  return (MUSICIAN_ROLES as readonly string[]).includes(value ?? '') ? (value as MusicianRole) : undefined;
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
 * People register (UC-014): list (active by default), add; name and active are edited in place
 * (NFR-8: no Edit buttons, the name saves on blur / Enter, the switch on change). Partners have an
 * "Osakas" tag; each row shows the person's roles and played gig count. Filters on one line:
 * active status, role (`?role=`) and "only partners" (`?partner=true`), all kept in the URL.
 */
export function PeoplePage() {
  const { t } = useTranslation();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get('active'));
  const onlyPartners = parseOnlyPartners(params.get('partner'));
  const role = parseRole(params.get('role'));
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
  const setRole = (value: string) => setParam('role', parseRole(value));

  const add = async (name: string) => {
    const result = await create.mutateAsync(name);
    setNotice({
      text: t('people.added', { name: result.person.name }),
      warnings: result.warnings.map((w) => warningMessage(t, w, lang)),
    });
  };

  const names = rowNames(list.data ?? []);
  const nameOf = (person: Person) => names.get(person.id) ?? person.name;

  const columns: DataTableColumn<Person>[] = [
    {
      key: 'name',
      label: t('people.name'),
      primary: true,
      cell: (person) => (
        <span className="people-name">
          <PersonNameField
            person={person}
            label={t('people.nameOf', { name: nameOf(person) })}
            hideLabel
            className="people-name-field"
            onNotice={setNotice}
          />
          <Link
            to={person.id}
            className="people-open"
            aria-label={t('people.openOf', { name: nameOf(person) })}
          >
            <span className="people-open-text">{t('people.open')}</span>
            <ChevronRight aria-hidden="true" />
          </Link>
        </span>
      ),
    },
    {
      key: 'roles',
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
      key: 'gigCount',
      label: t('people.gigCount'),
      numeric: true,
      className: 'people-gigs-cell',
      cell: (person) => person.gigCount,
    },
    {
      key: 'partner',
      label: t('people.partner.column'),
      className: 'people-partner-cell',
      cell: (person) => (isPartner(person) ? <PartnerTag /> : null),
    },
    {
      key: 'active',
      label: t('people.active'),
      className: 'people-active-cell',
      cell: (person) => (
        <PersonActiveSwitch
          person={person}
          label={t('people.activeOf', { name: nameOf(person) })}
          hideLabel
          onNotice={setNotice}
        />
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
            {MUSICIAN_ROLES.map((r) => (
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
          rows={list.data}
          rowKey={(person) => person.id}
          rowClassName={(person) => (person.active ? undefined : 'is-inactive')}
          empty={<p className="empty">{t('people.empty')}</p>}
        />
      )}
    </section>
  );
}
