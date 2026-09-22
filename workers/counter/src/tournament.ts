/**
 * The tournament wire contract: what the extraction pipeline PUTs and POSTs, and what the worker
 * will accept. Nothing here touches the ladder tables.
 *
 * A record is rejected for SHAPE only, never for gaps. Partial teams, null winners, missing
 * movesets and unresolved forms all validate: 15 of Baltimore's 105 battles have no winner and
 * that is honest data. One malformed record rejects the whole request, with its index and reason,
 * so a pipeline run fails loudly rather than half-landing.
 *
 * The only identity anywhere is the screen name, which is public on the broadcast and on RK9's
 * roster. The roster parser never sees a first name, a last name or a country: those columns are
 * never extracted upstream, so there is no moment at which a legal name exists on our side.
 */
import type { SharedMoves } from './battles.js';

/** Stamped by the route on every battle. A hand-entered result would be a third value later. */
export const TOURNAMENT_SOURCE = 'broadcast';
/** The most records one battles or roster request may carry. */
export const MAX_TOURNAMENT_BATCH = 200;

/**
 * The tournament cup each site league's Play! events are played under. Only events on this cup
 * enter that league's blend. The same map exists in apps/meta/scripts/bake.ts, for the same reason
 * api.ts writes the wire shapes down twice: neither workspace depends on the other, and a rule
 * written on both sides is the contract. Both copies are asserted by their own test.
 */
export const OPEN_EQUIVALENT_CUP: Record<string, string> = { great: 'championshipseries' };

export const EVENT_ID = /^[a-z0-9-]{3,64}$/;
const BATTLE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SPECIES = /^[a-z0-9_]+$/;
const MOVE = /^[A-Z0-9_]+$/;
const SLUG = /^[a-z0-9_]+$/;
const VOD = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_NAME = /^[A-Za-z0-9._-]{1,120}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Printable 7-bit ASCII, 1 to 40 characters. Stored as sent, compared case-insensitively. */
const PLAYER = /^[\x20-\x7e]{1,40}$/;
/** Printable 7-bit ASCII, up to 500 characters. */
const TEXT = /^[\x20-\x7e]{0,500}$/;

export type FormSource = 'rk9' | 'unresolved';
export type Stage = 'groups' | 'top_cut';
export type MatchFormat = 'bo3' | 'bo5';
export type Bracket = 'winners' | 'losers' | 'grand';
export type WinnerSide = 'left' | 'right';
export type ResultSource = 'score' | 'banner' | 'format' | 'human';

const FORM_SOURCES: readonly string[] = ['rk9', 'unresolved'];
const STAGES: readonly string[] = ['groups', 'top_cut'];
const FORMATS: readonly string[] = ['bo3', 'bo5'];
const BRACKETS: readonly string[] = ['winners', 'losers', 'grand'];
const SIDES: readonly string[] = ['left', 'right'];
const RESULT_SOURCES: readonly string[] = ['score', 'banner', 'format', 'human'];

export interface EventInput {
  /** From the path, not the body. */
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  league: string;
  cup: string;
  vods: string[];
  notes: string | null;
}

export interface SideInput {
  player: string;
  /** 1 to 3 species ids. */
  team: string[];
  /** Same length as `team`. */
  forms: FormSource[];
}

export interface TournamentBattleInput {
  id: string;
  at: string;
  day: number;
  stage: Stage;
  group: string | null;
  roundLabel: string | null;
  match: string;
  game: number;
  matchFormat: MatchFormat;
  bracket: Bracket;
  bracketDepth: number;
  left: SideInput;
  right: SideInput;
  winnerSide: WinnerSide | null;
  resultSource: ResultSource | null;
  scoreAtStart: [number, number];
  evidence: string[];
  notes: string | null;
}

export interface BattlesBody {
  /** Pipeline name and version, stored like the ladder's `client`. */
  extractor: string;
  battles: TournamentBattleInput[];
}

export interface RosterEntryInput {
  player: string;
  /** 1 to 6. Order is not meaningful. */
  slot: number;
  /** Species id with its form spelled out, e.g. corsola_galarian. */
  species: string;
  moves: SharedMoves | null;
}

export interface RosterBody {
  entries: RosterEntryInput[];
}

