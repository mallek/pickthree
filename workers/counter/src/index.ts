/**
 * PickThree hit counter, anonymous error log, and the community meta store. Geocities style.
 *
 *   POST /hit       increments and returns { count }
 *   GET  /count     returns { count }
 *   POST /error     records { build, stage, message, ua } (rolling 200, no identifiers)
 *   GET  /errors    returns the log; needs Authorization: Bearer <ERRORS_READ_TOKEN>
 *   POST /battles   stores anonymous battle records { device, client, battles } (max 200)
 *   DELETE /battles removes everything one device sent { device }
 *   GET  /meta      per-league summary: ?league=great&days=90
 *   GET  /api/v1/meta               per-league rollup: ?league=great&since=...&until=...&band=
 *   GET  /api/v1/teams              the team board, run and faced, cores and complete teams
 *   GET  /api/v1/species/<id>       per-species detail over the same window and band
 *   PUT  /api/v1/events/<id>            declares (or replaces) a tournament event; keyed
 *   POST /api/v1/events/<id>/battles    stores its battles, upsert by id; keyed
 *   POST /api/v1/events/<id>/roster     stores its roster entries, upsert by (player, slot); keyed
 *   DELETE /api/v1/events/<id>          removes the event, its battles and its roster; keyed
 *   GET  /api/v1/events                 events in a window: ?league=great&since=...&until=...
 *   GET  /api/v1/events/<id>            one event's matches, roster and species
 *
 * Nothing stored identifies a player: no IPs, no collection data, no names. The counter and
 * the error log live in one Durable Object; the battle records in another with SQLite. Anything
 * that is not one of these routes falls through to the ASSETS binding: the meta.pick3.gg site.
 * The keyed routes take a bearer token (Authorization: Bearer <INGEST_TOKEN>) instead of an
 * Origin check: a script calls them, not a browser.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  aggregate,
  DEFAULT_SOURCE,
  parseBatch,
  type Band,
  type BattleRow,
  type BattleSource,
  type MetaSummary,
  type SharedBatch,
  type SharedMoves,
} from './battles.js';
import {
  isWorkerPath,
  readParams,
  speciesDetail,
  summarize,
  type MetaSummaryV1,
  type ReadParams,
  type SpeciesDetailV1,
} from './meta.js';
import { parseReport, type ErrorReport } from './report.js';
import { teamBoard, type TeamsV1 } from './teams.js';
import {
  eventDetail,
  eventList,
  mergedTeams,
  speciesTournamentBlock,
  tournamentBlock,
  tournamentSpeciesDetail,
  tournamentSummary,
  tournamentTeams,
  type EventDetailV1,
  type EventListRow,
} from './tournamentRead.js';
import {
  EVENT_ID,
  parseBattlesBody,
  parseEventBody,
  parseRosterBody,
  type BattlesBody,
  type EventInput,
  type RosterBody,
} from './tournament.js';
import {
  createTournamentTables,
  deleteEvent,
  getEvent,
  putBattles,
  putEvent,
  putRoster,
  readEventBattles,
  readEventRoster,
  readEventsInWindow,
  readRosterForEvents,
  readTournamentBattles,
  type TournamentBattleRow,
} from './tournamentStore.js';

export interface Env {
  COUNTER: DurableObjectNamespace<Counter>;
  META: DurableObjectNamespace<MetaStore>;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS: string;
  ERRORS_READ_TOKEN?: string;
  /** Bearer token for the tournament ingest routes, a worker secret like ERRORS_READ_TOKEN.
   *  Without it every write is refused: an unconfigured worker must not accept anonymous
   *  tournament records, which is the whole point of keying this population. */
  INGEST_TOKEN?: string;
}

const MAX_ERRORS = 200;
/** The most rows one summary reads; well past what a league sees in a season for now. */
const SUMMARY_ROWS = 100_000;
/** How long the edge may hold a read. The site rounds its window to match. */
const READ_CACHE = 'public, max-age=600';
const SPECIES = /^[a-z0-9_]+$/;

export class Counter extends DurableObject<Env> {
  async get(): Promise<number> {
    return (await this.ctx.storage.get<number>('count')) ?? 0;
  }

  async increment(): Promise<number> {
    const next = (await this.get()) + 1;
    await this.ctx.storage.put('count', next);
    return next;
  }

  async errors(): Promise<ErrorReport[]> {
    return (await this.ctx.storage.get<ErrorReport[]>('errors')) ?? [];
  }

