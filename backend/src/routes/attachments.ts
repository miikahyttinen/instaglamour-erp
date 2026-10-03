/** Attachment endpoints (docs/api-contract.md "Attachments"; UC-008, BR-040). */
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { AppError, notFound, validationError } from '../http/errors.js';
import { toAttachmentDto } from '../gigs/serialize.js';
import { assertNotDeleted, inTransaction, isUuid, logEvent, requireGigDetail } from '../gigs/store.js';

type IdParams = { Params: { id: string } };

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const ATTACHMENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpeg: 'image/jpeg',
} as const;

/**
 * The file's real type from its first bytes (the browser-declared type is not trusted).
 * DOCX is a ZIP container, so it additionally needs the `.docx` extension.
 */
export function detectContentType(head: Buffer, filename: string): string | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return ATTACHMENT_TYPES.pdf; // %PDF-
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return ATTACHMENT_TYPES.png;
  if (starts(0xff, 0xd8, 0xff)) return ATTACHMENT_TYPES.jpeg;
  if (starts(0x50, 0x4b, 0x03, 0x04) && filename.toLowerCase().endsWith('.docx')) return ATTACHMENT_TYPES.docx;
  return null;
}

/** A display file name: no directories or control characters, at most 255 characters. */
export function cleanFilename(raw: string | undefined): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
  return cleaned || 'file';
}

function contentDisposition(contentType: string, filename: string): string {
  const inline = contentType !== ATTACHMENT_TYPES.docx;
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function readHead(file: string, length: number): Promise<Buffer> {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function attachmentRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config } = deps;
  const uploadDir = path.resolve(config.uploadDir);
  const storagePath = (key: string) => path.join(uploadDir, key);

  app.post<IdParams>('/api/gigs/:id/attachments', async (request, reply) => {
    const me = request.requirePartner();
    const gig = await requireGigDetail(db, request.params.id);
    assertNotDeleted(gig);

    if (!request.isMultipart()) throw validationError({ file: 'REQUIRED' }, 'multipart/form-data with a file expected');
    const part = await request.file({ limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } });
    if (!part || part.fieldname !== 'file') {
      part?.file.resume();
      throw validationError({ file: 'REQUIRED' });
    }

    await mkdir(uploadDir, { recursive: true });
    const storageKey = randomUUID();
    const file = storagePath(storageKey);
    const filename = cleanFilename(part.filename);
    try {
      await pipeline(part.file, createWriteStream(file, { flags: 'wx' }));
      if (part.file.truncated) throw new AppError('FILE_TOO_LARGE', 'File is larger than 20 MB');
    } catch (err) {
      await rm(file, { force: true });
      if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new AppError('FILE_TOO_LARGE', 'File is larger than 20 MB');
      }
      throw err;
    }

    try {
      const contentType = detectContentType(await readHead(file, 8), filename);
      if (!contentType) throw new AppError('UNSUPPORTED_FILE_TYPE', 'Only PDF, DOCX, PNG and JPG files are allowed');
      const { size } = await stat(file);
      const attachment = await inTransaction(db, async (tx) => {
        const created = await tx.attachment.create({
          data: { gigId: gig.id, filename, contentType, sizeBytes: size, storageKey, uploadedById: me.id },
        });
        await logEvent(tx, {
          gigId: gig.id,
          type: 'ATTACHMENT_ADDED',
          partnerId: me.id,
          details: { attachmentId: created.id, filename },
        });
        return created;
      });
      return reply.status(201).send(toAttachmentDto(attachment));
    } catch (err) {
      await rm(file, { force: true });
      throw err;
    }
  });

  app.get<IdParams>('/api/attachments/:id/download', async (request, reply) => {
    const { id } = request.params;
    const attachment = isUuid(id) ? await db.attachment.findUnique({ where: { id } }) : null;
    if (!attachment || attachment.deletedAt) throw notFound('Attachment not found');
    const file = storagePath(attachment.storageKey);
    try {
      await stat(file);
    } catch {
      throw notFound('Attachment file not found');
    }
    return reply
      .header('Content-Type', attachment.contentType)
      .header('Content-Disposition', contentDisposition(attachment.contentType, attachment.filename))
      .header('Content-Length', attachment.sizeBytes)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, no-store')
      .send(createReadStream(file));
  });

  app.delete<IdParams>('/api/attachments/:id', async (request, reply) => {
    const me = request.requirePartner();
    const { id } = request.params;
    const attachment = isUuid(id) ? await db.attachment.findUnique({ where: { id }, include: { gig: true } }) : null;
    if (!attachment || attachment.deletedAt) throw notFound('Attachment not found');
    assertNotDeleted(attachment.gig);
    await inTransaction(db, async (tx) => {
      await tx.attachment.update({ where: { id: attachment.id }, data: { deletedAt: new Date() } });
      await logEvent(tx, {
        gigId: attachment.gigId,
        type: 'ATTACHMENT_REMOVED',
        partnerId: me.id,
        details: { attachmentId: attachment.id, filename: attachment.filename },
      });
    });
    return reply.status(204).send();
  });
}
