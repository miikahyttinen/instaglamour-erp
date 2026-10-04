import type { ReactNode } from 'react';

export type NoticeTone = 'info' | 'ok' | 'warn' | 'danger';

export interface NoticeProps {
  tone?: NoticeTone;
  /** `alert` for errors that appear after an action, `status` for polite updates. */
  role?: 'alert' | 'status' | 'note';
  className?: string;
  children: ReactNode;
}

/** Inline message box in status colours. Same look as the `.notice` / `.notice-*` classes. */
export function Notice({ tone = 'info', role, className, children }: NoticeProps) {
  return (
    <div className={['notice', `notice-${tone}`, className].filter(Boolean).join(' ')} role={role}>
      {children}
    </div>
  );
}
