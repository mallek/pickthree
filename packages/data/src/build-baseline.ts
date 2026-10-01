/**
 * The generated team board per league: `baseline/<id>-teams.json`, the cold-start teams a team
 * board shows before anyone has shared a battle. meta.pick3.gg's bake used to be the only writer;
 * the data build now writes it for every league pick3 ships, so pick3's own board has one too.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  MatrixView,
  PROJECTION_SLOPE,
  priorWeights,
  type GeneratedFile,
} from '@pickthree/engine/meta';
import {
  GameDataIndex,
  PROJECTION_ANCHOR,
  buildOptionsFor,
  candidatePool,
  coldStartBuilds,
  coldStartSpecimens,
  generateColdStartTeams,
  spreadsFromGameMaster,
  type GameData,
  type GeneratedTeam,
  type League,
  type MatchupMatrix,
  type RankingEntry,
  type Rankings,
} from '@pickthree/engine';

/** Species the cold-start generator drafts from. 60 scores in about 300 ms a league. */
export const COLD_POOL = 60;
/** Generated teams emitted per league. */
export const COLD_TEAMS = 24;

/** The cold-start board for one league, weighted by PvPoke's own prior (facingWeight of overall
 *  rank): at build time there is no measured play, and the reader reweighs its own copy once there
 *  is. See priorWeights for why the weights are not optional. */
export function generateFor(input: {
  league: League;
  index: GameDataIndex;
  matrix: MatchupMatrix;
  rankings: Rankings;
  gameMaster: unknown;
}): GeneratedTeam[] {
  const view = new MatrixView(input.matrix);
  const opts = buildOptionsFor(input.league);
  const builds = coldStartBuilds(
    coldStartSpecimens(
      input.matrix.candidates,
      spreadsFromGameMaster(input.gameMaster, input.league.cp),
      input.index,
    ),
    input.index,
    opts,
  );
  const { pool } = candidatePool(builds, input.rankings, view, input.index, {
    ...opts,
    poolSize: COLD_POOL,
    excludedSpecimenIds: [],
    excludedSpecies: [],
  });
  const weights = priorWeights(input.rankings.overall, input.matrix.opponents);
  return generateColdStartTeams(
    pool,
    view,
    {
      types: (id: string) => input.index.mustSpecies(id).types,
      teamSpeciesOf: (id: string) => input.index.teamSpeciesOf(id),
    },
    { results: COLD_TEAMS, weights },
  );
}

function readJson<T>(...parts: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(...parts), 'utf8')) as T;
}

/**
 * Writes `baseline/<id>-teams.json` for every league that is not a special format and has a
 * matrix in `outDir` (none when PICKTHREE_SKIP_MATRIX=1 left it out, so the league is skipped).
 * Rankings come from `outDir` too, so a derived league drafts from its own filtered files.
 */
export function writeBaselineTeams(
  outDir: string,
  leagues: readonly League[],
  data: Pick<GameData, 'species' | 'moves'>,
  gameMaster: unknown,
  manifest: { pvpokeCommit: string; pvpokeDate: string },
): { league: string; teams: number }[] {
  const index = new GameDataIndex(data.species, data.moves);
  const written: { league: string; teams: number }[] = [];
  for (const league of leagues) {
    if (league.kind === 'special') {
      continue;
    }
    const matrixPath = path.join(outDir, 'matrix', `${league.id}.json`);
    if (!fs.existsSync(matrixPath)) {
      continue;
    }
    const matrix = readJson<MatchupMatrix>(matrixPath);
    const rank = (cat: string): RankingEntry[] =>
      readJson<RankingEntry[]>(outDir, 'rankings', league.id, `${cat}.json`);
    const rankings: Rankings = {
      overall: rank('overall'),
      leads: rank('leads'),
      switches: rank('switches'),
      closers: rank('closers'),
      chargers: rank('chargers'),
    };
    const file: GeneratedFile = {
      league: league.id,
      source: 'generated',
      pvpokeCommit: manifest.pvpokeCommit,
      pvpokeDate: manifest.pvpokeDate,
      projectionSlope: PROJECTION_SLOPE,
      projectionAnchor: PROJECTION_ANCHOR,
      teams: generateFor({ league, index, matrix, rankings, gameMaster }),
    };
    fs.mkdirSync(path.join(outDir, 'baseline'), { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'baseline', `${league.id}-teams.json`),
      JSON.stringify(file),
    );
    written.push({ league: league.id, teams: file.teams.length });
  }
  return written;
}
