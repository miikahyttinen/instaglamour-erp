// Styleguide sections for Layout v2: app shell (sidebar, drawer, top bar), type scale, layout
// spacing, StatGrid spans and FieldList. Synthetic data only (BR-090). English on purpose.
import { useRef, useState } from 'react';
import type { Language } from '../api/enums';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FieldList } from '../components/FieldList';
import { Field, MoneyInput } from '../components/fields';
import type { GridSpan } from '../components/grid';
import { InlineMoney, InlineSelect, InlineSwitch, InlineText } from '../components/inline';
import { SectionLabel } from '../components/SectionLabel';
import { StatGrid, StatTile } from '../components/StatTile';
import { NavDrawer } from '../layout/NavDrawer';
import { Sidebar } from '../layout/Sidebar';
import { TopbarControls } from '../layout/TopbarControls';
import { YearSelector } from '../layout/YearSelector';
import type { Theme } from '../theme/theme';

const TYPE_SCALE = [
  ['--fs-title', '22 px (phone 20)', 'Page title · Afacad 700 uppercase', 'sg-fs-title'],
  ['--fs-figure', '20 px', '12 345 €', 'sg-fs-figure'],
  ['--fs-lg', '16 px', 'Card / dialog title, secondary figure', 'sg-fs-lg'],
  ['--fs-body', '14 px', 'Body, table cells, inputs, nav', 'sg-fs-body'],
  ['--fs-small', '12 px', 'Secondary text, page subtitle', 'sg-fs-small'],
  ['--fs-label', '10 px', 'Mono label · 0.14em', 'label'],
  ['--fs-meta', '10 px', 'Mono caption', 'meta'],
] as const;

const LAYOUT_SPACE = [
  ['--page-pad', '16 → 40', 'container side padding'],
  ['--section-gap', '32 → 40', 'between sections (PageHead, SectionLabel, StatGrid)'],
  ['--card-pad', '16 → 20', 'card / tile padding, table cell x'],
  ['--grid-gap', '16', 'between tiles / cards'],
  ['--space-6', '32', 'page top (desktop)'],
] as const;

const SPAN_ROWS: { title: string; spans: GridSpan[] }[] = [
  { title: '12', spans: [12] },
  { title: '6 + 6', spans: [6, 6] },
  { title: '4 + 4 + 4', spans: [4, 4, 4] },
  { title: '8 + 4', spans: [8, 4] },
  { title: 'default (no span): 12 / 6 / 6 / 3', spans: [] },
  { title: '{ base: 6, sm: 4, lg: 2 } × 6', spans: Array<GridSpan>(6).fill({ base: 6, sm: 4, lg: 2 }) },
];

