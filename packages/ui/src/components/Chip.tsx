import type { ReactNode } from 'react';

export function Chip({
  on,
  onClick,
  children,
}: {
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`chip${on ? ' on' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
