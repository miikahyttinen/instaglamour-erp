import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

describe('/styleguide (dev only)', () => {
  it('renders without signing in and shows every component in both themes', async () => {
    const { container, user } = renderApp('/styleguide');
    expect(await screen.findAllByRole('heading', { level: 1, name: 'Page title' })).toHaveLength(2);
    const panels = container.querySelectorAll<HTMLElement>('.sg-panel');
    expect([...panels].map((p) => p.dataset.theme)).toEqual(['dark', 'light']);

    for (const panel of panels) {
      const p = within(panel);
      for (const section of [
        'Logo',
        'Colour tokens',
        'Typography',
        'Buttons',
        'Form controls (Field + native inputs)',
        'Inline editing (save on blur)',
        'Status tags',
        'Notices',
        'Stat tiles + mini bars (StatGrid / StatTile)',
        'Data table (DataTable; phone < 600 px = cards)',
        'Dialog (bottom sheet on phone)',
        'Icons (lucide-react, 16 px, stroke 1.5)',
      ]) {
        expect(p.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
      }
      expect(p.getByRole('table', { name: 'Demo gigs' })).toBeInTheDocument();
      // Every inline component.
      expect(p.getByRole('textbox', { name: 'InlineText · venue' })).toBeInTheDocument();
      expect(p.getByRole('textbox', { name: 'InlineTextarea · notes' })).toBeInTheDocument();
      expect(p.getByRole('textbox', { name: 'InlineMoney · price (required)' })).toBeInTheDocument();
      expect(p.getByRole('textbox', { name: 'InlineHours · hours' })).toBeInTheDocument();
      expect(p.getByLabelText('InlineDate · due date')).toBeInTheDocument();
      expect(p.getByRole('combobox', { name: 'InlineSelect · person' })).toBeInTheDocument();
      expect(p.getByRole('checkbox', { name: 'InlineCheckbox · active' })).toBeInTheDocument();
      expect(p.getByRole('switch', { name: 'InlineSwitch · joins load-in' })).toBeInTheDocument();
      expect(p.getByRole('group', { name: 'InlineCheckboxGroup · setup' })).toBeInTheDocument();
      expect(p.getByRole('table', { name: 'Inline demo rows' })).toBeInTheDocument();
    }

    // Only one theme.
    await user.click(screen.getByRole('button', { name: 'light' }));
    expect([...container.querySelectorAll<HTMLElement>('.sg-panel')].map((p) => p.dataset.theme)).toEqual([
      'light',
    ]);

    // Sorting and the dialog work.
    const table = screen.getByRole('table', { name: 'Demo gigs' });
    await user.click(within(table).getByRole('button', { name: 'Price' }));
    expect(within(table).getByRole('columnheader', { name: 'Price' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(screen.getByRole('dialog', { name: 'Delete gig' })).toBeInTheDocument();
  });

  it('inline demo saves on blur, and the fail toggle shows a translated field error', async () => {
    const { user } = renderApp('/styleguide');
    await user.click(await screen.findByRole('button', { name: 'light' }));
    const venue = screen.getByRole('textbox', { name: 'InlineText · venue' });
    await user.type(venue, '!');
    await user.tab();
    expect(await screen.findByText('InlineText · venue: tallennettu', {}, { timeout: 2000 })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Make saves fail/ }));
    await user.type(venue, '?');
    await user.tab();
    expect(await screen.findByText('Virheellinen arvo.', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(venue).toHaveValue('Venue X!?');
  });
});
