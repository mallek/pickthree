import {
  type BattleSet,
  type CountersResult,
  type Faceoff,
  type ImportReport,
  type Layout,
  type League,
  type LoggedBattle,
  type ManualInput,
  type ManualResult,
  type MovePool,
  type PokemonType,
  type ProgressEvent,
  type Recommendation,
  type RecommendOptions,
  type ScanList,
  type Season,
  type Specimen,
  type TeamAnalysis,
  type TeamPick,
  type TeamRef,
  type Verdict,
} from '@pickthree/engine';
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
import type { LeagueInfo, SpeciesLite } from '../host/protocol.ts';
import { recordPick3 } from '../counter.ts';
import { arrivedFromShare } from '../share.ts';
import { recordError, setErrorReportsEnabled } from '../diag.ts';
import {
  forgetShared,
  newDeviceId,
  shareEligible,
  shareEnabled,
  syncShared,
  unstampAll,
  type Band,
} from '../metaShare.ts';
import { describeLayoutLine, emptyLayoutValue } from '../format.ts';
import { ImportFailed, WorkerHost } from '../host/WorkerHost.ts';
import { DEFAULT_SETTINGS, storage, type Settings, type StoredCollection } from '../storage/db.ts';
import { parseLogFile, serializeLog } from '../storage/logFile.ts';
import { newId, yourMetaFrom } from './yourMeta.ts';

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

export type Route =
  | { screen: 'welcome' }
  | { screen: 'report' }
  | { screen: 'teams' }
  | { screen: 'team'; id: string }
  | { screen: 'collection' }
  | { screen: 'specimen'; id: string }
  | { screen: 'counters'; vs?: string; league?: string }
  | { screen: 'build' }
  | { screen: 'custom' }
  | { screen: 'add' }
  | { screen: 'meta' }
  | { screen: 'meta-new' }
  | { screen: 'meta-log' }
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
  /** One-line message for the floating toast, such as a failed save. */
  notice: string | null;
  /** True while Build holds a team that arrived by link, until a pick is changed by hand. */
  sharedTeam: boolean;
  scanList: ScanList | null;
  /** Hand-built team: the three picks, how to order them, and the last analysis. */
  picks: [TeamPick | null, TeamPick | null, TeamPick | null];
  analysis: TeamAnalysis | null;
  analyzing: boolean;
  analyzeError: string | null;
  /** Filters snapshot the current recommendation was computed with. */
  recommendedWith: string | null;
  /** Battle log sets for the league in play, oldest first. */
  sets: BattleSet[];
  setsLoaded: boolean;
  /** Bumps on every log change so cached results know they are stale. */
  logVersion: number;
}

type Action =
  | { type: 'boot-ready'; data: DataInfo }
  | { type: 'league-start' }
  | { type: 'league-done'; info: LeagueInfo }
  | { type: 'boot-error'; message: string }
  | { type: 'loaded'; collection: StoredCollection | null; settings: Settings }
  | { type: 'route'; route: Route }
  | { type: 'sheet'; open: boolean }
  | { type: 'import-start' }
  | { type: 'import-done'; collection: StoredCollection }
  | { type: 'import-error'; message: string }
  | { type: 'settings'; settings: Settings }
  | { type: 'rec-start'; key: string }
  | { type: 'rec-progress'; progress: ProgressEvent }
  | { type: 'rec-done'; recommendation: Recommendation }
  | { type: 'rec-error'; message: string }
  | { type: 'verdicts-start' }
  | { type: 'verdicts-done'; verdicts: Record<string, Verdict> }
  | { type: 'verdicts-error'; message: string }
  | { type: 'verdicts-partial'; verdicts: Record<string, Verdict> }
  | { type: 'counters-start'; vs: string | null }
  | { type: 'counters-progress'; progress: ProgressEvent }
  | { type: 'counters-done'; counters: CountersResult | null }
  | { type: 'notice'; message: string | null }
  | { type: 'scanlist'; scanList: ScanList }
  | { type: 'pick'; slot: number; pick: TeamPick | null }
  | { type: 'picks'; picks: AppState['picks']; shared: boolean }
  | { type: 'analyze-start' }
  | { type: 'analyze-done'; analysis: TeamAnalysis }
  | { type: 'analyze-error'; message: string }
  | { type: 'forget' }
  | { type: 'sets'; sets: BattleSet[] };

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
  notice: null,
  sharedTeam: false,
  scanList: null,
  picks: [null, null, null],
  analysis: null,
  analyzing: false,
  analyzeError: null,
  recommendedWith: null,
  sets: [],
  setsLoaded: false,
  logVersion: 0,
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
        scanList: null,
        analysis: null,
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
      return { ...s, route: a.route, sheetOpen: false };
    case 'sheet':
      return { ...s, sheetOpen: a.open };
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
        recommendedWith: null,
      };
    case 'import-error':
      return { ...s, importing: false, importError: a.message };
    case 'settings':
      return { ...s, settings: a.settings };
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
      return { ...s, recommending: false, recommendation: a.recommendation, progress: null };
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
      };
    case 'counters-progress':
      return { ...s, countersProgress: a.progress };
    case 'counters-done':
      return { ...s, countersLoading: false, counters: a.counters, countersProgress: null };
    case 'notice':
      return { ...s, notice: a.message };
    case 'scanlist':
      return { ...s, scanList: a.scanList };
    case 'pick': {
      const picks = [...s.picks] as AppState['picks'];
      picks[a.slot] = a.pick;
      return { ...s, picks, analyzeError: null, sharedTeam: false };
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
      };
    case 'sets':
      // Anything weighted by the log is stale now; Teams re-runs through filterKey.
      return { ...s, sets: a.sets, setsLoaded: true, logVersion: s.logVersion + 1, counters: null };
    default:
      return s;
  }
}

