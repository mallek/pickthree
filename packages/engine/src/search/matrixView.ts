import type { MatchupMatrix } from '../gamedata/types.js';
import { matrixIndex } from '../gamedata/types.js';

/** Convenience reads over the precomputed candidates-vs-meta matrix. */
export class MatrixView {
  readonly opponents: string[];
  readonly scenarioCount: number;
  private readonly rows = new Map<string, number>();
  private readonly oppIndex = new Map<string, number>();

  constructor(readonly matrix: MatchupMatrix) {
    this.opponents = matrix.opponents;
    this.scenarioCount = matrix.scenarios.length;
    matrix.candidates.forEach((id, i) => this.rows.set(id, i));
    matrix.opponents.forEach((id, i) => this.oppIndex.set(id, i));
  }

  rowOf(speciesId: string): number | null {
    return this.rows.get(speciesId) ?? null;
  }

  opponentIndex(speciesId: string): number {
    const i = this.oppIndex.get(speciesId);
    if (i === undefined) {
      throw new Error(`${speciesId} is not in the meta group`);
    }
    return i;
  }

  /** Index of the scenario with the given shield counts, e.g. [1,1]. */
  scenarioIndex(shields: [number, number]): number {
    const i = this.matrix.scenarios.findIndex(
      (s) => s.shields[0] === shields[0] && s.shields[1] === shields[1],
    );
    if (i < 0) {
      throw new Error(`No scenario with shields ${shields.join('-')}`);
    }
    return i;
  }

  rating(row: number, opponent: number, scenario: number): number {
    return this.matrix.ratings[matrixIndex(this.matrix, row, opponent, scenario)] as number;
  }

  /** Boolean win vector against every meta opponent for one scenario. */
  wins(row: number, scenario: number): boolean[] {
    const out = new Array<boolean>(this.opponents.length);
    for (let o = 0; o < this.opponents.length; o++) {
      out[o] = this.rating(row, o, scenario) > 500;
    }
    return out;
  }

  ratingsRow(row: number, scenario: number): number[] {
    const out = new Array<number>(this.opponents.length);
    for (let o = 0; o < this.opponents.length; o++) {
      out[o] = this.rating(row, o, scenario);
    }
    return out;
  }
}
