import {
  buildOptionsFor,
  buildsFor,
  DEFAULT_BUILD_OPTIONS,
  type Build,
  type BuildOptions,
} from './builds/eligibility.js';
import { simOptionsFor } from './gamedata/league.js';
import { movesetFrom, rankingsById, recommendMoveset, type MoveIds } from './builds/moves.js';
import type { Specimen } from './collection/specimen.js';
import type { RawScan } from './csv/parse.js';
import { fullName } from './explain/explain.js';
import { GameDataIndex } from './gamedata/index.js';
import { metaRanks } from './gamedata/metaRank.js';
import { cpFor } from './math/cp.js';
import { allSpreads } from './math/ivrank.js';
import {
  assumptionsFor,
  DEFAULT_RECOMMEND_OPTIONS,
  profileFor,
  teamFrom,
  type Assumptions,
  type EngineDeps,
  type ProgressFn,
  type TeamRecommendation,
} from './recommend.js';
import { candidateFor, candidatePool, type Candidate } from './search/candidates.js';
import { simulateFinalists } from './search/finalists.js';
import { MatrixView } from './search/matrixView.js';
import { withSimulatedRows, type MatrixFighter } from './sim/matrixSim.js';
import {
  ALL_ORDERINGS,
  DEFAULT_TRIO_OPTIONS,
  evaluateTrio,
  prepare,
  type Prepared,
} from './search/trios.js';
import { scoreTeam, type Fit } from './score/score.js';
import { bestBuild } from './verdicts/worth.js';
import type { YourMetaInput } from './yourmeta/types.js';

/** One member of a hand-built team. */
export interface TeamPick {
  /** specimen: a Pokémon from the collection. species: any species, run at top-10% IVs. */
  kind: 'specimen' | 'species';
  /** The specimen id, or the species id (shadow ids like swampert_shadow are their own species). */
  id: string;
  /** For a specimen, which evolution stage to run. Defaults to the stage PvPoke rates highest. */
  asSpeciesId?: string;
  /** Moves to run instead of the recommendation. Must be in the species' pool. */
  moves?: MoveIds;
}

export interface AnalyzeOptions extends BuildOptions {
  /** given: run the picks as lead, safe switch, closer. best: try all six orders, keep the best. */
  order: 'given' | 'best';
  yourMeta?: YourMetaInput;
}

export const DEFAULT_ANALYZE_OPTIONS: AnalyzeOptions = {
  ...DEFAULT_BUILD_OPTIONS,
  minCp: 0,
  order: 'best',
};

export interface OrderTried {
  /** Species ids as lead, safe switch, closer. */
  slots: [string, string, string];
  names: [string, string, string];
  total: number;
  fit: Fit;
}

export interface TeamAnalysis {
  team: TeamRecommendation;
  /** Every order simulated, best first. One entry when the order was fixed. */
  orders: OrderTried[];
  /** Species run at top-10% IVs because they were picked by species, not from the collection. */
  hypothetical: string[];
  /** Species that ran moves the trainer chose instead of the recommendation. */
  chosenMoves: string[];
  /**
   * Species PvPoke does not rank in this league. They have no matrix row, so each was simulated
   * against the meta group on the device before the analysis ran; their role scores are zero.
   */
  unranked: string[];
  assumptions: Assumptions;
  ms: number;
}

/** The IV spread a species you do not own is assumed to have: the last one inside the top 10%. */
export const HYPOTHETICAL_TOP_SHARE = 0.1;

/**
 * A stand-in specimen for a species you do not own: a top-10% IV spread rather than the perfect
 * one, since that is what a player is likely to actually have. Level 1, no moves yet.
 */