export function parseHash(hash: string): Route {
  const [path, query] = hash.replace(/^#\/?/, '').split('?');
  const parts = path!.split('/').filter(Boolean);
  const [a, b] = parts;
  if (a === 'report') {
    return { screen: 'report' };
  }
  if (a === 'teams') {
    return b ? { screen: 'team', id: decodeURIComponent(b) } : { screen: 'teams' };
  }
  if (a === 'collection') {
    return b ? { screen: 'specimen', id: decodeURIComponent(b) } : { screen: 'collection' };
  }
  if (a === 'counters') {
    const params = new URLSearchParams(query ?? '');
    const vs = params.get('vs');
    // A link from meta.pick3.gg names the league; the app's own links never do.
    const l = params.get('l');
    const league = l !== null && /^[a-z0-9_]+$/.test(l) ? l : null;
    if (vs && league) {
      return { screen: 'counters', vs, league };
    }
    if (vs) {
      return { screen: 'counters', vs };
    }
    return league ? { screen: 'counters', league } : { screen: 'counters' };
  }
  if (a === 'build') {
    return b === 'team' ? { screen: 'custom' } : { screen: 'build' };
  }
  if (a === 'add') {
    return { screen: 'add' };
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
      return { screen: 'meta-new' };
    }
    if (b === 'log') {
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
    case 'counters':
      return r.vs ? `#/counters?vs=${encodeURIComponent(r.vs)}` : '#/counters';
    case 'build':
      return '#/build';
    case 'custom':
      return '#/build/team';
    case 'add':
      return '#/add';
    case 'meta':
      return '#/meta';
    case 'meta-new':
      return '#/meta/new';
    case 'meta-log':
      return '#/meta/log';
    case 'shared':
      return `#/t/${r.league}/${r.members}`;
    default:
      return '#/';
  }
}

export function optionsFrom(settings: Settings): Partial<RecommendOptions> {
  const f = settings.filters;
  return {
    allowXl: !f.noXl,
    allowShadow: !f.noShadow,
    allowEliteTm: !f.noEliteTm,
    budgetStardust: f.budget ? f.budgetCap : null,
    style: f.style,
    excludedSpecimenIds: settings.excludedSpecimenIds,
  };
}

export function filterKey(settings: Settings, logVersion = 0): string {
  return JSON.stringify({
    league: settings.league ?? 'great',
    logVersion,
    ...optionsFrom(settings),
  });
}

interface Actions {
  navigate(route: Route): void;
  back(): void;
  openSheet(): void;
  closeSheet(): void;
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
  /** Legal moves for one team member, with the recommendation, in the league in play. */
  movePool(
    speciesId: string,
    fastId: string | null,
    current: { fast: string | null; charged: string[] },
  ): Promise<MovePool>;
  addManual(input: ManualInput): Promise<ManualResult>;
  /** The in-battle card for one opponent against the set's team. Null when it could not run. */
  faceoff(team: TeamRef, opponent: string): Promise<Faceoff | null>;
  removeSpecimen(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings> | ((s: Settings) => Settings)): void;
  setLeague(id: string): void;
  toggleExcluded(specimenId: string): void;
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
  endSet(): Promise<boolean>;
  /** Show (or clear with null) the floating one-line notice. */
  notify(message: string | null): void;
  /** Community meta sharing on or off. Off also asks the worker to drop what this phone sent. */
  setShareEnabled(on: boolean): Promise<void>;
  /** The rank band stamped on records sent from now on. */
  setShareBand(band: Band | null): void;
  /** Battles before now move to earlier seasons for the league in play. Nothing is deleted. */
  startFresh(): void;
  /** The whole log (every league) as the export file text. */
  exportLog(): Promise<string>;
  /** Adds sets from an export file. Throws the file parser's sentence on a bad file. */
  importLog(text: string): Promise<{ added: number; skipped: number }>;
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
          if (collection && initialRoute.screen === 'welcome' && !arrivedFromShare()) {
            dispatch({ type: 'route', route: { screen: 'teams' } });
            window.location.hash = hashFor({ screen: 'teams' });
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
    const onHash = (): void => dispatch({ type: 'route', route: parseHash(window.location.hash) });
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
    const t = state.settings.theme;
    const root = document.documentElement;
    if (t === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', t);
    }
  }, [state.settings.theme]);

  const navigate = useCallback((route: Route) => {
    const h = hashFor(route);
    if (window.location.hash !== h) {
      window.location.hash = h;
    } else {
      dispatch({ type: 'route', route });
    }
  }, []);

  const back = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate({ screen: 'teams' });
    }
  }, [navigate]);

  const updateSettings = useCallback((patch: Partial<Settings> | ((s: Settings) => Settings)) => {
    const next =
      typeof patch === 'function'
        ? patch(stateRef.current.settings)
        : { ...stateRef.current.settings, ...patch };
    dispatch({ type: 'settings', settings: next });
    void storage.saveSettings(next);
  }, []);

  const importCsv = useCallback(
    async (text: string, fileName: string | null) => {
      const h = hostRef.current as WorkerHost;
      dispatch({ type: 'import-start' });
      try {
        const { specimens, report } = await h.importCsv(text);
        noteLayout(report.layout, 'ok');
        const collection: StoredCollection = {
          key: 'current',
          specimens,
          report,
          importedAt: new Date().toISOString(),
          fileName,
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

  const yourMeta = useCallback(() => {
    const s = stateRef.current;
    return yourMetaFrom(s.sets, s.data?.seasons ?? [], s.settings, s.settings.league ?? 'great');
  }, []);

  const runRecommend = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    if (!s.collection || s.recommending || !s.leagueInfo) {
      return;
    }
    const key = filterKey(s.settings, s.logVersion);
    dispatch({ type: 'rec-start', key });
    try {
      const recommendation = await h.recommend(
        s.collection.specimens,
        { ...optionsFrom(s.settings), yourMeta: yourMeta() },
        (p) => dispatch({ type: 'rec-progress', progress: p }),
      );
      dispatch({ type: 'rec-done', recommendation });
      if (recommendation.teams.length > 0) {
        void recordPick3();
      }
    } catch (e) {
      recordError('recommend', e);
      dispatch({ type: 'rec-error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const loadVerdicts = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    if (!s.collection || s.verdictsLoading || !s.leagueInfo) {
      return;
    }
    dispatch({ type: 'verdicts-start' });
    try {
      const verdicts = await h.verdicts(
        s.collection.specimens,
        optionsFrom(s.settings),
        (p) => dispatch({ type: 'rec-progress', progress: p }),
        h.league,
        (slice) => dispatch({ type: 'verdicts-partial', verdicts: slice }),
      );
      // Rows the engine could not judge are a bug report waiting to happen.
      const bad = Object.values(verdicts).filter((v) => v.line.startsWith('pick3 could not judge'));
      if (bad.length > 0) {
        recordError('verdict-row', new Error(`${bad.length} could not be judged: ${bad[0]!.line}`));
      }
      dispatch({ type: 'verdicts-done', verdicts });
    } catch (e) {
      recordError('verdicts', e);
      dispatch({ type: 'verdicts-error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const loadCounters = useCallback(async (vs: string | null = null) => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    if (s.countersLoading || !s.leagueInfo) {
      return;
    }
    dispatch({ type: 'counters-start', vs });
    try {
      // No collection just means nothing gets an owned mark.
      const counters = await h.counters(
        s.collection?.specimens ?? [],
        { yourMeta: yourMeta(), ...(vs ? { vs } : {}) },
        (p) => dispatch({ type: 'counters-progress', progress: p }),
      );
      dispatch({ type: 'counters-done', counters });
    } catch (e) {
      recordError('counters', e);
      dispatch({
        type: 'counters-done',
        counters: {
          entries: [],
          facing: 'Counters could not be computed',
          blended: false,
          battles: 0,
        },
      });
    }
  }, []);

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
    dispatch({ type: 'analyze-start' });
    try {
      const base = optionsFrom(s.settings);
      const analysis = await h.analyze(
        [picks[0], picks[1], picks[2]],
        s.collection?.specimens ?? [],
        {
          order: 'best',
          yourMeta: yourMeta(),
          ...(base.allowXl !== undefined ? { allowXl: base.allowXl } : {}),
          ...(base.allowEliteTm !== undefined ? { allowEliteTm: base.allowEliteTm } : {}),
        },
        (p) => dispatch({ type: 'rec-progress', progress: p }),
      );
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
      dispatch({ type: 'analyze-error', message: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }, []);
  const analyze = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    const picks = s.picks;
    if (s.analyzing || !picks[0] || !picks[1] || !picks[2] || !s.leagueInfo) {
      return;
    }
    dispatch({ type: 'analyze-start' });
    try {
      const base = optionsFrom(s.settings);
      const analysis = await h.analyze(
        [picks[0], picks[1], picks[2]],
        s.collection?.specimens ?? [],
        {
          // The cards' order is the order: what you see is what gets scored.
          order: 'given',
          yourMeta: yourMeta(),
          ...(base.allowXl !== undefined ? { allowXl: base.allowXl } : {}),
          ...(base.allowEliteTm !== undefined ? { allowEliteTm: base.allowEliteTm } : {}),
        },
        (p) => dispatch({ type: 'rec-progress', progress: p }),
      );
      dispatch({ type: 'analyze-done', analysis });
      navigate({ screen: 'custom' });
    } catch (e) {
      recordError('analyze', e);
      dispatch({ type: 'analyze-error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [navigate]);

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
    ) => {
      const h = hostRef.current as WorkerHost;
      const base = optionsFrom(stateRef.current.settings);
      return h.movePool(speciesId, fastId, current, {
        ...(base.allowEliteTm !== undefined ? { allowEliteTm: base.allowEliteTm } : {}),
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
  const saveSpecimens = useCallback(async (specimens: Specimen[], fileName: string | null) => {
    const cur = stateRef.current.collection;
    const collection: StoredCollection = {
      key: 'current',
      specimens,
      report: { ...(cur?.report ?? EMPTY_REPORT), recognized: specimens.length },
      importedAt: cur?.importedAt ?? new Date().toISOString(),
      fileName: cur?.fileName ?? fileName,
    };
    await storage.saveCollection(collection);
    dispatch({ type: 'import-done', collection });
  }, []);
  const addManual = useCallback(
    async (input: ManualInput) => {
      const h = hostRef.current as WorkerHost;
      const r = await h.manual(input);
      const existing = stateRef.current.collection?.specimens ?? [];
      const without = existing.filter((x) => x.id !== r.specimen.id);
      await saveSpecimens([...without, r.specimen], 'typed in by hand');
      return r;
    },
    [saveSpecimens],
  );
  const removeSpecimen = useCallback(
    async (id: string) => {
      const existing = stateRef.current.collection?.specimens ?? [];
      await saveSpecimens(
        existing.filter((x) => x.id !== id),
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

  const toggleExcluded = useCallback(
    (specimenId: string) => {
      updateSettings((s) => {
        const has = s.excludedSpecimenIds.includes(specimenId);
        return {
          ...s,
          excludedSpecimenIds: has
            ? s.excludedSpecimenIds.filter((x) => x !== specimenId)
            : [...s.excludedSpecimenIds, specimenId],
        };
      });
    },
    [updateSettings],
  );

  const notify = useCallback((message: string | null) => {
    dispatch({ type: 'notice', message });
  }, []);

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
        band: cur.settings.share?.band ?? null,
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

  const setShareBand = useCallback(
    (band: Band | null) => {
      updateSettings((prev) => ({ ...prev, share: { ...prev.share, band } }));
    },
    [updateSettings],
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
          opponents: input.opponents
            .filter((id, i, arr) => id !== '' && arr.indexOf(id) === i)
            .slice(0, 3),
          result: input.tanked ? null : input.result,
          tanked: input.tanked,
        };
        const battles = [...open.battles, battle];
        // Battles accumulate under the current team; only picking another team closes a set.
        return persistSets([{ ...open, battles }], 'that battle');
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

  const exportLog = useCallback(async () => serializeLog(await storage.loadAllSets()), []);

  const importLog = useCallback(
    (text: string) =>
      serialized(async () => {
        const sets = parseLogFile(text);
        const r = await storage.importSets(sets);
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
      importCsv,
      runRecommend,
      loadVerdicts,
      loadCounters,
      loadScanList,
      setPick,
      setPicks,
      findOrder,
      analyze,
      movePool,
      faceoff,
      addManual,
      removeSpecimen,
      updateSettings,
      setLeague,
      toggleExcluded,
      forget,
      startSet,
      logBattle,
      endSet,
      notify,
      setShareEnabled,
      setShareBand,
      startFresh,
      exportLog,
      importLog,
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
      movePool,
      faceoff,
      addManual,
      removeSpecimen,
      updateSettings,
      setLeague,
      toggleExcluded,
      forget,
      startSet,
      logBattle,
      endSet,
      notify,
      setShareEnabled,
      setShareBand,
      startFresh,
      exportLog,
      importLog,
    ],
  );

  return (
    <StateCtx.Provider value={state}>
      <ActionsCtx.Provider value={actions}>{children}</ActionsCtx.Provider>
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
