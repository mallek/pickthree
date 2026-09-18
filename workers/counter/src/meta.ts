/**
 * The v1 read model behind meta.pick3.gg: per-league and per-species rollups over the stored
 * battle records. Pure functions over BattleRow[], so they are tested without a Durable Object.
 * The older `aggregate` in battles.ts still backs GET /meta and is deliberately left alone.
 */
import { BANDS, type BattleRow, type SharedMoves } from './battles.js';

export interface SpeciesStats {
  speciesId: string;
  /** Battles in which the reporter saw it on the other side. */
  sightings: number;
  /** The reporters' win and loss count in those battles. */
  wins: number;
  losses: number;
  /** Battles in which the reporter had it on their own team. */
  runs: number;
  runWins: number;
  runLosses: number;
}

export interface MovesetStats {
  fast: string;
  charged: string[];
  battles: number;
}

export interface TeamStats {
  /** Sorted species ids, so the same three in any order roll up together. */
  species: [string, string, string];
  battles: number;
  wins: number;
  losses: number;
  /** Aligned with `species`: the most common set that species was run with, or null. */
  moves: (MovesetStats | null)[];
}

export interface MetaSummaryV1 {
  league: string;
  since: string;
  until: string;
  band: string;
  /** Counted battles: not tanked. */
  battles: number;
  tanked: number;
  devices: number;
  /** Every band in the window, not only the filtered one. */
  bands: Record<string, number>;
  species: SpeciesStats[];
  teams: TeamStats[];
  previous: { battles: number; species: { speciesId: string; sightings: number }[] } | null;
  generatedAt: string;
}

/** Both sides of a trend need this many counted battles before a trend is reported. */
export const TREND_MIN = 200;
/** A member's moveset only rides along on a team when this many battles back it. */
export const MOVESET_MIN = 5;

export function bandRows(rows: readonly BattleRow[], band: string): BattleRow[] {
  if (band === 'all' || !(BANDS as readonly string[]).includes(band)) {
    return [...rows];
  }
  return rows.filter((r) => r.band === band);
}

function setKey(m: SharedMoves): { key: string; charged: string[] } {
  const charged = [...new Set(m.charged)].sort();
  return { key: `${m.fast}|${charged.join('+')}`, charged };
}

export function movesetsBySpecies(rows: readonly BattleRow[]): Map<string, MovesetStats[]> {
  const per = new Map<string, Map<string, MovesetStats>>();
  for (const r of rows) {
    if (r.tanked) {
      continue;
    }
    r.team.forEach((speciesId, i) => {
      const m = r.moves?.[i];
      if (!m) {
        return;
      }
      const { key, charged } = setKey(m);
      const sets = per.get(speciesId) ?? new Map<string, MovesetStats>();
      const stats = sets.get(key) ?? { fast: m.fast, charged, battles: 0 };
      stats.battles += 1;
      sets.set(key, stats);
      per.set(speciesId, sets);
    });
  }
  return new Map(
    [...per.entries()].map(([id, sets]) => [
      id,
      [...sets.values()].sort((a, b) => b.battles - a.battles || a.fast.localeCompare(b.fast)),
    ]),
  );
}

function blank(speciesId: string): SpeciesStats {
  return { speciesId, sightings: 0, wins: 0, losses: 0, runs: 0, runWins: 0, runLosses: 0 };
}

/** Counted battles only: a tanked battle says nothing about who was there. */
export function speciesStats(rows: readonly BattleRow[]): Map<string, SpeciesStats> {
  const out = new Map<string, SpeciesStats>();
  const take = (id: string): SpeciesStats => {
    const s = out.get(id) ?? blank(id);
    out.set(id, s);
    return s;
  };
  for (const r of rows) {
    if (r.tanked) {
      continue;
    }
    const win = r.result === 'win' ? 1 : 0;
    const loss = r.result === 'loss' ? 1 : 0;
    for (const id of new Set(r.opponents)) {
      const s = take(id);
      s.sightings += 1;
      s.wins += win;
      s.losses += loss;
    }
    for (const id of new Set(r.team)) {
      const s = take(id);
      s.runs += 1;
      s.runWins += win;
      s.runLosses += loss;
    }
  }
  return out;
}

export function summarize(opts: {
  league: string;
  since: string;
  until: string;
  band: string;
  /** Every row in the window, all bands. */
  rows: readonly BattleRow[];
  /** Every row in the window of equal length before it, all bands, or null if not asked for. */
  previousRows: readonly BattleRow[] | null;
  now: Date;
  teamLimit?: number;
}): MetaSummaryV1 {
  const { league, since, until, band, rows, previousRows, now } = opts;
  const teamLimit = opts.teamLimit ?? 50;

  const bands: Record<string, number> = {};
  for (const r of rows) {
    if (r.tanked) {
      continue;
    }
    const key = r.band ?? 'unknown';
    bands[key] = (bands[key] ?? 0) + 1;
  }

  const inBand = bandRows(rows, band);
  const counted = inBand.filter((r) => !r.tanked);
  const devices = new Set(inBand.map((r) => r.device));
  const sets = movesetsBySpecies(counted);

  const teams = new Map<string, TeamStats>();
  for (const r of counted) {
    const species = [...r.team].sort() as [string, string, string];
    const key = species.join('+');
    const t = teams.get(key) ?? {
      species,
      battles: 0,
      wins: 0,
      losses: 0,
      moves: species.map((id) => {
        const top = sets.get(id)?.[0];
        return top && top.battles >= MOVESET_MIN ? top : null;
      }),
    };
    t.battles += 1;
    t.wins += r.result === 'win' ? 1 : 0;
    t.losses += r.result === 'loss' ? 1 : 0;
    teams.set(key, t);
  }

  const species = [...speciesStats(counted).values()].sort(
    (a, b) => b.sightings - a.sightings || a.speciesId.localeCompare(b.speciesId),
  );

  const previousCounted = previousRows
    ? bandRows(previousRows, band).filter((r) => !r.tanked)
    : null;
  const previous =
    previousCounted && counted.length >= TREND_MIN && previousCounted.length >= TREND_MIN
      ? {
          battles: previousCounted.length,
          species: [...speciesStats(previousCounted).values()]
            .map((s) => ({ speciesId: s.speciesId, sightings: s.sightings }))
            .sort((a, b) => b.sightings - a.sightings || a.speciesId.localeCompare(b.speciesId)),
        }
      : null;

  return {
    league,
    since,
    until,
    band,
    battles: counted.length,
    tanked: inBand.length - counted.length,
    devices: devices.size,
    bands,
    species,
    teams: [...teams.values()]
      .sort((a, b) => b.battles - a.battles || a.species.join().localeCompare(b.species.join()))
      .slice(0, teamLimit),
    previous,
    generatedAt: now.toISOString(),
  };
}
