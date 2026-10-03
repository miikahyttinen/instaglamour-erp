/**
 * Server-side sessions (UC-001): the httpOnly cookie carries a random token, the database
 * stores only its SHA-256 hash. 30-day sliding expiry.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import type { Db } from '../db.js';
import type { Partner, Person } from '../generated/prisma/client.js';

export const SESSION_COOKIE = 'ig_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Avoid a DB write on every request: only extend when this much time has passed since the last extension. */
const SLIDE_THRESHOLD_MS = 60 * 60 * 1000;

export type PartnerWithPerson = Partner & { person: Person };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(config: AppConfig, expires: Date) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.secureCookies,
    signed: true,
    expires,
  };
}

export async function startSession(
  db: Db,
  config: AppConfig,
  reply: FastifyReply,
  partnerId: string,
  now = new Date(),
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.session.create({ data: { tokenHash: hashToken(token), partnerId, expiresAt } });
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(config, expiresAt));
}

function readToken(request: FastifyRequest): string | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
}

/** Resolve the signed-in partner, sliding the expiry forward. Returns null when there is no valid session. */
export async function resolveSession(
  db: Db,
  config: AppConfig,
  request: FastifyRequest,
  reply: FastifyReply,
  now = new Date(),
): Promise<PartnerWithPerson | null> {
  const token = readToken(request);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { partner: { include: { person: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= now.getTime()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const newExpiry = new Date(now.getTime() + SESSION_TTL_MS);
  if (newExpiry.getTime() - session.expiresAt.getTime() >= SLIDE_THRESHOLD_MS) {
    await db.session.update({ where: { id: session.id }, data: { expiresAt: newExpiry } });
    reply.setCookie(SESSION_COOKIE, token, cookieOptions(config, newExpiry));
  }
  return session.partner;
}

export async function endSession(db: Db, config: AppConfig, request: FastifyRequest, reply: FastifyReply) {
  const token = readToken(request);
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.secureCookies });
}
