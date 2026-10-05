import { textControlProps } from './controlProps';
import { InlineFieldFrame } from './InlineFieldFrame';
import type { InlineBaseProps } from './types';
import { useInlineSave, type InlineParseResult } from './useInlineSave';

interface TextOwnProps {
  /** Max length after trimming (→ TOO_LONG). */
  maxLength?: number;
  placeholder?: string;
  autoComplete?: string;
}

/**
 * `required` → the value is a `string` and empty text is REQUIRED; otherwise empty text is
 * saved as `null`. Text is trimmed before saving.
 */
export type InlineTextProps = TextOwnProps &
  (
    | ({ required: true; value: string } & InlineBaseProps<string>)
    | ({ required?: false; value: string | null } & InlineBaseProps<string | null>)
  );

const textEquals = (a: string | null, b: string | null) => (a ?? '') === (b ?? '');

function useTextField(props: InlineTextProps) {
  const { required, maxLength } = props;
  return useInlineSave<string | null, string>({
    value: props.value,
    save: props.onSave as (next: string | null) => Promise<unknown>,
    validate: props.validate as InlineBaseProps<string | null>['validate'],
    field: props.field,
    disabled: props.disabled,
    toDraft: (v) => v ?? '',
    parse: (d): InlineParseResult<string | null> => {
      const text = d.trim();
      if (!text) return required ? { ok: false, error: 'REQUIRED' } : { ok: true, value: null };
      if (maxLength !== undefined && text.length > maxLength) return { ok: false, error: 'TOO_LONG' };
      return { ok: true, value: text };
    },
    equals: textEquals,
  });
}

/** Single-line text. Blur or Enter saves, Esc reverts. */
export function InlineText(props: InlineTextProps) {
  const state = useTextField(props);
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
          type="text"
          placeholder={props.placeholder}
          autoComplete={props.autoComplete ?? 'off'}
          disabled={props.disabled}
        />
      )}
    </InlineFieldFrame>
  );
}

export type InlineTextareaProps = InlineTextProps & { rows?: number };

/** Multi-line text. Blur or Ctrl/Cmd+Enter saves (Enter = new line), Esc reverts. */
export function InlineTextarea(props: InlineTextareaProps) {
  const state = useTextField(props);
  return (
    <InlineFieldFrame
      label={props.label}
      hideLabel={props.hideLabel}
      hint={props.hint}
      className={props.className}
      status={state.status}
      error={state.error}
      disabled={props.disabled}
      multiline
    >
      {(control) => (
        <textarea
          {...control}
          {...textControlProps(state, true)}
          rows={props.rows ?? 2}
          placeholder={props.placeholder}
          disabled={props.disabled}
        />
      )}
    </InlineFieldFrame>
  );
}
