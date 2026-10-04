import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { renderApp, signInMock } from '../../test/renderApp';

const list = () => screen.getByRole('table', { name: 'Henkilöt' });
/** Body rows of the people table (one per person). */
const rows = () =>
  within(list())
    .queryAllByRole('row')
    .filter((r) => r.closest('tbody'));
const names = () => rows().map((tr) => within(tr).getByRole('link').textContent);
const row = (name: string) =>
  rows().find((tr) => within(tr).getByRole('link').textContent === name)!;

async function openPeople(path = '/people') {
  const app = renderApp(path);
  await screen.findByRole('heading', { name: 'Henkilöt', level: 1 });
  await screen.findByRole('table', { name: 'Henkilöt' });
  return app;
}

describe('people register (UC-014)', () => {
  beforeEach(() => {
    signInMock();
  });

  it('lists active people by default and filters inactive / all', async () => {
    const { user } = await openPeople();
    expect(names()).toContain('Person 1');
    expect(names()).not.toContain('Person 9');

    await user.click(screen.getByRole('button', { name: 'Ei käytössä' }));
    await waitFor(() => expect(names()).toEqual(['Person 9']));
    expect(row('Person 9')).toHaveTextContent('Ei käytössä');

    await user.click(screen.getByRole('button', { name: 'Kaikki' }));
    await waitFor(() => expect(names()).toContain('Person 1'));
    expect(names()).toContain('Person 9');
    expect(screen.getByRole('button', { name: 'Kaikki' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('person name links to the person page', async () => {
    const { user } = await openPeople();
    await user.click(within(row('Person 2')).getByRole('link', { name: 'Person 2' }));
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

  it('renames a person; a duplicate name warns but saves', async () => {
    const { user } = await openPeople();
    await user.click(within(row('Person 2')).getByRole('button', { name: 'Muuta nimeä: Person 2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Muuta nimeä: Person 2' });
    const input = within(dialog).getByLabelText('Uusi nimi');
    expect(input).toHaveValue('Person 2');
    await user.clear(input);
    await user.type(input, 'Person 20');
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Tallennettu.')).toBeInTheDocument();
    await waitFor(() => expect(names()).toContain('Person 20'));
    expect(names()).not.toContain('Person 2');

    await user.click(within(row('Person 20')).getByRole('button', { name: 'Muuta nimeä: Person 20' }));
    const again = await screen.findByRole('dialog');
    await user.clear(within(again).getByLabelText('Uusi nimi'));
    await user.type(within(again).getByLabelText('Uusi nimi'), 'Person 3');
    await user.click(within(again).getByRole('button', { name: 'Tallenna' }));
    expect(await screen.findByText('Samanniminen henkilö on jo olemassa.')).toBeInTheDocument();
    await waitFor(() => expect(names().filter((n) => n === 'Person 3')).toHaveLength(2));
  });

  it('rename with an empty name shows "required" and keeps the dialog open', async () => {
    const { user } = await openPeople();
    await user.click(within(row('Person 2')).getByRole('button', { name: 'Muuta nimeä: Person 2' }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Uusi nimi'));
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));
    expect(await within(dialog).findByText('Pakollinen tieto.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Peruuta' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(names()).toContain('Person 2');
  });

  it('deactivates and activates a person', async () => {
    const { user } = await openPeople();
    await user.click(within(row('Person 2')).getByRole('button', { name: 'Poista käytöstä: Person 2' }));
    expect(await screen.findByText('Person 2 poistettu käytöstä.')).toBeInTheDocument();
    await waitFor(() => expect(names()).not.toContain('Person 2'));
    expect(db.gigs.people.find((p) => p.name === 'Person 2')!.active).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Ei käytössä' }));
    await waitFor(() => expect(names()).toContain('Person 2'));
    await user.click(within(row('Person 2')).getByRole('button', { name: 'Ota käyttöön: Person 2' }));
    expect(await screen.findByText('Person 2 otettu käyttöön.')).toBeInTheDocument();
    await waitFor(() => expect(names()).not.toContain('Person 2'));
    expect(db.gigs.people.find((p) => p.name === 'Person 2')!.active).toBe(true);
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
