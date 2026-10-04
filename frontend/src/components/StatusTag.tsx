import type { ReactNode } from 'react';

/**
 * info: Sold / Played · ok: Done / Paid · warn: Overdue / Not fully staffed / contract warnings ·
 * danger: Cancelled / Deleted · muted: inactive, neutral facts.
 */
export type StatusTone = 'info' | 'ok' | 'warn' | 'danger' | 'muted';

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
