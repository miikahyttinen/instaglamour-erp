import type { ReactNode } from 'react';

export interface PageHeadProps {
  /** Page title (h1). Shown uppercase by CSS; pass normal-case text (tests and screen readers see it). */
  title: string;
  /** One mono line under the title, e.g. a year summary. */
  subtitle?: ReactNode;
  /** Right-side actions, normally one ghost Button (e.g. "+ New gig"). */
  actions?: ReactNode;
  /** Optional extra content inside the head, above the divider (e.g. a back link). */
  children?: ReactNode;
}

/** Page title block with a full-width divider below. One per page. */
export function PageHead({ title, subtitle, actions, children }: PageHeadProps) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {children}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
