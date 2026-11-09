/**
 * The event create path (docs/api-contract.md "EventCreate"; BR-020, BR-021, BR-111), shared by
 * `POST /api/events` and `POST /api/offers/{id}/convert` (BR-105) so both validate and create alike.
 */
import { z } from 'zod';
import { findActiveClient } from '../clients/store.js';
import { defaultCostLines, type LineupLineInput } from '../domain/costLines.js';
import { dateFromIso } from '../domain/dates.js';
import type { Prisma } from '../generated/prisma/client.js';
import { parseInput, validationError, type FieldCode } from '../http/errors.js';
import { flag, isoDate, logistics, LONG_TEXT_MAX, money, optionalText, requiredText, technicalSetup } from './schemas.js';
import { isUuid, logHistory, type Tx } from './store.js';

export const eventCreateBody = z.object({
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  lineupTemplateId: z.string().nullable().optional(),
  lineupName: optionalText(),
  venue: requiredText(),
  technicalSetup: technicalSetup.optional(),
  logistics: logistics.optional(),
  houseTechnician: flag.optional(),
  contractDone: flag.optional(),
  sellerId: z.string().min(1),
  producerId: z.string().min(1),
  priceCents: money,
  additionalSalesCents: money.optional(),
  additionalSalesDescription: optionalText(),
  notes: optionalText(LONG_TEXT_MAX),
  clientId: z.string().nullable().optional(),
});

export type EventCreateInput = z.infer<typeof eventCreateBody>;

/** A validated EventCreate with what the insert needs (lineup lines, seller/producer persons). */
export interface PreparedEvent {
  input: EventCreateInput;
  /** The picked (active) lineup with its lines in order; null = custom lineup. */
  template: { id: string; name: string; lines: LineupLineInput[] } | null;
  sellerPersonId: string;
  producerPersonId: string;
}

/** Parse and validate a EventCreate body; 400 VALIDATION_ERROR exactly as `POST /api/events`. */
export async function prepareEventCreate(db: Tx, rawBody: unknown): Promise<PreparedEvent> {
  const input = parseInput(eventCreateBody, rawBody);

  const fields: Record<string, FieldCode> = {};
  if (input.endDate && input.endDate < input.startDate) fields.endDate = 'END_BEFORE_START';

  let template: PreparedEvent['template'] = null;
  if (input.lineupTemplateId) {
    const lineup = isUuid(input.lineupTemplateId)
      ? await db.lineupTemplate.findUnique({
          where: { id: input.lineupTemplateId },
          include: { lines: { orderBy: { position: 'asc' } } },
        })
      : null;
    // Only active lineups can be picked (api-contract "Lineups and settings page").
    if (lineup?.active) {
      template = {
        id: lineup.id,
        name: lineup.name,
        lines: lineup.lines.map((l) => ({ type: l.type, description: l.description, defaultCents: l.defaultCents })),
      };
    } else {
      fields.lineupTemplateId = 'UNKNOWN_REFERENCE';
    }
  } else if (!input.lineupName) {
    fields.lineupName = 'REQUIRED';
  }

  const ids = [input.sellerId, input.producerId].filter(isUuid);
  const rows = ids.length ? await db.partner.findMany({ where: { id: { in: ids } } }) : [];
  const partners = new Map(rows.map((p) => [p.id, p]));
  const seller = partners.get(input.sellerId);
  const producer = partners.get(input.producerId);
  // BR-111: new seller/producer choices must be active partners.
  if (!seller?.active) fields.sellerId = 'UNKNOWN_REFERENCE';
  if (!producer?.active) fields.producerId = 'UNKNOWN_REFERENCE';
  if (input.clientId && !(await findActiveClient(db, input.clientId))) fields.clientId = 'UNKNOWN_REFERENCE';
  if (Object.keys(fields).length > 0) throw validationError(fields);

  return { input, template, sellerPersonId: seller!.personId, producerPersonId: producer!.personId };
}

/** Insert the event with its default cost lines (BR-020, BR-021) and log CREATED; returns the event id. */
export async function insertEvent(
  tx: Prisma.TransactionClient,
  event: PreparedEvent,
  options: { partnerId: string; offerId?: string },
): Promise<string> {
  const { input, template } = event;
  const lines = defaultCostLines({
    lineupLines: template?.lines ?? null,
    sellerPersonId: event.sellerPersonId,
    producerPersonId: event.producerPersonId,
  });
  const createdBase = Date.now();
  const created = await tx.event.create({
    data: {
      startDate: dateFromIso(input.startDate),
      endDate: input.endDate ? dateFromIso(input.endDate) : null,
      lineupTemplateId: template?.id ?? null,
      lineupName: input.lineupName ?? template!.name,
      venue: input.venue,
      technicalSetup: input.technicalSetup ?? null,
      logistics: input.logistics ?? null,
      houseTechnician: input.houseTechnician ?? false,
      contractDone: input.contractDone ?? false,
      sellerId: input.sellerId,
      producerId: input.producerId,
      priceCents: input.priceCents,
      additionalSalesCents: input.additionalSalesCents ?? 0,
      additionalSalesDescription: input.additionalSalesDescription ?? null,
      notes: input.notes ?? null,
      clientId: input.clientId ?? null,
      offerId: options.offerId ?? null,
      // Explicit, increasing creation times keep the lines in creation order (contract).
      costLines: { createMany: { data: lines.map((l, i) => ({ ...l, createdAt: new Date(createdBase + i) })) } },
    },
  });
  await logHistory(tx, { eventId: created.id, type: 'CREATED', partnerId: options.partnerId });
  return created.id;
}
