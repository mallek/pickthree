/**
 * The tournament pages' read model: pure functions over one event's v1 detail. Finish, the six a
 * player brought, pick counts, the threes they ran and the Watch links are all derived here, from
 * what the broadcast and the RK9 team list show and nothing more (spec 2026-10-18, Data).
 */
import type { EventDetailV1, EventGameV1, EventMatchV1 } from './api.js';

/** Events whose end date falls in the last 55 days are recent: about how long Twitch keeps a
 *  partner channel's past broadcasts, so every Watch link on a recent event still plays. */
export const RECENT_DAYS = 55;

const DAY_MS = 86_400_000;
const DAY_SECONDS = 86_400;

/** The start of the UTC day RECENT_DAYS before `now`, as ISO. */
export function recentSince(now: Date): string {
  const back = new Date(now.getTime() - RECENT_DAYS * DAY_MS);
  return new Date(
    Date.UTC(back.getUTCFullYear(), back.getUTCMonth(), back.getUTCDate()),
  ).toISOString();
}

/** Only what the bracket proves: Champion and Finalist from the grand final, Top cut for anyone
 *  seen in a top cut match, nothing for everyone else. */
export type Finish = 'Champion' | 'Finalist' | 'Top cut' | null;

export interface EventTrio {
  /** In the order first played. */
  ids: string[];
  games: number;
  wins: number;
  losses: number;
}

export interface EventPlayerGame {
  match: EventMatchV1;
  game: EventGameV1;
  side: 'left' | 'right';
  mine: string[];
  theirs: string[];
  result: 'W' | 'L' | null;
}

export interface EventPlayer {
  name: string;
  finish: Finish;
  /** On-stream decided games only. */
  wins: number;
  losses: number;
  /** On-stream games, decided or not. */
  games: number;
  /** Always six: the roster's order, else first seen on stream, padded with null (never seen). */
  six: (string | null)[];
  /** How many of `six` are known. */
  seen: number;
  fromRoster: boolean;
  /** Species id to the number of games it was picked in. */
  picks: Record<string, number>;
  trios: EventTrio[];
  /** From the roster only; null where the roster lists the species without moves. */
  moves: Record<string, { fast: string; charged: string[] } | null>;
  played: EventPlayerGame[];
}

/** Players are matched case-insensitively, as the worker does. */
function key(name: string): string {
  return name.toLowerCase();
}

function decided(match: EventMatchV1): EventGameV1[] {
  return match.games.filter((g) => g.winnerSide === 'left' || g.winnerSide === 'right');
}

/** The side with more decided games; a tie is no winner. */
function matchWinner(match: EventMatchV1): 'left' | 'right' | null {
  let left = 0;
  let right = 0;
  for (const g of decided(match)) {
    if (g.winnerSide === 'left') {
      left += 1;
    } else {
      right += 1;
    }
  }
  if (left === right) {
    return null;
  }
  return left > right ? 'left' : 'right';
}

/** The grand final's winner: more decided games, else (a short scan) the last decided game's
 *  winner, else nobody. Never two champions. */
function grandWinner(match: EventMatchV1): 'left' | 'right' | null {
  const won = matchWinner(match);
  if (won !== null) {
    return won;
  }
  const last = decided(match).at(-1);
  if (last === undefined) {
    return null;
  }
  return last.winnerSide === 'left' ? 'left' : 'right';
}

function grandFinal(detail: EventDetailV1): EventMatchV1 | null {
  const grands = detail.matches.filter((m) => m.bracket === 'grand');
  return grands.at(-1) ?? null;
}

const FINISH_ORDER: Record<string, number> = { Champion: 0, Finalist: 1, 'Top cut': 2 };

function finishRank(f: Finish): number {
  return f === null ? 3 : (FINISH_ORDER[f] ?? 3);
}

