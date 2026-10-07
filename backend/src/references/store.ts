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

/** Contract `imageVersion`: the photo's upload time in epoch ms; null without a photo. */
export function imageVersion(r: { imageUploadedAt: Date | null }): string | null {
  return r.imageUploadedAt ? String(r.imageUploadedAt.getTime()) : null;
}

export function toReferenceDto(r: Reference) {
  return {
    id: r.id,
    quoteFi: r.quoteFi,
    quoteEn: r.quoteEn,
    author: r.author,
    hasImage: r.imageStorageKey !== null,
    imageVersion: imageVersion(r),
    sortOrder: r.sortOrder,
    active: r.active,
  };
}

export type ReferenceDto = ReturnType<typeof toReferenceDto>;

/** What the PublicOffer serializer needs of a reference. */
export type PublicReferenceSource = Pick<Reference, 'id' | 'quoteFi' | 'quoteEn' | 'author' | 'imageStorageKey' | 'imageUploadedAt'>;

/** Active references in display order (BR-108) — the list every offer with showReferences shows. */
export async function loadActiveReferences(db: Tx): Promise<PublicReferenceSource[]> {
  return db.reference.findMany({
    where: { active: true },
    orderBy: [...referenceOrder],
    select: { id: true, quoteFi: true, quoteEn: true, author: true, imageStorageKey: true, imageUploadedAt: true },
  });
}

/** Public, token-scoped, versioned photo URL (BR-108). The token is the offer's share token. */
export function publicReferenceImageUrl(token: string, referenceId: string, version: string): string {
  return `/api/public/offers/${token}/references/${referenceId}/image?v=${encodeURIComponent(version)}`;
}

/** A reference's photo, if it has one. */
export interface StoredImage {
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  version: string;
}

export function storedImage(r: Reference): StoredImage | null {
  const version = imageVersion(r);
  if (!r.imageStorageKey || !r.imageContentType || r.imageSizeBytes === null || version === null) return null;
  return { storageKey: r.imageStorageKey, contentType: r.imageContentType, sizeBytes: r.imageSizeBytes, version };
}

/** Long-lived browser caching for a URL whose `?v=` names the current photo. */
const VERSIONED_CACHE = 'private, max-age=31536000, immutable';
/** Anything else: the browser may keep a copy but must revalidate (ETag) each time. */
const UNVERSIONED_CACHE = 'private, no-cache';

/**
 * Send a stored reference photo. The caller has checked access and that the file exists.
 * - `?v=` equal to the current version → cached for a year (a new photo gets a new URL);
 *   any other or missing `v` → revalidated on every view. Other query params are ignored.
 * - Always `private`: shared caches never store it, so a revoked link can't be served from one.
 * Errors (404/429) are sent with `no-store` by the callers and are never cached.
 */
export function sendReferenceImage(
  reply: FastifyReply,
  uploads: UploadDir,
  image: StoredImage,
  request: { query: unknown; headers: { 'if-none-match'?: string | undefined } },
) {
  const requested = (request.query as Record<string, unknown> | undefined)?.v;
  const etag = `"${image.version}"`;
  reply
    .header('Cache-Control', requested === image.version ? VERSIONED_CACHE : UNVERSIONED_CACHE)
    .header('ETag', etag)
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Security-Policy', "default-src 'none'; sandbox");
  const ifNoneMatch = request.headers['if-none-match'];
  if (ifNoneMatch !== undefined && ifNoneMatch.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) {
    return reply.status(304).send();
  }
  return reply
    .header('Content-Type', image.contentType)
    .header('Content-Disposition', 'inline')
    .header('Content-Length', image.sizeBytes)
    .send(createReadStream(uploads.pathOf(image.storageKey)));
}
