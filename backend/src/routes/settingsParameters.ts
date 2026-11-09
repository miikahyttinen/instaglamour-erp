/** Settings → Parameters (docs/api-contract.md "Settings: Parameters tab", TASK-057). Any signed-in partner. */
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { notFound, parseInput } from '../http/errors.js';
import { findParameter, PARAMETERS, storedValue, toParameterDto, valueBodySchema } from '../settings/parameters.js';

type KeyParams = { Params: { key: string } };

export function settingsParameterRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/api/settings/parameters', async () => {
    const rows = await db.setting.findMany({ where: { key: { in: PARAMETERS.map((p) => p.key) } } });
    return PARAMETERS.map((def) => toParameterDto(def, rows.find((r) => r.key === def.key) ?? null));
  });

  app.patch<KeyParams>('/api/settings/parameters/:key', async (request) => {
    const partner = request.requirePartner();
    const def = findParameter(request.params.key);
    if (!def) throw notFound('Parameter not found');
    const { value } = parseInput(valueBodySchema(def), request.body);
    const data = { ...storedValue(def, value), updatedById: partner.id };
    // Upsert on the unique key (safe under concurrent first saves). Existing cost lines are not
    // touched; later load-in switches and PO deductions read the new value (BR-026).
    const row = await db.setting.upsert({ where: { key: def.key }, create: { key: def.key, ...data }, update: data });
    return toParameterDto(def, row);
  });
}
