import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { setLanguage } from '../../i18n';
import {
  InlineCheckbox,
  InlineCheckboxGroup,
  InlineDate,
  InlineHours,
  InlineMoney,
  InlineSelect,
  InlineSwitch,
  InlineText,
  InlineTextarea,
} from './index';

// Synthetic data only (BR-090).

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const validationError = (fields: Record<string, string>) =>
  new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', fields as ApiError['fields']);

const status = (name: string) =>
  screen.getAllByRole('status').find((el) => el.textContent?.startsWith(`${name}:`));

describe('InlineText', () => {
  it('saves the trimmed value on blur and announces it', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineText label="Venue" value="Venue X" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Venue' });
    await user.clear(input);
    await user.type(input, '  Venue Y ');
    expect(onSave).not.toHaveBeenCalled();
    await user.tab();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Venue Y');
    expect(await screen.findByRole('status')).toHaveTextContent('Venue: tallennettu');
    expect(input).toHaveValue('Venue Y');
  });

  it('Enter saves and keeps focus; a later blur does not send again', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineText label="Venue" value="Venue X" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Venue' });
    await user.clear(input);
    await user.type(input, 'Venue Z{Enter}');
    expect(onSave).toHaveBeenCalledWith('Venue Z');
    expect(input).toHaveFocus();
    await user.tab();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Esc restores the saved value and nothing is sent', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineText label="Venue" value="Venue X" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Venue' });
    await user.type(input, ' changed');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Venue X');
    await user.tab();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('sends no request when the value is unchanged', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineText label="Venue" value="Venue X" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Venue' });
    await user.click(input);
    await user.tab();
    await user.clear(input);
    await user.type(input, 'Venue X {Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('on a server error keeps the typed value, shows the translated field code and retries on the next blur', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(validationError({ venue: 'TOO_LONG', other: 'REQUIRED' }))
      .mockResolvedValueOnce(undefined);
    render(<InlineText label="Venue" value="Venue X" field="venue" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Venue' });
    await user.clear(input);
    await user.type(input, 'Venue Y');
    await user.tab();

    expect(await screen.findByText('Teksti on liian pitkä.')).toBeInTheDocument();
    expect(input).toHaveValue('Venue Y');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Teksti on liian pitkä.');
    expect(screen.getByRole('status')).toHaveTextContent('Venue: Teksti on liian pitkä.');

    await user.click(input);
    await user.tab();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith('Venue Y');
    expect(screen.queryByText('Teksti on liian pitkä.')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('a non-validation error shows the translated error code, never the server message', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new ApiError(409, 'GIG_DELETED', 'Server text'));
    render(<InlineText label="Venue" value="Venue X" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Venue' });
    await user.type(input, '!');
    await user.tab();
    expect(await screen.findByText('Keikka on poistettu. Palauta se ensin.')).toBeInTheDocument();
    expect(screen.queryByText('Server text')).not.toBeInTheDocument();
  });

  it('client-side validation blocks the request (required, maxLength, validate)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <>
        <InlineText label="Name" required value="Person 1" onSave={onSave} />
        <InlineText label="Code" value={null} maxLength={3} onSave={onSave} />
        <InlineText
          label="Custom"
          value="a"
          validate={(v) => (v === 'bad' ? 'INVALID_VALUE' : null)}
          onSave={onSave}
        />
      </>,
    );
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.tab();
    expect(screen.getByText('Pakollinen tieto.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Code' }), 'ABCD');
    await user.tab();
    expect(screen.getByText('Teksti on liian pitkä.')).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Custom' }));
    await user.type(screen.getByRole('textbox', { name: 'Custom' }), 'bad');
    await user.tab();
    expect(screen.getByText('Virheellinen arvo.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('optional text: empty is saved as null', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineText label="Notes" value="Something" onSave={onSave} />);
    await user.clear(screen.getByRole('textbox', { name: 'Notes' }));
    await user.tab();
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('shows the saving state while the request runs, and the field stays editable', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const onSave = vi.fn().mockReturnValue(pending.promise);
    const { container } = render(<InlineText label="Venue" value="Venue X" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Venue' });
    await user.type(input, '!{Enter}');
    expect(container.querySelector('.inline-field')).toHaveClass('is-saving');
    expect(input).toBeEnabled();
    await act(async () => pending.resolve());
    expect(container.querySelector('.inline-field')).toHaveClass('is-saved');
  });

  it('a change made while saving is sent after the first request finishes', async () => {
    const user = userEvent.setup();
    const first = deferred();
    const onSave = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    render(<InlineText label="Venue" value="Venue X" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Venue' });
    await user.type(input, '1{Enter}');
    await user.type(input, '2');
    await user.tab();
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve());
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith('Venue X12');
    expect(input).toHaveValue('Venue X12');
  });

  it('follows a new server value when not edited, but keeps what the user is typing', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<InlineText label="Venue" value="Venue X" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Venue' });
    rerender(<InlineText label="Venue" value="Venue Y" onSave={onSave} />);
    expect(input).toHaveValue('Venue Y');
    await user.type(input, '!');
    rerender(<InlineText label="Venue" value="Venue Z" onSave={onSave} />);
    expect(input).toHaveValue('Venue Y!');
  });

  it('disabled: no request', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineText label="Venue" value="Venue X" disabled onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Venue' });
    expect(input).toBeDisabled();
    await user.type(input, 'x');
    await user.tab();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('hideLabel keeps the accessible name', () => {
    render(<InlineText label="Venue" hideLabel value="Venue X" onSave={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Venue' })).toBeInTheDocument();
    expect(screen.getByText('Venue')).toHaveClass('visually-hidden');
  });
});

describe('InlineTextarea', () => {
  it('Enter adds a new line; Ctrl+Enter and blur save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineTextarea label="Notes" value="Line 1" onSave={onSave} />);
    const textarea = screen.getByRole('textbox', { name: 'Notes' });
    await user.type(textarea, '{Enter}Line 2');
    expect(onSave).not.toHaveBeenCalled();
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSave).toHaveBeenCalledWith('Line 1\nLine 2');
    await user.type(textarea, '!');
    await user.tab();
    expect(onSave).toHaveBeenLastCalledWith('Line 1\nLine 2!');
  });
});

describe('InlineMoney', () => {
  it('parses FI input to cents and normalises the text', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineMoney label="Price" required value={100000} onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Price' });
    expect(input).toHaveValue('1000,00');
    await user.clear(input);
    await user.type(input, '1 234,5');
    await user.tab();
    expect(onSave).toHaveBeenCalledWith(123450);
    expect(input).toHaveValue('1234,50');
  });

  it('unchanged amount in another spelling sends nothing', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineMoney label="Price" required value={100000} onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Price' });
    await user.clear(input);
    await user.type(input, '1000{Enter}');
    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveValue('1000,00');
  });

  it('invalid and negative amounts are not sent', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineMoney label="Price" required value={100000} onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Price' });
    await user.clear(input);
    await user.type(input, 'abc');
    await user.tab();
    expect(screen.getByText('Virheellinen arvo.')).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '-5');
    await user.tab();
    expect(screen.getByText('Summa ei voi olla negatiivinen.')).toBeInTheDocument();
    await user.clear(input);
    await user.tab();
    expect(screen.getByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('optional: empty → null; EN parsing and re-format on language change', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineMoney label="Budget" value={50} onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Budget' });
    expect(input).toHaveValue('0,50');
    act(() => setLanguage('en'));
    expect(input).toHaveValue('0.50');
    await user.clear(input);
    await user.type(input, '1,000.25');
    await user.tab();
    expect(onSave).toHaveBeenLastCalledWith(100025);
    await user.clear(input);
    await user.tab();
    expect(onSave).toHaveBeenLastCalledWith(null);
  });
});

