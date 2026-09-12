import { buildCost, type Cost } from '../builds/cost.js';
import type { Build, BuildOptions } from '../builds/eligibility.js';
import { recommendMoveset, rankingsById, type Moveset } from '../builds/moves.js';
import type { GameDataIndex } from '../gamedata/index.js';
import type { RankingCategory, RankingEntry } from '../gamedata/types.js';
import type { MatrixView } from './matrixView.js';

export type Rankings = Record<RankingCategory, RankingEntry[]>;
export type Role = 'lead' | 'switch' | 'closer';
export type RoleScores = Record<'leads' | 'switches' | 'closers' | 'chargers', number>;

export interface Candidate {
  build: Build;
  moveset: Moveset;
  cost: Cost;
  /** Blend of PvPoke overall score and role scores, 0..100. */
  score: number;
  overallScore: number;
  roleScores: RoleScores;
  matrixRow: number;
}

export interface CandidateOptions extends BuildOptions {
  poolSize: number;
  excludedSpecimenIds: string[];
}

function scoreOf(entries: Map<string, RankingEntry>, speciesId: string): number {
  return entries.get(speciesId)?.score ?? 0;
}

/**
 * Reduce all eligible builds to the strongest N distinct species. Rankings act as a filter only
 * here; everything downstream uses matchup data and simulation.
 */
export function candidatePool(
  builds: Build[],
  rankings: Rankings,
  view: MatrixView,
  index: GameDataIndex,
  opts: CandidateOptions,
): { pool: Candidate[]; dropped: { speciesId: string; reason: string }[] } {
  const overall = rankingsById(rankings.overall);
  const roles = {
    leads: rankingsById(rankings.leads),
    switches: rankingsById(rankings.switches),
    closers: rankingsById(rankings.closers),
    chargers: rankingsById(rankings.chargers),
  };
  const excluded = new Set(opts.excludedSpecimenIds);
  const dropped: { speciesId: string; reason: string }[] = [];
  const candidates: Candidate[] = [];

  for (const build of builds) {
    if (excluded.has(build.specimenId)) {
      continue;
    }
    if (build.needsXl && !opts.allowXl) {
      continue;
    }
    const row = view.rowOf(build.speciesId);
    if (row === null) {
      dropped.push({ speciesId: build.speciesId, reason: 'not in matchup matrix' });
      continue;
    }
    const moveset = recommendMoveset(
      build.speciesId,
      overall,
      build.specimen.currentMoves,
      { allowEliteTm: opts.allowEliteTm },
      index,
    );
    if (!opts.allowEliteTm && moveset.eliteTmCount > 0) {
      continue;
    }
    const cost = buildCost(build, moveset, index);
    if (opts.budgetStardust !== null && cost.stardust > opts.budgetStardust) {
      continue;
    }
    const roleScores: RoleScores = {
      leads: scoreOf(roles.leads, build.speciesId),
      switches: scoreOf(roles.switches, build.speciesId),
      closers: scoreOf(roles.closers, build.speciesId),
      chargers: scoreOf(roles.chargers, build.speciesId),
    };
    const overallScore = scoreOf(overall, build.speciesId);
    const roleMean =
      (roleScores.leads + roleScores.switches + roleScores.closers + roleScores.chargers) / 4;
    candidates.push({
      build,
      moveset,
      cost,
      score: 0.5 * overallScore + 0.5 * roleMean,
      overallScore,
      roleScores,
      matrixRow: row,
    });
  }

  // Best specimen per species: highest stat product, then cheaper.
  const bestBySpecies = new Map<string, Candidate>();
  for (const c of candidates) {
    const prev = bestBySpecies.get(c.build.speciesId);
    if (
      !prev ||
      c.build.ivRank.product > prev.build.ivRank.product ||
      (c.build.ivRank.product === prev.build.ivRank.product && c.cost.weight < prev.cost.weight)
    ) {
      bestBySpecies.set(c.build.speciesId, c);
    }
  }
  const pool = [...bestBySpecies.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.poolSize);
  return { pool, dropped };
}
