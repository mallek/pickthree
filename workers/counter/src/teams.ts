/**
 * The team board behind meta.pick3.gg: every 3-Pokemon team and every 2-Pokemon core the shared
 * records have seen, from both sides of the battle. Pure functions over BattleRow[], so they are
 * tested without a Durable Object.
 *
 * Both sides, because half the data used to be thrown away: the reporter's own three are in
 * r.team and the team they faced is in r.opponents, and the second is the more interesting one.
 *
 * Four rules, from docs/superpowers/specs/2026-09-18-meta-ranking-design.md:
 *  - A faced team's record is the INVERSE of the reporter's. Reporter won means the team they
 *    faced lost that battle. No simulation needed to give faced teams a real record.
 *  - Partial sightings are first class. LogBattle lets a player record 0 to 3 opponents, so a
 *    faced pair is ranked as a 2-Pokemon core: honest, because we print exactly what was seen,
 *    and useful, because core plus flex is how the game is played.
 *  - A sighting of a complete team is a sighting of its three cores, so core counts are supersets
 *    by construction. The client sorts by score, not by count, so this does not hand cores the
 *    top of the board.
 *  - Run and faced counts stay apart on every row, so no number silently mixes the two.
 *
 * A faced row never carries movesets: the opponents' movesets are not collected, by design.
 */
import type { BattleRow } from './battles.js';
import { bandRows, MOVESET_MIN, movesetsBySpecies, type MovesetStats } from './meta.js';

export interface TeamRowV1 {
  /** Sorted species ids. Two for a core, three for a complete team. */
  species: string[];
  kind: 'core' | 'team';
  /** Battles the reporters ran it themselves, and how they did. */
  runBattles: number;
  runWins: number;
  runLosses: number;
  /** Battles the reporters faced it, and how IT did: the inverse of the reporter's result. */
  facedBattles: number;
  facedWins: number;
  facedLosses: number;
  /** Aligned with `species`: the most common set that SPECIES was run with in this window, or
   *  null. Window-wide, not team-specific: a team with one run battle can still show a set
   *  assembled from hundreds of unrelated battles that species was run in. Never from the faced
   *  side, because opponents' movesets are not collected. */
  moves: (MovesetStats | null)[];
  /** Cores only: the third members seen completing this pair, most common first. `sightings`
   *  is the one count on this row that deliberately merges the run and faced populations,
   *  because a core's projection weights each third by how often it completes the pair at
   *  all, and a third is evidence of that whether the reporter ran it or faced it. Every
   *  other count on the row keeps the two sides apart. */
  thirds: { speciesId: string; sightings: number }[];
}

export interface TeamsV1 {
  league: string;
  since: string;
  until: string;
  band: string;
  /** Counted battles in the window and band, the same number /api/v1/meta reports. */
  battles: number;
  devices: number;
  sources: Record<string, number>;
  teams: TeamRowV1[];
  cores: TeamRowV1[];
  generatedAt: string;
}

/** The most rows of each kind one response carries. */
export const TEAM_LIMIT = 200;
export const CORE_LIMIT = 200;
/** A core lists at most this many third members. */
export const THIRDS_LIMIT = 12;

interface Bucket extends TeamRowV1 {
  /** Third members seen completing this pair, counted before they are sorted and capped. */
  thirdCounts: Map<string, number>;
}

function blank(species: string[], kind: 'core' | 'team'): Bucket {
  return {
    species,
    kind,
    runBattles: 0,
    runWins: 0,
    runLosses: 0,
    facedBattles: 0,
    facedWins: 0,
    facedLosses: 0,
    moves: species.map(() => null),
    thirds: [],
    thirdCounts: new Map(),
  };
}

function pairsOf(ids: readonly string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push([ids[i] as string, ids[j] as string]);
    }
  }
  return out;
}

