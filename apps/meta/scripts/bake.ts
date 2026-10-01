/**
 * Turns the data build's static JSON into the handful of small files meta.pick3.gg ships.
 * Reads apps/web/public/data (produced by `npm run data:build`), writes apps/meta/public.
 * `bake` is pure so it can be tested; only `main` touches the disk.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  baselineFor,
  legalFor,
  MATRIX_TOP,
  OPEN_EQUIVALENT_CUP,
  priorWeights,
  ranksOf,
  readEpochs,
  sliceMatrix,
  type BaselineSpecies,
  type LegalFile,
  type MatchupMatrix,
  type RankingIn,
} from '@pickthree/engine/meta';
import {
  GameDataIndex,
  PROJECTION_ANCHOR,
  PROJECTION_SLOPE,
  type League as EngineLeague,
  type Move,
  type RankingEntry,
  type Rankings,
  type Species,
} from '@pickthree/engine';
import { COLD_POOL, COLD_TEAMS, generateFor } from '../../../packages/data/src/build-baseline.js';

// priorWeights, sliceMatrix and the baseline's per-league shape moved into @pickthree/engine/meta,
// where pick3's data build can reach them; re-exported so this script's callers keep their imports.
// generateFor moved into the data build (packages/data/src/build-baseline.ts), which writes the
// same baseline/<id>-teams.json for every league pick3 ships; re-exported for the same reason.
export {
  COLD_POOL,
  COLD_TEAMS,
  generateFor,
  legalFor,
  MATRIX_TOP,
  OPEN_EQUIVALENT_CUP,
  priorWeights,
  ranksOf,
  readEpochs,
  sliceMatrix,
  type BaselineSpecies,
  type LegalFile,
};

export type SpeciesFile = Record<string, [string, number, string]>;
export type MovesFile = Record<string, [string, string]>;

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
    const b = baselineFor(
      league.id,
      input.metaGroups[league.id] ?? [],
      (input.rankings[league.id] ?? []) as RankingIn[],
      input.manifest,
    );
    // The file is the baseline without its `byId` index, which the loader rebuilds on read.
    baselines[league.id] = {
      league: b.league,
      source: 'pvpoke',
      pvpokeCommit: b.pvpokeCommit,
      pvpokeDate: b.pvpokeDate,
      species: b.species,
    };
  }

  return { species, moves, baselines };
}

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', '..', 'web', 'public', 'data');
const OUT = join(here, '..', 'public');
/** The hand-kept meta reset list, which lives beside the data build's seasons.json. */
const EPOCHS = join(here, '..', '..', '..', 'packages', 'data', 'epochs.json');

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
    JSON.stringify(readEpochs(JSON.parse(await readFile(EPOCHS, 'utf8')))),
  );
  process.stdout.write(`baked ${sizes.join(', ')}\n`);
}

// Runs only when invoked directly, so the test can import `bake` without writing files.
// pathToFileURL is what makes this work on Windows, where argv[1] is a drive path.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