function spanText(span: GridSpan): string {
  return typeof span === 'number' ? `span ${span}` : JSON.stringify(span).replace(/"/g, '');
}

export function LayoutShowcase({ theme }: { theme: Theme }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lang, setLang] = useState<Language>('fi');
  const [year, setYear] = useState(2030);
  const [money, setMoney] = useState('1 000');
  const [demo, setDemo] = useState({ venue: 'Venue X', price: 200000, person: 'p1', loadIn: true });
  const closeRef = useRef<HTMLButtonElement>(null);
  const save = (patch: Partial<typeof demo>) =>
    new Promise<void>((resolve) => {
      setDemo((d) => ({ ...d, ...patch }));
      window.setTimeout(resolve, 300);
    });
  const account = {
    name: 'Partner A',
    language: lang,
    onLanguageChange: setLang,
    onSignOut: () => undefined,
  };

  return (
    <>
      <SectionLabel>App shell: sidebar, top bar, drawer</SectionLabel>
      <p className="meta sg-note-top">
        Sidebar ≥ 900 px (expanded 232 px / collapsed 64 px, stored in localStorage
        &apos;ig-sidebar&apos;); its bottom has only the collapse toggle. Desktop top bar: year ·
        language · theme · sign out (Layout v2.1). Phone: top bar ☰ · logo · year; ☰ opens the
        drawer, which has language, theme and sign out at the bottom.
      </p>
      <div className="sg-shell-row">
        {([false, true] as const).map((isCollapsed) => (
          <div
            key={String(isCollapsed)}
            className={['shell', 'sg-shell', isCollapsed && 'is-collapsed'].filter(Boolean).join(' ')}
          >
            <aside className="sidebar">
              <Sidebar
                theme={theme}
                variant="rail"
                collapsed={isCollapsed}
                onToggleCollapsed={() => undefined}
              />
            </aside>
            <div className="shell-body">
              <div className="topbar">
                <div className="topbar-inner">
                  <p className="topbar-context">{isCollapsed ? 'Collapsed' : 'Expanded'}</p>
                  <div className="topbar-end">
                    <YearSelector year={year} onChange={setYear} />
                    <TopbarControls {...account} theme={theme} />
                  </div>
                </div>
              </div>
              <div className="page-container sg-shell-page">
                <p className="meta">.page-container</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="sg-row">
        <Button onClick={() => setCollapsed((c) => !c)}>
          Interactive rail: {collapsed ? 'collapsed' : 'expanded'}
        </Button>
        <Button onClick={() => setDrawerOpen(true)}>Open drawer (phone)</Button>
      </div>
      <div className={['shell', 'sg-shell', 'sg-shell-single', collapsed && 'is-collapsed'].filter(Boolean).join(' ')}>
        <aside className="sidebar">
          <Sidebar
            theme={theme}
            variant="rail"
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((c) => !c)}
          />
        </aside>
        <div className="shell-body">
          <div className="page-container sg-shell-page">
            <p className="meta">Hover an icon when collapsed: tooltip = accessible name.</p>
          </div>
        </div>
      </div>
      {drawerOpen && (
        <NavDrawer onClose={() => setDrawerOpen(false)} initialFocus={closeRef}>
          <Sidebar
            account={account}
            theme={theme}
            variant="drawer"
            onClose={() => setDrawerOpen(false)}
            closeRef={closeRef}
            onNavigate={() => setDrawerOpen(false)}
          />
        </NavDrawer>
      )}

      <SectionLabel>Type scale (Layout v2)</SectionLabel>
      <Card flush>
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">Type scale</caption>
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">Size</th>
                <th scope="col">Sample</th>
              </tr>
            </thead>
            <tbody>
              {TYPE_SCALE.map(([token, size, sample, cls]) => (
                <tr key={token}>
                  <td>
                    <code className="mono small">{token}</code>
                  </td>
                  <td className="mono small">{size}</td>
                  <td>
                    <span className={cls}>{sample}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionLabel>Layout spacing</SectionLabel>
      <div className="sg-spacing">
        {LAYOUT_SPACE.map(([token, px, use]) => (
          <div key={token} className="sg-space">
            <span className="sg-space-bar" style={{ width: `var(${token})` }} />
            <code className="meta">
              {token} · {px} px · {use}
            </code>
          </div>
        ))}
      </div>

      <SectionLabel>StatGrid: 12 columns, spans</SectionLabel>
      {SPAN_ROWS.map(({ title, spans }) => (
        <div key={title}>
          <p className="meta sg-note-top">{title}</p>
          <StatGrid>
            {(spans.length > 0 ? spans : [undefined, undefined, undefined, undefined]).map((span, i) => (
              <StatTile
                key={i}
                span={span}
                label={span === undefined ? 'default' : spanText(span)}
                value={`${(i + 1) * 100} €`}
              />
            ))}
          </StatGrid>
        </div>
      ))}

      <SectionLabel>FieldList: one label column per section</SectionLabel>
      <Card title="Gig info (inline)">
        <FieldList>
          <InlineText label="Venue" required value={demo.venue} onSave={(venue) => save({ venue })} />
          <InlineMoney label="Price" required value={demo.price} onSave={(price) => save({ price })} />
          <InlineSelect
            label="Contact person"
            value={demo.person}
            options={[
              { value: 'p1', label: 'Person 1' },
              { value: 'p2', label: 'Person 2' },
            ]}
            onSave={(person) => save({ person })}
          />
          <InlineSwitch label="Joins load-in" value={demo.loadIn} onSave={(loadIn) => save({ loadIn })} />
        </FieldList>
      </Card>
      <Card title="Form (Field)" className="sg-card-gap">
        <FieldList labelWidth="sm">
          <Field label="Name" hint='labelWidth="sm"'>
            {(field) => <input {...field} type="text" placeholder="Person 1" />}
          </Field>
          <Field label="Fee">{(field) => <MoneyInput {...field} value={money} onChange={setMoney} />}</Field>
          <Field label="Date" error="This field is required.">
            {(field) => <input {...field} type="date" />}
          </Field>
        </FieldList>
      </Card>
    </>
  );
}
