import { Plus } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { LineupTemplate } from '../../api/types';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Field } from '../../components/fields';
import { Notice } from '../../components/Notice';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatMoney } from '../../lib/format';
import { LINEUP_NAME_MAX, lineupTotalCents, sortLineups } from './lineupLines';
import { useCreateLineup, useLineups } from './queries';

/** Settings → Lineups: the list and "New lineup" (asks the name inline, creates, opens it). */
export function LineupsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const location = useLocation();
  const deletedName = (location.state as { deletedLineup?: string } | null)?.deletedLineup;
  const list = useLineups();
  const [creating, setCreating] = useState(false);

  const columns: DataTableColumn<LineupTemplate>[] = [
    {
      key: 'name',
      label: t('settings.lineups.columns.name'),
      primary: true,
      cell: (lineup) => <Link to={`/settings/lineups/${lineup.id}`}>{lineup.name}</Link>,
    },
    {
      key: 'status',
      label: t('settings.lineups.columns.status'),
      phoneInline: true,
      className: 'lineup-col-status',
      cell: (lineup) =>
        lineup.active ? (
          <StatusTag tone="ok">{t('settings.lineups.active')}</StatusTag>
        ) : (
          <StatusTag>{t('settings.lineups.inactive')}</StatusTag>
        ),
    },
    {
      key: 'lines',
      label: t('settings.lineups.columns.lines'),
      numeric: true,
      className: 'lineup-col-count',
      cell: (lineup) => lineup.lines.length,
    },
    {
      key: 'gigs',
      label: t('settings.lineups.columns.gigs'),
      numeric: true,
      className: 'lineup-col-count',
      cell: (lineup) => lineup.eventCount,
    },
    {
      key: 'total',
      label: t('settings.lineups.columns.total'),
      numeric: true,
      phoneMain: true,
      className: 'lineup-col-total',
      cell: (lineup) => formatMoney(lineupTotalCents(lineup.lines), lang),
    },
  ];

  return (
    <div className="lineups-page">
      <div className="settings-intro-row">
        <p className="settings-intro">{t('settings.lineups.intro')}</p>
        {!creating && (
          <Button icon={Plus} onClick={() => setCreating(true)}>
            {t('settings.lineups.new')}
          </Button>
        )}
      </div>

      {creating && <NewLineupForm onCancel={() => setCreating(false)} />}

      {deletedName && (
        <Notice tone="ok" role="status">
          <p>{t('settings.lineups.deleted', { name: deletedName })}</p>
        </Notice>
      )}

      {list.isPending && (
        <p role="status" className="meta">
          {t('app.loading')}
        </p>
      )}
      {list.isError && (
        <Notice tone="danger" role="alert" className="settings-load-error">
          <p>{apiErrorMessage(t, list.error)}</p>
          <Button size="sm" onClick={() => void list.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {list.data && (
        <DataTable
          className="lineups-table"
          caption={t('settings.lineups.caption')}
          columns={columns}
          rows={sortLineups(list.data)}
          rowKey={(lineup) => lineup.id}
          rowClassName={(lineup) => (lineup.active ? undefined : 'is-inactive')}
          empty={<p className="empty">{t('settings.lineups.empty')}</p>}
        />
      )}
    </div>
  );
}

/** Name input + Create: creates the lineup (no lines) and opens it. */
function NewLineupForm({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateLineup();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(t('fields.REQUIRED'));
    if (trimmed.length > LINEUP_NAME_MAX) return setError(t('fields.TOO_LONG'));
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (lineup) => void navigate(`/settings/lineups/${lineup.id}`),
        onError: (err) => {
          submitting.current = false;
          setError(apiFieldErrors(t, err).name ?? apiErrorMessage(t, err));
        },
      },
    );
  };

  return (
    <form
      className="form lineup-new-form"
      onSubmit={onSubmit}
      noValidate
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <Field label={t('settings.lineups.newName')} error={error ?? undefined}>
        {(p) => (
          <input
            {...p}
            type="text"
            autoFocus
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        )}
      </Field>
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {t('settings.lineups.create')}
        </Button>
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}
