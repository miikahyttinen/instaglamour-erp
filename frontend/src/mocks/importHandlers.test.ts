import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { importApi } from '../api/endpoints';
import { signInMock } from '../test/renderApp';

const partners = [{ email: 'partner.a@example.com', name: 'Partner A' }];
const event = { startDate: '2030-05-01', venue: 'Venue X', lineupName: 'Template A' };

describe('import mock: events and the legacy `gigs` key (Gig → Event rename)', () => {
  beforeEach(() => {
    signInMock();
  });

  it('counts top-level `events`', async () => {
    const { summary } = await importApi.run({ partners, events: [event] }, { dryRun: true });
    expect(summary.events).toEqual({ created: 1, updated: 0, skipped: 0 });
  });

  it('also accepts the legacy top-level `gigs` as events', async () => {
    const { summary } = await importApi.run({ partners, gigs: [event] }, { dryRun: true });
    expect(summary.events).toEqual({ created: 1, updated: 0, skipped: 0 });
  });

  it('refuses `events` and `gigs` together with a validation error', async () => {
    const error = await importApi.run({ partners, events: [event], gigs: [event] }, { dryRun: true }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('VALIDATION_ERROR');
    expect((error as ApiError).details.errors).toEqual(['events: use "events" or the legacy "gigs", not both']);
  });
});
