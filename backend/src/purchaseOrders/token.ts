/**
 * Freelancer link tokens (BR-113): 32 bytes from the OS CSPRNG, base64url (43 chars, no padding).
 * The database default (migration 20261016120000_purchase_orders) gives every new person one;
 * regenerating replaces it with a token from here.
 */
import { randomBytes } from 'node:crypto';
import { SHARE_TOKEN_BYTES } from '../offers/shareToken.js';

/** base64url, at least 43 chars (32 bytes); the upper bound only stops absurd inputs early. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43,128}$/;

export function newFreelancerToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString('base64url');
}

/** True if the value could be a token we issued (cheap pre-check before touching the database). */
export function isWellFormedFreelancerToken(value: string): boolean {
  return TOKEN_FORMAT.test(value);
}

export function freelancerSharePath(token: string): string {
  return `/f/${token}`;
}
