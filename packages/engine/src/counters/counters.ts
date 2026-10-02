import {
  buildsFor,
  DEFAULT_BUILD_OPTIONS,
  type Build,
  type BuildOptions,
} from '../builds/eligibility.js';
import { fieldedBuilds, type PinMap } from '../collection/pins.js';
import type { Specimen } from '../collection/specimen.js';
import { GameDataIndex } from '../gamedata/index.js';
import { facingWeight, metaRanks, type MetaRank } from '../gamedata/metaRank.js';
import type { MatchupMatrix, MetaEntry, RankingCategory, RankingEntry } from '../gamedata/types.js';
import { simOptionsFor } from '../gamedata/league.js';
import { MatrixView } from '../search/matrixView.js';
import { simulateMatrix, specFor, type MatrixSimDeps } from '../sim/matrixSim.js';
import { profileFor, type FacingInput } from '../yourmeta/facing.js';
import { facingLine } from '../yourmeta/profile.js';

export interface CounterMatchup {
  opponent: string;
  opponentRank: number | null;
  /** Shield scenarios (of three) this species wins. */
  scenarios: number;
}

export interface CounterEntry {
  speciesId: string;
  /** PvPoke overall rank, null when unranked. */
  overallRank: number | null;
  /** 1-based position by anti-meta score. */
  antiRank: number;
  /** Share of the meta beaten, weighted by how often you meet each opponent, 0 to 100. */
  antiMeta: number;
  /** Overall rank minus anti-meta rank. Positive means under the radar. */
  gap: number;
  /** Most common opponents this species beats in at least two of three shield scenarios. */
  beats: CounterMatchup[];
  /** Most common opponents this species never beats. */
  losesTo: CounterMatchup[];
  owned: 'have' | 'build' | 'none';
  /** The best-IV specimen that is or becomes this species. */
  ownedSpecimenId: string | null;
  ownedStageOffset: number | null;
  /**
   * Against one opponent: nine battle ratings for this species, row-major, your shields 0..2 by
   * theirs 0..2 (index yours * 3 + theirs). Null against the whole meta and until filled.
   */
  grid: number[] | null;
}

export interface CountersOptions {
  /** How many of the best anti-meta species to return. */
  limit: number;
  buildOptions: BuildOptions;
  facing?: FacingInput;
  /**
   * Score against this one opponent instead of the whole meta. The log does not apply: the
   * question is "who beats X", not "who beats what I face".
   */
  vs?: string;
  /** This league's pins. Absent means every species uses the default pick. */
  pins?: PinMap;
}

export interface CountersResult {
  entries: CounterEntry[];
  /** The assumptions sentence about opponent weights. */
  facing: string;
  blended: boolean;
  /** Counted battles behind the weights. */
  battles: number;
  /**
   * Set when scored against one opponent. inMeta false means the matrix has no column for it;
   * simulated is how many ranked species were then run through the simulator instead.
   */
  vs?: { speciesId: string; inMeta: boolean; simulated?: number };
  /** Milliseconds spent battling every shield pairing, set once the grids are in. */
  gridMs?: number;
}

/** What the outsider path needs: the simulator and league the matrix was built with. */
export type CountersLive = MatrixSimDeps;

/** Ranked species simulated against an outsider; nobody builds the Magikarp that beats Snorlax. */
export const SIMULATED_CANDIDATES = 300;

export const DEFAULT_COUNTERS_OPTIONS: CountersOptions = {
  limit: 80,
  buildOptions: DEFAULT_BUILD_OPTIONS,
};

interface OpponentGroup {
  speciesId: string;
  columns: number[];
  weight: number;
  rank: number | null;
}

