/**
 * References / testimonials (docs/api-contract.md "References"; BR-108): serializers, ordering
 * and image responses shared by the internal and the public endpoints.
 */
import { createReadStream } from 'node:fs';
import type { FastifyReply } from 'fastify';
import type { Reference } from '../generated/prisma/client.js';
import type { Tx } from '../gigs/store.js';
import type { UploadDir } from '../fileStore/uploadDir.js';

/** Max upload size of a reference photo. */
export const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
export const QUOTE_MAX = 5000;
export const AUTHOR_MAX = 200;

/** Display order: sort_order, then creation order (ties only happen under concurrent creates). */
export const referenceOrder = [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] as const;

export function toReferenceDto(r: Reference) {
  return {
    id: r.id,
    quoteFi: r.quoteFi,
    quoteEn: r.quoteEn,
    author: r.author,
    hasImage: r.imageStorageKey !== null,
    sortOrder: r.sortOrder,
    active: r.active,
  };
}

export type ReferenceDto = ReturnType<typeof toReferenceDto>;

/** What the PublicOffer serializer needs of a reference. */
export type PublicReferenceSource = Pick<Reference, 'id' | 'quoteFi' | 'quoteEn' | 'author' | 'imageStorageKey'>;

/** Active references in display order (BR-108) — the list every offer with showReferences shows. */
export async function loadActiveReferences(db: Tx): Promise<PublicReferenceSource[]> {
  return db.reference.findMany({
    where: { active: true },
    orderBy: [...referenceOrder],
    select: { id: true, quoteFi: true, quoteEn: true, author: true, imageStorageKey: true },
  });
}

/** Public, token-scoped photo URL (BR-108). The token is the offer's share token. */
export function publicReferenceImageUrl(token: string, referenceId: string): string {
  return `/api/public/offers/${token}/references/${referenceId}/image`;
}

/**
 * Send a stored reference photo. The caller has checked access and that the file exists.
 * The browser may keep a copy but must revalidate each time (`no-cache` + ETag), so every view
 * goes through the access check again and a replaced photo is never shown stale; `private`
 * keeps shared caches from storing it.
 */
export function sendReferenceImage(
  reply: FastifyReply,
  uploads: UploadDir,
  ref: { imageStorageKey: string; imageContentType: string; imageSizeBytes: number },
  ifNoneMatch: string | undefined,
) {
  const etag = `"${ref.imageStorageKey}"`;
  reply
    .header('Cache-Control', 'private, no-cache')
    .header('ETag', etag)
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Security-Policy', "default-src 'none'; sandbox");
  if (ifNoneMatch !== undefined && ifNoneMatch.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) {
    return reply.status(304).send();
  }
  return reply
    .header('Content-Type', ref.imageContentType)
    .header('Content-Disposition', 'inline')
    .header('Content-Length', ref.imageSizeBytes)
    .send(createReadStream(uploads.pathOf(ref.imageStorageKey)));
}
