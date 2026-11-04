import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { publicFreelancersApi } from '../api/endpoints';
import type { FreelancerView, PublicPurchaseOrder } from '../api/types';
import { seedFreelancerFees } from '../test/freelancerFixtures';
import { signInMock } from '../test/renderApp';
import { db } from './data';
import { DEMO_FREELANCER_TOKEN } from './freelancerHandlers';
import { updateCostLine } from './eventStore';
import { purchaseOrderNumber, purchaseOrderSlug } from './freelancerStore';
import { createPurchaseOrderByHand } from './purchaseOrderStore';
import { partnerA } from '../test/eventFixtures';

const base = '/api';
const getView = (token: string) => fetch(`${base}/public/freelancers/${token}`);
const post = (token: string, body: unknown) =>
  fetch(`${base}/public/freelancers/${token}/purchase-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
/** Legacy body `{ costLineIds }` (still accepted: not VAT-liable, all at the sound check). */
const create = (token: string, costLineIds: unknown) => post(token, { costLineIds });

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
    expect(Object.keys(view).sort()).toEqual(['lines', 'name', 'purchaseOrders', 'settings']);
    expect(view.settings).toEqual({
      soundcheckDeductionCents: db.reference.settings.loadInDeductionCents,
      vatRatesBp: db.freelancer.vatRatesBp,
    });
    expect(view.settings.vatRatesBp).toEqual([1350, 2550]);
    expect(view.name).toBe('Person 5');
    const ids = view.lines.map((l) => l.costLineId);
    expect(ids).toEqual([fx.lines.upcoming.id, fx.lines.played2.id, fx.lines.other.id, fx.lines.played1.id, fx.lines.paid.id]);
    expect(view.lines.map((l) => l.state)).toEqual(['UPCOMING', 'SELECTABLE', 'SELECTABLE', 'SELECTABLE', 'PAID']);
    expect(view.lines[4]!.amountCents).toBe(12000);
    expect(Object.keys(view.lines[0]!).sort()).toEqual(
      [
        'amountCents',
        'costLineId',
        'description',
        'eventEndDate',
        'eventStartDate',
        'joinsLoadIn',
        'loadInDeductionAppliedCents',
        'purchaseOrderNumber',
        'state',
        'type',
        'venue',
      ].sort(),
    );
  });

  it('creates one PO from several events and puts the lines ON_PO; numbers are global', async () => {
    const res = await create(fx.token, [fx.lines.played1.id, fx.lines.played2.id]);
    expect(res.status).toBe(201);
    const po = (await res.json()) as PublicPurchaseOrder;
    expect(po.number).toMatch(/^PERSON-5-\d{4}$/);
    expect(po.status).toBe('OPEN');
    expect(po.totalCents).toBe(fx.lines.played1.budgetedCents + fx.lines.played2.budgetedCents);
    expect(Object.keys(po).sort()).toEqual(['createdAt', 'lines', 'number', 'paidAt', 'status', 'totalCents', 'vatLiable', 'vatRateBp']);
    expect(po.vatLiable).toBe(false);
    expect(po.vatRateBp).toBe(0);
    expect(po.lines.every((l) => l.soundcheck && l.deductionCents === 0 && l.vatCents === 0 && l.baseCents === l.amountCents)).toBe(true);
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
    const error = await publicFreelancersApi
      .createPurchaseOrder(fx.token, { vatRateBp: 0, lines: [{ costLineId: fx.lines.upcoming.id, soundcheck: true }] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).details).toEqual({ costLineIds: [fx.lines.upcoming.id] });

    // A line already on an open PO can't go on another one.
    expect((await create(fx.token, [fx.lines.played1.id])).status).toBe(201);
    expect((await create(fx.token, [fx.lines.played1.id])).status).toBe(409);
  });

  it('chosen VAT rate + missed sound check: deduction from settings, VAT from the rate, totals', async () => {
    db.reference.settings.loadInDeductionCents = 3000;
    db.freelancer.vatRatesBp = [1000, 2000];
    fx.lines.other.budgetedCents = 2001; // deduction capped at the fee; rounding
    const res = await post(fx.token, {
      vatRateBp: 1000,
      lines: [
        { costLineId: fx.lines.played1.id, soundcheck: false },
        { costLineId: fx.lines.played2.id, soundcheck: true },
        { costLineId: fx.lines.other.id, soundcheck: false },
      ],
    });
    expect(res.status).toBe(201);
    const po = (await res.json()) as PublicPurchaseOrder;
    expect(po.vatLiable).toBe(true);
    expect(po.vatRateBp).toBe(1000);
    const byVenueRole = (venue: string, type: string) => po.lines.find((l) => l.venue === venue && l.type === type)!;
    const p1 = byVenueRole('Venue X', 'VOC');
    const p2 = byVenueRole('Venue Y', 'VOC');
    const other = byVenueRole('Venue Y', 'OTHER_ROLE');
    const fee = fx.lines.played1.budgetedCents;
    expect(p1).toMatchObject({ baseCents: fee, soundcheck: false, deductionCents: 3000 });
    expect(p1.amountCents).toBe(Math.round((fee - 3000) * 1.1));
    expect(p1.vatCents).toBe(p1.amountCents - (fee - 3000));
    expect(p2).toMatchObject({ soundcheck: true, deductionCents: 0, amountCents: Math.round(fx.lines.played2.budgetedCents * 1.1) });
    expect(other).toMatchObject({ baseCents: 2001, deductionCents: 2001, vatCents: 0, amountCents: 0 });
    expect(po.totalCents).toBe(p1.amountCents + p2.amountCents + other.amountCents);
    // Partner view and paying use the final amount.
    const stored = db.freelancer.purchaseOrders.at(-1)!;
    expect(stored.vatLiable).toBe(true);
    expect(stored.vatRateBp).toBe(1000);
    expect(stored.lines.find((l) => l.costLineId === fx.lines.played1.id)!.amountCents).toBe(p1.amountCents);
  });

  it('"no sound check" already set on the gig: switch value ignored, deduction shown once, never twice', async () => {
    db.reference.settings.loadInDeductionCents = 2000;
    const fee = fx.lines.played1.budgetedCents;
    updateCostLine(db.events, fx.lines.played1, { joinsLoadIn: false }, 2000, partnerA().id);
    expect(fx.lines.played1.budgetedCents).toBe(fee - 2000);

    const view = (await (await getView(fx.token)).json()) as FreelancerView;
    const locked = view.lines.find((l) => l.costLineId === fx.lines.played1.id)!;
    expect(locked).toMatchObject({ joinsLoadIn: false, loadInDeductionAppliedCents: 2000, amountCents: fee - 2000 });
    expect(view.lines.find((l) => l.costLineId === fx.lines.played2.id)).toMatchObject({
      joinsLoadIn: true,
      loadInDeductionAppliedCents: null,
    });

    const res = await post(fx.token, {
      vatRateBp: 1350,
      lines: [
        { costLineId: fx.lines.played1.id, soundcheck: true }, // ignored
        { costLineId: fx.lines.played2.id, soundcheck: false },
      ],
    });
    expect(res.status).toBe(201);
    const po = (await res.json()) as PublicPurchaseOrder;
    const p1 = po.lines.find((l) => l.venue === 'Venue X')!;
    const p2 = po.lines.find((l) => l.venue === 'Venue Y')!;
    const net1 = fee - 2000;
    expect(p1).toMatchObject({ soundcheck: false, baseCents: fee, deductionCents: 2000 });
    expect(p1.amountCents).toBe(Math.round(net1 * 1.135));
    expect(p1.vatCents).toBe(p1.amountCents - net1);
    // joinsLoadIn true + switch off → the setting is deducted once, as before.
    const fee2 = fx.lines.played2.budgetedCents;
    expect(p2).toMatchObject({ soundcheck: false, baseCents: fee2, deductionCents: 2000, amountCents: Math.round((fee2 - 2000) * 1.135) });

    // Same request with soundcheck: false on the locked line gives the same amount (no 2nd deduction).
    db.freelancer.purchaseOrders.at(-1)!.status = 'CANCELLED';
    fx.lines.played1.purchaseOrder = null;
    fx.lines.played2.purchaseOrder = null;
    const again = (await (
      await post(fx.token, { vatRateBp: 1350, lines: [{ costLineId: fx.lines.played1.id, soundcheck: false }] })
    ).json()) as PublicPurchaseOrder;
    expect(again.lines[0]).toMatchObject({ baseCents: fee, deductionCents: 2000, amountCents: p1.amountCents });
  });

  it('partner-created PO applies the same rule for a gig-level "no sound check"', () => {
    const fee = fx.lines.played1.budgetedCents;
    updateCostLine(db.events, fx.lines.played1, { joinsLoadIn: false }, 1500, partnerA().id);
    const result = createPurchaseOrderByHand(
      db.freelancer,
      db.events,
      fx.person,
      [fx.lines.played1.id, fx.lines.played2.id],
      partnerA().id,
    );
    if (!result.ok) throw new Error('not created');
    const [l1, l2] = [fx.lines.played1.id, fx.lines.played2.id].map(
      (id) => result.purchaseOrder.lines.find((l) => l.costLineId === id)!,
    );
    expect(l1).toMatchObject({ soundcheck: false, baseCents: fee, deductionCents: 1500, vatCents: 0, amountCents: fee - 1500 });
    expect(l2).toMatchObject({ soundcheck: true, deductionCents: 0, amountCents: fx.lines.played2.budgetedCents });
  });

  it('validates the new body: vatRateBp REQUIRED / INVALID_VALUE, lines INVALID_VALUE', async () => {
    const fields = async (body: unknown) =>
      ((await (await post(fx.token, body)).json()) as { error: { fields: Record<string, string> } }).error.fields;
    const one = [{ costLineId: fx.lines.played1.id, soundcheck: true }];
    expect(await fields({ lines: one })).toEqual({ vatRateBp: 'REQUIRED' });
    expect(await fields({ vatRateBp: 2400, lines: one })).toEqual({ vatRateBp: 'INVALID_VALUE' });
    expect(await fields({ vatRateBp: '1350', lines: one })).toEqual({ vatRateBp: 'INVALID_VALUE' });
    expect(await fields({ vatLiable: 'yes', lines: one })).toEqual({ vatLiable: 'INVALID_VALUE' });
    expect(await fields({ vatRateBp: 1350, lines: [] })).toEqual({ lines: 'INVALID_VALUE' });
    expect(await fields({ vatRateBp: 1350, lines: [{ costLineId: fx.lines.played1.id }] })).toEqual({ lines: 'INVALID_VALUE' });
    const dup = { costLineId: fx.lines.played1.id, soundcheck: true };
    expect(await fields({ vatRateBp: 0, lines: [dup, dup] })).toEqual({ lines: 'INVALID_VALUE' });
  });

  it('accepts the legacy vatLiable body: true = 1350, false = 0', async () => {
    const yes = (await (await post(fx.token, { vatLiable: true, lines: [{ costLineId: fx.lines.played1.id, soundcheck: true }] })).json()) as PublicPurchaseOrder;
    expect(yes).toMatchObject({ vatLiable: true, vatRateBp: 1350 });
    const no = (await (await post(fx.token, { vatLiable: false, lines: [{ costLineId: fx.lines.played2.id, soundcheck: true }] })).json()) as PublicPurchaseOrder;
    expect(no).toMatchObject({ vatLiable: false, vatRateBp: 0 });
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
