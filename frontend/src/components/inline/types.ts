import type { InlineValidate } from './useInlineSave';

/** Props shared by every inline component. */
export interface InlineBaseProps<T> {
  /** Field label. Always rendered (visually hidden with `hideLabel`, e.g. in table cells). */
  label: string;
  hideLabel?: boolean;
  /** Saves the new value; return the API call's promise (reject = error state). */
  onSave: (next: T) => Promise<unknown>;
  /** Client-side check before sending; return a FieldCode to block the save. */
  validate?: InlineValidate<T>;
  disabled?: boolean;
  /** API field name, to pick its code from a VALIDATION_ERROR (default: the first field). */
  field?: string;
  /** Muted help text under the field. */
  hint?: string;
  className?: string;
}
