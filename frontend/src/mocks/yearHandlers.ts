// Mock for the Year page (UC-022): GET /api/years/{year}.
// Every figure comes from the shared mock stores (db.gigs, db.hours, db.budget), so it matches
// the gig list, hours totals and budget pages. Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import type { GigSummary, YearPage } from '../api/types';
import { todayIso } from '../lib/format';
import { budgetOfYear } from './budgetStore';
import { db } from './data';
import { toSummary, yearTotals, type GigState } from './gigStore';
import { hoursTotals } from './hoursStore';
import { errorResponse, unauthenticated } from './util';

/** Next 5 non-deleted SOLD gigs with startDate ≥ today, regardless of year (contract). */
export function upcomingGigs(state: GigState, today = todayIso()): GigSummary[] {
  return state.gigs
    .filter((g) => g.status === 'SOLD' && g.deletedAt === null && g.startDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5)
    .map((g) => toSummary(state, g, today));
}

/** Hours and budget totals from the hours and budget mock stores, as on their own pages. */
function hoursAndBudget(year: number): Pick<YearPage, 'hours' | 'budget'> {
  const hours = hoursTotals(db.hours, db.partners, year);
  const { totals } = budgetOfYear(db.budget, db.reference.budgetCategories, year);
  return {
    hours: {
      partners: hours.partners.map(({ partnerId, total }) => ({ partnerId, total })),
      grandTotal: hours.grandTotal,
    },
    budget: {
      budgetExpenseCents: totals.budgetExpenseCents,
      budgetIncomeCents: totals.budgetIncomeCents,
      actualExpenseCents: totals.actualExpenseCents,
      actualIncomeCents: totals.actualIncomeCents,
    },
  };
}

export function mockYearPage(year: number, today = todayIso()): YearPage {
  const gigs = yearTotals(db.gigs, year);
  const { hours, budget } = hoursAndBudget(year);
  return {
    year,
    gigs,
    hours,
    budget,
    // BR-063
    yearResultCents:
      gigs.soldGigsSumCents - gigs.actualCostsCents + budget.actualIncomeCents - budget.actualExpenseCents,
    upcomingGigs: upcomingGigs(db.gigs, today),
  };
}

export const yearHandlers = [
  http.get('/api/years/:year', ({ params }) => {
    if (!db.sessionPartnerId) return unauthenticated();
    const year = Number(params.year);
    if (!Number.isInteger(year)) return errorResponse(404, 'NOT_FOUND', 'Unknown year');
    return HttpResponse.json(mockYearPage(year));
  }),
];
