/**
 * Automatic final invoice "Loppulasku" (api-contract "Invoicing v3", TASK-049): runFinalInvoiceJob with a
 * fixed clock, the 48 h rule in Helsinki time, once per event, concurrency, and the schedule switch.
 * Synthetic data only (BR-090).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';
import { runFinalInvoiceJob, startFinalInvoiceJob } from '../src/invoicing/finalInvoiceJob.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, createEvent, history, startSession, type Json, type Session } from './eventFixtures.js';
import { testDatabaseUrl } from './testDatabaseUrl.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

const at = (iso: string) => new Date(iso);
/** 10 June 2026 (summer, UTC+3) ends at 11 June 00:00 Helsinki; + 48 h = 13 June 00:00 = 12 June 21:00 UTC. */
const DUE = '2026-06-12T21:00:00.000Z';
const JUST_BEFORE = '2026-06-12T20:59:59.999Z';

const detail = async (id: string): Promise<Json> => (await call(s, 'GET', `/api/events/${id}`)).json();
const addRow = (eventId: string, body: Record<string, unknown>) => call(s, 'POST', `/api/events/${eventId}/invoice-rows`, body);
const run = (now: string, db: Db = testDb()) => runFinalInvoiceJob(db, at(now));

describe('runFinalInvoiceJob', () => {
  it('creates nothing before end + 48 h (Helsinki) and one Loppulasku row at that moment', async () => {
    const event = await createEvent(s, { startDate: '2026-06-10', priceCents: 100000, additionalSalesCents: 20000 });
    const before = await testDb().event.findUniqueOrThrow({ where: { id: event.id } });

    expect(await run(JUST_BEFORE)).toEqual([]);
    expect((await detail(event.id)).invoiceRows).toEqual([]);

    expect(await run(DUE)).toEqual([event.id]);
    const e = await detail(event.id);
    expect(e.invoiceRows).toEqual([
      {
        id: expect.any(String),
        eventId: event.id,
        description: 'Loppulasku',
        amountCents: 120000,
        status: 'NOT_SENT',
        statusAt: DUE,
        statusBy: null,
        createdAt: DUE,
        createdBy: null,
        auto: true,
      },
    ]);
    expect(e).toMatchObject({ notSentCents: 120000, uninvoicedCents: 0, balanceCents: 120000, invoiceState: 'OPEN_INVOICES' });
    expect(e).not.toHaveProperty('finalInvoiceCreatedAt');

    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({
      type: 'INVOICE_ROW_ADDED',
      partnerId: null,
      details: { invoiceRowId: e.invoiceRows[0].id, description: 'Loppulasku', amountCents: 120000, status: 'NOT_SENT', auto: true },
    });

    const after = await testDb().event.findUniqueOrThrow({ where: { id: event.id } });
    expect(after.finalInvoiceCreatedAt?.toISOString()).toBe(DUE);
    expect(after.updatedAt).toEqual(before.updatedAt); // marking is not an edit
  });

  it('uses the end date when there is one; winter time (UTC+2)', async () => {
    const multiDay = await createEvent(s, { startDate: '2026-06-10', endDate: '2026-06-11', venue: 'Venue A' });
    const winter = await createEvent(s, { startDate: '2026-01-10', venue: 'Venue B' });
    expect(await run('2026-01-12T21:59:59.999Z')).toEqual([]);
    expect(await run('2026-01-12T22:00:00.000Z')).toEqual([winter.id]);
    expect(await run(DUE)).toEqual([]); // the multi-day event ends a day later
    expect(await run('2026-06-13T20:59:59.999Z')).toEqual([]);
    expect(await run('2026-06-13T21:00:00.000Z')).toEqual([multiDay.id]);
  });

  it('the amount is what no row covers yet (total − sent − not sent); the row goes last', async () => {
    const event = await createEvent(s, { startDate: '2026-06-10', priceCents: 100000, additionalSalesCents: 20000 });
    await addRow(event.id, { description: 'Ennakkomaksu', amountCents: 30000, status: 'SENT' });
    await addRow(event.id, { description: 'Lasku', amountCents: 20000 });
    expect(await run(DUE)).toEqual([event.id]);
    const e = await detail(event.id);
    expect(e.invoiceRows.map((r: { description: string; amountCents: number; status: string }) => [r.description, r.amountCents, r.status])).toEqual([
      ['Ennakkomaksu', 30000, 'SENT'],
      ['Lasku', 20000, 'NOT_SENT'],
      ['Loppulasku', 70000, 'NOT_SENT'],
    ]);
    expect(e.invoiceRows.map((r: { auto: boolean }) => r.auto)).toEqual([false, false, true]);
    expect(e).toMatchObject({ sentCents: 30000, notSentCents: 90000, uninvoicedCents: 0 });
  });

  it('skips fully covered, cancelled, deleted, total-0 and upcoming events (and does not mark them)', async () => {
    const covered = await createEvent(s, { startDate: '2026-06-10', venue: 'Venue A', priceCents: 100000 });
    await addRow(covered.id, { description: 'Lasku', amountCents: 60000, status: 'SENT' });
    await addRow(covered.id, { description: 'Lasku 2', amountCents: 40000 }); // NOT_SENT counts as covered
    const over = await createEvent(s, { startDate: '2026-06-10', venue: 'Venue B', priceCents: 100000 });
    await addRow(over.id, { description: 'Lasku', amountCents: 150000, status: 'SENT' });
    const cancelled = await createEvent(s, { startDate: '2026-06-10', venue: 'Venue C' });
    await call(s, 'POST', `/api/events/${cancelled.id}/cancel`, { reason: 'Client cancelled' });
    const deleted = await createEvent(s, { startDate: '2026-06-10', venue: 'Venue D' });
    await call(s, 'POST', `/api/events/${deleted.id}/delete`, { reason: 'Duplicate' });
    const zero = await createEvent(s, { startDate: '2026-06-10', venue: 'Venue E', priceCents: 0, additionalSalesCents: 0 });
    const upcoming = await createEvent(s, { startDate: '2026-06-20', venue: 'Venue F' });

    expect(await run(DUE)).toEqual([]);
    for (const e of [covered, over, cancelled, deleted, zero, upcoming]) {
      const row = await testDb().event.findUniqueOrThrow({ where: { id: e.id }, include: { invoiceRows: true } });
      expect(row.finalInvoiceCreatedAt).toBeNull();
    }
    expect(await testDb().invoiceRow.count()).toBe(3); // only the hand-made rows

    // A covered event whose price later rises above its rows gets the difference (not created before).
    await call(s, 'PATCH', `/api/events/${covered.id}`, { priceCents: 110000 });
    expect(await run('2026-06-20T00:00:00.000Z')).toEqual([covered.id]);
    expect((await detail(covered.id)).invoiceRows.at(-1)).toMatchObject({ description: 'Loppulasku', amountCents: 10000 });
  });

  it('only once per event: re-runs create nothing; a deleted Loppulasku is not recreated', async () => {
    const event = await createEvent(s, { startDate: '2026-06-10', priceCents: 100000 });
    expect(await run(DUE)).toEqual([event.id]);
    expect(await run(DUE)).toEqual([]);
    expect(await run('2026-07-01T00:00:00.000Z')).toEqual([]);

    const row = (await detail(event.id)).invoiceRows[0];
    expect((await call(s, 'DELETE', `/api/invoice-rows/${row.id}`)).statusCode).toBe(200);
    // Uninvoiced again, but the final invoice was already created once.
    expect(await detail(event.id)).toMatchObject({ uninvoicedCents: 100000, invoiceRows: [] });
    expect(await run('2026-07-02T00:00:00.000Z')).toEqual([]);
    expect(await testDb().invoiceRow.count()).toBe(0);
    const autoEntries = (await history(s, event.id)).filter((h) => h.details.auto === true);
    expect(autoEntries).toHaveLength(1);
  });

  it('a deleted event is skipped; once restored it gets its final invoice', async () => {
    const event = await createEvent(s, { startDate: '2026-06-10' });
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Mistake' });
    expect(await run(DUE)).toEqual([]);
    await call(s, 'POST', `/api/events/${event.id}/restore`);
    expect(await run(DUE)).toEqual([event.id]);
  });

  it('two runs at the same time (two instances) create exactly one row per event', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push((await createEvent(s, { startDate: '2026-06-10', venue: `Venue ${i}` })).id);
    const other = createDb(testDatabaseUrl());
    try {
      const [first, second] = await Promise.all([run(DUE), run(DUE, other)]);
      // Every event was created by exactly one of the runs.
      expect([...first, ...second].sort()).toEqual([...ids].sort());
    } finally {
      await other.$disconnect();
    }
    for (const id of ids) {
      const rows = await testDb().invoiceRow.findMany({ where: { eventId: id } });
      expect(rows).toHaveLength(1);
      const entries = await testDb().eventHistory.findMany({ where: { eventId: id, type: 'INVOICE_ROW_ADDED' } });
      expect(entries).toHaveLength(1);
    }
  });
});

