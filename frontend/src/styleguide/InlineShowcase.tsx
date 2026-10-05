// Styleguide section for the inline fields (NFR-8). Synthetic data only (BR-090).
import { useState } from 'react';
import { ApiError } from '../api/client';
import type { FieldCode } from '../api/enums';
import { Card } from '../components/Card';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import {
  InlineCheckbox,
  InlineCheckboxGroup,
  InlineDate,
  InlineFieldFrame,
  InlineHours,
  InlineMoney,
  InlineSelect,
  InlineSwitch,
  InlineText,
  InlineTextarea,
  type InlineStatus,
} from '../components/inline';
import { SectionLabel } from '../components/SectionLabel';

const DEMO_DELAY_MS = 600;

type Setup = 'PA' | 'LIGHTS' | 'VAN';
const SETUP_OPTIONS: { value: Setup; label: string }[] = [
  { value: 'PA', label: 'PA system' },
  { value: 'LIGHTS', label: 'Lights' },
  { value: 'VAN', label: 'Van' },
];
const PEOPLE = [
  { value: null, label: '–' },
  { value: 'p1', label: 'Person 1' },
  { value: 'p2', label: 'Person 2' },
  { value: 'p3', label: 'Person 3', disabled: true },
] as const;

interface DemoValues {
  venue: string;
  notes: string | null;
  price: number;
  budget: number | null;
  hours: number;
  dueDate: string | null;
  person: 'p1' | 'p2' | 'p3' | null;
  active: boolean;
  loadIn: boolean;
  setup: Setup[];
}

const INITIAL: DemoValues = {
  venue: 'Venue X',
  notes: 'Load-in at the back door.',
  price: 200000,
  budget: null,
  hours: 1.5,
  dueDate: '2030-03-01',
  person: 'p1',
  active: true,
  loadIn: false,
  setup: ['PA'],
};

interface DemoRow {
  id: number;
  name: string;
  budget: number | null;
  actual: number | null;
}

const STATIC_STATES: { status: InlineStatus; title: string; className?: string; error?: string }[] = [
  { status: 'idle', title: 'Idle (quiet value)' },
  { status: 'idle', title: 'Hover (hairline)', className: 'sg-force-hover' },
  { status: 'idle', title: 'Focus (input style)', className: 'sg-force-focus' },
  { status: 'saving', title: 'Saving' },
  { status: 'saved', title: 'Saved (~1.5 s)' },
  { status: 'error', title: 'Error', error: 'Text is too long.' },
];

/** Every inline component, interactive (saves after a short delay, optionally failing). */
export function InlineShowcase() {
  const [values, setValues] = useState<DemoValues>(INITIAL);
  const [fail, setFail] = useState(false);
  const [rows, setRows] = useState<DemoRow[]>([
    { id: 1, name: 'Category A', budget: 100000, actual: 80000 },
    { id: 2, name: 'Category B', budget: null, actual: null },
  ]);

  /** Fake API call: resolves after a delay, or fails with a VALIDATION_ERROR for `field`. */
  const fakeSave = (field: string, code: FieldCode = 'INVALID_VALUE') =>
    new Promise<void>((resolve, reject) =>
      setTimeout(
        () =>
          fail
            ? reject(new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', { [field]: code }))
            : resolve(),
        DEMO_DELAY_MS,
      ),
    );
  const saver =
    <K extends keyof DemoValues>(key: K) =>
    async (next: DemoValues[K]) => {
      await fakeSave(key);
      setValues((v) => ({ ...v, [key]: next }));
    };
  const saveRow = (id: number, key: 'budget' | 'actual') => async (next: number | null) => {
    await fakeSave(key);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: next } : r)));
  };

  const columns: DataTableColumn<DemoRow>[] = [
    { key: 'name', label: 'Category', primary: true, cell: (r) => r.name },
    {
      key: 'budget',
      label: 'Budget',
      numeric: true,
      cell: (r) => (
        <InlineMoney label={`Budget, ${r.name}`} hideLabel value={r.budget} placeholder="–" onSave={saveRow(r.id, 'budget')} />
      ),
    },
    {
      key: 'actual',
      label: 'Actual',
      numeric: true,
      cell: (r) => (
        <InlineMoney
          label={`Actual, ${r.name}`}
          hideLabel
          value={r.actual}
          placeholder="–"
          disabled={r.id === 2}
          onSave={saveRow(r.id, 'actual')}
        />
      ),
    },
  ];

  return (
    <>
      <SectionLabel>Inline editing (save on blur)</SectionLabel>
      <p className="muted small sg-note-top">
        Blur or Enter saves (Ctrl/Cmd+Enter in the textarea), Esc reverts, unchanged values are
        not sent. Selects, checkboxes and switches save on change. Saves here take{' '}
        {DEMO_DELAY_MS} ms.
      </p>
      <label className="check sg-fail-toggle">
        <input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />
        Make saves fail (VALIDATION_ERROR → translated field error)
      </label>

      <Card label="Every component · interactive">
        <div className="sg-inline-grid">
          <InlineText label="InlineText · venue" required value={values.venue} maxLength={40} onSave={saver('venue')} />
          <InlineMoney label="InlineMoney · price (required)" required value={values.price} onSave={saver('price')} />
          <InlineMoney label="InlineMoney · budget (optional)" value={values.budget} placeholder="–" onSave={saver('budget')} />
          <InlineHours label="InlineHours · hours" value={values.hours} hint="0.25 steps, 0.25–24" onSave={saver('hours')} />
          <InlineDate label="InlineDate · due date" value={values.dueDate} onSave={saver('dueDate')} />
          <InlineSelect label="InlineSelect · person" value={values.person} options={PEOPLE} onSave={saver('person')} />
          <InlineTextarea label="InlineTextarea · notes" value={values.notes} placeholder="Notes" onSave={saver('notes')} className="sg-inline-wide" />
          <InlineCheckboxGroup
            label="InlineCheckboxGroup · setup"
            value={values.setup}
            options={SETUP_OPTIONS}
            validate={(v) => (v.length ? null : 'REQUIRED')}
            onSave={saver('setup')}
            className="sg-inline-wide"
          />
          <InlineCheckbox label="InlineCheckbox · active" value={values.active} onSave={saver('active')} />
          <InlineSwitch label="InlineSwitch · joins load-in" value={values.loadIn} onSave={saver('loadIn')} />
          <InlineText label="Disabled" value="Venue Y" disabled onSave={async () => {}} />
          <InlineSwitch label="Disabled switch" value disabled onSave={async () => {}} />
        </div>
      </Card>

      <Card label="States (static)">
        <div className="sg-inline-grid">
          {STATIC_STATES.map((s) => (
            <InlineFieldFrame
              key={s.title}
              label={s.title}
              status={s.status}
              error={s.error ?? null}
              className={s.className}
            >
              {(control) => <input {...control} type="text" readOnly value="Venue X" />}
            </InlineFieldFrame>
          ))}
          <InlineFieldFrame label="Disabled" status="idle" error={null} disabled>
            {(control) => <input {...control} type="text" disabled value="Venue X" />}
          </InlineFieldFrame>
        </div>
      </Card>

      <p className="meta sg-note">In a table (hideLabel; phone = cards):</p>
      <DataTable caption="Inline demo rows" columns={columns} rows={rows} rowKey={(r) => r.id} />
    </>
  );
}
