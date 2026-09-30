/**
 * Core + flex selection for the cup boards (spec 2026-09-30-core-flex-boards-design.md, rules 2 to 4
 * and 7). Legal trios come in strongest first (`items` MUST be sorted strongest first); each row is
 * a two-Pokemon core plus up to `flexMax` near-tied thirds. A trio holding an earlier row's core pair
 * (compared by base species) belongs to that core: it cannot start a later row and cannot be a later
 * row's flex, even when it fell outside that core's flex window. The cap counts a base species once
 * per row as a core member or as the row's headline third (flex[0] is the headline, whose third is
 * checked against the cap); non-headline flex options are free. Flex is scanned from the start trio
 * onward; the start trio is the row's best trio and, unless its third shares a base with a core
 * member, its headline (flex[0]). Trios ahead of the start were shown, covered or blocked, and never
 * rejoin a row. Generic over the trio so it can be tested on plain data.
 */
export interface CoreOptions<T> {
  /** Rows wanted (5). */
  rows: number;
  /** Rows any base species may be a core member of (2). */
  cap: number;
  /** Most flex options a row lists (4). */
  flexMax: number;
  /** Points below the row's best trio a regular third may sit (1.0). */
  window: number;
  /** The same, when the third is a Mega (2.0). */
  megaWindow: number;
  /** The trio's three species ids. */
  speciesOf: (t: T) => readonly string[];
  strengthOf: (t: T) => number;
  /** Unique per trio. */
  keyOf: (t: T) => string;
  /** Shadow and Mega fold to their base species. */
  base: (id: string) => string;
  isMega: (id: string) => boolean;
}

export interface CoreFlex<T> {
  third: string;
  trio: T;
}

export interface CoreRow<T> {
  core: [string, string];
  /** flex[0].trio is the row's best trio. */
  flex: CoreFlex<T>[];
}

interface PairChoice<T> {
  pairKey: string;
  members: [string, string];
  bases: [string, string];
  /** Base species of flex[0]'s third (the row's headline third), set once the flex is known. */
  thirdBase: string;
  flex: CoreFlex<T>[];
}

export function selectCores<T>(items: readonly T[], opts: CoreOptions<T>): CoreRow<T>[] {
  const shown = new Set<string>();
  const uses = new Map<string, number>();
  const usedPairs = new Set<string>();
  const usedBasePairs: [string, string][] = [];
  const rows: CoreRow<T>[] = [];

  /** True when the trio holds both base species of an already recorded core. */
  const covered = (item: T): boolean => {
    const bases = opts.speciesOf(item).map((id) => opts.base(id));
    return usedBasePairs.some(([x, y]) => bases.includes(x) && bases.includes(y));
  };

  const flexFor = (startAt: number, members: [string, string]): CoreFlex<T>[] => {
    const start = items[startAt]!;
    const floor = opts.strengthOf(start);
    const seenThirds = new Set<string>();
    const flex: CoreFlex<T>[] = [];
    for (let k = startAt; k < items.length; k++) {
      const item = items[k]!;
      if (flex.length >= opts.flexMax) {
        break;
      }
      const strength = opts.strengthOf(item);
      if (strength < floor - opts.megaWindow) {
        break;
      }
      if (shown.has(opts.keyOf(item)) || covered(item)) {
        continue;
      }
      // Both raw core ids must be in the trio (a Shadow or Mega form is not its base); the third
      // is the raw id left over.
      const left = [...opts.speciesOf(item)];
      let both = true;
      for (const m of members) {
        const at = left.indexOf(m);
        if (at < 0) {
          both = false;
          break;
        }
        left.splice(at, 1);
      }
      if (!both || left.length !== 1) {
        continue;
      }
      const thirdId = left[0]!;
      const thirdBase = opts.base(thirdId);
      if (members.some((m) => opts.base(m) === thirdBase)) {
        continue;
      }
      if (seenThirds.has(thirdBase)) {
        continue;
      }
      const reach = opts.isMega(thirdId) ? opts.megaWindow : opts.window;
      if (strength < floor - reach) {
        continue;
      }
      seenThirds.add(thirdBase);
      flex.push({ third: thirdId, trio: item });
    }
    return flex;
  };

  for (let at = 0; at < items.length; at++) {
    const start = items[at]!;
    if (rows.length >= opts.rows) {
      break;
    }
    if (shown.has(opts.keyOf(start)) || covered(start)) {
      continue;
    }
    const ids = opts.speciesOf(start);
    const pairs: PairChoice<T>[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const bases: [string, string] = [opts.base(a), opts.base(b)];
        if (bases[0] === bases[1]) {
          continue; // a core is two different base species
        }
        pairs.push({
          pairKey: [...bases].sort().join('+'),
          members: [a, b],
          bases,
          thirdBase: '',
          flex: [],
        });
      }
    }
    pairs.sort((x, y) => (x.pairKey < y.pairKey ? -1 : x.pairKey > y.pairKey ? 1 : 0));

    let best: PairChoice<T> | null = null;
    for (const pair of pairs) {
      if (usedPairs.has(pair.pairKey)) {
        continue;
      }
      if (pair.bases.some((b) => (uses.get(b) ?? 0) >= opts.cap)) {
        continue;
      }
      pair.flex = flexFor(at, pair.members);
      if (pair.flex.length === 0) {
        continue;
      }
      // The headline is flex[0]: the cap is checked on its third, whatever the start trio's third was.
      pair.thirdBase = opts.base(pair.flex[0]!.third);
      if ((uses.get(pair.thirdBase) ?? 0) >= opts.cap) {
        continue;
      }
      if (best === null || pair.flex.length > best.flex.length) {
        best = pair;
      }
    }
    if (best === null || best.flex.length === 0) {
      continue;
    }
    rows.push({ core: best.members, flex: best.flex });
    for (const f of best.flex) {
      shown.add(opts.keyOf(f.trio));
    }
    for (const b of [...best.bases, best.thirdBase]) {
      uses.set(b, (uses.get(b) ?? 0) + 1);
    }
    usedPairs.add(best.pairKey);
    usedBasePairs.push(best.bases);
  }
  return rows;
}
