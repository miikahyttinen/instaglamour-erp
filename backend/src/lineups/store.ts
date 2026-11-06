/**
 * Lineups (api-contract "Lineups and settings page", owner decision 2026-11-06): the cost templates
 * of new events. Shapes, validation and the shared name rule (unique case-insensitively, trimmed).
 */
import { z } from 'zod';
import { COST_TYPES, DESCRIPTION_REQUIRED_TYPES } from '../domain/enums.js';
import type { LineupLineInput } from '../domain/costLines.js';
import type { CostType, LineupLine, LineupTemplate, Prisma } from '../generated/prisma/client.js';
import { flag, money, oneOf, optionalText, requiredText } from '../events/schemas.js';
import type { Tx } from '../events/store.js';
import { validationError, zodErrorToFields, type FieldCode } from '../http/errors.js';

/** Most lines one lineup may have. */
export const MAX_LINEUP_LINES = 100;

/** Advisory lock held while a lineup name is checked and written (no two lineups with the same name). */
export const LINEUP_NAME_LOCK = 'lineup_template:name';

export const lineupLineSchema = z
  .object({
    type: oneOf(COST_TYPES),
    description: optionalText(),
    defaultCents: money,
  })
  .superRefine((line, ctx) => {
    if (DESCRIPTION_REQUIRED_TYPES.has(line.type) && !line.description) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'DESCRIPTION_REQUIRED' });
    }
  })
  .transform((l): LineupLineInput => ({ type: l.type, description: l.description ?? null, defaultCents: l.defaultCents }));

/** More than MAX_LINEUP_LINES lines → `lines: TOO_LONG` (contract clarification). */
const lines = z.array(lineupLineSchema).max(MAX_LINEUP_LINES, { message: 'TOO_LONG' });

export const lineupCreateBody = z.object({ name: requiredText(), lines: lines.optional() });
export const lineupPatchBody = z.object({ name: requiredText().optional(), active: flag.optional(), lines: lines.optional() });

/** api-contract `LineupLine`. */
export interface LineupLineDto {
  type: CostType;
  description: string | null;
  defaultCents: number;
}

/** api-contract `LineupTemplate`. */
export interface LineupTemplateDto {
  id: string;
  name: string;
  active: boolean;
  lines: LineupLineDto[];
  eventCount: number;
}

export const lineupInclude = {
  lines: { orderBy: { position: 'asc' } },
  _count: { select: { events: true } },
} satisfies Prisma.LineupTemplateInclude;

export type LineupWithLines = LineupTemplate & { lines: LineupLine[]; _count: { events: number } };

export function toLineupLineDto(l: Pick<LineupLine, 'type' | 'description' | 'defaultCents'>): LineupLineDto {
  return { type: l.type, description: l.description, defaultCents: l.defaultCents };
}

export function toLineupTemplateDto(t: LineupWithLines): LineupTemplateDto {
  return { id: t.id, name: t.name, active: t.active, lines: t.lines.map(toLineupLineDto), eventCount: t._count.events };
}

/** Serialise lineup writes that check names (the database index is case-sensitive only). */
export async function lockLineupNames(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${LINEUP_NAME_LOCK}, 0))`;
}

/** The lineup with this name compared case-insensitively and trimmed, other than `exceptId`. */
export async function findLineupByName(db: Tx, name: string, exceptId: string | null = null): Promise<{ id: string } | null> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id"::text FROM "lineup_template"
    WHERE lower(btrim("name")) = lower(btrim(${name}))
      AND (${exceptId}::uuid IS NULL OR "id" <> ${exceptId}::uuid)
    ORDER BY "created_at", "id"
    LIMIT 1`;
  return rows[0] ?? null;
}

/** Replace a lineup's lines with `lines` (in order). */
export async function replaceLineupLines(tx: Prisma.TransactionClient, templateId: string, lines: readonly LineupLineInput[]): Promise<void> {
  await tx.lineupLine.deleteMany({ where: { templateId } });
  if (lines.length > 0) {
    await tx.lineupLine.createMany({
      data: lines.map((l, position) => ({ templateId, position, type: l.type, description: l.description, defaultCents: l.defaultCents })),
    });
  }
}

/**
 * Parse a lineup body; 400 VALIDATION_ERROR with line errors keyed `lines[<index>].<field>`
 * (e.g. `lines[2].description: DESCRIPTION_REQUIRED`), as the contract specifies.
 */
export function parseLineupBody<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {}, { reportInput: true });
  if (result.success) return result.data;
  const fields: Record<string, FieldCode> = {};
  for (const [key, code] of Object.entries(zodErrorToFields(result.error))) {
    fields[key.replace(/^lines\.(\d+)(?=\.|$)/, 'lines[$1]')] = code;
  }
  throw validationError(fields);
}
