/**
 * Times the engine on a real export. Run from the repo root:
 *
 *   npx tsx packages/engine/scripts/bench.ts [path/to/export.csv]
 *
 * Defaults to private/poke_genie_export.csv (gitignored) and falls back to the fixture.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { toSpecimens } from '../src/collection/specimen.js';
import { parsePokeGenieCsv } from '../src/csv/parse.js';
import { metaCounters } from '../src/counters/counters.js';
import { GameDataIndex } from '../src/gamedata/index.js';
import { recommend, verdictsFor } from '../src/recommend.js';
import { REPO_ROOT, loadFixtureCsv, loadStaticData, PRIVATE_CSV } from '../test/fixtures.js';

const csvPath = process.argv[2] ?? PRIVATE_CSV;
const csv = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf8') : loadFixtureCsv();
const data = loadStaticData();
const index = new GameDataIndex(data.species, data.moves);
const gm = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'packages', 'data', '.pvpoke', 'src', 'data', 'gamemaster.json'),
    'utf8',
  ),
) as unknown;
const sim = new PvPokeSimulator(loadPvPokeInNode(gm));
const deps = { data, sim };

const { specimens, report } = toSpecimens(parsePokeGenieCsv(csv), index);
console.log(`${report.scansRead} scans, ${specimens.length} specimens`);

const time = (label: string, fn: () => unknown): void => {
  const t = Date.now();
  fn();
  console.log(`${label}: ${Date.now() - t} ms`);
};

time('recommend', () => recommend(specimens, {}, deps));
time('verdicts', () => verdictsFor(specimens, {}, deps));
time('counters', () => metaCounters(data, specimens, index));
// Scale: the same collection four times over, distinct ids, to see how a 3k-scan bag behaves.
const big = [0, 1, 2, 3].flatMap((k) =>
  specimens.map((s) => ({ ...s, id: `${s.id}:${k}`, ivs: s.ivs ? { ...s.ivs, atk: (s.ivs.atk + k) % 16 } : null })),
);
console.log(`scaled to ${big.length} specimens`);
time('recommend x4', () => recommend(big, {}, deps));
time('verdicts x4', () => verdictsFor(big, {}, deps));