export function teamBoard(opts: {
  league: string;
  since: string;
  until: string;
  band: string;
  rows: readonly BattleRow[];
  now: Date;
  teamLimit?: number;
  coreLimit?: number;
}): TeamsV1 {
  const { league, since, until, band, rows, now } = opts;
  const teamLimit = opts.teamLimit ?? TEAM_LIMIT;
  const coreLimit = opts.coreLimit ?? CORE_LIMIT;

  const counted = bandRows(rows, band).filter((r) => !r.tanked);
  // Over counted, not over every row: a device that only ever tanked has shared nothing usable,
  // the same reason tanked rows are excluded from every other tally here.
  const devices = new Set(counted.map((r) => r.device));
  const sources: Record<string, number> = {};
  for (const r of counted) {
    sources[r.source] = (sources[r.source] ?? 0) + 1;
  }
  const sets = movesetsBySpecies(counted);

  const teams = new Map<string, Bucket>();
  const cores = new Map<string, Bucket>();
  const take = (into: Map<string, Bucket>, species: string[], kind: 'core' | 'team'): Bucket => {
    const key = species.join('+');
    const held = into.get(key) ?? blank(species, kind);
    into.set(key, held);
    return held;
  };

  for (const r of counted) {
    const win = r.result === 'win' ? 1 : 0;
    const loss = r.result === 'loss' ? 1 : 0;

    // The run side: always exactly three, always the reporter's own result.
    const mine = [...new Set(r.team)].sort();
    if (mine.length === 3) {
      const t = take(teams, mine, 'team');
      t.runBattles += 1;
      t.runWins += win;
      t.runLosses += loss;
      for (const [a, b] of pairsOf(mine)) {
        const c = take(cores, [a, b], 'core');
        c.runBattles += 1;
        c.runWins += win;
        c.runLosses += loss;
        const third = mine.find((id) => id !== a && id !== b) as string;
        c.thirdCounts.set(third, (c.thirdCounts.get(third) ?? 0) + 1);
      }
    }

    // The faced side: 0 to 3 opponents, and the INVERSE result. If the reporter won, the team
    // they faced lost that battle.
    const theirs = [...new Set(r.opponents)].sort();
    if (theirs.length === 3) {
      const t = take(teams, theirs, 'team');
      t.facedBattles += 1;
      t.facedWins += loss;
      t.facedLosses += win;
    }
    if (theirs.length >= 2) {
      for (const [a, b] of pairsOf(theirs)) {
        const c = take(cores, [a, b], 'core');
        c.facedBattles += 1;
        c.facedWins += loss;
        c.facedLosses += win;
        if (theirs.length === 3) {
          const third = theirs.find((id) => id !== a && id !== b) as string;
          c.thirdCounts.set(third, (c.thirdCounts.get(third) ?? 0) + 1);
        }
      }
    }
  }

  const finish = (bucket: Bucket): TeamRowV1 => ({
    species: bucket.species,
    kind: bucket.kind,
    runBattles: bucket.runBattles,
    runWins: bucket.runWins,
    runLosses: bucket.runLosses,
    facedBattles: bucket.facedBattles,
    facedWins: bucket.facedWins,
    facedLosses: bucket.facedLosses,
    // Only from the run side: a member's set is known only when a reporter ran it themselves,
    // and a row nobody ran gets nulls rather than a borrowed guess.
    moves: bucket.species.map((id) => {
      if (bucket.runBattles === 0) {
        return null;
      }
      const top = sets.get(id)?.[0];
      return top && top.battles >= MOVESET_MIN ? top : null;
    }),
    thirds: [...bucket.thirdCounts.entries()]
      .map(([speciesId, sightings]) => ({ speciesId, sightings }))
      .sort((a, b) => b.sightings - a.sightings || a.speciesId.localeCompare(b.speciesId))
      .slice(0, THIRDS_LIMIT),
  });

  const total = (b: Bucket): number => b.runBattles + b.facedBattles;
  const order = (a: Bucket, b: Bucket): number =>
    total(b) - total(a) || a.species.join('+').localeCompare(b.species.join('+'));

  return {
    league,
    since,
    until,
    band,
    battles: counted.length,
    devices: devices.size,
    sources,
    teams: [...teams.values()].sort(order).slice(0, teamLimit).map(finish),
    cores: [...cores.values()].sort(order).slice(0, coreLimit).map(finish),
    generatedAt: now.toISOString(),
  };
}
