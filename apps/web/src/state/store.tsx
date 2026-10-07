import { leagueParam } from '../leagueId.ts';
import { carryMegaLevel4 } from '../megaMarks.ts';
import {
  dropPins,
  localStamp,
  type BattleSet,
  type CountersResult,
  type FacingInput,
  type Faceoff,
  type ImportReport,
  type Layout,
  type League,
  type LoggedBattle,
  type ManualInput,
  type ManualResult,
  type MovePool,
  type PinMap,
  type PokemonType,
  type ProgressEvent,
  type Recommendation,
  type RecommendOptions,
  type RemovedMark,
  type ScanList,
  type ScheduleEntry,
  type Season,
  type SpeciesView,
  type Specimen,
  type SuggestResult,
  type TeamAnalysis,
  type TeamPick,
  type TeamRef,
  type Verdict,
} from '@pickthree/engine';
import type { Epoch, SourceKey, WindowKey } from '@pickthree/engine/meta';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { applyTheme } from '@pickthree/ui';
import type { LeagueInfo, SpeciesLite } from '../host/protocol.ts';
import { recordPick3 } from '../counter.ts';
import { communityCores } from '../community.ts';
import { canGoBack, markEntry, replaceEntry } from './history.ts';
import {
  communityRequest,
  loadCommunity,
  type CommunityPayload,
  type CommunityRequest,
} from '../communityMeta.ts';
import { arrivedFromShare } from '../share.ts';
import { recordError, setErrorReportsEnabled } from '../diag.ts';
import {
  forgetShared,
  newDeviceId,
  shareEligible,
  shareEnabled,
  syncShared,
  unstampAll,
} from '../metaShare.ts';
import { describeLayoutLine, emptyLayoutValue, ownSpeciesId } from '../format.ts';
import { ImportFailed, WorkerHost } from '../host/WorkerHost.ts';
import { DEFAULT_SETTINGS, storage, type Settings, type StoredCollection } from '../storage/db.ts';
import { parseLogAchievements, parseLogFile, serializeLog } from '../storage/logFile.ts';
import { facingInput, facingSettings, isCommunity, logBattles } from './facing.ts';
import { seasonsFor } from './seasonsFor.ts';
import { newId } from './yourMeta.ts';
import { NUDGED_KEEP, rotationNotice } from '../rotation.ts';
import { appNow } from '../clock.ts';
import { AchievementsProvider } from '../achievements/AchievementsProvider.tsx';

/**
 * A layout the resolver was unsure about, or one it had to work out from values while a header
 * row was present, goes to the diagnostics log (and the anonymous report channel): structure
 * only, so we learn which export formats exist without being told.
 */
function noteLayout(layout: Layout | undefined, outcome: 'ok' | 'failed'): void {
  if (!layout || layout.columnCount === 0) {
    return;
  }
  const guessed = layout.hasHeader && layout.columns.some((c) => c.via !== 'header');
  if (outcome === 'failed' || layout.confidence < 0.9 || guessed) {
    recordError('import-layout', `${outcome} ${describeLayoutLine(layout)}`);
  }
}

/** A battle's opponents as logged or edited: blanks dropped, deduped, at most three. */
function normalizeOpponents(opponents: string[]): string[] {
  return opponents.filter((id, i, arr) => id !== '' && arr.indexOf(id) === i).slice(0, 3);
}

export type NoticeTone = 'warn' | 'info';

/** One button an info notice can carry beside its message, such as Switch on a league notice. */
export interface NoticeAction {
  label: string;
  run: () => void;
}

export type Route =
  | { screen: 'welcome' }
  | { screen: 'import' }
  | { screen: 'report' }
  | { screen: 'teams' }
  | { screen: 'team'; id: string }
  /** `league` is a link's league, read and never written back (same rule as counters). */
  | { screen: 'collection'; league?: string }
  /** An old link to a Pokémon's own page: it now opens that copy on its species page. */
  | { screen: 'specimen'; id: string }
  /**
   * A species page: its id, from a link the league it belongs to, and the copy of yours to show
   * (absent shows the pinned one).
   */
  | { screen: 'species'; id: string; league?: string; copy?: string }
  | { screen: 'counters'; vs?: string; league?: string; from?: true }
  /** A Build lead link: the species for pick 0, and the league an inbound link names. */
  | { screen: 'build'; lead?: string; league?: string }
  | { screen: 'custom' }
  /** Add a Pokémon by hand, optionally prefilled with a species; `edit` names one to correct. */
  | { screen: 'add'; species?: string; edit?: string }
  | { screen: 'meta' }
  /** Top teams: window and source picks are written to the hash, the league never is. */
  | { screen: 'meta-teams'; w?: WindowKey; src?: SourceKey; league?: string }
  | { screen: 'meta-battles' }
  /** The achievements page; `row` is the earned achievement to scroll to. */
  | { screen: 'achievements'; row?: string }
  /** Pick Your Team, optionally prefilled with one to three species ids. */
  | { screen: 'meta-new'; team?: string[] }
  | { screen: 'meta-log'; edit?: { set: string; battle: string } }
  /** A team link: league id and the raw member list, parsed by the landing screen. */
  | { screen: 'shared'; league: string; members: string };

export interface DataInfo {
  pvpokeCommit: string;
  pvpokeDate: string;
  builtAt: string;
  species: Record<string, SpeciesLite>;
  leagues: League[];
  /** Released, non-mega species for adding by hand. */
  allSpecies: string[];
  seasons: Season[];
  schedule: ScheduleEntry[];
  /** Meta resets, for the community read's This meta window. */
  epochs: Epoch[];
  /** Move id to display name and type, for the `@word` search term. */
  moves: Record<string, { name: string; type: PokemonType }>;
}

export interface AppState {
  boot: 'loading' | 'ready' | 'error';
  bootError: string | null;
  data: DataInfo | null;
  /** Meta, ranks and analyzable species for the league in play. */
  leagueInfo: LeagueInfo | null;
  leagueLoading: boolean;
  collection: StoredCollection | null;
  settings: Settings;
  settingsLoaded: boolean;
  route: Route;
  sheetOpen: boolean;
  filtersOpen: boolean;
  importing: boolean;
  importError: string | null;
  recommendation: Recommendation | null;
  recommending: boolean;
  progress: ProgressEvent | null;
  recommendError: string | null;
  verdicts: Record<string, Verdict>;
  verdictsLoading: boolean;
  /** Set when the last verdict run failed; the screens stop retrying until the collection changes. */
  verdictsError: string | null;
  counters: CountersResult | null;
  countersLoading: boolean;
  /** Species the current counters were scored against, null for the whole meta. */
  countersVs: string | null;
  /** Simulation progress while an outsider is scored on device. */
  countersProgress: ProgressEvent | null;
  /** Set when the last counters run for countersVs failed; Counters shows it with Try again
   * instead of asking again on its own. Cleared when a run starts or is dropped. */
  countersError: string | null;
  /** Bumped whenever what counters are scored from changes under a run (an import, the battle
   * log, a new league or source): a run started under an older epoch lands nothing. */
  countersEpoch: number;
  /** One-line message for the floating toast, such as a failed save. */
  notice: string | null;
  /** How the notice reads: warn (amber, announced at once) or info (a neutral confirmation). */
  noticeTone: NoticeTone;
  /** The button an info notice carries, if any. */
  noticeAction: NoticeAction | null;
  /** A list of choices an info notice offers instead of one button (the live cups), else empty. */
  noticeChoices: NoticeAction[];
  /** True while Build holds a team that arrived by link, until a pick is changed by hand. */
  sharedTeam: boolean;
  scanList: ScanList | null;
  /** Hand-built team: the three picks, how to order them, and the last analysis. */
  picks: [TeamPick | null, TeamPick | null, TeamPick | null];
  analysis: TeamAnalysis | null;
  analyzing: boolean;
  analyzeError: string | null;
  /** Teammates offered for the pinned favorites, or null before the button is pressed. */
  suggestion: SuggestResult | null;
  suggesting: boolean;
  suggestError: string | null;
  /** Filters snapshot the current recommendation was computed with. */
  recommendedWith: string | null;
  /** Battle log sets for the league in play, oldest first. */
  sets: BattleSet[];
  setsLoaded: boolean;
  /** Bumps on every log change so cached results know they are stale. */
  logVersion: number;
  /** The community read for the current league and window: key league|since|until. */
  community: { key: string; payload: CommunityPayload | null } | null;
}

type Action =
  | { type: 'suggest-start' }
  | { type: 'suggest-done'; suggestion: SuggestResult }
  | { type: 'suggest-error'; message: string }
  | { type: 'suggest-clear' }
  | { type: 'boot-ready'; data: DataInfo }
  | { type: 'league-start' }
  | { type: 'league-done'; info: LeagueInfo }
  | { type: 'boot-error'; message: string }
  | { type: 'loaded'; collection: StoredCollection | null; settings: Settings }
  | { type: 'route'; route: Route }
  | { type: 'sheet'; open: boolean }
  | { type: 'filters'; open: boolean }
  | { type: 'import-start' }
  | { type: 'import-done'; collection: StoredCollection }
  | { type: 'import-error'; message: string }
  | { type: 'settings'; settings: Settings }
  | { type: 'rec-start'; key: string }
  | { type: 'rec-progress'; progress: ProgressEvent }
  | { type: 'rec-done'; recommendation: Recommendation; key: string }
  | { type: 'rec-error'; message: string }
  | { type: 'verdicts-start' }
  | { type: 'verdicts-done'; verdicts: Record<string, Verdict> }
  | { type: 'verdicts-error'; message: string }
  | { type: 'verdicts-partial'; verdicts: Record<string, Verdict> }
  | { type: 'counters-start'; vs: string | null }
  | { type: 'counters-progress'; progress: ProgressEvent }
  /** Rows against one opponent while their shield grids are still filling. */
  | { type: 'counters-partial'; counters: CountersResult }
  | { type: 'counters-done'; counters: CountersResult | null }
  | { type: 'counters-error'; message: string }
  | {
      type: 'notice';
      message: string | null;
      tone: NoticeTone;
      action?: NoticeAction | NoticeAction[];
    }
  | { type: 'scanlist'; scanList: ScanList }
  | { type: 'pick'; slot: number; pick: TeamPick | null }
  | { type: 'picks'; picks: AppState['picks']; shared: boolean }
  | { type: 'analyze-start' }
  | { type: 'analyze-done'; analysis: TeamAnalysis }
  | { type: 'analyze-error'; message: string }
  | { type: 'forget' }
  | { type: 'sets'; sets: BattleSet[] }
  | { type: 'community-done'; key: string; payload: CommunityPayload | null }
  | { type: 'community-clear' }
  /** A facing-weighted run came back for a league or source no longer in play: clear its flag. */
  | { type: 'drop'; what: 'rec' | 'counters' | 'analyze' | 'suggest' };

