import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { buttonClass, type ButtonStyle } from './buttonClass';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyle {
  /** Leading icon (lucide-react component, e.g. `Plus`). */
  icon?: LucideIcon;
}

/** Mono uppercase button. `type` defaults to "button". */
export function Button({
  variant,
  size,
  block,
  className,
  icon: Icon,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClass({ variant, size, block, className })} {...rest}>
      {Icon && <Icon className="btn-icon" />}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Accessible name (also the tooltip). Required: the button has no visible text. */
  label: string;
  /** plain (default): no border, for headers/toolbars; ghost: with the button outline. */
  variant?: 'plain' | 'ghost';
  /** Optional short visible text after the icon (e.g. a language code). */
  text?: string;
}

/** Square icon-only button (44 px touch target on phones, 36 px on desktop). */
export function IconButton({
  icon: Icon,
  label,
  variant = 'plain',
  text,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={['icon-btn', variant === 'ghost' && 'icon-btn-ghost', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <Icon />
      {text && (
        <span className="icon-btn-text" aria-hidden="true">
          {text}
        </span>
      )}
    </button>
  );
}
