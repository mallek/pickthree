import type { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger' | 'win' | 'loss' | 'warn';

/**
 * The action hierarchy: primary (filled, at most one per screen), secondary (outlined), text (a
 * plain violet link style) and danger (only for actions that destroy data). The outcome variants
 * (win, loss, warn: the amber one, for a tanked battle) are for recording a result, the outcome
 * color supporting the label; `pressed` marks the chosen one where a tap selects rather than acts.
 * An `href` renders a link with the same look, for actions that leave the app. The primary fill
 * is a gradient, which axe cannot measure; `data-audit-contrast="static"` tells the page audit its
 * contrast is checked by a unit test instead (test/contrast.test.ts).
 */
export function Button({
  variant = 'secondary',
  children,
  onClick,
  href,
  type = 'button',
  disabled,
  ariaExpanded,
  pressed,
}: {
  variant?: ButtonVariant;
  children: ReactNode;
  onClick?: (() => void) | undefined;
  href?: string | undefined;
  type?: 'button' | 'submit';
  disabled?: boolean | undefined;
  /** For a button that expands or collapses a section in place, such as "Show all" / "Show less". */
  ariaExpanded?: boolean | undefined;
  /** For one of a set of buttons where a tap selects: rendered as aria-pressed. */
  pressed?: boolean | undefined;
}) {
  const className = `ui-btn ui-btn-${variant}`;
  const audit = variant === 'primary' ? { 'data-audit-contrast': 'static' } : {};
  if (href !== undefined) {
    return (
      <a className={className} href={href} {...audit}>
        {children}
      </a>
    );
  }
  return (
    <button
      type={type}
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-expanded={ariaExpanded}
      aria-pressed={pressed}
      {...audit}
    >
      {children}
    </button>
  );
}
