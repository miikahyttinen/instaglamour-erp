/**
 * Reference (testimonial) endpoints (docs/api-contract.md "References"; BR-108). Session required.
 * The public, token-scoped photo route lives in routes/publicOffers.ts.
 *
 * Order changes (create = append, reorder) take a table lock so concurrent requests can't give two
 * references the same position or reorder against a stale id set.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import type { Prisma } from '../generated/prisma/client.js';
import { flag, optionalText, requiredText } from '../events/schemas.js';
import { inTransaction, isUuid } from '../events/store.js';
import { AppError, notFound, parseInput, validationError } from '../http/errors.js';
import {
  AUTHOR_MAX,
  hasImage,
  IMAGE_SELECT,
  MAX_REFERENCE_IMAGE_BYTES,
  OMIT_IMAGE_DATA,
  QUOTE_MAX,
  referenceOrder,
  sendReferenceImage,
  storedImage,
  toReferenceDto,
  type ReferenceMeta,
} from '../references/store.js';
import { detectImageType, receiveFile } from '../fileStore/uploadDir.js';

type IdParams = { Params: { id: string } };

const createBody = z.object({
  quoteFi: requiredText(QUOTE_MAX),
  quoteEn: optionalText(QUOTE_MAX),
  author: requiredText(AUTHOR_MAX),
  active: flag.optional(),
});

const updateBody = z.object({
  quoteFi: requiredText(QUOTE_MAX).optional(),
  quoteEn: optionalText(QUOTE_MAX),
  author: requiredText(AUTHOR_MAX).optional(),
  active: flag.optional(),
});

const reorderBody = z.object({
  // Elements are checked in the handler, so any wrong element is reported as `ids: INVALID_VALUE`.
  ids: z.array(z.unknown(), {
    error: (issue) => (issue.input === undefined || issue.input === null ? 'REQUIRED' : 'INVALID_VALUE'),
  }),
});

const referenceNotFound = () => notFound('Reference not found');

/** Serialize order changes (append / reorder); plain reads and edits are not blocked. */
async function lockReferenceOrder(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`LOCK TABLE "reference" IN SHARE ROW EXCLUSIVE MODE`;
}

