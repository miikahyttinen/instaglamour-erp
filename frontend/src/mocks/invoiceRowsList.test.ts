// GET /api/invoice-rows mock (api-contract "Laskutus page: all invoice rows").
import { beforeEach, describe, expect, it } from 'vitest';
import { eventsApi, invoiceRowsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { addMockClient, addMockEvent } from '../test/eventFixtures';
import { signInMock } from '../test/renderApp';
import { db, setMockSession } from './data';
import { addAutoFinalInvoice } from './eventStore';

describe('GET /api/invoice-rows mock', () => {
  beforeEach(() => {
    signInMock();
    db.events.invoiceRows.length = 0; // only this test's rows
  });

  it('lists NOT_SENT rows first, then SENT, newest first within each group, with the gig data', async () => {
    const client = addMockClient('Client X');
    const g1 = addMockEvent({ startDate: '2030-03-01', lineupName: 'Band One', venue: 'Venue X', clientId: client.id });
    const g2 = addMockEvent({ startDate: '2031-04-01', lineupName: 'Band Two', venue: 'Venue Y' });
    await eventsApi.update(g1.id, { invoicingDetails: 'Line 1\nLine 2' });
    await invoiceRowsApi.create(g1.id, { description: 'Old sent', amountCents: 100, status: 'SENT' });
    await invoiceRowsApi.create(g2.id, { description: 'Old open', amountCents: 200 });
    await invoiceRowsApi.create(g1.id, { description: 'New sent', amountCents: 300, status: 'SENT' });
    await invoiceRowsApi.create(g2.id, { description: 'New open', amountCents: 400 });
    g2.priceCents = 10000;
    addAutoFinalInvoice(db.events, g2);

    const rows = await invoiceRowsApi.list();
    expect(rows.map((r) => r.description)).toEqual(['Loppulasku', 'New open', 'Old open', 'New sent', 'Old sent']);
    expect(rows[0]).toMatchObject({ auto: true, status: 'NOT_SENT', eventId: g2.id, clientName: null, invoicingDetails: null });
    expect(rows[3]).toMatchObject({
      eventId: g1.id,
      eventStartDate: '2030-03-01',
      eventLineupName: 'Band One',
      eventVenue: 'Venue X',
      eventStatus: 'SOLD',
      clientName: 'Client X',
      invoicingDetails: 'Line 1\nLine 2',
      amountCents: 300,
      auto: false,
    });
  });

  it('leaves out rows of deleted gigs and keeps cancelled gigs', async () => {
    const deleted = addMockEvent({ lineupName: 'Deleted' });
    const cancelled = addMockEvent({ lineupName: 'Cancelled' });
    await invoiceRowsApi.create(deleted.id, { description: 'Gone', amountCents: 100 });
    await invoiceRowsApi.create(cancelled.id, { description: 'Fee', amountCents: 100 });
    deleted.deletedAt = new Date().toISOString();
    cancelled.status = 'CANCELLED';

    const rows = await invoiceRowsApi.list();
    expect(rows.map((r) => [r.description, r.eventStatus])).toEqual([['Fee', 'CANCELLED']]);
  });

  it('needs a session', async () => {
    setMockSession(null);
    await expect(invoiceRowsApi.list()).rejects.toBeInstanceOf(ApiError);
  });
});
