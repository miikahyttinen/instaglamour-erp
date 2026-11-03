/**
 * Partner status (UC-032, BR-070, BR-110…112): grant / re-grant / revoke.
 *
 * Every status change runs in one transaction that first takes a transaction-scoped advisory lock,
 * so grants and revocations are strictly serialized. Inside the lock the actor, the target and the
 * number of active partners are re-read, which makes the "never remove yourself / the last active
 * partner" guards hold under concurrent requests (two partners removing each other at once: the
 * second sees only one active partner left → LAST_PARTNER).
 */
import type { Db } from '../db.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppError, notFound, unauthenticated, validationError } from '../http/errors.js';

/** Arbitrary constant key for pg_advisory_xact_lock: "partner status" (any fixed bigint works). */
const PARTNER_STATUS_LOCK_KEY = 20261014_020n;

type Tx = Prisma.TransactionClient;

async function lockPartnerStatus(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PARTNER_STATUS_LOCK_KEY})`;
}

/** The actor must still be an active partner when the lock is held (it may have just been removed). */
async function assertActorActive(tx: Tx, actorId: string): Promise<void> {
  const actor = await tx.partner.findUnique({ where: { id: actorId }, select: { active: true } });
  if (!actor?.active) throw unauthenticated();
}

/** Normalised form stored and compared: trimmed, lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}


const duplicateEmail = () => validationError({ email: 'DUPLICATE' }, 'Email is already used by another partner');

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Another person's partner (active or not) already has this email, case-insensitively. */
async function emailTakenByOther(db: Db | Tx, email: string, personId: string): Promise<boolean> {
  const other = await db.partner.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, personId: { not: personId } },
    select: { id: true },
  });
  return other !== null;
}

/**
 * Make / keep the person an active partner with `email` (already validated and normalised).
 * Re-activating a removed partner keeps its id (and so its events, offers, tasks, hours).
 * Changing an active partner's email revokes its sessions except `keepTokenHash` (the
 * requester's own session when they change their own email): sessions belong to the old account.
 */
export async function grantPartner(
  db: Db,
  input: { personId: string; email: string; actorId: string; keepTokenHash: string | null },
  now = new Date(),
): Promise<void> {
  const { personId, email, actorId } = input;
  // Cheap pre-check outside the lock so the check order stays validation (400) → existence (404).
  if (await emailTakenByOther(db, email, personId)) throw duplicateEmail();

  try {
    await db.$transaction(async (tx) => {
      await lockPartnerStatus(tx);
      await assertActorActive(tx, actorId);
      const person = await tx.person.findUnique({ where: { id: personId }, include: { partner: true } });
      if (!person) throw notFound('Person not found');
      if (await emailTakenByOther(tx, email, personId)) throw duplicateEmail();
      // An inactive person can't be (or stay, via PUT) a partner: re-activate the person first.
      if (!person.active) throw new AppError('INVALID_STATUS_TRANSITION', 'An inactive person cannot be made a partner');

      const partner = person.partner;
      if (!partner) {
        await tx.partner.create({ data: { personId, email, active: true, grantedById: actorId, grantedAt: now } });
      } else if (!partner.active) {
        await tx.partner.update({
          where: { id: partner.id },
          data: { email, active: true, grantedById: actorId, grantedAt: now, revokedById: null, revokedAt: null },
        });
        // Defensive: none should exist (removal deletes them), but a re-grant must never revive one.
        await tx.session.deleteMany({ where: { partnerId: partner.id } });
      } else if (partner.email !== email) {
        await tx.partner.update({ where: { id: partner.id }, data: { email } });
        await tx.session.deleteMany({
          where: {
            partnerId: partner.id,
            ...(input.keepTokenHash !== null && { tokenHash: { not: input.keepTokenHash } }),
          },
        });
      }
      // Active with the same email: no-op (nothing written).
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateEmail();
    throw err;
  }
}

/**
 * Deactivate the person's partner and delete all its sessions in the same transaction (BR-111).
 * 404 when the person doesn't exist or isn't an active partner; 409 CANNOT_REMOVE_SELF / LAST_PARTNER (BR-112).
 */
export async function revokePartner(db: Db, input: { personId: string; actorId: string }, now = new Date()): Promise<void> {
  const { personId, actorId } = input;
  await db.$transaction(async (tx) => {
    await lockPartnerStatus(tx);
    const partner = await tx.partner.findUnique({ where: { personId } });
    if (!partner || !partner.active) throw notFound('Person is not a partner');
    if (partner.id === actorId) throw new AppError('CANNOT_REMOVE_SELF', 'A partner cannot remove their own partner status');
    const activeCount = await tx.partner.count({ where: { active: true } });
    if (activeCount <= 1) throw new AppError('LAST_PARTNER', 'The last active partner cannot be removed');
    await assertActorActive(tx, actorId);

    await tx.partner.update({
      where: { id: partner.id },
      data: { active: false, revokedById: actorId, revokedAt: now },
    });
    await tx.session.deleteMany({ where: { partnerId: partner.id } });
  });
}

/** Ids among `ids` that are active partners (for new seller/producer/owner choices, BR-111). */
export async function activePartnerIds(db: Db, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.partner.findMany({ where: { id: { in: [...ids] }, active: true }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}