/** Meta opponents grouped by species; PvPoke lists a few twice with different movesets. */
export function opponentGroups(
  view: MatrixView,
  ranks: Map<string, MetaRank>,
  weights?: Map<string, number>,
): OpponentGroup[] {
  const byId = new Map<string, OpponentGroup>();
  view.opponents.forEach((id, col) => {
    let g = byId.get(id);
    if (!g) {
      const rank = ranks.get(id)?.overall ?? null;
      g = { speciesId: id, columns: [], weight: weights?.get(id) ?? facingWeight(rank), rank };
      byId.set(id, g);
    }
    g.columns.push(col);
  });
  return [...byId.values()];
}

/** Share of scenarios and moveset variants this row beats the group in, 0 to 1. */
function winShare(view: MatrixView, row: number, g: OpponentGroup): number {
  let wins = 0;
  let cells = 0;
  for (const col of g.columns) {
    for (let sc = 0; sc < view.scenarioCount; sc++) {
      cells += 1;
      if (view.rating(row, col, sc) > 500) {
        wins += 1;
      }
    }
  }
  return cells === 0 ? 0 : wins / cells;
}

/** Facing-weighted share of the meta beaten by a matrix row, 0 to 100. */
export function antiMetaScore(view: MatrixView, row: number, groups: OpponentGroup[]): number {
  let got = 0;
  let total = 0;
  for (const g of groups) {
    total += g.weight;
    got += g.weight * winShare(view, row, g);
  }
  return total === 0 ? 0 : (got / total) * 100;
}

function ownedBuilds(
  specimens: Specimen[],
  index: GameDataIndex,
  opts: BuildOptions,
  pins: PinMap | undefined,
): Map<string, Build> {
  const all = specimens.flatMap((s) => buildsFor(s, index, opts));
  return new Map(fieldedBuilds(all, pins).map((b) => [b.speciesId, b]));
}

export interface CountersData {
  matrix: MatchupMatrix;
  rankings: Record<RankingCategory, RankingEntry[]>;
  /** PvPoke's meta group: a community facing weights against it. */
  meta: MetaEntry[];
  /** The Play! ban list for this league. Absent means none shipped. */
  banned?: string[];
}

/**
 * A counter's moveset: the rankings' recommended moveset with the data build's overrides, as the
 * matrix recorded it for its row. The matrix and the simulated column both battle it.
 */
function counterMoveset(data: CountersData, speciesId: string): string[] {
  return data.matrix.candidateMovesets[speciesId] ?? [];
}

/**
 * An outsider's moveset: its overall rankings entry's, the one its simulated column battles.
 * Null when there is no entry, or it lacks a charged move.
 */
function outsiderMoveset(data: CountersData, vs: string): string[] | null {
  const entry = data.rankings.overall.find((e) => e.speciesId === vs);
  return entry && entry.moveset.length >= 2 ? entry.moveset : null;
}

/**
 * A meta-group opponent's moveset: the meta group's, the one its matrix column battled. PvPoke
 * lists a few species twice with different movesets (forretress_shadow in Great League); the
 * first listing is taken on purpose, since the matrix's per-species opponentMovesets keeps only
 * the last and so cannot say which one the grid used.
 */
function metaMoveset(data: CountersData, vs: string): string[] {
  const first = data.meta.find((m) => m.speciesId === vs);
  if (first) {
    // As the data build does: a battle uses two charged moves.
    return [first.fastMove, ...first.chargedMoves.slice(0, 2)];
  }
  return data.matrix.opponentMovesets[vs] ?? [];
}

/**
 * The matrix column the data build would have written for `vs`, had it been in the meta group:
 * the top ranked species against it at its ranking moveset, in the matrix's shield scenarios.
 * Null when the species has no ranking entry to take a moveset from.
 */
function simulateColumn(data: CountersData, vs: string, live: CountersLive): MatchupMatrix | null {
  const moveset = outsiderMoveset(data, vs);
  if (!moveset) {
    return null;
  }
  const src = data.matrix;
  const candidates = src.candidates
    .filter((id) => id !== vs)
    .slice(0, SIMULATED_CANDIDATES)
    .map((id) => ({ speciesId: id, moveset: counterMoveset(data, id) }));
  return simulateMatrix(src, candidates, [{ speciesId: vs, moveset }], live);
}

