import type { TFunction } from 'i18next';
import type { CostType } from '../../api/enums';
import type { LineupLine, LineupTemplate, ReferenceData } from '../../api/types';
import { costTypeLabel } from '../../i18n/labels';

/** Contract limits of a lineup. */
export const LINEUP_NAME_MAX = 500;
export const LINEUP_DESCRIPTION_MAX = 500;
export const LINEUP_LINES_MAX = 100;

export const lineNeedsDescription = (type: CostType) => type === 'OTHER' || type === 'OTHER_ROLE';

export const lineupTotalCents = (lines: readonly LineupLine[]) =>
  lines.reduce((sum, line) => sum + line.defaultCents, 0);

/** "Bass" / "Other cost (Description)". */
export function lineupLineLabel(t: TFunction, line: Pick<LineupLine, 'type' | 'description'>): string {
  const type = costTypeLabel(t, line.type);
  return line.description ? `${type} (${line.description})` : type;
}

/** The cost type select groups, the same as on the gig cost table. */
export function costTypeGroups(
  t: TFunction,
  reference: ReferenceData | undefined,
): [label: string, codes: readonly CostType[]][] {
  return [
    [t('costs.groupMusician'), reference?.costTypes.musicianRoles ?? []],
    [t('costs.groupInternal'), reference?.costTypes.internalRoles ?? []],
    [t('costs.groupExpense'), reference?.costTypes.expenseCategories ?? []],
  ];
}

/** Active first, then by name (as the API; kept here so a just-changed row stays in place). */
export function sortLineups(lineups: readonly LineupTemplate[]): LineupTemplate[] {
  return [...lineups].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

