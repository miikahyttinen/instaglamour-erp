import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EVENT_DISPLAY_STATUSES } from '../../api/enums';
import { EventDeletedTag, EventStatusTag, InvoiceCoverageTag, InvoicingTags, PaymentStateTag } from './EventStatusTag';
import { EVENT_STATUS_TONE } from './eventStatusTone';

describe('EventStatusTag', () => {
  it.each([
    ['SOLD', 'Tuleva', 'tag-info'],
    ['PLAYED', 'Soitettu', 'tag-ok'],
    ['CANCELLED', 'Peruttu', 'tag-danger'],
  ] as const)('%s is a %s status tag (%s)', (status, label, toneClass) => {
    render(<EventStatusTag status={status} />);
    expect(screen.getByText(label)).toHaveClass('tag', toneClass);
  });

  it('has a tone for every display status', () => {
    for (const status of EVENT_DISPLAY_STATUSES) expect(EVENT_STATUS_TONE[status]).toBeDefined();
  });

  it.each([
    ['NEEDS_INVOICES', 'Laskuttamatta', 'tag-warn'],
    ['FULLY_INVOICED', 'Laskutettu kokonaan', 'tag-ok'],
  ] as const)('coverage %s is "%s" (%s)', (coverage, label, toneClass) => {
    render(<InvoiceCoverageTag coverage={coverage} />);
    expect(screen.getByText(label)).toHaveClass('tag', toneClass);
  });

  it.each([
    ['OPEN_INVOICES', 'Avoimia laskuja', 'tag-info'],
    ['PARTLY_PAID', 'Osittain maksettu', 'tag-purple'],
    ['FULLY_PAID', 'Maksettu kokonaan', 'tag-ok-strong'],
  ] as const)('payment %s is "%s" (%s)', (state, label, toneClass) => {
    render(<PaymentStateTag state={state} />);
    expect(screen.getByText(label)).toHaveClass('tag', toneClass);
  });

  it('NONE is a plain dash on both lines', () => {
    const { container } = render(<InvoicingTags coverage="NONE" payment="NONE" />);
    expect(container.querySelector('.tag')).toBeNull();
    expect([...container.querySelectorAll('.invoicing-tags > span')].map((s) => s.textContent)).toEqual(['–', '–']);
  });

  it('shows Deleted as a danger tag', () => {
    render(<EventDeletedTag />);
    expect(screen.getByText('Poistetut')).toHaveClass('tag', 'tag-danger');
  });
});
