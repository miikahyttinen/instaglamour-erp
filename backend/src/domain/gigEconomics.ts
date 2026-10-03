/**
 * Gig economics (BR-001…BR-006), "played" (BR-010), "not fully staffed" (BR-023)
 * and the year's gig sums (BR-082). Pure functions — no database access.
 */
import { isMusicianRole } from './enums.js';

export interface EconomicsLine {
  type: string;
  personId: string | null;
  budgetedCents: number;
  actualCents: number | null;
  paidAt: Date | null;
}

export interface EconomicsGig {
  priceCents: number;
  additionalSalesCents: number;
  costLines: readonly EconomicsLine[];
}

export interface GigEconomics {
  totalPriceCents: number;
  budgetedCostsCents: number;
  actualCostsCents: number;
  marginBudgetCents: number;
  marginActualCents: number;
  marginBudgetPct: number | null;
  marginActualPct: number | null;
}

/** BR-004: margin / total price as a percentage with 1 decimal; null when total price is 0. */
export function marginPct(marginCents: number, totalPriceCents: number): number | null {
  if (totalPriceCents === 0) return null;
  const pct = Math.round((marginCents * 1000) / totalPriceCents) / 10;
  return pct === 0 ? 0 : pct; // never -0
}

export function gigEconomics(gig: EconomicsGig): GigEconomics {
  const totalPriceCents = gig.priceCents + gig.additionalSalesCents; // BR-006
  let budgetedCostsCents = 0;
  let actualCostsCents = 0;
  for (const line of gig.costLines) {
    budgetedCostsCents += line.budgetedCents; // BR-001
    if (line.paidAt !== null) actualCostsCents += line.actualCents ?? 0; // BR-002
  }
  const marginBudgetCents = totalPriceCents - budgetedCostsCents; // BR-003
  const marginActualCents = totalPriceCents - actualCostsCents;
  return {
    totalPriceCents,
    budgetedCostsCents,
    actualCostsCents,
    marginBudgetCents,
    marginActualCents,
    marginBudgetPct: marginPct(marginBudgetCents, totalPriceCents),
    marginActualPct: marginPct(marginActualCents, totalPriceCents),
  };
}

/** BR-023: some musician-role line has no person. */
export function isNotFullyStaffed(lines: readonly { type: string; personId: string | null }[]): boolean {
  return lines.some((l) => isMusicianRole(l.type) && l.personId === null);
}

/** BR-010: a SOLD gig whose start date (YYYY-MM-DD) is before today (YYYY-MM-DD). */
export function isPlayed(status: string, startDateIso: string, todayIsoDate: string): boolean {
  return status === 'SOLD' && startDateIso < todayIsoDate;
}

export interface YearGigSummary {
  gigCount: number;
  cancelledCount: number;
  soldGigsSumCents: number;
  budgetedCostsCents: number;
  actualCostsCents: number;
  marginBudgetCents: number;
  marginActualCents: number;
}

/**
 * The `gigs` object of the year page and `yearSummary` of the gig list.
 * Pass the non-deleted gigs of the year (all statuses): cancelled gigs count in the sums with their
 * adjusted price (BR-013, BR-082) but not in `gigCount`.
 */
export function yearGigSummary(gigs: readonly (EconomicsGig & { status: string })[]): YearGigSummary {
  const summary: YearGigSummary = {
    gigCount: 0,
    cancelledCount: 0,
    soldGigsSumCents: 0,
    budgetedCostsCents: 0,
    actualCostsCents: 0,
    marginBudgetCents: 0,
    marginActualCents: 0,
  };
  for (const gig of gigs) {
    if (gig.status === 'CANCELLED') summary.cancelledCount += 1;
    else summary.gigCount += 1;
    const e = gigEconomics(gig);
    summary.soldGigsSumCents += e.totalPriceCents;
    summary.budgetedCostsCents += e.budgetedCostsCents;
    summary.actualCostsCents += e.actualCostsCents;
  }
  summary.marginBudgetCents = summary.soldGigsSumCents - summary.budgetedCostsCents;
  summary.marginActualCents = summary.soldGigsSumCents - summary.actualCostsCents;
  return summary;
}
