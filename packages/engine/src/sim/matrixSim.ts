import { simOptionsFor, type League } from '../gamedata/league.js';
import { matrixIndex, type MatchupMatrix } from '../gamedata/types.js';
import type { BattleSimulator, SimPokemonSpec } from './BattleSimulator.js';

/** A species with the moveset it fights with: fast move first, then one or two charged. */
export interface MatrixFighter {
  speciesId: string;
  moveset: string[];
}

/** What filling a matrix gap on the device needs: the simulator and the league it was built for. */
export interface MatrixSimDeps {
  sim: BattleSimulator;
  league: League;
  onProgress?: (done: number, total: number) => void;
}

function specFor(f: MatrixFighter, shields: number, energy: number): SimPokemonSpec {
  return {
    speciesId: f.speciesId,
    fastMove: f.moveset[0] ?? '',
    chargedMoves: f.moveset.slice(1, 3),
    shields,
    startEnergyTurns: energy,
  };
}

/**
 * Battles every candidate against every opponent in each of the matrix's scenarios, exactly the
 * way the data build filled the shipped matrix (PvPoke default IVs on both sides), and returns a
 * matrix of just those cells.
 */
export function simulateMatrix(
  template: Pick<MatchupMatrix, 'league' | 'cp' | 'scenarios'>,
  candidates: MatrixFighter[],
  opponents: MatrixFighter[],
  deps: MatrixSimDeps,
): MatchupMatrix {
  const m: MatchupMatrix = {
    league: template.league,
    cp: template.cp,
    scenarios: template.scenarios,
    candidates: candidates.map((c) => c.speciesId),
    opponents: opponents.map((o) => o.speciesId),
    candidateMovesets: Object.fromEntries(candidates.map((c) => [c.speciesId, [...c.moveset]])),
    opponentMovesets: Object.fromEntries(opponents.map((o) => [o.speciesId, [...o.moveset]])),
    ratings: new Array<number>(
      candidates.length * opponents.length * template.scenarios.length,
    ).fill(0),
  };
  const simOptions = simOptionsFor(deps.league);
  const total = m.ratings.length;
  let done = 0;
  candidates.forEach((c, ci) => {
    opponents.forEach((o, oi) => {
      template.scenarios.forEach((s, si) => {
        const r = deps.sim.simulate(
          specFor(c, s.shields[0], s.energy[0]),
          specFor(o, s.shields[1], s.energy[1]),
          simOptions,
        );
        m.ratings[matrixIndex(m, ci, oi, si)] = r.rating;
        done += 1;
        if (deps.onProgress && (done % 24 === 0 || done === total)) {
          deps.onProgress(done, total);
        }
      });
    });
  });
  return m;
}

/**
 * The shipped matrix plus rows for species it lacks, simulated against its own opponents at
 * their matrix movesets. Everything that reads the matrix by row works on the result unchanged.
 */
export function withSimulatedRows(
  matrix: MatchupMatrix,
  rows: MatrixFighter[],
  deps: MatrixSimDeps,
): MatchupMatrix {
  const fresh = rows.filter((r) => !matrix.candidates.includes(r.speciesId));
  if (fresh.length === 0) {
    return matrix;
  }
  const opponents = matrix.opponents.map((id) => ({
    speciesId: id,
    moveset: matrix.opponentMovesets[id] ?? [],
  }));
  const extra = simulateMatrix(matrix, fresh, opponents, deps);
  return {
    ...matrix,
    candidates: [...matrix.candidates, ...extra.candidates],
    candidateMovesets: { ...matrix.candidateMovesets, ...extra.candidateMovesets },
    ratings: [...matrix.ratings, ...extra.ratings],
  };
}
