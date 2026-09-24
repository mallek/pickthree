import { sumCosts, type Cost } from './builds/cost.js';
import {
  buildOptionsFor,
  buildsFor,
  DEFAULT_BUILD_OPTIONS,
  type Build,
  type BuildOptions,
} from './builds/eligibility.js';
import { simOptionsFor, type League } from './gamedata/league.js';
import { rankingsById } from './builds/moves.js';
import { metaRanks, type MetaRank } from './gamedata/metaRank.js';
import type { Specimen } from './collection/specimen.js';
import { explainTeam, type Explanation } from './explain/explain.js';
import { GameDataIndex } from './gamedata/index.js';
import type { DataManifest, MatchupMatrix, MetaEntry, Move, Species } from './gamedata/types.js';
import { candidatePool, type Candidate, type Rankings, type Role } from './search/candidates.js';
import { simulateFinalists, type SlotSim, type TeamSim } from './search/finalists.js';
import { MatrixView } from './search/matrixView.js';
import {
  DEFAULT_TRIO_OPTIONS,
  generateTrios,
  type Structure,
  type TeamStyle,
} from './search/trios.js';
import { scoreTeam, type TeamScore } from './score/score.js';
import type { BattleSimulator, SimOptions } from './sim/BattleSimulator.js';
import { specimenVerdict, type Verdict } from './verdicts/worth.js';
import { profileFor, type FacingInput, type FacingSource } from './yourmeta/facing.js';
import { facingLine, type FacingProfile } from './yourmeta/profile.js';

export { profileFor } from './yourmeta/facing.js';

export interface StaticData {
  species: Species[];
  moves: Move[];
  /** The league this bundle's rankings, meta and matrix belong to. */
  league: League;
  rankings: Rankings;
  meta: MetaEntry[];
  matrix: MatchupMatrix;
  manifest: DataManifest;
  /** The Play! ban list for this league (legal/<league>.json). Absent means none shipped. */
  banned?: string[];
}

export interface RecommendOptions extends BuildOptions {
  poolSize: number;
  finalists: number;
  style: TeamStyle;
  excludedSpecimenIds: string[];
  /** How many teams to return. */
  results: number;
  /** Whose opponents to weight. Absent means PvPoke. */
  facing?: FacingInput;
}

export const DEFAULT_RECOMMEND_OPTIONS: RecommendOptions = {
  ...DEFAULT_BUILD_OPTIONS,
  poolSize: 40,
  finalists: 25,
  style: 'any',
  excludedSpecimenIds: [],
  results: 10,
};

export interface Assumptions {
  league: string;
  leagueTitle: string;
  cpCap: number;
  levelCap: number;
  shields: { lead: string; switch: string; closer: string };
  ivs: string;
  metaName: string;
  metaSize: number;
  facing: string;
  source: FacingSource;
  pvpokeCommit: string;
  pvpokeDate: string;
  gamemasterTimestamp: string;
  dataBuiltAt: string;
}

export interface SlotRecommendation {
  role: Role;
  candidate: Candidate;
  sim: SlotSim;
  roleWhy: string;
}

export interface TeamRecommendation {
  id: string;
  slots: [SlotRecommendation, SlotRecommendation, SlotRecommendation];
  structure: Structure;
  score: TeamScore;
  explanation: Explanation;
  cost: Cost;
  hasShadow: boolean;
  needsXl: boolean;
  eliteTms: number;
  leadCounters: string[];
}

export interface Recommendation {
  teams: TeamRecommendation[];
  assumptions: Assumptions;
  stats: {
    specimens: number;
    eligibleBuilds: number;
    poolSize: number;
    triosScored: number;
    finalists: number;
    ms: number;
    dropped: { speciesId: string; reason: string }[];
  };
}

export type ProgressFn = (stage: string, done: number, total: number) => void;

export interface EngineDeps {
  data: StaticData;
  sim: BattleSimulator;
  simOptions?: SimOptions;
}

export function assumptionsFor(
  data: StaticData,
  opts: BuildOptions,
  profile?: FacingProfile,
): Assumptions {
  return {
    league: data.league.id,
    leagueTitle: data.league.title,
    cpCap: opts.cpCap,
    levelCap: opts.allowXl ? opts.levelCap : Math.min(opts.levelCap, 40),
    shields: {
      lead: '1 shield each',
      switch: '1 shield each, switching in with energy',
      closer: 'no shields',
    },
    ivs: 'Your exact specimens versus opponents at PvPoke default IVs',
    metaName: `PvPoke ${data.league.title} meta group`,
    metaSize: data.meta.length,
    facing: profile ? facingLine(profile) : 'PvPoke weights only',
    source: profile?.source ?? 'prior',
    pvpokeCommit: data.manifest.pvpokeCommit,
    pvpokeDate: data.manifest.pvpokeDate,
    gamemasterTimestamp: data.manifest.gamemasterTimestamp,
    dataBuiltAt: data.manifest.builtAt,
  };
}

/** A simulated, scored team with its explanation attached. */
export function teamFrom(
  t: TeamSim,
  score: TeamScore,
  pool: Candidate[],
  view: MatrixView,
  index: GameDataIndex,
  ranks: Map<string, MetaRank>,
): TeamRecommendation {
  const explanation = explainTeam(t, score, pool, view, index, ranks);
  const slots = t.slots.map((s) => ({
    role: s.role,
    candidate: s.candidate,
    sim: s,
    roleWhy: explanation.roleWhy[s.role],
  })) as [SlotRecommendation, SlotRecommendation, SlotRecommendation];
  return {
    id: t.slots.map((s) => s.candidate.build.specimenId).join('-'),
    slots,
    structure: t.draft.structure,
    score,
    explanation,
    cost: sumCosts(t.slots.map((s) => s.candidate.cost)),
    hasShadow: t.slots.some((s) => s.candidate.build.shadow),
    needsXl: t.slots.some((s) => s.candidate.build.needsXl),
    eliteTms: t.slots.reduce((acc, s) => acc + s.candidate.moveset.eliteTmCount, 0),
    leadCounters: t.draft.leadCounters,
  };
}