/** A parse either yields a value or names the first offending record and why. `index` is -1 when
 *  the failure is the envelope itself rather than one record. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; index: number; reason: string };

function fail(index: number, reason: string): { ok: false; index: number; reason: string } {
  return { ok: false, index, reason };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function str(x: unknown, re: RegExp): string | null {
  return typeof x === 'string' && re.test(x) ? x : null;
}

function nullableText(x: unknown, re: RegExp): string | null | undefined {
  if (x === null || x === undefined) {
    return null;
  }
  return typeof x === 'string' && re.test(x) ? x : undefined;
}

function intIn(x: unknown, lo: number, hi: number): number | null {
  return typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi ? x : null;
}

function isoDay(x: unknown): string | null {
  const s = str(x, ISO_DATE);
  return s !== null && !Number.isNaN(Date.parse(s)) ? s : null;
}

export function parseEventBody(body: unknown, id: string): Parsed<EventInput> {
  if (!EVENT_ID.test(id)) {
    return fail(-1, 'bad event id');
  }
  if (!isRecord(body)) {
    return fail(-1, 'not an object');
  }
  const name = str(body['name'], TEXT);
  if (name === null || name.length === 0) {
    return fail(-1, 'bad name');
  }
  const startDate = isoDay(body['startDate']);
  const endDate = isoDay(body['endDate']);
  if (startDate === null || endDate === null) {
    return fail(-1, 'bad dates');
  }
  const league = str(body['league'], SLUG);
  const cup = str(body['cup'], SLUG);
  if (league === null || cup === null) {
    return fail(-1, 'bad league or cup');
  }
  const rawVods = body['vods'];
  if (!Array.isArray(rawVods) || rawVods.some((v) => str(v, VOD) === null)) {
    return fail(-1, 'bad vods');
  }
  const notes = nullableText(body['notes'], TEXT);
  if (notes === undefined) {
    return fail(-1, 'bad notes');
  }
  return {
    ok: true,
    value: { id, name, startDate, endDate, league, cup, vods: [...(rawVods as string[])], notes },
  };
}

function parseSide(x: unknown): SideInput | string {
  if (!isRecord(x)) {
    return 'side is not an object';
  }
  const player = str(x['player'], PLAYER);
  if (player === null) {
    return 'bad player';
  }
  const team = x['team'];
  const forms = x['forms'];
  if (
    !Array.isArray(team) ||
    team.length < 1 ||
    team.length > 3 ||
    team.some((t) => str(t, SPECIES) === null)
  ) {
    return 'bad team';
  }
  if (
    !Array.isArray(forms) ||
    forms.length !== team.length ||
    forms.some((f) => typeof f !== 'string' || !FORM_SOURCES.includes(f))
  ) {
    return 'bad forms';
  }
  return { player, team: [...(team as string[])], forms: [...(forms as FormSource[])] };
}

function parseBattle(x: unknown): TournamentBattleInput | string {
  if (!isRecord(x)) {
    return 'not an object';
  }
  const id = str(x['id'], BATTLE_ID);
  if (id === null) {
    return 'bad id';
  }
  const atRaw = x['at'];
  if (typeof atRaw !== 'string' || Number.isNaN(Date.parse(atRaw))) {
    return 'bad at';
  }
  const day = intIn(x['day'], 1, 3);
  const game = intIn(x['game'], 1, 7);
  const bracketDepth = intIn(x['bracketDepth'], 1, 9);
  if (day === null || game === null || bracketDepth === null) {
    return 'bad day, game or bracketDepth';
  }
  const stage = x['stage'];
  const matchFormat = x['matchFormat'];
  const bracket = x['bracket'];
  if (typeof stage !== 'string' || !STAGES.includes(stage)) {
    return 'bad stage';
  }
  if (typeof matchFormat !== 'string' || !FORMATS.includes(matchFormat)) {
    return 'bad matchFormat';
  }
  if (typeof bracket !== 'string' || !BRACKETS.includes(bracket)) {
    return 'bad bracket';
  }
  const match = str(x['match'], TEXT);
  if (match === null || match.length === 0) {
    return 'bad match';
  }
  const group = nullableText(x['group'], TEXT);
  const roundLabel = nullableText(x['roundLabel'], TEXT);
  const notes = nullableText(x['notes'], TEXT);
  if (group === undefined || roundLabel === undefined || notes === undefined) {
    return 'bad group, roundLabel or notes';
  }
  const left = parseSide(x['left']);
  if (typeof left === 'string') {
    return `left: ${left}`;
  }
  const right = parseSide(x['right']);
  if (typeof right === 'string') {
    return `right: ${right}`;
  }
  const winnerRaw = x['winnerSide'] ?? null;
  const sourceRaw = x['resultSource'] ?? null;
  const winnerOk = winnerRaw === null || (typeof winnerRaw === 'string' && SIDES.includes(winnerRaw));
  const sourceOk =
    sourceRaw === null || (typeof sourceRaw === 'string' && RESULT_SOURCES.includes(sourceRaw));
  if (!winnerOk || !sourceOk) {
    return 'bad winnerSide or resultSource';
  }
  if ((winnerRaw === null) !== (sourceRaw === null)) {
    return 'winnerSide and resultSource must both be null or both be set';
  }
  const score = x['scoreAtStart'];
  if (
    !Array.isArray(score) ||
    score.length !== 2 ||
    score.some((n) => intIn(n, 0, 3) === null)
  ) {
    return 'bad scoreAtStart';
  }
  const evidence = x['evidence'];
  if (!Array.isArray(evidence) || evidence.some((f) => str(f, FILE_NAME) === null)) {
    return 'bad evidence';
  }
  return {
    id,
    at: new Date(atRaw).toISOString(),
    day,
    stage: stage as Stage,
    group,
    roundLabel,
    match,
    game,
    matchFormat: matchFormat as MatchFormat,
    bracket: bracket as Bracket,
    bracketDepth,
    left,
    right,
    winnerSide: winnerRaw as WinnerSide | null,
    resultSource: sourceRaw as ResultSource | null,
    scoreAtStart: [score[0] as number, score[1] as number],
    evidence: [...(evidence as string[])],
    notes,
  };
}

export function parseBattlesBody(body: unknown): Parsed<BattlesBody> {
  if (!isRecord(body)) {
    return fail(-1, 'not an object');
  }
  const extractor = str(body['extractor'], TEXT);
  if (extractor === null || extractor.length === 0 || extractor.length > 40) {
    return fail(-1, 'bad extractor');
  }
  const raw = body['battles'];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TOURNAMENT_BATCH) {
    return fail(-1, 'bad battles array');
  }
  const battles: TournamentBattleInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const parsed = parseBattle(raw[i]);
    if (typeof parsed === 'string') {
      return fail(i, parsed);
    }
    battles.push(parsed);
  }
  return { ok: true, value: { extractor, battles } };
}

function parseMoves(x: unknown): SharedMoves | null | undefined {
  if (x === null || x === undefined) {
    return null;
  }
  if (!isRecord(x)) {
    return undefined;
  }
  const fast = str(x['fast'], MOVE);
  const charged = x['charged'];
  if (fast === null) {
    return undefined;
  }
  if (
    !Array.isArray(charged) ||
    charged.length < 1 ||
    charged.length > 2 ||
    charged.some((c) => str(c, MOVE) === null)
  ) {
    return undefined;
  }
  return { fast, charged: [...new Set(charged as string[])] };
}

function parseRosterEntry(x: unknown): RosterEntryInput | string {
  if (!isRecord(x)) {
    return 'not an object';
  }
  const player = str(x['player'], PLAYER);
  const species = str(x['species'], SPECIES);
  const slot = intIn(x['slot'], 1, 6);
  if (player === null) {
    return 'bad player';
  }
  if (slot === null) {
    return 'bad slot';
  }
  if (species === null) {
    return 'bad species';
  }
  const moves = parseMoves(x['moves']);
  if (moves === undefined) {
    return 'bad moves';
  }
  return { player, slot, species, moves };
}

export function parseRosterBody(body: unknown): Parsed<RosterBody> {
  if (!isRecord(body)) {
    return fail(-1, 'not an object');
  }
  const raw = body['entries'];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TOURNAMENT_BATCH) {
    return fail(-1, 'bad entries array');
  }
  const entries: RosterEntryInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const parsed = parseRosterEntry(raw[i]);
    if (typeof parsed === 'string') {
      return fail(i, parsed);
    }
    entries.push(parsed);
  }
  return { ok: true, value: { entries } };
}
