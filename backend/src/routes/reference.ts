/** GET /api/reference (docs/api-contract.md "Reference data"). */
import type { FastifyInstance } from 'fastify';
import { loadActiveBudgetCategories, toBudgetCategoryDto } from '../budget/store.js';
import { EXPENSE_CATEGORIES, INTERNAL_ROLES, LOGISTICS, MUSICIAN_ROLES, SETTING_KEYS, TECHNICAL_SETUPS } from '../domain/enums.js';
import { toLineupLineDto } from '../lineups/store.js';
import { toPartnerDto } from '../serializers.js';
import type { AppDeps } from '../app.js';
import type { Db } from '../db.js';

export interface FeeSettings {
  loadInDeductionCents: number;
}

/** Current seeded fee settings; a missing key counts as 0. */
export async function loadFeeSettings(db: Db): Promise<FeeSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(SETTING_KEYS) } } });
  const value = (key: string) => rows.find((r) => r.key === key)?.valueCents ?? 0;
  return {
    loadInDeductionCents: value(SETTING_KEYS.loadInDeduction),
  };
}

export function referenceRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/api/reference', async () => {
    const [partners, templates, settings, categories] = await Promise.all([
      db.partner.findMany({ include: { person: true }, orderBy: { person: { name: 'asc' } } }),
      // Only active lineups can be picked for a new event.
      db.lineupTemplate.findMany({
        where: { active: true },
        include: { lines: { orderBy: { position: 'asc' } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      loadFeeSettings(db),
      loadActiveBudgetCategories(db),
    ]);
    return {
      partners: partners.map((p) => toPartnerDto(p)),
      lineupTemplates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        lines: t.lines.map(toLineupLineDto),
      })),
      settings,
      costTypes: {
        musicianRoles: [...MUSICIAN_ROLES],
        internalRoles: [...INTERNAL_ROLES],
        expenseCategories: [...EXPENSE_CATEGORIES],
      },
      technicalSetups: [...TECHNICAL_SETUPS],
      logistics: [...LOGISTICS],
      budgetCategories: categories.map(toBudgetCategoryDto),
    };
  });
}
