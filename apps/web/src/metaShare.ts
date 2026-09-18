/**
 * Community meta sharing: every battle logged on this phone goes to the counter worker as an
 * anonymous record unless the player switches it off in Settings. What is sent, per battle:
 * league, season, time, the three species run, the opponents seen, win or loss or tanked, the
 * player's rank band, and a random device id made here. Never the collection, IVs, moves,
 * specimen ids or names.
 */
import type { BattleSet, LoggedBattle, Season } from '@pickthree/engine';
import { COUNTER_ORIGIN } from './counter.ts';
import type { Settings } from './storage/db.ts';

export const BANDS = ['below', 'ace', 'veteran', 'expert', 'legend'] as const;
export type Band = (typeof BANDS)[number];
export const BAND_LABELS: Record<Band, string> = {
  below: 'Below Ace',
  ace: 'Ace',
  veteran: 'Veteran',
  expert: 'Expert',
  legend: 'Legend',
};

export interface SharedMoves {
  fast: string;
  charged: string[];
}

export interface SharedBattle {
  id: string;
  league: string;
  season: number | null;
  at: string;
  team: [string, string, string];
  /** The moves each of the three ran, when the set knows them. */
  moves?: [SharedMoves | null, SharedMoves | null, SharedMoves | null];
  opponents: string[];
  result: 'win' | 'loss' | null;
  tanked: boolean;
  band: Band | null;
}

export const SHARE_BATCH = 200;
const SHARE_URL = `${COUNTER_ORIGIN}/battles`;
/** Set this in localStorage to share from a dev build while testing the worker. */
export const SHARE_DEV_KEY = 'pickthree.shareDev';

/** On unless switched off; absent in older saves means on. */
export function shareEnabled(settings: Settings): boolean {
  return settings.share?.enabled !== false;
}

/** Only the live site contributes: never automation, never a dev server (unless asked). */
export function shareEligible(
  where: { hostname: string; webdriver: boolean; devFlag: boolean } = {
    hostname: window.location.hostname,
    webdriver: Boolean(navigator.webdriver),
    devFlag: (() => {
      try {
        return localStorage.getItem(SHARE_DEV_KEY) === '1';
      } catch {
        return false;
      }
    })(),
  },
): boolean {
  if (where.webdriver) {
    return false;
  }
  return where.hostname === 'pick3.gg' || where.hostname === 'www.pick3.gg' || where.devFlag;
}

export function newDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  const hex = (n: number): string =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

/** The season a battle falls in: the latest one that had started by then. */
export function seasonOf(at: string, seasons: Season[]): number | null {
  const t = Date.parse(at);
  let found: Season | null = null;
  for (const s of [...seasons].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    if (Date.parse(s.start) <= t) {
      found = s;
    }
  }
  return found?.id ?? null;
}

/** Battles not yet sent, as records, oldest first. */
export function pendingBattles(
  sets: BattleSet[],
  seasons: Season[],
  band: Band | null,
): SharedBattle[] {
  const out: SharedBattle[] = [];
  for (const set of sets) {
    for (const b of set.battles) {
      if (b.sharedAt) {
        continue;
      }
      out.push({
        id: b.id,
        league: set.league,
        season: seasonOf(b.at, seasons),
        at: b.at,
        team: set.team.species,
        ...(set.team.moves
          ? {
              moves: set.team.moves.map((m) =>
                m ? { fast: m.fast, charged: [...m.charged] } : null,
              ) as [SharedMoves | null, SharedMoves | null, SharedMoves | null],
            }
          : {}),
        opponents: b.opponents.slice(0, 3),
        result: b.result,
        tanked: b.tanked,
        band,
      });
    }
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export interface SyncResult {
  sent: number;
  /** The sets with sharedAt stamped on every battle that went through. */
  sets: BattleSet[];
}

/**
 * Sends what is pending in batches and stamps sharedAt on each battle the worker accepted.
 * A failed batch stops the run; the rest goes next time. Returns null when nothing was sent.
 */
export async function syncShared(
  sets: BattleSet[],
  opts: { device: string; client: string; seasons: Season[]; band: Band | null },
  deps: { fetch: typeof fetch; now: () => string } = {
    fetch: (...args) => fetch(...args),
    now: () => new Date().toISOString(),
  },
): Promise<SyncResult | null> {
  const pending = pendingBattles(sets, opts.seasons, opts.band);
  if (pending.length === 0) {
    return null;
  }
  const sentIds = new Set<string>();
  for (let i = 0; i < pending.length; i += SHARE_BATCH) {
    const batch = pending.slice(i, i + SHARE_BATCH);
    const ok = await deps
      .fetch(SHARE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: opts.device, client: opts.client, battles: batch }),
        keepalive: true,
      })
      .then((res) => res.ok)
      .catch(() => false);
    if (!ok) {
      break;
    }
    for (const b of batch) {
      sentIds.add(b.id);
    }
  }
  if (sentIds.size === 0) {
    return null;
  }
  const at = deps.now();
  const stamp = (b: LoggedBattle): LoggedBattle => (sentIds.has(b.id) ? { ...b, sharedAt: at } : b);
  return {
    sent: sentIds.size,
    sets: sets.map((s) => ({ ...s, battles: s.battles.map(stamp) })),
  };
}

/** Asks the worker to drop everything this device sent. True when it did. */
export async function forgetShared(
  device: string,
  deps: { fetch: typeof fetch } = { fetch: (...args) => fetch(...args) },
): Promise<boolean> {
  try {
    const res = await deps.fetch(SHARE_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The same sets with every sharedAt cleared, so a later sync sends everything again. */
export function unstampAll(sets: BattleSet[]): BattleSet[] {
  return sets.map((s) => ({
    ...s,
    battles: s.battles.map((b) => {
      const { sharedAt: _gone, ...rest } = b;
      void _gone;
      return rest;
    }),
  }));
}
