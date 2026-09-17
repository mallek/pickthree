import {
  buildsFor,
  DEFAULT_BUILD_OPTIONS,
  type Build,
  type BuildOptions,
} from '../builds/eligibility.js';
import type { Specimen } from '../collection/specimen.js';
import { GameDataIndex } from '../gamedata/index.js';
import { facingWeight, metaRanks, type MetaRank } from '../gamedata/metaRank.js';
import type { MatchupMatrix, RankingCategory, RankingEntry } from '../gamedata/types.js';
import { MatrixView } from '../search/matrixView.js';
import { buildFacingProfile, facingLine } from '../yourmeta/profile.js';
import type { YourMetaInput } from '../yourmeta/types.js';

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
}

export interface CountersOptions {
  /** How many of the best anti-meta species to return. */
  limit: number;
  buildOptions: BuildOptions;
  yourMeta?: YourMetaInput;
  /**
   * Score against this one opponent instead of the whole meta. The log does not apply: the
   * question is "who beats X", not "who beats what I face".
   */
  vs?: string;
}

export interface CountersResult {
  entries: CounterEntry[];
  /** The assumptions sentence about opponent weights. */
  facing: string;
  blended: boolean;
  /** Counted battles behind the weights. */
  battles: number;
  /** Set when scored against one opponent. inMeta false means the matrix has no column for it. */
  vs?: { speciesId: string; inMeta: boolean };
}

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
): Map<string, Build> {
  const best = new Map<string, Build>();
  for (const s of specimens) {
    for (const b of buildsFor(s, index, opts)) {
      const cur = best.get(b.speciesId);
      if (
        !cur ||
        b.stageOffset < cur.stageOffset ||
        (b.stageOffset === cur.stageOffset && b.ivRank.rank < cur.ivRank.rank)
      ) {
        best.set(b.speciesId, b);
      }
    }
  }
  return best;
}

export interface CountersData {
  matrix: MatchupMatrix;
  rankings: Record<RankingCategory, RankingEntry[]>;
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
): CountersResult {
  const opts: CountersOptions = { ...DEFAULT_COUNTERS_OPTIONS, ...options };
  const view = new MatrixView(data.matrix);
  const ranks = metaRanks(data.rankings);
  const profile = buildFacingProfile({
    battles: opts.vs ? [] : (opts.yourMeta?.battles ?? []),
    opponents: view.opponents,
    ranks,
    rankings: data.rankings.overall,
    blend: opts.vs ? false : (opts.yourMeta?.blend ?? true),
  });
  const groups = opponentGroups(view, ranks, profile.engaged ? profile.weights : undefined);
  const byRank = [...groups].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  const target = opts.vs ? groups.find((g) => g.speciesId === opts.vs) : undefined;
  if (opts.vs && !target) {
    return {
      entries: [],
      facing: "Not in PvPoke's list for this league, so there are no matchups to score",
      blended: false,
      battles: 0,
      vs: { speciesId: opts.vs, inMeta: false },
    };
  }
  const owned = ownedBuilds(specimens, index, opts.buildOptions);

  // Against one opponent the score is the plain win share; the rest of the meta only feeds
  // the beats and losesTo lines. Species that never win are left out.
  const scored = data.matrix.candidates
    .map((speciesId, row) => ({
      speciesId,
      row,
      antiMeta: target ? winShare(view, row, target) * 100 : antiMetaScore(view, row, groups),
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
    });
  });
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
    facing: facingLine(profile, 'counters'),
    blended: profile.engaged,
    battles: profile.battles,
  };
}
