import { textControlProps } from './controlProps';
import { InlineFieldFrame } from './InlineFieldFrame';
import type { InlineBaseProps } from './types';
import { useInlineSave, type InlineParseResult } from './useInlineSave';

/**
 * Native date input, value `YYYY-MM-DD`. Saves on blur / Enter (not on every picker change).
 * `required` → empty is REQUIRED and the value is a `string`; otherwise empty is saved as `null`.
 */
export type InlineDateProps = { min?: string; max?: string } & (
  | ({ required: true; value: string } & InlineBaseProps<string>)
  | ({ required?: false; value: string | null } & InlineBaseProps<string | null>)
);

export function InlineDate(props: InlineDateProps) {
  const required = props.required === true;
  const state = useInlineSave<string | null, string>({
    value: props.value,
    save: props.onSave as (next: string | null) => Promise<unknown>,
    validate: props.validate as InlineBaseProps<string | null>['validate'],
    field: props.field,
    disabled: props.disabled,
    toDraft: (v) => v ?? '',
    parse: (text): InlineParseResult<string | null> => {
      if (!text) return required ? { ok: false, error: 'REQUIRED' } : { ok: true, value: null };
      return /^\d{4}-\d{2}-\d{2}$/.test(text)
        ? { ok: true, value: text }
        : { ok: false, error: 'INVALID_DATE' };
    },
    equals: (a, b) => (a ?? '') === (b ?? ''),
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
        <input
          {...control}
          {...textControlProps(state)}
          type="date"
          min={props.min}
          max={props.max}
          disabled={props.disabled}
        />
      )}
    </InlineFieldFrame>
  );
}
