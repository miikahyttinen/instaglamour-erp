import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '../../lib/format';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { seedFreelancerFees } from '../../test/freelancerFixtures';
import { renderApp, signInMock } from '../../test/renderApp';
import { FREELANCER_LANG_KEY } from './freelancerLanguage';

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');
const fi = (cents: number) => norm(formatMoney(cents, 'fi'));

let requests: string[] = [];
const record = ({ request }: { request: Request }) => {
  requests.push(`${request.method} ${new URL(request.url).pathname}`);
};

beforeEach(() => {
  requests = [];
  server.events.on('request:start', record);
});
afterEach(() => {
  server.events.removeListener('request:start', record);
  vi.restoreAllMocks();
});

const feesTable = () => screen.getByRole('table', { name: 'Palkkiot' });
const createButton = () => screen.getByRole('button', { name: 'Luo ostotilausnumero' });
const checkbox = (venue: string, role = 'Laulu') =>
  screen.getByRole('checkbox', { name: new RegExp(`${venue}, ${role}$`) });

describe('FreelancerPage /f/:token (UC-033)', () => {
  let fx: ReturnType<typeof seedFreelancerFees>;
  beforeEach(() => {
    fx = seedFreelancerFees();
  });

  it('shows name and fees signed out, without the shell, calling only the public endpoint', async () => {
    renderApp(`/f/${fx.token}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Person 5' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Instaglamour' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /kieli/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    expect(document.title).toBe('Person 5 – Instaglamour');

    const rows = within(feesTable()).getAllByRole('row').filter((r) => r.closest('tbody'));
    expect(rows).toHaveLength(5); // cancelled, deleted and zero-amount lines are not shown
    const texts = rows.map((r) => norm(r.textContent));
    expect(texts[0]).toContain('Venue Z');
    expect(texts[0]).toContain('Keikka ei ole vielä soitettu');
    expect(texts.some((t) => t.includes('Role Q') && t.includes(fi(5000)))).toBe(true);
    expect(texts[4]).toContain('Venue W');
    expect(texts[4]).toContain('Maksettu');
    expect(texts[4]).toContain(fi(12000));
    expect(texts.join(' ')).not.toMatch(/Venue [CDE]\b/);
    // Only the three selectable fees have a checkbox (+ select all).
    expect(within(feesTable()).getAllByRole('checkbox')).toHaveLength(4);
    expect(requests).toEqual([`GET /api/public/freelancers/${fx.token}`]);
  });

  it('makes no authenticated calls even with a session in the same browser', async () => {
    signInMock();
    renderApp(`/f/${fx.token}`);
    await screen.findByRole('heading', { level: 1, name: 'Person 5' });
    expect(requests.every((r) => r.startsWith('GET /api/public/freelancers/'))).toBe(true);
  });

  it('counts the selection and its total; the button is disabled with none selected', async () => {
    const { user } = renderApp(`/f/${fx.token}`);
    await screen.findByRole('heading', { level: 1, name: 'Person 5' });
    expect(createButton()).toBeDisabled();
    expect(screen.getByText('Valittu: 0')).toBeInTheDocument();

    await user.click(checkbox('Venue X'));
    await user.click(checkbox('Venue Y', 'Role Q'));
    expect(screen.getByText('Valittu: 2')).toBeInTheDocument();
    expect(norm(screen.getByText(/^Yhteensä/).textContent)).toBe(`Yhteensä ${fi(15000)}`);
    expect(createButton()).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'Valitse kaikki' }));
    expect(screen.getByText('Valittu: 3')).toBeInTheDocument();
    expect(norm(screen.getByText(/^Yhteensä/).textContent)).toBe(`Yhteensä ${fi(25000)}`);
    await user.click(screen.getByRole('checkbox', { name: 'Valitse kaikki' }));
    expect(screen.getByText('Valittu: 0')).toBeInTheDocument();
  });

  it('creates a PO: highlighted at the top with a copy button; fees show "Ostotilaus <number>"', async () => {
    const { user } = renderApp(`/f/${fx.token}`);
    await screen.findByRole('heading', { level: 1, name: 'Person 5' });
    await user.click(checkbox('Venue X'));
    await user.click(checkbox('Venue Y'));
    await user.dblClick(createButton());

    const status = await screen.findByText(/Ostotilausnumero PERSON-5-\d{4} luotu/);
    const number = /PERSON-5-\d{4}/.exec(status.textContent!)![0];
    // Double click → one PO.
    expect(requests.filter((r) => r.startsWith('POST'))).toHaveLength(1);
    expect(db.freelancer.purchaseOrders.filter((po) => po.personId === fx.person.id)).toHaveLength(1);

    const orders = screen.getByRole('region', { name: 'Ostotilaukset' });
    const first = within(orders).getAllByRole('listitem')[0]!;
    expect(first).toHaveClass('is-new');
    expect(within(first).getByRole('heading', { name: number })).toBeInTheDocument();
    expect(within(first).getByText('Avoin')).toBeInTheDocument();
    expect(norm(first.textContent)).toContain(fi(20000));

    await waitFor(() => expect(within(feesTable()).getAllByText(`Ostotilaus ${number}`)).toHaveLength(2));
    expect(screen.getByText('Valittu: 0')).toBeInTheDocument();
    // Refetched after create.
    expect(requests.filter((r) => r === `GET /api/public/freelancers/${fx.token}`).length).toBeGreaterThanOrEqual(2);

    await user.click(within(first).getByRole('button', { name: `Kopioi numero ${number}` }));
    expect(await navigator.clipboard.readText()).toBe(number);
    expect(within(first).getByRole('button', { name: `Kopioi numero ${number}` })).toHaveTextContent('Kopioitu');
  });

  it('409 COST_LINE_NOT_ELIGIBLE: message, refetch, keeps the still-valid selection', async () => {
    const { user } = renderApp(`/f/${fx.token}`);
    await screen.findByRole('heading', { level: 1, name: 'Person 5' });
    await user.click(checkbox('Venue X'));
    await user.click(checkbox('Venue Y'));
    // Meanwhile a partner pays the Venue X fee.
    fx.lines.played1.paidAt = new Date().toISOString();
    fx.lines.played1.actualCents = fx.lines.played1.budgetedCents;

    await user.click(createButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Osa valituista palkkioista ei ole enää valittavissa');
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Venue X, Laulu$/ })).not.toBeInTheDocument());
    expect(checkbox('Venue Y')).toBeChecked();
    expect(screen.getByText('Valittu: 1')).toBeInTheDocument();
    expect(db.freelancer.purchaseOrders.filter((po) => po.personId === fx.person.id)).toHaveLength(0);
  });

  it('429: friendly retry message', async () => {
    server.use(
      http.post('/api/public/freelancers/:token/purchase-orders', () =>
        HttpResponse.json({ error: { code: 'RATE_LIMITED', message: 'slow down' } }, { status: 429 }),
      ),
    );
    const { user } = renderApp(`/f/${fx.token}`);
    await screen.findByRole('heading', { level: 1, name: 'Person 5' });
    await user.click(checkbox('Venue X'));
    await user.click(createButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Liian monta pyyntöä. Odota hetki ja yritä uudelleen.');
    expect(checkbox('Venue X')).toBeChecked();
  });

  it('button shows progress and stays disabled while creating', async () => {
    server.use(
      http.post('/api/public/freelancers/:token/purchase-orders', async () => {
        await delay(50);
        return HttpResponse.json({ error: { code: 'NETWORK_ERROR', message: 'x' } }, { status: 500 });
      }),
    );
    const { user } = renderApp(`/f/${fx.token}`);
    await screen.findByRole('heading', { level: 1, name: 'Person 5' });
    await user.click(checkbox('Venue X'));
    await user.click(createButton());
    expect(screen.getByRole('button', { name: 'Luodaan…' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Ostotilausnumeron luonti epäonnistui');
  });

  it('unknown or regenerated link → "Linkkiä ei löydy"', async () => {
    renderApp('/f/not-a-real-token');
    expect(await screen.findByRole('heading', { level: 1, name: 'Linkkiä ei löydy' })).toBeInTheDocument();
    expect(document.title).toBe('Linkkiä ei löydy – Instaglamour');
  });

  it('A1: nothing selectable → message and disabled button', async () => {
    for (const line of [fx.lines.played1, fx.lines.played2, fx.lines.other]) line.paidAt = new Date().toISOString();
    renderApp(`/f/${fx.token}`);
    await screen.findByRole('heading', { level: 1, name: 'Person 5' });
    expect(screen.getByText('Ei maksamattomia palkkioita soitetuilta keikoilta.')).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });

  it('lists POs with status labels: open, paid with date and time, cancelled', async () => {
    const paidAt = new Date(2026, 9, 16, 14, 32).toISOString();
    const lines = [{ gigStartDate: '2020-03-01', venue: 'Venue X', type: 'VOC' as const, description: null, amountCents: 10000 }];
    server.use(
      http.get('/api/public/freelancers/:token', () =>
        HttpResponse.json({
          name: 'Person 5',
          lines: [],
          purchaseOrders: [
            { number: 'PERSON-5-0003', status: 'OPEN', totalCents: 10000, createdAt: paidAt, paidAt: null, lines },
            { number: 'PERSON-5-0002', status: 'PAID', totalCents: 10000, createdAt: paidAt, paidAt, lines },
            { number: 'PERSON-5-0001', status: 'CANCELLED', totalCents: 10000, createdAt: paidAt, paidAt: null, lines },
          ],
        }),
      ),
    );
    renderApp(`/f/${fx.token}`);
    await screen.findByRole('heading', { level: 1, name: 'Person 5' });
    expect(screen.getByText('Ei palkkioita.')).toBeInTheDocument();
    const items = within(screen.getByRole('region', { name: 'Ostotilaukset' })).getAllByRole('listitem');
    expect(within(items[0]!).getByText('Avoin')).toHaveClass('tag-info');
    expect(within(items[1]!).getByText('Maksettu 16.10.2026 klo 14.32')).toHaveClass('tag-ok');
    expect(within(items[2]!).getByText('Peruttu')).toHaveClass('tag-muted');
    expect(within(items[0]!).getByRole('table', { name: 'Ostotilauksen PERSON-5-0003 palkkiot' })).toHaveTextContent('Venue X');
  });

  it('EN: switch remembered on this device; default FI', async () => {
    const first = renderApp(`/f/${fx.token}`);
    await screen.findByRole('heading', { level: 1, name: 'Person 5' });
    await first.user.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('button', { name: 'Create purchase order number' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Fees' })).toBeInTheDocument();
    expect(screen.getByText('Not played yet')).toBeInTheDocument();
    expect(window.localStorage.getItem(FREELANCER_LANG_KEY)).toBe('en');
    first.unmount();

    renderApp(`/f/${fx.token}`);
    expect(await screen.findByRole('heading', { level: 2, name: 'Purchase orders' })).toBeInTheDocument();
  });

  it('works when localStorage is blocked (Finnish)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { user } = renderApp(`/f/${fx.token}`);
    await screen.findByRole('heading', { level: 2, name: 'Ostotilaukset' });
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Purchase orders' })).toBeInTheDocument();
  });
});
