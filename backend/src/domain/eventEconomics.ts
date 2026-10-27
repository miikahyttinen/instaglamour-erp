/**
 * Event economics (BR-001…BR-006), "played" (BR-010), "not fully staffed" (BR-023)
 * and the year's event sums (BR-082). Pure functions — no database access.
 */
import { isMusicianRole } from './enums.js';

export interface EconomicsLine {
  type: string;
  personId: string | null;
  budgetedCents: number;
  actualCents: number | null;
  paidAt: Date | null;
}

export interface EconomicsEvent {
  priceCents: number;
  additionalSalesCents: number;
  costLines: readonly EconomicsLine[];
}

export interface EventEconomics {
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

export function eventEconomics(event: EconomicsEvent): EventEconomics {
  const totalPriceCents = event.priceCents + event.additionalSalesCents; // BR-006
  let budgetedCostsCents = 0;
  let actualCostsCents = 0;
  for (const line of event.costLines) {
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

/** BR-010: a SOLD event whose start date (YYYY-MM-DD) is before today (YYYY-MM-DD). */
export function isPlayed(status: string, startDateIso: string, todayIsoDate: string): boolean {
  return status === 'SOLD' && startDateIso < todayIsoDate;
}

export interface YearEventSummary {
  eventCount: number;
  cancelledCount: number;
  soldEventsSumCents: number;
  budgetedCostsCents: number;
  actualCostsCents: number;
  marginBudgetCents: number;
  marginActualCents: number;
}

/**
 * The `events` object of the year page and `yearSummary` of the event list.
 * Pass the non-deleted events of the year (all statuses): cancelled events count in the sums with their
 * adjusted price (BR-013, BR-082) but not in `eventCount`.
 */
export function yearEventSummary(events: readonly (EconomicsEvent & { status: string })[]): YearEventSummary {
  const summary: YearEventSummary = {
    eventCount: 0,
    cancelledCount: 0,
    soldEventsSumCents: 0,
    budgetedCostsCents: 0,
    actualCostsCents: 0,
    marginBudgetCents: 0,
    marginActualCents: 0,
  };
  for (const event of events) {
    if (event.status === 'CANCELLED') summary.cancelledCount += 1;
    else summary.eventCount += 1;
    const e = eventEconomics(event);
    summary.soldEventsSumCents += e.totalPriceCents;
    summary.budgetedCostsCents += e.budgetedCostsCents;
    summary.actualCostsCents += e.actualCostsCents;
  }
  summary.marginBudgetCents = summary.soldEventsSumCents - summary.budgetedCostsCents;
  summary.marginActualCents = summary.soldEventsSumCents - summary.actualCostsCents;
  return summary;
}
