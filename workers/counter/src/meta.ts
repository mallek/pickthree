/**
 * The v1 read model behind meta.pick3.gg: per-league and per-species rollups over the stored
 * battle records. Pure functions over BattleRow[], so they are tested without a Durable Object.
 * The older `aggregate` in battles.ts still backs GET /meta and is deliberately left alone.
 */
import { BANDS, type BattleRow, type SharedMoves } from './battles.js';

/** The most days one read request may span. */
export const MAX_SPAN_DAYS = 400;

/** The three populations a read may ask for. `prior` is the site's own view and never reaches
 *  the worker: PvPoke's list is baked, so there is nothing here to serve it from. */
export const SOURCES: readonly string[] = ['all', 'ladder', 'tournament'];

export interface ReadParams {
  league: string;
  since: string;
  until: string;
  source: string;
  /**
   * The rank band filter, kept working through phase 1 because the deployed site still renders
   * the select that sends it. Phase 2 retires both together (Task 13). Ignored once `source`
   * names something other than `all`: a tournament broadcast reports no rank band, so narrowing
   * that population by one would silently answer with nothing.
   */
  band: string;
}

const LEAGUE = /^[a-z0-9_]+$/;

/** Parses and clamps the window and band every read endpoint shares. */
export function readParams(url: URL): ReadParams | { error: string } {
  const league = url.searchParams.get('league') ?? 'great';
  if (!LEAGUE.test(league)) {
    return { error: 'bad league' };
  }
  const sinceRaw = url.searchParams.get('since') ?? '';
  const untilRaw = url.searchParams.get('until') ?? '';
  const since = Date.parse(sinceRaw);
  const until = Date.parse(untilRaw);
  if (Number.isNaN(since) || Number.isNaN(until) || until <= since) {
    return { error: 'bad window' };
  }
  if (until - since > MAX_SPAN_DAYS * 86_400_000) {
    return { error: 'window too long' };
  }
  const bandRaw = url.searchParams.get('band') ?? 'all';
  const asked = (BANDS as readonly string[]).includes(bandRaw) ? bandRaw : 'all';
  const sourceRaw = url.searchParams.get('source') ?? 'all';
  const source = SOURCES.includes(sourceRaw) ? sourceRaw : 'all';
  return {
    league,
    since: new Date(since).toISOString(),
    until: new Date(until).toISOString(),
    source,
    band: source === 'all' ? asked : 'all',
  };
}

/**
 * Paths this worker owns. A request to one of these with a method it does not serve gets a JSON
 * 404, not the meta.pick3.gg page: an API path answering with HTML is worse than an honest error.
 * Keep in step with run_worker_first in wrangler.toml. The six tournament event routes
 * (PUT/GET/DELETE /api/v1/events/<id>, POST /api/v1/events/<id>/battles and /roster,
 * GET /api/v1/events) are already covered by the `/api/` prefix check below, so the set itself
 * does not change for them.
 */
const WORKER_PATHS = new Set(['/hit', '/count', '/error', '/errors', '/battles', '/meta']);

/** True when this worker owns the path, so an unmatched method gets a JSON 404 and not the site. */
export function isWorkerPath(pathname: string): boolean {
  return WORKER_PATHS.has(pathname) || pathname.startsWith('/api/');
}

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

export interface TournamentSpeciesStat {
  speciesId: string;
  picks: number;
  game1Picks: number;
  /** The record AGAINST it: the opposing side's wins and losses, the same meaning `wins` and
   *  `losses` carry on the ladder's own SpeciesStats. */
  wins: number;
  losses: number;
  unresolvedForms: number;
}

export interface TournamentBlock {
  /** Events in the window on the league's open-equivalent cup. These are the blended ones. */
  events: number;
  /** Their battles. Each battle counts once, not once per side. */
  battles: number;
  /** Events in the window on other cups: shown, never blended. */
  eventsOther: number;
  species: TournamentSpeciesStat[];
}

