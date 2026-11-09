import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Parameter, ReferenceData } from '../../api/types';
import i18n, { setLanguage } from '../../i18n';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { referenceKey } from '../../reference/useReference';
import { renderApp, signInMock } from '../../test/renderApp';
import { parameterTexts, validateMoneyParameter } from './parameters';

// Synthetic values only (BR-090).
const FIELD_FI = 'Soundcheck-vähennys';

/** PATCH bodies sent to /api/settings/parameters/:key. */
function recordPatches(): { url: string; body: unknown }[] {
  const patches: { url: string; body: unknown }[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PATCH' && request.url.includes('/api/settings/parameters/')) {
      void request
        .clone()
        .json()
        .then((body) => patches.push({ url: new URL(request.url).pathname, body }));
    }
  });
  return patches;
}

async function openParameters() {
  const rendered = renderApp('/settings/parameters');
  const field = await screen.findByRole('textbox', { name: FIELD_FI });
  return { ...rendered, field };
}

describe('settings: parameters tab', () => {
  beforeEach(() => {
    signInMock();
    db.reference.settings.loadInDeductionCents = 1000;
  });

  it('is the middle tab: Kokoonpanot, Parametrit, Tietojen tuonti (import last)', async () => {
    renderApp('/settings/parameters');
    const tabs = await screen.findByRole('navigation', { name: 'Asetusten osiot' });
    expect(within(tabs).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Kokoonpanot',
      'Parametrit',
      'Tietojen tuonti',
    ]);
    expect(within(tabs).getByRole('link', { name: 'Parametrit' })).toHaveAttribute('href', '/settings/parameters');
    await waitFor(() =>
      expect(within(tabs).getByRole('link', { name: 'Parametrit' })).toHaveAttribute('aria-current', 'page'),
    );
  });

  it('lists the parameter with label, help text and value; no "changed" line before a change', async () => {
    const { field } = await openParameters();
    expect(field).toHaveValue('10,00');
    expect(field).toHaveAccessibleDescription(
      'Vähennetään muusikon palkkiosta, kun Roudaus ja soundcheck on pois päältä, ja freelancerin ostotilauksella. Ei muuta jo tehtyjä rivejä.',
    );
    expect(screen.getByRole('list', { name: 'Parametrit' })).toBeInTheDocument();
    expect(screen.queryByText(/Muutettu/)).not.toBeInTheDocument();
  });

  it('English labels and help', async () => {
    setLanguage('en');
    signInMock().language = 'en';
    try {
      renderApp('/settings/parameters');
      const field = await screen.findByRole('textbox', { name: 'Sound check deduction' });
      expect(field).toHaveValue('10.00');
      expect(field).toHaveAccessibleDescription(
        "Subtracted from a musician's fee when load-in & sound check is off, and on freelancer purchase orders. Doesn't change existing lines.",
      );
      expect(screen.getByRole('link', { name: 'Parameters' })).toBeInTheDocument();
    } finally {
      setLanguage('fi');
    }
  });

  it('Enter saves via PATCH, shows "Muutettu <time> · <partner>" and refreshes the reference data', async () => {
    const patches = recordPatches();
    const { user, field, queryClient } = await openParameters();
    await waitFor(() => expect(queryClient.getQueryData(referenceKey)).toBeDefined());
    await user.clear(field);
    await user.type(field, '25,50{Enter}');
    await waitFor(() =>
      expect(patches).toEqual([{ url: '/api/settings/parameters/fees.load_in_deduction', body: { value: 2550 } }]),
    );
    expect(await screen.findByText(/^Muutettu .+ · Partner A$/)).toBeInTheDocument();
    expect(field).toHaveValue('25,50');
    expect(db.reference.settings.loadInDeductionCents).toBe(2550);
    await waitFor(() =>
      expect(queryClient.getQueryData<ReferenceData>(referenceKey)?.settings.loadInDeductionCents).toBe(2550),
    );
  });

  it('blur saves; Esc reverts without saving', async () => {
    const patches = recordPatches();
    const { user, field } = await openParameters();
    await user.clear(field);
    await user.type(field, '99{Escape}');
    expect(field).toHaveValue('10,00');
    await user.clear(field);
    await user.type(field, '12');
    await user.tab();
    await waitFor(() => expect(patches.map((p) => p.body)).toEqual([{ value: 1200 }]));
    await waitFor(() => expect(field).toHaveValue('12,00'));
  });

  it('inline errors: empty, negative and too large are blocked; a server error is shown translated', async () => {
    const patches = recordPatches();
    const { user, field } = await openParameters();
    await user.clear(field);
    await user.type(field, '{Enter}');
    expect(field).toHaveAccessibleDescription(expect.stringContaining('Pakollinen tieto.'));
    await user.clear(field);
    await user.type(field, '-5{Enter}');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await user.clear(field);
    await user.type(field, '1000001{Enter}');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(patches).toEqual([]);

    server.use(
      http.patch('/api/settings/parameters/:key', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'x', { value: 'NEGATIVE_AMOUNT' }),
      ),
    );
    await user.clear(field);
    await user.type(field, '5{Enter}');
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(db.reference.settings.loadInDeductionCents).toBe(1000);
  });

  it('an unknown key shows the key text; a load error offers retry', async () => {
    const unknown: Parameter = { key: 'misc.new_thing', type: 'MONEY', value: null, updatedAt: null, updatedBy: null };
    let fail = true;
    server.use(
      http.get('/api/settings/parameters', () =>
        fail ? errorResponse(403, 'FORBIDDEN', 'x') : HttpResponse.json([unknown]),
      ),
    );
    const { user } = renderApp('/settings/parameters');
    const retry = await screen.findByRole('button', { name: 'Yritä uudelleen' });
    fail = false;
    await user.click(retry);
    const field = await screen.findByRole('textbox', { name: 'misc.new_thing' });
    expect(field).toHaveValue('');
  });

  it('parameterTexts / validateMoneyParameter', () => {
    const t = i18n.getFixedT('fi');
    expect(parameterTexts(t, i18n, 'fees.load_in_deduction').label).toBe(FIELD_FI);
    expect(parameterTexts(t, i18n, 'nope.x')).toEqual({ label: 'nope.x', help: undefined });
    expect(validateMoneyParameter(null)).toBe('REQUIRED');
    expect(validateMoneyParameter(0)).toBeNull();
    expect(validateMoneyParameter(100_000_000)).toBeNull();
    expect(validateMoneyParameter(100_000_001)).toBe('INVALID_VALUE');
  });
});
