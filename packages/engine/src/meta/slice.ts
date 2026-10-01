/**
 * The per-league matchup slice: roughly the top 250 species by PvPoke rank, measured at 61 KB
 * gzipped for Great League, which is what lets a browser project a team with no simulator. The
 * bake cuts it with `sliceMatrix`; clients fetch it lazily.
 *
 * A team or core with ANY member outside the slice gets no projection, rather than a partial one
 * computed from the members that happen to be covered: a projection missing a member is not a
 * weaker projection, it is a wrong one. `teamRank.ts` enforces that; the slice only says who has
 * a row, through `MatrixView.rowOf` returning null.
 */
import { matrixIndex, type MatchupMatrix } from '../gamedata/types.js';
import { MatrixView } from '../search/matrixView.js';

/** One baked generated team. The strength was scored against PvPoke's prior at bake time; the
 *  site recomputes it against the blended weights whenever the slice is in hand. */
export interface GeneratedTeamLite {
  species: [string, string, string];
  strength: number;
  coverage: number;
  consistency: number;
  safety: number;
  structure: 'ABB' | 'ABC';
  exposure: string[];
}

export interface GeneratedFile {
  league: string;
  source: 'generated';
  pvpokeCommit: string;
  pvpokeDate: string;
  projectionSlope: number;
  /**
   * Fix round 1, item 5: the file used to stamp the slope alone, recording half a calibration.
   * Nothing reads this field today either (`expectedWinRate`'s anchor is only ever the engine's
   * own default), but it is free to keep the snapshot honest for whoever next bisects a live
   * ranking against a past bake.
   */
  projectionAnchor: number;
  teams: GeneratedTeamLite[];
}

/** How many species the shipped slice carries, by PvPoke overall rank. Measured at 61 KB gzipped
 *  for Great League; the bake prints the raw size so a bump that doubles it is visible. */
export const MATRIX_TOP = 250;

/** The shipped matrix cut to its first `top` rows. Rows are already in PvPoke overall order,
 *  because build-matrix.ts fills them straight from rankings/<league>/overall.json. */
export function sliceMatrix(matrix: MatchupMatrix, top: number): MatchupMatrix {
  if (matrix.candidates.length <= top) {
    return matrix;
  }
  const candidates = matrix.candidates.slice(0, top);
  const out: MatchupMatrix = {
    league: matrix.league,
    cp: matrix.cp,
    scenarios: matrix.scenarios,
    candidates,
    opponents: matrix.opponents,
    candidateMovesets: Object.fromEntries(
      candidates.map((id) => [id, [...(matrix.candidateMovesets[id] ?? [])]]),
    ),
    opponentMovesets: matrix.opponentMovesets,
    ratings: [],
  };
  const view = new MatrixView(matrix);
  const ratings = new Array<number>(
    candidates.length * matrix.opponents.length * matrix.scenarios.length,
  ).fill(0);
  candidates.forEach((id, ci) => {
    const from = view.rowOf(id) as number;
    matrix.opponents.forEach((_, oi) => {
      matrix.scenarios.forEach((_, si) => {
        ratings[matrixIndex(out, ci, oi, si)] = view.rating(from, oi, si);
      });
    });
  });
  out.ratings = ratings;
  return out;
}
