/**
 * Turns the data build's static JSON into the handful of small files meta.pick3.gg ships.
 * Reads apps/web/public/data (produced by `npm run data:build`), writes apps/meta/public.
 * `bake` is pure so it can be tested; only `main` touches the disk.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  facingWeight,
  legalFor,
  MatrixView,
  matrixIndex,
  OPEN_EQUIVALENT_CUP,
  ranksOf,
  readEpochs,
  type LegalFile,
  type MatchupMatrix,
} from '@pickthree/engine/meta';
import {
  GameDataIndex,
  PROJECTION_ANCHOR,
  PROJECTION_SLOPE,
  buildOptionsFor,
  candidatePool,
  coldStartBuilds,
  coldStartSpecimens,
  generateColdStartTeams,
  spreadsFromGameMaster,
  type GeneratedTeam,
  type League as EngineLeague,
  type Move,
  type RankingEntry,
  type Rankings,
  type Species,
} from '@pickthree/engine';

export { legalFor, OPEN_EQUIVALENT_CUP, ranksOf, readEpochs, type LegalFile };

export type SpeciesFile = Record<string, [string, number, string]>;
export type MovesFile = Record<string, [string, string]>;

export interface BaselineSpecies {
  speciesId: string;
  score: number | null;
  rating: number | null;
  fastMove: string;
  chargedMoves: string[];
  fastUsage: { moveId: string; uses: number }[];
  chargedUsage: { moveId: string; uses: number }[];
}

export interface BaselineFile {
  league: string;
  source: 'pvpoke';
  pvpokeCommit: string;
  pvpokeDate: string;
  species: BaselineSpecies[];
}

export interface Baked {
  species: SpeciesFile;
  moves: MovesFile;
  baselines: Record<string, BaselineFile>;
}

/** The most moves of one kind a baseline entry carries. */
const MOVE_LIMIT = 4;

/**
 * The leagues this SITE has. The data build also ships the app's tournament cup leagues
 * (League.kind 'cup') and, behind PICKTHREE_SPECIAL_CUPS, PvPoke's special formats; neither is a
 * population of shared battles, so neither belongs in the site's league switcher, its baselines,
 * its matrix slices or its legality files. The Tournament league is a ruleset to build a team
 * for, which is the app's job, and it is deliberately not the Tournaments source on this site.
 */
export function siteLeagues<T extends { kind: string }>(leagues: readonly T[]): T[] {
  return leagues.filter((l) => l.kind === 'standard');
}

interface PokemonIn {
  speciesId: string;
  speciesName: string;
  dex: number;
  types: string[];
}
interface MoveIn {
  moveId: string;
  name: string;
  type: string;
}
interface MetaIn {
  speciesId: string;
  fastMove: string;
  chargedMoves: string[];
}
interface RankIn {
  speciesId: string;
  score?: number;
  rating?: number;
  fastMoves?: { moveId: string; uses: number }[];
  chargedMoves?: { moveId: string; uses: number }[];
}

