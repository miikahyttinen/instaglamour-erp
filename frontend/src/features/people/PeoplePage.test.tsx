import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { setLanguage } from '../../i18n';
import { TABLET_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { createQueryClient } from '../../queryClient';
import { installMatchMedia } from '../../test/matchMedia';
import { renderApp, signInMock } from '../../test/renderApp';

const list = () => screen.getByRole('table', { name: 'Henkilöt' });
/** Body rows of the people table (one per person). */
const rows = () =>
  within(list())
    .queryAllByRole('row')
    .filter((r) => r.closest('tbody'));
/** Saved names: the inline name input of each row. */
const nameInput = (tr: HTMLElement) => within(tr).getByRole('textbox') as HTMLInputElement;
const names = () => rows().map((tr) => nameInput(tr).value);
const row = (name: string) => rows().find((tr) => nameInput(tr).value === name)!;

function UrlProbe() {
  const { search } = useLocation();
  return <output data-testid="url">{search}</output>;
}
const url = () => new URLSearchParams(screen.getByTestId('url').textContent ?? '');

/** Like `openPeople`, plus a probe of the current query string (`url()`). */
async function openPeopleWithUrl(path = '/people') {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App queryClient={createQueryClient({ retry: false })} />
      <UrlProbe />
    </MemoryRouter>,
  );
  await screen.findByRole('table', { name: 'Henkilöt' });
  return { user };
}

async function openPeople(path = '/people') {
  const app = renderApp(path);
  await screen.findByRole('heading', { name: 'Henkilöt', level: 1 });
  await screen.findByRole('table', { name: 'Henkilöt' });
  return app;
}

