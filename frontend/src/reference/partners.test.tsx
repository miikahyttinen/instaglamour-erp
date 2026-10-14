import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Partner } from '../api/types';
import { db } from '../mocks/data';
import { addMockClient, TEST_YEAR } from '../test/gigFixtures';
import { addMockOffer } from '../test/offerFixtures';
import { renderApp, signInMock } from '../test/renderApp';
import { activePartners, partnerOptions } from './partners';

/** `active` undefined = an older backend that doesn't send it yet. */
const partner = (id: string, name: string, active?: boolean): Partner =>
  ({
    id,
    personId: `${id}-person`,
    name,
    email: `${id}@example.com`,
    language: 'fi',
    selectedYear: 2026,
    ...(active === undefined ? {} : { active }),
  }) as Partner;

describe('partner picker helpers (UC-032, BR-111)', () => {
  const list = [partner('a', 'Partner A', true), partner('b', 'Partner B', false), partner('c', 'Partner C')];

  it('activePartners keeps active ones (missing `active` counts as active)', () => {
    expect(activePartners(list).map((p) => p.id)).toEqual(['a', 'c']);
    expect(activePartners(undefined)).toEqual([]);
  });

  it('partnerOptions = active partners + the current inactive one by name', () => {
    expect(partnerOptions(list)).toEqual([
      { value: 'a', label: 'Partner A' },
      { value: 'c', label: 'Partner C' },
    ]);
    expect(partnerOptions(list, 'a').map((o) => o.value)).toEqual(['a', 'c']);
    expect(partnerOptions(list, 'b')).toEqual([
      { value: 'b', label: 'Partner B' },
      { value: 'a', label: 'Partner A' },
      { value: 'c', label: 'Partner C' },
    ]);
    expect(partnerOptions(list, 'x')[0]).toEqual({ value: 'x', label: '–' });
  });
});

const optionNames = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((o) => o.textContent);

describe('pickers offer only active partners (UC-032 AC-1, AC-4)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
    db.partners.find((p) => p.name === 'Partner C')!.active = false;
  });

  it('new offer: seller choices exclude a removed partner', async () => {
    renderApp('/offers/new');
    const seller = await screen.findByLabelText('Myyjä');
    await screen.findByRole('option', { name: 'Partner B' });
    expect(optionNames(seller)).toEqual(['Partner A', 'Partner B']);
  });

  it("offer page: a removed seller still shows by name but isn't offered elsewhere", async () => {
    const c = db.partners.find((p) => p.name === 'Partner C')!;
    const offer = addMockOffer({ clientId: addMockClient('Client X').id, sellerId: c.id });
    renderApp(`/offers/${offer.id}`);
    const seller = await screen.findByLabelText('Myyjä');
    await screen.findByRole('option', { name: 'Partner B' });
    expect(seller).toHaveDisplayValue('Partner C');
    expect(optionNames(seller)).toEqual(['Partner C', 'Partner A', 'Partner B']);
  });

  it('tasks: the add form offers active owners; an existing task keeps its removed owner by name', async () => {
    const c = db.partners.find((p) => p.name === 'Partner C')!;
    db.tasks.tasks[0]!.ownerId = c.id;
    const title = db.tasks.tasks[0]!.title;
    const { user } = renderApp('/tasks');
    const item = (await screen.findByDisplayValue(title)).closest('li')!;
    const owner = within(item).getByLabelText('Vastuuhenkilö');
    await within(owner).findByRole('option', { name: 'Partner B' });
    expect(owner).toHaveDisplayValue('Partner C');
    expect(optionNames(owner)).toEqual(['Partner C', 'Partner A', 'Partner B']);

    await user.click(screen.getByRole('button', { name: 'Lisää tehtävä' }));
    const form = screen.getByRole('button', { name: 'Tallenna' }).closest('form')!;
    expect(optionNames(within(form).getByLabelText('Vastuuhenkilö'))).toEqual(['Partner A', 'Partner B']);
  });
});