export function bake(input: {
  pokemon: unknown[];
  moves: unknown[];
  leagues: { id: string; meta: string; kind: string }[];
  metaGroups: Record<string, MetaIn[]>;
  rankings: Record<string, unknown[]>;
  manifest: { pvpokeCommit: string; pvpokeDate: string };
}): Baked {
  const species: SpeciesFile = {};
  for (const raw of input.pokemon as PokemonIn[]) {
    const types = raw.types.filter((t) => t !== 'none');
    species[raw.speciesId] = [raw.speciesName, raw.dex, types.join(',')];
  }

  const moves: MovesFile = {};
  for (const raw of input.moves as MoveIn[]) {
    moves[raw.moveId] = [raw.name, raw.type];
  }

  const baselines: Record<string, BaselineFile> = {};
  for (const league of siteLeagues(input.leagues)) {
    const group = input.metaGroups[league.id] ?? [];
    const ranked = new Map(
      ((input.rankings[league.id] ?? []) as RankIn[]).map((r) => [r.speciesId, r]),
    );
    const entries: BaselineSpecies[] = group.map((m) => {
      const r = ranked.get(m.speciesId);
      return {
        speciesId: m.speciesId,
        score: typeof r?.score === 'number' ? r.score : null,
        rating: typeof r?.rating === 'number' ? r.rating : null,
        fastMove: m.fastMove,
        chargedMoves: [...m.chargedMoves],
        fastUsage: (r?.fastMoves ?? []).slice(0, MOVE_LIMIT),
        chargedUsage: (r?.chargedMoves ?? []).slice(0, MOVE_LIMIT),
      };
    });
    entries.sort(
      (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.speciesId.localeCompare(b.speciesId),
    );
    baselines[league.id] = {
      league: league.id,
      source: 'pvpoke',
      pvpokeCommit: input.manifest.pvpokeCommit,
      pvpokeDate: input.manifest.pvpokeDate,
      species: entries,
    };
  }

  return { species, moves, baselines };
}

/** How many species the shipped slice carries, by PvPoke overall rank. Measured at 61 KB gzipped
 *  for Great League; the bake prints the raw size so a bump that doubles it is visible. */
export const MATRIX_TOP = 250;
/** Species the cold-start generator drafts from. 60 scores in about 300 ms a league. */
export const COLD_POOL = 60;
/** Generated teams emitted per league. */
export const COLD_TEAMS = 24;

/**
 * PvPoke's own prior for how often each meta opponent is actually faced, normalised to sum to 1.
 * The matrix stores its opponent columns alphabetically, not by rank, so without this
 * `strengthContext`'s "top ten of the meta" is an alphabetical accident: every opponent counts
 * the same and the generator ends up scoring every team against whichever ten names happen to
 * sort first. Weighting by `facingWeight` of the PvPoke overall rank makes "the top of the meta"
 * mean what the spec says it means, both here and in the site's own reweigh once there is
 * measured play.
 */
export function priorWeights(
  overall: readonly { speciesId: string }[],
  opponents: readonly string[],
): Map<string, number> {
  const rankOf = new Map(ranksOf(overall).map((id, i) => [id, i + 1]));
  const raw = opponents.map((id) => facingWeight(rankOf.get(id) ?? null));
  const total = raw.reduce((a, b) => a + b, 0);
  return new Map(opponents.map((id, i) => [id, total === 0 ? 0 : (raw[i] as number) / total]));
}

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

/** The cold-start board for one league, weighted by PvPoke's own prior (facingWeight of overall
 *  rank): at bake time there is no measured play, and the site reweighs its own copy once there
 *  is. See priorWeights for why the weights are not optional. */
export function generateFor(input: {
  league: EngineLeague;
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
  });
  const weights = priorWeights(input.rankings.overall, input.matrix.opponents);
  return generateColdStartTeams(
    pool,
    view,
    { types: (id: string) => input.index.mustSpecies(id).types },
    { results: COLD_TEAMS, weights },
  );
}

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', '..', 'web', 'public', 'data');
const OUT = join(here, '..', 'public');

async function readJson<T>(...parts: string[]): Promise<T> {
  return JSON.parse(await readFile(join(...parts), 'utf8')) as T;
}