export function hypotheticalSpecimen(
  speciesId: string,
  index: GameDataIndex,
  opts: BuildOptions,
): Specimen {
  const sp = index.mustSpecies(speciesId);
  const levelCap = opts.allowXl ? opts.levelCap : Math.min(opts.levelCap, 40);
  const spreads = allSpreads(sp.baseStats, opts.cpCap, levelCap, sp.levelFloor ?? 1);
  const best = spreads[Math.max(0, Math.ceil(spreads.length * HYPOTHETICAL_TOP_SHARE) - 1)];
  if (!best) {
    throw new Error(`${sp.speciesName} cannot fit under ${opts.cpCap} CP.`);
  }
  return {
    id: `species:${speciesId}`,
    speciesId,
    familyId: sp.familyId,
    ivs: best.ivs,
    level: { min: 1, max: 1 },
    cp: cpFor(sp.baseStats, best.ivs, 1),
    hp: 0,
    shadow: sp.shadow,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '',
    raw: {} as unknown as RawScan,
  };
}

function resolvePick(
  pick: TeamPick,
  specimens: Specimen[],
  index: GameDataIndex,
  opts: AnalyzeOptions,
): { build: Build; hypothetical: boolean } {
  const overall = new Map(); // stage choice below uses the caller's ranking map when given
  void overall;
  if (pick.kind === 'species') {
    const s = hypotheticalSpecimen(pick.id, index, opts);
    const build = buildsFor(s, index, opts).find((b) => b.speciesId === pick.id);
    if (!build) {
      throw new Error(`${fullName(pick.id, index)} cannot fit under ${opts.cpCap} CP.`);
    }
    return { build, hypothetical: true };
  }
  const s = specimens.find((x) => x.id === pick.id);
  if (!s) {
    throw new Error('One of those Pokémon is no longer in your collection.');
  }
  const builds = buildsFor(s, index, opts);
  if (builds.length === 0) {
    throw new Error(`${fullName(s.speciesId, index)} cannot fit under ${opts.cpCap} CP.`);
  }
  if (pick.asSpeciesId) {
    const b = builds.find((x) => x.speciesId === pick.asSpeciesId);
    if (!b) {
      throw new Error(
        `${fullName(s.speciesId, index)} cannot be run as ${fullName(pick.asSpeciesId, index)}.`,
      );
    }
    return { build: b, hypothetical: false };
  }
  return { build: builds[0] as Build, hypothetical: false };
}

/**
 * The same breakdown a recommended team gets, for three Pokémon the player chose. Picks come from
 * the collection or by species (top-10% IVs). The order is either kept or chosen by simulating all
 * six and keeping the strongest.
 */
