import type { PokemonType } from '../gamedata/types.js';
import type { Candidate, Role } from './candidates.js';
import type { MatrixView } from './matrixView.js';

export type Structure = 'ABB' | 'ABC';
export type TeamStyle = 'any' | 'balanced' | 'abb';

export interface TrioDraft {
  slots: [Candidate, Candidate, Candidate];
  roles: [Role, Role, Role];
  /** Meta opponents at least one member beats (1-1 shields). */
  coverage: number;
  /** Top-of-meta opponents nobody beats. */
  exposure: string[];
  /** Opponents that beat the lead (leads scenario). */
  leadCounters: string[];
  /** Share of lead counters both back-liners beat. */
  abbScore: number;
  /** Coverage breadth with low overlap, 0..1. */
  abcScore: number;
  structure: Structure;
  roleFit: number;
  typeOverlap: number;
  draftScore: number;
}

export interface TrioOptions {
  finalists: number;
  abbThreshold: number;
  style: TeamStyle;
  /** How many of the top meta entries count toward exposure. */
  exposureDepth: number;
  /** Minimum ABB drafts to keep in the finalists when any exist. */
  minAbb: number;
}

export const DEFAULT_TRIO_OPTIONS: TrioOptions = {
  finalists: 25,
  abbThreshold: 0.7,
  style: 'any',
  exposureDepth: 15,
  minAbb: 5,
};

interface Prepared {
  c: Candidate;
  win11: boolean[];
  win00: boolean[];
  counters: number[];
  types: Set<PokemonType>;
}

function prepare(
  pool: Candidate[],
  view: MatrixView,
  index: { types(id: string): [PokemonType, PokemonType | 'none'] },
): Prepared[] {
  const s11 = view.scenarioIndex([1, 1]);
  const s00 = view.scenarioIndex([0, 0]);
  return pool.map((c) => {
    const win11 = view.wins(c.matrixRow, s11);
    const counters: number[] = [];
    win11.forEach((w, o) => {
      if (!w) {
        counters.push(o);
      }
    });
    const t = index.types(c.build.speciesId);
    const types = new Set<PokemonType>([t[0]]);
    if (t[1] !== 'none') {
      types.add(t[1]);
    }
    return { c, win11, win00: view.wins(c.matrixRow, s00), counters, types };
  });
}

function roleScore(c: Candidate, role: Role): number {
  if (role === 'lead') {
    return c.roleScores.leads;
  }
  if (role === 'switch') {
    return c.roleScores.switches;
  }
  return c.roleScores.closers;
}

const ORDERINGS: [number, number, number][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

export function evaluateTrio(
  members: [Prepared, Prepared, Prepared],
  view: MatrixView,
  opts: TrioOptions,
): TrioDraft {
  const n = view.opponents.length;
  const covered = new Array<boolean>(n).fill(false);
  const coverCount = new Array<number>(n).fill(0);
  for (const m of members) {
    m.win11.forEach((w, o) => {
      if (w) {
        covered[o] = true;
        coverCount[o] = (coverCount[o] ?? 0) + 1;
      }
    });
  }
  const coverage = covered.filter(Boolean).length;
  const exposure: string[] = [];
  for (let o = 0; o < Math.min(opts.exposureDepth, n); o++) {
    if (!covered[o]) {
      exposure.push(view.opponents[o] as string);
    }
  }
  // Breadth with low overlap: unique coverage per member relative to total wins.
  const totalWins = members.reduce((acc, m) => acc + m.win11.filter(Boolean).length, 0);
  const uniqueWins = coverCount.filter((k) => k === 1).length;
  const abcScore =
    totalWins === 0 ? 0 : (coverage / n) * (0.5 + 0.5 * (uniqueWins / Math.max(1, coverage)));

  let typeOverlap = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      for (const t of members[i]!.types) {
        if (members[j]!.types.has(t)) {
          typeOverlap += 1;
        }
      }
    }
  }

  let best: TrioDraft | null = null;
  for (const order of ORDERINGS) {
    const lead = members[order[0]] as Prepared;
    const sw = members[order[1]] as Prepared;
    const cl = members[order[2]] as Prepared;
    const counters = lead.counters;
    let both = 0;
    for (const o of counters) {
      if (sw.win11[o] && cl.win00[o]) {
        both += 1;
      }
    }
    const abbScore = counters.length === 0 ? 1 : both / counters.length;
    const roleFit =
      (roleScore(lead.c, 'lead') + roleScore(sw.c, 'switch') + roleScore(cl.c, 'closer')) / 3;
    const structure: Structure =
      abbScore >= opts.abbThreshold && counters.length >= 3 ? 'ABB' : 'ABC';
    const draftScore =
      0.45 * (coverage / n) +
      0.2 * (roleFit / 100) +
      0.2 * Math.max(abbScore * (structure === 'ABB' ? 1 : 0.6), abcScore) +
      0.15 * (1 - exposure.length / Math.min(opts.exposureDepth, n)) -
      0.03 * typeOverlap;
    const draft: TrioDraft = {
      slots: [lead.c, sw.c, cl.c],
      roles: ['lead', 'switch', 'closer'],
      coverage,
      exposure,
      leadCounters: counters.map((o) => view.opponents[o] as string),
      abbScore,
      abcScore,
      structure,
      roleFit,
      typeOverlap,
      draftScore,
    };
    if (!best || draft.draftScore > best.draftScore) {
      best = draft;
    }
  }
  return best as TrioDraft;
}

export function generateTrios(
  pool: Candidate[],
  view: MatrixView,
  index: { types(id: string): [PokemonType, PokemonType | 'none'] },
  opts: TrioOptions = DEFAULT_TRIO_OPTIONS,
  onProgress?: (done: number, total: number) => void,
): { drafts: TrioDraft[]; scored: number } {
  const prepared = prepare(pool, view, index);
  const n = prepared.length;
  const total = (n * (n - 1) * (n - 2)) / 6;
  const all: TrioDraft[] = [];
  let done = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const a = prepared[i] as Prepared;
        const b = prepared[j] as Prepared;
        const c = prepared[k] as Prepared;
        // One species per team, even across specimens.
        if (
          a.c.build.speciesId === b.c.build.speciesId ||
          a.c.build.speciesId === c.c.build.speciesId ||
          b.c.build.speciesId === c.c.build.speciesId
        ) {
          continue;
        }
        all.push(evaluateTrio([a, b, c], view, opts));
        done += 1;
        if (onProgress && done % 2000 === 0) {
          onProgress(done, total);
        }
      }
    }
  }
  all.sort((x, y) => y.draftScore - x.draftScore);
  let filtered = all;
  if (opts.style === 'abb') {
    filtered = all.filter((d) => d.structure === 'ABB');
  } else if (opts.style === 'balanced') {
    filtered = all.filter((d) => d.structure === 'ABC');
  }
  const top = filtered.slice(0, opts.finalists);
  if (opts.style === 'any') {
    const abbInTop = top.filter((d) => d.structure === 'ABB').length;
    if (abbInTop < opts.minAbb) {
      const extra = filtered
        .filter((d) => d.structure === 'ABB' && !top.includes(d))
        .slice(0, opts.minAbb - abbInTop);
      if (extra.length > 0) {
        top.splice(top.length - extra.length, extra.length, ...extra);
      }
    }
  }
  if (onProgress) {
    onProgress(total, total);
  }
  return { drafts: top, scored: all.length };
}
