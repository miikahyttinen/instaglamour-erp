/**
 * One-time move of reference photos from UPLOAD_DIR files into `reference.image_data` (TASK-060,
 * contract "Reference photos stored in the database"). Runs at every backend startup and is
 * idempotent: only references that still have an `image_storage_key` and no `image_data` are
 * touched, so after the first run it's a no-op.
 *
 * - File present → its bytes go to `image_data`, the key is cleared (type and upload time, i.e. the
 *   API's imageVersion, stay; size is set to the real byte count).
 * - File missing (also when UPLOAD_DIR itself is missing) → all image fields are cleared; the
 *   reference then has no photo.
 * - File unreadable for another reason (e.g. permissions) → left as is, logged, retried next start.
 * Files on disk are never deleted or written. Every update is conditional on the row still having
 * the same key and no bytes, so concurrent instances or a racing upload can't be overwritten.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '../db.js';

export interface MoveImagesSummary {
  moved: number;
  missing: number;
  failed: number;
}

interface Logger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

/** Storage keys are UUIDs we generated; anything else is treated as a missing file (no path tricks). */
const SAFE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readStoredFile(root: string, key: string): Promise<Buffer | null> {
  if (!SAFE_KEY.test(key)) return null;
  try {
    return await readFile(path.join(root, key));
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') return null;
    throw err;
  }
}

export async function moveReferenceImagesToDb(db: Db, uploadDir: string, log: Logger): Promise<MoveImagesSummary> {
  const root = path.resolve(uploadDir);
  const pending = await db.reference.findMany({
    where: { imageStorageKey: { not: null }, imageData: null },
    select: { id: true, imageStorageKey: true },
  });
  const summary: MoveImagesSummary = { moved: 0, missing: 0, failed: 0 };
  for (const ref of pending) {
    const key = ref.imageStorageKey!;
    const unchanged = { id: ref.id, imageStorageKey: key, imageData: null };
    let data: Buffer | null;
    try {
      data = await readStoredFile(root, key);
    } catch (err) {
      summary.failed++;
      log.warn({ referenceId: ref.id, err: (err as Error).message }, 'Reference photo file could not be read; will retry at next startup');
      continue;
    }
    if (data) {
      const { count } = await db.reference.updateMany({
        where: unchanged,
        data: { imageData: new Uint8Array(data), imageSizeBytes: data.byteLength, imageStorageKey: null },
      });
      summary.moved += count;
    } else {
      const { count } = await db.reference.updateMany({
        where: unchanged,
        data: { imageStorageKey: null, imageContentType: null, imageSizeBytes: null, imageUploadedAt: null },
      });
      summary.missing += count;
    }
  }
  log.info({ ...summary }, 'Reference photo move from UPLOAD_DIR into the database (moved / missing = photo cleared / failed)');
  return summary;
}
