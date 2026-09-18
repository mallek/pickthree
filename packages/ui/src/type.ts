export const TYPES: readonly string[] = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
];

/** A type's paint. Unknown types (a bad CSV cell, a future type) fall back to the neutral token
 * rather than an undefined CSS variable. */
export function typeColor(type: string): string {
  return TYPES.includes(type) ? `var(--type-${type})` : 'var(--muted)';
}

/** A type's chip text colour, the same fallback rule as typeColor above but reading the -ink
 * token instead of the fill. */
export function typeInk(type: string): string {
  return TYPES.includes(type) ? `var(--type-${type}-ink)` : 'var(--muted)';
}
