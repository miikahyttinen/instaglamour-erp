/**
 * TASK-060: startup move of reference photo files from UPLOAD_DIR into reference.image_data.
 * Synthetic references and generated fake images in a temporary directory only.
 */
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { moveReferenceImagesToDb } from '../src/references/moveImagesToDb.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { JPG, PNG } from './referenceFixtures.js';

let uploadDir: string;
const logged: { obj: object; msg: string }[] = [];
const log = {
  info: (obj: object, msg: string) => void logged.push({ obj, msg }),
  warn: (obj: object, msg: string) => void logged.push({ obj, msg }),
};

beforeEach(async () => {
  await resetDb();
  logged.length = 0;
  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'instaglamour-test-move-'));
});
afterEach(() => rm(uploadDir, { recursive: true, force: true }));
afterAll(closeTestDb);

const UPLOADED_AT = new Date('2026-01-02T03:04:05.678Z');
let sortOrder = 0;

/** A reference as the old file-based code stored it: key + metadata, no bytes. */
async function legacyReference(key: string | null, contentType = 'image/png', sizeBytes = 999) {
  return testDb().reference.create({
    data: {
      quoteFi: 'Lainaus',
      author: `— Person ${sortOrder + 1}`,
      sortOrder: sortOrder++,
      ...(key ? { imageStorageKey: key, imageContentType: contentType, imageSizeBytes: sizeBytes, imageUploadedAt: UPLOADED_AT } : {}),
    },
  });
}

const row = (id: string) => testDb().reference.findUniqueOrThrow({ where: { id } });

describe('moveReferenceImagesToDb', () => {
  it('moves a present file into image_data and clears the key; type and version stay; file kept on disk', async () => {
    const key = randomUUID();
    await writeFile(path.join(uploadDir, key), JPG);
    const ref = await legacyReference(key, 'image/jpeg');

    expect(await moveReferenceImagesToDb(testDb(), uploadDir, log)).toEqual({ moved: 1, missing: 0, failed: 0 });

    const after = await row(ref.id);
    expect(Buffer.from(after.imageData!)).toEqual(JPG);
    expect(after).toMatchObject({
      imageStorageKey: null,
      imageContentType: 'image/jpeg',
      imageSizeBytes: JPG.length, // the real byte count
      imageUploadedAt: UPLOADED_AT, // imageVersion unchanged → cached URLs stay valid
    });
    // Never deletes files.
    expect(await readdir(uploadDir)).toEqual([key]);
    expect(await readFile(path.join(uploadDir, key))).toEqual(JPG);
    expect(logged.at(-1)!.obj).toEqual({ moved: 1, missing: 0, failed: 0 });
  });

  it('clears all image fields when the file is missing', async () => {
    const ref = await legacyReference(randomUUID());
    expect(await moveReferenceImagesToDb(testDb(), uploadDir, log)).toEqual({ moved: 0, missing: 1, failed: 0 });
    expect(await row(ref.id)).toMatchObject({
      imageStorageKey: null,
      imageData: null,
      imageContentType: null,
      imageSizeBytes: null,
      imageUploadedAt: null,
    });
  });

  it('is safe when UPLOAD_DIR does not exist (photos are cleared, nothing is created)', async () => {
    const missingDir = path.join(uploadDir, 'not-there');
    const ref = await legacyReference(randomUUID());
    expect(await moveReferenceImagesToDb(testDb(), missingDir, log)).toEqual({ moved: 0, missing: 1, failed: 0 });
    expect((await row(ref.id)).imageUploadedAt).toBeNull();
    expect(await readdir(uploadDir)).toEqual([]);
  });

  it('a key that is not a generated UUID is never used as a path (treated as missing)', async () => {
    await writeFile(path.join(uploadDir, 'x.png'), PNG);
    const ref = await legacyReference('../x.png');
    expect(await moveReferenceImagesToDb(testDb(), path.join(uploadDir, 'sub'), log)).toEqual({ moved: 0, missing: 1, failed: 0 });
    expect((await row(ref.id)).imageData).toBeNull();
  });

  it('is idempotent: already moved photos and references without photos are left alone', async () => {
    const key = randomUUID();
    await writeFile(path.join(uploadDir, key), PNG);
    const moved = await legacyReference(key);
    const none = await legacyReference(null);
    await moveReferenceImagesToDb(testDb(), uploadDir, log);
    const first = await row(moved.id);

    // Second run (even with the file gone) is a no-op.
    await rm(path.join(uploadDir, key));
    expect(await moveReferenceImagesToDb(testDb(), uploadDir, log)).toEqual({ moved: 0, missing: 0, failed: 0 });
    expect(await row(moved.id)).toEqual(first);
    expect(Buffer.from((await row(moved.id)).imageData!)).toEqual(PNG);
    expect(await row(none.id)).toMatchObject({ imageStorageKey: null, imageData: null, imageUploadedAt: null });
  });

  it('handles several references in one run', async () => {
    const present = randomUUID();
    await writeFile(path.join(uploadDir, present), PNG);
    await legacyReference(present);
    await legacyReference(randomUUID());
    await legacyReference(null);
    expect(await moveReferenceImagesToDb(testDb(), uploadDir, log)).toEqual({ moved: 1, missing: 1, failed: 0 });
  });
});

describe('reference_image_all_or_none constraint', () => {
  it('a photo lives in exactly one place: file key or bytes, never both, and metadata goes with it', async () => {
    const ref = await legacyReference(randomUUID());
    await expect(
      testDb().reference.update({ where: { id: ref.id }, data: { imageData: new Uint8Array(PNG) } }),
    ).rejects.toThrow();
    await expect(
      testDb().reference.update({ where: { id: ref.id }, data: { imageStorageKey: null } }),
    ).rejects.toThrow();
    // Bytes without metadata are rejected too.
    const plain = await legacyReference(null);
    await expect(
      testDb().reference.update({ where: { id: plain.id }, data: { imageData: new Uint8Array(PNG) } }),
    ).rejects.toThrow();
  });
});
