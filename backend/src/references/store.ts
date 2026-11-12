/**
 * References / testimonials (docs/api-contract.md "References"; BR-108): serializers, ordering
 * and image responses shared by the internal and the public endpoints.
 */
import type { FastifyReply } from 'fastify';
import type { Reference } from '../generated/prisma/client.js';
import type { Tx } from '../events/store.js';

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

/**
 * Pass as `omit` to every reference query that doesn't serve the photo itself, so lists and
 * updates never load the bytes (TASK-060).
 */
export const OMIT_IMAGE_DATA = { imageData: true } as const;

/** A reference row without its photo bytes (what OMIT_IMAGE_DATA queries return). */
export type ReferenceMeta = Omit<Reference, 'imageData'>;

/** True when the reference has a photo (metadata is set exactly then, see the schema). */
export const hasImage = (r: { imageUploadedAt: Date | null }): boolean => r.imageUploadedAt !== null;

export function toReferenceDto(r: ReferenceMeta) {
  return {
    id: r.id,
    quoteFi: r.quoteFi,
    quoteEn: r.quoteEn,
    author: r.author,
    hasImage: hasImage(r),
    imageVersion: imageVersion(r),
    sortOrder: r.sortOrder,
    active: r.active,
  };
}

export type ReferenceDto = ReturnType<typeof toReferenceDto>;

/** What the PublicOffer serializer needs of a reference. */
export type PublicReferenceSource = Pick<Reference, 'id' | 'quoteFi' | 'quoteEn' | 'author' | 'imageUploadedAt'>;

/** Active references in display order (BR-108) — the list every offer with showReferences shows. */
export async function loadActiveReferences(db: Tx): Promise<PublicReferenceSource[]> {
  return db.reference.findMany({
    where: { active: true },
    orderBy: [...referenceOrder],
    select: { id: true, quoteFi: true, quoteEn: true, author: true, imageUploadedAt: true },
  });
}

/** Public, token-scoped, versioned photo URL (BR-108). The token is the offer's share token. */
export function publicReferenceImageUrl(token: string, referenceId: string, version: string): string {
  return `/api/public/offers/${token}/references/${referenceId}/image?v=${encodeURIComponent(version)}`;
}

/** A reference's photo, if it has one in the database. */
export interface StoredImage {
  data: Uint8Array;
  contentType: string;
  version: string;
}

/** What the image routes load: everything but the legacy key, incl. the bytes. */
export const IMAGE_SELECT = {
  id: true,
  active: true,
  imageData: true,
  imageContentType: true,
  imageUploadedAt: true,
} as const;

export function storedImage(r: Pick<Reference, 'imageData' | 'imageContentType' | 'imageUploadedAt'>): StoredImage | null {
  const version = imageVersion(r);
  if (!r.imageData || !r.imageContentType || version === null) return null;
  return { data: r.imageData, contentType: r.imageContentType, version };
}

/** Long-lived browser caching for a URL whose `?v=` names the current photo. */
const VERSIONED_CACHE = 'private, max-age=31536000, immutable';
/** Anything else: the browser may keep a copy but must revalidate (ETag) each time. */
const UNVERSIONED_CACHE = 'private, no-cache';

/**
 * Send a stored reference photo. The caller has checked access.
 * - `?v=` equal to the current version → cached for a year (a new photo gets a new URL);
 *   any other or missing `v` → revalidated on every view. Other query params are ignored.
 * - Always `private`: shared caches never store it, so a revoked link can't be served from one.
 * Errors (404/429) are sent with `no-store` by the callers and are never cached.
 */
export function sendReferenceImage(
  reply: FastifyReply,
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
    .header('Content-Length', image.data.byteLength)
    .send(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength));
}
