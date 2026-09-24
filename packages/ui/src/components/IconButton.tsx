import type { ReactNode } from 'react';

/** The one shape for header and toolbar icons (settings, share, the meta link, filters). The
 * label is required: it is the accessible name and the tooltip. `active` shows a dot, for a
 * control whose state is on (filters applied). */
export function IconButton({
  label,
  children,
  onClick,
  href,
  active,
}: {
  label: string;
  children: ReactNode;
  onClick?: (() => void) | undefined;
  href?: string | undefined;
  active?: boolean | undefined;
}) {
  const className = `ui-icon-btn${active ? ' active' : ''}`;
  if (href !== undefined) {
    return (
      <a className={className} href={href} aria-label={label} title={label}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={className} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}