export function recommend(
  specimens: Specimen[],
  options: Partial<RecommendOptions>,
  deps: EngineDeps,
  onProgress?: ProgressFn,
): Recommendation {
  const started = Date.now();
  const opts: RecommendOptions = {
    ...DEFAULT_RECOMMEND_OPTIONS,
    ...buildOptionsFor(deps.data.league),
    ...options,
  };
  const simOptions = deps.simOptions ?? simOptionsFor(deps.data.league);
  const index = new GameDataIndex(deps.data.species, deps.data.moves);
  const view = new MatrixView(deps.data.matrix);
  const progress: ProgressFn = onProgress ?? (() => {});

  progress('eligibility', 0, specimens.length);
  const builds: Build[] = [];
  specimens.forEach((s, i) => {
    builds.push(...buildsFor(s, index, opts));
    if (i % 50 === 0) {
      progress('eligibility', i, specimens.length);
    }
  });
  progress('eligibility', specimens.length, specimens.length);

  progress('candidates', 0, 1);
  const { pool, dropped } = candidatePool(builds, deps.data.rankings, view, index, opts);
  progress('candidates', 1, 1);

  const typesOf = { types: (id: string) => index.mustSpecies(id).types };
  const { drafts, scored } = generateTrios(
    pool,
    view,
    typesOf,
    { ...DEFAULT_TRIO_OPTIONS, finalists: opts.finalists, style: opts.style },
    (d, t) => progress('trios', d, t),
  );

  const profile = profileFor(deps.data, view, opts.facing);
  const opponents = [...deps.data.meta, ...profile.outsiders];
  const sims = simulateFinalists(drafts, deps.sim, opponents, index, simOptions, (d, t) =>
    progress('simulate', d, t),
  );

  progress('score', 0, sims.length);
  const ranks = metaRanks(deps.data.rankings);
  const facing = new Map([...profile.weights, ...profile.outsiderWeights]);
  const extra = profile.outsiders.map((o) => o.speciesId);
  const scored2 = sims.map((t) => ({ t, score: scoreTeam(t, sims, view, facing, extra) }));
  scored2.sort((a, b) => b.score.total - a.score.total);
  const top = diversify(scored2, opts.results);
  const teams: TeamRecommendation[] = top.map(({ t, score }, i) => {
    const team = teamFrom(t, score, pool, view, index, ranks);
    progress('score', i + 1, top.length);
    return team;
  });

  return {
    teams,
    assumptions: assumptionsFor(deps.data, opts, profile),
    stats: {
      specimens: specimens.length,
      eligibleBuilds: builds.length,
      poolSize: pool.length,
      triosScored: scored,
      finalists: sims.length,
      ms: Date.now() - started,
      dropped,
    },
  };
}

/**
 * Pick the top N while keeping the feed varied: a team may share at most one species with any
 * team already picked. Falls back to the plain ranking when that runs dry.
 */
function diversify<T extends { t: TeamSim }>(sorted: T[], n: number): T[] {
  const picked: T[] = [];
  const speciesOf = (x: T): string[] => x.t.slots.map((s) => s.candidate.build.speciesId);
  for (const item of sorted) {
    if (picked.length >= n) {
      break;
    }
    const mine = speciesOf(item);
    const clash = picked.some((p) => speciesOf(p).filter((id) => mine.includes(id)).length >= 2);
    if (!clash) {
      picked.push(item);
    }
  }
  for (const item of sorted) {
    if (picked.length >= n) {
      break;
    }
    if (!picked.includes(item)) {
      picked.push(item);
    }
  }
  return picked;
}

export function verdictsFor(
  specimens: Specimen[],
  options: Partial<BuildOptions>,
  deps: EngineDeps,
  onProgress?: ProgressFn,
): Record<string, Verdict> {
  const opts: BuildOptions = { ...buildOptionsFor(deps.data.league), ...options };
  const index = new GameDataIndex(deps.data.species, deps.data.moves);
  const view = new MatrixView(deps.data.matrix);
  const overall = rankingsById(deps.data.rankings.overall);
  const ranks = metaRanks(deps.data.rankings);
  const out: Record<string, Verdict> = {};
  specimens.forEach((s, i) => {
    try {
      out[s.id] = specimenVerdict(s, {
        index,
        league: deps.data.league,
        overall,
        metaRanks: ranks,
        view,
        meta: deps.data.meta,
        sim: deps.sim,
        simOptions: deps.simOptions ?? simOptionsFor(deps.data.league),
        buildOptions: opts,
      });
    } catch (e) {
      // One bad row must never take the whole collection down with it.
      out[s.id] = {
        specimenId: s.id,
        label: 'Not eligible',
        line: `pick3 could not judge this one: ${e instanceof Error ? e.message : String(e)}`,
        build: null,
        moveset: null,
        cost: null,
        perfectDelta: null,
        perfectLine: null,
        metaWins: null,
        metaSize: deps.data.meta.length,
        metaRank: null,
        formNote: null,
        ineligible: null,
      };
    }
    if (onProgress && (i % 10 === 0 || i === specimens.length - 1)) {
      onProgress('verdicts', i + 1, specimens.length);
    }
  });
  return out;
}

export type { TeamSim };
