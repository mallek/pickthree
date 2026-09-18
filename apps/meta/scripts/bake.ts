/**
 * Turns the data build's static JSON into the handful of small files meta.pick3.gg ships.
 * Reads apps/web/public/data (produced by `npm run data:build`), writes apps/meta/public.
 * `bake` is pure so it can be tested; only `main` touches the disk.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  leagues: { id: string; meta: string }[];
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
  for (const league of input.leagues) {
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
    entries.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.speciesId.localeCompare(b.speciesId));
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

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', '..', 'web', 'public', 'data');
const OUT = join(here, '..', 'public');

async function readJson<T>(...parts: string[]): Promise<T> {
  return JSON.parse(await readFile(join(...parts), 'utf8')) as T;
}

async function main(): Promise<void> {
  let leagues: { id: string; meta: string }[];
  try {
    leagues = await readJson(DATA, 'leagues.json');
  } catch {
    throw new Error(`No game data at ${DATA}. Run "npm run data:build" at the repo root first.`);
  }
  const metaGroups: Record<string, MetaIn[]> = {};
  const rankings: Record<string, unknown[]> = {};
  for (const league of leagues) {
    metaGroups[league.id] = await readJson(DATA, 'meta', `${league.id}.json`);
    rankings[league.id] = await readJson(DATA, 'rankings', league.id, 'overall.json');
  }
  const baked = bake({
    pokemon: await readJson(DATA, 'pokemon.json'),
    moves: await readJson(DATA, 'moves.json'),
    leagues,
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
}

// Runs only when invoked directly, so the test can import `bake` without writing files.
// pathToFileURL is what makes this work on Windows, where argv[1] is a drive path.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
