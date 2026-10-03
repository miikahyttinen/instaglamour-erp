import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import type { PeopleActiveFilter } from '../../api/types';
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

  return (
    <section className="page people-page">
      <div className="page-head">
        <h1>{t('pages.people')}</h1>
      </div>

      <div className="people-add">
        <h2>{t('people.addTitle')}</h2>
        <NameForm
          label={t('people.name')}
          submitLabel={t('people.add')}
          pending={create.isPending}
          error={create.error}
          onSubmit={add}
          clearOnSuccess
        />
      </div>

      <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />

      <div className="filters">
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
        <p className="muted small">{t('people.inactiveHint')}</p>
      </div>

      {list.isPending && <p className="muted">{t('app.loading')}</p>}
      {list.isError && (
        <div className="notice notice-error" role="alert">
          <p>{t('app.loadFailed')}</p>
          <button type="button" className="btn btn-small" onClick={() => void list.refetch()}>
            {t('app.retry')}
          </button>
        </div>
      )}
      {list.data && list.data.length === 0 && <p className="muted empty">{t('people.empty')}</p>}
      {list.data && list.data.length > 0 && (
        <ul className="people-list" aria-label={t('pages.people')}>
          {list.data.map((person) => (
            <li key={person.id} className="people-row">
              <div className="people-name">
                <Link to={person.id}>{person.name}</Link>
                {!person.active && (
                  <span className="badge badge-cancelled">{t('people.inactiveBadge')}</span>
                )}
              </div>
              <PersonControls person={person} onNotice={setNotice} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
