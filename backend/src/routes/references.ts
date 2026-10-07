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
import type { Prisma, Reference } from '../generated/prisma/client.js';
import { flag, optionalText, requiredText } from '../gigs/schemas.js';
import { inTransaction, isUuid } from '../gigs/store.js';
import { AppError, notFound, parseInput, validationError } from '../http/errors.js';
import {
  AUTHOR_MAX,
  MAX_REFERENCE_IMAGE_BYTES,
  QUOTE_MAX,
  referenceOrder,
  sendReferenceImage,
  storedImage,
  toReferenceDto,
} from '../references/store.js';
import { detectImageType, UploadDir } from '../fileStore/uploadDir.js';

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
  const { db, config } = deps;
  const uploads = new UploadDir(config.uploadDir);

  const findReference = async (id: string): Promise<Reference | null> =>
    isUuid(id) ? db.reference.findUnique({ where: { id } }) : null;

  const requireReference = async (id: string): Promise<Reference> => {
    const ref = await findReference(id);
    if (!ref) throw referenceNotFound();
    return ref;
  };

  const listAll = (tx: Prisma.TransactionClient | typeof db) => tx.reference.findMany({ orderBy: [...referenceOrder] });

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
      return toReferenceDto(await db.reference.update({ where: { id: ref.id }, data }));
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
   * Set (or clear) the photo columns under a row lock and return the photo key that was replaced,
   * so exactly the file no longer referenced is removed even when requests race.
   */
  const swapImage = (id: string, image: { imageStorageKey: string; imageContentType: string; imageSizeBytes: number } | null) =>
    inTransaction(db, async (tx) => {
      const locked = await tx.$queryRaw<{ key: string | null; uploadedAt: Date | null }[]>`
        SELECT "image_storage_key" AS "key", "image_uploaded_at" AS "uploadedAt"
        FROM "reference" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const current = locked[0];
      if (!current) throw referenceNotFound(); // deleted meanwhile
      // Every upload gets a new, strictly later upload time = a new imageVersion (contract), even
      // when two uploads land in the same millisecond.
      const uploadedAt = new Date(Math.max(Date.now(), (current.uploadedAt?.getTime() ?? 0) + 1));
      const updated = await tx.reference.update({
        where: { id },
        data: image
          ? { ...image, imageUploadedAt: uploadedAt }
          : { imageStorageKey: null, imageContentType: null, imageSizeBytes: null, imageUploadedAt: null },
      });
      return { updated, replacedKey: current.key };
    });

  app.put<IdParams>('/api/references/:id/image', async (request) => {
    const ref = await requireReference(request.params.id);
    const upload = await uploads.receive(request, {
      maxBytes: MAX_REFERENCE_IMAGE_BYTES,
      tooLargeMessage: 'Image is larger than 10 MB',
    });
    let result: Awaited<ReturnType<typeof swapImage>>;
    try {
      const contentType = detectImageType(upload.head);
      if (!contentType) throw new AppError('UNSUPPORTED_FILE_TYPE', 'Only PNG, JPG and WebP images are allowed');
      result = await swapImage(ref.id, {
        imageStorageKey: upload.storageKey,
        imageContentType: contentType,
        imageSizeBytes: upload.sizeBytes,
      });
    } catch (err) {
      await uploads.remove(upload.storageKey);
      throw err;
    }
    await uploads.remove(result.replacedKey);
    return toReferenceDto(result.updated);
  });

  app.delete<IdParams>('/api/references/:id/image', async (request) => {
    const ref = await requireReference(request.params.id);
    if (!ref.imageStorageKey) return toReferenceDto(ref); // no-op
    const { updated, replacedKey } = await swapImage(ref.id, null);
    await uploads.remove(replacedKey);
    return toReferenceDto(updated);
  });

  app.get<IdParams>('/api/references/:id/image', async (request, reply) => {
    reply.header('Cache-Control', 'no-store'); // errors are never cached; a served photo overrides it
    const ref = await requireReference(request.params.id);
    const image = storedImage(ref);
    if (!image || !(await uploads.exists(image.storageKey)))
      throw notFound('Reference image not found');
    return sendReferenceImage(reply, uploads, image, request);
  });

  app.delete<IdParams>('/api/references/:id', async (request, reply) => {
    const ref = await requireReference(request.params.id);
    // Hard delete (contract); the photo key is read in the same statement so the right file goes.
    const deleted = await db.$queryRaw<{ key: string | null }[]>`
      DELETE FROM "reference" WHERE "id" = ${ref.id}::uuid RETURNING "image_storage_key" AS "key"`;
    if (deleted.length === 0) throw referenceNotFound(); // deleted meanwhile
    await uploads.remove(deleted[0]!.key);
    return reply.status(204).send();
  });
}

/** Prisma "record to update/delete not found". */
function isRecordNotFound(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2025';
}
