/**
 * The community meta, read for the Source picker (GBL, Tournaments, All).
 *
 * The request is league, since and until: what any meta.pick3.gg visitor sends. Picking a
 * community source is the player's consent to it, so the sharing switch does not gate this read
 * (it gates what the phone SENDS, and the automatic Suggest teammates read). No collection data,
 * no pinned Pokemon, no device id. One `all` response serves all three sources.
 *
 * It fails silent: offline, blocked, slow or malformed, the engine is told PvPoke and the
 * sentence says the community data was unavailable.
 *
 * Spec: docs/superpowers/specs/2026-09-24-source-weighted-recommendations-design.md
 */
import type { League, Season } from '@pickthree/engine';
import {
  resolveWindow,
  type CommunitySummary,
  type Epoch,
  type WindowKey,
} from '@pickthree/engine/meta';
import { COUNTER_ORIGIN } from './counter.ts';

export interface CommunityPayload {
  summary: CommunitySummary;
  generatedAt: string;
}

export interface CommunityRequest {
  /** The meta.pick3.gg league the data lives under. */
  league: string;
  since: string;
  until: string;
  label: string;
  /** league|since|until: the cache key, and what a stale result is recognised by. */
  key: string;
}

export const WINDOW_LABELS: Record<WindowKey, string> = {
  meta: 'This meta',
  '30': '30 days',
  '7': '7 days',
};

export const COMMUNITY_TIMEOUT_MS = 8_000;

/** Standard leagues are on the site; a shipped cup reads its meta league; specials have none. */
export function communityLeague(league: Pick<League, 'id' | 'kind' | 'meta'>): string | null {
  if (league.kind === 'standard') {
    return league.id;
  }
  if (league.kind === 'cup') {
    return league.meta;
  }
  return null;
}

export function communityRequest(
  league: Pick<League, 'id' | 'kind' | 'meta'>,
  window: WindowKey,
  seasons: readonly Season[],
  epochs: readonly Epoch[],
  now: Date = new Date(),
): CommunityRequest | null {
  const id = communityLeague(league);
  if (id === null) {
    return null;
  }
  const w = resolveWindow(window, { league: id, seasons, epochs }, now);
  return {
    league: id,
    since: w.since,
    until: w.until,
    label: w.label,
    key: `${id}|${w.since}|${w.until}`,
  };
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** The fields the blend reads, checked; anything else is dropped. Null when the shape is wrong. */
export function trimSummary(body: unknown): CommunityPayload | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const b = body as Record<string, unknown>;
  if (
    !isNum(b.battles) ||
    !isNum(b.devices) ||
    !Array.isArray(b.species) ||
    typeof b.generatedAt !== 'string'
  ) {
    return null;
  }
  const species: { speciesId: string; sightings: number }[] = [];
  for (const s of b.species as unknown[]) {
    const r = s as Record<string, unknown>;
    if (typeof r?.speciesId !== 'string' || !isNum(r.sightings)) {
      return null;
    }
    species.push({ speciesId: r.speciesId, sightings: r.sightings });
  }
  let tournament: CommunitySummary['tournament'] = null;
  if (b.tournament !== undefined && b.tournament !== null) {
    const t = b.tournament as Record<string, unknown>;
    if (!isNum(t.events) || !isNum(t.battles) || !Array.isArray(t.species)) {
      return null;
    }
    const picks: { speciesId: string; picks: number }[] = [];
    for (const s of t.species as unknown[]) {
      const r = s as Record<string, unknown>;
      if (typeof r?.speciesId !== 'string' || !isNum(r.picks)) {
        return null;
      }
      picks.push({ speciesId: r.speciesId, picks: r.picks });
    }
    tournament = { events: t.events, battles: t.battles, species: picks };
  }
  return {
    summary: { battles: b.battles, devices: b.devices, species, tournament },
    generatedAt: b.generatedAt,
  };
}

/** One entry per request key. A null entry remembers a failure until the bucket moves. */
const cache = new Map<string, Promise<CommunityPayload | null>>();

export function resetCommunityMetaCache(): void {
  cache.clear();
}

export function loadCommunity(
  req: CommunityRequest,
  opts: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<CommunityPayload | null> {
  const hit = cache.get(req.key);
  if (hit) {
    return hit;
  }
  const fetcher = opts.fetcher ?? fetch;
  const p = (async () => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), opts.timeoutMs ?? COMMUNITY_TIMEOUT_MS);
    try {
      const q = new URLSearchParams({ league: req.league, since: req.since, until: req.until });
      const res = await fetcher(`${COUNTER_ORIGIN}/api/v1/meta?${q.toString()}`, {
        signal: abort.signal,
      });
      if (!res.ok) {
        return null;
      }
      return trimSummary(await res.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  cache.set(req.key, p);
  return p;
}