/**
 * Every ranked species scored by how much of the current meta it beats, weighted by how often
 * you meet each opponent. The gap between that and PvPoke's overall rank points at the picks
 * that punish today's meta without being obvious.
 */
export function metaCounters(
  data: CountersData,
  specimens: Specimen[],
  index: GameDataIndex,
  options: Partial<CountersOptions> = {},
  live?: CountersLive,
): CountersResult {
  const opts: CountersOptions = { ...DEFAULT_COUNTERS_OPTIONS, ...options };
  const view = new MatrixView(data.matrix);
  const ranks = metaRanks(data.rankings);
  // One opponent is "who beats X", not "who beats what I face": weights never apply to it.
  const profile = profileFor(data, view, opts.vs ? { kind: 'prior' } : opts.facing);
  const groups = opponentGroups(view, ranks, profile.engaged ? profile.weights : undefined);
  const byRank = [...groups].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  let target = opts.vs ? groups.find((g) => g.speciesId === opts.vs) : undefined;
  /** For an outsider: a one-column matrix from the simulator, read through its own view. */
  let targetView = view;
  let simulated: number | undefined;
  if (opts.vs && !target) {
    const column = live ? simulateColumn(data, opts.vs, live) : null;
    if (!column) {
      return {
        entries: [],
        facing: "Not in PvPoke's list for this league, so there are no matchups to score",
        blended: false,
        battles: 0,
        vs: { speciesId: opts.vs, inMeta: false },
      };
    }
    targetView = new MatrixView(column);
    target = opponentGroups(targetView, ranks)[0];
    simulated = column.candidates.length;
  }
  const owned = ownedBuilds(specimens, index, opts.buildOptions, opts.pins);

  // Against one opponent the score is the plain win share; the rest of the meta only feeds
  // the beats and losesTo lines. Species that never win are left out.
  const targetRow = (speciesId: string, row: number): number =>
    targetView === view ? row : (targetView.rowOf(speciesId) ?? -1);
  const scored = data.matrix.candidates
    .map((speciesId, row) => ({
      speciesId,
      row,
      antiMeta: target
        ? targetRow(speciesId, row) < 0
          ? 0
          : winShare(targetView, targetRow(speciesId, row), target) * 100
        : antiMetaScore(view, row, groups),
    }))
    .filter((s) => !target || (s.antiMeta > 0 && s.speciesId !== target.speciesId));
  const rankOf = (id: string): number => ranks.get(id)?.overall ?? 9999;
  scored.sort((a, b) => b.antiMeta - a.antiMeta || rankOf(a.speciesId) - rankOf(b.speciesId));

  const out: CounterEntry[] = [];
  scored.slice(0, opts.limit).forEach((s, i) => {
    const antiRank = i + 1;
    const overallRank = ranks.get(s.speciesId)?.overall ?? null;
    const beats: CounterMatchup[] = [];
    const losesTo: CounterMatchup[] = [];
    for (const g of byRank) {
      if (g.speciesId === s.speciesId) {
        continue;
      }
      const share = winShare(view, s.row, g);
      const scenarios = Math.round(share * view.scenarioCount);
      const m = { opponent: g.speciesId, opponentRank: g.rank, scenarios };
      if (share >= 2 / 3 && beats.length < 5) {
        beats.push(m);
      } else if (share === 0 && losesTo.length < 3) {
        losesTo.push(m);
      }
    }
    const b = owned.get(s.speciesId);
    out.push({
      speciesId: s.speciesId,
      overallRank,
      antiRank,
      antiMeta: Math.round(s.antiMeta * 10) / 10,
      gap: (overallRank ?? data.matrix.candidates.length) - antiRank,
      beats,
      losesTo,
      owned: b ? (b.stageOffset === 0 ? 'have' : 'build') : 'none',
      ownedSpecimenId: b?.specimenId ?? null,
      ownedStageOffset: b?.stageOffset ?? null,
      grid: null,
    });
  });
  if (target && simulated !== undefined) {
    return {
      entries: out,
      facing: `Outside PvPoke's meta group, so the top ${simulated} ranked species were simulated on this device at PvPoke's movesets; your log does not apply here`,
      blended: false,
      battles: 0,
      vs: { speciesId: target.speciesId, inMeta: false, simulated },
    };
  }
  if (target) {
    return {
      entries: out,
      facing: "Scored against one opponent at PvPoke's movesets; your log does not apply here",
      blended: false,
      battles: 0,
      vs: { speciesId: target.speciesId, inMeta: true },
    };
  }
  return {
    entries: out,
    facing: facingLine(
      profile,
      'counters',
      undefined,
      live?.league.kind === 'rotation' ? 'run' : 'season',
    ),
    blended: profile.engaged,
    battles: profile.battles,
  };
}

