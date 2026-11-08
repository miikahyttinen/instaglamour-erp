/** GET /api/me/events (My gigs, TASK-056). Synthetic data only (BR-090). */
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMyEvents, type MyEventDto } from '../src/events/myEvents.js';
import type { CostType } from '../src/generated/prisma/client.js';
import { closeTestDb, createPartner, login, resetDb, testApp, testDb } from './helpers.js';

type Partner = Awaited<ReturnType<typeof createPartner>>;

let app: FastifyInstance;
let cookie: string;
let a: Partner;
let b: Partner;

/** Freeze "today" (Helsinki). */
function setToday(isoInstant: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(isoInstant));
}

beforeEach(async () => {
  await resetDb();
  a = await createPartner('Partner A', 'partner.a@example.com');
  b = await createPartner('Partner B', 'partner.b@example.com');
  app = await testApp();
  cookie = await login(app, 'partner.a@example.com');
  // 2026-06-15 midday in Helsinki.
  setToday('2026-06-15T09:00:00.000Z');
});
afterEach(async () => {
  vi.useRealTimers();
  await app.close();
});
afterAll(closeTestDb);

interface Line {
  type: CostType;
  personId?: string | null;
  description?: string | null;
}

let lineClock = Date.UTC(2026, 0, 1);

async function createEvent(
  options: {
    startDate?: string;
    endDate?: string | null;
    producerId?: string;
    lineupName?: string;
    status?: 'SOLD' | 'CANCELLED';
    deleted?: boolean;
    clientName?: string;
    lines?: Line[];
  } = {},
) {
  const db = testDb();
  const client = options.clientName ? await db.client.create({ data: { name: options.clientName } }) : null;
  const event = await db.event.create({
    data: {
      startDate: new Date(`${options.startDate ?? '2026-07-01'}T00:00:00.000Z`),
      endDate: options.endDate ? new Date(`${options.endDate}T00:00:00.000Z`) : null,
      status: options.status ?? 'SOLD',
      lineupName: options.lineupName ?? 'Lineup X',
      venue: 'Venue X',
      sellerId: b.id,
      producerId: options.producerId ?? b.id,
      priceCents: 100000,
      clientId: client?.id ?? null,
      deletedAt: options.deleted ? new Date() : null,
      deletedById: options.deleted ? b.id : null,
    },
  });
  // Explicit, increasing creation times so the cost-line order is deterministic.
  for (const line of options.lines ?? []) {
    lineClock += 1000;
    await db.costLine.create({
      data: {
        eventId: event.id,
        type: line.type,
        personId: line.personId ?? null,
        description: line.description ?? null,
        budgetedCents: 10000,
        createdAt: new Date(lineClock),
      },
    });
  }
  return event;
}

async function getMyEvents(c = cookie) {
  const res = await app.inject({ method: 'GET', url: '/api/me/events', headers: { cookie: c } });
  expect(res.statusCode).toBe(200);
  return res.json<MyEventDto[]>();
}

