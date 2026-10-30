// Purchase orders created by partners (contract "Purchase orders created by partners", TASK-171):
// Ostotilaukset page "Uusi ostotilaus" and the event page "Luo ostotilaus". Synthetic data only.
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatMoney } from '../../lib/format';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { addMockEvent, mockLine, partnerA, person, staffMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { clearPurchaseOrders } from '../../test/purchaseOrderFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const dialog = () => screen.getByRole('dialog', { name: 'Uusi ostotilaus' });
const fee = (venue: string, role = 'Laulu') =>
  within(dialog()).getByRole('checkbox', { name: new RegExp(`${venue} · ${role}`) });
const submit = () => within(dialog()).getByRole('button', { name: 'Luo ostotilaus' });
const norm = (s: string | null) => (s ?? '').replace(/\s/g, ' ');
const fi = (cents: number) => norm(formatMoney(cents, 'fi'));

async function openListDialog() {
  const app = renderApp('/purchase-orders');
  const button = await screen.findByRole('button', { name: '+ Uusi ostotilaus' });
  await waitFor(() => expect(button).toBeEnabled());
  await app.user.click(button);
  return app;
}

describe('new purchase order on the Ostotilaukset page', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
    clearPurchaseOrders();
  });

  it('searches people, lists their open fees with a total and opens the created PO', async () => {
    const venueQ = addMockEvent({ venue: 'Venue Q' });
    const venueR = addMockEvent({ venue: 'Venue R', startDate: `${TEST_YEAR}-07-01` });
    staffMockEvent(venueQ, ['Person 5']);
    staffMockEvent(venueR, ['Person 5']);
    mockLine(venueQ, 'VOC').budgetedCents = 30000;
    mockLine(venueR, 'VOC').budgetedCents = 20000;

    const { user } = await openListDialog();
    expect(within(dialog()).getByRole('searchbox', { name: 'Hae henkilöä' })).toHaveFocus();
    await user.type(within(dialog()).getByRole('searchbox', { name: 'Hae henkilöä' }), 'son 5');
    const select = within(dialog()).getByRole('combobox', { name: 'Henkilö' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Valitse henkilö', 'Person 5']);
    expect(submit()).toBeDisabled();
    await user.selectOptions(select, 'Person 5');

    // Newest event first, nothing ticked yet.
    await within(dialog()).findByRole('group', { name: 'Palkkiot' });
    const boxes = within(dialog()).getAllByRole('checkbox');
    expect(boxes[0]).toHaveAccessibleName(new RegExp(`^1\\.7\\.${TEST_YEAR} · Venue R · Laulu`));
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    expect(submit()).toBeDisabled();

    await user.click(fee('Venue Q'));
    await user.click(fee('Venue R'));
    expect(norm(within(dialog()).getByText('Valittu yhteensä').parentElement!.textContent)).toBe(
      `Valittu yhteensä ${fi(50000)}`,
    );
    await user.click(fee('Venue R'));
    await user.click(submit());

    const created = db.freelancer.purchaseOrders.at(-1)!;
    expect(created.personId).toBe(person('Person 5').id);
    expect(created.lines.map((l) => l.costLineId)).toEqual([mockLine(venueQ, 'VOC').id]);
    expect(await screen.findByRole('heading', { level: 1, name: created.number })).toBeInTheDocument();
    // History: made by hand, by the signed-in partner.
    const history = await screen.findByRole('table', { name: 'Historia' });
    const row = await within(history).findByRole('row', { name: /Luotu käsin/ });
    expect(row).toHaveTextContent(partnerA().name);
  });

  it('shows "Ei avoimia palkkioita" for a person without open fees', async () => {
    server.use(http.get('/api/people/:id/po-eligible-lines', () => HttpResponse.json([])));
    const { user } = await openListDialog();
    await user.selectOptions(within(dialog()).getByRole('combobox', { name: 'Henkilö' }), 'Person 1');
    expect(await within(dialog()).findByText('Ei avoimia palkkioita')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('409 COST_LINE_NOT_ELIGIBLE: explains, unticks the fee and refetches; nothing created', async () => {
    const event = addMockEvent({ venue: 'Venue Q' });
    staffMockEvent(event, ['Person 5']);
    const lineId = mockLine(event, 'VOC').id;
    let eligibleCalls = 0;
    server.use(
      http.get('/api/people/:id/po-eligible-lines', () => {
        eligibleCalls += 1;
        return undefined; // fall through to the default mock
      }),
      http.post('/api/purchase-orders', () =>
        HttpResponse.json(
          { error: { code: 'COST_LINE_NOT_ELIGIBLE', message: 'x', details: { costLineIds: [lineId] } } },
          { status: 409 },
        ),
      ),
    );
    const { user } = await openListDialog();
    await user.selectOptions(within(dialog()).getByRole('combobox', { name: 'Henkilö' }), 'Person 5');
    await user.click(await within(dialog()).findByRole('checkbox', { name: /Venue Q · Laulu/ }));
    await user.click(submit());

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Osa palkkioista ei ole enää valittavissa. Palkkiot on päivitetty.',
    );
    expect(fee('Venue Q')).not.toBeChecked();
    await waitFor(() => expect(eligibleCalls).toBe(2));
    expect(db.freelancer.purchaseOrders).toHaveLength(0);
  });

  it('is a keyboard dialog: Escape closes it and focus returns to the button', async () => {
    const { user } = await openListDialog();
    expect(dialog()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Uusi ostotilaus' })).toHaveFocus();
  });
});

describe('Luo ostotilaus on the gig page', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
    clearPurchaseOrders();
  });

  async function openGig(eventId: string) {
    const app = renderApp(`/gigs/${eventId}`);
    await screen.findByRole('table', { name: 'Kulut ja miehitys' });
    // People loaded (names in the person pickers).
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Person 5' }).length).toBeGreaterThan(0));
    return app;
  }

  it('offers only crew with open fees, pre-ticks their fees here and tags the lines after creation', async () => {
    const event = addMockEvent({ venue: 'Venue Q' });
    staffMockEvent(event, ['Person 5', 'Person 6']);
    // Person 6's fee is already paid: not offered.
    const guitar = db.events.costLines.find((l) => l.eventId === event.id && l.personId === person('Person 6').id)!;
    guitar.paidAt = new Date().toISOString();
    guitar.actualCents = guitar.budgetedCents;
    // Person 5 also has a fee on another event: not shown here.
    const other = addMockEvent({ venue: 'Venue R' });
    staffMockEvent(other, ['Person 5']);

    const { user } = await openGig(event.id);
    await user.click(screen.getByRole('button', { name: 'Luo ostotilaus' }));
    const select = within(dialog()).getByRole('combobox', { name: 'Henkilö' });
    const names = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(names).toContain('Person 5');
    expect(names).not.toContain('Person 6');
    expect(within(dialog()).queryByRole('searchbox')).not.toBeInTheDocument();

    await user.selectOptions(select, 'Person 5');
    expect(await within(dialog()).findByRole('checkbox', { name: /Venue Q · Laulu/ })).toBeChecked();
    expect(within(dialog()).queryByRole('checkbox', { name: /Venue R/ })).not.toBeInTheDocument();

    // Double click creates one PO only.
    await user.dblClick(submit());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(db.freelancer.purchaseOrders).toHaveLength(1);
    const po = db.freelancer.purchaseOrders[0]!;
    expect(screen.getByText(`Ostotilaus ${po.number} luotu.`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Avaa ostotilaus ${po.number}` })).toHaveAttribute(
      'href',
      `/purchase-orders/${po.id}`,
    );
    const costs = screen.getByRole('table', { name: 'Kulut ja miehitys' });
    expect(
      await within(within(costs).getByRole('rowgroup', { name: 'Laulu' })).findByRole('link', {
        name: `Ostotilaus ${po.number}`,
      }),
    ).toBeInTheDocument();
    expect(db.freelancer.events.at(-1)).toMatchObject({ type: 'CREATED', partnerId: partnerA().id });
  });

  it('has no button when nobody on the gig has an open fee', async () => {
    const event = addMockEvent({ venue: 'Venue Q' });
    for (const line of db.events.costLines.filter((l) => l.eventId === event.id)) line.personId = null;
    await openGig(event.id);
    expect(screen.queryByRole('button', { name: 'Luo ostotilaus' })).not.toBeInTheDocument();
  });
});
