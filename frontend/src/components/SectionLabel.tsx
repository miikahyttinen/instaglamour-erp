import type { ReactNode } from 'react';

export interface SectionLabelProps {
  /** Heading level / element (default h2). Pick the one that fits the outline. */
  as?: 'h2' | 'h3' | 'p';
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Mono uppercase label above a group of cards / a table ("OPEN EVENTS"-style). */
export function SectionLabel({ as: Tag = 'h2', id, className, children }: SectionLabelProps) {
  return (
    <Tag id={id} className={['section-label', className].filter(Boolean).join(' ')}>
      {children}
    </Tag>
  );
}