describe('GET /api/me/events', () => {
  it('requires a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me/events' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('is empty when the partner has no upcoming gigs', async () => {
    expect(await getMyEvents()).toEqual([]);
  });

  it('producer only: PRODUCER role, full MyEvent shape', async () => {
    const e = await createEvent({
      producerId: a.id,
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      clientName: 'Client X',
      lines: [{ type: 'VOC', personId: b.personId }, { type: 'PRODUCTION', personId: a.personId }],
    });
    expect(await getMyEvents()).toEqual([
      {
        eventId: e.id,
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        lineupName: 'Lineup X',
        venue: 'Venue X',
        clientName: 'Client X',
        roles: [{ kind: 'PRODUCER' }],
        notFullyStaffed: false,
      },
    ]);
  });

  it('musician only: one MUSICIAN role; endDate and clientName null', async () => {
    const e = await createEvent({ lines: [{ type: 'BASS', personId: a.personId }] });
    expect(await getMyEvents()).toEqual([
      {
        eventId: e.id,
        startDate: '2026-07-01',
        endDate: null,
        lineupName: 'Lineup X',
        venue: 'Venue X',
        clientName: null,
        roles: [{ kind: 'MUSICIAN', type: 'BASS', description: null }],
        notFullyStaffed: false,
      },
    ]);
  });

  it('producer who also plays gets both roles, PRODUCER first', async () => {
    await createEvent({ producerId: a.id, lines: [{ type: 'GUITAR', personId: a.personId }] });
    const [event] = await getMyEvents();
    expect(event?.roles).toEqual([{ kind: 'PRODUCER' }, { kind: 'MUSICIAN', type: 'GUITAR', description: null }]);
  });

  it('multiple musician lines in cost-line order; OTHER_ROLE carries its description', async () => {
    await createEvent({
      lines: [
        { type: 'VOC', personId: a.personId },
        { type: 'BASS', personId: b.personId },
        { type: 'OTHER_ROLE', personId: a.personId, description: 'Role 1' },
        { type: 'DRUMS', personId: a.personId },
      ],
    });
    const [event] = await getMyEvents();
    expect(event?.roles).toEqual([
      { kind: 'MUSICIAN', type: 'VOC', description: null },
      { kind: 'MUSICIAN', type: 'OTHER_ROLE', description: 'Role 1' },
      { kind: 'MUSICIAN', type: 'DRUMS', description: null },
    ]);
  });

  it('internal roles and expenses on my person do not count', async () => {
    await createEvent({
      lines: [
        { type: 'PRODUCTION', personId: a.personId },
        { type: 'OFFICE', personId: a.personId },
        { type: 'SALES', personId: a.personId },
      ],
    });
    expect(await getMyEvents()).toEqual([]);
  });

  it('notFullyStaffed follows BR-023 (an unassigned musician-role line)', async () => {
    const open = await createEvent({
      startDate: '2026-07-01',
      lines: [{ type: 'VOC', personId: a.personId }, { type: 'BASS', personId: null }],
    });
    const full = await createEvent({
      startDate: '2026-07-02',
      lines: [{ type: 'VOC', personId: a.personId }, { type: 'OFFICE', personId: null }],
    });
    const body = await getMyEvents();
    expect(body.map((e: { eventId: string; notFullyStaffed: boolean }) => [e.eventId, e.notFullyStaffed])).toEqual([
      [open.id, true],
      [full.id, false],
    ]);
  });

  it('excludes past, cancelled and deleted gigs', async () => {
    await createEvent({ producerId: a.id, startDate: '2026-06-14' });
    await createEvent({ producerId: a.id, status: 'CANCELLED' });
    await createEvent({ producerId: a.id, deleted: true });
    await createEvent({ lines: [{ type: 'VOC', personId: a.personId }], status: 'CANCELLED' });
    await createEvent({ lines: [{ type: 'VOC', personId: a.personId }], deleted: true });
    await createEvent({ lines: [{ type: 'VOC', personId: a.personId }], startDate: '2025-12-31' });
    const kept = await createEvent({ producerId: a.id, startDate: '2026-06-15' });
    expect((await getMyEvents()).map((e: { eventId: string }) => e.eventId)).toEqual([kept.id]);
  });

  it("excludes other partners' gigs and shows each partner only their own", async () => {
    const mine = await createEvent({ producerId: a.id });
    const theirs = await createEvent({ producerId: b.id, lines: [{ type: 'VOC', personId: b.personId }] });
    expect((await getMyEvents()).map((e: { eventId: string }) => e.eventId)).toEqual([mine.id]);

    const bCookie = await login(app, 'partner.b@example.com');
    const bEvents = await getMyEvents(bCookie);
    expect(bEvents).toHaveLength(1);
    expect(bEvents[0]).toMatchObject({
      eventId: theirs.id,
      roles: [{ kind: 'PRODUCER' }, { kind: 'MUSICIAN', type: 'VOC', description: null }],
    });
  });

  it('sorted by start date, then lineup name', async () => {
    const e3 = await createEvent({ producerId: a.id, startDate: '2026-08-01', lineupName: 'Lineup A' });
    const e2 = await createEvent({ producerId: a.id, startDate: '2026-07-01', lineupName: 'Lineup B' });
    const e1 = await createEvent({ producerId: a.id, startDate: '2026-07-01', lineupName: 'Lineup A' });
    const e0 = await createEvent({ lines: [{ type: 'VOC', personId: a.personId }], startDate: '2026-06-20' });
    expect((await getMyEvents()).map((e: { eventId: string }) => e.eventId)).toEqual([e0.id, e1.id, e2.id, e3.id]);
  });

  it('"today" is evaluated in Helsinki: just after local midnight yesterday is past', async () => {
    const yesterday = await createEvent({ producerId: a.id, startDate: '2026-06-14' });
    const today = await createEvent({ producerId: a.id, startDate: '2026-06-15' });
    // 2026-06-14T21:30Z is already 2026-06-15 00:30 in Helsinki (UTC+3).
    setToday('2026-06-14T21:30:00.000Z');
    expect((await getMyEvents()).map((e: { eventId: string }) => e.eventId)).toEqual([today.id]);
    // 2026-06-14T20:30Z is still 2026-06-14 23:30 in Helsinki.
    setToday('2026-06-14T20:30:00.000Z');
    expect((await getMyEvents()).map((e: { eventId: string }) => e.eventId)).toEqual([yesterday.id, today.id]);
  });

  it('partner without musician lines (no person involvement) only gets producer gigs', async () => {
    // Every partner has a linked person in the schema; with no own musician lines only producer gigs show.
    const produced = await createEvent({ producerId: a.id });
    await createEvent({ lines: [{ type: 'VOC', personId: b.personId }] });
    const body = await getMyEvents();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ eventId: produced.id, roles: [{ kind: 'PRODUCER' }] });
  });

  it('partner without a linked person only gets producer gigs (store level)', async () => {
    const produced = await createEvent({ producerId: a.id, lines: [{ type: 'VOC', personId: a.personId }] });
    await createEvent({ lines: [{ type: 'VOC', personId: a.personId }] });
    const body = await loadMyEvents(testDb(), { partnerId: a.id, personId: null }, '2026-06-15');
    expect(body.map((e) => [e.eventId, e.roles])).toEqual([[produced.id, [{ kind: 'PRODUCER' }]]]);
  });
});
