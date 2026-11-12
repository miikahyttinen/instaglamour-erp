/**
 * Uploaded images: type sniffing and receiving a multipart file into memory. Reference photos are
 * stored in the database (TASK-060); UPLOAD_DIR is only read by the one-time startup move of older
 * photo files (src/references/moveImagesToDb.ts). Old attachment files there are kept unused.
 * The real type is always sniffed from the first bytes, never taken from the browser.
 */
import { open } from 'node:fs/promises';
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

const startsWith = (head: Uint8Array, bytes: readonly number[], offset = 0) =>
  head.length >= offset + bytes.length && bytes.every((b, i) => head[offset + i] === b);

/** PNG, JPEG or WebP from the file's first bytes; anything else (incl. SVG) → null. */
export function detectImageType(head: Uint8Array): ImageContentType | null {
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

/**
 * Read the multipart field `file` of the request into memory. Missing file → 400 `file: REQUIRED`;
 * larger than `maxBytes` → 413 FILE_TOO_LARGE (nothing is kept; at most `maxBytes` are buffered).
 */
export async function receiveFile(
  request: FastifyRequest,
  options: { maxBytes: number; tooLargeMessage: string },
): Promise<{ data: Buffer; filename: string | undefined }> {
  if (!request.isMultipart()) throw validationError({ file: 'REQUIRED' }, 'multipart/form-data with a file expected');
  const part = await request.file({ limits: { fileSize: options.maxBytes, files: 1 } });
  if (!part || part.fieldname !== 'file') {
    part?.file.resume();
    throw validationError({ file: 'REQUIRED' });
  }
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of part.file) chunks.push(chunk as Buffer);
  } catch (err) {
    if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError('FILE_TOO_LARGE', options.tooLargeMessage);
    throw err;
  }
  if (part.file.truncated) throw new AppError('FILE_TOO_LARGE', options.tooLargeMessage);
  return { data: Buffer.concat(chunks), filename: part.filename };
}
