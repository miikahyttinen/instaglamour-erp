import { screen, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { errorResponse } from '../../mocks/util';
import { server } from '../../mocks/server';
import { partnerA, partnerB, TEST_YEAR } from '../../test/gigFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const gigCount = () => db.gigs.gigs.length;
const lines = () => within(screen.getByRole('list', { name: 'Kulut ja miehitys' })).getAllByRole('listitem');

describe('new gig (UC-002)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('creates a gig from a template with template, Office, Sales and Production lines', async () => {
    const { user } = renderApp('/gigs/new');
    await screen.findByRole('option', { name: 'Template A' });
    expect(screen.getByRole('combobox', { name: 'Myyjä' })).toHaveValue(partnerA().id);
    expect(screen.getByRole('combobox', { name: 'Tuottaja' })).toHaveValue(partnerA().id);

    await user.type(screen.getByLabelText('Alkupäivä'), `${TEST_YEAR}-06-01`);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kokoonpano' }), 'Template A');
    expect(screen.getByText('Roolit: Laulu, Kitara, Basso, Rummut')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Paikka' }), 'Venue X');
    await user.click(screen.getByRole('checkbox', { name: 'Pakettiauto' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tuottaja' }), partnerB().id);
    await user.type(screen.getByRole('textbox', { name: 'Hinta (alv 0 %)' }), '1000');
    await user.type(screen.getByRole('textbox', { name: 'Lisämyynti' }), '100');
    expect(screen.getByText(/Kokonaishinta:/)).toHaveTextContent(/1\s100,00\s€/);
    await user.click(screen.getByRole('button', { name: 'Luo keikka' }));

    expect(await screen.findByRole('heading', { name: 'Template A · Venue X' })).toBeInTheDocument();
    expect(lines().map((li) => li.getAttribute('aria-label'))).toEqual([
      'Laulu', 'Kitara', 'Basso', 'Rummut', 'Toimisto', 'Myynti', 'Tuotanto',
    ]);
    const gig = db.gigs.gigs.at(-1)!;
    expect(gig).toMatchObject({ priceCents: 100000, additionalSalesCents: 10000, technicalSetup: ['VAN'] });
    // Sales person = seller, Production person = producer (AC-2).
    expect(await within(lines()[5]!).findByDisplayValue('Partner A')).toBeInTheDocument();
    expect(within(lines()[6]!).getByDisplayValue('Partner B')).toBeInTheDocument();
    // No customer fields exist (AC-6); CREATED is logged (AC-5).
    expect(await screen.findByText('Keikka luotu')).toBeInTheDocument();
  });

  it('custom lineup needs a name and gets only Office, Sales and Production', async () => {
    const { user } = renderApp('/gigs/new');
    await screen.findByRole('option', { name: 'Template A' });
    await user.type(screen.getByLabelText('Alkupäivä'), `${TEST_YEAR}-06-01`);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kokoonpano' }), 'Oma kokoonpano');
    await user.type(screen.getByRole('textbox', { name: 'Paikka' }), 'Venue X');
    await user.type(screen.getByRole('textbox', { name: 'Hinta (alv 0 %)' }), '1000');
    await user.click(screen.getByRole('button', { name: 'Luo keikka' }));
    expect(screen.getByRole('textbox', { name: 'Kokoonpanon nimi' })).toHaveAccessibleDescription(
      'Pakollinen tieto.',
    );
    await user.type(screen.getByRole('textbox', { name: 'Kokoonpanon nimi' }), 'Lineup Z');
    await user.click(screen.getByRole('button', { name: 'Luo keikka' }));
    expect(await screen.findByRole('heading', { name: 'Lineup Z · Venue X' })).toBeInTheDocument();
    expect(lines().map((li) => li.getAttribute('aria-label'))).toEqual(['Toimisto', 'Myynti', 'Tuotanto']);
  });

  it('shows localized field errors, keeps the input and saves nothing', async () => {
    const before = gigCount();
    const { user } = renderApp('/gigs/new');
    await screen.findByRole('option', { name: 'Template A' });
    await user.type(screen.getByLabelText('Alkupäivä'), `${TEST_YEAR}-06-02`);
    await user.type(screen.getByLabelText('Loppupäivä'), `${TEST_YEAR}-06-01`);
    await user.type(screen.getByRole('textbox', { name: 'Hinta (alv 0 %)' }), '-10');
    await user.click(screen.getByRole('button', { name: 'Luo keikka' }));

    expect(screen.getByLabelText('Loppupäivä')).toHaveAccessibleDescription(
      expect.stringContaining('Loppupäivä ei voi olla ennen alkupäivää.'),
    );
    expect(screen.getByRole('combobox', { name: 'Kokoonpano' })).toHaveAccessibleDescription('Pakollinen tieto.');
    expect(screen.getByRole('textbox', { name: 'Paikka' })).toHaveAccessibleDescription('Pakollinen tieto.');
    expect(screen.getByRole('textbox', { name: 'Hinta (alv 0 %)' })).toHaveAccessibleDescription(
      'Summa ei voi olla negatiivinen.',
    );
    expect(screen.getByRole('textbox', { name: 'Hinta (alv 0 %)' })).toHaveValue('-10');
    expect(gigCount()).toBe(before);
  });

  it('translates server field codes and never shows the server message', async () => {
    server.use(
      http.post('/api/gigs', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Server English text', {
          venue: 'TOO_LONG',
          lineupTemplateId: 'UNKNOWN_REFERENCE',
        }),
      ),
    );
    const { user } = renderApp('/gigs/new');
    await screen.findByRole('option', { name: 'Template A' });
    await user.type(screen.getByLabelText('Alkupäivä'), `${TEST_YEAR}-06-01`);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kokoonpano' }), 'Template A');
    await user.type(screen.getByRole('textbox', { name: 'Paikka' }), 'Venue X');
    await user.type(screen.getByRole('textbox', { name: 'Hinta (alv 0 %)' }), '1000');
    await user.click(screen.getByRole('button', { name: 'Luo keikka' }));

    expect(await screen.findByText('Teksti on liian pitkä.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Kokoonpano' })).toHaveAccessibleDescription(
      expect.stringContaining('Valittua tietoa ei ole olemassa.'),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Tarkista lomakkeen tiedot.');
    expect(screen.queryByText(/Server English text/)).not.toBeInTheDocument();
  });
});
