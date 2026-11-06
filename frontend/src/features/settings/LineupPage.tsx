import { Trash2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import type { LineupLine, LineupTemplate } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { FieldList } from '../../components/FieldList';
import { InlineSwitch, InlineText } from '../../components/inline';
import { Notice } from '../../components/Notice';
import { SectionLabel } from '../../components/SectionLabel';
import { apiErrorMessage } from '../../i18n/labels';
import { LineupLinesTable, type SaveLines } from './LineupLinesTable';
import { LINEUP_NAME_MAX } from './lineupLines';
import { useDeleteLineup, useLineups, useUpdateLineup } from './queries';

/** Settings → one lineup: name, active switch, lines, delete (only when no gig uses it). */
export function LineupPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const list = useLineups();

  const backLink = (
    <p className="back-link">
      <Link to="/settings/lineups">{t('settings.lineups.back')}</Link>
    </p>
  );

  if (list.isPending) {
    return (
      <div className="lineup-page">
        {backLink}
        <p role="status" className="meta">
          {t('app.loading')}
        </p>
      </div>
    );
  }
  if (list.isError) {
    return (
      <div className="lineup-page">
        {backLink}
        <Notice tone="danger" role="alert" className="settings-load-error">
          <p>{apiErrorMessage(t, list.error)}</p>
          <Button size="sm" onClick={() => void list.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      </div>
    );
  }
  const lineup = list.data.find((l) => l.id === id);
  if (!lineup) {
    return (
      <div className="lineup-page">
        {backLink}
        <Notice tone="danger" role="alert">
          <p>{t('settings.lineups.notFound')}</p>
        </Notice>
      </div>
    );
  }
  return (
    <div className="lineup-page">
      {backLink}
      <LineupEditor key={lineup.id} lineup={lineup} />
    </div>
  );
}

function LineupEditor({ lineup }: { lineup: LineupTemplate }) {
  const { t } = useTranslation();
  const update = useUpdateLineup();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Line changes are sent one after another, each built on the newest saved list, so quick edits
  // (blur one field, then another) never overwrite each other.
  const latestLines = useRef<LineupLine[]>(lineup.lines);
  useLayoutEffect(() => {
    latestLines.current = lineup.lines;
  }, [lineup.lines]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saveLines: SaveLines = (change) => {
    const run = queue.current.then(async () => {
      const result = await update.mutateAsync({ id: lineup.id, body: { lines: change(latestLines.current) } });
      latestLines.current = result.lines;
      return result;
    });
    // A failed save doesn't block the next ones.
    queue.current = run.catch(() => undefined);
    return run;
  };

  return (
    <>
      <FieldList className="lineup-fields">
        <InlineText
          label={t('settings.lineups.name')}
          required
          maxLength={LINEUP_NAME_MAX}
          value={lineup.name}
          field="name"
          onSave={(name) => update.mutateAsync({ id: lineup.id, body: { name } })}
        />
        <InlineSwitch
          label={t('settings.lineups.activeSwitch')}
          hint={t('settings.lineups.activeHint')}
          value={lineup.active}
          field="active"
          onSave={(active) => update.mutateAsync({ id: lineup.id, body: { active } })}
        />
      </FieldList>
      <p className="meta lineup-gig-count">{t('settings.lineups.gigCount', { count: lineup.eventCount })}</p>

      <section className="lineup-section" aria-labelledby="lineup-lines-title">
        <SectionLabel id="lineup-lines-title">{t('settings.lineups.linesTitle')}</SectionLabel>
        <LineupLinesTable lines={lineup.lines} saveLines={saveLines} />
      </section>

      {lineup.eventCount === 0 && (
        <div className="lineup-delete">
          <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>
            {t('settings.lineups.delete')}
          </Button>
        </div>
      )}
      {confirmDelete && <DeleteDialog lineup={lineup} onClose={() => setConfirmDelete(false)} />}
    </>
  );
}

/** Delete with confirmation. Gigs linked meanwhile → 409 LINEUP_IN_USE shown in the dialog. */
function DeleteDialog({ lineup, onClose }: { lineup: LineupTemplate; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const remove = useDeleteLineup();
  const inUse = remove.error instanceof ApiError && remove.error.code === 'LINEUP_IN_USE';
  return (
    <Dialog title={t('settings.lineups.deleteTitle')} onClose={onClose}>
      <p>{t('settings.lineups.deleteConfirm', { name: lineup.name })}</p>
      {remove.isError && (
        <Notice tone="danger" role="alert">
          <p>{inUse ? t('settings.lineups.deleteInUse') : apiErrorMessage(t, remove.error)}</p>
        </Notice>
      )}
      <div className="form-actions">
        <Button
          variant="danger"
          icon={Trash2}
          disabled={remove.isPending || inUse}
          onClick={() =>
            remove.mutate(lineup.id, {
              onSuccess: () =>
                void navigate('/settings/lineups', { state: { deletedLineup: lineup.name } }),
            })
          }
        >
          {t('settings.lineups.delete')}
        </Button>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Dialog>
  );
}
