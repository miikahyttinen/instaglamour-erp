/**
 * Year page (docs/api-contract.md "Year page"; UC-022; BR-063, BR-080…BR-083).
 * Every figure comes from the same function as its own page, so the numbers always match:
 * events = `GET /api/events` yearSummary, hours = `GET /api/hours/totals`, budget = `GET /api/budget` totals.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { loadBudget } from '../budget/store.js';
import { dateFromIso, todayIso } from '../domain/dates.js';
import { parseInput } from '../http/errors.js';
import { yearString } from '../events/schemas.js';
import { toEventSummaryDto } from '../events/serialize.js';
import { eventSummaryInclude, loadYearEventSummary } from '../events/store.js';
import { loadHoursTotals } from '../hours/store.js';

export const UPCOMING_EVENT_COUNT = 5;

const yearParams = z.object({ year: yearString });

export function yearRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get<{ Params: { year: string } }>('/api/years/:year', async (request) => {
    const { year } = parseInput(yearParams, request.params);
    const today = todayIso();

    const [events, hours, budget, upcoming] = await Promise.all([
      loadYearEventSummary(db, year),
      loadHoursTotals(db, year),
      loadBudget(db, year),
      // Upcoming always relates to today, whatever the selected year (UC-022 A1).
      db.event.findMany({
        where: { status: 'SOLD', deletedAt: null, startDate: { gte: dateFromIso(today) } },
        include: eventSummaryInclude,
        orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: UPCOMING_EVENT_COUNT,
      }),
    ]);

    const { budgetExpenseCents, budgetIncomeCents, actualExpenseCents, actualIncomeCents } = budget.totals;
    return {
      year,
      events,
      hours: {
        partners: hours.partners.map((p) => ({ partnerId: p.partnerId, total: p.total })),
        grandTotal: hours.grandTotal,
      },
      budget: { budgetExpenseCents, budgetIncomeCents, actualExpenseCents, actualIncomeCents },
      // BR-063: sold events sum − actual event costs + actual fixed income − actual fixed expense.
      yearResultCents: events.soldEventsSumCents - events.actualCostsCents + actualIncomeCents - actualExpenseCents,
      upcomingEvents: upcoming.map((g) => toEventSummaryDto(g, today)),
    };
  });
}
