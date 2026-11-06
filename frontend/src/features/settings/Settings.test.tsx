import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LineupTemplateUpdate } from '../../api/types';
import { setLanguage } from '../../i18n';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { renderApp, signInMock } from '../../test/renderApp';

// Synthetic lineups only (BR-090): Template A/B active (A has gigs), Template C inactive, unused.
const lineup = (name: string) => db.reference.lineupTemplates.find((l) => l.name === name)!;
const templateC = () => lineup('Template C');

/** PATCH bodies sent to /api/lineup-templates/:id. */
function recordPatches(): LineupTemplateUpdate[] {
  const patches: LineupTemplateUpdate[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PATCH' && request.url.includes('/api/lineup-templates/')) {
      void request
        .clone()
        .json()
        .then((b) => patches.push(b as LineupTemplateUpdate));
    }
  });
  return patches;
}

const linesTable = () => screen.getByRole('table', { name: 'Kokoonpanon rivit' });
const lineRow = (label: string) => within(linesTable()).getByRole('row', { name: label });
const rowLabels = () =>
  within(linesTable())
    .getAllByRole('row')
    .map((r) => r.getAttribute('aria-label'))
    .filter(Boolean);

async function openLineup(name: string) {
  const rendered = renderApp(`/settings/lineups/${lineup(name).id}`);
  expect(await screen.findByRole('textbox', { name: 'Nimi' })).toHaveValue(name);
  return rendered;
}

