import { useId } from 'react';
import { InlineAnnouncer, InlineStateIcon } from './InlineFieldFrame';
import type { InlineBaseProps } from './types';
import { useInlineSave } from './useInlineSave';

export interface InlineCheckboxOption<V extends string> {
  value: V;
  label: string;
}

export type InlineCheckboxGroupProps<V extends string> = InlineBaseProps<V[]> & {
  /** Checked values (order does not matter). */
  value: readonly V[];
  options: readonly InlineCheckboxOption<V>[];
};

const sameSet = <V,>(a: readonly V[], b: readonly V[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

/**
 * Multi-select as checkboxes (e.g. technical setup). Every change saves the whole list, in
 * `options` order. For "at least one", pass `validate={(v) => (v.length ? null : 'REQUIRED')}`.
 */
export function InlineCheckboxGroup<V extends string>(props: InlineCheckboxGroupProps<V>) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const state = useInlineSave<V[]>({
    value: [...props.value],
    save: props.onSave,
    validate: props.validate,
    field: props.field,
    disabled: props.disabled,
    equals: sameSet,
  });
  const error = state.status === 'error' ? state.error : null;
  const describedBy = [error ? errorId : null, props.hint ? hintId : null].filter(Boolean).join(' ');
  const classes = [
    'inline-field',
    'check-group',
    'inline-check-group',
    `is-${state.status}`,
    props.disabled ? 'is-disabled' : null,
    props.className,
  ]
    .filter(Boolean)
    .join(' ');

  const toggle = (value: V, checked: boolean) => {
    const next = props.options
      .map((o) => o.value)
      .filter((v) => (v === value ? checked : state.draft.includes(v)));
    void state.commit(next);
  };

  return (
    <fieldset
      className={classes}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy || undefined}
      disabled={props.disabled}
      onBlur={(e) => {
        if (state.status === 'error' && !e.currentTarget.contains(e.relatedTarget as Node | null)) {
          void state.commit();
        }
      }}
    >
      <legend className={props.hideLabel ? 'visually-hidden' : undefined}>
        <span>{props.label}</span>
        <InlineStateIcon status={state.status} />
      </legend>
      <div className="check-grid">
        {props.options.map((o) => (
          <label key={o.value} className="check">
            <input
              type="checkbox"
              checked={state.draft.includes(o.value)}
              onChange={(e) => toggle(o.value, e.target.checked)}
            />
            {o.label}
          </label>
        ))}
      </div>
      {props.hint && (
        <p id={hintId} className="muted small field-hint">
          {props.hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
      <InlineAnnouncer label={props.label} status={state.status} error={state.error} />
    </fieldset>
  );
}
