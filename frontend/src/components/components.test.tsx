import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Plus, Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { setTheme } from '../theme/theme';
import { Button, IconButton } from './Button';
import { buttonClass } from './buttonClass';
import { Card } from './Card';
import { DataTable, type DataTableColumn } from './DataTable';
import { Logo } from './Logo';
import { MiniBars } from './MiniBars';
import { PageHead } from './PageHead';
import { SectionLabel } from './SectionLabel';
import { FieldList } from './FieldList';
import { Field, MoneyInput } from './fields';
import { spanStyle } from './grid';
import { StatGrid, StatTile } from './StatTile';
import { StatusTag } from './StatusTag';

describe('Button', () => {
  it('is a ghost type="button" by default', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('btn', 'btn-ghost');
  });

  it('variants, size, block and a decorative leading icon', () => {
    render(
      <>
        <Button variant="primary" size="sm" block icon={Plus}>
          New
        </Button>
        <Button variant="danger" type="submit" icon={Trash2}>
          Delete
        </Button>
      </>,
    );
    const primary = screen.getByRole('button', { name: 'New' });
    expect(primary).toHaveClass('btn-primary', 'btn-sm', 'btn-block');
    expect(primary.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('btn-danger');
  });

  it('buttonClass styles links the same way', () => {
    expect(buttonClass({ variant: 'primary', block: true })).toBe('btn btn-primary btn-block');
    expect(buttonClass()).toBe('btn btn-ghost');
  });

  it('IconButton has an accessible name and tooltip', async () => {
    const onClick = vi.fn();
    render(<IconButton icon={Trash2} label="Remove" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Remove' });
    expect(button).toHaveAttribute('title', 'Remove');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('StatusTag', () => {
  it.each(['info', 'ok', 'warn', 'yellow', 'danger', 'muted'] as const)('tone %s', (tone) => {
    render(<StatusTag tone={tone}>Label</StatusTag>);
    expect(screen.getByText('Label')).toHaveClass('tag', `tag-${tone}`);
  });

  it('defaults to muted', () => {
    render(<StatusTag>Inactive</StatusTag>);
    expect(screen.getByText('Inactive')).toHaveClass('tag-muted');
  });
});

describe('PageHead, SectionLabel, Card', () => {
  it('PageHead renders h1, subtitle and actions', () => {
    render(<PageHead title="Events 2030" subtitle="4 events" actions={<Button>New event</Button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Events 2030' })).toBeInTheDocument();
    expect(screen.getByText('4 events')).toHaveClass('page-subtitle');
    expect(screen.getByRole('button', { name: 'New event' })).toBeInTheDocument();
  });

  it('SectionLabel is an h2 by default', () => {
    render(
      <>
        <SectionLabel>Statistics</SectionLabel>
        <SectionLabel as="p">Plain</SectionLabel>
      </>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Statistics' })).toHaveClass('section-label');
    expect(screen.getByText('Plain').tagName).toBe('P');
  });

  it('Card renders label, title and actions', () => {
    render(
      <Card label="Label" title="Title" actions={<Button>Act</Button>}>
        Body
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('Label')).toHaveClass('label');
    expect(screen.getByText('Body')).toHaveClass('card');
  });
});

describe('StatTile and MiniBars', () => {
  const bars = [
    { label: '2029', value: 50, valueText: '50 €' },
    { label: '2030', value: 100, current: true, valueText: '100 €' },
    { label: '2031', value: -5 },
  ];

  it('StatTile is a region named by its label with the value and caption', () => {
    render(
      <StatTile
        label="Events"
        value="12"
        caption="this year"
        secondaryValue="1 000 €"
        secondaryCaption="Total"
      />,
    );
    const tile = screen.getByRole('region', { name: 'Events' });
    expect(within(tile).getByText('12')).toHaveClass('stat-tile-value');
    expect(within(tile).getByText('this year')).toBeInTheDocument();
    expect(within(tile).getByText('1 000 €')).toBeInTheDocument();
    expect(within(tile).getByText('Total')).toBeInTheDocument();
  });

  it('MiniBars scale to the max, highlight the current bar and list values for screen readers', () => {
    render(<MiniBars bars={bars} label="Sales per year" />);
    const list = screen.getByRole('list', { name: 'Sales per year' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '2029: 50 €',
      '2030: 100 €',
      '2031: -5',
    ]);
    const drawn = screen.getAllByTestId('mini-bar');
    expect(drawn.map((b) => b.style.height)).toEqual(['50%', '100%', '0%']);
    expect(drawn[1]).toHaveClass('is-current');
    expect(drawn[0]).not.toHaveClass('is-current');
  });

  it('MiniBars with all zero values draw empty bars', () => {
    render(<MiniBars bars={[{ label: 'a', value: 0 }]} label="Empty" showLabels={false} />);
    expect(screen.getByTestId('mini-bar').style.height).toBe('0%');
  });

  it('MiniBars height: 48 px by default, px number, any CSS length, or the compact variant', () => {
    const plot = (label: string) =>
      screen
        .getByRole('list', { name: label })
        .parentElement!.querySelector<HTMLElement>('.mini-bars-plot')!;
    render(
      <>
        <MiniBars bars={bars} label="Default" />
        <MiniBars bars={bars} label="Px" height={40} />
        <MiniBars bars={bars} label="Length" height="var(--space-5)" />
        <MiniBars bars={bars} label="Compact" compact />
        <MiniBars bars={bars} label="Both" compact height="2rem" />
      </>,
    );
    expect(plot('Default').style.height).toBe('48px');
    expect(plot('Px').style.height).toBe('40px');
    expect(plot('Length').style.height).toBe('var(--space-5)');
    expect(plot('Compact').style.height).toBe('var(--space-6)');
    expect(plot('Both').style.height).toBe('2rem');
  });

  it('StatTile shows mini bars when given', () => {
    render(<StatTile label="Per year" value="3" bars={bars} barsCaption="last 3 years" />);
    expect(screen.getByRole('list', { name: 'Per year' })).toBeInTheDocument();
    expect(screen.getByText('last 3 years')).toBeInTheDocument();
  });
});

describe('DataTable', () => {
  interface Row {
    id: number;
    name: string;
    amount: string;
  }
  const rows: Row[] = [
    { id: 1, name: 'Venue X', amount: '1 000 €' },
    { id: 2, name: 'Venue Y', amount: '2 000 €' },
  ];

  function columns(onSort = vi.fn()): DataTableColumn<Row>[] {
    return [
      { key: 'name', label: 'Venue', primary: true, cell: (r) => r.name },
      { key: 'amount', label: 'Amount', numeric: true, sort: 'desc', onSort, cell: (r) => r.amount },
      { key: 'note', label: 'Note', hideOnPhone: true, cell: () => '–' },
    ];
  }

  it('renders a captioned table with labelled, numeric and primary cells', () => {
    render(<DataTable caption="Venues" columns={columns()} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole('table', { name: 'Venues' });
    expect(table).toHaveClass('data-table', 'data-table-cards');
    const cell = within(table).getByRole('cell', { name: '2 000 €' });
    expect(cell).toHaveClass('num');
    expect(cell).toHaveAttribute('data-label', 'Amount');
    expect(within(table).getByRole('cell', { name: 'Venue X' })).toHaveClass('cell-primary');
    expect(within(table).getAllByRole('cell', { name: '–' })[0]).toHaveClass('hide-phone');
  });

  it('sortable headers expose aria-sort and call onSort', async () => {
    const onSort = vi.fn();
    render(
      <DataTable caption="Venues" columns={columns(onSort)} rows={rows} rowKey={(r) => r.id} />,
    );
    const header = screen.getByRole('columnheader', { name: 'Amount' });
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: 'Venue' })).not.toHaveAttribute('aria-sort');
    await userEvent.click(within(header).getByRole('button', { name: 'Amount' }));
    expect(onSort).toHaveBeenCalledOnce();
  });

  it('shows the empty content instead of an empty table', () => {
    render(
      <DataTable caption="Venues" columns={columns()} rows={[]} rowKey={(r) => r.id} empty="None." />,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('None.')).toBeInTheDocument();
  });

  it('cardsOnPhone=false keeps the table layout on phones', () => {
    render(
      <DataTable
        caption="Venues"
        columns={columns()}
        rows={rows}
        rowKey={(r) => r.id}
        cardsOnPhone={false}
      />,
    );
    expect(screen.getByRole('table')).not.toHaveClass('data-table-cards');
  });

  it('cardsBelow="lg" keeps the cards up to 1199 px (extra class); default is phones only', () => {
    render(
      <>
        <DataTable caption="Phone" columns={columns()} rows={rows} rowKey={(r) => r.id} />
        <DataTable
          caption="Wide"
          columns={columns()}
          rows={rows}
          rowKey={(r) => r.id}
          cardsBelow="lg"
        />
        <DataTable
          caption="None"
          columns={columns()}
          rows={rows}
          rowKey={(r) => r.id}
          cardsBelow="lg"
          cardsOnPhone={false}
        />
      </>,
    );
    const phone = screen.getByRole('table', { name: 'Phone' });
    expect(phone).toHaveClass('data-table-cards');
    expect(phone).not.toHaveClass('data-table-cards-lg');
    expect(screen.getByRole('table', { name: 'Wide' })).toHaveClass(
      'data-table-cards',
      'data-table-cards-lg',
    );
    const none = screen.getByRole('table', { name: 'None' });
    expect(none).not.toHaveClass('data-table-cards');
    expect(none).not.toHaveClass('data-table-cards-lg');
  });
});

describe('MoneyInput', () => {
  it('keeps the € inside the field wrapper, after the input, hidden from screen readers', async () => {
    const onChange = vi.fn();
    render(<Field label="Fee">{(p) => <MoneyInput {...p} value="" onChange={onChange} />}</Field>);
    const input = screen.getByRole('textbox', { name: 'Fee' });
    expect(input.parentElement).toHaveClass('money-input');
    expect(input.nextElementSibling).toHaveTextContent('€');
    expect(input.nextElementSibling).toHaveAttribute('aria-hidden', 'true');
    await userEvent.type(input, '5');
    expect(onChange).toHaveBeenLastCalledWith('5');
  });
});

describe('Logo', () => {
  it('uses the white logo in dark theme and the black logo in light theme', () => {
    setTheme('dark');
    render(<Logo />);
    const img = screen.getByRole('img', { name: 'Instaglamour ERP' });
    expect(img.getAttribute('src')).toMatch(/logo-white\.png/);
    act(() => setTheme('light'));
    expect(img.getAttribute('src')).toMatch(/logo-black\.png/);
  });

  it('large size and an explicit theme override', () => {
    setTheme('dark');
    render(<Logo size="large" theme="light" />);
    expect(screen.getByRole('img').getAttribute('src')).toMatch(/logo-black-large\.png/);
  });
});

describe('StatGrid spans (12 columns)', () => {
  it('spanStyle sets only the given breakpoints, clamped to 1…12', () => {
    expect(spanStyle(undefined)).toBeUndefined();
    expect(spanStyle(6)).toEqual({ '--span': 6 });
    expect(spanStyle({ base: 6, sm: 4, lg: 2 })).toEqual({ '--span': 6, '--span-sm': 4, '--span-lg': 2 });
    expect(spanStyle({ md: 20, lg: 0 })).toEqual({ '--span-md': 12, '--span-lg': 1 });
  });

  it('StatTile and Card pass their span to the grid item; no span = CSS default', () => {
    render(
      <StatGrid className="extra">
        <StatTile label="Events" value="12" span={{ base: 12, md: 4 }} />
        <Card label="Side" span={8}>
          x
        </Card>
        <StatTile label="Plain" value="1" />
      </StatGrid>,
    );
    const tile = screen.getByRole('region', { name: 'Events' });
    expect(tile.parentElement).toHaveClass('stat-grid', 'extra');
    expect(tile.style.getPropertyValue('--span')).toBe('12');
    expect(tile.style.getPropertyValue('--span-md')).toBe('4');
    expect(screen.getByText('Side').closest<HTMLElement>('.card')!.style.getPropertyValue('--span')).toBe('8');
    expect(screen.getByRole('region', { name: 'Plain' })).not.toHaveAttribute('style');
  });
});

describe('FieldList', () => {
  it('wraps fields in a label-column list (md default, sm / lg variants)', () => {
    const { container, rerender } = render(
      <FieldList>
        <Field label="Venue">{(f) => <input {...f} type="text" />}</Field>
      </FieldList>,
    );
    expect(screen.getByRole('textbox', { name: 'Venue' })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('field-list');
    expect(container.firstElementChild).not.toHaveClass('field-list-md');
    rerender(
      <FieldList labelWidth="lg" className="x">
        <Field label="Venue">{(f) => <input {...f} type="text" />}</Field>
      </FieldList>,
    );
    expect(container.firstElementChild).toHaveClass('field-list', 'field-list-lg', 'x');
  });
});
