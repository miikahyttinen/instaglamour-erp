import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { DESKTOP_QUERY } from '../../lib/useMediaQuery';
import { REFERENCE_IDS } from '../../mocks/referencesStore';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { testFile } from '../../test/files';
import { installMatchMedia } from '../../test/matchMedia';
import { renderApp, signInMock } from '../../test/renderApp';

const list = () => screen.getByRole('list', { name: 'Referenssit' });
const item = (n: number) => screen.getByRole('region', { name: `Referenssi ${n}` });
const authors = () => db.references.references.map((r) => r.author);

async function openPage() {
  const result = renderApp('/offers/references');
  await screen.findByRole('list', { name: 'Referenssit' });
  return result;
}

describe('references page (UC-029 "References", BR-108)', () => {
  beforeEach(() => {
    signInMock();
  });

  it('is reached from the Offers page head, without a new menu item', async () => {
    installMatchMedia({ [DESKTOP_QUERY]: true });
    const { user } = renderApp('/offers');
    const nav = await screen.findByRole('navigation', { name: 'Päävalikko' });
    const menuCount = within(nav).getAllByRole('link').length;
    await user.click(await screen.findByRole('link', { name: 'Referenssit' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Referenssit' })).toBeInTheDocument();
    expect(within(nav).getAllByRole('link')).toHaveLength(menuCount);
    expect(within(nav).getByRole('link', { name: 'Tarjoukset' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Tarjoukset', current: false })).toHaveAttribute('href', '/offers');
  });

  it('lists every reference in order with placeholder, quotes, author and active switch', async () => {
    await openPage();
    expect(within(list()).getAllByRole('listitem')).toHaveLength(4);
    const first = item(1);
    expect(within(first).getByRole('textbox', { name: 'Lainaus (suomi)' })).toHaveValue(
      'Esimerkkilainaus A: tanssilattia oli täynnä koko illan.\nSuosittelemme lämpimästi.',
    );
    expect(within(first).getByRole('textbox', { name: 'Lainaus (englanti)' })).toHaveValue(
      'Sample quote A: the dance floor was full all night.\nWarmly recommended.',
    );
    expect(within(first).getByRole('textbox', { name: 'Kirjoittaja' })).toHaveValue('Person 5, Client A');
    expect(within(first).getByRole('switch', { name: 'Aktiivinen' })).toBeChecked();
    expect(within(first).getByTestId('reference-placeholder')).toHaveTextContent('P5');
    expect(within(first).getByLabelText('Lisää kuva')).toHaveAttribute('type', 'file');
    expect(within(item(4)).getByText('Ei käytössä')).toBeInTheDocument();
    expect(within(item(4)).getByRole('switch', { name: 'Aktiivinen' })).not.toBeChecked();
  });

  it('edits every field in place', async () => {
    const { user } = await openPage();
    const second = item(2);
    const quoteFi = within(second).getByRole('textbox', { name: 'Lainaus (suomi)' });
    await user.clear(quoteFi);
    await user.type(quoteFi, 'Uusi lainaus');
    await user.tab();
    await waitFor(() => expect(db.references.references[1]!.quoteFi).toBe('Uusi lainaus'));

    const quoteEn = within(second).getByRole('textbox', { name: 'Lainaus (englanti)' });
    await user.type(quoteEn, 'New quote');
    await user.tab();
    await waitFor(() => expect(db.references.references[1]!.quoteEn).toBe('New quote'));

    const author = within(second).getByRole('textbox', { name: 'Kirjoittaja' });
    await user.clear(author);
    await user.tab();
    expect(await within(second).findByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(db.references.references[1]!.author).toBe('Client B');
    await user.type(author, 'Client Q');
    await user.tab();
    await waitFor(() => expect(db.references.references[1]!.author).toBe('Client Q'));

    await user.click(within(second).getByRole('switch', { name: 'Aktiivinen' }));
    await waitFor(() => expect(db.references.references[1]!.active).toBe(false));
    expect(await within(second).findByText('Ei käytössä')).toBeInTheDocument();
  });

  it('uploads, replaces and removes a photo (with confirmation)', async () => {
    const { user } = await openPage();
    const first = item(1);
    await user.upload(within(first).getByLabelText('Lisää kuva'), testFile('photo.jpg', 'image/jpeg'));
    const img = await waitFor(() => {
      const el = first.querySelector('img');
      expect(el).not.toBeNull();
      return el!;
    });
    const srcOf = () =>
      `/api/references/${REFERENCE_IDS.a}/image?v=${encodeURIComponent(db.references.references[0]!.imageVersion!)}`;
    expect(img).toHaveAttribute('src', srcOf());
    expect(img).toHaveAttribute('alt', '');
    expect(within(first).getByLabelText('Vaihda kuva')).toBeInTheDocument();
    expect(db.references.references[0]!.image?.contentType).toBe('image/jpeg');

    // Replace: the URL follows the new imageVersion from the API, so the browser loads the new photo.
    const firstSrc = img.getAttribute('src');
    await user.upload(within(first).getByLabelText('Vaihda kuva'), testFile('photo2.png', 'image/png'));
    await waitFor(() => expect(first.querySelector('img')).toHaveAttribute('src', srcOf()));
    expect(first.querySelector('img')!.getAttribute('src')).not.toBe(firstSrc);
    expect(db.references.references[0]!.image?.contentType).toBe('image/png');

    await user.click(within(first).getByRole('button', { name: 'Poista kuva' }));
    const dialog = screen.getByRole('dialog', { name: 'Poista kuva' });
    expect(dialog).toHaveTextContent('Person 5, Client A');
    await user.click(within(dialog).getByRole('button', { name: 'Poista kuva' }));
    await waitFor(() => expect(db.references.references[0]!.image).toBeNull());
    expect(await within(first).findByTestId('reference-placeholder')).toBeInTheDocument();
    expect(screen.getByText('Kuva poistettu.')).toBeInTheDocument();
  });

  it('refuses wrong types and too large photos with translated messages, also from the server', async () => {
    await openPage();
    // A phone / OS picker may ignore `accept`.
    const user = userEvent.setup({ applyAccept: false });
    const first = item(1);
    const input = within(first).getByLabelText('Lisää kuva');
    await user.upload(input, testFile('notes.pdf', 'application/pdf'));
    expect(within(first).getByRole('alert')).toHaveTextContent('Sallitut kuvatyypit: PNG, JPG ja WebP.');
    await user.upload(input, testFile('big.png', 'image/png', 10 * 1024 * 1024 + 1));
    expect(within(first).getByRole('alert')).toHaveTextContent('Kuva on liian suuri (enintään 10 Mt).');
    expect(db.references.references[0]!.image).toBeNull();

    server.use(
      http.put('/api/references/:id/image', () => errorResponse(413, 'FILE_TOO_LARGE', 'English server text')),
    );
    await user.upload(input, testFile('ok.webp', 'image/webp'));
    expect(await within(first).findByRole('alert')).toHaveTextContent('Kuva on liian suuri (enintään 10 Mt).');
    expect(screen.queryByText('English server text')).not.toBeInTheDocument();
  });

  it('moves references up and down and keeps the focus on the moved one', async () => {
    const { user } = await openPage();
    expect(within(item(1)).getByRole('button', { name: 'Siirrä ylös' })).toBeDisabled();
    expect(within(item(4)).getByRole('button', { name: 'Siirrä alas' })).toBeDisabled();

    await user.click(within(item(1)).getByRole('button', { name: 'Siirrä alas' }));
    await waitFor(() => expect(authors().slice(0, 2)).toEqual(['Client B', 'Person 5, Client A']));
    expect(within(item(2)).getByRole('textbox', { name: 'Kirjoittaja' })).toHaveValue('Person 5, Client A');
    await waitFor(() => expect(within(item(2)).getByRole('button', { name: 'Siirrä alas' })).toHaveFocus());

    await user.click(within(item(3)).getByRole('button', { name: 'Siirrä ylös' }));
    await waitFor(() => expect(authors().slice(0, 3)).toEqual(['Client B', 'Person 6, Client C', 'Person 5, Client A']));
  });

  it('deletes a reference only after confirmation', async () => {
    const { user } = await openPage();
    await user.click(within(item(3)).getByRole('button', { name: 'Poista referenssi' }));
    let dialog = screen.getByRole('dialog', { name: 'Poista referenssi' });
    expect(dialog).toHaveTextContent('Person 6, Client C');
    await user.click(within(dialog).getByRole('button', { name: 'Peruuta' }));
    expect(authors()).toHaveLength(4);

    await user.click(within(item(3)).getByRole('button', { name: 'Poista referenssi' }));
    dialog = screen.getByRole('dialog', { name: 'Poista referenssi' });
    await user.click(within(dialog).getByRole('button', { name: 'Poista referenssi' }));
    await waitFor(() => expect(authors()).not.toContain('Person 6, Client C'));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Referenssi poistettu: Person 6, Client C.')).toBeInTheDocument();
  });

  it('adds a reference last (FI quote and author required)', async () => {
    const { user } = await openPage();
    const form = screen.getByRole('region', { name: 'Uusi referenssi' });
    await user.click(within(form).getByRole('button', { name: 'Lisää referenssi' }));
    expect(within(form).getByLabelText('Lainaus (suomi)')).toHaveAccessibleDescription('Pakollinen tieto.');
    expect(within(form).getByLabelText('Kirjoittaja')).toHaveAccessibleDescription('Pakollinen tieto.');
    expect(authors()).toHaveLength(4);

    await user.type(within(form).getByLabelText('Lainaus (suomi)'), 'Rivi 1{Enter}Rivi 2');
    await user.type(within(form).getByLabelText('Kirjoittaja'), 'Client N');
    await user.click(within(form).getByRole('button', { name: 'Lisää referenssi' }));

    expect(await screen.findByRole('region', { name: 'Referenssi 5' })).toBeInTheDocument();
    expect(db.references.references[4]).toMatchObject({
      quoteFi: 'Rivi 1\nRivi 2',
      quoteEn: null,
      author: 'Client N',
      active: true,
    });
    expect(within(form).getByLabelText('Kirjoittaja')).toHaveValue('');
  });

  it('works in English', async () => {
    db.partners[0]!.language = 'en';
    renderApp('/offers/references');
    expect(await screen.findByRole('heading', { level: 1, name: 'References' })).toBeInTheDocument();
    const first = await screen.findByRole('region', { name: 'Reference 1' });
    expect(within(first).getByRole('textbox', { name: 'Quote (Finnish)' })).toBeInTheDocument();
    expect(within(first).getByRole('group', { name: 'Reference actions: Reference 1' })).toBeInTheDocument();
    expect(within(first).getByLabelText('Add photo')).toBeInTheDocument();
  });
});
