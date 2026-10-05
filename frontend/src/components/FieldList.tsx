import type { ReactNode } from 'react';

export interface FieldListProps {
  /**
   * Width of the label column from 600 px: sm 120 px, md 160 px (default, `--label-w`),
   * lg 200 px. Use one width per section so labels and inputs line up.
   */
  labelWidth?: 'sm' | 'md' | 'lg';
  className?: string;
  /** `Field`s and inline fields (`InlineText`, `InlineMoney`, …), one per row. */
  children: ReactNode;
}

/**
 * Label column + control column for a section of fields (Layout v2 "Forms/inline fields").
 * Phones: label above the control. From 600 px: label left (fixed width, centred on the
 * control row), control, hint and error right. Checkboxes and switches sit in the control column.
 */
export function FieldList({ labelWidth = 'md', className, children }: FieldListProps) {
  return (
    <div
      className={['field-list', labelWidth !== 'md' && `field-list-${labelWidth}`, className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