export function referencesRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  // Every query here except GET image omits the photo bytes (TASK-060).
  const findReference = async (id: string): Promise<ReferenceMeta | null> =>
    isUuid(id) ? db.reference.findUnique({ where: { id }, omit: OMIT_IMAGE_DATA }) : null;

  const requireReference = async (id: string): Promise<ReferenceMeta> => {
    const ref = await findReference(id);
    if (!ref) throw referenceNotFound();
    return ref;
  };

  const listAll = (tx: Prisma.TransactionClient | typeof db) => tx.reference.findMany({ orderBy: [...referenceOrder], omit: OMIT_IMAGE_DATA });

  app.get('/api/references', async () => (await listAll(db)).map(toReferenceDto));

  app.post('/api/references', async (request, reply) => {
    const body = parseInput(createBody, request.body);
    const created = await inTransaction(db, async (tx) => {
      await lockReferenceOrder(tx);
      const last = await tx.reference.aggregate({ _max: { sortOrder: true } });
      return tx.reference.create({
        data: {
          quoteFi: body.quoteFi,
          quoteEn: body.quoteEn ?? null,
          author: body.author,
          active: body.active ?? true,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        omit: OMIT_IMAGE_DATA,
      });
    });
    return reply.status(201).send(toReferenceDto(created));
  });

  app.patch<IdParams>('/api/references/:id', async (request) => {
    const body = parseInput(updateBody, request.body);
    const ref = await requireReference(request.params.id);
    const data: Prisma.ReferenceUpdateInput = {};
    if (body.quoteFi !== undefined && body.quoteFi !== ref.quoteFi) data.quoteFi = body.quoteFi;
    if (body.quoteEn !== undefined && body.quoteEn !== ref.quoteEn) data.quoteEn = body.quoteEn;
    if (body.author !== undefined && body.author !== ref.author) data.author = body.author;
    if (body.active !== undefined && body.active !== ref.active) data.active = body.active;
    if (Object.keys(data).length === 0) return toReferenceDto(ref); // no-op
    try {
      return toReferenceDto(await db.reference.update({ where: { id: ref.id }, data, omit: OMIT_IMAGE_DATA }));
    } catch (err) {
      if (isRecordNotFound(err)) throw referenceNotFound(); // deleted meanwhile
      throw err;
    }
  });

  app.post('/api/references/reorder', async (request) => {
    const { ids } = parseInput(reorderBody, request.body);
    const invalid = () => validationError({ ids: 'INVALID_VALUE' }, 'ids must list every reference exactly once');
    if (!ids.every(isUuid)) throw invalid();
    const wanted = ids.filter(isUuid).map((id) => id.toLowerCase());
    if (new Set(wanted).size !== wanted.length) throw invalid();

    const refs = await inTransaction(db, async (tx) => {
      await lockReferenceOrder(tx);
      const current = await tx.reference.findMany({ select: { id: true, sortOrder: true } });
      const known = new Set(current.map((r) => r.id));
      if (current.length !== wanted.length || !wanted.every((id) => known.has(id))) throw invalid();
      const sortOrderOf = new Map(current.map((r) => [r.id, r.sortOrder]));
      for (const [index, id] of wanted.entries()) {
        if (sortOrderOf.get(id) !== index) await tx.reference.update({ where: { id }, data: { sortOrder: index } });
      }
      return listAll(tx);
    });
    return refs.map(toReferenceDto);
  });

  /**
   * Set (or clear) the photo columns under a row lock. The bytes live in the database (TASK-060);
   * a legacy file key is cleared too (the file itself stays on disk, nothing is written there).
   */
  const swapImage = (id: string, image: { imageData: Uint8Array<ArrayBuffer>; imageContentType: string; imageSizeBytes: number } | null) =>
    inTransaction(db, async (tx) => {
      const locked = await tx.$queryRaw<{ uploadedAt: Date | null }[]>`
        SELECT "image_uploaded_at" AS "uploadedAt"
        FROM "reference" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const current = locked[0];
      if (!current) throw referenceNotFound(); // deleted meanwhile
      // Every upload gets a new, strictly later upload time = a new imageVersion (contract), even
      // when two uploads land in the same millisecond.
      const uploadedAt = new Date(Math.max(Date.now(), (current.uploadedAt?.getTime() ?? 0) + 1));
      return tx.reference.update({
        where: { id },
        data: image
          ? { ...image, imageStorageKey: null, imageUploadedAt: uploadedAt }
          : { imageStorageKey: null, imageData: null, imageContentType: null, imageSizeBytes: null, imageUploadedAt: null },
        omit: OMIT_IMAGE_DATA,
      });
    });

  app.put<IdParams>('/api/references/:id/image', async (request) => {
    const ref = await requireReference(request.params.id);
    const upload = await receiveFile(request, {
      maxBytes: MAX_REFERENCE_IMAGE_BYTES,
      tooLargeMessage: 'Image is larger than 10 MB',
    });
    const contentType = detectImageType(upload.data);
    if (!contentType) throw new AppError('UNSUPPORTED_FILE_TYPE', 'Only PNG, JPG and WebP images are allowed');
    const updated = await swapImage(ref.id, {
      imageData: new Uint8Array(upload.data),
      imageContentType: contentType,
      imageSizeBytes: upload.data.byteLength,
    });
    return toReferenceDto(updated);
  });

  app.delete<IdParams>('/api/references/:id/image', async (request) => {
    const ref = await requireReference(request.params.id);
    if (!hasImage(ref)) return toReferenceDto(ref); // no-op
    return toReferenceDto(await swapImage(ref.id, null));
  });

  app.get<IdParams>('/api/references/:id/image', async (request, reply) => {
    reply.header('Cache-Control', 'no-store'); // errors are never cached; a served photo overrides it
    const ref = isUuid(request.params.id)
      ? await db.reference.findUnique({ where: { id: request.params.id }, select: IMAGE_SELECT })
      : null;
    if (!ref) throw referenceNotFound();
    const image = storedImage(ref);
    if (!image) throw notFound('Reference image not found');
    return sendReferenceImage(reply, image, request);
  });

  app.delete<IdParams>('/api/references/:id', async (request, reply) => {
    const ref = await requireReference(request.params.id);
    // Hard delete (contract), photo bytes included. A legacy file on disk is never deleted.
    const deleted = await db.reference.deleteMany({ where: { id: ref.id } });
    if (deleted.count === 0) throw referenceNotFound(); // deleted meanwhile
    return reply.status(204).send();
  });
}

/** Prisma "record to update/delete not found". */
function isRecordNotFound(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2025';
}
