import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { freelancerToken } from '../../mocks/freelancerStore';
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
});
