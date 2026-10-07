import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './offerParts';

function renderDialog(mutationFn: () => Promise<unknown>, onDone = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ConfirmDialog title="Vahvista" confirmLabel="Kyllä" mutationFn={mutationFn} onClose={vi.fn()} onDone={onDone}>
        <p>Oletko varma?</p>
      </ConfirmDialog>
    </QueryClientProvider>,
  );
  return screen.getByRole('button', { name: 'Kyllä' });
}

describe('ConfirmDialog (F-007)', () => {
  it('sends one request on a zero-delay double click (two clicks in the same frame)', async () => {
    let resolve: (value: string) => void = () => undefined;
    const mutationFn = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const onDone = vi.fn();
    const button = renderDialog(mutationFn, onDone);
    // Both clicks before React re-renders: isPending is not yet published.
    act(() => {
      button.click();
      button.click();
    });
    expect(button).toBeDisabled();
    await waitFor(() => expect(mutationFn).toHaveBeenCalled());
    act(() => resolve('ok'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it('enables confirm again after an error so the user can retry', async () => {
    const mutationFn = vi.fn(() => Promise.reject(new Error('nope')));
    const button = renderDialog(mutationFn);
    act(() => button.click());
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(button).toBeEnabled();
    act(() => button.click());
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(2));
  });
});
