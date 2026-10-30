import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EVENT_DISPLAY_STATUSES, INVOICE_STATES } from '../../api/enums';
import { EventDeletedTag, EventStatusTag, InvoiceStateTag } from './EventStatusTag';
import { EVENT_STATUS_TONE, INVOICE_STATE_TONE } from './eventStatusTone';

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
    ['PAID', 'Maksettu', 'tag-ok-strong'],
    ['ROWS_TO_INVOICE', 'Laskutettavia rivejä', 'tag-info'],
    ['OPEN_INVOICES', 'Avoimia laskuja', 'tag-warn'],
    ['NEEDS_INVOICES', 'Laskuttamatta', 'tag-yellow'],
  ] as const)('invoicing state %s is one "%s" tag (%s)', (state, label, toneClass) => {
    const { container } = render(<InvoiceStateTag state={state} />);
    expect(screen.getByText(label)).toHaveClass('tag', toneClass);
    expect(container.querySelectorAll('.tag')).toHaveLength(1);
  });

  it('has a tone for every invoicing state except NONE', () => {
    for (const state of INVOICE_STATES) if (state !== 'NONE') expect(INVOICE_STATE_TONE[state]).toBeDefined();
  });

  it('NONE is a plain dash', () => {
    const { container } = render(<InvoiceStateTag state="NONE" />);
    expect(container.querySelector('.tag')).toBeNull();
    expect(container.textContent).toBe('–');
  });

  it('shows Deleted as a danger tag', () => {
    render(<EventDeletedTag />);
    expect(screen.getByText('Poistetut')).toHaveClass('tag', 'tag-danger');
  });
});
