/**
 * CI nag: exits 2 when the newest season in seasons.json started more than 90 days ago, so the
 * refresh workflow can open an issue asking for the next one. Prints the state either way.
 */
import { readSeasons, seasonsStale } from './seasons.js';

const seasons = readSeasons();
const newest = seasons[seasons.length - 1];
const stale = seasonsStale(seasons, new Date(), 90);
console.log(
  newest
    ? `newest season: ${newest.id} ${newest.name} from ${newest.start} (${stale ? 'STALE' : 'ok'})`
    : 'no seasons listed (STALE)',
);
process.exitCode = stale ? 2 : 0;