describe('InlineHours', () => {
  it('saves quarter hours and rejects other values', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineHours label="Hours" value={2} onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Hours' });
    await user.clear(input);
    await user.type(input, '1,3');
    await user.tab();
    expect(screen.getByText('Tunnit 0,25–24 neljännestunnin tarkkuudella.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '1,25{Enter}');
    expect(onSave).toHaveBeenCalledWith(1.25);
    expect(input).toHaveValue('1,25');
  });
});

describe('InlineDate', () => {
  it('saves a changed date on blur; optional empty → null', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineDate label="Due date" value="2030-01-01" onSave={onSave} />);
    const input = screen.getByLabelText('Due date');
    await user.clear(input);
    await user.type(input, '2030-02-03');
    await user.tab();
    expect(onSave).toHaveBeenCalledWith('2030-02-03');
    await user.clear(input);
    await user.tab();
    expect(onSave).toHaveBeenLastCalledWith(null);
  });

  it('required date: empty is REQUIRED', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<InlineDate label="Date" required value="2030-01-01" onSave={onSave} />);
    await user.clear(screen.getByLabelText('Date'));
    await user.tab();
    expect(screen.getByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('InlineSelect', () => {
  const options = [
    { value: null, label: '–' },
    { value: 1, label: 'Person 1' },
    { value: 2, label: 'Person 2' },
  ];

  it('saves immediately on change with the option value', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineSelect label="Person" value={1} options={options} onSave={onSave} />);
    const select = screen.getByRole('combobox', { name: 'Person' });
    await user.selectOptions(select, 'Person 2');
    expect(onSave).toHaveBeenCalledWith(2);
    await user.selectOptions(select, '–');
    expect(onSave).toHaveBeenLastCalledWith(null);
    await user.tab();
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('on error keeps the chosen option and retries on blur', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(validationError({ personId: 'UNKNOWN_REFERENCE' }))
      .mockResolvedValueOnce(undefined);
    render(<InlineSelect label="Person" value={1} options={options} onSave={onSave} />);
    const select = screen.getByRole('combobox', { name: 'Person' });
    await user.selectOptions(select, 'Person 2');
    expect(await screen.findByText('Valittua tietoa ei ole olemassa.')).toBeInTheDocument();
    expect(select).toHaveValue('2');
    await user.tab();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(2);
  });
});

describe('InlineCheckbox / InlineSwitch', () => {
  it('save immediately on change', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <>
        <InlineCheckbox label="Active" value onSave={onSave} />
        <InlineSwitch label="Load-in" value={false} onSave={onSave} />
      </>,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Active' }));
    expect(onSave).toHaveBeenLastCalledWith(false);
    const toggle = screen.getByRole('switch', { name: 'Load-in' });
    await user.click(toggle);
    expect(onSave).toHaveBeenLastCalledWith(true);
    expect(toggle).toBeChecked();
    expect(await screen.findByText('Load-in: tallennettu')).toBeInTheDocument();
  });

  it('error is shown and translated', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(validationError({ joinsLoadIn: 'INVALID_VALUE' }));
    render(<InlineSwitch label="Load-in" value={false} onSave={onSave} />);
    await user.click(screen.getByRole('switch', { name: 'Load-in' }));
    expect(await screen.findByText('Virheellinen arvo.')).toBeInTheDocument();
    expect(status('Load-in')).toHaveTextContent('Load-in: Virheellinen arvo.');
  });
});

describe('InlineCheckboxGroup', () => {
  it('saves the whole list in option order on each change', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    function Demo() {
      const [value, setValue] = useState<('A' | 'B' | 'C')[]>(['C']);
      return (
        <InlineCheckboxGroup
          label="Setup"
          value={value}
          options={[
            { value: 'A', label: 'Option A' },
            { value: 'B', label: 'Option B' },
            { value: 'C', label: 'Option C' },
          ]}
          validate={(v) => (v.length ? null : 'REQUIRED')}
          onSave={async (next) => {
            await onSave(next);
            setValue(next);
          }}
        />
      );
    }
    render(<Demo />);
    const group = screen.getByRole('group', { name: 'Setup' });
    await user.click(within(group).getByRole('checkbox', { name: 'Option A' }));
    expect(onSave).toHaveBeenLastCalledWith(['A', 'C']);
    await user.click(within(group).getByRole('checkbox', { name: 'Option A' }));
    await user.click(within(group).getByRole('checkbox', { name: 'Option C' }));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(within(group).getByText('Pakollinen tieto.')).toBeInTheDocument();
  });
});
