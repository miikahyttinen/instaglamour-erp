/**
 * Public offer link tokens (BR-104).
 *
 * A token is 32 bytes from the OS CSPRNG, base64url-encoded (43 chars, URL-safe, no padding).
 * The plain token is stored so the share link can be shown again; lookups from the public
 * endpoint go through its SHA-256 hash, so the database index comparison never works on the
 * secret itself (timing of the b-tree walk only leaks bits of a hash of the guess).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SHARE_TOKEN_BYTES = 32;
/** base64url length of SHARE_TOKEN_BYTES bytes, without padding. */
export const SHARE_TOKEN_LENGTH = Math.ceil((SHARE_TOKEN_BYTES * 4) / 3);

const TOKEN_FORMAT = new RegExp(`^[A-Za-z0-9_-]{${SHARE_TOKEN_LENGTH}}$`);

export interface ShareToken {
  token: string;
  hash: string;
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function newShareToken(): ShareToken {
  const token = randomBytes(SHARE_TOKEN_BYTES).toString('base64url');
  return { token, hash: hashShareToken(token) };
}

/** True if the value could be a token we issued (cheap pre-check before touching the database). */
export function isWellFormedShareToken(value: string): boolean {
  return TOKEN_FORMAT.test(value);
}

/** Constant-time string comparison (same-length inputs; different lengths are simply unequal). */
export function sameToken(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function sharePath(token: string): string {
  return `/o/${token}`;
}
