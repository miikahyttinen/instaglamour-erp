import { useLang } from '../../i18n/useLang';
import { centsToInput } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { textControlProps } from './controlProps';
import { InlineFieldFrame } from './InlineFieldFrame';
import type { InlineBaseProps } from './types';
import { useInlineSave, type InlineParseResult } from './useInlineSave';

/**
 * Euro input, value in integer cents. FI `1234,50` / EN `1234.50` (grouping and `€` accepted).
 * Negative → NEGATIVE_AMOUNT, unparsable → INVALID_VALUE. `required` → empty is REQUIRED and the
 * value is a `number`; otherwise empty is saved as `null`.
 */
export type InlineMoneyProps = { placeholder?: string } & (
  | ({ required: true; value: number } & InlineBaseProps<number>)
  | ({ required?: false; value: number | null } & InlineBaseProps<number | null>)
);

export function InlineMoney(props: InlineMoneyProps) {
  const lang = useLang();
  const required = props.required === true;
  const state = useInlineSave<number | null, string>({
    value: props.value,
    save: props.onSave as (next: number | null) => Promise<unknown>,
    validate: props.validate as InlineBaseProps<number | null>['validate'],
    field: props.field,
    disabled: props.disabled,
    formatKey: lang,
    toDraft: (cents) => (cents === null ? '' : centsToInput(cents, lang)),
    parse: (text): InlineParseResult<number | null> => {
      const { cents, error } = parseMoneyField(text, lang, required);
      return error ? { ok: false, error } : { ok: true, value: cents };
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
          <span aria-hidden="true">€</span>
        </span>
      )}
    </InlineFieldFrame>
  );
}
