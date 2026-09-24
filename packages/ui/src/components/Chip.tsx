import type { ReactNode } from 'react';

/** A tappable filter pill, 44px tall. `on` makes it a toggle and reports aria-pressed; leave it
 * out for a chip that is a plain action. Chips are tapped; for read-only labels use Tag. */
export function Chip({
  on,
  onClick,
  children,
}: {
  on?: boolean | undefined;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`chip${on ? ' on' : ''}`}
      aria-pressed={on === undefined ? undefined : on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
