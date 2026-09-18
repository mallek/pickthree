/**
 * Shared battle records: what a phone sends for the community meta, what the store keeps, and
 * the per-league summary the read endpoint returns. Nothing here identifies a player.
 */

export const BANDS = ['below', 'ace', 'veteran', 'expert', 'legend'] as const;
export type Band = (typeof BANDS)[number];

export interface SharedMoves {
  fast: string;
  charged: string[];
}

export interface SharedBattle {
  /** The battle's own id on the phone; unique per device. */
  id: string;
  league: string;
  season: number | null;
  /** ISO time the battle was logged. */
  at: string;
  /** The reporter's three, PvPoke species ids. */
  team: [string, string, string];
  /** The moves each of the three ran, when the phone knew them. */
  moves: [SharedMoves | null, SharedMoves | null, SharedMoves | null] | null;
  /** 0 to 3 opponents seen. */
  opponents: string[];
  result: 'win' | 'loss' | null;
  tanked: boolean;
  band: Band | null;
}

export interface SharedBatch {
  /** Random id made on the phone; the only handle, used to delete or de-duplicate. */
  device: string;
  /** App and build, e.g. "pick3 a114140". */
  client: string;
  battles: SharedBattle[];
}

export const MAX_BATCH = 200;
const ID = /^[a-z0-9_]+$/;
const BATTLE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DEVICE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MOVE = /^[A-Z0-9_]+$/;

function parseMoves(x: unknown): SharedMoves | null | undefined {
  if (x === null) {
    return null;
  }
  if (!isRecord(x)) {
    return undefined;
  }
  const { fast, charged } = x;
  if (typeof fast !== 'string' || !MOVE.test(fast)) {
    return undefined;
  }
  if (
    !Array.isArray(charged) ||
    charged.length < 1 ||
    charged.length > 2 ||
    !charged.every((c) => typeof c === 'string' && MOVE.test(c))
  ) {
    return undefined;
  }
  return { fast, charged: [...new Set(charged as string[])] };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function parseBattle(x: unknown): SharedBattle | null {
  if (!isRecord(x)) {
    return null;
  }
  const { id, league, season, at, team, moves, opponents, result, tanked, band } = x;
  if (typeof id !== 'string' || !BATTLE_ID.test(id)) {
    return null;
  }
  if (typeof league !== 'string' || !ID.test(league)) {
    return null;
  }
  if (!(season === null || (typeof season === 'number' && Number.isInteger(season)))) {
    return null;
  }
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
    return null;
  }
  if (
    !Array.isArray(team) ||
    team.length !== 3 ||
    !team.every((t) => typeof t === 'string' && ID.test(t))
  ) {
    return null;
  }
  if (
    !Array.isArray(opponents) ||
    opponents.length > 3 ||
    !opponents.every((o) => typeof o === 'string' && ID.test(o))
  ) {
    return null;
  }
  let parsedMoves: SharedBattle['moves'] = null;
  if (moves !== undefined && moves !== null) {
    if (!Array.isArray(moves) || moves.length !== 3) {
      return null;
    }
    const each = moves.map(parseMoves);
    if (each.some((m) => m === undefined)) {
      return null;
    }
    parsedMoves = each as SharedBattle['moves'];
  }
  if (!(result === 'win' || result === 'loss' || result === null)) {
    return null;
  }
  if (typeof tanked !== 'boolean') {
    return null;
  }
  if (!(
    band === null ||
    band === undefined ||
    (typeof band === 'string' && (BANDS as readonly string[]).includes(band))
  )) {
    return null;
  }
  return {
    id,
    league,
    season,
    at: new Date(at).toISOString(),
    team: team as [string, string, string],
    moves: parsedMoves,
    opponents: [...new Set(opponents as string[])],
    result,
    tanked,
    band: (band ?? null) as Band | null,
  };
}

