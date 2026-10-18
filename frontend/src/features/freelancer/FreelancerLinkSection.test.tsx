import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { freelancerToken } from '../../mocks/freelancerStore';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { person } from '../../test/gigFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

describe('person page → Freelancer-linkki (UC-034 A4)', () => {
  beforeEach(() => {
    signInMock();
  });

  it('shows the full link and copies it', async () => {
    const p = person('Person 5');
    const token = freelancerToken(db.freelancer, p.id);
    const { user } = renderApp(`/people/${p.id}`);
    const section = await screen.findByRole('region', { name: 'Freelancer-linkki' });
    const field = await within(section).findByRole('textbox', { name: 'Freelancer-linkki' });
    expect(field).toHaveValue(`${window.location.origin}/f/${token}`);

    await user.click(within(section).getByRole('button', { name: 'Kopioi linkki' }));
    expect(await within(section).findByText('Linkki kopioitu leikepöydälle.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/f/${token}`);
  });

  it('regenerates after confirmation; the old link stops working', async () => {
    const p = person('Person 5');
    const oldToken = freelancerToken(db.freelancer, p.id);
    const { user } = renderApp(`/people/${p.id}`);
    const section = await screen.findByRole('region', { name: 'Freelancer-linkki' });
    await within(section).findByRole('textbox', { name: 'Freelancer-linkki' });

    await user.click(within(section).getByRole('button', { name: 'Luo uusi linkki' }));
    const dialog = screen.getByRole('dialog', { name: 'Luo uusi linkki' });
    expect(dialog).toHaveTextContent('Nykyinen linkki lakkaa toimimasta heti.');
    // Cancel keeps the link.
    await user.click(within(dialog).getByRole('button', { name: 'Peruuta' }));
    expect(db.freelancer.tokens[p.id]).toBe(oldToken);

    await user.click(within(section).getByRole('button', { name: 'Luo uusi linkki' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Luo uusi linkki' }));
    expect(await within(section).findByText('Uusi linkki luotu. Vanha linkki ei enää toimi.')).toBeInTheDocument();
    const newToken = db.freelancer.tokens[p.id]!;
    expect(newToken).not.toBe(oldToken);
    expect(within(section).getByRole('textbox', { name: 'Freelancer-linkki' })).toHaveValue(
      `${window.location.origin}/f/${newToken}`,
    );
    expect((await fetch(`/api/public/freelancers/${oldToken}`)).status).toBe(404);
  });

  it('EN labels', async () => {
    db.partners[0]!.language = 'en';
    const p = person('Person 5');
    renderApp(`/people/${p.id}`);
    const section = await screen.findByRole('region', { name: 'Freelancer link' });
    expect(await within(section).findByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Regenerate link' })).toBeInTheDocument();
  });

  describe('BR-113: active partners have no freelancer link', () => {
    const linkRequests: string[] = [];
    beforeEach(() => {
      linkRequests.length = 0;
      server.events.on('request:start', ({ request }) => {
        const path = new URL(request.url).pathname;
        if (path.includes('/freelancer-link')) linkRequests.push(path);
      });
    });
    afterEach(() => {
      server.events.removeAllListeners();
    });

    it('no section and no link request for an active partner', async () => {
      const b = db.partners.find((p) => p.name === 'Partner B')!;
      renderApp(`/people/${b.personId}`);
      await screen.findByRole('switch', { name: 'Osakas' });
      expect(screen.getByRole('switch', { name: 'Osakas' })).toBeChecked();
      expect(screen.queryByRole('region', { name: 'Freelancer-linkki' })).not.toBeInTheDocument();
      expect(screen.queryByText('Freelancer-linkki')).not.toBeInTheDocument();
      expect(linkRequests).toEqual([]);
    });

    it('granting partner status hides the section at once; removing shows it again', async () => {
      const p = person('Person 5');
      const token = freelancerToken(db.freelancer, p.id);
      const { user } = renderApp(`/people/${p.id}`);
      expect(await screen.findByRole('region', { name: 'Freelancer-linkki' })).toBeInTheDocument();

      await user.click(screen.getByRole('switch', { name: 'Osakas' }));
      const dialog = await screen.findByRole('dialog', { name: 'Tee osakkaaksi: Person 5' });
      await user.type(within(dialog).getByRole('textbox', { name: 'Google-sähköposti' }), 'person.5@example.com');
      await user.click(within(dialog).getByRole('button', { name: 'Tee osakkaaksi' }));
      await waitFor(() => expect(screen.getByRole('switch', { name: 'Osakas' })).toBeChecked());
      expect(screen.queryByRole('region', { name: 'Freelancer-linkki' })).not.toBeInTheDocument();
      expect((await fetch(`/api/public/freelancers/${token}`)).status).toBe(404);

      await user.click(screen.getByRole('switch', { name: 'Osakas' }));
      const remove = await screen.findByRole('dialog', { name: 'Poista osakkuus: Person 5' });
      await user.click(within(remove).getByRole('button', { name: 'Poista osakkuus' }));
      await waitFor(() => expect(screen.getByRole('switch', { name: 'Osakas' })).not.toBeChecked());
      const section = await screen.findByRole('region', { name: 'Freelancer-linkki' });
      expect(await within(section).findByRole('textbox', { name: 'Freelancer-linkki' })).toHaveValue(
        `${window.location.origin}/f/${token}`,
      );
      expect((await fetch(`/api/public/freelancers/${token}`)).status).toBe(200);
    });

    it.each([
      ['fi', 'Osakkailla ei ole freelancer-linkkiä.', 'Freelancer-linkki'],
      ['en', 'Partners have no freelancer link.', 'Freelancer link'],
    ] as const)('409 PERSON_IS_PARTNER shows a calm note, no error or retry (%s)', async (lang, text, title) => {
      db.partners[0]!.language = lang;
      server.use(
        http.get('/api/people/:id/freelancer-link', () =>
          errorResponse(409, 'PERSON_IS_PARTNER', 'Partners have no freelancer link'),
        ),
      );
      const p = person('Person 5');
      renderApp(`/people/${p.id}`);
      const section = await screen.findByRole('region', { name: title });
      expect(await within(section).findByText(text)).toBeInTheDocument();
      expect(within(section).queryByRole('alert')).not.toBeInTheDocument();
      expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
