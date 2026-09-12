import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DataManifest,
  MatchupMatrix,
  MetaEntry,
  Move,
  RankingCategory,
  RankingEntry,
  Species,
} from '../src/gamedata/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..', '..');
export const FIXTURES_DIR = path.join(REPO_ROOT, 'fixtures');
export const STATIC_DATA_DIR =
  process.env.PICKTHREE_DATA_OUT ?? path.join(REPO_ROOT, 'apps', 'web', 'public', 'data');
export const PRIVATE_CSV = path.join(REPO_ROOT, 'private', 'poke_genie_export.csv');

export function loadFixtureCsv(name = 'pokegenie-sample.csv'): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

export function haveStaticData(): boolean {
  return fs.existsSync(path.join(STATIC_DATA_DIR, 'data-manifest.json'));
}

if (!haveStaticData() && process.env.PICKTHREE_REQUIRE_PVPOKE === '1') {
  throw new Error(`Static data missing at ${STATIC_DATA_DIR}. Run npm run data:build`);
}

export interface StaticData {
  species: Species[];
  moves: Move[];
  rankings: Record<RankingCategory, RankingEntry[]>;
  meta: MetaEntry[];
  matrix: MatchupMatrix;
  manifest: DataManifest;
}

let cached: StaticData | null = null;

export function loadStaticData(): StaticData {
  if (cached) {
    return cached;
  }
  const read = <T>(rel: string): T =>
    JSON.parse(fs.readFileSync(path.join(STATIC_DATA_DIR, rel), 'utf8')) as T;
  cached = {
    species: read<Species[]>('pokemon.json'),
    moves: read<Move[]>('moves.json'),
    rankings: {
      overall: read<RankingEntry[]>('rankings/great/overall.json'),
      leads: read<RankingEntry[]>('rankings/great/leads.json'),
      switches: read<RankingEntry[]>('rankings/great/switches.json'),
      closers: read<RankingEntry[]>('rankings/great/closers.json'),
      chargers: read<RankingEntry[]>('rankings/great/chargers.json'),
    },
    meta: read<MetaEntry[]>('meta/great.json'),
    matrix: read<MatchupMatrix>('matrix/great.json'),
    manifest: read<DataManifest>('data-manifest.json'),
  };
  return cached;
}
