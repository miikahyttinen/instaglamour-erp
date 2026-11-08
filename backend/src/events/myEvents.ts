/**
 * My gigs (docs/api-contract.md "My gigs page replaces the Year page"): the signed-in partner's
 * upcoming SOLD, non-deleted events where they are the producer or play a musician role.
 */
import { dateFromIso, isoFromDate } from '../domain/dates.js';
import { isMusicianRole, MUSICIAN_ROLES } from '../domain/enums.js';
import { isNotFullyStaffed } from '../domain/eventEconomics.js';
import type { CostType, Prisma } from '../generated/prisma/client.js';
import { compareCostLines } from './serialize.js';
import type { Tx } from './store.js';

export type MyRole = { kind: 'PRODUCER' } | { kind: 'MUSICIAN'; type: CostType; description: string | null };

export interface MyEventDto {
  eventId: string;
  startDate: string;
  endDate: string | null;
  lineupName: string;
  venue: string;
  clientName: string | null;
  roles: MyRole[];
  notFullyStaffed: boolean;
}

export async function loadMyEvents(
  db: Tx,
  me: { partnerId: string; personId: string | null },
  today: string,
): Promise<MyEventDto[]> {
  const { partnerId, personId } = me;
  const involvement: Prisma.EventWhereInput[] = [{ producerId: partnerId }];
  // A partner with no linked person only gets producer gigs.
  if (personId) involvement.push({ costLines: { some: { personId, type: { in: [...MUSICIAN_ROLES] } } } });

  const events = await db.event.findMany({
    where: { status: 'SOLD', deletedAt: null, startDate: { gte: dateFromIso(today) }, OR: involvement },
    include: { costLines: true, client: { select: { name: true } } },
    orderBy: [{ startDate: 'asc' }, { lineupName: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  return events.map((event) => {
    const roles: MyRole[] = [];
    if (event.producerId === partnerId) roles.push({ kind: 'PRODUCER' });
    if (personId) {
      for (const line of [...event.costLines].sort(compareCostLines)) {
        if (line.personId !== personId || !isMusicianRole(line.type)) continue;
        roles.push({
          kind: 'MUSICIAN',
          type: line.type,
          description: line.type === 'OTHER_ROLE' ? line.description : null,
        });
      }
    }
    return {
      eventId: event.id,
      startDate: isoFromDate(event.startDate),
      endDate: event.endDate ? isoFromDate(event.endDate) : null,
      lineupName: event.lineupName,
      venue: event.venue,
      clientName: event.client?.name ?? null,
      roles,
      notFullyStaffed: isNotFullyStaffed(event.costLines),
    };
  });
}