export interface RosterMovesetStats {
  fast: string;
  charged: string[];
  /** Roster entries carrying this set, NOT battles: a roster says what a player brought. */
  entries: number;
}

export interface SpeciesTournamentBlock {
  picks: number;
  game1Picks: number;
  wins: number;
  losses: number;
  /** Picks by bracket depth; index 0 is depth 1. Always 9 long. */
  byDepth: number[];
  unresolvedForms: number;
  /** Players whose roster lists it. */
  broughtBy: number;
  /** Players on the roster who appear in at least one streamed battle. */
  rosterSize: number;
  /** Their streamed battles in which they picked it. */
  pickedOnStream: number;
  movesets: RosterMovesetStats[];
  /** Roster entries for it that carry a set at all, out of `broughtBy`. */
  movesetsKnown: number;
}

export interface MetaSummaryV1 {
  league: string;
  since: string;
  until: string;
  source: string;
  band: string;
  /** Counted battles: not tanked. */
  battles: number;
  tanked: number;
  devices: number;
  /** Every band in the window, not only the filtered one. */
  bands: Record<string, number>;
  /** Counted battles by source. One key today; nothing reads it yet. */
  sources: Record<string, number>;
  species: SpeciesStats[];
  /**
   * @deprecated Run teams only, and capped at 50. The whole team board, run and faced, cores and
   * complete teams, is /api/v1/teams. Left in place and unchanged rather than altered under a
   * consumer; nothing new should read it.
   */
  teams: TeamStats[];
  previous: { battles: number; species: { speciesId: string; sightings: number }[] } | null;
  /** Tournament play in the same window. Null under source=ladder: that view is the ladder alone
   *  and a zeroed block would read as "no tournaments" rather than "not asked for". */
  tournament: TournamentBlock | null;
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

/** Counts a caller works out for itself. The tournament read model mirrors one battle into two
 *  rows so the ladder's own aggregation can run over it, which would double every total here, so
 *  it hands the three real numbers in instead. */
export interface Totals {
  battles: number;
  devices: number;
  sources: Record<string, number>;
}

export function summarize(opts: {
  league: string;
  since: string;
  until: string;
  source: string;
  /** Defaults to `'all'`, so the tournament read model can leave it out entirely. */
  band?: string;
  /** Every row in the window, all bands. */
  rows: readonly BattleRow[];
  /** Every row in the window of equal length before it, all bands, or null if not asked for. */
  previousRows: readonly BattleRow[] | null;
  now: Date;
  teamLimit?: number;
  /** Replaces `battles`, `devices` and `sources` when given; species tallies still come from
   *  `rows`. See `Totals`. */
  totals?: Totals;
}): MetaSummaryV1 {
  const { league, since, until, source, rows, previousRows, now } = opts;
  const band = opts.band ?? 'all';
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
  // Over `counted`, not `inBand`: a device that only ever tanked has shared nothing usable, so it
  // must not move the device side of the blend curve, which decides how much say the measured
  // numbers get, or the "shared by N devices" line, the same reason tanked rows are excluded from
  // every other tally below.
  const devices = new Set(counted.map((r) => r.device));
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

  const sources: Record<string, number> = {};
  for (const r of counted) {
    sources[r.source] = (sources[r.source] ?? 0) + 1;
  }

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
    source,
    band,
    battles: opts.totals ? opts.totals.battles : counted.length,
    tanked: inBand.length - counted.length,
    devices: opts.totals ? opts.totals.devices : devices.size,
    bands,
    sources: opts.totals ? opts.totals.sources : sources,
    species,
    teams: [...teams.values()]
      .sort((a, b) => b.battles - a.battles || a.species.join().localeCompare(b.species.join()))
      .slice(0, teamLimit),
    previous,
    tournament: null,
    generatedAt: now.toISOString(),
  };
}