describe('people register (UC-014)', () => {
  beforeEach(() => {
    server.events.removeAllListeners();
    signInMock();
  });

  it('lists active people by default and filters inactive / all', async () => {
    const { user } = await openPeople();
    expect(names()).toContain('Person 1');
    expect(names()).not.toContain('Person 9');

    await user.click(screen.getByRole('button', { name: 'Ei käytössä' }));
    await waitFor(() => expect(names()).toEqual(['Person 9']));
    expect(within(row('Person 9')).getByRole('switch', { name: 'Aktiivinen: Person 9' })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Kaikki' }));
    await waitFor(() => expect(names()).toContain('Person 1'));
    expect(names()).toContain('Person 9');
    expect(screen.getByRole('button', { name: 'Kaikki' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('each row links to the person page', async () => {
    const { user } = await openPeople();
    await user.click(within(row('Person 2')).getByRole('link', { name: 'Avaa: Person 2' }));
    expect(await screen.findByRole('heading', { name: 'Person 2', level: 1 })).toBeInTheDocument();
  });

  it('adds a person with a name', async () => {
    const { user } = await openPeople();
    await user.type(screen.getByLabelText('Nimi'), '  Person 10 ');
    await user.click(screen.getByRole('button', { name: 'Lisää' }));

    expect(await screen.findByText('Henkilö lisätty: Person 10.')).toBeInTheDocument();
    await waitFor(() => expect(names()).toContain('Person 10'));
    expect(screen.getByLabelText('Nimi')).toHaveValue('');
    expect(db.gigs.people.some((p) => p.name === 'Person 10' && p.active)).toBe(true);
  });

  it('empty name shows "required" and sends nothing', async () => {
    const posts: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && new URL(request.url).pathname === '/api/people') posts.push('x');
    });
    const { user } = await openPeople();
    await user.type(screen.getByLabelText('Nimi'), '   ');
    await user.click(screen.getByRole('button', { name: 'Lisää' }));
    expect(await screen.findByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nimi')).toHaveAttribute('aria-invalid', 'true');
    expect(posts).toHaveLength(0);
  });

  it('duplicate name shows the DUPLICATE_NAME warning but still saves', async () => {
    const before = db.gigs.people.length;
    const { user } = await openPeople();
    await user.type(screen.getByLabelText('Nimi'), 'person 1');
    await user.click(screen.getByRole('button', { name: 'Lisää' }));

    const status = await screen.findByText('Samanniminen henkilö on jo olemassa.');
    expect(status.closest('[role="status"]')).toHaveTextContent('Henkilö lisätty: person 1.');
    await waitFor(() => expect(names()).toContain('person 1'));
    expect(db.gigs.people).toHaveLength(before + 1);
  });

  it('translates server field errors and never shows the server message', async () => {
    server.use(
      http.post('/api/people', () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Server says no', fields: { name: 'TOO_LONG' } } },
          { status: 400 },
        ),
      ),
    );
    const { user } = await openPeople();
    await user.type(screen.getByLabelText('Nimi'), 'Person 10');
    await user.click(screen.getByRole('button', { name: 'Lisää' }));
    expect(await screen.findByText('Teksti on liian pitkä.')).toBeInTheDocument();
    expect(screen.queryByText(/Server says no/)).not.toBeInTheDocument();
  });

  it('has no Edit buttons or rename dialog: names and active switches are edited in place', async () => {
    await openPeople();
    // Only the header sort toggles (TASK-156) are buttons; rows have none.
    expect(rows().flatMap((tr) => within(tr).queryAllByRole('button'))).toEqual([]);
    expect(screen.queryByRole('button', { name: /Muuta nimeä|Ota käyttöön|Poista käytöstä|Tallenna/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nimi: Person 2')).toHaveValue('Person 2');
    expect(screen.getByRole('switch', { name: 'Aktiivinen: Person 2' })).toBeChecked();
  });

  it('renames a person inline on blur; a duplicate name warns but saves', async () => {
    const patches: unknown[] = [];
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PATCH') patches.push(await request.clone().json());
    });
    const { user } = await openPeople();
    const input = screen.getByLabelText('Nimi: Person 2');
    await user.clear(input);
    await user.type(input, 'Person 20');
    expect(patches).toEqual([]);
    await user.click(document.body);

    await waitFor(() => expect(names()).toContain('Person 20'));
    expect(names()).not.toContain('Person 2');
    expect(patches).toEqual([{ name: 'Person 20' }]);
    expect(db.gigs.people.some((p) => p.name === 'Person 20')).toBe(true);

    await user.clear(screen.getByLabelText('Nimi: Person 20'));
    await user.type(screen.getByLabelText('Nimi: Person 20'), 'Person 3{Enter}');
    const warning = await screen.findByText('Samanniminen henkilö on jo olemassa.');
    expect(warning.closest('[role="status"]')).toHaveTextContent('Nimi tallennettu: Person 3.');
    await waitFor(() => expect(names().filter((n) => n === 'Person 3')).toHaveLength(2));
    // Duplicate names still get unique accessible names per row.
    expect(screen.getByLabelText('Nimi: Person 3 (1)')).toBeInTheDocument();
    expect(screen.getByLabelText('Nimi: Person 3 (2)')).toBeInTheDocument();
  });

  it('empty name shows "required", sends nothing and Esc restores the name', async () => {
    const patches: unknown[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PATCH') patches.push('x');
    });
    const { user } = await openPeople();
    const input = screen.getByLabelText('Nimi: Person 2');
    await user.clear(input);
    await user.click(document.body);
    expect(await screen.findByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(patches).toHaveLength(0);

    await user.click(input);
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Person 2');
    expect(names()).toContain('Person 2');
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
    const { user } = await openPeople();
    const input = screen.getByLabelText('Nimi: Person 2');
    await user.type(input, 'x{Enter}');
    expect(await screen.findByText('Teksti on liian pitkä.')).toBeInTheDocument();
    expect(input).toHaveValue('Person 2x');
    expect(screen.queryByText(/Server says no/)).not.toBeInTheDocument();
  });

  it('the active switch saves on change (deactivate and activate)', async () => {
    const { user } = await openPeople();
    await user.click(screen.getByRole('switch', { name: 'Aktiivinen: Person 2' }));
    expect(await screen.findByText('Person 2 poistettu käytöstä.')).toBeInTheDocument();
    await waitFor(() => expect(names()).not.toContain('Person 2'));
    expect(db.gigs.people.find((p) => p.name === 'Person 2')!.active).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Ei käytössä' }));
    await waitFor(() => expect(names()).toContain('Person 2'));
    await user.click(screen.getByRole('switch', { name: 'Aktiivinen: Person 2' }));
    expect(await screen.findByText('Person 2 otettu käyttöön.')).toBeInTheDocument();
    await waitFor(() => expect(names()).not.toContain('Person 2'));
    expect(db.gigs.people.find((p) => p.name === 'Person 2')!.active).toBe(true);
  });

  it('shows an Osakas tag on partners and the "only partners" checkbox filters (UC-032 AC-5)', async () => {
    const { user } = await openPeople();
    expect(within(row('Partner A')).getByText('Osakas')).toHaveClass('tag');
    expect(within(row('Person 1')).queryByText('Osakas')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Osakkuus' })).not.toBeInTheDocument();

    const only = screen.getByRole('checkbox', { name: 'Näytä vain osakkaat' });
    expect(only).not.toBeChecked();
    await user.click(only);
    await waitFor(() => expect(names()).toEqual(['Partner A', 'Partner B', 'Partner C']));

    // Unchecked = no partner filter (everyone).
    await user.click(only);
    await waitFor(() => expect(names()).toContain('Person 1'));
    expect(names()).toContain('Partner A');
  });

  it('a removed partner has no tag and is not in the partner filter', async () => {
    db.partners.find((p) => p.name === 'Partner C')!.active = false;
    const { user } = await openPeople('/people?partner=true');
    await waitFor(() => expect(names()).toEqual(['Partner A', 'Partner B']));
    const only = screen.getByRole('checkbox', { name: 'Näytä vain osakkaat' });
    expect(only).toBeChecked();
    await user.click(only);
    await waitFor(() => expect(names()).toContain('Partner C'));
    expect(within(row('Partner C')).queryByText('Osakas')).not.toBeInTheDocument();
  });

  it('shows roles as tags and the played gig count', async () => {
    db.gigs.people.find((p) => p.name === 'Person 5')!.roles = ['KEYS', 'PIANO'];
    await openPeople();
    const head = within(list()).getAllByRole('columnheader').map((th) => th.textContent);
    expect(head).toEqual(expect.arrayContaining(['Roolit', 'Keikkoja', 'Osakas']));
    const tags = within(row('Person 5')).getAllByText(/Koskettimet|Piano/);
    expect(tags.map((t) => t.textContent)).toEqual(['Koskettimet', 'Piano']);
    tags.forEach((tag) => expect(tag).toHaveClass('tag'));
    const count = within(row('Person 5')).getByRole('cell', { name: '0' });
    expect(count).toHaveClass('num');
  });

  it('gig count comes from the API', async () => {
    server.use(
      http.get('/api/people', () =>
        HttpResponse.json([
          { id: '00000000-0000-4000-8000-000000000999', name: 'Person X', active: true, partner: null, roles: ['DRUMS'], gigCount: 12 },
        ]),
      ),
    );
    await openPeople();
    expect(within(row('Person X')).getByRole('cell', { name: '12' })).toHaveClass('num');
    expect(within(row('Person X')).getByText('Rummut')).toHaveClass('tag');
  });

  it('filters by role, combined with active and partner filters (one request with all params)', async () => {
    const queries: string[] = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/api/people') queries.push(url.search);
    });
    const { user } = await openPeople();
    const roleSelect = screen.getByRole('combobox', { name: 'Rooli' });
    expect(roleSelect).toHaveDisplayValue('Kaikki roolit');
    await user.selectOptions(roleSelect, 'Basso');
    await waitFor(() => expect(names()).toEqual(['Person 2']));
    expect(queries.at(-1)).toContain('role=BASS');

    await user.selectOptions(roleSelect, 'Laulu');
    await waitFor(() => expect(names()).toEqual(['Partner A', 'Person 1']));
    await user.click(screen.getByRole('checkbox', { name: 'Näytä vain osakkaat' }));
    await waitFor(() => expect(names()).toEqual(['Partner A']));
    const last = new URLSearchParams(queries.at(-1));
    expect(last.get('role')).toBe('VOC');
    expect(last.get('partner')).toBe('true');
    expect(last.get('active')).toBe('true');

    await user.selectOptions(roleSelect, 'Kaikki roolit');
    await waitFor(() => expect(names()).toEqual(['Partner A', 'Partner B', 'Partner C']));
    expect(new URLSearchParams(queries.at(-1)).has('role')).toBe(false);
  });

  it('reads the filters from the URL', async () => {
    await openPeople('/people?active=all&role=DJ');
    await waitFor(() => expect(names()).toEqual(['Person 8']));
    expect(screen.getByRole('combobox', { name: 'Rooli' })).toHaveDisplayValue('DJ');
    expect(screen.getByRole('button', { name: 'Kaikki' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: 'Näytä vain osakkaat' })).not.toBeChecked();
  });

  describe('sorting (TASK-156)', () => {
    const sortHeader = (name: string) => within(list()).getByRole('columnheader', { name: new RegExp(`^${name}`) });
    const setPeople = (people: object[]) =>
      server.use(http.get('/api/people', () => HttpResponse.json(people)));
    const person = (n: number, name: string, gigCount: number, partner = false) => ({
      id: `00000000-0000-4000-8000-00000000010${n}`,
      name,
      active: true,
      partner: partner ? { active: true, email: `p${n}@example.com`, language: 'fi' } : null,
      roles: [],
      gigCount,
    });
    // API order deliberately unsorted; names test FI collation (å/ä/ö after z) and case.
    const synthetic = [
      person(1, 'Örjan X', 3),
      person(2, 'person b', 5, true),
      person(3, 'Ärrä Y', 5),
      person(4, 'Person A', 0, true),
      person(5, 'Zeta Z', 1),
    ];

    it('defaults to name ascending (FI collation, case-insensitive)', async () => {
      setPeople(synthetic);
      await openPeople();
      expect(names()).toEqual(['Person A', 'person b', 'Zeta Z', 'Ärrä Y', 'Örjan X']);
      expect(sortHeader('Nimi')).toHaveAttribute('aria-sort', 'ascending');
      expect(sortHeader('Keikkoja')).toHaveAttribute('aria-sort', 'none');
      expect(sortHeader('Osakas')).toHaveAttribute('aria-sort', 'none');
    });

    it('header clicks sort by gig count and toggle direction; ties by name; kept in the URL', async () => {
      setPeople(synthetic);
      const { user } = await openPeopleWithUrl('/people?role=DJ&active=all');
      // The role filter is applied by the API; the overridden handler returns these rows anyway.
      await user.click(within(sortHeader('Keikkoja')).getByRole('button'));
      await waitFor(() => expect(names()).toEqual(['Person A', 'Zeta Z', 'Örjan X', 'person b', 'Ärrä Y']));
      expect(sortHeader('Keikkoja')).toHaveAttribute('aria-sort', 'ascending');
      expect(sortHeader('Nimi')).toHaveAttribute('aria-sort', 'none');
      expect(url().get('sort')).toBe('gigCount');
      expect(url().get('dir')).toBe('asc');
      expect(url().get('role')).toBe('DJ');
      expect(url().get('active')).toBe('all');

      await user.click(within(sortHeader('Keikkoja')).getByRole('button'));
      await waitFor(() => expect(names()).toEqual(['person b', 'Ärrä Y', 'Örjan X', 'Zeta Z', 'Person A']));
      expect(sortHeader('Keikkoja')).toHaveAttribute('aria-sort', 'descending');
      expect(url().get('dir')).toBe('desc');
    });

    it('sorts by name descending', async () => {
      setPeople(synthetic);
      const { user } = await openPeople();
      await user.click(within(sortHeader('Nimi')).getByRole('button'));
      await waitFor(() => expect(names()).toEqual(['Örjan X', 'Ärrä Y', 'Zeta Z', 'person b', 'Person A']));
      expect(sortHeader('Nimi')).toHaveAttribute('aria-sort', 'descending');
    });

    it('sorts by partnership: partners first, ties by name; descending puts others first', async () => {
      setPeople(synthetic);
      const { user } = await openPeople();
      await user.click(within(sortHeader('Osakas')).getByRole('button'));
      await waitFor(() => expect(names()).toEqual(['Person A', 'person b', 'Zeta Z', 'Ärrä Y', 'Örjan X']));
      expect(sortHeader('Osakas')).toHaveAttribute('aria-sort', 'ascending');
      await user.click(within(sortHeader('Osakas')).getByRole('button'));
      await waitFor(() => expect(names()).toEqual(['Zeta Z', 'Ärrä Y', 'Örjan X', 'Person A', 'person b']));
    });

    it('reads the sort from the URL (survives reload); unknown keys fall back to the default', async () => {
      setPeople(synthetic);
      const first = await openPeople('/people?sort=gigCount&dir=desc');
      expect(names()).toEqual(['person b', 'Ärrä Y', 'Örjan X', 'Zeta Z', 'Person A']);
      expect(sortHeader('Keikkoja')).toHaveAttribute('aria-sort', 'descending');
      first.unmount();
      await openPeople('/people?sort=bogus&dir=desc');
      expect(names()).toEqual(['Person A', 'person b', 'Zeta Z', 'Ärrä Y', 'Örjan X']);
      expect(sortHeader('Nimi')).toHaveAttribute('aria-sort', 'ascending');
    });

    it('phones: a sort select with the three options and a direction select', async () => {
      setPeople(synthetic);
      const { user } = await openPeopleWithUrl();
      const key = screen.getByRole('combobox', { name: 'Järjestys' });
      const dir = screen.getByRole('combobox', { name: 'Suunta' });
      expect(within(key).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nimi', 'Keikkoja', 'Osakas']);
      expect(key).toHaveDisplayValue('Nimi');
      expect(dir).toHaveDisplayValue('Nouseva');

      await user.selectOptions(key, 'Keikkoja');
      await user.selectOptions(dir, 'Laskeva');
      await waitFor(() => expect(names()).toEqual(['person b', 'Ärrä Y', 'Örjan X', 'Zeta Z', 'Person A']));
      expect(url().get('sort')).toBe('gigCount');
      expect(url().get('dir')).toBe('desc');
    });

    it('from 600 px the headers sort and there is no sort select', async () => {
      installMatchMedia({ [TABLET_QUERY]: true });
      setPeople(synthetic);
      await openPeople();
      expect(screen.queryByRole('combobox', { name: 'Järjestys' })).not.toBeInTheDocument();
      expect(within(sortHeader('Nimi')).getByRole('button')).toBeInTheDocument();
    });
  });

  it('shows English texts', async () => {
    db.partners[0]!.language = 'en';
    setLanguage('en');
    const { user } = renderApp('/people');
    await screen.findByRole('table', { name: 'People' });
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByLabelText('Name'), 'Person 1');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('A person with the same name already exists.')).toBeInTheDocument();
    expect(screen.getByText('Person added: Person 1.')).toBeInTheDocument();
  });
});
