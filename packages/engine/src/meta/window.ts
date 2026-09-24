/**
 * The windows meta.pick3.gg and pick3 both read the community meta over. "This meta" starts at
 * the newest epoch for the league (a hand-kept reset list) or else the season start, and every
 * window ends on the next ten minute boundary so all readers in a slice share one cached URL.
 * Moved from apps/meta so the two sites resolve the same moment the same way.
 */
export type WindowKey = 'meta' | '30' | '7';

/**
 * Meta epochs: when the game changed enough that what came before stops describing what players
 * face now. Hand-kept in apps/meta/epochs.json, the same pattern packages/data/seasons.json
 * already follows, and validated by the bake.
 *
 * Resetting the meta is one line and a deploy, and it DELETES NOTHING. A reset moves the default
 * window; it does not purge the Durable Object. The 30 and 7 day views keep working and a reset
 * made in error is one edit from undone. A destructive purge is the only version that cannot be
 * taken back, and it is never needed: the cure for stale data is to stop counting it, not to burn
 * it.
 *
 * Not derived from the PvPoke bump. data-refresh.yml moves that commit weekly and almost none of
 * those bumps are a meta reset; deriving it would reset the site most weeks for nothing. An epoch
 * can NAME the commit it expects instead, and the site says so plainly when the two disagree,
 * because that is the case where the projection scores the old movesets while the measured side
 * already reflects the new ones.
 */
export interface Epoch {
  at: string;
  note: string;
  /** Absent means every league. */
  leagues?: string[];
  pvpokeCommit?: string;
}

export function epochFor(epochs: readonly Epoch[], league: string, at: Date): Epoch | null {
  let best: Epoch | null = null;
  let bestAt = -Infinity;
  for (const e of epochs) {
    const started = Date.parse(e.at);
    if (!Number.isFinite(started) || started > at.getTime()) {
      continue;
    }
    if (e.leagues && !e.leagues.includes(league)) {
      continue;
    }
    if (started > bestAt) {
      best = e;
      bestAt = started;
    }
  }
  return best;
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;

/** The hand-kept meta epoch list, validated and sorted by time. Mirrors readSeasons. */
export function readEpochs(raw: unknown): Epoch[] {
  if (!Array.isArray(raw)) {
    throw new Error('epochs.json: expected an array');
  }
  const out: Epoch[] = raw.map((entry, i) => {
    const e = entry as Partial<Epoch>;
    if (typeof e.at !== 'string' || !ISO_WITH_OFFSET.test(e.at) || Number.isNaN(Date.parse(e.at))) {
      throw new Error(`epochs.json: entry ${i} "at" must be an ISO time with an offset or Z`);
    }
    if (typeof e.note !== 'string' || e.note.length === 0) {
      throw new Error(`epochs.json: entry ${i} needs a note`);
    }
    if (e.leagues !== undefined && !Array.isArray(e.leagues)) {
      throw new Error(`epochs.json: entry ${i} "leagues" must be an array when present`);
    }
    const made: Epoch = { at: e.at, note: e.note };
    if (e.leagues) {
      made.leagues = [...e.leagues];
    }
    if (typeof e.pvpokeCommit === 'string') {
      made.pvpokeCommit = e.pvpokeCommit;
    }
    return made;
  });
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export interface WindowContext {
  league: string;
  seasons: readonly { start: string }[];
  epochs: readonly Epoch[];
}

export interface ApiWindow {
  since: string;
  until: string;
  label: string;
  key: WindowKey;
  /** The epoch the window came from, when it came from one. */
  epoch: Epoch | null;
}

/** Ten minute buckets, so every reader in a slice asks the edge for the same url. */
export const BUCKET_MS = 600_000;
const DAY_MS = 86_400_000;
/** The most days the worker will answer for (MAX_SPAN_DAYS in workers/counter/src/meta.ts). The
 *  client clamps first rather than letting an old epoch produce a request that is refused. */
export const MAX_SPAN_DAYS = 400;

/** Rounds up to the next ten minute boundary. An exact boundary stays where it is. */
function bucketUp(now: Date): number {
  return Math.ceil(now.getTime() / BUCKET_MS) * BUCKET_MS;
}

function seasonStart(seasons: readonly { start: string }[], at: number): number | null {
  let best: number | null = null;
  for (const s of seasons) {
    const start = Date.parse(s.start);
    if (Number.isFinite(start) && start <= at && (best === null || start > best)) {
      best = start;
    }
  }
  return best;
}

export function resolveWindow(key: WindowKey, ctx: WindowContext, now: Date): ApiWindow {
  const until = bucketUp(now);
  if (key !== 'meta') {
    const days = key === '7' ? 7 : 30;
    return {
      since: new Date(until - days * DAY_MS).toISOString(),
      until: new Date(until).toISOString(),
      label: `${days} days`,
      key,
      epoch: null,
    };
  }
  const epoch = epochFor(ctx.epochs, ctx.league, new Date(until));
  // An epoch first, the season start second: the season is still the right answer for a league
  // no epoch has ever named, and it is what a record stamps.
  const start = epoch ? Date.parse(epoch.at) : seasonStart(ctx.seasons, until);
  if (start === null || !Number.isFinite(start)) {
    // Nothing covers this moment, so measure the last 30 days and keep the chip honest.
    const fallback = resolveWindow('30', ctx, now);
    return { ...fallback, label: 'This meta', key: 'meta' };
  }
  const floor = until - MAX_SPAN_DAYS * DAY_MS;
  return {
    since: new Date(Math.max(start, floor)).toISOString(),
    until: new Date(until).toISOString(),
    label: 'This meta',
    key,
    epoch,
  };
}