  async recordError(r: ErrorReport): Promise<number> {
    const next = [r, ...(await this.errors())].slice(0, MAX_ERRORS);
    await this.ctx.storage.put('errors', next);
    return next.length;
  }
}

/** Battle records from every phone that shares, one SQLite table, keyed by device and id. */
export class MetaStore extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS battles (
        key TEXT PRIMARY KEY,
        device TEXT NOT NULL,
        id TEXT NOT NULL,
        league TEXT NOT NULL,
        season INTEGER,
        at TEXT NOT NULL,
        team TEXT NOT NULL,
        opponents TEXT NOT NULL,
        result TEXT,
        tanked INTEGER NOT NULL,
        band TEXT,
        client TEXT NOT NULL,
        received TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS battles_league_at ON battles (league, at);
      CREATE INDEX IF NOT EXISTS battles_device ON battles (device);
    `);
    // Added after the first deploy; SQLite has no ADD COLUMN IF NOT EXISTS.
    const cols = ctx.storage.sql.exec('PRAGMA table_info(battles)').toArray();
    if (!cols.some((c) => c['name'] === 'moves')) {
      ctx.storage.sql.exec('ALTER TABLE battles ADD COLUMN moves TEXT');
    }
    if (!cols.some((c) => c['name'] === 'source')) {
      ctx.storage.sql.exec("ALTER TABLE battles ADD COLUMN source TEXT NOT NULL DEFAULT 'ladder'");
    }
    createTournamentTables(ctx.storage.sql);
  }

  ingest(batch: SharedBatch): { stored: number; skipped: number } {
    const received = new Date().toISOString();
    let stored = 0;
    for (const b of batch.battles) {
      const cursor = this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO battles
           (key, device, id, league, season, at, team, moves, opponents, result, tanked, band, source, client, received)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `${batch.device}:${b.id}`,
        batch.device,
        b.id,
        b.league,
        b.season,
        b.at,
        JSON.stringify(b.team),
        b.moves ? JSON.stringify(b.moves) : null,
        JSON.stringify(b.opponents),
        b.result,
        b.tanked ? 1 : 0,
        b.band,
        DEFAULT_SOURCE,
        batch.client,
        received,
      );
      stored += cursor.rowsWritten > 0 ? 1 : 0;
    }
    return { stored, skipped: batch.battles.length - stored };
  }

  forget(device: string): number {
    const cursor = this.ctx.storage.sql.exec('DELETE FROM battles WHERE device = ?', device);
    return cursor.rowsWritten;
  }

  summary(league: string, since: string): MetaSummary {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT device, league, season, at, team, moves, opponents, result, tanked, band, source
           FROM battles WHERE league = ? AND at >= ? ORDER BY at DESC LIMIT ?`,
        league,
        since,
        SUMMARY_ROWS,
      )
      .toArray();
    const parsed: BattleRow[] = rows.map((r) => ({
      device: String(r['device']),
      league: String(r['league']),
      season: typeof r['season'] === 'number' ? r['season'] : null,
      at: String(r['at']),
      team: JSON.parse(String(r['team'])) as string[],
      moves:
        typeof r['moves'] === 'string' ? (JSON.parse(r['moves']) as (SharedMoves | null)[]) : null,
      opponents: JSON.parse(String(r['opponents'])) as string[],
      result: (r['result'] as 'win' | 'loss' | null) ?? null,
      tanked: r['tanked'] === 1,
      band: (r['band'] as Band | null) ?? null,
      source: (r['source'] as BattleSource | null) ?? DEFAULT_SOURCE,
    }));
    return aggregate(league, parsed);
  }

  /** Every row for a league in a half-open window, newest first, capped. */
  private read(league: string, since: string, until: string): BattleRow[] {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT device, league, season, at, team, moves, opponents, result, tanked, band, source
           FROM battles WHERE league = ? AND at >= ? AND at < ? ORDER BY at DESC LIMIT ?`,
        league,
        since,
        until,
        SUMMARY_ROWS,
      )
      .toArray();
    return rows.map((r) => ({
      device: String(r['device']),
      league: String(r['league']),
      season: typeof r['season'] === 'number' ? r['season'] : null,
      at: String(r['at']),
      team: JSON.parse(String(r['team'])) as string[],
      moves:
        typeof r['moves'] === 'string' ? (JSON.parse(r['moves']) as (SharedMoves | null)[]) : null,
      opponents: JSON.parse(String(r['opponents'])) as string[],
      result: (r['result'] as 'win' | 'loss' | null) ?? null,
      tanked: r['tanked'] === 1,
      band: (r['band'] as Band | null) ?? null,
      source: (r['source'] as BattleSource | null) ?? DEFAULT_SOURCE,
    }));
  }

  declareEvent(e: EventInput): { id: string } {
    putEvent(this.ctx.storage.sql, e, new Date().toISOString());
    return { id: e.id };
  }

  storeBattles(
    eventId: string,
    body: BattlesBody,
  ): { stored: number; replaced: number; rejected: number } | { missing: true } {
    const event = getEvent(this.ctx.storage.sql, eventId);
    if (!event) {
      return { missing: true };
    }
    // The event's league and cup are stamped onto every row from here, never from the body: a
    // battle cannot claim a league its event does not have.
    const counts = putBattles(
      this.ctx.storage.sql,
      event,
      body.extractor,
      body.battles,
      new Date().toISOString(),
    );
    return { ...counts, rejected: 0 };
  }

  storeRoster(
    eventId: string,
    body: RosterBody,
  ): { stored: number; replaced: number; rejected: number } | { missing: true } {
    const event = getEvent(this.ctx.storage.sql, eventId);
    if (!event) {
      return { missing: true };
    }
    const counts = putRoster(
      this.ctx.storage.sql,
      eventId,
      body.entries,
      new Date().toISOString(),
    );
    return { ...counts, rejected: 0 };
  }

  removeEvent(id: string): { events: number; battles: number; roster: number } {
    return deleteEvent(this.ctx.storage.sql, id);
  }

  eventsV1(p: ReadParams): { events: EventListRow[] } {
    const rows = readTournamentBattles(this.ctx.storage.sql, p.league, p.since, p.until);
    const events = readEventsInWindow(this.ctx.storage.sql, p.league, p.since, p.until);
    return { events: eventList(p.league, events, rows) };
  }

  eventV1(id: string): EventDetailV1 | null {
    const event = getEvent(this.ctx.storage.sql, id);
    if (!event) {
      return null;
    }
    return eventDetail(
      event.league,
      event,
      readEventBattles(this.ctx.storage.sql, id),
      readEventRoster(this.ctx.storage.sql, id),
    );
  }

  /** Every tournament row for a league in the window. Read once per request, like `read`. */
  private readTournament(p: ReadParams): TournamentBattleRow[] {
    return readTournamentBattles(this.ctx.storage.sql, p.league, p.since, p.until);
  }

  summaryV1(p: ReadParams): MetaSummaryV1 {
    if (p.source === 'tournament') {
      return tournamentSummary({
        ...p,
        rows: this.readTournament(p),
        events: readEventsInWindow(this.ctx.storage.sql, p.league, p.since, p.until),
        now: new Date(),
      });
    }
    const span = Date.parse(p.until) - Date.parse(p.since);
    const prevSince = new Date(Date.parse(p.since) - span).toISOString();
    const base = summarize({
      ...p,
      rows: this.read(p.league, p.since, p.until),
      previousRows: this.read(p.league, prevSince, p.since),
      now: new Date(),
    });
    if (p.source !== 'all') {
      return base;
    }
    return {
      ...base,
      tournament: tournamentBlock(
        p.league,
        this.readTournament(p),
        readEventsInWindow(this.ctx.storage.sql, p.league, p.since, p.until),
      ),
    };
  }

  speciesV1(p: ReadParams, speciesId: string): SpeciesDetailV1 {
    const tournamentRows = p.source === 'ladder' ? [] : this.readTournament(p);
    const roster =
      p.source === 'ladder'
        ? []
        : readRosterForEvents(this.ctx.storage.sql, [...new Set(tournamentRows.map((r) => r.event))]);
    if (p.source === 'tournament') {
      return tournamentSpeciesDetail({
        ...p,
        speciesId,
        rows: tournamentRows,
        roster,
        now: new Date(),
      });
    }
    const base = speciesDetail({
      ...p,
      speciesId,
      rows: this.read(p.league, p.since, p.until),
      now: new Date(),
    });
    if (p.source !== 'all') {
      return base;
    }
    return {
      ...base,
      tournament: speciesTournamentBlock({
        league: p.league,
        speciesId,
        rows: tournamentRows,
        roster,
      }),
    };
  }

  teamsV1(p: ReadParams): TeamsV1 {
    if (p.source === 'tournament') {
      return tournamentTeams({ ...p, rows: this.readTournament(p), now: new Date() });
    }
    const ladderRows = this.read(p.league, p.since, p.until);
    if (p.source !== 'all') {
      return teamBoard({ ...p, rows: ladderRows, now: new Date() });
    }
    return mergedTeams({ ...p, ladderRows, rows: this.readTournament(p), now: new Date() });
  }
}

function cors(origin: string | null, allowed: string[]): Record<string, string> {
  const ok = origin !== null && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };
}

async function readJson(
  request: Request,
  limit: number,
): Promise<{ body: unknown } | { status: number; error: string }> {
  const text = await request.text();
  if (text.length > limit) {
    return { status: 413, error: 'too large' };
  }
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { status: 400, error: 'bad json' };
  }
}

/** How many records a rejected body was carrying, so the `rejected` count is the truth rather
 *  than a 1 that hides how much was thrown away. */
function countRows(body: unknown, leaf: 'battles' | 'roster'): number {
  if (typeof body !== 'object' || body === null) {
    return 0;
  }
  const list = (body as Record<string, unknown>)[leaf === 'battles' ? 'battles' : 'entries'];
  return Array.isArray(list) ? list.length : 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    const headers = cors(request.headers.get('Origin'), allowed);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    const stub = env.COUNTER.getByName('pick3');
    const originOk = (): boolean => {
      const origin = request.headers.get('Origin');
      return origin !== null && allowed.includes(origin);
    };
    if (request.method === 'GET' && url.pathname === '/count') {
      return Response.json({ count: await stub.get() }, { headers });
    }
    if (request.method === 'POST' && url.pathname === '/hit') {
      if (!originOk()) {
        return Response.json({ error: 'origin not allowed' }, { status: 403, headers });
      }
      return Response.json({ count: await stub.increment() }, { headers });
    }
    if (request.method === 'POST' && url.pathname === '/error') {
      if (!originOk()) {
        return Response.json({ error: 'origin not allowed' }, { status: 403, headers });
      }
      const read = await readJson(request, 2048);
      if ('error' in read) {
        return Response.json({ error: read.error }, { status: read.status, headers });
      }
      const report = parseReport(read.body);
      if (!report) {
        return Response.json({ error: 'bad report' }, { status: 400, headers });
      }
      return Response.json({ stored: await stub.recordError(report) }, { headers });
    }
    if (request.method === 'GET' && url.pathname === '/errors') {
      const auth = request.headers.get('Authorization') ?? '';
      if (!env.ERRORS_READ_TOKEN || auth !== `Bearer ${env.ERRORS_READ_TOKEN}`) {
        return Response.json({ error: 'unauthorized' }, { status: 401, headers });
      }
      return Response.json({ errors: await stub.errors() }, { headers });
    }
    const meta = env.META.getByName('pick3');
    if (request.method === 'POST' && url.pathname === '/battles') {
      if (!originOk()) {
        return Response.json({ error: 'origin not allowed' }, { status: 403, headers });
      }
      // 200 records at about 300 bytes each is well under this.
      const read = await readJson(request, 256 * 1024);
      if ('error' in read) {
        return Response.json({ error: read.error }, { status: read.status, headers });
      }
      const batch = parseBatch(read.body);
      if (!batch) {
        return Response.json({ error: 'bad batch' }, { status: 400, headers });
      }
      return Response.json(await meta.ingest(batch), { headers });
    }
    if (request.method === 'DELETE' && url.pathname === '/battles') {
      if (!originOk()) {
        return Response.json({ error: 'origin not allowed' }, { status: 403, headers });
      }
      const read = await readJson(request, 1024);
      if ('error' in read) {
        return Response.json({ error: read.error }, { status: read.status, headers });
      }
      const device =
        typeof read.body === 'object' && read.body !== null
          ? (read.body as { device?: unknown }).device
          : undefined;
      if (typeof device !== 'string' || !/^[0-9a-f-]{36}$/.test(device)) {
        return Response.json({ error: 'bad device' }, { status: 400, headers });
      }
      return Response.json({ deleted: await meta.forget(device) }, { headers });
    }
    // Tournament routes. The writes take a bearer token and no Origin check: a script calls
    // these, not a browser, and the token is what makes this population unforgeable. The
    // phone's /battles route cannot reach these tables and these routes cannot reach the
    // ladder table.
    if (url.pathname === '/api/v1/events' || url.pathname.startsWith('/api/v1/events/')) {
      const rest = url.pathname.slice('/api/v1/events'.length).replace(/^\//, '');
      const [eventId, leaf] = rest.split('/');
      const read = { ...headers, 'Cache-Control': READ_CACHE };

      if (request.method === 'GET') {
        if (rest === '') {
          const p = readParams(url);
          if ('error' in p) {
            return Response.json({ error: p.error }, { status: 400, headers });
          }
          return Response.json(await meta.eventsV1(p), { headers: read });
        }
        if (leaf === undefined && eventId !== undefined && EVENT_ID.test(eventId)) {
          const detail = await meta.eventV1(eventId);
          if (!detail) {
            return Response.json({ error: 'not found' }, { status: 404, headers });
          }
          return Response.json(detail, { headers: read });
        }
        return Response.json({ error: 'not found' }, { status: 404, headers });
      }

      const auth = request.headers.get('Authorization') ?? '';
      if (!env.INGEST_TOKEN || auth !== `Bearer ${env.INGEST_TOKEN}`) {
        return Response.json({ error: 'unauthorized' }, { status: 401, headers });
      }
      if (eventId === undefined || !EVENT_ID.test(eventId)) {
        return Response.json({ error: 'bad event id' }, { status: 400, headers });
      }

      if (request.method === 'DELETE' && leaf === undefined) {
        return Response.json({ deleted: await meta.removeEvent(eventId) }, { headers });
      }
      if (request.method === 'PUT' && leaf === undefined) {
        const body = await readJson(request, 8 * 1024);
        if ('error' in body) {
          return Response.json({ error: body.error }, { status: body.status, headers });
        }
        const parsed = parseEventBody(body.body, eventId);
        if (!parsed.ok) {
          return Response.json(
            { error: 'bad event', index: parsed.index, reason: parsed.reason },
            { status: 400, headers },
          );
        }
        return Response.json(await meta.declareEvent(parsed.value), { headers });
      }
      if (request.method === 'POST' && (leaf === 'battles' || leaf === 'roster')) {
        // 200 rows of either kind, comfortably. Battles are the larger of the two.
        const body = await readJson(request, leaf === 'battles' ? 512 * 1024 : 128 * 1024);
        if ('error' in body) {
          return Response.json({ error: body.error }, { status: body.status, headers });
        }
        const parsed =
          leaf === 'battles' ? parseBattlesBody(body.body) : parseRosterBody(body.body);
        if (!parsed.ok) {
          // One malformed record rejects the whole request: a pipeline run that half-lands is
          // worse than one that fails and is rerun.
          const rows = countRows(body.body, leaf);
          return Response.json(
            { stored: 0, replaced: 0, rejected: rows, index: parsed.index, reason: parsed.reason },
            { status: 400, headers },
          );
        }
        const result =
          leaf === 'battles'
            ? await meta.storeBattles(eventId, parsed.value as BattlesBody)
            : await meta.storeRoster(eventId, parsed.value as RosterBody);
        if ('missing' in result) {
          return Response.json({ error: 'no such event' }, { status: 404, headers });
        }
        return Response.json(result, { headers });
      }
      return Response.json({ error: 'not found' }, { status: 404, headers });
    }
    if (request.method === 'GET' && url.pathname === '/meta') {
      const league = url.searchParams.get('league') ?? 'great';
      if (!/^[a-z0-9_]+$/.test(league)) {
        return Response.json({ error: 'bad league' }, { status: 400, headers });
      }
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days') ?? 90) || 90));
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      return Response.json({ since, days, ...(await meta.summary(league, since)) }, { headers });
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/v1/')) {
      const p = readParams(url);
      if ('error' in p) {
        return Response.json({ error: p.error }, { status: 400, headers });
      }
      const read = { ...headers, 'Cache-Control': READ_CACHE };
      if (url.pathname === '/api/v1/meta') {
        return Response.json(await meta.summaryV1(p), { headers: read });
      }
      if (url.pathname === '/api/v1/teams') {
        return Response.json(await meta.teamsV1(p), { headers: read });
      }
      const species = url.pathname.slice('/api/v1/species/'.length);
      if (url.pathname.startsWith('/api/v1/species/') && SPECIES.test(species)) {
        return Response.json(await meta.speciesV1(p, species), { headers: read });
      }
      return Response.json({ error: 'not found' }, { status: 404, headers });
    }
    if (isWorkerPath(url.pathname)) {
      return Response.json({ error: 'not found' }, { status: 404, headers });
    }
    // Anything that is not an endpoint is the meta.pick3.gg site.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
