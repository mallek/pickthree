/**
 * The cup boards the Reddit post script renders (spec 2026-09-30-cup-team-boards-design.md):
 * Top Teams, Budget Builds and Best Team for Each Mega, five rows each, one complete team a row.
 * Selection is generic over the item so it can be tested on plain data; cupBoards (below) is the
 * glue that runs it on the engine's scored trios.
 */

/** Rows on one image. */
export const BOARD_ROWS = 5;
/** Rows any one Pokemon may appear on, per image. A Shadow and a Mega count as their base. */
export const SPECIES_CAP = 2;

export interface SelectOptions {
  rows: number;
  cap: number;
}

/** True when `next` may join `taken`: it shares at most one Pokemon with every taken row, and no
 *  Pokemon would then be on more than `cap` rows. */
function fits<T>(
  taken: readonly T[],
  next: T,
  speciesOf: (t: T) => readonly string[],
  cap: number,
): boolean {
  const mine = speciesOf(next);
  for (const row of taken) {
    const theirs = speciesOf(row);
    if (mine.filter((id) => theirs.includes(id)).length >= 2) {
      return false;
    }
  }
  for (const id of mine) {
    const uses = taken.filter((row) => speciesOf(row).includes(id)).length;
    if (uses + 1 > cap) {
      return false;
    }
  }
  return true;
}

/** Strongest first, a team joins when it fits the variety rule; stops at `rows`. */
export function selectVaried<T>(
  items: readonly T[],
  speciesOf: (t: T) => readonly string[],
  opts: SelectOptions,
): T[] {
  const taken: T[] = [];
  for (const item of items) {
    if (taken.length >= opts.rows) {
      break;
    }
    if (fits(taken, item, speciesOf, opts.cap)) {
      taken.push(item);
    }
  }
  return taken;
}

/**
 * One row per Mega. Megas are ranked by their strongest team; walking them in that order, each
 * takes its strongest team that fits the variety rule against the rows already taken, or is
 * skipped. Rows come back in the items' own (strength) order.
 */
export function selectMegaRows<T>(
  items: readonly T[],
  speciesOf: (t: T) => readonly string[],
  megaOf: (t: T) => string | null,
  opts: SelectOptions,
): T[] {
  const byMega = new Map<string, T[]>();
  for (const item of items) {
    const mega = megaOf(item);
    if (mega === null) {
      continue;
    }
    const list = byMega.get(mega);
    if (list) {
      list.push(item);
    } else {
      byMega.set(mega, [item]);
    }
  }
  const taken: T[] = [];
  for (const list of byMega.values()) {
    if (taken.length >= opts.rows) {
      break;
    }
    const pick = list.find((item) => fits(taken, item, speciesOf, opts.cap));
    if (pick !== undefined) {
      taken.push(pick);
    }
  }
  const at = new Map(items.map((item, i) => [item, i]));
  return taken.sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0));
}