export function eventPlayers(detail: EventDetailV1): EventPlayer[] {
  const players = new Map<string, EventPlayer>();
  const trioKeys = new Map<string, Map<string, EventTrio>>();
  const seenOrder = new Map<string, string[]>();

  const playerOf = (name: string): EventPlayer => {
    const k = key(name);
    let p = players.get(k);
    if (p === undefined) {
      p = {
        name,
        finish: null,
        wins: 0,
        losses: 0,
        games: 0,
        six: [],
        seen: 0,
        fromRoster: false,
        picks: {},
        trios: [],
        moves: {},
        played: [],
      };
      players.set(k, p);
      trioKeys.set(k, new Map());
      seenOrder.set(k, []);
    }
    return p;
  };

  for (const m of detail.matches) {
    for (const side of ['left', 'right'] as const) {
      const p = playerOf(side === 'left' ? m.left : m.right);
      const k = key(p.name);
      if (m.stage === 'top_cut') {
        p.finish = 'Top cut';
      }
      for (const g of m.games) {
        const mine = side === 'left' ? g.leftTeam : g.rightTeam;
        const theirs = side === 'left' ? g.rightTeam : g.leftTeam;
        const result =
          g.winnerSide === side
            ? 'W'
            : g.winnerSide === 'left' || g.winnerSide === 'right'
              ? 'L'
              : null;
        p.games += 1;
        if (result === 'W') {
          p.wins += 1;
        } else if (result === 'L') {
          p.losses += 1;
        }
        p.played.push({ match: m, game: g, side, mine: [...mine], theirs: [...theirs], result });

        const distinct = [...new Set(mine)];
        const order = seenOrder.get(k) as string[];
        for (const id of distinct) {
          p.picks[id] = (p.picks[id] ?? 0) + 1;
          if (!order.includes(id)) {
            order.push(id);
          }
        }

        const trios = trioKeys.get(k) as Map<string, EventTrio>;
        const tk = [...distinct].sort().join('|');
        const trio = trios.get(tk) ?? { ids: distinct, games: 0, wins: 0, losses: 0 };
        trio.games += 1;
        if (result === 'W') {
          trio.wins += 1;
        } else if (result === 'L') {
          trio.losses += 1;
        }
        trios.set(tk, trio);
      }
    }
  }

  const gf = grandFinal(detail);
  if (gf !== null) {
    const won = grandWinner(gf);
    const left = playerOf(gf.left);
    const right = playerOf(gf.right);
    if (won === null) {
      // Both reached the final; which of them won is not known.
      left.finish = 'Finalist';
      right.finish = 'Finalist';
    } else {
      (won === 'left' ? left : right).finish = 'Champion';
      (won === 'left' ? right : left).finish = 'Finalist';
    }
  }

  const rosters = new Map(detail.roster.map((r) => [key(r.player), r]));
  for (const [k, p] of players) {
    const roster = rosters.get(k);
    let six: (string | null)[];
    if (roster !== undefined && roster.species.length > 0) {
      p.fromRoster = true;
      six = roster.species.slice(0, 6).map((s) => s.species);
      for (const s of roster.species) {
        p.moves[s.species] =
          s.moves === null ? null : { fast: s.moves.fast, charged: [...s.moves.charged] };
      }
    } else {
      six = (seenOrder.get(k) as string[]).slice(0, 6);
    }
    while (six.length < 6) {
      six.push(null);
    }
    p.six = six;
    p.seen = six.filter((s) => s !== null).length;
    // Map insertion order is first played, and sort is stable, so equal trios stay in that order.
    p.trios = [...(trioKeys.get(k) as Map<string, EventTrio>).values()].sort(
      (a, b) => b.games - a.games || b.wins - a.wins,
    );
  }

  return [...players.values()].sort(
    (a, b) =>
      finishRank(a.finish) - finishRank(b.finish) ||
      b.wins - a.wins ||
      a.losses - b.losses ||
      a.name.localeCompare(b.name),
  );
}

export function champion(detail: EventDetailV1): EventPlayer | null {
  return eventPlayers(detail).find((p) => p.finish === 'Champion') ?? null;
}

function vodFor(event: EventDetailV1['event'], day: number): string | null {
  return event.vods.find((v) => v.day === day)?.id ?? null;
}

/** Seconds into that day's VOD. A game's `at` is startDate + (day - 1) days + seconds into the
 *  day's VOD (the contract both pipelines write). Null when the day has no VOD or the offset is
 *  negative or over a day. */
export function vodOffset(event: EventDetailV1['event'], day: number, at: string): number | null {
  if (vodFor(event, day) === null) {
    return null;
  }
  const base = Date.parse(`${event.startDate}T00:00:00.000Z`) + (day - 1) * DAY_MS;
  const when = Date.parse(at);
  if (Number.isNaN(base) || Number.isNaN(when)) {
    return null;
  }
  const seconds = Math.floor((when - base) / 1000);
  if (seconds < 0 || seconds > DAY_SECONDS) {
    return null;
  }
  return seconds;
}

/** The Twitch link for a day's VOD, at the game's moment when `at` gives an offset. */
export function vodUrl(event: EventDetailV1['event'], day: number, at?: string): string | null {
  const id = vodFor(event, day);
  if (id === null) {
    return null;
  }
  const url = `https://www.twitch.tv/videos/${id.replace(/^v/, '')}`;
  if (at === undefined) {
    return url;
  }
  const offset = vodOffset(event, day, at);
  if (offset === null) {
    return url;
  }
  const h = Math.floor(offset / 3600);
  const m = Math.floor((offset % 3600) / 60);
  const s = offset % 60;
  return `${url}?t=${h}h${m}m${s}s`;
}

const SHORT_NAME =
  /^\d{4}\s+(.+?)\s+(?:Pok[eé]mon\s+GO\s+)?(Regional|International|World)\s+Championships?$/i;

/** "2027 Nice Pokemon GO Regional Championships" -> "Nice Regional"; anything else unchanged. */
export function shortEventName(name: string): string {
  const m = SHORT_NAME.exec(name.trim());
  if (m === null) {
    return name;
  }
  return `${m[1]} ${m[2]}`;
}
