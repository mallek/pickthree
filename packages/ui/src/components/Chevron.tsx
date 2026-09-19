import type { CSSProperties } from 'react';

const CHEVRON_TURN: Record<'right' | 'left' | 'down' | 'up', CSSProperties | undefined> = {
  right: undefined,
  left: { transform: 'scaleX(-1)' },
  down: { transform: 'rotate(90deg)' },
  up: { transform: 'rotate(-90deg)' },
};

export function Chevron({ dir = 'right' }: { dir?: 'right' | 'left' | 'down' | 'up' }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={CHEVRON_TURN[dir]}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
