/** Cost lines a new event starts with (BR-020, BR-021 as revised 2026-11-06). */
import type { CostType } from '../generated/prisma/enums.js';
import { isMusicianRole } from './enums.js';

export interface NewCostLine {
  type: CostType;
  personId: string | null;
  description: string | null;
  budgetedCents: number;
  joinsLoadIn: boolean | null;
}

/** One line of a lineup (api-contract `LineupLine`). */
export interface LineupLineInput {
  type: CostType;
  description: string | null;
  defaultCents: number;
}

export interface DefaultCostLineInput {
  /** The lineup's lines in order, or null for a custom lineup (no lineup picked). */
  lineupLines: ReadonlyArray<LineupLineInput> | null;
  sellerPersonId: string;
  producerPersonId: string;
}

/**
 * With a lineup: one line per lineup line, in order (amount and description copied; musician roles
 * join the load-in; SALES = seller, PRODUCTION = producer, others no person), then a SALES (seller,
 * 0) and/or PRODUCTION (producer, 0) line if the lineup has none. No automatic OFFICE line.
 * Without a lineup: OFFICE, SALES (seller) and PRODUCTION (producer), all 0.
 */
export function defaultCostLines(input: DefaultCostLineInput): NewCostLine[] {
  const sales = (budgetedCents: number, description: string | null = null): NewCostLine => ({
    type: 'SALES',
    personId: input.sellerPersonId,
    description,
    budgetedCents,
    joinsLoadIn: null,
  });
  const production = (budgetedCents: number, description: string | null = null): NewCostLine => ({
    type: 'PRODUCTION',
    personId: input.producerPersonId,
    description,
    budgetedCents,
    joinsLoadIn: null,
  });

  if (input.lineupLines === null) {
    return [{ type: 'OFFICE', personId: null, description: null, budgetedCents: 0, joinsLoadIn: null }, sales(0), production(0)];
  }

  const lines: NewCostLine[] = input.lineupLines.map((l) => {
    if (l.type === 'SALES') return sales(l.defaultCents, l.description);
    if (l.type === 'PRODUCTION') return production(l.defaultCents, l.description);
    return {
      type: l.type,
      personId: null,
      description: l.description,
      budgetedCents: l.defaultCents,
      joinsLoadIn: isMusicianRole(l.type) ? true : null,
    };
  });
  if (!lines.some((l) => l.type === 'SALES')) lines.push(sales(0));
  if (!lines.some((l) => l.type === 'PRODUCTION')) lines.push(production(0));
  return lines;
}
