import fs from 'node:fs';
import path from 'node:path';
import { legalFor, OPEN_EQUIVALENT_CUP } from '@pickthree/engine/meta';

function overall(outDir: string, league: string): { speciesId: string }[] {
  return JSON.parse(
    fs.readFileSync(path.join(outDir, 'rankings', league, 'overall.json'), 'utf8'),
  ) as { speciesId: string }[];
}

/**
 * The Play! ban list per league, the same file meta.pick3.gg's bake writes, so pick3's community
 * weights hold a banned species at the plain prior exactly as the site does. Runs after every
 * league's rankings are written: a league's open-equivalent cup is itself a derived league.
 */
export function writeLegal(
  outDir: string,
  leagueIds: readonly string[],
): { league: string; banned: number }[] {
  fs.mkdirSync(path.join(outDir, 'legal'), { recursive: true });
  return leagueIds.map((league) => {
    const cup = OPEN_EQUIVALENT_CUP[league] ?? null;
    const file = legalFor(
      league,
      overall(outDir, league),
      cup === null ? null : overall(outDir, cup),
    );
    fs.writeFileSync(path.join(outDir, 'legal', `${league}.json`), JSON.stringify(file));
    return { league, banned: file.banned.length };
  });
}
