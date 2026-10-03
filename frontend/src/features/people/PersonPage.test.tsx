import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatMoney } from '../../lib/format';
import { db } from '../../mocks/data';
import { payCostLine } from '../../mocks/gigStore';
import { addMockGig, mockLine, partnerA, person, staffMockGig, TEST_YEAR } from '../../test/gigFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const fi = (cents: number) => formatMoney(cents, 'fi').replace(/\s/g, ' ');
const cellTexts = (row: HTMLElement) =>
  within(row).getAllByRole('cell').map((c) => c.textContent!.replace(/\s/g, ' '));
const table = () => screen.getByRole('table', { name: `Kulurivit ${TEST_YEAR}` });
const bodyRows = () => within(table()).getAllByRole('row').filter((r) => r.closest('tbody'));

/** Person 1 on three gigs of TEST_YEAR (one paid line, one cancelled gig), one deleted, one next year. */
function seedLines() {
  const g1 = addMockGig({ startDate: `${TEST_YEAR}-03-01`, venue: 'Venue X' });
  staffMockGig(g1, ['Person 1']);
  payCostLine(db.gigs, mockLine(g1, 'VOC'), 10000, partnerA().id);

  const g2 = addMockGig({ startDate: `${TEST_YEAR}-06-01`, venue: 'Venue Y', lineupName: 'Custom lineup', lineupTemplateId: null });
  db.gigs.costLines.push({
    ...mockLine(g2, 'OFFICE'),
    id: '00000000-0000-4000-8000-000000000999',
    type: 'OTHER',
    description: 'Expense 1',
    personId: person('Person 1').id,
    budgetedCents: 10000,
  });

  const cancelled = addMockGig({ startDate: `${TEST_YEAR}-08-01`, venue: 'Venue Z' });
  staffMockGig(cancelled, ['Person 2', 'Person 1']);
  cancelled.status = 'CANCELLED';

  const deleted = addMockGig({ startDate: `${TEST_YEAR}-09-01`, venue: 'Venue U' });
  staffMockGig(deleted, ['Person 1']);
  deleted.deletedAt = new Date().toISOString();

  const nextYear = addMockGig({ startDate: `${TEST_YEAR + 1}-01-10`, venue: 'Venue W' });
  staffMockGig(nextYear, ['Person 1']);
  return { g1, g2, cancelled };
}

describe('person page (UC-014 A2)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it("lists the person's cost lines of the selected year with totals and gig links", async () => {
    const { g1, g2, cancelled } = seedLines();
    renderApp(`/people/${person('Person 1').id}`);
    expect(await screen.findByRole('heading', { name: 'Person 1', level: 1 })).toBeInTheDocument();
    await screen.findByRole('table', { name: `Kulurivit ${TEST_YEAR}` });

    const rows = bodyRows();
    expect(rows).toHaveLength(3);

    const [paid, other, onCancelled] = rows as [HTMLElement, HTMLElement, HTMLElement];
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
    expect(cellTexts(total)).toEqual([fi(30000), fi(10000), '']); // budget: 3 lines; actual: paid only
    expect(screen.queryByText('Venue U')).not.toBeInTheDocument();
    expect(screen.queryByText('Venue W')).not.toBeInTheDocument();
  });

  it('follows the selected year', async () => {
    seedLines();
    const { user } = renderApp(`/people/${person('Person 1').id}`);
    await screen.findByRole('table', { name: `Kulurivit ${TEST_YEAR}` });
    await user.click(screen.getByRole('button', { name: 'Seuraava vuosi' }));
    await screen.findByRole('table', { name: `Kulurivit ${TEST_YEAR + 1}` });
    await waitFor(() => expect(screen.getByText('Venue W')).toBeInTheDocument());
    expect(screen.queryByText('Venue X')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no lines', async () => {
    renderApp(`/people/${person('Person 3').id}`);
    expect(await screen.findByText(`Ei kulurivejä vuonna ${TEST_YEAR}.`)).toBeInTheDocument();
  });

  it('can rename and activate an inactive person', async () => {
    const { user } = renderApp(`/people/${person('Person 9').id}`);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Person 9');
    expect(heading).toHaveTextContent('Ei käytössä');

    await user.click(screen.getByRole('button', { name: 'Ota käyttöön: Person 9' }));
    expect(await screen.findByText('Person 9 otettu käyttöön.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Ei käytössä'));

    await user.click(screen.getByRole('button', { name: 'Muuta nimeä: Person 9' }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Uusi nimi'));
    await user.type(within(dialog).getByLabelText('Uusi nimi'), 'Person 19');
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));
    expect(await screen.findByRole('heading', { name: 'Person 19', level: 1 })).toBeInTheDocument();
  });

  it('unknown person shows not found', async () => {
    renderApp('/people/00000000-0000-4000-8000-00000000ffff');
    expect(await screen.findByText('Henkilöä ei löytynyt.')).toBeInTheDocument();
  });
});
