import { useTranslation } from 'react-i18next';
import type { ReferenceLineup } from '../../api/types';
import { CUSTOM_LINEUP } from './lineupChoice';

/** Options of the gig lineup select: "Choose", the active lineups (reference), "Custom lineup". */
export function LineupOptions({ lineups }: { lineups: readonly ReferenceLineup[] | undefined }) {
  const { t } = useTranslation();
  return (
    <>
      <option value="">{t('eventForm.chooseLineup')}</option>
      {lineups?.map((lineup) => (
        <option key={lineup.id} value={lineup.id}>
          {lineup.name}
        </option>
      ))}
      <option value={CUSTOM_LINEUP}>{t('eventForm.customLineup')}</option>
    </>
  );
}
