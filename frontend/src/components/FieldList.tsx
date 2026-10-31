import type { ReactNode } from 'react';

export interface FieldListProps {
  /**
   * Width of the label column from 600 px: sm 120 px, md 160 px (default, `--label-w`),
   * lg 200 px (phones: 104 px for all). Use one width per section so labels and inputs line up.
   */
  labelWidth?: 'sm' | 'md' | 'lg';
  className?: string;
  /** `Field`s and inline fields (`InlineText`, `InlineMoney`, …), one per row. */
  children: ReactNode;
}

/**
 * Label column + control column for a section of fields (Layout v2 "Forms/inline fields"):
 * label left (fixed width, centred on the control row), control, hint and error right — at every
 * width (compact density, TASK-175; a narrower label column on phones). Checkboxes and switches
 * sit in the control column.
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

/**
 * Two small related fields of a `FieldList` (e.g. seller + producer) side by side when the list is
 * wide enough (container ≥ 680 px), each with its own label | control; otherwise they are two
 * normal rows. Compact density (design.md, TASK-175).
 */
export function FieldPair({ children }: { children: ReactNode }) {
  return <div className="field-list-pair">{children}</div>;
}
