/**
 * Files in UPLOAD_DIR (attachments, reference photos). Every stored file is named by a random UUID
 * (its storage key); the real type is sniffed from the first bytes, never taken from the browser.
 */
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyRequest } from 'fastify';
import { AppError, validationError } from '../http/errors.js';

/** How many leading bytes the type sniffers need. */
export const SNIFF_BYTES = 12;

export const IMAGE_TYPES = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
} as const;

export type ImageContentType = (typeof IMAGE_TYPES)[keyof typeof IMAGE_TYPES];

const startsWith = (head: Buffer, bytes: readonly number[], offset = 0) =>
  head.length >= offset + bytes.length && bytes.every((b, i) => head[offset + i] === b);

/** PNG, JPEG or WebP from the file's first bytes; anything else (incl. SVG) → null. */
export function detectImageType(head: Buffer): ImageContentType | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return IMAGE_TYPES.png;
  if (startsWith(head, [0xff, 0xd8, 0xff])) return IMAGE_TYPES.jpeg;
  // RIFF....WEBP
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return IMAGE_TYPES.webp;
  return null;
}

export async function readHead(file: string, length = SNIFF_BYTES): Promise<Buffer> {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export class UploadDir {
  readonly root: string;

  constructor(dir: string) {
    this.root = path.resolve(dir);
  }

  /** Absolute path of a storage key (keys are UUIDs we generated, never user input). */
  pathOf(key: string): string {
    return path.join(this.root, key);
  }

  /** True if the stored file exists (a missing file is served as 404). */
  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.pathOf(key))).isFile();
    } catch {
      return false;
    }
  }

  /** Remove a stored file; a missing file is fine. */
  async remove(key: string | null | undefined): Promise<void> {
    if (key) await rm(this.pathOf(key), { force: true });
  }

  /**
   * Stream the multipart field `file` of the request into a new file. Missing file → 400
   * `file: REQUIRED`; larger than `maxBytes` → 413 FILE_TOO_LARGE (nothing is kept). The caller
   * owns the returned file and must `remove` it if it rejects the upload later.
   */
  async receive(
    request: FastifyRequest,
    options: { maxBytes: number; tooLargeMessage: string },
  ): Promise<{ storageKey: string; file: string; filename: string | undefined; sizeBytes: number; head: Buffer }> {
    if (!request.isMultipart()) throw validationError({ file: 'REQUIRED' }, 'multipart/form-data with a file expected');
    const part = await request.file({ limits: { fileSize: options.maxBytes, files: 1 } });
    if (!part || part.fieldname !== 'file') {
      part?.file.resume();
      throw validationError({ file: 'REQUIRED' });
    }

    await mkdir(this.root, { recursive: true });
    const storageKey = randomUUID();
    const file = this.pathOf(storageKey);
    try {
      await pipeline(part.file, createWriteStream(file, { flags: 'wx' }));
      if (part.file.truncated) throw new AppError('FILE_TOO_LARGE', options.tooLargeMessage);
      const { size } = await stat(file);
      return { storageKey, file, filename: part.filename, sizeBytes: size, head: await readHead(file) };
    } catch (err) {
      await rm(file, { force: true });
      if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError('FILE_TOO_LARGE', options.tooLargeMessage);
      throw err;
    }
  }
}
