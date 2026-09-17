import { buildOptionsFor, buildsFor, type BuildOptions } from '../builds/eligibility.js';
import { movePool, rankingsById, recommendMoveset, type MoveChoice } from '../builds/moves.js';
import type { Specimen } from '../collection/specimen.js';
import { GameDataIndex } from '../gamedata/index.js';
import { simOptionsFor } from '../gamedata/league.js';
import { classify, effectiveness, type Efficacy } from '../gamedata/typeChart.js';
import type { PokemonType } from '../gamedata/types.js';
import type { StaticData } from '../recommend.js';
import type { BattleSimulator, SimPokemonSpec } from '../sim/BattleSimulator.js';
import type { TeamRef } from './types.js';

export const SHIELD_COUNTS = [0, 1, 2] as const;

/** One of the opponent's likely moves, with how many fast moves reach it. */
export interface FaceoffMove {
  moveId: string;
  name: string;
  type: PokemonType;
  /** Fast moves to reach the charged move the first time; null for the fast move itself. */
  countFromFast: number | null;
  /** True for PvPoke's recommended set; false for the next most used alternative. */
  recommended: boolean;
}

export type FaceoffVerdict = 'wins' | 'loses' | 'shields';

/** How one of the opponent's moves lands on one of your members. */
export interface FaceoffCell {
  efficacy: Efficacy;
  /** Combined multiplier; 2.56 and 0.39 are the doubled cases worth marking. */
  multiplier: number;
}

export interface FaceoffMember {
  speciesId: string;
  specimenId: string | null;
  /** True when the member ran its real IVs and level from the collection. */
  realIvs: boolean;
  fast: string;
  charged: string[];
  /** One cell per opponent move, fast move first, in the Faceoff's moves order. */
  cells: FaceoffCell[];
  /** Battle rating (0 to 1000) per shield pair, index = your shields * 3 + their shields. */
  grid: number[];
  /** Shield pairs won, 0 to 9. */
  wins: number;
  /** Equal-shield pairs won (0-0, 1-1, 2-2), 0 to 3: the head-to-head the verdict reads. */
  evenWins: number;
  /** wins and loses need all three equal-shield pairs; anything split is shields. */
  verdict: FaceoffVerdict;
}

export interface Faceoff {
  opponent: string;
  /** False when the species has no PvPoke ranking; its moveset is then a stat guess. */
  ranked: boolean;
  /** Fast move first, then up to three charged moves. */
  moves: FaceoffMove[];
  members: FaceoffMember[];
  /** Index into members of the strongest answer, null with no members. */
  best: number | null;
  battles: number;
  ms: number;
}

const NO_MOVES = { fast: null, charged: [] };

function faceoffMove(m: MoveChoice, recommended: boolean): FaceoffMove {
  return {
    moveId: m.moveId,
    name: m.name,
    type: m.type,
    countFromFast: m.countFromFast,
    recommended,
  };
}

/**
 * What to expect from one opponent, for the in-battle card: its likely moves with counts, how
 * each lands on each of your three by type, and a simulated shield grid per member.
 */
export function faceoff(
  data: StaticData,
  team: TeamRef,
  specimens: Specimen[],
  opponent: string,
  sim: BattleSimulator,
  options: Partial<BuildOptions> = {},
): Faceoff {
  const started = Date.now();
  const index = new GameDataIndex(data.species, data.moves);
  const opts: BuildOptions = { ...buildOptionsFor(data.league), minCp: 0, ...options };
  const simOptions = simOptionsFor(data.league);
  const overall = rankingsById(data.rankings.overall);
  const lenient = { allowEliteTm: true };

  // Their likely moves: the recommended set, then the next most used charged move.
  const rec = recommendMoveset(opponent, overall, NO_MOVES, lenient, index);
  const pool = movePool(opponent, rec.fast.moveId, overall, NO_MOVES, lenient, index);
  const entry = overall.get(opponent);
  const chargedIds = [
    ...rec.charged.map((c) => c.moveId),
    ...(entry?.chargedMoves.map((u) => u.moveId) ?? []),
  ].filter((id, i, arr) => arr.indexOf(id) === i);
  const moves: FaceoffMove[] = [faceoffMove(rec.fast, true)];
  for (const id of chargedIds) {
    const choice = pool.charged.find((c) => c.moveId === id);
    if (choice && moves.length < 4) {
      moves.push(
        faceoffMove(
          choice,
          rec.charged.some((c) => c.moveId === id),
        ),
      );
    }
  }
  const them: Omit<SimPokemonSpec, 'shields'> = {
    speciesId: opponent,
    fastMove: rec.fast.moveId,
    chargedMoves: rec.charged.map((c) => c.moveId),
  };

  let battles = 0;
  const members: FaceoffMember[] = team.species.map((speciesId, i) => {
    const specimenId = team.specimenIds?.[i] ?? null;
    const specimen = specimenId ? specimens.find((s) => s.id === specimenId) : undefined;
    const build = specimen
      ? buildsFor(specimen, index, opts).find((b) => b.speciesId === speciesId)
      : undefined;
    const moveset = recommendMoveset(
      speciesId,
      overall,
      build?.specimen.currentMoves ?? NO_MOVES,
      { allowEliteTm: opts.allowEliteTm },
      index,
    );
    const me: Omit<SimPokemonSpec, 'shields'> = {
      speciesId,
      fastMove: moveset.fast.moveId,
      chargedMoves: moveset.charged.map((c) => c.moveId),
      ...(build ? { ivs: build.ivs, level: build.level } : {}),
    };
    const types = index.mustSpecies(speciesId).types;
    const cells: FaceoffCell[] = moves.map((m) => {
      const multiplier = effectiveness(m.type, types);
      return { efficacy: classify(multiplier), multiplier };
    });
    const grid: number[] = [];
    for (const mine of SHIELD_COUNTS) {
      for (const theirs of SHIELD_COUNTS) {
        const r = sim.simulate({ ...me, shields: mine }, { ...them, shields: theirs }, simOptions);
        grid.push(r.rating);
        battles += 1;
      }
    }
    const wins = grid.filter((r) => r > 500).length;
    const evenWins = SHIELD_COUNTS.filter((n) => (grid[n * 3 + n] as number) > 500).length;
    return {
      speciesId,
      specimenId: build ? specimenId : null,
      realIvs: Boolean(build),
      fast: moveset.fast.moveId,
      charged: moveset.charged.map((c) => c.moveId),
      cells,
      grid,
      wins,
      evenWins,
      verdict: evenWins === SHIELD_COUNTS.length ? 'wins' : evenWins === 0 ? 'loses' : 'shields',
    };
  });

  const mean = (g: number[]): number => g.reduce((a, b) => a + b, 0) / Math.max(1, g.length);
  let best: number | null = null;
  members.forEach((m, i) => {
    const b = best === null ? null : members[best];
    if (
      !b ||
      m.evenWins > b.evenWins ||
      (m.evenWins === b.evenWins &&
        (m.wins > b.wins || (m.wins === b.wins && mean(m.grid) > mean(b.grid))))
    ) {
      best = i;
    }
  });

  return {
    opponent,
    ranked: entry !== undefined,
    moves,
    members,
    best,
    battles,
    ms: Date.now() - started,
  };
}