const initial: AppState = {
  boot: 'loading',
  bootError: null,
  data: null,
  leagueInfo: null,
  leagueLoading: false,
  collection: null,
  settings: DEFAULT_SETTINGS,
  settingsLoaded: false,
  route: { screen: 'welcome' },
  sheetOpen: false,
  filtersOpen: false,
  importing: false,
  importError: null,
  recommendation: null,
  recommending: false,
  progress: null,
  recommendError: null,
  verdicts: {},
  verdictsLoading: false,
  verdictsError: null,
  counters: null,
  countersLoading: false,
  countersVs: null,
  countersProgress: null,
  countersError: null,
  countersEpoch: 0,
  notice: null,
  noticeTone: 'warn',
  noticeAction: null,
  noticeChoices: [],
  sharedTeam: false,
  scanList: null,
  picks: [null, null, null],
  analysis: null,
  analyzing: false,
  analyzeError: null,
  suggestion: null,
  suggesting: false,
  suggestError: null,
  recommendedWith: null,
  sets: [],
  setsLoaded: false,
  logVersion: 0,
  community: null,
};

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'boot-ready':
      return { ...s, boot: 'ready', data: a.data };
    case 'league-start':
      // Everything derived from a league goes stale the moment the league changes.
      return {
        ...s,
        leagueLoading: true,
        leagueInfo: null,
        recommendation: null,
        recommendedWith: null,
        recommendError: null,
        verdicts: {},
        verdictsError: null,
        counters: null,
        countersError: null,
        scanList: null,
        analysis: null,
        suggestion: null,
        suggestError: null,
        sets: [],
        setsLoaded: false,
      };
    case 'league-done':
      return { ...s, leagueLoading: false, leagueInfo: a.info };
    case 'boot-error':
      return { ...s, boot: 'error', bootError: a.message };
    case 'loaded':
      return { ...s, collection: a.collection, settings: a.settings, settingsLoaded: true };
    case 'route':
      return { ...s, route: a.route, sheetOpen: false, filtersOpen: false };
    case 'sheet':
      return { ...s, sheetOpen: a.open };
    case 'filters':
      return { ...s, filtersOpen: a.open };
    case 'import-start':
      return { ...s, importing: true, importError: null };
    case 'import-done':
      return {
        ...s,
        importing: false,
        collection: a.collection,
        recommendation: null,
        verdicts: {},
        verdictsError: null,
        counters: null,
        countersError: null,
        countersEpoch: s.countersEpoch + 1,
        recommendedWith: null,
      };
    case 'import-error':
      return { ...s, importing: false, importError: a.message };
    case 'settings':
      // Counters and teammate suggestions carry the facing they were scored under but no key for
      // it, so a new league, source or community window clears them and the screen asks again.
      return facingScope(a.settings) === facingScope(s.settings)
        ? { ...s, settings: a.settings }
        : {
            ...s,
            settings: a.settings,
            counters: null,
            countersError: null,
            countersEpoch: s.countersEpoch + 1,
            suggestion: null,
            suggestError: null,
          };
    case 'rec-start':
      return {
        ...s,
        recommending: true,
        recommendError: null,
        progress: null,
        recommendedWith: a.key,
      };
    case 'rec-progress':
      return { ...s, progress: a.progress };
    case 'rec-done':
      // The final key: with a community source it carries the read's generatedAt, known only now.
      return {
        ...s,
        recommending: false,
        recommendation: a.recommendation,
        progress: null,
        recommendedWith: a.key,
      };
    case 'community-done':
      return { ...s, community: { key: a.key, payload: a.payload } };
    case 'community-clear':
      return s.community === null ? s : { ...s, community: null };
    case 'drop':
      // Nothing is shown and nothing is marked done, so the screen's effect runs again for
      // whatever is in play now.
      switch (a.what) {
        case 'rec':
          return { ...s, recommending: false, progress: null };
        case 'counters':
          // A half-filled grid goes too: shown later as done, its empty cells would never fill.
          return {
            ...s,
            countersLoading: false,
            countersProgress: null,
            counters: null,
            countersError: null,
          };
        case 'analyze':
          return { ...s, analyzing: false, progress: null };
        case 'suggest':
          return { ...s, suggesting: false };
      }
      return s;
    case 'rec-error':
      return { ...s, recommending: false, recommendError: a.message, progress: null };
    case 'counters-start':
      // Drop the previous result: with a different target it would render under the new title.
      return {
        ...s,
        countersLoading: true,
        countersVs: a.vs,
        counters: null,
        countersProgress: null,
        countersError: null,
      };
    case 'counters-progress':
      return { ...s, countersProgress: a.progress };
    case 'counters-partial':
      return { ...s, counters: a.counters };
    case 'counters-done':
      return { ...s, countersLoading: false, counters: a.counters, countersProgress: null };
    case 'counters-error':
      return {
        ...s,
        countersLoading: false,
        counters: null,
        countersProgress: null,
        countersError: a.message,
      };
    case 'notice':
      return {
        ...s,
        notice: a.message,
        noticeTone: a.tone,
        noticeAction: a.action && !Array.isArray(a.action) ? a.action : null,
        noticeChoices: Array.isArray(a.action) ? a.action : [],
      };
    case 'scanlist':
      return { ...s, scanList: a.scanList };
    case 'suggest-start':
      return { ...s, suggesting: true, suggestError: null };
    case 'suggest-done':
      return { ...s, suggesting: false, suggestion: a.suggestion };
    case 'suggest-error':
      return { ...s, suggesting: false, suggestError: a.message };
    case 'suggest-clear':
      return { ...s, suggestion: null, suggestError: null };
    case 'pick': {
      const picks = [...s.picks] as AppState['picks'];
      picks[a.slot] = a.pick;
      // A move change leaves the board the suggestions were for (suggestKey ignores moves), so
      // the answer stands; any other change clears both the list and its error.
      const league = s.settings.league ?? 'great';
      const sameBoard = suggestKey(s.picks, league) === suggestKey(picks, league);
      return {
        ...s,
        picks,
        analyzeError: null,
        sharedTeam: false,
        suggestion: sameBoard ? s.suggestion : null,
        suggestError: sameBoard ? s.suggestError : null,
      };
    }
    case 'picks':
      return { ...s, picks: a.picks, analyzeError: null, sharedTeam: a.shared };
    case 'analyze-start':
      return { ...s, analyzing: true, analyzeError: null, progress: null };
    case 'analyze-done':
      return { ...s, analyzing: false, analysis: a.analysis, progress: null };
    case 'analyze-error':
      return { ...s, analyzing: false, analyzeError: a.message, progress: null };
    case 'verdicts-start':
      return { ...s, verdictsLoading: true, verdictsError: null };
    case 'verdicts-done':
      return { ...s, verdictsLoading: false, verdicts: a.verdicts };
    case 'verdicts-partial':
      return { ...s, verdicts: { ...s.verdicts, ...a.verdicts } };
    case 'verdicts-error':
      return { ...s, verdictsLoading: false, verdictsError: a.message };
    case 'forget':
      return {
        ...initial,
        scanList: s.scanList,
        boot: s.boot,
        data: s.data,
        settingsLoaded: true,
        route: { screen: 'welcome' },
        logVersion: s.logVersion + 1,
        countersEpoch: s.countersEpoch + 1,
      };
    case 'sets':
      // Anything weighted by the log is stale now; Teams re-runs through filterKey.
      return {
        ...s,
        sets: a.sets,
        setsLoaded: true,
        logVersion: s.logVersion + 1,
        counters: null,
        countersError: null,
        countersEpoch: s.countersEpoch + 1,
      };
    default:
      return s;
  }
}

const SPECIES_ID = /^[a-z0-9_]+$/;
/** A specimen id: the importer's hex hash, or anything as plain from an older save. */
const SPECIMEN_ID = /^[A-Za-z0-9_-]{1,64}$/;
const WINDOW_KEYS: readonly string[] = ['meta', '30', '7'];
const SOURCE_KEYS: readonly string[] = ['all', 'prior', 'ladder', 'tournament'];

/**
 * The `team` query value: species ids joined with '+'. The raw query is split on '+', on a space
 * (what URLSearchParams makes of an unescaped '+') and on an encoded plus, so any spelling of the
 * link works. Ids that fail the id shape are dropped and at most three are kept.
 */
function teamParam(query: string): string[] {
  const raw = query
    .split('&')
    .map((pair) => pair.split('='))
    .find(([k]) => k === 'team');
  if (!raw || raw[1] === undefined) {
    return [];
  }
  let value: string;
  try {
    value = decodeURIComponent(raw[1]);
  } catch {
    return [];
  }
  return value
    .split(/[+\s]+/)
    .filter((id) => SPECIES_ID.test(id))
    .slice(0, 3);
}

/** What saveSpecimens may replace besides the Pokémon themselves. Absent keeps what is stored. */
interface CollectionPatch {
  removed?: RemovedMark[];
  pins?: Record<string, PinMap>;
  report?: ImportReport;
}

/** The league's pins as an engine option, or nothing when it has none. */
function pinsOption(collection: StoredCollection | null, league: string): { pins?: PinMap } {
  const pins = pinsOf(collection, league);
  return pins ? { pins } : {};
}

/** Two copies with the same species, form, IVs, level and CP: the values a specimen id is made of. */
function sameValues(a: Specimen, b: Specimen): boolean {
  return (
    a.speciesId === b.speciesId &&
    a.shadow === b.shadow &&
    a.cp === b.cp &&
    a.level.max === b.level.max &&
    a.ivs?.atk === b.ivs?.atk &&
    a.ivs?.def === b.ivs?.def &&
    a.ivs?.sta === b.ivs?.sta
  );
}