export function analyzeTeam(
  picks: [TeamPick, TeamPick, TeamPick],
  specimens: Specimen[],
  options: Partial<AnalyzeOptions>,
  deps: EngineDeps,
  onProgress?: ProgressFn,
): TeamAnalysis {
  const started = Date.now();
  const opts: AnalyzeOptions = {
    ...DEFAULT_ANALYZE_OPTIONS,
    ...buildOptionsFor(deps.data.league),
    minCp: 0,
    ...options,
  };
  const simOptions = deps.simOptions ?? simOptionsFor(deps.data.league);
  const index = new GameDataIndex(deps.data.species, deps.data.moves);
  let view = new MatrixView(deps.data.matrix);
  const progress: ProgressFn = onProgress ?? (() => {});
  const overall = rankingsById(deps.data.rankings.overall);

  progress('eligibility', 0, 3);
  const resolved = picks.map((p) => {
    const r = resolvePick(p, specimens, index, opts);
    if (p.kind === 'specimen' && !p.asSpeciesId) {
      // Default stage: the one PvPoke rates highest, same rule the verdicts use.
      const s = specimens.find((x) => x.id === p.id) as Specimen;
      const best = bestBuild(buildsFor(s, index, opts), overall);
      if (best) {
        return { build: best, hypothetical: false };
      }
    }
    return r;
  });
  const ids = new Set(resolved.map((r) => r.build.specimenId));
  if (ids.size < 3) {
    throw new Error('Pick three different Pokémon.');
  }
  progress('eligibility', 3, 3);

  // A pick PvPoke does not rank has no matrix row. Simulate one against the meta group with
  // the moveset it will actually run, and the rest of the analysis reads it like any other.
  const missing: MatrixFighter[] = [];
  resolved.forEach((r, i) => {
    if (view.rowOf(r.build.speciesId) !== null) {
      return;
    }
    const chosen = picks[i]?.moves;
    const m = chosen
      ? movesetFrom(r.build.speciesId, chosen, r.build.specimen.currentMoves, index)
      : recommendMoveset(
          r.build.speciesId,
          overall,
          r.build.specimen.currentMoves,
          { allowEliteTm: opts.allowEliteTm },
          index,
        );
    missing.push({
      speciesId: r.build.speciesId,
      moveset: [m.fast.moveId, ...m.charged.map((c) => c.moveId)],
    });
  });
  if (missing.length > 0) {
    const cells = missing.length * deps.data.meta.length * deps.data.matrix.scenarios.length;
    progress('simulate-picks', 0, cells);
    view = new MatrixView(
      withSimulatedRows(deps.data.matrix, missing, {
        sim: deps.sim,
        league: deps.data.league,
        onProgress: (d, t) => progress('simulate-picks', d, t),
      }),
    );
  }

  progress('candidates', 0, 1);
  const cands = resolved.map((r, i) =>
    candidateFor(r.build, deps.data.rankings, view, index, {
      allowEliteTm: opts.allowEliteTm,
      moves: picks[i]?.moves,
    }),
  ) as [Candidate, Candidate, Candidate];
  // Alternatives come from the whole collection, like a recommended team.
  let pool: Candidate[] = [];
  if (specimens.length > 0) {
    const builds: Build[] = [];
    for (const s of specimens) {
      builds.push(...buildsFor(s, index, { ...opts, minCp: deps.data.league.minCp }));
    }
    pool = candidatePool(builds, deps.data.rankings, view, index, {
      ...DEFAULT_RECOMMEND_OPTIONS,
      ...opts,
      excludedSpecimenIds: [],
    }).pool;
  }
  progress('candidates', 1, 1);

  const typesOf = { types: (id: string) => index.mustSpecies(id).types };
  const prepared = prepare(cands, view, typesOf) as [Prepared, Prepared, Prepared];
  const orderings = opts.order === 'given' ? [ALL_ORDERINGS[0]!] : ALL_ORDERINGS;
  const drafts = orderings.map((o) => evaluateTrio(prepared, view, DEFAULT_TRIO_OPTIONS, [o]));

  const profile = profileFor(deps.data, view, opts.yourMeta);
  const opponents = [...deps.data.meta, ...profile.outsiders];
  const sims = simulateFinalists(drafts, deps.sim, opponents, index, simOptions, (d, t) =>
    progress('simulate', d, t),
  );
  progress('score', 0, sims.length);
  const ranks = metaRanks(deps.data.rankings);
  const facing = new Map([...profile.weights, ...profile.outsiderWeights]);
  const extra = profile.outsiders.map((o) => o.speciesId);
  const scored = sims.map((t) => ({ t, score: scoreTeam(t, sims, view, facing, extra) }));
  scored.sort((a, b) => b.score.total - a.score.total);
  const best = scored[0];
  if (!best) {
    throw new Error('Nothing to analyze.');
  }
  const team = teamFrom(best.t, best.score, pool, view, index, ranks);
  team.id = 'custom';
  progress('score', sims.length, sims.length);

  const orders: OrderTried[] = scored.map(({ t, score }) => {
    const slots = t.slots.map((s) => s.candidate.build.speciesId) as [string, string, string];
    return {
      slots,
      names: slots.map((id) => fullName(id, index)) as [string, string, string],
      total: score.total,
      fit: score.fit,
    };
  });
  return {
    team,
    orders,
    hypothetical: resolved.filter((r) => r.hypothetical).map((r) => r.build.speciesId),
    chosenMoves: resolved.filter((_, i) => picks[i]?.moves).map((r) => r.build.speciesId),
    unranked: missing.map((m) => m.speciesId),
    assumptions: assumptionsFor(deps.data, opts, profile),
    ms: Date.now() - started,
  };
}