describe('schedule', () => {
  it('INVOICE_JOB_ENABLED: on by default, off with false / 0', () => {
    const base = { DATABASE_URL: testDatabaseUrl(), SESSION_SECRET: 'test-session-secret-0123456789abcdef', AUTH_ALLOWED_DOMAIN: 'example.com' };
    expect(loadConfig(base).invoiceJobEnabled).toBe(true);
    expect(loadConfig({ ...base, INVOICE_JOB_ENABLED: '' }).invoiceJobEnabled).toBe(true);
    expect(loadConfig({ ...base, INVOICE_JOB_ENABLED: 'true' }).invoiceJobEnabled).toBe(true);
    expect(loadConfig({ ...base, INVOICE_JOB_ENABLED: 'false' }).invoiceJobEnabled).toBe(false);
    expect(loadConfig({ ...base, INVOICE_JOB_ENABLED: '0' }).invoiceJobEnabled).toBe(false);
    expect(() => loadConfig({ ...base, INVOICE_JOB_ENABLED: 'nope' })).toThrow(/INVOICE_JOB_ENABLED/);
  });

  it('startFinalInvoiceJob runs at once, logs what it created and can be stopped', async () => {
    const event = await createEvent(s, { startDate: '2026-01-10' }); // long past
    const infos: object[] = [];
    const errors: object[] = [];
    const stop = startFinalInvoiceJob(testDb(), { info: (o) => infos.push(o), error: (o) => errors.push(o) }, 60_000);
    try {
      for (let i = 0; i < 100 && infos.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
    } finally {
      stop();
    }
    expect(errors).toEqual([]);
    expect(infos).toEqual([{ eventIds: [event.id] }]);
    expect(await testDb().invoiceRow.count()).toBe(1);
  });
});
