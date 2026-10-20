/**
 * The gig create path (docs/api-contract.md "GigCreate"; BR-020, BR-021, BR-111), shared by
 * `POST /api/gigs` and `POST /api/offers/{id}/convert` (BR-105) so both validate and create alike.
 */
import { z } from 'zod';
import { findActiveClient } from '../clients/store.js';
import { defaultCostLines } from '../domain/costLines.js';
import { dateFromIso } from '../domain/dates.js';
import type { CostType, Prisma } from '../generated/prisma/client.js';
import { parseInput, validationError, type FieldCode } from '../http/errors.js';
import type { FeeSettings } from '../routes/reference.js';
import { flag, isoDate, logistics, LONG_TEXT_MAX, money, optionalText, requiredText, technicalSetup } from './schemas.js';
import { isUuid, logEvent, type Tx } from './store.js';

export const gigCreateBody = z.object({
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  lineupTemplateId: z.string().nullable().optional(),
  lineupName: optionalText(),
  venue: requiredText(),
  technicalSetup: technicalSetup.optional(),
  logistics: logistics.optional(),
  houseTechnician: flag.optional(),
  sellerId: z.string().min(1),
  producerId: z.string().min(1),
  priceCents: money,
  additionalSalesCents: money.optional(),
  additionalSalesDescription: optionalText(),
  notes: optionalText(LONG_TEXT_MAX),
  clientId: z.string().nullable().optional(),
});

export type GigCreateInput = z.infer<typeof gigCreateBody>;

/** A validated GigCreate with what the insert needs (template roles, seller/producer persons). */
export interface PreparedGig {
  input: GigCreateInput;
  template: { id: string; name: string; roles: { role: CostType; defaultFeeCents: number }[] } | null;
  sellerPersonId: string;
  producerPersonId: string;
}

export type GigFees = Pick<FeeSettings, 'officeDefaultCents' | 'salesDefaultCents' | 'productionDefaultCents'>;

/** Parse and validate a GigCreate body; 400 VALIDATION_ERROR exactly as `POST /api/gigs`. */
export async function prepareGigCreate(db: Tx, rawBody: unknown): Promise<PreparedGig> {
  const input = parseInput(gigCreateBody, rawBody);

  const fields: Record<string, FieldCode> = {};
  if (input.endDate && input.endDate < input.startDate) fields.endDate = 'END_BEFORE_START';

  let template: PreparedGig['template'] = null;
  if (input.lineupTemplateId) {
    template = isUuid(input.lineupTemplateId)
      ? await db.lineupTemplate.findUnique({
          where: { id: input.lineupTemplateId },
          include: { roles: { orderBy: { position: 'asc' } } },
        })
      : null;
    if (!template) fields.lineupTemplateId = 'UNKNOWN_REFERENCE';
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

/** Insert the gig with its default cost lines (BR-020, BR-021) and log CREATED; returns the gig id. */
export async function insertGig(
  tx: Prisma.TransactionClient,
  gig: PreparedGig,
  options: { partnerId: string; fees: GigFees; offerId?: string },
): Promise<string> {
  const { input, template } = gig;
  const lines = defaultCostLines({
    templateRoles: template?.roles ?? [],
    sellerPersonId: gig.sellerPersonId,
    producerPersonId: gig.producerPersonId,
    fees: options.fees,
  });
  const createdBase = Date.now();
  const created = await tx.gig.create({
    data: {
      startDate: dateFromIso(input.startDate),
      endDate: input.endDate ? dateFromIso(input.endDate) : null,
      lineupTemplateId: template?.id ?? null,
      lineupName: input.lineupName ?? template!.name,
      venue: input.venue,
      technicalSetup: input.technicalSetup ?? null,
      logistics: input.logistics ?? null,
      houseTechnician: input.houseTechnician ?? false,
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
  await logEvent(tx, { gigId: created.id, type: 'CREATED', partnerId: options.partnerId });
  return created.id;
}