describe('settings: lineups', () => {
  beforeEach(() => {
    signInMock();
  });

  it('/settings opens the Lineups tab: name, status, lines, gigs, total; inactive ones last and muted', async () => {
    renderApp('/settings');
    expect(await screen.findByRole('heading', { name: 'Asetukset', level: 1 })).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Asetusten osiot' });
    const table = await screen.findByRole('table', { name: 'Kokoonpanot' });
    // /settings redirects to /settings/lineups (in an effect).
    await waitFor(() =>
      expect(within(tabs).getByRole('link', { name: 'Kokoonpanot' })).toHaveAttribute('aria-current', 'page'),
    );
    const rows = within(table).getAllByRole('row').slice(1);
    const gigsA = db.events.events.filter((e) => e.lineupTemplateId === lineup('Template A').id).length;
    expect(rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent?.replace(/\s/g, ' ')))).toEqual([
      ['Template A', 'Käytössä', '7', String(gigsA), '430,00 €'],
      ['Template B', 'Käytössä', '5', expect.any(String), '230,00 €'],
      ['Template C', 'Ei käytössä', '1', '0', '100,00 €'],
    ]);
    expect(rows[2]).toHaveClass('is-inactive');
    expect(within(rows[0]!).getByRole('link', { name: 'Template A' })).toHaveAttribute(
      'href',
      `/settings/lineups/${lineup('Template A').id}`,
    );
  });

  it('"New lineup" asks the name inline (duplicate → error), creates it and opens it', async () => {
    const { user } = renderApp('/settings/lineups');
    await user.click(await screen.findByRole('button', { name: 'Uusi kokoonpano' }));
    const name = screen.getByRole('textbox', { name: 'Uuden kokoonpanon nimi' });
    expect(name).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Luo' }));
    expect(name).toHaveAccessibleDescription('Pakollinen tieto.');
    await user.type(name, 'template a');
    await user.click(screen.getByRole('button', { name: 'Luo' }));
    expect(await screen.findByText('Nimi on jo käytössä.')).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'Lineup Q{Enter}');

    expect(await screen.findByRole('textbox', { name: 'Nimi' })).toHaveValue('Lineup Q');
    expect(screen.getByText('Ei rivejä.')).toBeInTheDocument();
    expect(lineup('Lineup Q')).toMatchObject({ active: true, lines: [] });
  });

  it('editor: adds lines in the draft row (OTHER needs a description), edits inline, moves and removes; whole list each time', async () => {
    const patches = recordPatches();
    const { user } = await openLineup('Template C');
    expect(rowLabels()).toEqual(['DJ']);
    expect(screen.getByText(/^100,00\s€$/)).toBeInTheDocument(); // total

    // Draft row: type groups as on the gig cost table; saved when the focus leaves the row.
    await user.click(screen.getByRole('button', { name: 'Lisää rivi' }));
    const draft = () => lineRow('Uusi rivi');
    const type = within(draft()).getByRole('combobox', { name: 'Tyyppi: Uusi rivi' });
    expect(type).toHaveFocus();
    expect(within(type).getAllByRole('group').map((g) => g.getAttribute('label'))).toEqual([
      'Soittajat ja tekniikka',
      'Sisäiset',
      'Kulut',
    ]);
    await user.selectOptions(type, 'Muu kulu');
    await user.type(within(draft()).getByRole('textbox', { name: 'Oletussumma: Uusi rivi' }), '50');
    await user.click(document.body);
    expect(await within(draft()).findByText('Kuvaus on pakollinen.')).toBeInTheDocument();
    expect(patches).toHaveLength(0);
    await user.type(within(draft()).getByRole('textbox', { name: 'Kuvaus: Uusi rivi' }), 'Stage');
    await user.click(document.body);
    await waitFor(() => expect(rowLabels()).toEqual(['DJ', 'Muu kulu (Stage)']));

    // Second line: an empty amount is 0 €.
    await user.click(screen.getByRole('button', { name: 'Lisää rivi' }));
    await user.selectOptions(within(draft()).getByRole('combobox', { name: 'Tyyppi: Uusi rivi' }), 'Basso');
    await user.click(document.body);
    await waitFor(() => expect(rowLabels()).toEqual(['DJ', 'Muu kulu (Stage)', 'Basso']));
    expect(templateC().lines).toEqual([
      { type: 'DJ', description: null, defaultCents: 10000 },
      { type: 'OTHER', description: 'Stage', defaultCents: 5000 },
      { type: 'BASS', description: null, defaultCents: 0 },
    ]);

    // Inline amount: Enter saves the whole list.
    const amount = within(lineRow('Basso')).getByRole('textbox', { name: 'Oletussumma: Basso' });
    await user.type(amount, '{Control>}a{/Control}120{Enter}');
    await waitFor(() => expect(templateC().lines[2]!.defaultCents).toBe(12000));
    expect(screen.getByText(/^270,00\s€$/)).toBeInTheDocument();

    // Move: order is the user's (musician lines are not forced first).
    await user.click(within(lineRow('Basso')).getByRole('button', { name: 'Siirrä ylös: Basso' }));
    await waitFor(() => expect(rowLabels()).toEqual(['DJ', 'Basso', 'Muu kulu (Stage)']));
    await user.click(within(lineRow('DJ')).getByRole('button', { name: 'Siirrä alas: DJ' }));
    await waitFor(() => expect(rowLabels()).toEqual(['Basso', 'DJ', 'Muu kulu (Stage)']));
    expect(within(lineRow('Basso')).getByRole('button', { name: 'Siirrä ylös: Basso' })).toBeDisabled();

    // Description of an OTHER line can't be cleared (client-side check, nothing sent).
    const sent = patches.length;
    const description = within(lineRow('Muu kulu (Stage)')).getByRole('textbox', { name: 'Kuvaus: Muu kulu (Stage)' });
    await user.clear(description);
    await user.tab();
    expect(await screen.findByText('Kuvaus on pakollinen.')).toBeInTheDocument();
    expect(patches).toHaveLength(sent);
    await user.type(description, '{Escape}');

    // Remove.
    await user.click(within(lineRow('DJ')).getByRole('button', { name: 'Poista rivi: DJ' }));
    await waitFor(() => expect(rowLabels()).toEqual(['Basso', 'Muu kulu (Stage)']));
    await waitFor(() => expect(patches.length).toBeGreaterThan(sent));
    // Every change sends the whole list (PATCH lines).
    expect(patches.every((p) => Array.isArray(p.lines) && Object.keys(p).length === 1)).toBe(true);
    expect(patches.at(-1)!.lines).toEqual([
      { type: 'BASS', description: null, defaultCents: 12000 },
      { type: 'OTHER', description: 'Stage', defaultCents: 5000 },
    ]);
  });

  it('editor: changing a line type saves; a server line error is shown translated', async () => {
    const { user } = await openLineup('Template C');
    await user.selectOptions(within(lineRow('DJ')).getByRole('combobox', { name: 'Tyyppi: DJ' }), 'Rummut');
    await waitFor(() => expect(templateC().lines[0]!.type).toBe('DRUMS'));

    server.use(
      http.patch('/api/lineup-templates/:id', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'x', { 'lines[0].defaultCents': 'NEGATIVE_AMOUNT' }),
      ),
    );
    await user.click(within(lineRow('Rummut')).getByRole('button', { name: 'Poista rivi: Rummut' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Summa ei voi olla negatiivinen.');
  });

  it('rename inline (save on Enter; duplicate → error) and the active switch', async () => {
    const patches = recordPatches();
    const { user } = await openLineup('Template C');
    const stored = templateC();
    const name = screen.getByRole('textbox', { name: 'Nimi' });
    await user.clear(name);
    await user.type(name, 'Template A{Enter}');
    expect(await screen.findByText('Nimi on jo käytössä.')).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'Lineup R{Enter}');
    await waitFor(() => expect(stored.name).toBe('Lineup R'));

    const active = screen.getByRole('switch', { name: 'Käytössä' });
    expect(active).not.toBeChecked();
    await user.click(active);
    await waitFor(() => expect(stored.active).toBe(true));
    expect(patches).toContainEqual({ active: true });
    expect(patches).toContainEqual({ name: 'Lineup R' });
  });

  it('delete only when no gig uses it: confirm → back to the list with a notice', async () => {
    const used = await openLineup('Template A');
    expect(screen.getByText(/^Keikkoja: \d+$/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Poista kokoonpano' })).not.toBeInTheDocument();
    used.unmount();

    const { user } = await openLineup('Template C');
    const id = templateC().id;
    await user.click(screen.getByRole('button', { name: 'Poista kokoonpano' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Poistetaanko kokoonpano Template C?');
    await user.click(within(dialog).getByRole('button', { name: 'Poista kokoonpano' }));
    expect(await screen.findByText('Kokoonpano poistettu: Template C.')).toBeInTheDocument();
    expect(db.reference.lineupTemplates.some((l) => l.id === id)).toBe(false);
    expect(screen.queryByRole('link', { name: 'Template C' })).not.toBeInTheDocument();
  });

  it('409 LINEUP_IN_USE (a gig was linked meanwhile) is shown in the dialog', async () => {
    server.use(http.delete('/api/lineup-templates/:id', () => errorResponse(409, 'LINEUP_IN_USE', 'in use')));
    const { user } = await openLineup('Template C');
    await user.click(screen.getByRole('button', { name: 'Poista kokoonpano' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Poista kokoonpano' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Kokoonpanoa ei voi poistaa, koska siihen on liitetty keikkoja. Poista se käytöstä.',
    );
    expect(within(dialog).getByRole('button', { name: 'Poista kokoonpano' })).toBeDisabled();
  });

  it('unknown lineup id shows "not found"', async () => {
    server.use(http.get('/api/lineup-templates', () => HttpResponse.json([])));
    renderApp('/settings/lineups/00000000-0000-4000-8000-00000000dead');
    expect(await screen.findByText('Kokoonpanoa ei löytynyt.')).toBeInTheDocument();
  });

  it('is translated to English', async () => {
    setLanguage('en');
    signInMock().language = 'en';
    const { user } = renderApp('/settings');
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Lineups' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Name',
      'Status',
      'Lines',
      'Gigs',
      'Default amounts',
    ]);
    await user.click(within(table).getByRole('link', { name: 'Template C' }));
    expect(await screen.findByRole('switch', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add line' })).toBeInTheDocument();
  });
});
