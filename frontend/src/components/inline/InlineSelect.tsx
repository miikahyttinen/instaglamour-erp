import { InlineFieldFrame } from './InlineFieldFrame';
import type { InlineBaseProps } from './types';
import { useInlineSave } from './useInlineSave';

export type InlineOptionValue = string | number | null;

export interface InlineSelectOption<V extends InlineOptionValue> {
  value: V;
  label: string;
  disabled?: boolean;
}

export type InlineSelectProps<V extends InlineOptionValue> = InlineBaseProps<V> & {
  value: V;
  /** Must include the current value. Use `{ value: null, label: '–' }` for "none". */
  options: readonly InlineSelectOption<V>[];
};

const optionKey = (value: InlineOptionValue) => (value === null ? '' : String(value));

/** Native select. Saves immediately on change; after an error, blur retries. */
export function InlineSelect<V extends InlineOptionValue>(props: InlineSelectProps<V>) {
  const state = useInlineSave<V>({
    value: props.value,
    save: props.onSave,
    validate: props.validate,
    field: props.field,
    disabled: props.disabled,
  });
  return (
    <InlineFieldFrame
      label={props.label}
      hideLabel={props.hideLabel}
      hint={props.hint}
      className={props.className}
      status={state.status}
      error={state.error}
      disabled={props.disabled}
    >
      {(control) => (
        <select
          {...control}
          value={optionKey(state.draft)}
          disabled={props.disabled}
          onChange={(e) => {
            const option = props.options.find((o) => optionKey(o.value) === e.target.value);
            if (option) void state.commit(option.value);
          }}
          onBlur={() => {
            if (state.status === 'error') void state.commit();
          }}
        >
          {props.options.map((o) => (
            <option key={optionKey(o.value)} value={optionKey(o.value)} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </InlineFieldFrame>
  );
}