export function parseHash(hash: string): Route {
  const [path, query] = hash.replace(/^#\/?/, '').split('?');
  const parts = path!.split('/').filter(Boolean);
  const [a, b] = parts;
  if (a === 'import') {
    return { screen: 'import' };
  }
  if (a === 'report') {
    return { screen: 'report' };
  }
  if (a === 'teams') {
    return b ? { screen: 'team', id: decodeURIComponent(b) } : { screen: 'teams' };
  }
  if (a === 'collection') {
    if (b) {
      return { screen: 'specimen', id: decodeURIComponent(b) };
    }
    const league = leagueParam(new URLSearchParams(query ?? '').get('l'));
    return league ? { screen: 'collection', league } : { screen: 'collection' };
  }
  if (a === 'species') {
    const id = b ? decodeURIComponent(b) : '';
    if (!SPECIES_ID.test(id)) {
      return { screen: 'meta' };
    }
    const params = new URLSearchParams(query ?? '');
    const league = leagueParam(params.get('l'));
    const copyRaw = params.get('copy');
    const copy = copyRaw !== null && SPECIMEN_ID.test(copyRaw) ? { copy: copyRaw } : {};
    return league ? { screen: 'species', id, league, ...copy } : { screen: 'species', id, ...copy };
  }
  if (a === 'counters') {
    const params = new URLSearchParams(query ?? '');
    const vs = params.get('vs');
    // An inbound link may name the league (`?l=`); the app's own links never do.
    const league = leagueParam(params.get('l'));
    // The back mark: set by a jump into the page and kept by the Against picker's
    // replace-navigation. An inbound link never carries it.
    const from = params.get('from') === '1' ? ({ from: true } as const) : {};
    if (vs && league) {
      return { screen: 'counters', vs, league, ...from };
    }
    if (vs) {
      return { screen: 'counters', vs, ...from };
    }
    return league ? { screen: 'counters', league, ...from } : { screen: 'counters', ...from };
  }
  if (a === 'build') {
    if (b === 'team') {
      return { screen: 'custom' };
    }
    const params = new URLSearchParams(query ?? '');
    const leadRaw = params.get('lead');
    const lead = leadRaw !== null && /^[a-z0-9_]+$/.test(leadRaw) ? leadRaw : null;
    if (!lead) {
      return { screen: 'build' };
    }
    // A league from an inbound link; kept only alongside a lead, same as counters' `l`.
    const league = leagueParam(params.get('l'));
    return league ? { screen: 'build', lead, league } : { screen: 'build', lead };
  }
  if (a === 'add') {
    const params = new URLSearchParams(query ?? '');
    const edit = params.get('edit');
    if (edit !== null && SPECIMEN_ID.test(edit)) {
      return { screen: 'add', edit };
    }
    const species = params.get('species');
    return species !== null && SPECIES_ID.test(species)
      ? { screen: 'add', species }
      : { screen: 'add' };
  }
  if (a === 't') {
    const [, league, members] = parts;
    return league && members
      ? {
          screen: 'shared',
          league: decodeURIComponent(league),
          members: decodeURIComponent(members),
        }
      : { screen: 'build' };
  }
  if (a === 'meta') {
    if (b === 'new') {
      const team = teamParam(query ?? '');
      return team.length > 0 ? { screen: 'meta-new', team } : { screen: 'meta-new' };
    }
    if (b === 'battles') {
      return { screen: 'meta-battles' };
    }
    if (b === 'teams') {
      const params = new URLSearchParams(query ?? '');
      const w = params.get('w');
      const src = params.get('src');
      const league = leagueParam(params.get('l'));
      return {
        screen: 'meta-teams',
        ...(w !== null && WINDOW_KEYS.includes(w) ? { w: w as WindowKey } : {}),
        ...(src !== null && SOURCE_KEYS.includes(src) ? { src: src as SourceKey } : {}),
        ...(league ? { league } : {}),
      };
    }
    if (b === 'log') {
      const [, , setId, battleId] = parts;
      if (setId && battleId) {
        return {
          screen: 'meta-log',
          edit: { set: decodeURIComponent(setId), battle: decodeURIComponent(battleId) },
        };
      }
      return { screen: 'meta-log' };
    }
    return { screen: 'meta' };
  }
  return { screen: 'welcome' };
}

export function hashFor(r: Route): string {
  switch (r.screen) {
    case 'welcome':
      return '#/';
    case 'import':
      return '#/import';
    case 'report':
      return '#/report';
    case 'teams':
      return '#/teams';
    case 'team':
      return `#/teams/${encodeURIComponent(r.id)}`;
    case 'collection':
      return '#/collection';
    case 'specimen':
      return `#/collection/${encodeURIComponent(r.id)}`;
    case 'counters': {
      const params = new URLSearchParams();
      if (r.vs) {
        params.set('vs', r.vs);
      }
      // The league from an inbound link is never written back; only the back mark is.
      if (r.from) {
        params.set('from', '1');
      }
      const qs = params.toString();
      return qs ? `#/counters?${qs}` : '#/counters';
    }
    case 'build': {
      if (!r.lead) {
        return '#/build';
      }
      const params = new URLSearchParams();
      params.set('lead', r.lead);
      if (r.league) {
        params.set('l', r.league);
      }
      return `#/build?${params.toString()}`;
    }
    case 'custom':
      return '#/build/team';
    case 'add':
      if (r.edit) {
        return `#/add?edit=${encodeURIComponent(r.edit)}`;
      }
      return r.species ? `#/add?species=${encodeURIComponent(r.species)}` : '#/add';
    case 'species':
      // The league from a link is never written back.
      return r.copy
        ? `#/species/${encodeURIComponent(r.id)}?copy=${encodeURIComponent(r.copy)}`
        : `#/species/${encodeURIComponent(r.id)}`;
    case 'meta':
      return '#/meta';
    case 'meta-teams': {
      const params = new URLSearchParams();
      if (r.w) {
        params.set('w', r.w);
      }
      if (r.src) {
        params.set('src', r.src);
      }
      const qs = params.toString();
      return qs ? `#/meta/teams?${qs}` : '#/meta/teams';
    }
    case 'achievements':
      return '#/achievements';
    case 'meta-battles':
      return '#/meta/battles';
    case 'meta-new':
      // Species ids are [a-z0-9_]+, so the '+' separator needs no escaping.
      return r.team && r.team.length > 0 ? `#/meta/new?team=${r.team.join('+')}` : '#/meta/new';
    case 'meta-log':
      return r.edit
        ? `#/meta/log/${encodeURIComponent(r.edit.set)}/${encodeURIComponent(r.edit.battle)}`
        : '#/meta/log';
    case 'shared':
      return `#/t/${r.league}/${r.members}`;
    default:
      return '#/';
  }
}

/** Which board a suggestion was asked for: the league and the picks, order ignored. */
export function suggestKey(picks: AppState['picks'], league: string): string {
  const ids = picks
    .filter((p): p is TeamPick => p !== null)
    .map((p) => `${p.kind}:${p.id}`)
    .sort();
  return `${league}|${ids.join(',')}`;
}

export function optionsFrom(settings: Settings): Partial<RecommendOptions> {
  const f = settings.filters;
  return {
    allowXl: !f.noXl,
    allowShadow: !f.noShadow,
    allowEliteTm: !f.noEliteTm,
    budgetStardust: f.budget ? f.budgetCap : null,
    style: f.style,
    // Legacy per-copy ids keep reaching the engine until they convert, so nothing comes back.
    excludedSpecimenIds: settings.excludedSpecimenIds ?? [],
    excludedSpecies: settings.excludedSpecies ?? [],
  };
}

/**
 * The legacy per-copy exclusions converted to what those copies battle as: each id whose verdict
 * has a build becomes the species of that best build, once. An id whose specimen is gone is
 * dropped. An id with no build in this league (not eligible, banned, over the cap, not judged)
 * stays legacy: the engine keeps honoring it, and it converts in a league where it has a build.
 */
export function convertLegacyExcluded(
  settings: Settings,
  specimens: readonly Specimen[],
  verdicts: Record<string, Verdict>,
): Settings {
  const legacy = settings.excludedSpecimenIds ?? [];
  const species = [...(settings.excludedSpecies ?? [])];
  const have = new Set(specimens.map((sp) => sp.id));
  const kept: string[] = [];
  for (const id of legacy) {
    if (!have.has(id)) {
      continue;
    }
    const battles = verdicts[id]?.build?.speciesId;
    if (!battles) {
      kept.push(id);
    } else if (!species.includes(battles)) {
      species.push(battles);
    }
  }
  return { ...settings, excludedSpecimenIds: kept, excludedSpecies: species };
}

/** One league's pins, or undefined when it has none (every species on its default pick). */
export function pinsOf(collection: StoredCollection | null, league: string): PinMap | undefined {
  const map = collection?.pins?.[league];
  return map && Object.keys(map).length > 0 ? map : undefined;
}

export function filterKey(
  settings: Settings,
  logVersion = 0,
  community: AppState['community'] = null,
  pins?: PinMap,
): string {
  const choice = facingSettings(settings);
  return JSON.stringify({
    league: settings.league ?? 'great',
    logVersion,
    ...optionsFrom(settings),
    ...(pins ? { pins } : {}),
    source: choice.source,
    window: isCommunity(choice.source) ? choice.window : null,
    community: isCommunity(choice.source) ? (community?.key ?? null) : null,
    generatedAt: isCommunity(choice.source) ? (community?.payload?.generatedAt ?? null) : null,
  });
}

/**
 * What a facing-weighted result belongs to: the league, the source and, for a community source,
 * the window. A result that comes back after any of them changed is dropped, never shown.
 */
export function facingScope(settings: Settings): string {
  const choice = facingSettings(settings);
  return JSON.stringify([
    settings.league ?? 'great',
    choice.source,
    isCommunity(choice.source) ? choice.window : null,
  ]);
}

/** The league an action started in, and whether that league and facing are still in play. */
function scopeOf(ref: { current: AppState }): { league: string; current: () => boolean } {
  const settings = ref.current.settings;
  const scope = facingScope(settings);
  return {
    league: settings.league ?? 'great',
    current: () => facingScope(ref.current.settings) === scope,
  };
}

/** The community request these settings name at `now`; null when no community read applies. */
function requestFor(s: AppState, now: Date): CommunityRequest | null {
  const choice = facingSettings(s.settings);
  if (!isCommunity(choice.source)) {
    return null;
  }
  const league = s.data?.leagues.find((l) => l.id === (s.settings.league ?? 'great'));
  return league
    ? communityRequest(
        league,
        choice.window,
        seasonsFor(s.data, league.id),
        s.data?.epochs ?? [],
        now,
      )
    : null;
}

/**
 * The window the community team board is read for in `league`: the Source picker's window when a
 * community source is chosen, else This meta. Build's teammate suggestions and Log a Battle's
 * likely teammates both read it, so they share `communityCores`' cache entry.
 */
export function boardWindow(
  s: Pick<AppState, 'data' | 'settings'>,
  league: string,
): CommunityRequest | null {
  const info = s.data?.leagues.find((l) => l.id === league);
  if (!info) {
    return null;
  }
  const choice = facingSettings(s.settings);
  return communityRequest(
    info,
    isCommunity(choice.source) ? choice.window : 'meta',
    seasonsFor(s.data, league),
    s.data?.epochs ?? [],
  );
}

/** The Mega marks a hand-added Pokémon can carry. */
export interface ManualMegaMarks {
  megaForm: 'mega' | 'mega_x' | 'mega_y' | null;
  megaLevel4?: boolean;
}

interface Actions {
  /**
   * Go to a screen. `replace` swaps the current history entry for it instead of adding one, for a
   * screen that hands off and should not be gone back to (a team link's landing).
   */
  navigate(route: Route, opts?: { replace?: boolean }): void;
  /** Back to the screen before this one; the fallback when pick3 has nothing behind it. */
  back(fallback?: Route): void;
  openSheet(): void;
  closeSheet(): void;
  openFilters(): void;
  closeFilters(): void;
  importCsv(text: string, fileName: string | null): Promise<boolean>;
  runRecommend(): Promise<void>;
  loadVerdicts(): Promise<void>;
  /** Scores against the whole meta, or against one species when vs is given. */
  loadCounters(vs?: string | null): Promise<void>;
  loadScanList(): Promise<void>;
  setPick(slot: number, pick: TeamPick | null): void;
  /** Replace all three slots at once, marking them as arrived by link when shared is true. */
  setPicks(picks: AppState['picks'], shared: boolean): void;
  /**
   * Try all six orders for the three picks and put the cards in the strongest one. The
   * analysis it ran is kept, so Analyze right after is quick to compare against.
   */
  findOrder(): Promise<boolean>;
  analyze(): Promise<void>;
  /**
   * Fill the empty slots around the one or two Pokemon already on the board. Matrix only, so it
   * returns fast; Analyze does the real simulation on whatever it puts there.
   */
  suggestTeammates(): Promise<void>;
  /**
   * Legal moves for one team member, with the recommendation, in the league in play. The Elite
   * TM setting decides the recommendation unless `options` says otherwise (a species page shows
   * PvPoke's own set, elite moves and all).
   */
  movePool(
    speciesId: string,
    fastId: string | null,
    current: { fast: string | null; charged: string[] },
    options?: { allowEliteTm?: boolean },
  ): Promise<MovePool>;
  /** Type a Pokémon in. `marks` carries what the appraisal screen cannot: a Mega mark. */
  addManual(input: ManualInput, marks?: ManualMegaMarks): Promise<ManualResult>;
  /**
   * Correct one Pokémon with values typed in (a bad scan, a power-up). It keeps its id and its
   * place in the collection; the level comes from the CP and IVs as for one added by hand.
   */
  updateManual(
    id: string,
    input: ManualInput,
    marks?: ManualMegaMarks,
    /** Set when Edit evolved it: the species it was before. */
    extra?: { evolvedFrom?: string },
  ): Promise<ManualResult>;
  /**
   * One species page in a league: your copies that are the species or can become it, each judged
   * as it, and the one teams field. Computed on the device from the collection as it stands.
   */
  speciesView(speciesId: string, league: string): Promise<SpeciesView>;
  /** The in-battle card for one opponent against the set's team. Null when it could not run. */
  faceoff(team: TeamRef, opponent: string): Promise<Faceoff | null>;
  /** Take one Pokémon out. It leaves a mark, so a later import does not bring it back. */
  removeSpecimen(id: string): Promise<void>;
  /** Remove every Pokémon the last import did not contain (the Report's "Not in this scan"). */
  removeMissing(): Promise<void>;
  /**
   * Pin the copy that represents a battling species in the league in play. A Pokémon id is an
   * override, null is unpinned (none of yours is fielded), undefined goes back to the default pick.
   */
  setPin(speciesId: string, pin: string | null | undefined): Promise<void>;
  /** Mark one Pokémon as a Level 4 Mega (or not); verdicts and teams are judged again. */
  setMegaLevel4(id: string, on: boolean): Promise<void>;
  updateSettings(patch: Partial<Settings> | ((s: Settings) => Settings)): void;
  setLeague(id: string): void;
  /** Leave a Pokémon, as it battles, out of team recommendations, or let it back in. */
  toggleExcludedSpecies(speciesId: string): void;
  /** Take one legacy per-copy exclusion off before it converts. */
  includeLegacyExcluded(specimenId: string): void;
  /** Every excluded Pokémon, legacy copies included, back into team recommendations. */
  includeAllExcluded(): void;
  forget(): Promise<void>;
  /**
   * Open a set of five with this team in the league in play. Closes any open set first.
   * The log actions resolve false, after raising a notice, when the phone refused the write.
   */
  startSet(team: TeamRef): Promise<boolean>;
  logBattle(input: {
    opponents: string[];
    result: 'win' | 'loss' | null;
    tanked: boolean;
  }): Promise<boolean>;
  /** Edit a logged battle by set and battle id, found among every set (open or closed). */
  editBattle(
    setId: string,
    battleId: string,
    input: { opponents: string[]; result: 'win' | 'loss' | null; tanked: boolean },
  ): Promise<boolean>;
  endSet(): Promise<boolean>;
  /**
   * Show (or clear with null) the floating one-line notice. `warn` (the default) is for trouble,
   * such as a refused save; `info` is a neutral confirmation, such as a logged battle. An info
   * notice may carry one button, or a list of choices that stays up until one is tapped.
   */
  notify(message: string | null, tone?: NoticeTone, action?: NoticeAction | NoticeAction[]): void;
  /** Community meta sharing on or off. Off also asks the worker to drop what this phone sent. */
  setShareEnabled(on: boolean): Promise<void>;
  /** Battles before now move to earlier seasons for the league in play. Nothing is deleted. */
  startFresh(): void;
  /** The whole log (every league) as the export file text. */
  exportLog(): Promise<string>;
  /** Adds sets from an export file. Throws the file parser's sentence on a bad file. */
  importLog(text: string): Promise<{ added: number; skipped: number }>;
  /**
   * The community read for the league and window in play, once per key (league|since|until).
   * Null when the source is not a community one, the league has no community data, or the read
   * failed.
   */
  ensureCommunity(): Promise<CommunityPayload | null>;
}

const StateCtx = createContext<AppState | null>(null);
const ActionsCtx = createContext<Actions | null>(null);

export function AppProvider({ children, host }: { children: ReactNode; host?: WorkerHost }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const hostRef = useRef<WorkerHost | null>(host ?? null);
  const stateRef = useRef(state);
  stateRef.current = state;
  /** The latest known sets for the league in play, updated in lockstep with the 'sets' dispatch. */
  const setsRef = useRef<BattleSet[]>([]);
  /** Serializes the log-mutating actions so two in-flight calls never race the same DB read. */
  const logChain = useRef<Promise<unknown>>(Promise.resolve());

  const applySets = useCallback((sets: BattleSet[]) => {
    setsRef.current = sets;
    dispatch({ type: 'sets', sets });
  }, []);

  const serialized = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const p = logChain.current.then(fn, fn);
    logChain.current = p.catch(() => undefined);
    return p;
  }, []);

  useEffect(() => {
    if (!hostRef.current) {
      hostRef.current = new WorkerHost();
    }
    const h = hostRef.current;
    let cancelled = false;
    Promise.all([storage.loadCollection(), storage.loadSettings()]).then(
      ([collection, settings]) => {
        if (!cancelled) {
          dispatch({ type: 'loaded', collection, settings });
          const initialRoute = parseHash(window.location.hash);
          if (arrivedFromShare()) {
            // The share redirect cannot carry the screen in a fragment: Response.redirect drops
            // it, so the landing arrives as /?share=1 with no hash. The `share` param is what
            // routes a shared file to the import screen, which is what picks it up.
            dispatch({ type: 'route', route: { screen: 'import' } });
            window.location.hash = hashFor({ screen: 'import' });
          } else if (collection && initialRoute.screen === 'welcome') {
            dispatch({ type: 'route', route: { screen: 'teams' } });
            window.location.hash = hashFor({ screen: 'teams' });
          } else if (!collection && settings.startedWithout && initialRoute.screen === 'welcome') {
            // Chose "Start without a collection" on an earlier visit: Meta is home.
            dispatch({ type: 'route', route: { screen: 'meta' } });
            window.location.hash = hashFor({ screen: 'meta' });
          } else {
            dispatch({ type: 'route', route: initialRoute });
          }
        }
      },
    );
    h.ready()
      .then((r) => {
        if (!cancelled) {
          dispatch({
            type: 'boot-ready',
            data: {
              ...r.manifest,
              species: r.species,
              leagues: r.leagues,
              allSpecies: r.allSpecies,
              seasons: r.seasons,
              schedule: r.schedule ?? [],
              epochs: r.epochs,
              moves: r.moves,
            },
          });
        }
      })
      .catch((e: unknown) => {
        recordError('boot', e);
        if (!cancelled) {
          dispatch({ type: 'boot-error', message: e instanceof Error ? e.message : String(e) });
        }
      });
    markEntry();
    const onHash = (): void => {
      markEntry();
      dispatch({ type: 'route', route: parseHash(window.location.hash) });
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  useEffect(() => {
    setErrorReportsEnabled(state.settings.errorReports !== false);
  }, [state.settings.errorReports]);

  // Fetch the league bundle whenever the league changes (and once at boot). The host keeps the
  // league so ComputeHost-shaped calls stay league-correct.
  const leagueId = state.settings.league ?? 'great';
  useEffect(() => {
    if (state.boot !== 'ready' || !state.settingsLoaded) {
      return;
    }
    const h = hostRef.current as WorkerHost;
    const known = state.data?.leagues.some((l) => l.id === leagueId);
    const id = known ? leagueId : 'great';
    if (!known && state.data) {
      // A cup that PvPoke has since retired: fall back and remember it, so the switcher agrees.
      void storage.saveSettings({ ...stateRef.current.settings, league: 'great' });
      dispatch({ type: 'settings', settings: { ...stateRef.current.settings, league: 'great' } });
      return;
    }
    h.league = id;
    let cancelled = false;
    setsRef.current = [];
    dispatch({ type: 'league-start' });
    void storage.loadSets(id).then((sets) => {
      if (!cancelled) {
        applySets(sets);
        shareSync();
      }
    });
    h.leagueInfo(id)
      .then((info) => {
        if (!cancelled) {
          dispatch({ type: 'league-done', info });
        }
      })
      .catch((e: unknown) => {
        recordError('league', e);
        if (!cancelled) {
          dispatch({ type: 'boot-error', message: e instanceof Error ? e.message : String(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.boot, state.settingsLoaded, state.data, leagueId]);

  useEffect(() => {
    applyTheme(state.settings.theme);
  }, [state.settings.theme]);

  const navigate = useCallback((route: Route, opts?: { replace?: boolean }) => {
    const h = hashFor(route);
    if (opts?.replace) {
      // No hashchange follows a replaceState, so route here; the entry keeps its pick3 depth.
      replaceEntry(h);
      dispatch({ type: 'route', route });
    } else if (window.location.hash !== h) {
      window.location.hash = h;
    } else {
      dispatch({ type: 'route', route });
    }
  }, []);

  /** Back to the screen before this one; the fallback when pick3 has nothing behind it. */
  const back = useCallback(
    (fallback: Route = { screen: 'teams' }) => {
      if (canGoBack()) {
        window.history.back();
      } else {
        navigate(fallback);
      }
    },
    [navigate],
  );

  const updateSettings = useCallback((patch: Partial<Settings> | ((s: Settings) => Settings)) => {
    const next =
      typeof patch === 'function'
        ? patch(stateRef.current.settings)
        : { ...stateRef.current.settings, ...patch };
    // Ahead of the render, so a second write in the same commit builds on this one.
    stateRef.current = { ...stateRef.current, settings: next };
    dispatch({ type: 'settings', settings: next });
    void storage.saveSettings(next);
  }, []);

  const importCsv = useCallback(
    async (text: string, fileName: string | null) => {
      const h = hostRef.current as WorkerHost;
      dispatch({ type: 'import-start' });
      try {
        // With a collection (or removed marks) already stored, the worker merges the scan into
        // it: ids, edits, pins and removals survive a re-import.
        const cur = stateRef.current.collection;
        const prior =
          cur && (cur.specimens.length > 0 || (cur.removed?.length ?? 0) > 0)
            ? { specimens: cur.specimens, removed: cur.removed ?? [], now: localStamp(appNow()) }
            : undefined;
        const { specimens, report } = await h.importCsv(text, prior);
        noteLayout(report.layout, 'ok');
        const collection: StoredCollection = {
          key: 'current',
          specimens: carryMegaLevel4(cur?.specimens ?? [], specimens),
          report,
          importedAt: new Date().toISOString(),
          fileName,
          ...(cur?.removed ? { removed: cur.removed } : {}),
          ...(cur?.pins ? { pins: cur.pins } : {}),
        };
        await storage.saveCollection(collection);
        dispatch({ type: 'import-done', collection });
        navigate({ screen: 'report' });
        return true;
      } catch (e) {
        const message =
          e instanceof ImportFailed
            ? e.message
            : e instanceof Error
              ? `Could not read that file: ${e.message}`
              : 'Could not read that file.';
        recordError('import', e);
        if (e instanceof ImportFailed) {
          noteLayout(e.layout, 'failed');
        }
        dispatch({ type: 'import-error', message });
        return false;
      }
    },
    [navigate],
  );

  /**
   * The community read for the current league and window, once per key, with the request it was
   * made for (one clock reading, so the window the engine is told matches the data). Both null
   * when the source is not a community one.
   */
  const readCommunity = useCallback(async (): Promise<{
    request: CommunityRequest | null;
    payload: CommunityPayload | null;
  }> => {
    const s = stateRef.current;
    if (!isCommunity(facingSettings(s.settings).source)) {
      return { request: null, payload: null };
    }
    const now = new Date();
    const request = requestFor(s, now);
    if (!request) {
      // A league with no community data: drop the last league's read so a result keyed with no
      // community read is not stale against it forever.
      dispatch({ type: 'community-clear' });
      return { request: null, payload: null };
    }
    const payload = await loadCommunity(request);
    // A league or window switch while the read was out: it belongs to neither, so it is not kept.
    // Same clock reading, so only a changed league or window can make the keys differ.
    if (requestFor(stateRef.current, now)?.key === request.key) {
      dispatch({ type: 'community-done', key: request.key, payload });
    }
    return { request, payload };
  }, []);

  /** The community read for the current league and window, once per key; null when none applies. */
  const ensureCommunity = useCallback(
    async (): Promise<CommunityPayload | null> => (await readCommunity()).payload,
    [readCommunity],
  );

  /** The engine's facing input right now, reading the community first when the source needs it. */
  const facingNow = useCallback(async (): Promise<{
    facing: FacingInput;
    community: AppState['community'];
  }> => {
    const s = stateRef.current;
    const league = s.settings.league ?? 'great';
    const choice = facingSettings(s.settings);
    const { request, payload } = await readCommunity();
    const facing = facingInput({
      choice,
      battles:
        choice.source === 'log'
          ? logBattles(s.sets, seasonsFor(s.data, league), s.settings, league)
          : [],
      request,
      payload,
    });
    return { facing, community: request ? { key: request.key, payload } : null };
  }, [readCommunity]);

  const runRecommend = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    if (!s.collection || s.recommending || !s.leagueInfo) {
      return;
    }
    // The provisional key: rec-start sets `recommending`, so the Teams effect does not fire again
    // while the community read is in flight. rec-done replaces it with the final key.
    const scope = scopeOf(stateRef);
    const pins = pinsOf(s.collection, scope.league);
    dispatch({
      type: 'rec-start',
      key: filterKey(s.settings, s.logVersion, s.community, pins),
    });
    try {
      const { facing, community } = await facingNow();
      if (!scope.current()) {
        dispatch({ type: 'drop', what: 'rec' });
        return;
      }
      const key = filterKey(s.settings, s.logVersion, community, pins);
      const recommendation = await h.recommend(
        s.collection.specimens,
        { ...optionsFrom(s.settings), facing, ...(pins ? { pins } : {}) },
        (p) => dispatch({ type: 'rec-progress', progress: p }),
        scope.league,
      );
      if (!scope.current()) {
        dispatch({ type: 'drop', what: 'rec' });
        return;
      }
      dispatch({ type: 'rec-done', recommendation, key });
      if (recommendation.teams.length > 0) {
        void recordPick3();
      }
    } catch (e) {
      recordError('recommend', e);
      if (!scope.current()) {
        dispatch({ type: 'drop', what: 'rec' });
        return;
      }
      dispatch({ type: 'rec-error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [facingNow]);

  /** True while a verdict run is out, so two callers in one commit never start two. */
  const verdictsInFlight = useRef(false);
  /**
   * The verdicts the last run delivered. Screens ask whenever verdicts are empty, so an empty
   * answer would send them straight back for the same verdicts, forever. While state still holds
   * this exact object the answer stands; every reset puts a fresh object in its place.
   */
  const verdictsDelivered = useRef<Record<string, Verdict> | null>(null);
  const loadVerdicts = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    if (
      !s.collection ||
      s.verdictsLoading ||
      !s.leagueInfo ||
      verdictsInFlight.current ||
      s.verdicts === verdictsDelivered.current
    ) {
      return;
    }
    verdictsInFlight.current = true;
    let specimens = s.collection.specimens;
    const league = s.settings.league ?? 'great';
    dispatch({ type: 'verdicts-start' });
    try {
      // The collection can change while the worker judges it (Enter values, a removal). A run
      // over the old one is dropped, partials included, and the current one judged instead, so a
      // corrected Pokémon never shows the verdict its old values earned.
      const stale = (judged: Specimen[]): boolean =>
        stateRef.current.collection !== null && stateRef.current.collection.specimens !== judged;
      let verdicts: Record<string, Verdict>;
      for (;;) {
        const judging = specimens;
        verdicts = await h.verdicts(
          judging,
          optionsFrom(stateRef.current.settings),
          (p) => dispatch({ type: 'rec-progress', progress: p }),
          h.league,
          (slice) => {
            if (!stale(judging)) {
              dispatch({ type: 'verdicts-partial', verdicts: slice });
            }
          },
        );
        if (!stale(judging)) {
          break;
        }
        specimens = stateRef.current.collection!.specimens;
      }
      // Rows the engine could not judge are a bug report waiting to happen.
      const bad = Object.values(verdicts).filter((v) => v.line.startsWith('pick3 could not judge'));
      if (bad.length > 0) {
        recordError('verdict-row', new Error(`${bad.length} could not be judged: ${bad[0]!.line}`));
      }
      verdictsDelivered.current = verdicts;
      dispatch({ type: 'verdicts-done', verdicts });
      // Legacy per-copy exclusions convert here, when verdicts are in, in the same update as the
      // verdicts so no screen sees one without the other; never from verdicts of a league that is
      // no longer in play.
      const cur = stateRef.current.settings;
      if ((cur.excludedSpecimenIds ?? []).length > 0 && (cur.league ?? 'great') === league) {
        updateSettings((c) => convertLegacyExcluded(c, specimens, verdicts));
      }
    } catch (e) {
      recordError('verdicts', e);
      dispatch({ type: 'verdicts-error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      verdictsInFlight.current = false;
    }
  }, [updateSettings]);

  // Legacy per-copy exclusions wait for verdicts to convert. Teams never asks for verdicts, so
  // ask here once the league is loaded; with no collection there is nothing they could name. Once
  // per league bundle and collection: an id with no build here stays legacy after the run, and
  // must not send the provider straight back for the same verdicts.
  const legacyExcluded = (state.settings.excludedSpecimenIds ?? []).length > 0;
  const legacyAsked = useRef<{ info: unknown; collection: unknown } | null>(null);
  useEffect(() => {
    if (!legacyExcluded || !state.settingsLoaded) {
      return;
    }
    if (!state.collection) {
      updateSettings((cur) => ({ ...cur, excludedSpecimenIds: [] }));
      return;
    }
    const asked = legacyAsked.current;
    if (
      state.leagueInfo &&
      Object.keys(state.verdicts).length === 0 &&
      !state.verdictsLoading &&
      !state.verdictsError &&
      !(asked && asked.info === state.leagueInfo && asked.collection === state.collection)
    ) {
      legacyAsked.current = { info: state.leagueInfo, collection: state.collection };
      void loadVerdicts();
    }
  }, [
    legacyExcluded,
    state.settingsLoaded,
    state.collection,
    state.leagueInfo,
    state.verdicts,
    state.verdictsLoading,
    state.verdictsError,
    loadVerdicts,
    updateSettings,
  ]);

  const loadCounters = useCallback(
    async (vs: string | null = null) => {
      const h = hostRef.current as WorkerHost;
      const s = stateRef.current;
      if (s.countersLoading || !s.leagueInfo) {
        return;
      }
      const scope = scopeOf(stateRef);
      // Off Counters the opponent has not changed; on it, the route names the one in play.
      const vsNow = (): string | null => {
        const r = stateRef.current.route;
        return r.screen === 'counters' ? (r.vs ?? null) : vs;
      };
      // An import or a new battle log since the start: the owned marks and the weights moved.
      const epoch = s.countersEpoch;
      // Once dropped, nothing more from this run lands: a later load may be running by then.
      let dropped = false;
      const live = (): boolean => {
        if (dropped) {
          return false;
        }
        if (scope.current() && vsNow() === vs && stateRef.current.countersEpoch === epoch) {
          return true;
        }
        dropped = true;
        dispatch({ type: 'drop', what: 'counters' });
        return false;
      };
      dispatch({ type: 'counters-start', vs });
      try {
        const { facing } = await facingNow();
        if (!live()) {
          return;
        }
        // No collection just means nothing gets an owned mark.
        const counters = await h.counters(
          s.collection?.specimens ?? [],
          { facing, ...(vs ? { vs } : {}), ...pinsOption(s.collection, scope.league) },
          (p) => {
            if (live()) {
              dispatch({ type: 'counters-progress', progress: p });
            }
          },
          scope.league,
          (partial) => {
            if (live()) {
              dispatch({ type: 'counters-partial', counters: partial });
            }
          },
        );
        if (!live()) {
          return;
        }
        dispatch({ type: 'counters-done', counters });
      } catch (e) {
        recordError('counters', e);
        if (!live()) {
          return;
        }
        dispatch({ type: 'counters-error', message: 'Counters could not be computed.' });
      }
    },
    [facingNow],
  );

  const scanListPending = useRef(false);
  const loadScanList = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    if (stateRef.current.scanList || scanListPending.current || !stateRef.current.leagueInfo) {
      return;
    }
    scanListPending.current = true;
    try {
      const list = await h.scanList({});
      dispatch({ type: 'scanlist', scanList: list });
    } catch (e) {
      recordError('scanlist', e);
    } finally {
      scanListPending.current = false;
    }
  }, []);

  const setPicks = useCallback((picks: AppState['picks'], shared: boolean) => {
    dispatch({ type: 'picks', picks, shared });
  }, []);

  const setPick = useCallback((slot: number, pick: TeamPick | null) => {
    dispatch({ type: 'pick', slot, pick });
  }, []);
  const findOrder = useCallback(async (): Promise<boolean> => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    const picks = s.picks;
    if (s.analyzing || !picks[0] || !picks[1] || !picks[2] || !s.leagueInfo) {
      return false;
    }
    const scope = scopeOf(stateRef);
    dispatch({ type: 'analyze-start' });
    try {
      const { facing } = await facingNow();
      if (!scope.current()) {
        dispatch({ type: 'drop', what: 'analyze' });
        return false;
      }
      const base = optionsFrom(s.settings);
      const analysis = await h.analyze(
        [picks[0], picks[1], picks[2]],
        s.collection?.specimens ?? [],
        {
          order: 'best',
          facing,
          ...(base.allowXl !== undefined ? { allowXl: base.allowXl } : {}),
          ...(base.allowEliteTm !== undefined ? { allowEliteTm: base.allowEliteTm } : {}),
          ...pinsOption(s.collection, scope.league),
        },
        (p) => dispatch({ type: 'rec-progress', progress: p }),
        scope.league,
      );
      if (!scope.current()) {
        dispatch({ type: 'drop', what: 'analyze' });
        return false;
      }
      // Put the picks in the order the analysis chose: a specimen pick matches by specimen id,
      // a species pick by species (the three are always different species).
      const remaining: (TeamPick | null)[] = [picks[0], picks[1], picks[2]];
      const ordered = analysis.team.slots.map((slot) => {
        const b = slot.candidate.build;
        let i = remaining.findIndex(
          (p) =>
            p !== null && (p.kind === 'specimen' ? p.id === b.specimenId : p.id === b.speciesId),
        );
        if (i < 0) {
          i = remaining.findIndex((p) => p !== null);
        }
        const [p] = remaining.splice(i, 1);
        return p ?? null;
      }) as AppState['picks'];
      dispatch({ type: 'picks', picks: ordered, shared: s.sharedTeam });
      dispatch({ type: 'analyze-done', analysis });
      return true;
    } catch (e) {
      recordError('order', e);
      if (!scope.current()) {
        dispatch({ type: 'drop', what: 'analyze' });
        return false;
      }
      dispatch({ type: 'analyze-error', message: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }, [facingNow]);
  /**
   * Teammates for whatever is already on the board. Runs on its own from Build when the board has
   * one or two picks; matrix only in the worker, so it is quick enough to not need a button, and
   * it never writes a pick, only the offer Build shows.
   */
  const suggestTeammates = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    const picks = s.picks;
    const pinned = picks.filter(Boolean).length;
    // Right after a league switch the old league's bundle is still in leagueInfo until the
    // provider's league effect clears it; asking then would frame the new league's board against
    // the old league's community read.
    const leagueInfo = s.leagueInfo;
    if (
      s.suggesting ||
      s.analyzing ||
      pinned === 0 ||
      pinned === 3 ||
      leagueInfo?.id !== (s.settings.league ?? 'great')
    ) {
      return;
    }
    const scope = scopeOf(stateRef);
    const key = suggestKey(picks, s.settings.league ?? 'great');
    // True once the board has moved on from the one this call was asked about, or the facing
    // scope changed under it; either way whatever comes back next is for a question nobody is
    // asking any more.
    const stale = (): boolean => {
      const now = stateRef.current;
      return !scope.current() || suggestKey(now.picks, now.settings.league ?? 'great') !== key;
    };
    dispatch({ type: 'suggest-start' });
    try {
      const { facing } = await facingNow();
      const {
        allowXl,
        allowShadow,
        allowEliteTm,
        budgetStardust,
        excludedSpecimenIds,
        excludedSpecies,
      } = optionsFrom(s.settings);
      const community = await communityCores(
        s.settings,
        leagueInfo.id,
        boardWindow(s, leagueInfo.id),
      );
      if (stale()) {
        dispatch({ type: 'drop', what: 'suggest' });
        return;
      }
      const suggestion = await h.suggestTeammates(
        picks,
        s.collection?.specimens ?? [],
        {
          facing,
          ...(community ? { community } : {}),
          ...(allowXl !== undefined ? { allowXl } : {}),
          ...(allowShadow !== undefined ? { allowShadow } : {}),
          ...(allowEliteTm !== undefined ? { allowEliteTm } : {}),
          ...(budgetStardust !== undefined ? { budgetStardust } : {}),
          ...(excludedSpecimenIds !== undefined ? { excludedSpecimenIds } : {}),
          ...(excludedSpecies !== undefined ? { excludedSpecies } : {}),
          ...pinsOption(s.collection, scope.league),
        },
        scope.league,
      );
      if (stale()) {
        dispatch({ type: 'drop', what: 'suggest' });
        return;
      }
      dispatch({ type: 'suggest-done', suggestion });
    } catch (e) {
      recordError('suggest', e);
      if (!scope.current()) {
        dispatch({ type: 'drop', what: 'suggest' });
        return;
      }
      dispatch({ type: 'suggest-error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [facingNow]);

  const analyze = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    const picks = s.picks;
    if (s.analyzing || !picks[0] || !picks[1] || !picks[2] || !s.leagueInfo) {
      return;
    }
    const scope = scopeOf(stateRef);
    dispatch({ type: 'analyze-start' });
    try {
      const { facing } = await facingNow();
      if (!scope.current()) {
        dispatch({ type: 'drop', what: 'analyze' });
        return;
      }
      const base = optionsFrom(s.settings);
      const analysis = await h.analyze(
        [picks[0], picks[1], picks[2]],
        s.collection?.specimens ?? [],
        {
          // The cards' order is the order: what you see is what gets scored.
          order: 'given',
          facing,
          ...(base.allowXl !== undefined ? { allowXl: base.allowXl } : {}),
          ...(base.allowEliteTm !== undefined ? { allowEliteTm: base.allowEliteTm } : {}),
          ...pinsOption(s.collection, scope.league),
        },
        (p) => dispatch({ type: 'rec-progress', progress: p }),
        scope.league,
      );
      if (!scope.current()) {
        dispatch({ type: 'drop', what: 'analyze' });
        return;
      }
      dispatch({ type: 'analyze-done', analysis });
      // A team link's landing hands off to the analysis and leaves no entry behind: going back
      // to it would run the link again and land straight back here.
      navigate({ screen: 'custom' }, { replace: stateRef.current.route.screen === 'shared' });
    } catch (e) {
      recordError('analyze', e);
      if (!scope.current()) {
        dispatch({ type: 'drop', what: 'analyze' });
        return;
      }
      dispatch({ type: 'analyze-error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [navigate, facingNow]);

  const faceoff = useCallback(async (team: TeamRef, opponent: string): Promise<Faceoff | null> => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    const ids = new Set(team.specimenIds ?? []);
    const specimens = (s.collection?.specimens ?? []).filter((sp) => ids.has(sp.id));
    try {
      return await h.faceoff(team, specimens, opponent, optionsFrom(s.settings));
    } catch (e) {
      recordError('faceoff', e);
      return null;
    }
  }, []);

  const movePool = useCallback(
    (
      speciesId: string,
      fastId: string | null,
      current: { fast: string | null; charged: string[] },
      options?: { allowEliteTm?: boolean },
    ) => {
      const h = hostRef.current as WorkerHost;
      const base = optionsFrom(stateRef.current.settings);
      const allowEliteTm = options?.allowEliteTm ?? base.allowEliteTm;
      return h.movePool(speciesId, fastId, current, {
        ...(allowEliteTm !== undefined ? { allowEliteTm } : {}),
      });
    },
    [],
  );

  const EMPTY_REPORT: ImportReport = {
    scansRead: 0,
    recognized: 0,
    duplicatesMerged: 0,
    missingIvs: { count: 0, names: [] },
    unrecognized: [],
    rowProblems: [],
    layout: emptyLayoutValue(),
    newestScan: null,
  };
  const saveSpecimens = useCallback(
    async (specimens: Specimen[], fileName: string | null, patch: CollectionPatch = {}) => {
      const cur = stateRef.current.collection;
      const removed = patch.removed ?? cur?.removed;
      const pins = patch.pins ?? cur?.pins;
      const collection: StoredCollection = {
        key: 'current',
        specimens,
        report: {
          ...(patch.report ?? cur?.report ?? EMPTY_REPORT),
          recognized: specimens.length,
        },
        importedAt: cur?.importedAt ?? new Date().toISOString(),
        fileName: cur?.fileName ?? fileName,
        ...(removed && removed.length > 0 ? { removed } : {}),
        ...(pins && Object.keys(pins).length > 0 ? { pins } : {}),
      };
      await storage.saveCollection(collection);
      dispatch({ type: 'import-done', collection });
    },
    [],
  );
  const addManual = useCallback(
    async (input: ManualInput, marks?: ManualMegaMarks) => {
      const h = hostRef.current as WorkerHost;
      const made = await h.manual(input);
      const r: ManualResult = marks?.megaForm
        ? {
            ...made,
            specimen: {
              ...made.specimen,
              megaForm: marks.megaForm,
              ...(marks.megaLevel4 ? { megaLevel4: true } : {}),
            },
          }
        : made;
      const existing = stateRef.current.collection?.specimens ?? [];
      // The id comes from the values, so typing in a Pokémon you already have replaces it. A copy
      // corrected with Enter values keeps its old id over new values, though: one typed in with
      // its old values must not take its place, so it gets an id of its own.
      const holder = existing.find((x) => x.id === r.specimen.id);
      const added =
        holder && !sameValues(holder, r.specimen)
          ? { ...r, specimen: { ...r.specimen, id: `${r.specimen.id}-${newId().slice(0, 8)}` } }
          : r;
      const without = existing.filter((x) => x.id !== added.specimen.id);
      // Added back on purpose: a mark left by removing it must not make the next import skip it.
      const left = stateRef.current.collection?.removed ?? [];
      const removed =
        left.length > 0
          ? (await h.marks({ op: 'add', specimens: [], removed: left, specimen: added.specimen }))
              .removed
          : undefined;
      await saveSpecimens(
        [...without, added.specimen],
        'typed in by hand',
        removed ? { removed } : {},
      );
      return added;
    },
    [saveSpecimens],
  );
  const updateManual = useCallback(
    async (
      id: string,
      input: ManualInput,
      marks?: ManualMegaMarks,
      extra?: { evolvedFrom?: string },
    ) => {
      const h = hostRef.current as WorkerHost;
      const existing = stateRef.current.collection?.specimens ?? [];
      const old = existing.find((x) => x.id === id);
      if (!old) {
        throw new Error('That Pokémon is not in the current collection.');
      }
      const made = await h.manual(input);
      // The worker's specimen carries the new values; the copy keeps who it is. Moves and
      // Purified are what the form sent; a caller that sends neither keeps the copy's own (its
      // moves only while it is still the same species). The Mega mark is the form's.
      const sameSpecies = ownSpeciesId(old) === made.specimen.speciesId;
      const evolvedFrom = extra?.evolvedFrom ?? (sameSpecies ? old.evolvedFrom : undefined);
      const specimen: Specimen = {
        ...made.specimen,
        id: old.id,
        // Typing values in is not a scan: the copy keeps when it was scanned.
        scannedAt: old.scannedAt,
        purified:
          input.purified === undefined
            ? old.purified && !made.specimen.shadow
            : made.specimen.purified,
        currentMoves:
          input.currentMoves !== undefined
            ? made.specimen.currentMoves
            : sameSpecies
              ? old.currentMoves
              : { fast: null, charged: [] },
        megaForm: marks?.megaForm ?? null,
        // A newer scan may replace these values; an older one may not.
        editedAt: localStamp(appNow()),
      };
      if (evolvedFrom) {
        specimen.evolvedFrom = evolvedFrom;
      }
      // A scan stays a scan (so no Remove), one typed in stays typed in.
      delete specimen.source;
      delete specimen.megaLevel4;
      if (old.source) {
        specimen.source = old.source;
      }
      if (marks?.megaForm && marks.megaLevel4) {
        specimen.megaLevel4 = true;
      }
      await saveSpecimens(
        existing.map((x) => (x.id === id ? specimen : x)),
        null,
      );
      return { ...made, specimen };
    },
    [saveSpecimens],
  );
  const speciesView = useCallback((speciesId: string, league: string) => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    return h.speciesView(
      speciesId,
      s.collection?.specimens ?? [],
      { ...optionsFrom(s.settings), ...pinsOption(s.collection, league) },
      league,
    );
  }, []);
  const removeIds = useCallback(
    async (ids: string[]) => {
      const h = hostRef.current as WorkerHost;
      const cur = stateRef.current.collection;
      if (!cur || ids.length === 0) {
        return;
      }
      const r = await h.marks({
        op: 'remove',
        specimens: cur.specimens,
        removed: cur.removed ?? [],
        ids,
        now: localStamp(appNow()),
      });
      const gone = new Set(ids);
      const merge = cur.report.merge;
      await saveSpecimens(r.specimens, null, {
        removed: r.removed,
        pins: dropPins(cur.pins ?? {}, gone),
        ...(merge
          ? {
              report: {
                ...cur.report,
                merge: { ...merge, notInScan: merge.notInScan.filter((id) => !gone.has(id)) },
              },
            }
          : {}),
      });
    },
    [saveSpecimens],
  );
  const removeSpecimen = useCallback((id: string) => removeIds([id]), [removeIds]);
  const removeMissing = useCallback(
    () => removeIds(stateRef.current.collection?.report.merge?.notInScan ?? []),
    [removeIds],
  );
  const setPin = useCallback(
    async (speciesId: string, pin: string | null | undefined) => {
      const cur = stateRef.current.collection;
      if (!cur) {
        return;
      }
      const league = stateRef.current.settings.league ?? 'great';
      const map: PinMap = { ...(cur.pins?.[league] ?? {}) };
      if (pin === undefined) {
        delete map[speciesId];
      } else {
        map[speciesId] = pin;
      }
      const pins = { ...(cur.pins ?? {}), [league]: map };
      if (Object.keys(map).length === 0) {
        delete pins[league];
      }
      await saveSpecimens(cur.specimens, null, { pins });
    },
    [saveSpecimens],
  );

  const setMegaLevel4 = useCallback(
    async (id: string, on: boolean) => {
      const existing = stateRef.current.collection?.specimens ?? [];
      await saveSpecimens(
        existing.map((x) => (x.id === id ? { ...x, megaLevel4: on } : x)),
        null,
      );
    },
    [saveSpecimens],
  );

  const setLeague = useCallback(
    (id: string) => {
      updateSettings((cur) => ({ ...cur, league: id }));
    },
    [updateSettings],
  );

  const toggleExcludedSpecies = useCallback(
    (speciesId: string) => {
      updateSettings((s) => {
        const cur = s.excludedSpecies ?? [];
        return {
          ...s,
          excludedSpecies: cur.includes(speciesId)
            ? cur.filter((x) => x !== speciesId)
            : [...cur, speciesId],
        };
      });
    },
    [updateSettings],
  );

  const includeLegacyExcluded = useCallback(
    (specimenId: string) => {
      updateSettings((s) => ({
        ...s,
        excludedSpecimenIds: (s.excludedSpecimenIds ?? []).filter((x) => x !== specimenId),
      }));
    },
    [updateSettings],
  );

  const includeAllExcluded = useCallback(() => {
    updateSettings((s) => ({ ...s, excludedSpecimenIds: [], excludedSpecies: [] }));
  }, [updateSettings]);

  const notify = useCallback(
    (message: string | null, tone: NoticeTone = 'warn', action?: NoticeAction | NoticeAction[]) => {
      dispatch(
        action ? { type: 'notice', message, tone, action } : { type: 'notice', message, tone },
      );
    },
    [],
  );

  // GO Battle League cups, once per app open once boot data and settings are in: an ended cup
  // goes back to Great League (offering the live cups, if any); otherwise one nudge per new set
  // of live cups on this device, listing every one the player is not on.
  const rotationChecked = useRef(false);
  useEffect(() => {
    if (rotationChecked.current || state.boot !== 'ready' || !state.settingsLoaded || !state.data) {
      return;
    }
    rotationChecked.current = true;
    const n = rotationNotice({
      leagues: state.data.leagues,
      schedule: state.data.schedule,
      league: state.settings.league ?? 'great',
      nudged: state.settings.nudged ?? [],
      now: appNow(),
    });
    if (!n) {
      return;
    }
    updateSettings((cur) => {
      const had = cur.nudged ?? [];
      const fresh = n.keys.filter((k) => !had.includes(k));
      return {
        ...cur,
        ...(n.kind === 'ended' ? { league: 'great' } : {}),
        ...(fresh.length > 0 ? { nudged: [...had, ...fresh].slice(-NUDGED_KEEP) } : {}),
      };
    });
    if (n.kind === 'seen') {
      return;
    }
    if (n.options.length === 0) {
      notify(n.message, 'info');
    } else if (n.kind === 'nudge' && n.options.length === 1) {
      const only = n.options[0]!;
      notify(n.message, 'info', { label: 'Switch', run: () => setLeague(only.id) });
    } else {
      notify(
        n.message,
        'info',
        n.options.map((l) => ({ label: l.short, run: () => setLeague(l.id) })),
      );
    }
  }, [
    state.boot,
    state.settingsLoaded,
    state.data,
    state.settings.league,
    state.settings.nudged,
    updateSettings,
    notify,
    setLeague,
  ]);

  /**
   * Sends unsent battles to the community meta and stamps them, when sharing is on and this is
   * the live site. Quiet on any failure: the next change tries again. Serialized with the log
   * mutations so it never writes over a save in flight.
   */
  const shareSync = useCallback(() => {
    const s = stateRef.current;
    if (!shareEnabled(s.settings) || !shareEligible()) {
      return;
    }
    void serialized(async () => {
      const cur = stateRef.current;
      let device = cur.settings.share?.device;
      if (!device) {
        const fresh = newDeviceId();
        device = fresh;
        updateSettings((prev) => ({ ...prev, share: { ...prev.share, device: fresh } }));
      }
      const all = await storage.loadAllSets();
      const r = await syncShared(all, {
        device,
        client: `pick3 ${__PICK3_BUILD__}`,
        seasons: cur.data?.seasons ?? [],
      });
      if (!r) {
        return;
      }
      try {
        for (const set of r.sets) {
          await storage.saveSet(set);
        }
      } catch (e) {
        recordError('share-stamp', e);
        return;
      }
      const league = cur.settings.league ?? 'great';
      applySets(await storage.loadSets(league));
    });
  }, [serialized, updateSettings, applySets]);

  const setShareEnabled = useCallback(
    async (on: boolean) => {
      updateSettings((prev) => ({ ...prev, share: { ...prev.share, enabled: on } }));
      if (on) {
        shareSync();
        return;
      }
      const device = stateRef.current.settings.share?.device;
      await serialized(async () => {
        if (device) {
          await forgetShared(device);
        }
        // Clear the marks, so switching back on sends everything again.
        const all = unstampAll(await storage.loadAllSets());
        try {
          for (const set of all) {
            await storage.saveSet(set);
          }
        } catch (e) {
          recordError('share-unstamp', e);
        }
        const league = stateRef.current.settings.league ?? 'great';
        applySets(await storage.loadSets(league));
      });
    },
    [updateSettings, shareSync, serialized, applySets],
  );

  /** Writes the sets and reloads the league. False, with a toast, when the phone refused. */
  const persistSets = useCallback(
    async (sets: BattleSet[], what: 'that battle' | 'your team'): Promise<boolean> => {
      try {
        for (const set of sets) {
          await storage.saveSet(set);
        }
      } catch (e) {
        recordError('battle-log', e);
        // A full store says so by name; anything else is a browser refusing storage, which
        // in-app browsers (Reddit, Facebook) do routinely.
        const full = e instanceof Error && e.name === 'QuotaExceededError';
        notify(
          full
            ? `Could not save ${what}: storage on this phone is full.`
            : `Could not save ${what}: this browser blocks storage. Open pick3.gg in Safari or Chrome, or the installed app.`,
        );
        return false;
      }
      const league = stateRef.current.settings.league ?? 'great';
      applySets(await storage.loadSets(league));
      shareSync();
      return true;
    },
    [applySets, notify, shareSync],
  );

  const startSet = useCallback(
    (team: TeamRef) =>
      serialized(async () => {
        const league = stateRef.current.settings.league ?? 'great';
        const open = setsRef.current.filter((s) => !s.closed).map((s) => ({ ...s, closed: true }));
        const set: BattleSet = {
          id: newId(),
          league,
          startedAt: new Date().toISOString(),
          team,
          battles: [],
          closed: false,
        };
        return persistSets([...open, set], 'your team');
      }),
    [persistSets, serialized],
  );

  const logBattle = useCallback(
    (input: { opponents: string[]; result: 'win' | 'loss' | null; tanked: boolean }) =>
      serialized(async () => {
        const open = setsRef.current.find((s) => !s.closed);
        if (!open) {
          throw new Error('Start a set before logging a battle.');
        }
        const battle: LoggedBattle = {
          id: newId(),
          at: new Date().toISOString(),
          opponents: normalizeOpponents(input.opponents),
          result: input.tanked ? null : input.result,
          tanked: input.tanked,
        };
        const battles = [...open.battles, battle];
        // Battles accumulate under the current team; only picking another team closes a set.
        return persistSets([{ ...open, battles }], 'that battle');
      }),
    [persistSets, serialized],
  );

  const editBattle = useCallback(
    (
      setId: string,
      battleId: string,
      input: { opponents: string[]; result: 'win' | 'loss' | null; tanked: boolean },
    ) =>
      serialized(async () => {
        const set = setsRef.current.find((s) => s.id === setId);
        const old = set?.battles.find((b) => b.id === battleId);
        if (!set || !old) {
          return false;
        }
        // Resending needs the fields back to unsent; the worker updates the same row by id.
        const { sharedAt: _gone, ...kept } = old;
        void _gone;
        const battle: LoggedBattle = {
          ...kept,
          opponents: normalizeOpponents(input.opponents),
          result: input.tanked ? null : input.result,
          tanked: input.tanked,
        };
        const battles = set.battles.map((b) => (b.id === battleId ? battle : b));
        return persistSets([{ ...set, battles }], 'that battle');
      }),
    [persistSets, serialized],
  );

  const endSet = useCallback(
    () =>
      serialized(async () => {
        const open = setsRef.current.find((s) => !s.closed);
        return open ? persistSets([{ ...open, closed: true }], 'your team') : true;
      }),
    [persistSets, serialized],
  );

  const startFresh = useCallback(() => {
    void serialized(async () => {
      const league = stateRef.current.settings.league ?? 'great';
      updateSettings((cur) => ({
        ...cur,
        yourMeta: {
          ...cur.yourMeta,
          freshFrom: { ...cur.yourMeta?.freshFrom, [league]: new Date().toISOString() },
        },
      }));
      // The window moved, so weighted results are stale even though no set changed.
      applySets(setsRef.current);
    });
  }, [serialized, updateSettings, applySets]);

  const exportLog = useCallback(
    async () => serializeLog(await storage.loadAllSets(), await storage.loadAchievements()),
    [],
  );

  const importLog = useCallback(
    (text: string) =>
      serialized(async () => {
        const sets = parseLogFile(text);
        const r = await storage.importSets(sets);
        const achievements = parseLogAchievements(text);
        if (achievements) {
          await storage.mergeAchievements(achievements);
        }
        const league = stateRef.current.settings.league ?? 'great';
        applySets(await storage.loadSets(league));
        return r;
      }),
    [serialized, applySets],
  );

  const forget = useCallback(
    () =>
      serialized(async () => {
        await storage.forget();
        // The 'forget' reducer case resets sets to [] the same way 'league-start' does; keep the
        // ref in lockstep so a set started right after forgetting does not resurrect deleted data.
        setsRef.current = [];
        dispatch({ type: 'forget' });
        window.location.hash = '#/';
      }),
    [serialized],
  );

  const actions = useMemo<Actions>(
    () => ({
      navigate,
      back,
      openSheet: () => dispatch({ type: 'sheet', open: true }),
      closeSheet: () => dispatch({ type: 'sheet', open: false }),
      openFilters: () => dispatch({ type: 'filters', open: true }),
      closeFilters: () => dispatch({ type: 'filters', open: false }),
      importCsv,
      runRecommend,
      loadVerdicts,
      loadCounters,
      loadScanList,
      setPick,
      setPicks,
      findOrder,
      analyze,
      suggestTeammates,
      movePool,
      faceoff,
      addManual,
      updateManual,
      speciesView,
      removeSpecimen,
      removeMissing,
      setPin,
      setMegaLevel4,
      updateSettings,
      setLeague,
      toggleExcludedSpecies,
      includeLegacyExcluded,
      includeAllExcluded,
      forget,
      startSet,
      logBattle,
      editBattle,
      endSet,
      notify,
      setShareEnabled,
      startFresh,
      exportLog,
      importLog,
      ensureCommunity,
    }),
    [
      navigate,
      back,
      importCsv,
      runRecommend,
      loadVerdicts,
      loadCounters,
      loadScanList,
      setPick,
      setPicks,
      findOrder,
      analyze,
      suggestTeammates,
      movePool,
      faceoff,
      addManual,
      updateManual,
      speciesView,
      removeSpecimen,
      removeMissing,
      setPin,
      setMegaLevel4,
      updateSettings,
      setLeague,
      toggleExcludedSpecies,
      includeLegacyExcluded,
      includeAllExcluded,
      forget,
      startSet,
      logBattle,
      editBattle,
      endSet,
      notify,
      setShareEnabled,
      startFresh,
      exportLog,
      importLog,
      ensureCommunity,
    ],
  );

  return (
    <StateCtx.Provider value={state}>
      <ActionsCtx.Provider value={actions}>
        <AchievementsProvider>{children}</AchievementsProvider>
      </ActionsCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useAppState(): AppState {
  const s = useContext(StateCtx);
  if (!s) {
    throw new Error('useAppState outside AppProvider');
  }
  return s;
}

export function useActions(): Actions {
  const a = useContext(ActionsCtx);
  if (!a) {
    throw new Error('useActions outside AppProvider');
  }
  return a;
}