async function main(): Promise<void> {
  let allLeagues: { id: string; meta: string; kind: string }[];
  try {
    allLeagues = await readJson(DATA, 'leagues.json');
  } catch {
    throw new Error(`No game data at ${DATA}. Run "npm run data:build" at the repo root first.`);
  }
  // One filter, used for the site's own leagues.json and for every per-league loop below.
  const leagues = siteLeagues(allLeagues);
  const metaGroups: Record<string, MetaIn[]> = {};
  const rankings: Record<string, unknown[]> = {};
  for (const league of leagues) {
    metaGroups[league.id] = await readJson(DATA, 'meta', `${league.id}.json`);
    rankings[league.id] = await readJson(DATA, 'rankings', league.id, 'overall.json');
  }
  const baked = bake({
    pokemon: await readJson(DATA, 'pokemon.json'),
    moves: await readJson(DATA, 'moves.json'),
    leagues: allLeagues,
    metaGroups,
    rankings,
    manifest: await readJson(DATA, 'data-manifest.json'),
  });

  await mkdir(join(OUT, 'baseline'), { recursive: true });
  await writeFile(join(OUT, 'species.json'), JSON.stringify(baked.species));
  await writeFile(join(OUT, 'moves.json'), JSON.stringify(baked.moves));
  await writeFile(join(OUT, 'leagues.json'), JSON.stringify(leagues));
  await writeFile(join(OUT, 'seasons.json'), await readFile(join(DATA, 'seasons.json'), 'utf8'));
  for (const [id, file] of Object.entries(baked.baselines)) {
    await writeFile(join(OUT, 'baseline', `${id}.json`), JSON.stringify(file));
  }
  const counts = Object.entries(baked.baselines).map(([id, f]) => `${id} ${f.species.length}`);
  process.stdout.write(
    `baked ${Object.keys(baked.species).length} species, ` +
      `${Object.keys(baked.moves).length} moves, baseline: ${counts.join(', ')}\n`,
  );

  const gameMaster: unknown = await readJson(DATA, 'gamemaster.json');
  const pokemonFull = await readJson<Species[]>(DATA, 'pokemon.json');
  const movesFull = await readJson<Move[]>(DATA, 'moves.json');
  const index = new GameDataIndex(pokemonFull, movesFull);
  const engineLeagues = siteLeagues(await readJson<EngineLeague[]>(DATA, 'leagues.json'));
  const manifest = await readJson<{ pvpokeCommit: string; pvpokeDate: string }>(
    DATA,
    'data-manifest.json',
  );

  await mkdir(join(OUT, 'ranks'), { recursive: true });
  await mkdir(join(OUT, 'matrix'), { recursive: true });
  const sizes: string[] = [];
  for (const league of engineLeagues) {
    const overall = await readJson<RankingEntry[]>(DATA, 'rankings', league.id, 'overall.json');
    const matrix = await readJson<MatchupMatrix>(DATA, 'matrix', `${league.id}.json`);
    const leagueRankings: Rankings = {
      overall,
      leads: await readJson(DATA, 'rankings', league.id, 'leads.json'),
      switches: await readJson(DATA, 'rankings', league.id, 'switches.json'),
      closers: await readJson(DATA, 'rankings', league.id, 'closers.json'),
      chargers: await readJson(DATA, 'rankings', league.id, 'chargers.json'),
    };

    const ranks = {
      league: league.id,
      pvpokeCommit: manifest.pvpokeCommit,
      pvpokeDate: manifest.pvpokeDate,
      order: ranksOf(overall),
    };
    const slice = {
      league: league.id,
      pvpokeCommit: manifest.pvpokeCommit,
      pvpokeDate: manifest.pvpokeDate,
      matrix: sliceMatrix(matrix, MATRIX_TOP),
    };
    const teams = {
      league: league.id,
      source: 'generated' as const,
      pvpokeCommit: manifest.pvpokeCommit,
      pvpokeDate: manifest.pvpokeDate,
      projectionSlope: PROJECTION_SLOPE,
      projectionAnchor: PROJECTION_ANCHOR,
      teams: generateFor({ league, index, matrix, rankings: leagueRankings, gameMaster }),
    };

    for (const [dir, name, body] of [
      ['ranks', `${league.id}.json`, ranks],
      ['matrix', `${league.id}.json`, slice],
      ['baseline', `${league.id}-teams.json`, teams],
    ] as const) {
      const text = JSON.stringify(body);
      await writeFile(join(OUT, dir, name), text);
      sizes.push(`${dir}/${name} ${Math.round(text.length / 1024)} KB`);
    }
  }

  await mkdir(join(OUT, 'legal'), { recursive: true });
  for (const league of engineLeagues) {
    const cup = OPEN_EQUIVALENT_CUP[league.id] ?? null;
    let cupRanks: RankingEntry[] | null = null;
    if (cup !== null) {
      // The data build writes the cup as its own league (packages/data/src/build-derived.ts), so
      // a missing file means the build is older than the Tournament league and must be rerun,
      // not that nothing is banned. Failing loudly beats shipping an empty ban list.
      cupRanks = await readJson<RankingEntry[]>(DATA, 'rankings', cup, 'overall.json');
    }
    const overall = await readJson<RankingEntry[]>(DATA, 'rankings', league.id, 'overall.json');
    const file = legalFor(league.id, overall, cupRanks);
    await writeFile(join(OUT, 'legal', `${league.id}.json`), JSON.stringify(file));
    sizes.push(`legal/${league.id}.json ${file.banned.length} banned`);
  }

  await writeFile(
    join(OUT, 'epochs.json'),
    JSON.stringify(readEpochs(JSON.parse(await readFile(join(here, '..', 'epochs.json'), 'utf8')))),
  );
  process.stdout.write(`baked ${sizes.join(', ')}\n`);
}

// Runs only when invoked directly, so the test can import `bake` without writing files.
// pathToFileURL is what makes this work on Windows, where argv[1] is a drive path.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
