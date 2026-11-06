import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { addCostLine, type MockEvent } from '../../mocks/eventStore';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { addMockEvent, mockLine, partnerA, person, TEST_YEAR } from '../../test/eventFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

// TASK-185: a musician line's person picker lists only people with that role (synthetic seed:
// Partner A VOC, Partner B GUITAR+KEYS, Person 1 VOC, Person 2 BASS, Person 3 GUITAR, Person 4 DRUMS…).
const costs = () => screen.getByRole('table', { name: 'Kulut ja miehitys' });
const line = (name: string) => within(costs()).getByRole('rowgroup', { name });
const picker = (name: string) => within(line(name)).getByRole('combobox', { name: `Henkilö: ${name}` });
const optionNames = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent);
const NONE = '– ei henkilöä –';
const NEW = '+ Uusi henkilö…';
const CUSTOM = 'Oma rooli (Role Q)';

const addCustomRoleLine = (event: MockEvent) =>
  addCostLine(db.events, event, { type: 'OTHER_ROLE', personId: null, description: 'Role Q', budgetedCents: 0 }, partnerA().id);

async function openEvent(eventId: string) {
  const app = renderApp(`/gigs/${eventId}`);
  await screen.findByRole('table', { name: 'Kulut ja miehitys' });
  await within(line('Laulu')).findByRole('option', { name: 'Person 1' });
  return app;
}

async function createPerson(user: ReturnType<typeof renderApp>['user'], scope: HTMLElement, select: HTMLElement) {
  await user.selectOptions(select, NEW);
  await user.type(within(scope).getByRole('textbox', { name: 'Uuden henkilön nimi' }), 'Person 10');
  await user.click(within(scope).getByRole('button', { name: 'Lisää henkilö' }));
  expect(await within(scope).findByDisplayValue('Person 10')).toBeInTheDocument();
}

describe('musician lines: picker by role (TASK-185)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('lists only active people with the role on musician lines', async () => {
    const event = addMockEvent();
    await openEvent(event.id);
    expect(optionNames(picker('Laulu'))).toEqual([NONE, 'Partner A', 'Person 1', NEW]);
    expect(optionNames(picker('Kitara'))).toEqual([NONE, 'Partner B', 'Person 3', NEW]);
    expect(optionNames(picker('Basso'))).toEqual([NONE, 'Person 2', NEW]);
  });

  it('nobody has the role: only "no person" and "new person"', async () => {
    person('Person 4').roles = [];
    const event = addMockEvent();
    await openEvent(event.id);
    expect(optionNames(picker('Rummut'))).toEqual([NONE, NEW]);
  });

  it("OTHER_ROLE lines list everyone active; a line's current person stays listed", async () => {
    const event = addMockEvent();
    addCustomRoleLine(event);
    mockLine(event, 'GUITAR').personId = person('Person 2').id;
    await openEvent(event.id);
    const custom = optionNames(picker(CUSTOM));
    for (const name of ['Partner A', 'Person 1', 'Person 2', 'Person 8', NEW]) expect(custom).toContain(name);
    expect(custom).not.toContain('Person 9'); // inactive
    expect(picker('Kitara')).toHaveDisplayValue('Person 2');
    expect(optionNames(picker('Kitara'))).toEqual([NONE, 'Partner B', 'Person 2', 'Person 3', NEW]);
  });

  it('a new person on a musician line gets the role first, then is assigned', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await createPerson(user, line('Basso'), picker('Basso'));
    const created = person('Person 10');
    expect(created.roles).toEqual(['BASS']);
    await waitFor(() => expect(mockLine(event, 'BASS').personId).toBe(created.id));
    expect(optionNames(picker('Basso'))).toContain('Person 10');
  });

  it('a new person on an OTHER_ROLE line gets no role', async () => {
    const event = addMockEvent();
    addCustomRoleLine(event);
    const { user } = await openEvent(event.id);
    await createPerson(user, line(CUSTOM), picker(CUSTOM));
    expect(person('Person 10').roles).toEqual([]);
  });

  it('role PATCH fails: the person is still assigned and the error shows inline', async () => {
    server.use(http.patch('/api/people/:id', () => errorResponse(404, 'NOT_FOUND', 'Server English text')));
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await createPerson(user, line('Rummut'), picker('Rummut'));
    expect(within(line('Rummut')).getByRole('alert')).toHaveTextContent(
      /Henkilö lisättiin, mutta roolin tallennus epäonnistui/,
    );
    await waitFor(() => expect(mockLine(event, 'DRUMS').personId).toBe(person('Person 10').id));
  });

  it('draft row: the filter follows the type; a chosen person without the role is cleared', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    const draft = line('Uusi kulurivi');
    const type = within(draft).getByRole('combobox', { name: 'Tyyppi: Uusi kulurivi' });
    const personSelect = within(draft).getByRole('combobox', { name: 'Henkilö: Uusi kulurivi' });
    expect(optionNames(personSelect)).toContain('Person 2'); // no type yet: everyone

    await user.selectOptions(personSelect, 'Person 3');
    await user.selectOptions(type, 'Kitara');
    expect(personSelect).toHaveDisplayValue('Person 3'); // has GUITAR: kept
    expect(optionNames(personSelect)).toEqual([NONE, 'Partner B', 'Person 3', NEW]);

    await user.selectOptions(type, 'Rummut');
    expect(personSelect).toHaveDisplayValue(NONE); // no DRUMS: cleared
    expect(optionNames(personSelect)).toEqual([NONE, 'Person 4', NEW]);

    await user.selectOptions(type, 'Oma rooli');
    expect(optionNames(personSelect)).toContain('Person 3');
  });

  it('draft row: a new person gets the draft type role', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    const draft = line('Uusi kulurivi');
    await user.selectOptions(within(draft).getByRole('combobox', { name: 'Tyyppi: Uusi kulurivi' }), 'Rummut');
    await createPerson(user, draft, within(draft).getByRole('combobox', { name: 'Henkilö: Uusi kulurivi' }));
    expect(person('Person 10').roles).toEqual(['DRUMS']);
  });
});
