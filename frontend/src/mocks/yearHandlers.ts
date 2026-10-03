// Mock for the Year page (UC-022): GET /api/years/{year}.
// Gig figures and upcoming gigs come from the shared mock gig store (db.gigs), so they match
// the gig list. Hours and budget have their own small synthetic figures here (BR-090: round
// dummy amounts) until the hours/budget mocks exist; only the current year has them.
import { http, HttpResponse } from 'msw';
import type { BudgetAmounts, GigSummary, YearPage } from '../api/types';
import { todayIso } from '../lib/format';
import { db } from './data';
import { toSummary, yearTotals, type GigState } from './gigStore';
import { errorResponse, unauthenticated } from './util';

/** Next 5 non-deleted SOLD gigs with startDate ≥ today, regardless of year (contract). */
export function upcomingGigs(state: GigState, today = todayIso()): GigSummary[] {
  return state.gigs
    .filter((g) => g.status === 'SOLD' && g.deletedAt === null && g.startDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5)
    .map((g) => toSummary(state, g, today));
}

const EMPTY_BUDGET: BudgetAmounts = {
  budgetExpenseCents: 0,
  budgetIncomeCents: 0,
  actualExpenseCents: 0,
  actualIncomeCents: 0,
};

/** Synthetic hours and fixed budget totals: only the current calendar year has data. */
function hoursAndBudget(year: number): Pick<YearPage, 'hours' | 'budget'> {
  if (year !== new Date().getFullYear()) {
    return { hours: { partners: [], grandTotal: 0 }, budget: EMPTY_BUDGET };
  }
  const [a, b, c] = db.partners;
  const partners = [
    { partnerId: a?.id, total: 12.5 },
    { partnerId: b?.id, total: 8 },
    { partnerId: c?.id, total: 0 },
  ].filter((p): p is { partnerId: string; total: number } => Boolean(p.partnerId));
  return {
    hours: { partners, grandTotal: partners.reduce((s, p) => s + p.total, 0) },
    budget: {
      budgetExpenseCents: 100000,
      budgetIncomeCents: 20000,
      actualExpenseCents: 70000,
      actualIncomeCents: 10000,
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
