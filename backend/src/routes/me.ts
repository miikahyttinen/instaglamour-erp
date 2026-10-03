/** GET/PATCH /api/me (UC-001 A1, BR-081). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LANGUAGES } from '../domain/enums.js';
import { parseInput } from '../http/errors.js';
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
}
