import type { ReactNode } from 'react';

/**
 * info: Upcoming gig / Open / Partly invoiced · ok: Played gig / Done / Invoice row sent ·
 * ok-strong (solid dark green): Fully invoiced · warn: Overdue / Not fully staffed / contract warnings ·
 * yellow: Open invoices / invoice row not sent (distinct from the amber warn) ·
 * purple: currently unused (token kept) · danger: Cancelled / Deleted · muted: inactive, neutral facts.
 */
export type StatusTone = 'info' | 'ok' | 'ok-strong' | 'warn' | 'yellow' | 'purple' | 'danger' | 'muted';

export interface StatusTagProps {
  tone?: StatusTone;
  /** Translated label. */
  children: ReactNode;
  title?: string;
  className?: string;
}

/** Mono uppercase tag with a 1 px border and tinted background. Default tone: muted. */
export function StatusTag({ tone = 'muted', children, title, className }: StatusTagProps) {
  return (
    <span className={['tag', `tag-${tone}`, className].filter(Boolean).join(' ')} title={title}>
      {children}
    </span>
  );
}
