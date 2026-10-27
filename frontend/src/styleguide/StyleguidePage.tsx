// Dev-only component reference (/styleguide, not in the navigation, not in production builds).
// The reference for screen work (Layout v2: TASK-125…130): if a screen needs something that is
// not here, add it here first. Synthetic data only (BR-090). Texts are English on purpose: this page
// is for developers and is not translated.
import {
  Check,
  Download,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, IconButton } from '../components/Button';
import { buttonClass } from '../components/buttonClass';
import { Card } from '../components/Card';
import { DataTable, type DataTableColumn, type SortDirection } from '../components/DataTable';
import { Dialog } from '../components/Dialog';
import { Field, MoneyInput } from '../components/fields';
import { Logo } from '../components/Logo';
import { MiniBars } from '../components/MiniBars';
import { Notice } from '../components/Notice';
import { PageHead } from '../components/PageHead';
import { SectionLabel } from '../components/SectionLabel';
import { StatGrid, StatTile } from '../components/StatTile';
import { StatusTag, type StatusTone } from '../components/StatusTag';
import { setLanguage } from '../i18n';
import { useLang } from '../i18n/useLang';
import { LanguageButtons } from '../layout/LanguageButtons';
import { NAV_ITEMS } from '../layout/navItems';
import { ThemeToggle } from '../layout/ThemeToggle';
import { formatMoney } from '../lib/format';
import type { Theme } from '../theme/theme';
import { ExcelTableShowcase } from './ExcelTableShowcase';
import { InlineShowcase } from './InlineShowcase';
import { LayoutShowcase } from './LayoutShowcase';
import './styleguide.css';

const COLOR_TOKENS = [
  ['--bg', 'page background'],
  ['--surface', 'cards, tables'],
  ['--surface-2', 'table header, hover'],
  ['--border', 'hairlines'],
  ['--border-strong', 'inputs, buttons'],
  ['--text', 'text'],
  ['--text-muted', 'secondary text'],
  ['--label', 'mono labels'],
  ['--accent', 'primary, current bar'],
  ['--accent-contrast', 'text on accent'],
] as const;
const STATUS_TOKENS = ['info', 'ok', 'warn', 'danger'] as const;
const SPACING = [1, 2, 3, 4, 5, 6, 7] as const;
const TONES: { tone: StatusTone; text: string; use: string }[] = [
  { tone: 'info', text: 'Sold', use: 'Sold / Played' },
  { tone: 'ok', text: 'Done', use: 'Done / Paid' },
  { tone: 'warn', text: 'Not fully staffed', use: 'Overdue / staffing / contract warnings' },
  { tone: 'danger', text: 'Cancelled', use: 'Cancelled / Deleted' },
  { tone: 'muted', text: 'Inactive', use: 'neutral facts' },
];
const ICONS: [string, LucideIcon][] = [
  ...NAV_ITEMS.map((item) => [item.labelKey.replace('nav.', ''), item.icon] as [string, LucideIcon]),
  ['Plus', Plus],
  ['Pencil', Pencil],
  ['Trash2', Trash2],
  ['Search', Search],
  ['Download', Download],
  ['Mail', Mail],
  ['Check', Check],
];

interface DemoEvent {
  id: number;
  date: string;
  name: string;
  venue: string;
  status: StatusTone;
  statusText: string;
  price: number; // cents
}

const DEMO_EVENTS: DemoEvent[] = [
  { id: 1, date: '2030-02-14', name: 'Event 1', venue: 'Venue X', status: 'info', statusText: 'Sold', price: 200000 },
  { id: 2, date: '2030-03-01', name: 'Event 2', venue: 'Venue Y', status: 'warn', statusText: 'Not fully staffed', price: 150000 },
  { id: 3, date: '2030-01-20', name: 'Event 3', venue: 'Venue Z', status: 'danger', statusText: 'Cancelled', price: 100000 },
  { id: 4, date: '2030-04-05', name: 'Event 4', venue: 'Venue X', status: 'info', statusText: 'Played', price: 300000 },
];

