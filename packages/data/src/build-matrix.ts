import fs from 'node:fs';
import path from 'node:path';
import type { BattleSimulator, League, MatchupMatrix, MatrixScenario } from '@pickthree/engine';
import { GREAT_LEAGUE_DEF, matrixIndex, simOptionsFor } from '@pickthree/engine';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { readRawGameMaster } from './build-gamedata.js';
import { effectiveMoveset, readMeta, readOverrides, readRankings } from './build-rankings.js';

export const MATRIX_SCENARIOS: MatrixScenario[] = [
  { shields: [0, 0], energy: [0, 0] },
  { shields: [1, 1], energy: [0, 0] },
  { shields: [2, 2], energy: [0, 0] },
];

export interface MatrixInput {
  sim: BattleSimulator;
  league: League;
  candidates: { speciesId: string; moveset: string[] }[];
  opponents: { speciesId: string; moveset: string[] }[];
  scenarios: MatrixScenario[];
  onProgress?: (done: number, total: number) => void;
}

export function buildMatrix(input: MatrixInput): MatchupMatrix {
  const simOptions = simOptionsFor(input.league);
  const m: MatchupMatrix = {
    league: input.league.id,
    cp: input.league.cp,
    scenarios: input.scenarios.map((s) => ({ shields: s.shields, energy: s.energy })),
    candidates: input.candidates.map((c) => c.speciesId),
    opponents: input.opponents.map((o) => o.speciesId),
    candidateMovesets: Object.fromEntries(
      input.candidates.map((c) => [c.speciesId, [...c.moveset]]),
    ),
    opponentMovesets: Object.fromEntries(input.opponents.map((o) => [o.speciesId, [...o.moveset]])),
    ratings: new Array<number>(
      input.candidates.length * input.opponents.length * input.scenarios.length,
    ).fill(0),
  };
  const total = m.ratings.length;
  let done = 0;
  input.candidates.forEach((c, ci) => {
    input.opponents.forEach((o, oi) => {
      input.scenarios.forEach((s, si) => {
        const r = input.sim.simulate(
          {
            speciesId: c.speciesId,
            fastMove: c.moveset[0] ?? '',
            chargedMoves: c.moveset.slice(1),
            shields: s.shields[0],
            startEnergyTurns: s.energy[0],
          },
          {
            speciesId: o.speciesId,
            fastMove: o.moveset[0] ?? '',
            chargedMoves: o.moveset.slice(1),
            shields: s.shields[1],
            startEnergyTurns: s.energy[1],
          },
          simOptions,
        );
        m.ratings[matrixIndex(m, ci, oi, si)] = r.rating;
        done += 1;
        if (input.onProgress && (done % 500 === 0 || done === total)) {
          input.onProgress(done, total);
        }
      });
    });
  });
  return m;
}

export function writeMatrix(
  outDir: string,
  league: League = GREAT_LEAGUE_DEF,
  sim: BattleSimulator = new PvPokeSimulator(loadPvPokeInNode(readRawGameMaster())),
): MatchupMatrix {
  const overall = readRankings(league.cup, league.cp, 'overall');
  const overrides = readOverrides(league.cup, league.cp);
  const candidates = overall.map((e) => ({
    speciesId: e.speciesId,
    moveset: effectiveMoveset(e.speciesId, overall, overrides),
  }));
  const opponents = readMeta(league.meta).map((o) => ({
    speciesId: o.speciesId,
    // Some meta groups list three charged moves; a battle uses two.
    moveset: [o.fastMove, ...o.chargedMoves.slice(0, 2)],
  }));
  const started = Date.now();
  const m = buildMatrix({
    sim,
    league,
    candidates,
    opponents,
    scenarios: MATRIX_SCENARIOS,
    onProgress: (d, t) => {
      process.stdout.write(
        `\rmatrix ${league.id} ${d}/${t} (${Math.round((Date.now() - started) / 1000)}s)`,
      );
    },
  });
  process.stdout.write('\n');
  fs.mkdirSync(path.join(outDir, 'matrix'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'matrix', `${league.id}.json`), JSON.stringify(m));
  return m;
}
