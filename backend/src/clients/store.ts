/** Client data access (UC-027, BR-100, BR-101). */
import type { Client } from '../generated/prisma/client.js';
import { isUuid, type Tx } from '../events/store.js';

/** Contract `Client`. */
export interface ClientDto {
  id: string;
  name: string;
  notes: string | null;
}

export function toClientDto(client: Client): ClientDto {
  return { id: client.id, name: client.name, notes: client.notes };
}

/** A non-deleted client by id; malformed, unknown and deleted ids give null. */
export async function findActiveClient(db: Tx, id: string): Promise<Client | null> {
  if (!isUuid(id)) return null;
  return db.client.findFirst({ where: { id, deletedAt: null } });
}

/**
 * Lock a non-deleted client against concurrent deletion for the rest of the transaction
 * (FOR SHARE conflicts with the FOR UPDATE taken by DELETE /api/clients/{id}). False if the
 * client is unknown or deleted.
 */
export async function lockActiveClient(tx: Tx, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"::text FROM "client" WHERE "id" = ${id}::uuid AND "deleted_at" IS NULL FOR SHARE`;
  return rows.length > 0;
}

/**
 * True if another non-deleted client has this name, compared the same way as the database index
 * "client_active_name_key" (lower(btrim(name))).
 */
export async function clientNameTaken(db: Tx, name: string, exceptId: string | null): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id"::text FROM "client"
    WHERE "deleted_at" IS NULL AND lower(btrim("name")) = lower(btrim(${name}))
      AND (${exceptId}::uuid IS NULL OR "id" <> ${exceptId}::uuid)
    LIMIT 1`;
  return rows.length > 0;
}