const MONTH_BARS = [
  { label: 'Jan', value: 2 },
  { label: 'Feb', value: 4 },
  { label: 'Mar', value: 3 },
  { label: 'Apr', value: 5 },
  { label: 'May', value: 1 },
  { label: 'Jun', value: 6, current: true },
];
const YEAR_BARS = [
  { label: '2027', value: 10 },
  { label: '2028', value: 14 },
  { label: '2029', value: 12 },
  { label: '2030', value: 16, current: true },
];

type Show = 'both' | Theme;

export default function StyleguidePage() {
  const lang = useLang();
  const [show, setShow] = useState<Show>('both');
  const themes: Theme[] = show === 'both' ? ['dark', 'light'] : [show];
  return (
    <div className="sg">
      <header className="sg-top">
        <div>
          <p className="label">Dev only · not in navigation</p>
          <p className="sg-top-title">Styleguide</p>
        </div>
        <div className="sg-top-controls">
          <div className="segmented" role="group" aria-label="Show themes">
            {(['both', 'dark', 'light'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={show === value}
                onClick={() => setShow(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <LanguageButtons value={lang} onChange={setLanguage} />
          <ThemeToggle />
          <Link className={buttonClass({ size: 'sm' })} to="/">
            App
          </Link>
        </div>
      </header>
      {themes.map((theme) => (
        <div key={theme} data-theme={theme} className="sg-panel">
          <p className="sg-panel-name label">{theme} theme</p>
          <Showcase theme={theme} />
        </div>
      ))}
    </div>
  );
}

function Showcase({ theme }: { theme: Theme }) {
  const lang = useLang();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sort, setSort] = useState<{ key: 'date' | 'price'; dir: SortDirection }>({
    key: 'date',
    dir: 'asc',
  });
  const [money, setMoney] = useState('1 000');
  const [name, setName] = useState('');

  const sortedEvents = useMemo(() => {
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...DEMO_EVENTS].sort((a, b) =>
      sort.key === 'date'
        ? a.date.localeCompare(b.date) * factor
        : (a.price - b.price) * factor,
    );
  }, [sort]);
  const toggleSort = (key: 'date' | 'price') =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));

  const columns: DataTableColumn<DemoEvent>[] = [
    {
      key: 'date',
      label: 'Date',
      cell: (g) => <span className="mono">{g.date}</span>,
      sort: sort.key === 'date' ? sort.dir : undefined,
      onSort: () => toggleSort('date'),
    },
    { key: 'name', label: 'Event', primary: true, cell: (g) => <a href="#event">{g.name}</a> },
    { key: 'venue', label: 'Venue', cell: (g) => g.venue },
    {
      key: 'status',
      label: 'Status',
      cell: (g) => <StatusTag tone={g.status}>{g.statusText}</StatusTag>,
    },
    {
      key: 'price',
      label: 'Price',
      numeric: true,
      cell: (g) => formatMoney(g.price, lang),
      sort: sort.key === 'price' ? sort.dir : undefined,
      onSort: () => toggleSort('price'),
    },
    {
      key: 'actions',
      label: 'Actions',
      hideOnPhone: true,
      header: <span className="visually-hidden">Actions</span>,
      cell: (g) => <IconButton icon={Pencil} label={`Edit ${g.name}`} />,
    },
  ];
  const total = DEMO_EVENTS.reduce((sum, g) => sum + g.price, 0);

  return (
    <div className="sg-showcase">
      <PageHead
        title="Page title"
        subtitle={`4 events · ${formatMoney(total, lang)} · PageHead`}
        actions={<Button icon={Plus}>New event</Button>}
      />

      <SectionLabel>Logo</SectionLabel>
      <div className="sg-row">
        <Logo theme={theme} />
        <Logo theme={theme} size="large" />
      </div>

      <SectionLabel>Colour tokens</SectionLabel>
      <div className="sg-swatches">
        {COLOR_TOKENS.map(([token, use]) => (
          <div key={token} className="sg-swatch">
            <span className="sg-chip" style={{ background: `var(${token})` }} />
            <code className="mono small">{token}</code>
            <span className="meta">{use}</span>
          </div>
        ))}
        {STATUS_TOKENS.map((s) => (
          <div key={s} className="sg-swatch">
            <span
              className="sg-chip"
              style={{
                background: `var(--${s}-bg)`,
                borderColor: `var(--${s}-border)`,
                color: `var(--${s}-fg)`,
              }}
            >
              Aa
            </span>
            <code className="mono small">--{s}-fg / -bg / -border</code>
          </div>
        ))}
      </div>

      <LayoutShowcase theme={theme} />

      <SectionLabel>Typography</SectionLabel>
      <Card>
        <p className="sg-type-title">Page title · Afacad 700 uppercase 22 px</p>
        <h2>Heading h2 · Afacad 700 16 px</h2>
        <h3>Heading h3 · Afacad 700 14 px</h3>
        <p>Body text · Afacad 400 14 px. The quick brown fox jumps over the lazy dog. Åäö.</p>
        <p className="muted small">.muted .small · secondary text 12 px</p>
        <p className="label">.label · mono 10 px uppercase, wide spacing</p>
        <p className="meta">.meta · mono 10 px caption</p>
        <p className="stat-tile-value">12 345 €</p>
        <p className="mono">.mono · 2030-01-01 · 12:30</p>
      </Card>

      <SectionLabel>Spacing (--space-1 … --space-7)</SectionLabel>
      <div className="sg-spacing">
        {SPACING.map((n) => (
          <div key={n} className="sg-space">
            <span className="sg-space-bar" style={{ width: `var(--space-${n})` }} />
            <code className="meta">--space-{n}</code>
          </div>
        ))}
      </div>

      <SectionLabel>Buttons</SectionLabel>
      <div className="sg-row">
        <Button>Ghost</Button>
        <Button variant="primary">Primary</Button>
        <Button variant="danger" icon={Trash2}>
          Danger
        </Button>
        <Button icon={Plus}>With icon</Button>
        <Button size="sm">Small</Button>
        <Button disabled>Disabled</Button>
        <a className={buttonClass({ variant: 'primary' })} href="#link">
          Link as button
        </a>
      </div>
      <div className="sg-row">
        <IconButton icon={Pencil} label="Edit (plain IconButton)" />
        <IconButton icon={Download} label="Download (ghost IconButton)" variant="ghost" />
        <IconButton icon={Mail} label="With text" text="FI" />
        <div className="segmented" role="group" aria-label="Segmented demo">
          <button type="button" aria-pressed="true">
            List
          </button>
          <button type="button" aria-pressed="false">
            Calendar
          </button>
        </div>
      </div>
      <div className="sg-narrow">
        <Button block variant="primary">
          Block button
        </Button>
      </div>

      <SectionLabel>Form controls (Field + native inputs)</SectionLabel>
      <Card>
        <div className="form-row">
          <Field label="Text input" hint="Hint text under the control.">
            {(field) => (
              <input
                {...field}
                type="text"
                placeholder="Venue X"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Field label="With error" error="This field is required.">
            {(field) => <input {...field} type="text" defaultValue="" />}
          </Field>
          <Field label="Select">
            {(field) => (
              <select {...field} defaultValue="b">
                <option value="a">Person 1</option>
                <option value="b">Person 2</option>
              </select>
            )}
          </Field>
          <Field label="Money (MoneyInput)">
            {(field) => <MoneyInput {...field} value={money} onChange={setMoney} />}
          </Field>
          <Field label="Date">{(field) => <input {...field} type="date" defaultValue="2030-01-01" />}</Field>
          <Field label="Search">
            {(field) => <input {...field} type="search" placeholder="Search event, venue…" />}
          </Field>
        </div>
        <Field label="Textarea">{(field) => <textarea {...field} placeholder="Notes" />}</Field>
        <div className="check-grid">
          <label className="check">
            <input type="checkbox" defaultChecked /> Checkbox (label.check)
          </label>
          <label className="check">
            <input type="checkbox" /> Another option
          </label>
        </div>
        <div className="form-actions">
          <Button variant="primary">Save</Button>
          <Button>Cancel</Button>
        </div>
      </Card>

      <InlineShowcase />

      <SectionLabel>Status tags</SectionLabel>
      <div className="sg-row">
        {TONES.map(({ tone, text, use }) => (
          <span key={tone} className="sg-tag-demo">
            <StatusTag tone={tone}>{text}</StatusTag>
            <span className="meta">
              {tone} · {use}
            </span>
          </span>
        ))}
      </div>

      <SectionLabel>Notices</SectionLabel>
      <Notice tone="info">Info notice (default).</Notice>
      <Notice tone="ok">Saved.</Notice>
      <Notice tone="warn">Warning: the event is not fully staffed.</Notice>
      <Notice tone="danger">Error: saving failed.</Notice>

      <SectionLabel>Stat tiles + mini bars (StatGrid / StatTile)</SectionLabel>
      <StatGrid>
        <StatTile label="Events created" value="12" secondaryValue={formatMoney(1000000, lang)} secondaryCaption="Total value" bars={MONTH_BARS} barsCaption="Events per month, last 6 months" />
        <StatTile label="Average price · 2030" value={formatMoney(250000, lang)} bars={YEAR_BARS} barsCaption="Average per year" />
        <StatTile label="Hours · 2030" value="120 h" caption="Partner A 60 h · Partner B 60 h" />
        <StatTile label="Open tasks" value="3" caption="1 overdue" />
      </StatGrid>
      <Card label="MiniBars alone" title="Card with label, title and actions" actions={<Button size="sm">Action</Button>}>
        <MiniBars bars={YEAR_BARS} label="Events per year" height={64} />
      </Card>

      <SectionLabel>Data table (DataTable; phone &lt; 600 px = cards)</SectionLabel>
      <DataTable
        caption="Demo events"
        columns={columns}
        rows={sortedEvents}
        rowKey={(g) => g.id}
        footer={
          <tr>
            <td colSpan={4}>Total</td>
            <td className="num" data-label="Total">
              {formatMoney(total, lang)}
            </td>
            <td className="hide-phone" />
          </tr>
        }
      />
      <p className="meta sg-note">Empty state:</p>
      <DataTable caption="Empty" columns={columns} rows={[]} rowKey={(g) => g.id} empty="No events this year." />

      <SectionLabel>Excel table (ExcelTable: sort, column filters, column priorities)</SectionLabel>
      <p className="meta sg-note">
        Filter icon = Excel-style value list; accent when filtered. Phone: cards + Filters sheet. Local state here; pages
        use useUrlTableState().
      </p>
      <ExcelTableShowcase />

      <SectionLabel>Dialog (bottom sheet on phone)</SectionLabel>
      <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
      {dialogOpen && (
        <Dialog title="Delete event" onClose={() => setDialogOpen(false)}>
          <p>Event 1 at Venue X will be deleted. You can restore it from the deleted list.</p>
          <div className="form-actions">
            <Button variant="danger" icon={Trash2} onClick={() => setDialogOpen(false)}>
              Delete
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}

      <SectionLabel>Icons (lucide-react, 16 px, stroke 1.5)</SectionLabel>
      <div className="sg-row">
        {ICONS.map(([iconName, Icon]) => (
          <span key={iconName} className="sg-icon">
            <Icon />
            <span className="meta">{iconName}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