/** The request body of POST /battles, or null when any part of it is not the shape we send. */
export function parseBatch(body: unknown): SharedBatch | null {
  if (!isRecord(body)) {
    return null;
  }
  const { device, client, battles } = body;
  if (typeof device !== 'string' || !DEVICE.test(device)) {
    return null;
  }
  if (typeof client !== 'string' || client.length === 0 || client.length > 40) {
    return null;
  }
  if (!Array.isArray(battles) || battles.length === 0 || battles.length > MAX_BATCH) {
    return null;
  }
  const out: SharedBattle[] = [];
  for (const b of battles) {
    const parsed = parseBattle(b);
    if (!parsed) {
      return null;
    }
    out.push(parsed);
  }
  return { device, client, battles: out };
}

/** One stored row, as the summary reads it back. */
export interface BattleRow {
  device: string;
  league: string;
  season: number | null;
  at: string;
  team: string[];
  moves: (SharedMoves | null)[] | null;
  opponents: string[];
  result: 'win' | 'loss' | null;
  tanked: boolean;
  band: Band | null;
}

export interface MovesetSummary {
  fast: string;
  charged: string[];
  /** Counted battles the reporter ran this species with these moves. */
  battles: number;
}

export interface SpeciesSummary {
  speciesId: string;
  /** Battles it was seen in. */
  sightings: number;
  /** The reporters' record in those battles. */
  wins: number;
  losses: number;
}

export interface TeamSummary {
  /** Sorted species ids, so the same three in any order roll up. */
  species: [string, string, string];
  battles: number;
  wins: number;
  losses: number;
}

export interface MetaSummary {
  league: string;
  /** Counted battles: not tanked. */
  battles: number;
  tanked: number;
  devices: number;
  bands: Record<string, number>;
  species: SpeciesSummary[];
  teams: TeamSummary[];
  /** Per species the reporters ran, the movesets they ran it with, most common first. */
  movesets: Record<string, MovesetSummary[]>;
}

/** Rolls rows up into the per-league summary; tanked battles count only as tanked. */
export function aggregate(league: string, rows: BattleRow[], teamLimit = 50): MetaSummary {
  const species = new Map<string, SpeciesSummary>();
  const teams = new Map<string, TeamSummary>();
  const movesets = new Map<string, Map<string, MovesetSummary>>();
  const devices = new Set<string>();
  const bands: Record<string, number> = {};
  let battles = 0;
  let tanked = 0;
  for (const r of rows) {
    devices.add(r.device);
    if (r.tanked) {
      tanked += 1;
      continue;
    }
    battles += 1;
    bands[r.band ?? 'unknown'] = (bands[r.band ?? 'unknown'] ?? 0) + 1;
    const win = r.result === 'win' ? 1 : 0;
    const loss = r.result === 'loss' ? 1 : 0;
    for (const id of new Set(r.opponents)) {
      const s = species.get(id) ?? { speciesId: id, sightings: 0, wins: 0, losses: 0 };
      s.sightings += 1;
      s.wins += win;
      s.losses += loss;
      species.set(id, s);
    }
    r.team.forEach((speciesId, i) => {
      const m = r.moves?.[i];
      if (!m) {
        return;
      }
      const charged = [...m.charged].sort();
      const setKey = `${m.fast}|${charged.join('+')}`;
      const per = movesets.get(speciesId) ?? new Map<string, MovesetSummary>();
      const ms = per.get(setKey) ?? { fast: m.fast, charged, battles: 0 };
      ms.battles += 1;
      per.set(setKey, ms);
      movesets.set(speciesId, per);
    });
    const key = [...r.team].sort().join('+');
    const t = teams.get(key) ?? {
      species: [...r.team].sort() as [string, string, string],
      battles: 0,
      wins: 0,
      losses: 0,
    };
    t.battles += 1;
    t.wins += win;
    t.losses += loss;
    teams.set(key, t);
  }
  return {
    league,
    battles,
    tanked,
    devices: devices.size,
    bands,
    species: [...species.values()].sort(
      (a, b) => b.sightings - a.sightings || a.speciesId.localeCompare(b.speciesId),
    ),
    teams: [...teams.values()]
      .sort((a, b) => b.battles - a.battles || a.species.join().localeCompare(b.species.join()))
      .slice(0, teamLimit),
    movesets: Object.fromEntries(
      [...movesets.entries()].map(([id, per]) => [
        id,
        [...per.values()].sort((a, b) => b.battles - a.battles || a.fast.localeCompare(b.fast)),
      ]),
    ),
  };
}
