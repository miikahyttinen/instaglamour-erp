import { useLang } from '../../i18n/useLang';
import { hoursToInput, isValidHours, parseHours } from '../../lib/hours';
import { textControlProps } from './controlProps';
import { InlineFieldFrame } from './InlineFieldFrame';
import type { InlineBaseProps } from './types';
import { useInlineSave, type InlineParseResult } from './useInlineSave';

/** Hours (number), 0.25…24 in 0.25 steps (BR-050) → else INVALID_HOURS; empty → REQUIRED. */
export type InlineHoursProps = InlineBaseProps<number> & { value: number; placeholder?: string };

export function InlineHours(props: InlineHoursProps) {
  const lang = useLang();
  const state = useInlineSave<number, string>({
    value: props.value,
    save: props.onSave,
    validate: props.validate,
    field: props.field,
    disabled: props.disabled,
    formatKey: lang,
    toDraft: (hours) => hoursToInput(hours, lang),
    parse: (text): InlineParseResult<number> => {
      if (!text.trim()) return { ok: false, error: 'REQUIRED' };
      const hours = parseHours(text);
      return hours === null || !isValidHours(hours)
        ? { ok: false, error: 'INVALID_HOURS' }
        : { ok: true, value: hours };
    },
  });
  return (
    <InlineFieldFrame
      label={props.label}
      hideLabel={props.hideLabel}
      hint={props.hint}
      className={props.className ? `inline-numeric ${props.className}` : 'inline-numeric'}
      status={state.status}
      error={state.error}
      disabled={props.disabled}
    >
      {(control) => (
        <span className="inline-unit">
          <input
            {...control}
            {...textControlProps(state)}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={props.placeholder}
            disabled={props.disabled}
          />
          <span aria-hidden="true">h</span>
        </span>
      )}
    </InlineFieldFrame>
  );
}
