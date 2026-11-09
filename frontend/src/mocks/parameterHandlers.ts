// Mock handlers for docs/api-contract.md → "Settings: Parameters tab". Like the backend, the
// parameters are a registry in code; only their values are stored. Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import type { Parameter, ParameterType } from '../api/types';
import { db } from './data';
import { parameterChanges } from './parameterStore';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

/** MONEY = cents, 0…100 000 000. */
const MONEY_MAX = 100_000_000;

interface RegistryEntry {
  key: string;
  type: ParameterType;
  get: () => number | null;
  set: (value: number) => void;
}

/** Registry order = list order. Adding a parameter = one entry here. */
const REGISTRY: RegistryEntry[] = [
  {
    key: 'fees.load_in_deduction',
    type: 'MONEY',
    // Read by the cost line and freelancer PO mocks, and listed in /api/reference.settings.
    get: () => db.reference.settings.loadInDeductionCents,
    set: (value) => {
      db.reference.settings.loadInDeductionCents = value;
    },
  },
];

function toParameter(entry: RegistryEntry): Parameter {
  const change = parameterChanges.get(entry.key);
  return {
    key: entry.key,
    type: entry.type,
    value: entry.get(),
    updatedAt: change?.updatedAt ?? null,
    updatedBy: change?.updatedBy ?? null,
  };
}

export const parameterHandlers = [
  http.get('/api/settings/parameters', () => {
    if (!currentPartner()) return unauthenticated();
    return HttpResponse.json(REGISTRY.map(toParameter));
  }),

  http.patch('/api/settings/parameters/:key', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const entry = REGISTRY.find((e) => e.key === params.key);
    if (!entry) return errorResponse(404, 'NOT_FOUND', 'Unknown parameter');
    const body = (await request.json().catch(() => null)) as { value?: unknown } | null;
    const value = body?.value;
    if (typeof value !== 'number' || !Number.isInteger(value)) return validationError({ value: 'INVALID_VALUE' });
    if (value < 0) return validationError({ value: 'NEGATIVE_AMOUNT' });
    if (value > MONEY_MAX) return validationError({ value: 'INVALID_VALUE' });
    entry.set(value);
    parameterChanges.set(entry.key, { updatedAt: new Date().toISOString(), updatedBy: me.id });
    return HttpResponse.json(toParameter(entry));
  }),
];
