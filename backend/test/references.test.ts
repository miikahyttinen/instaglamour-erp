/**
 * Reference (testimonial) endpoints (BR-108): CRUD, reorder, photo upload/replace/remove, auth.
 * Synthetic quotes only; photos are tiny fake files in a temporary UPLOAD_DIR.
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_REFERENCE_IMAGE_BYTES } from '../src/references/store.js';
import { detectImageType } from '../src/fileStore/uploadDir.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, startSession, UNKNOWN_ID, type Json, type Session } from './gigFixtures.js';
import { createReference, JPG, PDF, PNG, SVG, uploadImage, WEBP } from './referenceFixtures.js';

let s: Session;
let uploadDir: string;

beforeEach(async () => {
  await resetDb();
  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'instaglamour-test-references-'));
  s = await startSession({ config: { uploadDir } });
});
afterEach(async () => {
  await s.app.close();
  await rm(uploadDir, { recursive: true, force: true });
});
afterAll(closeTestDb);

const files = async () => (await readdir(uploadDir).catch(() => [])).sort();
const list = async (): Promise<Json[]> => (await call(s, 'GET', '/api/references')).json();

describe('auth', () => {
  it('every reference endpoint needs a session', async () => {
    const ref = await createReference(s);
    const requests: [string, string][] = [
      ['GET', '/api/references'],
      ['POST', '/api/references'],
      ['PATCH', `/api/references/${ref.id}`],
      ['POST', '/api/references/reorder'],
      ['PUT', `/api/references/${ref.id}/image`],
      ['DELETE', `/api/references/${ref.id}/image`],
      ['GET', `/api/references/${ref.id}/image`],
      ['DELETE', `/api/references/${ref.id}`],
    ];
    for (const [method, url] of requests) {
      const res = await s.app.inject({ method: method as 'GET', url });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHENTICATED');
    }
    expect(await testDb().reference.count()).toBe(1);
  });
});

describe('POST /api/references', () => {
  it('creates a Reference appended last; active defaults to true', async () => {
    const res = await call(s, 'POST', '/api/references', {
      quoteFi: '  Lainaus 1\nRivi 2  ',
      quoteEn: 'Quote 1',
      author: ' — Person 1, Client A Oy ',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toStrictEqual({
      id: expect.any(String),
      quoteFi: 'Lainaus 1\nRivi 2',
      quoteEn: 'Quote 1',
      author: '— Person 1, Client A Oy',
      hasImage: false,
      sortOrder: 0,
      active: true,
    });
    const second = await createReference(s, { quoteFi: 'Lainaus 2', active: false });
    expect(second).toMatchObject({ sortOrder: 1, active: false, quoteEn: null });
  });

  it('appends after the current last one, also after reorders and deletes', async () => {
    const a = await createReference(s);
    const b = await createReference(s);
    await call(s, 'POST', '/api/references/reorder', { ids: [b.id, a.id] });
    await call(s, 'DELETE', `/api/references/${a.id}`);
    const c = await createReference(s);
    expect((await list()).map((r) => r.id as string)).toEqual([b.id, c.id]);
  });

  it('blank quoteEn becomes null', async () => {
    expect(await createReference(s, { quoteEn: '   ' })).toMatchObject({ quoteEn: null });
    expect(await createReference(s, { quoteEn: null })).toMatchObject({ quoteEn: null });
  });

  it.each([
    ['missing quoteFi and author', {}, { quoteFi: 'REQUIRED', author: 'REQUIRED' }],
    ['blank quoteFi', { quoteFi: '  ', author: 'A' }, { quoteFi: 'REQUIRED' }],
    ['quoteFi too long', { quoteFi: 'x'.repeat(5001), author: 'A' }, { quoteFi: 'TOO_LONG' }],
    ['quoteEn too long', { quoteFi: 'x', quoteEn: 'x'.repeat(5001), author: 'A' }, { quoteEn: 'TOO_LONG' }],
    ['author too long', { quoteFi: 'x', author: 'x'.repeat(201) }, { author: 'TOO_LONG' }],
    ['active not boolean', { quoteFi: 'x', author: 'A', active: 'yes' }, { active: 'INVALID_VALUE' }],
    ['quoteFi not a string', { quoteFi: 5, author: 'A' }, { quoteFi: 'INVALID_VALUE' }],
  ])('400 for %s', async (_label, body, fields) => {
    const res = await call(s, 'POST', '/api/references', body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields });
    expect(await testDb().reference.count()).toBe(0);
  });

  it('accepts the maximum lengths', async () => {
    const ref = await createReference(s, { quoteFi: 'x'.repeat(5000), quoteEn: 'y'.repeat(5000), author: 'z'.repeat(200) });
    expect(ref.quoteFi).toHaveLength(5000);
  });
});

describe('GET /api/references', () => {
  it('lists all references in sort order, inactive included', async () => {
    const a = await createReference(s, { quoteFi: 'A' });
    const b = await createReference(s, { quoteFi: 'B', active: false });
    const c = await createReference(s, { quoteFi: 'C' });
    expect(await list()).toEqual([a, b, c]);
  });
});

describe('PATCH /api/references/{id}', () => {
  it('updates any of quoteFi, quoteEn, author, active', async () => {
    const ref = await createReference(s, { quoteEn: 'Quote' });
    const res = await call(s, 'PATCH', `/api/references/${ref.id}`, {
      quoteFi: 'Uusi',
      quoteEn: '',
      author: '— Person 9',
      active: false,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toStrictEqual({ ...ref, quoteFi: 'Uusi', quoteEn: null, author: '— Person 9', active: false });
    expect(await list()).toEqual([res.json()]);
  });

  it('omitted fields are kept; a no-op returns 200 and writes nothing', async () => {
    const ref = await createReference(s, { quoteEn: 'Quote' });
    const before = await testDb().reference.findUniqueOrThrow({ where: { id: ref.id } });
    const res = await call(s, 'PATCH', `/api/references/${ref.id}`, { quoteFi: ref.quoteFi, active: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toStrictEqual(ref);
    const after = await testDb().reference.findUniqueOrThrow({ where: { id: ref.id } });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect((await call(s, 'PATCH', `/api/references/${ref.id}`, {})).json()).toStrictEqual(ref);
  });

  it('validates like create (validation before existence) and 404s unknown/malformed ids', async () => {
    const ref = await createReference(s);
    for (const [body, fields] of [
      [{ quoteFi: '' }, { quoteFi: 'REQUIRED' }],
      [{ quoteFi: null }, { quoteFi: 'REQUIRED' }],
      [{ author: ' ' }, { author: 'REQUIRED' }],
      [{ author: 'x'.repeat(201) }, { author: 'TOO_LONG' }],
      [{ active: null }, { active: 'INVALID_VALUE' }],
    ] as const) {
      const res = await call(s, 'PATCH', `/api/references/${ref.id}`, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json().error.fields).toEqual(fields);
    }
    expect((await call(s, 'PATCH', `/api/references/${UNKNOWN_ID}`, { quoteFi: '' })).statusCode).toBe(400);
    for (const id of [UNKNOWN_ID, 'nope']) {
      const res = await call(s, 'PATCH', `/api/references/${id}`, { active: false });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });
});

describe('POST /api/references/reorder', () => {
  it('sets the order from the exact list of all ids and returns the list', async () => {
    const a = await createReference(s, { quoteFi: 'A' });
    const b = await createReference(s, { quoteFi: 'B', active: false });
    const c = await createReference(s, { quoteFi: 'C' });
    const res = await call(s, 'POST', '/api/references/reorder', { ids: [c.id, a.id, b.id] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toStrictEqual([
      { ...c, sortOrder: 0 },
      { ...a, sortOrder: 1 },
      { ...b, sortOrder: 2 },
    ]);
    expect(await list()).toStrictEqual(res.json());
    // Upper-case ids are the same ids.
    const again = await call(s, 'POST', '/api/references/reorder', { ids: [a.id, b.id, c.id].map((id: string) => id.toUpperCase()) });
    expect(again.json().map((r: Json) => r.id as string)).toEqual([a.id, b.id, c.id]);
  });

  it('an empty list is fine when there are no references', async () => {
    const res = await call(s, 'POST', '/api/references/reorder', { ids: [] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('400 unless ids is exactly the set of all ids; nothing changes', async () => {
    const a = await createReference(s);
    const b = await createReference(s);
    const before = await list();
    const cases: [string, unknown, string][] = [
      ['missing ids', {}, 'REQUIRED'],
      ['not a list', { ids: a.id }, 'INVALID_VALUE'],
      ['not strings', { ids: [1, 2] }, 'INVALID_VALUE'],
      ['missing one', { ids: [a.id] }, 'INVALID_VALUE'],
      ['extra unknown', { ids: [a.id, b.id, UNKNOWN_ID] }, 'INVALID_VALUE'],
      ['unknown instead of one', { ids: [a.id, UNKNOWN_ID] }, 'INVALID_VALUE'],
      ['duplicate', { ids: [a.id, a.id] }, 'INVALID_VALUE'],
      ['duplicate in other case', { ids: [a.id, a.id.toUpperCase()] }, 'INVALID_VALUE'],
      ['malformed', { ids: [a.id, 'nope'] }, 'INVALID_VALUE'],
      ['empty', { ids: [] }, 'INVALID_VALUE'],
    ];
    for (const [label, body, code] of cases) {
      const res = await call(s, 'POST', '/api/references/reorder', body);
      expect(res.statusCode, label).toBe(400);
      expect(res.json().error, label).toMatchObject({ code: 'VALIDATION_ERROR', fields: { ids: code } });
    }
    expect(await list()).toStrictEqual(before);
  });
});

describe('photos', () => {
  it.each([
    ['PNG', PNG, 'image/png'],
    ['JPG', JPG, 'image/jpeg'],
    ['WebP', WEBP, 'image/webp'],
  ])('PUT stores a %s in UPLOAD_DIR (type from content) and GET serves it', async (_label, content, type) => {
    const ref = await createReference(s);
    // The browser-declared type and name are not trusted.
    const res = await uploadImage(s, ref.id, content, { filename: 'x.gif', contentType: 'image/gif' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toStrictEqual({ ...ref, hasImage: true });
    const stored = await files();
    expect(stored).toHaveLength(1);
    expect(await readFile(path.join(uploadDir, stored[0]!))).toEqual(content);

    const img = await call(s, 'GET', `/api/references/${ref.id}/image`);
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe(type);
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(img.headers['cache-control']).toBe('private, no-cache');
    expect(img.rawPayload).toEqual(content);
  });

  it('replacing a photo removes the old file', async () => {
    const ref = await createReference(s);
    await uploadImage(s, ref.id, PNG);
    const [first] = await files();
    await uploadImage(s, ref.id, JPG, { filename: 'b.jpg', contentType: 'image/jpeg' });
    const after = await files();
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(first);
    expect((await call(s, 'GET', `/api/references/${ref.id}/image`)).rawPayload).toEqual(JPG);
  });

  it(`413 FILE_TOO_LARGE over ${MAX_REFERENCE_IMAGE_BYTES} bytes (nothing kept); exactly the limit is fine`, async () => {
    const ref = await createReference(s);
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_REFERENCE_IMAGE_BYTES - PNG.length + 1)]);
    const res = await uploadImage(s, ref.id, big);
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('FILE_TOO_LARGE');
    expect(await files()).toEqual([]);
    expect((await list())[0].hasImage).toBe(false);

    const exact = await uploadImage(s, ref.id, big.subarray(0, MAX_REFERENCE_IMAGE_BYTES));
    expect(exact.statusCode).toBe(200);
  });

  it.each([
    ['PDF', PDF, 'application/pdf'],
    ['SVG', SVG, 'image/svg+xml'],
    ['text claiming to be PNG', Buffer.from('not an image'), 'image/png'],
    ['empty file', Buffer.alloc(0), 'image/png'],
  ])('415 UNSUPPORTED_FILE_TYPE for %s (nothing kept, old photo kept)', async (_label, content, type) => {
    const ref = await createReference(s);
    await uploadImage(s, ref.id, PNG);
    const before = await files();
    const res = await uploadImage(s, ref.id, content, { filename: 'x.png', contentType: type });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await files()).toEqual(before);
    expect((await call(s, 'GET', `/api/references/${ref.id}/image`)).rawPayload).toEqual(PNG);
  });

  it('400 file REQUIRED without a file or with another field; 404 for unknown references', async () => {
    const ref = await createReference(s);
    const wrongField = await uploadImage(s, ref.id, PNG, { field: 'photo' });
    expect(wrongField.statusCode).toBe(400);
    expect(wrongField.json().error.fields).toEqual({ file: 'REQUIRED' });
    const notMultipart = await call(s, 'PUT', `/api/references/${ref.id}/image`, { file: 'x' });
    expect(notMultipart.statusCode).toBe(400);
    expect(notMultipart.json().error.fields).toEqual({ file: 'REQUIRED' });
    for (const id of [UNKNOWN_ID, 'nope']) expect((await uploadImage(s, id, PNG)).statusCode).toBe(404);
    expect(await files()).toEqual([]);
  });

  it('DELETE image removes the file and is a no-op without one; GET image then 404s', async () => {
    const ref = await createReference(s);
    await uploadImage(s, ref.id, PNG);
    const res = await call(s, 'DELETE', `/api/references/${ref.id}/image`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toStrictEqual({ ...ref, hasImage: false });
    expect(await files()).toEqual([]);
    expect((await call(s, 'DELETE', `/api/references/${ref.id}/image`)).json()).toStrictEqual({ ...ref, hasImage: false });
    expect((await call(s, 'GET', `/api/references/${ref.id}/image`)).statusCode).toBe(404);
    for (const id of [UNKNOWN_ID, 'nope']) {
      expect((await call(s, 'DELETE', `/api/references/${id}/image`)).statusCode).toBe(404);
      expect((await call(s, 'GET', `/api/references/${id}/image`)).statusCode).toBe(404);
    }
  });

  it('GET image serves inactive references to partners and 404s when the file is missing', async () => {
    const ref = await createReference(s, { active: false });
    await uploadImage(s, ref.id, PNG);
    expect((await call(s, 'GET', `/api/references/${ref.id}/image`)).statusCode).toBe(200);
    await rm(path.join(uploadDir, (await files())[0]!));
    expect((await call(s, 'GET', `/api/references/${ref.id}/image`)).statusCode).toBe(404);
  });
});

describe('DELETE /api/references/{id}', () => {
  it('hard deletes the reference and its photo file', async () => {
    const keep = await createReference(s, { quoteFi: 'Keep' });
    const ref = await createReference(s);
    await uploadImage(s, keep.id, JPG, { filename: 'k.jpg', contentType: 'image/jpeg' });
    await uploadImage(s, ref.id, PNG);
    expect(await files()).toHaveLength(2);
    const res = await call(s, 'DELETE', `/api/references/${ref.id}`);
    expect(res.statusCode).toBe(204);
    expect(await testDb().reference.findUnique({ where: { id: ref.id } })).toBeNull();
    expect(await files()).toHaveLength(1);
    expect((await call(s, 'GET', `/api/references/${keep.id}/image`)).rawPayload).toEqual(JPG);
    expect((await list()).map((r) => r.id as string)).toEqual([keep.id]);
  });

  it('404 for unknown, malformed and already deleted ids', async () => {
    const ref = await createReference(s);
    await call(s, 'DELETE', `/api/references/${ref.id}`);
    for (const id of [ref.id, UNKNOWN_ID, 'nope']) {
      const res = await call(s, 'DELETE', `/api/references/${id}`);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });
});

describe('detectImageType', () => {
  it('recognises PNG, JPEG and WebP by content only', () => {
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(JPG)).toBe('image/jpeg');
    expect(detectImageType(WEBP)).toBe('image/webp');
    expect(detectImageType(Buffer.from('RIFF\0\0\0\0WAVEfmt '))).toBeNull(); // RIFF but not WebP
    expect(detectImageType(SVG)).toBeNull();
    expect(detectImageType(PDF)).toBeNull();
    expect(detectImageType(Buffer.from([0x89, 0x50]))).toBeNull(); // truncated
  });
});
