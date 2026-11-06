import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatMoney } from '../../lib/format';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { payCostLine } from '../../mocks/eventStore';
import { addMockEvent, mockLine, partnerA, person, staffMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const fi = (cents: number) => formatMoney(cents, 'fi').replace(/\s/g, ' ');
const cellTexts = (row: HTMLElement) =>
  within(row).getAllByRole('cell').map((c) => c.textContent!.replace(/\s/g, ' '));
const table = () => screen.getByRole('table', { name: 'Kulurivit' });
const bodyRows = () => within(table()).getAllByRole('row').filter((r) => r.closest('tbody'));

/** The demo seed has lines in other years; the person page lists every year, so start clean. */
function clearLinesOf(name: string) {
  const { id } = person(name);
  db.events.costLines = db.events.costLines.filter((l) => l.personId !== id);
}

/** Person 1 on three events of TEST_YEAR (one paid line, one cancelled event), one deleted, one next year. */
function seedLines() {
  clearLinesOf('Person 1');
  const g1 = addMockEvent({ startDate: `${TEST_YEAR}-03-01`, venue: 'Venue X' });
  staffMockEvent(g1, ['Person 1']);
  payCostLine(db.events, mockLine(g1, 'VOC'), 10000, partnerA().id);

  const g2 = addMockEvent({ startDate: `${TEST_YEAR}-06-01`, venue: 'Venue Y', lineupName: 'Custom lineup', lineupTemplateId: null });
  db.events.costLines.push({
    ...mockLine(g2, 'OFFICE'),
    id: '00000000-0000-4000-8000-000000000999',
    type: 'OTHER',
    description: 'Expense 1',
    personId: person('Person 1').id,
    budgetedCents: 10000,
  });

  const cancelled = addMockEvent({ startDate: `${TEST_YEAR}-08-01`, venue: 'Venue Z' });
  staffMockEvent(cancelled, ['Person 2', 'Person 1']);
  cancelled.status = 'CANCELLED';

  const deleted = addMockEvent({ startDate: `${TEST_YEAR}-09-01`, venue: 'Venue U' });
  staffMockEvent(deleted, ['Person 1']);
  deleted.deletedAt = new Date().toISOString();

  const nextYear = addMockEvent({ startDate: `${TEST_YEAR + 1}-01-10`, venue: 'Venue W' });
  staffMockEvent(nextYear, ['Person 1']);
  return { g1, g2, cancelled };
}

describe('person page (UC-014 A2)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it("lists the person's cost lines of every year, newest event first, with totals and event links", async () => {
    const { g1, g2, cancelled } = seedLines();
    renderApp(`/people/${person('Person 1').id}`);
    expect(await screen.findByRole('heading', { name: 'Person 1', level: 1 })).toBeInTheDocument();
    await screen.findByRole('table', { name: 'Kulurivit' });

    const rows = bodyRows();
    expect(rows).toHaveLength(4);

    const [next, onCancelled, other, paid] = rows as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(next).toHaveTextContent('Venue W');
    expect(within(paid).getByRole('link', { name: `1.3.${TEST_YEAR}` })).toHaveAttribute('href', `/gigs/${g1.id}`);
    expect(paid).toHaveTextContent('Template A');
    expect(paid).toHaveTextContent('Venue X');
    expect(paid).toHaveTextContent('Laulu');
    expect(cellTexts(paid).filter((c) => c === fi(10000))).toHaveLength(2); // budget + actual
    expect(paid).not.toHaveTextContent('Maksamatta');

    expect(within(other).getByRole('link')).toHaveAttribute('href', `/gigs/${g2.id}`);
    expect(other).toHaveTextContent('Custom lineup');
    expect(other).toHaveTextContent('Venue Y');
    expect(other).toHaveTextContent('Muu kulu: Expense 1');
    expect(cellTexts(other)).toContain(fi(10000));
    expect(other).toHaveTextContent('Maksamatta');

    expect(within(onCancelled).getByRole('link')).toHaveAttribute('href', `/gigs/${cancelled.id}`);
    expect(onCancelled).toHaveTextContent('Peruttu');

    const total = within(table()).getByRole('rowheader', { name: 'Yhteensä' }).closest('tr')!;
    expect(cellTexts(total)).toEqual([fi(40000), fi(10000), '']); // budget: 4 lines; actual: paid only
    expect(screen.queryByText('Venue U')).not.toBeInTheDocument();
  });

  it('does not depend on the selected year (no year selector, no year in the texts)', async () => {
    seedLines();
    renderApp(`/people/${person('Person 1').id}`);
    await screen.findByRole('table', { name: 'Kulurivit' });
    expect(screen.queryByRole('combobox', { name: 'Valittu vuosi' })).toBeNull();
    expect(screen.getByText('Budjetti yhteensä')).toBeInTheDocument();
    expect(screen.getByText('Toteuma yhteensä')).toBeInTheDocument();
  });

  it('shows an empty state when there are no lines', async () => {
    clearLinesOf('Person 3');
    renderApp(`/people/${person('Person 3').id}`);
    expect(await screen.findByText('Ei kulurivejä.')).toBeInTheDocument();
  });

  it('edits name and active in place, with no Edit buttons', async () => {
    const { user } = renderApp(`/people/${person('Person 9').id}`);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Person 9');
    const head = () => screen.getByRole('heading', { level: 1 }).closest('header')!;
    expect(head()).toHaveTextContent('Ei käytössä');
    expect(screen.queryByRole('button', { name: /Muuta nimeä|Ota käyttöön|Tallenna/ })).not.toBeInTheDocument();

    const active = screen.getByRole('switch', { name: 'Aktiivinen' });
    expect(active).not.toBeChecked();
    await user.click(active);
    expect(await screen.findByText('Person 9 otettu käyttöön.')).toBeInTheDocument();
    await waitFor(() => expect(head()).not.toHaveTextContent('Ei käytössä'));
    expect(active).toBeChecked();

    const name = screen.getByLabelText('Nimi');
    expect(name).toHaveValue('Person 9');
    await user.clear(name);
    await user.type(name, 'Person 19');
    await user.click(document.body);
    expect(await screen.findByRole('heading', { name: 'Person 19', level: 1 })).toBeInTheDocument();
    expect(db.events.people.some((p) => p.name === 'Person 19' && p.active)).toBe(true);
  });

  it('empty name shows "required", sends nothing and Esc restores the name', async () => {
    const patches: unknown[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PATCH') patches.push('x');
    });
    const { user } = renderApp(`/people/${person('Person 2').id}`);
    const name = await screen.findByLabelText('Nimi');
    await user.clear(name);
    await user.click(document.body);
    expect(await screen.findByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(patches).toHaveLength(0);
    await user.click(name);
    await user.keyboard('{Escape}');
    expect(name).toHaveValue('Person 2');
    server.events.removeAllListeners();
  });

  it('translates a server error on rename under the field', async () => {
    server.use(
      http.patch('/api/people/:id', () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Server says no', fields: { name: 'TOO_LONG' } } },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp(`/people/${person('Person 2').id}`);
    const name = await screen.findByLabelText('Nimi');
    await user.type(name, 'x{Enter}');
    expect(await screen.findByText('Teksti on liian pitkä.')).toBeInTheDocument();
    expect(name).toHaveValue('Person 2x');
    expect(screen.queryByText(/Server says no/)).not.toBeInTheDocument();
  });

  it('a duplicate name on the person page saves and shows the warning', async () => {
    const { user } = renderApp(`/people/${person('Person 9').id}`);
    const name = await screen.findByLabelText('Nimi');
    await user.clear(name);
    await user.type(name, 'Person 1{Enter}');
    expect(await screen.findByText('Samanniminen henkilö on jo olemassa.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Person 1', level: 1 })).toBeInTheDocument();
  });

  it('shows the played event count (all years, musician lines only)', async () => {
    db.events.people.push({ id: '00000000-0000-4000-8000-000000000998', name: 'Person 20', active: true, roles: [] });
    const played = addMockEvent({ startDate: '2020-03-01' });
    staffMockEvent(played, ['Person 20']);
    const future = addMockEvent({ startDate: `${TEST_YEAR}-03-01` });
    staffMockEvent(future, ['Person 20']);
    renderApp(`/people/${person('Person 20').id}`);
    const group = await screen.findByRole('group', { name: 'Keikkoja' });
    expect(within(group).getByText('1')).toBeInTheDocument();
  });

  it('roles: each checkbox change saves the whole list (PATCH roles) with no Save button', async () => {
    const patches: unknown[] = [];
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PATCH') patches.push(await request.clone().json());
    });
    const { user } = renderApp(`/people/${person('Person 2').id}`);
    const roles = await screen.findByRole('group', { name: 'Roolit' });
    expect(within(roles).getByRole('checkbox', { name: 'Basso' })).toBeChecked();
    expect(within(roles).getByRole('checkbox', { name: 'Laulu' })).not.toBeChecked();

    await user.click(within(roles).getByRole('checkbox', { name: 'Laulu' }));
    await waitFor(() => expect(person('Person 2').roles).toEqual(['VOC', 'BASS']));
    await user.click(within(roles).getByRole('checkbox', { name: 'Basso' }));
    await waitFor(() => expect(person('Person 2').roles).toEqual(['VOC']));
    expect(patches).toEqual([{ roles: ['VOC', 'BASS'] }, { roles: ['VOC'] }]);
    expect(screen.queryByRole('button', { name: /Tallenna/ })).not.toBeInTheDocument();
    server.events.removeAllListeners();
  });

  it('roles: removed roles are not offered; MIX is "Miksaus" (Role cleanup)', async () => {
    renderApp(`/people/${person('Person 6').id}`);
    const roles = await screen.findByRole('group', { name: 'Roolit' });
    const labels = within(roles).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? c.closest('label')?.textContent);
    expect(labels).toContain('Miksaus');
    expect(labels.join(' ')).not.toMatch(/Puhallin|Teknikko/);
    expect(within(roles).getByRole('checkbox', { name: 'Miksaus' })).toBeChecked();
  });

  it('roles: offered from reference personRoles; no Piano and no "Oma rooli" (TASK-187)', async () => {
    renderApp(`/people/${person('Person 5').id}`);
    const roles = await screen.findByRole('group', { name: 'Roolit' });
    const labels = within(roles).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? c.closest('label')?.textContent);
    expect(labels).toContain('Koskettimet');
    expect(labels).not.toContain('Piano');
    expect(labels).not.toContain('Oma rooli');
    expect(within(roles).getByRole('checkbox', { name: 'Koskettimet' })).toBeChecked();
  });

  it('roles: "Laulu & koskettimet" (VOC_KEYS) is offered right after Taustalaulu (TASK-188)', async () => {
    renderApp(`/people/${person('Person 5').id}`);
    const roles = await screen.findByRole('group', { name: 'Roolit' });
    const labels = within(roles).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? c.closest('label')?.textContent);
    expect(labels.indexOf('Laulu & koskettimet')).toBe(labels.indexOf('Taustalaulu') + 1);
  });

  it('roles: a failed save shows the error; Esc restores the saved roles', async () => {
    server.use(
      http.patch('/api/people/:id', () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'x', fields: { roles: 'INVALID_VALUE' } } },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp(`/people/${person('Person 2').id}`);
    const roles = await screen.findByRole('group', { name: 'Roolit' });
    const drums = within(roles).getByRole('checkbox', { name: 'Rummut' });
    await user.click(drums);
    await waitFor(() => expect(roles).toHaveAttribute('aria-invalid', 'true'));
    expect(drums).toBeChecked();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(drums).not.toBeChecked());
    expect(roles).not.toHaveAttribute('aria-invalid');
    expect(person('Person 2').roles).toEqual(['BASS']);
  });

  it('unknown person shows not found', async () => {
    renderApp('/people/00000000-0000-4000-8000-00000000ffff');
    expect(await screen.findByText('Henkilöä ei löytynyt.')).toBeInTheDocument();
  });
});
