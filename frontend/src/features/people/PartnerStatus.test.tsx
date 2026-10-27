import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { referenceKey } from '../../reference/useReference';
import type { ReferenceData } from '../../api/types';
import { person } from '../../test/eventFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const partnerB = () => db.partners.find((p) => p.name === 'Partner B')!;
const partnerSwitch = () => screen.getByRole('switch', { name: 'Osakas' });

async function openPerson(personId: string) {
  const app = renderApp(`/people/${personId}`);
  await screen.findByRole('switch', { name: 'Osakas' });
  return app;
}

function recordPartnerRequests() {
  const requests: { method: string; body: unknown }[] = [];
  server.events.on('request:start', async ({ request }) => {
    if (new URL(request.url).pathname.endsWith('/partner')) {
      const body = request.method === 'PUT' ? await request.clone().json() : null;
      requests.push({ method: request.method, body });
    }
  });
  return requests;
}

describe('partner status on the person page (UC-032)', () => {
  beforeEach(() => {
    signInMock();
  });
  afterEach(() => {
    server.events.removeAllListeners();
    vi.unstubAllEnvs();
  });

  it('makes a person a partner after asking for the email; tag, email and reference refresh', async () => {
    const requests = recordPartnerRequests();
    const target = person('Person 1');
    const { user, queryClient } = await openPerson(target.id);
    expect(partnerSwitch()).not.toBeChecked();
    expect(screen.queryByText('Osakas', { selector: '.tag' })).not.toBeInTheDocument();

    await user.click(partnerSwitch());
    const dialog = await screen.findByRole('dialog', { name: 'Tee osakkaaksi: Person 1' });
    expect(partnerSwitch()).not.toBeChecked();
    expect(requests).toHaveLength(0);

    const email = within(dialog).getByRole('textbox', { name: 'Google-sähköposti' });
    expect(email).toHaveAccessibleDescription('Osakas kirjautuu tällä yrityksen Google-tilillä.');
    await user.type(email, 'person.1@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Tee osakkaaksi' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests).toEqual([{ method: 'PUT', body: { email: 'person.1@example.com' } }]);
    expect(await screen.findByText('Person 1 on nyt osakas.')).toBeInTheDocument();
    await waitFor(() => expect(partnerSwitch()).toBeChecked());
    const head = screen.getByRole('heading', { level: 1, name: 'Person 1' }).closest('.page-head')!;
    expect(within(head as HTMLElement).getByText('Osakas')).toHaveClass('tag');
    expect(screen.getByRole('textbox', { name: 'Google-sähköposti' })).toHaveValue('person.1@example.com');

    const created = db.partners.find((p) => p.personId === target.id);
    expect(created).toMatchObject({ email: 'person.1@example.com', active: true });
    await waitFor(() =>
      expect(queryClient.getQueryData<ReferenceData>(referenceKey)?.partners.map((p) => p.name)).toContain(
        'Person 1',
      ),
    );
  });

  it('shows REQUIRED, INVALID_VALUE and DUPLICATE email errors in the form', async () => {
    const { user } = await openPerson(person('Person 2').id);
    await user.click(partnerSwitch());
    const dialog = await screen.findByRole('dialog', { name: 'Tee osakkaaksi: Person 2' });
    const email = within(dialog).getByRole('textbox', { name: 'Google-sähköposti' });
    const submit = within(dialog).getByRole('button', { name: 'Tee osakkaaksi' });

    await user.click(submit);
    expect(within(dialog).getByText('Anna Google-sähköposti.')).toBeInTheDocument();

    // No domain configured: the server decides the domain (INVALID_VALUE) and the text is generic.
    await user.type(email, 'person.2@other.test');
    await user.click(submit);
    expect(await within(dialog).findByText('Käytä yrityksen Google-sähköpostia.')).toBeInTheDocument();

    await user.clear(email);
    await user.type(email, 'PARTNER.B@example.com');
    await user.click(submit);
    expect(await within(dialog).findByText('Osoite on jo toisella osakkaalla.')).toBeInTheDocument();
    expect(db.partners.some((p) => p.personId === person('Person 2').id)).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Peruuta' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(partnerSwitch()).not.toBeChecked();
  });

  it('shows the configured domain in the hint and checks it before sending', async () => {
    vi.stubEnv('VITE_AUTH_ALLOWED_DOMAIN', 'example.com');
    const requests = recordPartnerRequests();
    const { user } = await openPerson(person('Person 3').id);
    await user.click(partnerSwitch());
    const dialog = await screen.findByRole('dialog', { name: 'Tee osakkaaksi: Person 3' });
    const email = within(dialog).getByRole('textbox', { name: 'Google-sähköposti' });
    expect(email).toHaveAccessibleDescription('Osakas kirjautuu tällä Google-tilillä (@example.com).');
    await user.type(email, 'person.3@other.test');
    await user.click(within(dialog).getByRole('button', { name: 'Tee osakkaaksi' }));
    expect(within(dialog).getByText('Käytä yrityksen Google-sähköpostia (@example.com).')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('removes partner status after the "sign-in stops immediately" confirmation', async () => {
    const requests = recordPartnerRequests();
    const b = partnerB();
    const { user } = await openPerson(b.personId);
    expect(partnerSwitch()).toBeChecked();
    expect(partnerSwitch()).toBeEnabled();

    await user.click(partnerSwitch());
    const dialog = await screen.findByRole('dialog', { name: 'Poista osakkuus: Partner B' });
    expect(within(dialog).getByText('Kirjautuminen estyy heti.')).toBeInTheDocument();
    expect(partnerSwitch()).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Poista osakkuus' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests).toEqual([{ method: 'DELETE', body: null }]);
    expect(await screen.findByText('Partner B ei ole enää osakas.')).toBeInTheDocument();
    await waitFor(() => expect(partnerSwitch()).not.toBeChecked());
    expect(screen.queryByRole('textbox', { name: 'Google-sähköposti' })).not.toBeInTheDocument();
    expect(b.active).toBe(false);
  });

  it('cancelling the confirmation changes nothing', async () => {
    const requests = recordPartnerRequests();
    const { user } = await openPerson(partnerB().personId);
    await user.click(partnerSwitch());
    const dialog = await screen.findByRole('dialog', { name: 'Poista osakkuus: Partner B' });
    await user.click(within(dialog).getByRole('button', { name: 'Peruuta' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(partnerSwitch()).toBeChecked();
    expect(requests).toHaveLength(0);
  });

  it.each([
    ['LAST_PARTNER', 'Viimeistä osakasta ei voi poistaa.'],
    ['CANNOT_REMOVE_SELF', 'Et voi poistaa omaa osakkuuttasi.'],
  ] as const)('shows the 409 %s message and keeps the status', async (code, text) => {
    server.use(http.delete('/api/people/:id/partner', () => errorResponse(409, code, 'x')));
    const { user } = await openPerson(partnerB().personId);
    await user.click(partnerSwitch());
    const dialog = await screen.findByRole('dialog', { name: 'Poista osakkuus: Partner B' });
    await user.click(within(dialog).getByRole('button', { name: 'Poista osakkuus' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
    expect(partnerB().active).toBe(true);
  });

  it("disables the signed-in partner's own switch with a note", async () => {
    const me = signInMock();
    await openPerson(me.personId);
    expect(partnerSwitch()).toBeChecked();
    expect(partnerSwitch()).toBeDisabled();
    expect(partnerSwitch()).toHaveAccessibleDescription('Et voi poistaa omaa osakkuuttasi.');
    // The own email stays editable.
    expect(screen.getByRole('textbox', { name: 'Google-sähköposti' })).toBeEnabled();
  });

  it("edits an active partner's email in place (PUT) with translated errors", async () => {
    const requests = recordPartnerRequests();
    const { user } = await openPerson(partnerB().personId);
    const email = screen.getByRole('textbox', { name: 'Google-sähköposti' });
    expect(email).toHaveValue('partner.b@example.com');

    await user.clear(email);
    await user.type(email, 'partner.c@example.com{Enter}');
    expect(await screen.findByText('Osoite on jo toisella osakkaalla.')).toBeInTheDocument();
    expect(partnerB().email).toBe('partner.b@example.com');

    await user.clear(email);
    await user.type(email, 'not-an-email{Enter}');
    expect(await screen.findByText('Käytä yrityksen Google-sähköpostia.')).toBeInTheDocument();

    await user.clear(email);
    await user.type(email, 'partner.b2@example.com{Enter}');
    await waitFor(() => expect(partnerB().email).toBe('partner.b2@example.com'));
    expect(requests.at(-1)).toEqual({ method: 'PUT', body: { email: 'partner.b2@example.com' } });
  });

  it('works in English', async () => {
    signInMock('partner.b@example.com'); // language: en
    const c = db.partners.find((p) => p.name === 'Partner C')!;
    const { user } = renderApp(`/people/${c.personId}`);
    await user.click(await screen.findByRole('switch', { name: 'Partner' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove partner status: Partner C' });
    expect(within(dialog).getByText('Sign-in stops immediately.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove partner status' }));
    expect(await screen.findByText('Partner C is no longer a partner.')).toBeInTheDocument();
  });
});
