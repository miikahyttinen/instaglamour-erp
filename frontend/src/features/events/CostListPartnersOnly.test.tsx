import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import en from '../../i18n/en';
import fi from '../../i18n/fi';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { addMockEvent, mockLine, partnerB, person, TEST_YEAR } from '../../test/eventFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

// SALES ("Myynti") / PRODUCTION ("Tuotanto") lines take only people linked to an active partner.
const costs = () => screen.getByRole('table', { name: 'Kulut ja miehitys' });
const line = (name: string) => within(costs()).getByRole('rowgroup', { name });
const picker = (name: string) => within(line(name)).getByRole('combobox', { name: `Henkilö: ${name}` });
const optionNames = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent);

async function openEvent(eventId: string) {
  const app = renderApp(`/gigs/${eventId}`);
  await screen.findByRole('table', { name: 'Kulut ja miehitys' });
  await within(line('Laulu')).findByRole('option', { name: 'Person 1' });
  return app;
}

describe('sales and production lines: partners only', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('lists only active partners on SALES / PRODUCTION lines, anyone on other lines', async () => {
    partnerB().active = false; // removed partner: no longer offered
    const event = addMockEvent();
    await openEvent(event.id);
    for (const name of ['Myynti', 'Tuotanto']) {
      expect(optionNames(picker(name))).toEqual(['– ei henkilöä –', 'Partner A', 'Partner C']);
    }
    const vocals = optionNames(picker('Laulu'));
    expect(vocals).toContain('Person 1');
    expect(vocals).toContain('+ Uusi henkilö…');
  });

  it("keeps showing a line's current person who isn't a partner", async () => {
    const event = addMockEvent();
    mockLine(event, 'SALES').personId = person('Person 1').id;
    await openEvent(event.id);
    expect(picker('Myynti')).toHaveDisplayValue('Person 1');
    expect(within(picker('Tuotanto')).queryByRole('option', { name: 'Person 1' })).not.toBeInTheDocument();
  });

  it('saves a partner and shows NOT_PARTNER from the server on the field', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await user.selectOptions(picker('Myynti'), 'Partner B');
    await waitFor(() => expect(mockLine(event, 'SALES').personId).toBe(partnerB().personId));

    server.use(
      http.patch('/api/cost-lines/:id', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Server English text', { personId: 'NOT_PARTNER' }),
      ),
    );
    await user.selectOptions(picker('Tuotanto'), 'Partner C');
    expect(
      await within(line('Tuotanto')).findByText('Myynti- ja tuotantorivillä voi olla vain osakas.'),
    ).toBeInTheDocument();
  });

  it('add form: partner-only picker for Myynti / Tuotanto, clears a non-partner on type change', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    const form = screen.getByRole('form', { name: 'Uusi kulurivi' });
    const personSelect = within(form).getByRole('combobox', { name: 'Henkilö' });
    await user.selectOptions(personSelect, 'Person 1');

    await user.selectOptions(within(form).getByRole('combobox', { name: 'Tyyppi' }), 'Myynti');
    expect(personSelect).toHaveDisplayValue('– ei henkilöä –');
    expect(optionNames(personSelect)).toEqual(['– ei henkilöä –', 'Partner A', 'Partner B', 'Partner C']);

    await user.selectOptions(personSelect, 'Partner B');
    await user.click(within(form).getByRole('button', { name: 'Lisää rivi' }));
    await waitFor(() =>
      expect(
        db.events.costLines.filter((l) => l.eventId === event.id && l.type === 'SALES').map((l) => l.personId),
      ).toContain(partnerB().personId),
    );
  });

  it('has the NOT_PARTNER text in both languages', () => {
    expect(fi.fields.NOT_PARTNER).toBe('Myynti- ja tuotantorivillä voi olla vain osakas.');
    expect(en.fields.NOT_PARTNER).toBe('Only partners can be on sales and production lines.');
  });
});
