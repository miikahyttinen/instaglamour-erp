export type ButtonVariant = 'ghost' | 'primary' | 'danger';
export type ButtonSize = 'md' | 'sm';

export interface ButtonStyle {
  /** ghost (default): outline; primary: solid accent; danger: outline in danger colours. */
  variant?: ButtonVariant;
  /** sm = compact (in table rows, cards). Phones still get a 44 px touch target. */
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  className?: string;
}

/** Class names for a button look — use on <a> / <Link> that should look like a button. */
export function buttonClass({ variant = 'ghost', size = 'md', block, className }: ButtonStyle = {}) {
  return ['btn', `btn-${variant}`, size === 'sm' && 'btn-sm', block && 'btn-block', className]
    .filter(Boolean)
    .join(' ');
}
