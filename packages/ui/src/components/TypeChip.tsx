import type { CSSProperties } from 'react';
import { typeColor, typeInk } from '../type.ts';

function capitalize(s: string): string {
  return s.length === 0 ? s : s.slice(0, 1).toUpperCase() + s.slice(1);
}

/** The one way a type is shown anywhere: a small chip in the type's color. */
export function TypeChip({ type, small }: { type: string; small?: boolean | undefined }) {
  return (
    <span
      className={`tchip${small ? ' tchip-sm' : ''}`}
      style={{ '--c': typeColor(type), '--t': typeInk(type) } as CSSProperties}
    >
      {capitalize(type)}
    </span>
  );
}

export function TypeChips({ types, small }: { types: string[]; small?: boolean | undefined }) {
  return (
    <span className="tchips">
      {types.map((t) => (
        <TypeChip key={t} type={t} small={small} />
      ))}
    </span>
  );
}
