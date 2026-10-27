import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { offersApi, publicOffersApi, referencesApi } from '../api/endpoints';
import { addMockClient } from '../test/eventFixtures';
import { testFile } from '../test/files';
import { addMockOffer } from '../test/offerFixtures';
import { signInMock } from '../test/renderApp';
import { db, setMockSession } from './data';
import { REFERENCE_IDS } from './referencesStore';

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('references mock (contract → References, BR-108)', () => {
  beforeEach(() => {
    signInMock();
  });

  it('lists in order incl. inactive, creates last, validates, patches, reorders and deletes', async () => {
    const list = await referencesApi.list();
    expect(list.map((r) => r.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(list.some((r) => !r.active)).toBe(true);
    expect(list.every((r) => !r.hasImage)).toBe(true);

    const created = await referencesApi.create({ quoteFi: ' Uusi ', author: 'Client Q' });
    expect(created).toMatchObject({ quoteFi: 'Uusi', quoteEn: null, active: true, sortOrder: 4 });
    const invalid = await apiError(referencesApi.create({ quoteFi: '', author: 'x'.repeat(201) }));
    expect(invalid.fields).toEqual({ quoteFi: 'REQUIRED', author: 'TOO_LONG' });

    expect(await referencesApi.update(created.id, { quoteEn: '  ', active: false })).toMatchObject({
      quoteEn: null,
      active: false,
    });

    const ids = list.map((r) => r.id).reverse();
    const reordered = await referencesApi.reorder([created.id, ...ids]);
    expect(reordered.map((r) => r.id)).toEqual([created.id, ...ids]);
    expect((await apiError(referencesApi.reorder(ids))).code).toBe('VALIDATION_ERROR'); // not all ids

    await referencesApi.remove(created.id);
    expect((await referencesApi.list()).map((r) => r.id)).toEqual(ids);
  });

  it('uploads PNG/JPG/WebP, answers 415 for other types, removes the photo', async () => {
    const id = REFERENCE_IDS.a;
    expect((await referencesApi.list())[0]!.imageVersion).toBeNull();
    const uploaded = await referencesApi.uploadImage(id, testFile('a.webp', 'image/webp'));
    expect(uploaded.hasImage).toBe(true);
    expect(uploaded.imageVersion).toEqual(expect.any(String));
    const replaced = await referencesApi.uploadImage(id, testFile('b.png', 'image/png'));
    expect(replaced.imageVersion).not.toBe(uploaded.imageVersion); // new version on every upload
    // (The faked size of testFile() does not survive multipart, so 413 is covered by the UI tests.)
    const pdf = await apiError(referencesApi.uploadImage(id, testFile('c.pdf', 'application/pdf')));
    expect([pdf.status, pdf.code]).toEqual([415, 'UNSUPPORTED_FILE_TYPE']);
    expect(referencesApi.imageUrl(id, replaced.imageVersion)).toBe(
      `/api/references/${id}/image?v=${encodeURIComponent(replaced.imageVersion!)}`,
    );
    expect((await fetch(referencesApi.imageUrl(id, replaced.imageVersion))).status).toBe(200);
    const removed = await referencesApi.removeImage(id);
    expect(removed.hasImage).toBe(false);
    expect(removed.imageVersion).not.toBe(replaced.imageVersion); // and on remove
    expect((await fetch(referencesApi.imageUrl(id, removed.imageVersion))).status).toBe(404);
  });

  it('public offer: active references in order, token-scoped photo URLs, 404 rules for photos', async () => {
    const clientId = addMockClient('Client X').id;
    const offer = addMockOffer({ clientId, showReferences: true });
    const hidden = addMockOffer({ clientId, showReferences: false });
    await referencesApi.uploadImage(REFERENCE_IDS.a, testFile('a.png', 'image/png'));
    await referencesApi.uploadImage(REFERENCE_IDS.d, testFile('d.png', 'image/png')); // inactive

    const detail = await offersApi.get(offer.id);
    expect(detail.preview.references?.map((r) => r.author)).toEqual([
      'Person 5, Client A',
      'Client B',
      'Person 6, Client C',
    ]);
    const first = detail.preview.references![0]!;
    const version = db.references.references[0]!.imageVersion!;
    expect(first.imageUrl).toBe(
      `/api/public/offers/${offer.shareToken}/references/${REFERENCE_IDS.a}/image?v=${encodeURIComponent(version)}`,
    );
    expect((await fetch(first.imageUrl!)).status).toBe(200);
    expect(detail.preview.references![1]).toMatchObject({ quote: { en: null }, imageUrl: null });
    expect((await offersApi.get(hidden.id)).preview.references).toBeNull();

    setMockSession(null);
    expect(await publicOffersApi.get(offer.shareToken)).toEqual(detail.preview);
    const status = async (token: string, id: string) =>
      (await fetch(`/api/public/offers/${token}/references/${id}/image`)).status;
    expect(await status(offer.shareToken, REFERENCE_IDS.a)).toBe(200);
    expect(await status(offer.shareToken, REFERENCE_IDS.b)).toBe(404); // no photo
    expect(await status(offer.shareToken, REFERENCE_IDS.d)).toBe(404); // inactive
    expect(await status(hidden.shareToken, REFERENCE_IDS.a)).toBe(404); // offer hides references
    expect(await status('unknown-token', REFERENCE_IDS.a)).toBe(404);
    offer.deletedAt = new Date().toISOString();
    expect(await status(offer.shareToken, REFERENCE_IDS.a)).toBe(404);
    expect(db.references.references).toHaveLength(4);
  });
});
