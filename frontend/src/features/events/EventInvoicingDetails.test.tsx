import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { addMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

// "Laskutustiedot / Invoicing details" free text in the Laskutus card (TASK-200). Synthetic data only.

const section = (name: string) => screen.getByRole('heading', { name, level: 2 }).closest('details')!;
const historyItems = () =>
  within(screen.getByRole('list', { name: 'Muutoshistoria' })).getAllByRole('listitem');
const detailsField = async () =>
  within(await waitFor(() => section('Laskutus'))).findByRole('textbox', { name: 'Laskutustiedot' });

describe('gig invoicing details (TASK-200)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('is a multi-line field under the invoice rows; blur saves, history shows the label', async () => {
    const event = addMockEvent();
    const { user } = renderApp(`/gigs/${event.id}`);
    const field = await detailsField();
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveValue('');
    // Below the add-row button, above the totals.
    const card = section('Laskutus');
    const add = within(card).getByRole('button', { name: '+ Lisää laskurivi' });
    expect(add.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const sent = within(card).getByText('Lähetetty', { selector: 'dt' });
    expect(field.compareDocumentPosition(sent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(field, 'Reference 123{Enter}Billing address Street 1');
    expect(event.invoicingDetails).toBeNull();
    await user.tab();
    await waitFor(() => expect(event.invoicingDetails).toBe('Reference 123\nBilling address Street 1'));
    await waitFor(() =>
      expect(historyItems()[0]).toHaveTextContent(/Laskutustiedot: – → Reference 123\s+Billing address Street 1/),
    );
  });

  it('Esc reverts; clearing saves null', async () => {
    const event = addMockEvent({ invoicingDetails: 'Ref A' });
    const { user } = renderApp(`/gigs/${event.id}`);
    const field = await detailsField();
    expect(field).toHaveValue('Ref A');
    await user.type(field, ' changed');
    await user.keyboard('{Escape}');
    expect(field).toHaveValue('Ref A');
    await user.tab();
    expect(event.invoicingDetails).toBe('Ref A');

    await user.clear(field);
    await user.tab();
    await waitFor(() => expect(event.invoicingDetails).toBeNull());
  });

  it('over 5000 characters shows TOO_LONG and sends nothing', async () => {
    const event = addMockEvent();
    const { user } = renderApp(`/gigs/${event.id}`);
    const field = await detailsField();
    fireEvent.change(field, { target: { value: 'x'.repeat(5001) } });
    await user.click(field);
    await user.tab();
    expect(await within(section('Laskutus')).findByText('Teksti on liian pitkä.')).toBeInTheDocument();
    expect(event.invoicingDetails).toBeNull();
  });

  it('a server field error is shown inline', async () => {
    const event = addMockEvent();
    server.use(
      http.patch('/api/events/:id', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Validation failed', { invoicingDetails: 'TOO_LONG' }),
      ),
    );
    const { user } = renderApp(`/gigs/${event.id}`);
    const field = await detailsField();
    await user.type(field, 'Ref B');
    await user.tab();
    expect(await within(section('Laskutus')).findByText('Teksti on liian pitkä.')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('deleted gig: read-only text; empty shows a muted "–"', async () => {
    const withText = addMockEvent({ venue: 'Venue Del', invoicingDetails: 'Ref C\nLine 2' });
    withText.deletedAt = '2030-06-03T10:00:00Z';
    renderApp(`/gigs/${withText.id}`);
    const group = await within(await waitFor(() => section('Laskutus'))).findByRole('group', { name: 'Laskutustiedot' });
    expect(group).toHaveTextContent(/Ref C\s+Line 2/);
    expect(within(section('Laskutus')).queryByRole('textbox', { name: 'Laskutustiedot' })).not.toBeInTheDocument();
  });

  it('deleted gig without details shows "–"', async () => {
    const empty = addMockEvent({ venue: 'Venue Empty' });
    empty.deletedAt = '2030-06-03T10:00:00Z';
    renderApp(`/gigs/${empty.id}`);
    const group = await within(await waitFor(() => section('Laskutus'))).findByRole('group', { name: 'Laskutustiedot' });
    expect(within(group).getByText('–')).toHaveClass('muted');
  });

  it('is on the detail only, not on list summaries', async () => {
    const event = addMockEvent({ invoicingDetails: 'Ref D' });
    const res = await fetch(`/api/events?year=${TEST_YEAR}`);
    const body = (await res.json()) as { events: Record<string, unknown>[] };
    const item = body.events.find((g) => g.id === event.id)!;
    expect(item).not.toHaveProperty('invoicingDetails');
    expect(db.events.events.find((g) => g.id === event.id)!.invoicingDetails).toBe('Ref D');
  });
});
