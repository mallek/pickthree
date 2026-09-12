import fs from 'node:fs';
import path from 'node:path';
import { writeBundle } from '@pickthree/sim-pvpoke';
import { writeGameData } from './build-gamedata.js';
import { writeManifest } from './build-manifest.js';
import { writeMatrix } from './build-matrix.js';
import { writeRankings } from './build-rankings.js';
import { ensurePvPokeCheckout } from './fetch-pvpoke.js';
import { OUTPUT_DIR } from './paths.js';

async function main(): Promise<void> {
  await ensurePvPokeCheckout();
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const data = writeGameData(OUTPUT_DIR);
  console.log(`gamedata: ${data.species.length} species, ${data.moves.length} moves`);
  const { meta } = writeRankings(OUTPUT_DIR);
  console.log(`rankings: meta ${meta.length}`);
  let matrixCounts = { candidates: 0, opponents: 0, scenarios: 0 };
  if (process.env.PICKTHREE_SKIP_MATRIX !== '1') {
    const m = writeMatrix(OUTPUT_DIR);
    matrixCounts = {
      candidates: m.candidates.length,
      opponents: m.opponents.length,
      scenarios: m.scenarios.length,
    };
  }
  writeBundle(path.join(OUTPUT_DIR, 'vendor', 'pvpoke-sim.js'));
  const manifest = writeManifest(OUTPUT_DIR, {
    gamemasterTimestamp: data.gamemasterTimestamp,
    metaSize: meta.length,
    matrix: matrixCounts,
  });
  console.log(`built ${manifest.files.length} files into ${OUTPUT_DIR}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
