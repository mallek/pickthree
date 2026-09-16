import fs from 'node:fs';
import path from 'node:path';
import { writeBundle } from '@pickthree/sim-pvpoke';
import { writeGameData } from './build-gamedata.js';
import { writeManifest } from './build-manifest.js';
import { writeMatrix } from './build-matrix.js';
import { writeLeagueRankings } from './build-rankings.js';
import { writeSprites } from './build-sprites.js';
import { readLeagues } from './leagues.js';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { readRawGameMaster } from './build-gamedata.js';
import { ensurePvPokeCheckout } from './fetch-pvpoke.js';
import { GAMEMASTER_PATH, OUTPUT_DIR } from './paths.js';
import { readSeasons, SEASONS_PATH } from './seasons.js';

async function main(): Promise<void> {
  await ensurePvPokeCheckout();
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const data = writeGameData(OUTPUT_DIR);
  console.log(`gamedata: ${data.species.length} species, ${data.moves.length} moves`);
  if (process.env.PICKTHREE_SKIP_SPRITES !== '1') {
    const sprites = await writeSprites(OUTPUT_DIR, data.species);
    console.log(
      `sprites: ${sprites.written} written, ${sprites.fellBack.length} on the base picture, ${sprites.missing.length} missing`,
    );
  }
  const leagues = readLeagues();
  let matrixCounts = { candidates: 0, opponents: 0, scenarios: 0 };
  const sim =
    process.env.PICKTHREE_SKIP_MATRIX === '1'
      ? null
      : new PvPokeSimulator(loadPvPokeInNode(readRawGameMaster()));
  for (const league of leagues) {
    const { meta } = writeLeagueRankings(OUTPUT_DIR, league);
    league.metaSize = meta.length;
    console.log(`${league.id}: meta ${meta.length}`);
    if (sim) {
      const m = writeMatrix(OUTPUT_DIR, league, sim);
      if (league.id === 'great') {
        matrixCounts = {
          candidates: m.candidates.length,
          opponents: m.opponents.length,
          scenarios: m.scenarios.length,
        };
      }
    }
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, 'leagues.json'), JSON.stringify(leagues));
  readSeasons(); // validates before we ship it
  fs.copyFileSync(SEASONS_PATH, path.join(OUTPUT_DIR, 'seasons.json'));
  const meta = { length: leagues[0]?.metaSize ?? 0 };
  writeBundle(path.join(OUTPUT_DIR, 'vendor', 'pvpoke-sim.js'));
  // The vendored simulator reads PvPoke's own game master format, so ship it alongside.
  fs.copyFileSync(GAMEMASTER_PATH, path.join(OUTPUT_DIR, 'gamemaster.json'));
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
