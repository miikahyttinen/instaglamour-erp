import type { ReactNode } from 'react';

export interface CardProps {
  /** Element to render (default `section`). */
  as?: 'section' | 'div' | 'article';
  /** Small mono uppercase label at the top. */
  label?: string;
  /** Heading (h2) under / instead of the label. */
  title?: string;
  /** Right-aligned controls in the card head (e.g. a small ghost Button). */
  actions?: ReactNode;
  /** No inner padding — for a DataTable or list that runs edge to edge. */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Surface panel: --surface, 1 px hairline border, 2 px radius, no shadow. */
export function Card({ as: Tag = 'section', label, title, actions, flush, className, children }: CardProps) {
  const hasHead = label || title || actions;
  return (
    <Tag className={['card', flush && 'card-flush', className].filter(Boolean).join(' ')}>
      {hasHead && (
        <div className="card-head">
          <div className="card-head-text">
            {label && <p className="label">{label}</p>}
            {title && <h2 className="card-title">{title}</h2>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
