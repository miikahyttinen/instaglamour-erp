import type { TFunction } from 'i18next';
import type { Language } from '../../api/enums';
import type { ReferenceLineup } from '../../api/types';
import { formatMoney } from '../../lib/format';
import { lineupTotalCents } from '../settings/lineupLines';

/** Lineup select value for "Custom lineup" (a typed name, no lineup). */
export const CUSTOM_LINEUP = 'custom';

/** Short preview under the lineup select: lines count and total default amount. */
export function lineupPreview(t: TFunction, lang: Language, lineup: ReferenceLineup | undefined): string | undefined {
  if (!lineup) return undefined;
  return t('eventForm.lineupPreview', {
    count: lineup.lines.length,
    total: formatMoney(lineupTotalCents(lineup.lines), lang),
  });
}
