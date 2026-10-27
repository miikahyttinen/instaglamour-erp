import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { publicFreelancersApi } from '../api/endpoints';
import type { FreelancerView, PublicPurchaseOrder } from '../api/types';
import { seedFreelancerFees } from '../test/freelancerFixtures';
import { signInMock } from '../test/renderApp';
import { db } from './data';
import { DEMO_FREELANCER_TOKEN } from './freelancerHandlers';
import { purchaseOrderNumber, purchaseOrderSlug } from './freelancerStore';

const base = '/api';
const getView = (token: string) => fetch(`${base}/public/freelancers/${token}`);
const create = (token: string, costLineIds: unknown) =>
  fetch(`${base}/public/freelancers/${token}/purchase-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ costLineIds }),
  });

describe('PO number (BR-116)', () => {
  it('slugs the name: accents removed, upper case, non-alphanumerics to single dashes', () => {
    expect(purchaseOrderSlug('Person 1')).toBe('PERSON-1');
    expect(purchaseOrderSlug('  Äö Å-é  x ')).toBe('AO-A-E-X');
    expect(purchaseOrderSlug('***')).toBe('PERSON');
  });
  it('pads the running number to at least four digits', () => {
    expect(purchaseOrderNumber('Person 5', 42)).toBe('PERSON-5-0042');
    expect(purchaseOrderNumber('Person 5', 12345)).toBe('PERSON-5-12345');
  });
});

describe('public freelancer mock', () => {
  let fx: ReturnType<typeof seedFreelancerFees>;
  beforeEach(() => {
    fx = seedFreelancerFees();
  });

  it('lists only own fees > 0 on non-deleted SOLD events, newest first, with states', async () => {
    const res = await getView(fx.token);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    const view = (await res.json()) as FreelancerView;
    expect(Object.keys(view).sort()).toEqual(['lines', 'name', 'purchaseOrders']);
    expect(view.name).toBe('Person 5');
    const ids = view.lines.map((l) => l.costLineId);
    expect(ids).toEqual([fx.lines.upcoming.id, fx.lines.played2.id, fx.lines.other.id, fx.lines.played1.id, fx.lines.paid.id]);
    expect(view.lines.map((l) => l.state)).toEqual(['UPCOMING', 'SELECTABLE', 'SELECTABLE', 'SELECTABLE', 'PAID']);
    expect(view.lines[4]!.amountCents).toBe(12000);
    expect(Object.keys(view.lines[0]!).sort()).toEqual(
      ['amountCents', 'costLineId', 'description', 'eventEndDate', 'eventStartDate', 'purchaseOrderNumber', 'state', 'type', 'venue'].sort(),
    );
  });

  it('creates one PO from several events and puts the lines ON_PO; numbers are global', async () => {
    const res = await create(fx.token, [fx.lines.played1.id, fx.lines.played2.id]);
    expect(res.status).toBe(201);
    const po = (await res.json()) as PublicPurchaseOrder;
    expect(po.number).toMatch(/^PERSON-5-\d{4}$/);
    expect(po.status).toBe('OPEN');
    expect(po.totalCents).toBe(fx.lines.played1.budgetedCents + fx.lines.played2.budgetedCents);
    expect(Object.keys(po).sort()).toEqual(['createdAt', 'lines', 'number', 'paidAt', 'status', 'totalCents']);
    expect(po.lines.map((l) => l.venue)).toEqual(['Venue Y', 'Venue X']);

    const view = (await (await getView(fx.token)).json()) as FreelancerView;
    expect(view.purchaseOrders[0]!.number).toBe(po.number);
    const onPo = view.lines.filter((l) => l.state === 'ON_PO');
    expect(onPo.map((l) => l.purchaseOrderNumber)).toEqual([po.number, po.number]);

    const second = (await (await create(fx.token, [fx.lines.other.id])).json()) as PublicPurchaseOrder;
    expect(Number(second.number.slice(-4))).toBe(Number(po.number.slice(-4)) + 1);
    expect(db.freelancer.events.filter((e) => e.type === 'CREATED' && e.partnerId === null).length).toBeGreaterThanOrEqual(2);
  });

  it('is all-or-nothing: any ineligible id → 409 with the offending ids, nothing created', async () => {
    const before = db.freelancer.purchaseOrders.length;
    const res = await create(fx.token, [fx.lines.played1.id, fx.lines.upcoming.id, fx.lines.paid.id, fx.lines.cancelled.id]);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; details: { costLineIds: string[] } } };
    expect(body.error.code).toBe('COST_LINE_NOT_ELIGIBLE');
    expect(body.error.details.costLineIds).toEqual([fx.lines.upcoming.id, fx.lines.paid.id, fx.lines.cancelled.id]);
    expect(db.freelancer.purchaseOrders.length).toBe(before);

    // The API client exposes `details` on the error.
    const error = await publicFreelancersApi.createPurchaseOrder(fx.token, { costLineIds: [fx.lines.upcoming.id] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).details).toEqual({ costLineIds: [fx.lines.upcoming.id] });

    // A line already on an open PO can't go on another one.
    expect((await create(fx.token, [fx.lines.played1.id])).status).toBe(201);
    expect((await create(fx.token, [fx.lines.played1.id])).status).toBe(409);
  });

  it('a cancelled PO frees its lines again', async () => {
    await create(fx.token, [fx.lines.played1.id]);
    db.freelancer.purchaseOrders.at(-1)!.status = 'CANCELLED';
    expect((await create(fx.token, [fx.lines.played1.id])).status).toBe(201);
  });

  it('validates costLineIds (1…200, unique)', async () => {
    for (const ids of [[], 'x', [fx.lines.played1.id, fx.lines.played1.id], Array.from({ length: 201 }, (_, i) => `id-${i}`)]) {
      const res = await create(fx.token, ids);
      expect(res.status).toBe(400);
    }
  });

  it('404 for unknown and regenerated tokens and inactive people', async () => {
    expect((await getView('unknown-token')).status).toBe(404);
    signInMock();
    const regen = await fetch(`${base}/people/${fx.person.id}/freelancer-link/regenerate`, { method: 'POST' });
    const { sharePath } = (await regen.json()) as { sharePath: string };
    expect(sharePath).toMatch(/^\/f\/[\w-]{32,}$/);
    expect((await getView(fx.token)).status).toBe(404);
    const fresh = sharePath.slice(3);
    expect((await getView(fresh)).status).toBe(200);
    fx.person.active = false;
    expect((await getView(fresh)).status).toBe(404);
  });

  it('person link endpoints need a session; GET is stable', async () => {
    expect((await fetch(`${base}/people/${fx.person.id}/freelancer-link`)).status).toBe(401);
    signInMock();
    const a = await (await fetch(`${base}/people/${fx.person.id}/freelancer-link`)).json();
    const b = await (await fetch(`${base}/people/${fx.person.id}/freelancer-link`)).json();
    expect(a).toEqual(b);
    expect(a).toEqual({ sharePath: `/f/${fx.token}` });
  });

  it('BR-113: active partners have no link (409) and their public link is 404 until removed', async () => {
    signInMock();
    db.partners.push({
      id: 'partner-x',
      personId: fx.person.id,
      name: fx.person.name,
      email: 'partner-x@example.com',
      language: 'fi',
      selectedYear: 2026,
      active: true,
    });
    const link = await fetch(`${base}/people/${fx.person.id}/freelancer-link`);
    expect(link.status).toBe(409);
    expect(((await link.json()) as { error: { code: string } }).error.code).toBe('PERSON_IS_PARTNER');
    const regen = await fetch(`${base}/people/${fx.person.id}/freelancer-link/regenerate`, { method: 'POST' });
    expect(regen.status).toBe(409);
    expect((await getView(fx.token)).status).toBe(404);
    expect((await create(fx.token, [fx.lines.played1.id])).status).toBe(404);

    db.partners.at(-1)!.active = false;
    expect((await getView(fx.token)).status).toBe(200);
    expect((await fetch(`${base}/people/${fx.person.id}/freelancer-link`)).status).toBe(200);
  });

  it('seeds a demo link for Person 1 with a paid and a cancelled PO', async () => {
    const view = (await (await getView(DEMO_FREELANCER_TOKEN)).json()) as FreelancerView;
    expect(view.name).toBe('Person 1');
    const paid = view.purchaseOrders.find((po) => po.status === 'PAID');
    expect(paid?.number).toMatch(/^PERSON-1-\d{4}$/);
    expect(view.lines.find((l) => l.purchaseOrderNumber === paid?.number)?.state).toBe('PAID');
  });
});
