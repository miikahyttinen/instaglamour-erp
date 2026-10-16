/**
 * Purchase orders, partner side (docs/api-contract.md "Purchase orders"; UC-034, BR-116…BR-119)
 * and the person's freelancer link (UC-034 A4, BR-113).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import type { Prisma } from '../generated/prisma/client.js';
import { notFound, parseInput, validationError } from '../http/errors.js';
import { requiredText, SHORT_TEXT_MAX, yearString } from '../gigs/schemas.js';
import { isUuid } from '../gigs/store.js';
import {
  cancelPurchaseOrder,
  helsinkiYearRange,
  newestFirst,
  payPurchaseOrder,
  purchaseOrderEventInclude,
  purchaseOrderInclude,
  requirePurchaseOrder,
  toPurchaseOrderDto,
  toPurchaseOrderEventDto,
  unpayPurchaseOrder,
} from '../purchaseOrders/store.js';
import { freelancerSharePath, newFreelancerToken } from '../purchaseOrders/token.js';

type IdParams = { Params: { id: string } };

const listQuery = z.object({
  year: yearString.optional(),
  q: z.string().max(SHORT_TEXT_MAX).optional(),
  status: z.enum(['OPEN', 'PAID', 'CANCELLED'], { message: 'INVALID_VALUE' }).optional(),
});

const eventsQuery = z.object({
  limit: z
    .string()
    .regex(/^\d{1,3}$/, { message: 'INVALID_VALUE' })
    .transform(Number)
    .refine((n) => n >= 1 && n <= 200, { message: 'INVALID_VALUE' })
    .optional(),
});

const cancelBody = z.object({ reason: requiredText(SHORT_TEXT_MAX) });

/** Newest first, `seq` (insertion order) breaks ties. */
const eventOrder = [{ at: 'desc' }, { seq: 'desc' }] as const satisfies Prisma.PurchaseOrderEventOrderByWithRelationInput[];

export function purchaseOrderRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  const requireId = (id: string) => {
    if (!isUuid(id)) throw notFound('Purchase order not found');
    return id;
  };

  app.get('/api/purchase-orders', async (request) => {
    const query = parseInput(listQuery, request.query);
    const q = query.q?.trim() ?? '';
    // With a search term every year is searched and `year` is ignored (BR-119).
    if (q === '' && query.year === undefined) throw validationError({ year: 'REQUIRED' });
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(q !== ''
        ? {
            OR: [
              { number: { contains: q, mode: 'insensitive' } },
              { person: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : { createdAt: helsinkiYearRange(query.year!) }),
      ...(query.status && { status: query.status }),
    };
    const purchaseOrders = await db.purchaseOrder.findMany({ where, include: purchaseOrderInclude, orderBy: newestFirst });
    return { purchaseOrders: purchaseOrders.map(toPurchaseOrderDto) };
  });

  app.get('/api/purchase-orders/events', async (request) => {
    const { limit } = parseInput(eventsQuery, request.query);
    const events = await db.purchaseOrderEvent.findMany({
      include: purchaseOrderEventInclude,
      orderBy: eventOrder,
      take: limit ?? 50,
    });
    return events.map(toPurchaseOrderEventDto);
  });

  app.get<IdParams>('/api/purchase-orders/:id', async (request) =>
    toPurchaseOrderDto(await requirePurchaseOrder(db, requireId(request.params.id))),
  );

  app.get<IdParams>('/api/purchase-orders/:id/history', async (request) => {
    const id = requireId(request.params.id);
    const po = await db.purchaseOrder.findUnique({ where: { id }, select: { id: true } });
    if (!po) throw notFound('Purchase order not found');
    const events = await db.purchaseOrderEvent.findMany({
      where: { purchaseOrderId: id },
      include: purchaseOrderEventInclude,
      orderBy: eventOrder,
    });
    return events.map(toPurchaseOrderEventDto);
  });

  app.post<IdParams>('/api/purchase-orders/:id/pay', async (request) => {
    const me = request.requirePartner();
    return toPurchaseOrderDto(await payPurchaseOrder(db, requireId(request.params.id), me.id));
  });

  app.post<IdParams>('/api/purchase-orders/:id/unpay', async (request) => {
    const me = request.requirePartner();
    return toPurchaseOrderDto(await unpayPurchaseOrder(db, requireId(request.params.id), me.id));
  });

  app.post<IdParams>('/api/purchase-orders/:id/cancel', async (request) => {
    const me = request.requirePartner();
    const { reason } = parseInput(cancelBody, request.body);
    return toPurchaseOrderDto(await cancelPurchaseOrder(db, requireId(request.params.id), me.id, reason));
  });

  // ---------------------------------------------------------------- freelancer link (BR-113)
  const requirePersonId = async (id: string) => {
    const person = isUuid(id) ? await db.person.findUnique({ where: { id }, select: { id: true, freelancerToken: true } }) : null;
    if (!person) throw notFound('Person not found');
    return person;
  };

  app.get<IdParams>('/api/people/:id/freelancer-link', async (request) => {
    const person = await requirePersonId(request.params.id);
    return { sharePath: freelancerSharePath(person.freelancerToken) };
  });

  app.post<IdParams>('/api/people/:id/freelancer-link/regenerate', async (request) => {
    const person = await requirePersonId(request.params.id);
    const updated = await db.person.update({
      where: { id: person.id },
      data: { freelancerToken: newFreelancerToken() },
      select: { freelancerToken: true },
    });
    return { sharePath: freelancerSharePath(updated.freelancerToken) };
  });
}