export interface SpeciesDetailV1 {
  league: string;
  speciesId: string;
  since: string;
  until: string;
  source: string;
  band: string;
  sightings: number;
  wins: number;
  losses: number;
  runs: number;
  runWins: number;
  runLosses: number;
  /** Oldest week first. `battles` is the window total that week, `sightings` this species'. */
  weekly: { week: string; battles: number; sightings: number }[];
  /** Every band, whatever the filter, so the reader sees what they filtered away. */
  bands: { band: string; sightings: number; wins: number; losses: number }[];
  /** Other opponents seen in the same battles, most common first, at most 8. */
  alongside: { speciesId: string; battles: number }[];
  /** Sets reporters ran it with when it was on their own team. */
  movesets: MovesetStats[];
  tournament: SpeciesTournamentBlock | null;
  generatedAt: string;
}

/** The most other opponents one species page lists. */
const ALONGSIDE_LIMIT = 8;

/** ISO week label, e.g. "2026-W38". */
export function isoWeek(at: string): string {
  const d = new Date(at);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // ISO weeks run Monday to Sunday and belong to the year holding their Thursday.
  const day = t.getUTCDay() === 0 ? 7 : t.getUTCDay();
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function speciesDetail(opts: {
  league: string;
  speciesId: string;
  since: string;
  until: string;
  source: string;
  /** Defaults to `'all'`, so the tournament read model can leave it out entirely. */
  band?: string;
  /** Every row in the window, all bands. */
  rows: readonly BattleRow[];
  now: Date;
}): SpeciesDetailV1 {
  const { league, speciesId, since, until, source, rows, now } = opts;
  const band = opts.band ?? 'all';
  const counted = bandRows(rows, band).filter((r) => !r.tanked);
  const mine = speciesStats(counted).get(speciesId) ?? {
    speciesId,
    sightings: 0,
    wins: 0,
    losses: 0,
    runs: 0,
    runWins: 0,
    runLosses: 0,
  };

  const weeks = new Map<string, { week: string; battles: number; sightings: number }>();
  for (const r of counted) {
    const week = isoWeek(r.at);
    const w = weeks.get(week) ?? { week, battles: 0, sightings: 0 };
    w.battles += 1;
    if (r.opponents.includes(speciesId)) {
      w.sightings += 1;
    }
    weeks.set(week, w);
  }

  const everyBand = [...BANDS, 'unknown'];
  // Not `as const`: these tallies get mutated below, so the map's values must stay writable.
  const byBand = new Map(
    everyBand.map(
      (b): [string, { band: string; sightings: number; wins: number; losses: number }] => [
        b,
        { band: b, sightings: 0, wins: 0, losses: 0 },
      ],
    ),
  );
  const alongside = new Map<string, number>();
  for (const r of rows) {
    if (r.tanked || !r.opponents.includes(speciesId)) {
      continue;
    }
    const slot = byBand.get(r.band ?? 'unknown');
    if (slot) {
      slot.sightings += 1;
      slot.wins += r.result === 'win' ? 1 : 0;
      slot.losses += r.result === 'loss' ? 1 : 0;
    }
  }
  for (const r of counted) {
    if (!r.opponents.includes(speciesId)) {
      continue;
    }
    for (const other of new Set(r.opponents)) {
      if (other !== speciesId) {
        alongside.set(other, (alongside.get(other) ?? 0) + 1);
      }
    }
  }

  return {
    league,
    // `mine.speciesId` is always this same value: speciesStats keys its map by speciesId, so a
    // hit carries it back unchanged, and the fallback above sets it from this same parameter.
    since,
    until,
    source,
    band,
    ...mine,
    weekly: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    bands: everyBand.map((b) => byBand.get(b)!),
    alongside: [...alongside.entries()]
      .map(([id, battles]) => ({ speciesId: id, battles }))
      .sort((a, b) => b.battles - a.battles || a.speciesId.localeCompare(b.speciesId))
      .slice(0, ALONGSIDE_LIMIT),
    movesets: movesetsBySpecies(counted).get(speciesId) ?? [],
    tournament: null,
    generatedAt: now.toISOString(),
  };
}
