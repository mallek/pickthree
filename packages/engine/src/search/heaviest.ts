import type { MatrixView } from './matrixView.js';

/** The k heaviest matrix columns, heaviest first; ties keep column order. */
export function heaviestColumns(
  view: MatrixView,
  weights: ReadonlyMap<string, number>,
  k: number,
): number[] {
  return view.opponents
    .map((id, o) => ({ o, w: weights.get(id) ?? 0 }))
    .sort((a, b) => b.w - a.w || a.o - b.o)
    .slice(0, k)
    .map((x) => x.o);
}
