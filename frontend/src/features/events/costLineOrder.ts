import { isMusicianRole } from '../../api/enums';
import type { CostLine } from '../../api/types';

/**
 * Musician-role lines first, then all other lines (TASK-181); within each group the API order is
 * kept. A saved draft musician line therefore moves up into the musician group.
 */
export function orderCostLines(lines: readonly CostLine[]): CostLine[] {
  return [...lines.filter((l) => isMusicianRole(l.type)), ...lines.filter((l) => !isMusicianRole(l.type))];
}
