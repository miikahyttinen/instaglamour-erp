/** GET/PATCH /api/me (UC-001 A1, BR-081), GET /api/me/events (My gigs) and GET /api/me/offers (My offers). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { todayIso } from '../domain/dates.js';
import { LANGUAGES } from '../domain/enums.js';
import { loadMyEvents } from '../events/myEvents.js';
import { parseInput } from '../http/errors.js';
import { loadMyOffers } from '../offers/myOffers.js';
import { toPartnerDto } from '../serializers.js';
import type { AppDeps } from '../app.js';

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

const patchMeBody = z.object({
  language: z.enum(LANGUAGES, { message: 'INVALID_VALUE' }).optional(),
  selectedYear: z
    .number({ message: 'INVALID_VALUE' })
    .int({ message: 'INVALID_VALUE' })
    .min(MIN_YEAR, { message: 'INVALID_VALUE' })
    .max(MAX_YEAR, { message: 'INVALID_VALUE' })
    .optional(),
});

export function meRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/api/me', (request, reply) => reply.send(toPartnerDto(request.requirePartner())));

  app.patch('/api/me', async (request) => {
    const me = request.requirePartner();
    const body = parseInput(patchMeBody, request.body);
    const updated = await db.partner.update({
      where: { id: me.id },
      data: {
        ...(body.language !== undefined && { language: body.language }),
        ...(body.selectedYear !== undefined && { selectedYear: body.selectedYear }),
      },
      include: { person: true },
    });
    return toPartnerDto(updated);
  });

  // My gigs: upcoming (start date ≥ today, Helsinki) SOLD events where I produce or play.
  app.get('/api/me/events', async (request) => {
    const me = request.requirePartner();
    return loadMyEvents(db, { partnerId: me.id, personId: me.personId ?? null }, todayIso());
  });

  // My offers: my accepted offers without a done contract, and my open offers awaiting follow-up.
  app.get('/api/me/offers', async (request) => {
    const me = request.requirePartner();
    return loadMyOffers(db, me.id, todayIso());
  });
}
