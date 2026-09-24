import type { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

/**
 * The action hierarchy: primary (filled, at most one per screen), secondary (outlined), text (a
 * plain violet link style) and danger (only for actions that destroy data). An `href` renders a
 * link with the same look, for actions that leave the app.
 */
export function Button({
  variant = 'secondary',
  children,
  onClick,
  href,
  type = 'button',
  disabled,
}: {
  variant?: ButtonVariant;
  children: ReactNode;
  onClick?: (() => void) | undefined;
  href?: string | undefined;
  type?: 'button' | 'submit';
  disabled?: boolean | undefined;
}) {
  const className = `ui-btn ui-btn-${variant}`;
  if (href !== undefined) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
