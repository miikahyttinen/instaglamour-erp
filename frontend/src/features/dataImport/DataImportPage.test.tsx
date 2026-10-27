/// <reference types="node" />
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { File as NodeFile } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMPORT_DATA_TYPES, type ImportSummary } from '../../api/types';
import { setLanguage } from '../../i18n';
import { DESKTOP_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { importStore } from '../../mocks/importStore';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { testFile } from '../../test/files';
import { installMatchMedia } from '../../test/matchMedia';
import { renderApp, signInMock } from '../../test/renderApp';
import { formatFileSize, summaryTotals } from './importLogic';

// Synthetic seed-format document only (BR-090).
const DOC = {
  partners: [{ name: 'Partner A', email: 'partner.a@example.com' }],
  people: [{ name: 'Person 1' }, { name: 'Person 2' }],
  settings: { 'fees.office_default': 100 },
  events: [{ startDate: '2030-05-01', venue: 'Venue X', lineupName: 'Template A' }],
};

function jsonFile(content: unknown, name = 'import.json'): File {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return new NodeFile([text], name, { type: 'application/json' }) as unknown as File;
}

const chooser = () => screen.getByLabelText('Valitse tiedosto');
const checkButton = () => screen.getByRole('button', { name: 'Tarkista' });
const importButton = () => screen.getByRole('button', { name: 'Tuo' });
const rowsOf = (name: string) =>
  within(screen.getByRole('table', { name }))
    .getAllByRole('row')
    .map((r) => within(r).queryAllByRole('cell').map((c) => c.textContent))
    .filter((cells) => cells.length > 0);
const row = (name: string, label: string) => {
  const table = screen.getByRole('table', { name });
  const tr = within(table)
    .getAllByRole('row')
    .find((r) => r.querySelector('td, th')?.textContent === label);
  if (!tr) throw new Error(`no row ${label}`);
  return [...tr.querySelectorAll('td, th')].map((c) => c.textContent);
};

function zeroSummary(): ImportSummary {
  return Object.fromEntries(
    IMPORT_DATA_TYPES.map((type) => [type, { created: 0, updated: 0, skipped: 0 }]),
  ) as ImportSummary;
}

async function openPage() {
  const rendered = renderApp('/import');
  expect(await screen.findByRole('heading', { name: 'Tietojen tuonti', level: 1 })).toBeInTheDocument();
  return rendered;
}

describe('data import (UC-035)', () => {
  beforeEach(() => {
    signInMock();
  });

  it('is the last item in the menu (Upload icon) and opens /import', async () => {
    installMatchMedia({ [DESKTOP_QUERY]: true });
    const { user } = renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Päävalikko' });
    const links = within(nav).getAllByRole('link');
    const last = links[links.length - 1]!;
    expect(last).toHaveTextContent('Tietojen tuonti');
    expect(last).toHaveAttribute('href', '/import');
    expect(last.querySelector('svg.lucide-upload')).not.toBeNull();
    await user.click(last);
    expect(await screen.findByRole('heading', { name: 'Tietojen tuonti', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Ei tuonteja.')).toBeInTheDocument();
  });

  it('check shows counts per data type, saves nothing and enables Import', async () => {
    const posts: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.includes('/api/import')) posts.push(request.url);
    });
    const { user } = await openPage();
    expect(checkButton()).toBeDisabled();
    expect(importButton()).toBeDisabled();

    const file = jsonFile(DOC, 'synthetic.json');
    await user.upload(chooser(), file);
    expect(await screen.findByText(`synthetic.json · ${formatFileSize(file.size, 'fi')}`)).toBeInTheDocument();
    expect(importButton()).toBeDisabled();

    await user.click(checkButton());
    await screen.findByRole('table', { name: 'Tarkistus: mitä tuonti tekisi' });
    expect(screen.getByText('Tarkistus onnistui. Mitään ei ole vielä tallennettu.')).toBeInTheDocument();
    const headers = within(screen.getByRole('table', { name: 'Tarkistus: mitä tuonti tekisi' }))
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Tietotyyppi', 'Luodaan', 'Päivitetään', 'Ohitetaan']);
    expect(rowsOf('Tarkistus: mitä tuonti tekisi')).toHaveLength(IMPORT_DATA_TYPES.length + 1); // + total row
    expect(row('Tarkistus: mitä tuonti tekisi', 'Osakkaat')).toEqual(['Osakkaat', '1', '0', '0']);
    expect(row('Tarkistus: mitä tuonti tekisi', 'Henkilöt')).toEqual(['Henkilöt', '2', '0', '0']);
    expect(row('Tarkistus: mitä tuonti tekisi', 'Tapahtumat')).toEqual(['Tapahtumat', '1', '0', '0']);
    expect(row('Tarkistus: mitä tuonti tekisi', 'Yhteensä')).toEqual(['Yhteensä', '5', '0', '0']);

    expect(posts).toHaveLength(1);
    const url = new URL(posts[0]!);
    expect(url.searchParams.get('dryRun')).toBe('true');
    expect(url.searchParams.get('filename')).toBe('synthetic.json');
    expect(importStore.runs).toHaveLength(0); // nothing saved
    expect(screen.getByText('Ei tuonteja.')).toBeInTheDocument();
    expect(importButton()).toBeEnabled();

    // Another file: the check no longer applies.
    await user.upload(chooser(), jsonFile(DOC, 'other.json'));
    await screen.findByText(/^other\.json · /);
    expect(importButton()).toBeDisabled();
    expect(screen.queryByRole('table', { name: 'Tarkistus: mitä tuonti tekisi' })).not.toBeInTheDocument();
  });

  it('imports after confirmation, shows the result, logs it and refreshes every query', async () => {
    const { user, queryClient } = await openPage();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await user.upload(chooser(), jsonFile(DOC, 'synthetic.json'));
    await screen.findByText(/^synthetic\.json · /);
    await user.click(checkButton());
    await screen.findByRole('table', { name: 'Tarkistus: mitä tuonti tekisi' });

    await user.click(importButton());
    const dialog = screen.getByRole('dialog', { name: 'Tuo tiedot' });
    expect(dialog).toHaveTextContent(
      'Tuonti lisää puuttuvat tiedot. Olemassa olevia tietoja ei muuteta eikä poisteta.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Peruuta' }));
    expect(importStore.runs).toHaveLength(0);

    await user.click(importButton());
    await user.click(within(screen.getByRole('dialog', { name: 'Tuo tiedot' })).getByRole('button', { name: 'Tuo' }));

    expect(
      await screen.findByText('Tuonti valmis: 5 luotu, 0 päivitetty, 0 ohitettu.'),
    ).toBeInTheDocument();
    expect(row('Tuonnin tulos', 'Henkilöt')).toEqual(['Henkilöt', '2', '0', '0']);
    expect(within(screen.getByRole('table', { name: 'Tuonnin tulos' })).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Tietotyyppi', 'Luotu', 'Päivitetty', 'Ohitettu'],
    );
    expect(invalidate).toHaveBeenCalledWith();
    expect(importStore.runs).toHaveLength(1);
    expect(importStore.runs[0]!.filename).toBe('synthetic.json');

    // History refreshed; Import needs a new check.
    const history = await screen.findByRole('table', { name: 'Tuontihistoria' });
    expect(within(history).getAllByRole('row')).toHaveLength(2);
    expect(importButton()).toBeDisabled();

    // Same file again: everything already exists → skipped (A1).
    await user.click(checkButton());
    await screen.findByRole('table', { name: 'Tarkistus: mitä tuonti tekisi' });
    expect(row('Tarkistus: mitä tuonti tekisi', 'Yhteensä')).toEqual(['Yhteensä', '0', '0', '5']);
  });

  it('lists every validation error and imports nothing', async () => {
    const { user } = await openPage();
    const bad = {
      partners: [{ name: 'Partner A', email: 'partner.a@other.test' }],
      references: [{ quoteFi: 'Quote 1', author: 'Person 1', image: 'photo.jpg' }],
    };
    await user.upload(chooser(), jsonFile(bad));
    await screen.findByText(/^import\.json · /);
    await user.click(checkButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tiedostossa on virheitä. Mitään ei tuotu.');
    expect(alert).toHaveTextContent('Virheitä: 2');
    const list = within(alert).getByRole('list', { name: 'Tiedostossa on virheitä. Mitään ei tuotu.' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'partners[0].email: not in the allowed domain',
      'references[0].image: image paths are not allowed in an import',
    ]);
    expect(importButton()).toBeDisabled();
    expect(importStore.runs).toHaveLength(0);
  });

  it('shows a message for a file that is not valid JSON', async () => {
    const { user } = await openPage();
    await user.upload(chooser(), jsonFile('{ "partners": [', 'broken.json'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tiedosto ei ole kelvollista JSONia.');
    expect(checkButton()).toBeDisabled();
  });

  it('rejects a file over 10 MB before sending it', async () => {
    const posts: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST') posts.push(request.url);
    });
    const { user } = await openPage();
    await user.upload(chooser(), testFile('big.json', 'application/json', 10 * 1024 * 1024 + 1));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tiedosto on liian suuri (yli 10 Mt).');
    expect(checkButton()).toBeDisabled();
    expect(posts).toHaveLength(0);
  });

  it('shows the server size error (413 FILE_TOO_LARGE)', async () => {
    server.use(http.post('/api/import', () => errorResponse(413, 'FILE_TOO_LARGE', 'too large')));
    const { user } = await openPage();
    await user.upload(chooser(), jsonFile(DOC));
    await screen.findByText(/^import\.json · /);
    await user.click(checkButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Tiedosto on liian suuri (yli 10 Mt). Mitään ei tuotu.');
  });

  it('accepts a dropped .json file and refuses other files', async () => {
    await openPage();
    const drop = screen.getByTestId('import-drop');
    fireEvent.drop(drop, { dataTransfer: { files: [testFile('notes.txt', 'text/plain')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Valitse .json-tiedosto.');
    fireEvent.drop(drop, { dataTransfer: { files: [jsonFile(DOC, 'dropped.json')] } });
    expect(await screen.findByText(/^dropped\.json · /)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(checkButton()).toBeEnabled();
  });

  it('lists the import history with partner, file and totals; details on expand', async () => {
    const summary = zeroSummary();
    summary.events = { created: 3, updated: 0, skipped: 1 };
    summary.people = { created: 1, updated: 2, skipped: 0 };
    const partnerB = db.partners[1]!;
    importStore.runs.push(
      { id: 'run-2', partnerId: partnerB.id, at: '2030-01-02T10:00:00Z', filename: 'second.json', summary },
      { id: 'run-1', partnerId: db.partners[0]!.id, at: '2030-01-01T10:00:00Z', filename: null, summary: zeroSummary() },
    );
    const { user } = await openPage();
    const history = await screen.findByRole('table', { name: 'Tuontihistoria' });
    expect(within(history).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Aika',
      'Osakas',
      'Tiedosto',
      'Luotu',
      'Päivitetty',
      'Ohitettu',
      'Erittely',
    ]);
    const body = within(history).getAllByRole('row').slice(1);
    const cells = (tr: HTMLElement) => within(tr).getAllByRole('cell').map((c) => c.textContent);
    expect(cells(body[0]!).slice(1, 6)).toEqual([partnerB.name, 'second.json', '4', '2', '1']);
    expect(summaryTotals(summary)).toEqual({ created: 4, updated: 2, skipped: 1 });
    expect(cells(body[1]!).slice(1, 6)).toEqual([db.partners[0]!.name, '–', '0', '0', '0']);

    const toggle = within(body[0]!).getByRole('button', { name: 'Näytä erittely' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(within(body[0]!).getByRole('button', { name: 'Piilota erittely' })).toHaveAttribute('aria-expanded', 'true');
    const details = within(body[0]!).getByRole('list');
    expect(within(details).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Henkilöt: luotu 1, päivitetty 2, ohitettu 0',
      'Tapahtumat: luotu 3, päivitetty 0, ohitettu 1',
    ]);
  });

  it('is translated to English', async () => {
    setLanguage('en');
    signInMock().language = 'en';
    const { user } = renderApp('/import');
    expect(await screen.findByRole('heading', { name: 'Data import', level: 1 })).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Choose file'), jsonFile(DOC));
    await screen.findByText(/^import\.json · /);
    await user.click(screen.getByRole('button', { name: 'Check' }));
    const table = await screen.findByRole('table', { name: 'Check: what the import would do' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Data type',
      'Create',
      'Update',
      'Skip',
    ]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled());
  });
});
