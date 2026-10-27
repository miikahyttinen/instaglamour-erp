import { http, HttpResponse } from 'msw';
import {
  IMPORT_DATA_TYPES,
  IMPORT_MAX_BYTES,
  type ImportCounts,
  type ImportDataType,
  type ImportResponse,
  type ImportSummary,
} from '../api/types';
import { importStore } from './importStore';
import { currentPartner, errorResponse, unauthenticated } from './util';

// Mock of "Data import" (UC-035). It does not touch the other mock stores: it only remembers
// which items it has "imported" (by natural key) so a re-import is skipped (BR-120), and keeps
// the import log (importStore.ts). Synthetic data only.

/** Mock AUTH_ALLOWED_DOMAIN (same as `dev:mock`). */
const MOCK_ALLOWED_DOMAIN = 'example.com';
/** Re-run rules: these types update an existing item when it differs (seed README). */
const UPDATABLE: readonly ImportDataType[] = ['people', 'lineupTemplates', 'settings'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every problem, path-prefixed (like the seed CLI). */
export function validateImportDocument(doc: unknown): string[] {
  if (!isObject(doc)) return ['document: must be a JSON object'];
  const errors: string[] = [];
  const partners = doc.partners;
  if (!Array.isArray(partners) || partners.length === 0) {
    errors.push('partners: required, at least one partner');
  } else {
    partners.forEach((p, i) => {
      const email = isObject(p) && typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
      if (!email) errors.push(`partners[${i}].email: required`);
      else if (!email.endsWith(`@${MOCK_ALLOWED_DOMAIN}`)) {
        errors.push(`partners[${i}].email: not in the allowed domain`);
      }
    });
  }
  for (const type of IMPORT_DATA_TYPES) {
    if (type === 'settings') continue;
    const value = doc[type];
    if (value !== undefined && !Array.isArray(value)) errors.push(`${type}: must be a list`);
  }
  // Gig → Event rename: the loader also accepts the legacy top-level `gigs` (contract), not both.
  if (doc.events !== undefined && doc.gigs !== undefined) {
    errors.push('events: use "events" or the legacy "gigs", not both');
  } else if (doc.gigs !== undefined && !Array.isArray(doc.gigs)) {
    errors.push('gigs: must be a list');
  }
  if (doc.settings !== undefined && !isObject(doc.settings)) errors.push('settings: must be an object');
  if (Array.isArray(doc.references)) {
    doc.references.forEach((r, i) => {
      if (isObject(r) && r.image !== undefined) {
        errors.push(`references[${i}].image: image paths are not allowed in an import`);
      }
    });
  }
  return errors;
}

function naturalKey(item: unknown): string {
  if (isObject(item)) {
    for (const field of ['email', 'name', 'title', 'eventName', 'quoteFi']) {
      if (typeof item[field] === 'string') return `${field}:${(item[field] as string).toLowerCase()}`;
    }
  }
  return JSON.stringify(item);
}

/** Counts per type; with `commit` the items are remembered (a real import). */
function load(doc: Record<string, unknown>, commit: boolean): ImportSummary {
  const summary = {} as ImportSummary;
  for (const type of IMPORT_DATA_TYPES) {
    const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };
    const known = importStore.items[type];
    const raw = type === 'events' && doc.events === undefined ? doc.gigs : doc[type];
    const entries: [string, string][] =
      type === 'settings'
        ? Object.entries(isObject(raw) ? raw : {}).map(([key, value]) => [key, JSON.stringify(value)])
        : (Array.isArray(raw) ? raw : []).map((item) => [naturalKey(item), JSON.stringify(item)]);
    const seen = new Map(known);
    for (const [key, json] of entries) {
      const previous = seen.get(key);
      if (previous === undefined) counts.created++;
      else if (previous !== json && UPDATABLE.includes(type)) counts.updated++;
      else {
        counts.skipped++;
        continue;
      }
      seen.set(key, json);
    }
    if (commit) importStore.items[type] = seen;
    summary[type] = counts;
  }
  return summary;
}

export const importHandlers = [
  http.post('/api/import', async ({ request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const filename = url.searchParams.get('filename');

    const text = await request.text();
    if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES) {
      return errorResponse(413, 'FILE_TOO_LARGE', 'Import file too large');
    }
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch {
      return errorResponse(400, 'VALIDATION_ERROR', 'Invalid import', undefined, { errors: ['not valid JSON'] });
    }
    const errors = validateImportDocument(doc);
    if (errors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Invalid import', undefined, { errors });
    }

    const summary = load(doc as Record<string, unknown>, !dryRun);
    if (!dryRun) {
      importStore.runs.unshift({
        id: `import-${importStore.nextId++}`,
        partnerId: me.id,
        at: new Date().toISOString(),
        filename: filename ? filename.slice(0, 200) : null,
        summary,
      });
      importStore.runs.splice(50);
    }
    const body: ImportResponse = { dryRun, summary };
    return HttpResponse.json(body);
  }),

  http.get('/api/import/runs', () => {
    if (!currentPartner()) return unauthenticated();
    return HttpResponse.json(importStore.runs);
  }),
];
