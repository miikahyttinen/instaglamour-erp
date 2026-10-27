/** Cost lines a new event starts with (BR-020, BR-021). */
import type { CostType } from '../generated/prisma/enums.js';
import { isMusicianRole } from './enums.js';

export interface NewCostLine {
  type: CostType;
  personId: string | null;
  budgetedCents: number;
  joinsLoadIn: boolean | null;
}

export interface DefaultCostLineInput {
  templateRoles: ReadonlyArray<{ role: CostType; defaultFeeCents: number }>;
  sellerPersonId: string;
  producerPersonId: string;
  fees: { officeDefaultCents: number; salesDefaultCents: number; productionDefaultCents: number };
}

export function defaultCostLines(input: DefaultCostLineInput): NewCostLine[] {
  const fromTemplate: NewCostLine[] = input.templateRoles.map((r) => ({
    type: r.role,
    personId: null,
    budgetedCents: r.defaultFeeCents,
    joinsLoadIn: isMusicianRole(r.role) ? true : null,
  }));
  return [
    ...fromTemplate,
    { type: 'OFFICE', personId: null, budgetedCents: input.fees.officeDefaultCents, joinsLoadIn: null },
    { type: 'SALES', personId: input.sellerPersonId, budgetedCents: input.fees.salesDefaultCents, joinsLoadIn: null },
    {
      type: 'PRODUCTION',
      personId: input.producerPersonId,
      budgetedCents: input.fees.productionDefaultCents,
      joinsLoadIn: null,
    },
  ];
}
