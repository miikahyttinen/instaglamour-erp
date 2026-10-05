import { useId } from 'react';
import { InlineAnnouncer, InlineStateIcon } from './InlineFieldFrame';
import type { InlineBaseProps } from './types';
import { useInlineSave } from './useInlineSave';

export type InlineCheckboxProps = InlineBaseProps<boolean> & { value: boolean };

function InlineToggle({ asSwitch, ...props }: InlineCheckboxProps & { asSwitch: boolean }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const state = useInlineSave<boolean>({
    value: props.value,
    save: props.onSave,
    validate: props.validate,
    field: props.field,
    disabled: props.disabled,
  });
  const error = state.status === 'error' ? state.error : null;
  const describedBy = [error ? errorId : null, props.hint ? hintId : null].filter(Boolean).join(' ');
  const classes = [
    'inline-field',
    'inline-check',
    `is-${state.status}`,
    props.disabled ? 'is-disabled' : null,
    props.className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <div className="inline-control">
        <label className={asSwitch ? 'switch inline-switch' : 'check'}>
          <input
            type="checkbox"
            role={asSwitch ? 'switch' : undefined}
            checked={state.draft}
            disabled={props.disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onChange={(e) => void state.commit(e.target.checked)}
            onBlur={() => {
              if (state.status === 'error') void state.commit();
            }}
          />
          <span className={props.hideLabel ? 'visually-hidden' : undefined}>{props.label}</span>
        </label>
        <InlineStateIcon status={state.status} />
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
    </div>
  );
}

/** Checkbox with its label on the right. Saves immediately on change. */
export function InlineCheckbox(props: InlineCheckboxProps) {
  return <InlineToggle {...props} asSwitch={false} />;
}

/** Same as `InlineCheckbox`, drawn as a switch (`role="switch"`). Saves immediately on change. */
export function InlineSwitch(props: InlineCheckboxProps) {
  return <InlineToggle {...props} asSwitch />;
}
