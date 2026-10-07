// Mock handlers for docs/api-contract.md → References (BR-108). Logic in referencesStore.ts.
// The public, token-scoped image route lives in publicOfferHandlers.ts.
import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
import type { ReferenceCreate, ReferenceUpdate } from '../api/types';
import { db } from './data';
import {
  createReference,
  detectReferenceImageType,
  listReferences,
  MAX_REFERENCE_IMAGE_BYTES,
  reorderReferences,
  toReference,
  type MockReference,
} from './referencesStore';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

const QUOTE_MAX = 5000;
const AUTHOR_MAX = 200;
type Fields = Record<string, FieldCode>;
type Patch = Partial<Pick<MockReference, 'quoteFi' | 'quoteEn' | 'author' | 'active'>>;

const findRef = (id: unknown) => db.references.references.find((r) => r.id === id);
const notFound = () => errorResponse(404, 'NOT_FOUND', 'Reference not found');
const json = (ref: MockReference, status = 200) =>
  HttpResponse.json(toReference(db.references, ref), { status });

async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}

function parseBody(body: Partial<ReferenceUpdate>, create: boolean): { patch: Patch; fields: Fields } {
  const fields: Fields = {};
  const patch: Patch = {};
  const required = (key: 'quoteFi' | 'author', max: number) => {
    const v = body[key];
    if (v === undefined) {
      if (create) fields[key] = 'REQUIRED';
      return;
    }
    if (typeof v !== 'string') fields[key] = 'INVALID_VALUE';
    else if (!v.trim()) fields[key] = 'REQUIRED';
    else if (v.trim().length > max) fields[key] = 'TOO_LONG';
    else patch[key] = v.trim();
  };
  required('quoteFi', QUOTE_MAX);
  required('author', AUTHOR_MAX);
  if (body.quoteEn !== undefined) {
    const v = body.quoteEn;
    if (v !== null && typeof v !== 'string') fields.quoteEn = 'INVALID_VALUE';
    else if (v && v.trim().length > QUOTE_MAX) fields.quoteEn = 'TOO_LONG';
    else patch.quoteEn = v?.trim() || null;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') fields.active = 'INVALID_VALUE';
    else patch.active = body.active;
  }
  return { patch, fields };
}

export const referencesHandlers = [
  http.get('/api/references', () => {
    if (!currentPartner()) return unauthenticated();
    return HttpResponse.json(listReferences(db.references));
  }),

  http.post('/api/references/reorder', async ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const body = await readJson<{ ids: string[] }>(request);
    const ids = Array.isArray(body.ids) && body.ids.every((id) => typeof id === 'string') ? body.ids : null;
    if (!ids || !reorderReferences(db.references, ids)) return validationError({ ids: 'INVALID_VALUE' });
    return HttpResponse.json(listReferences(db.references));
  }),

  http.post('/api/references', async ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const { patch, fields } = parseBody(await readJson<ReferenceCreate>(request), true);
    if (Object.keys(fields).length > 0) return validationError(fields);
    const ref = createReference(db.references, {
      quoteFi: patch.quoteFi!,
      quoteEn: patch.quoteEn ?? null,
      author: patch.author!,
      active: patch.active ?? true,
    });
    return json(ref, 201);
  }),

  http.patch('/api/references/:id', async ({ params, request }) => {
    if (!currentPartner()) return unauthenticated();
    const { patch, fields } = parseBody(await readJson<ReferenceUpdate>(request), false);
    if (Object.keys(fields).length > 0) return validationError(fields);
    const ref = findRef(params.id);
    if (!ref) return notFound();
    Object.assign(ref, patch);
    return json(ref);
  }),

  http.put('/api/references/:id/image', async ({ params, request }) => {
    if (!currentPartner()) return unauthenticated();
    const ref = findRef(params.id);
    if (!ref) return notFound();
    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get('file');
    } catch {
      file = null;
    }
    if (!file || typeof file === 'string') return validationError({ file: 'REQUIRED' });
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) return errorResponse(413, 'FILE_TOO_LARGE', 'Too large');
    const contentType = detectReferenceImageType(file);
    if (!contentType) return errorResponse(415, 'UNSUPPORTED_FILE_TYPE', 'Unsupported type');
    ref.image = { contentType, content: file };
    return json(ref);
  }),

  http.delete('/api/references/:id/image', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const ref = findRef(params.id);
    if (!ref) return notFound();
    ref.image = null;
    return json(ref);
  }),

  http.get('/api/references/:id/image', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const ref = findRef(params.id);
    if (!ref?.image) return notFound();
    return new HttpResponse(ref.image.content, { headers: { 'Content-Type': ref.image.contentType } });
  }),

  http.delete('/api/references/:id', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const index = db.references.references.findIndex((r) => r.id === params.id);
    if (index < 0) return notFound();
    db.references.references.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