/** Shield counts on each side of the grid: 0, 1 and 2. */
const GRID_SHIELDS = [0, 1, 2] as const;

function cellsWon(grid: number[]): number {
  return grid.filter((r) => r > 500).length;
}

function meanRating(grid: number[]): number {
  return grid.length === 0 ? 0 : grid.reduce((a, b) => a + b, 0) / grid.length;
}

/**
 * Every shield pairing against one opponent: nine battles per counter, your shields 0..2 by
 * theirs 0..2, at PvPoke default IVs with the league's simulator options and the movesets that
 * chose the rows: the counter at its matrix row's moveset; the opponent at its meta group moveset
 * (first listing) when it has a matrix column, else at its rankings moveset, as its simulated
 * column. Fills in batches, reporting each batch but the last in the incoming order (the sorted
 * result follows the last at once), then sorts by cells won out of nine, then mean rating, then
 * PvPoke overall rank, and renumbers antiRank (and the gap).
 */
export function counterGrids(
  data: CountersData,
  vs: string,
  entries: CounterEntry[],
  live: CountersLive,
  onBatch?: (done: number, total: number, entries: CounterEntry[]) => void,
  batchSize = 10,
): { entries: CounterEntry[]; gridMs: number } {
  const started = Date.now();
  const simOptions = simOptionsFor(live.league);
  // The opponent at the moveset that chose these rows: its matrix column's, or for an outsider
  // its simulated column's.
  const theirs = {
    speciesId: vs,
    moveset: data.matrix.opponents.includes(vs)
      ? metaMoveset(data, vs)
      : (outsiderMoveset(data, vs) ?? []),
  };
  const out = entries.map((e) => ({ ...e }));
  const step = Math.max(1, Math.floor(batchSize));
  for (let i = 0; i < out.length; i++) {
    const e = out[i]!;
    const yours = { speciesId: e.speciesId, moveset: counterMoveset(data, e.speciesId) };
    const grid: number[] = [];
    for (const mine of GRID_SHIELDS) {
      for (const their of GRID_SHIELDS) {
        const r = live.sim.simulate(specFor(yours, mine, 0), specFor(theirs, their, 0), simOptions);
        grid.push(r.rating);
      }
    }
    e.grid = grid;
    const done = i + 1;
    // The last batch is not reported: the sorted result follows it at once.
    if (onBatch && done % step === 0 && done < out.length) {
      onBatch(
        done,
        out.length,
        out.map((x) => ({ ...x })),
      );
    }
  }
  const rankOf = (e: CounterEntry): number => e.overallRank ?? 9999;
  const key = (e: CounterEntry): [number, number] => {
    const g = e.grid ?? [];
    return [cellsWon(g), meanRating(g)];
  };
  out.sort((a, b) => {
    const [wa, ma] = key(a);
    const [wb, mb] = key(b);
    return wb - wa || mb - ma || rankOf(a) - rankOf(b);
  });
  const sorted = out.map((e, i) => ({
    ...e,
    antiRank: i + 1,
    gap: (e.overallRank ?? data.matrix.candidates.length) - (i + 1),
  }));
  return { entries: sorted, gridMs: Date.now() - started };
}
