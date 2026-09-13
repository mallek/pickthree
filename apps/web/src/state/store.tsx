import type {
  CounterEntry,
  ImportReport,
  League,
  ManualInput,
  ManualResult,
  ProgressEvent,
  Recommendation,
  RecommendOptions,
  ScanList,
  Specimen,
  TeamAnalysis,
  TeamPick,
  Verdict,
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
import { ImportFailed, WorkerHost } from '../host/WorkerHost.ts';
import { DEFAULT_SETTINGS, storage, type Settings, type StoredCollection } from '../storage/db.ts';

export type Route =
  | { screen: 'welcome' }
  | { screen: 'report' }
  | { screen: 'teams' }
  | { screen: 'team'; id: string }
  | { screen: 'collection' }
  | { screen: 'specimen'; id: string }
  | { screen: 'counters' }
  | { screen: 'build' }
  | { screen: 'custom' }
  | { screen: 'add' };

export interface DataInfo {
  pvpokeCommit: string;
  pvpokeDate: string;
  builtAt: string;
  species: Record<string, SpeciesLite>;
  leagues: League[];
  /** Released, non-mega species for adding by hand. */
  allSpecies: string[];
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
  counters: CounterEntry[] | null;
  countersLoading: boolean;
  scanList: ScanList | null;
  /** Hand-built team: the three picks, how to order them, and the last analysis. */
  picks: [TeamPick | null, TeamPick | null, TeamPick | null];
  orderMode: 'best' | 'given';
  analysis: TeamAnalysis | null;
  analyzing: boolean;
  analyzeError: string | null;
  /** Filters snapshot the current recommendation was computed with. */
  recommendedWith: string | null;
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
  | { type: 'counters-start' }
  | { type: 'counters-done'; counters: CounterEntry[] | null }
  | { type: 'scanlist'; scanList: ScanList }
  | { type: 'pick'; slot: number; pick: TeamPick | null }
  | { type: 'order-mode'; mode: 'best' | 'given' }
  | { type: 'analyze-start' }
  | { type: 'analyze-done'; analysis: TeamAnalysis }
  | { type: 'analyze-error'; message: string }
  | { type: 'forget' };

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
  scanList: null,
  picks: [null, null, null],
  orderMode: 'best',
  analysis: null,
  analyzing: false,
  analyzeError: null,
  recommendedWith: null,
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
      return { ...s, countersLoading: true };
    case 'counters-done':
      return { ...s, countersLoading: false, counters: a.counters };
    case 'scanlist':
      return { ...s, scanList: a.scanList };
    case 'pick': {
      const picks = [...s.picks] as AppState['picks'];
      picks[a.slot] = a.pick;
      return { ...s, picks, analyzeError: null };
    }
    case 'order-mode':
      return { ...s, orderMode: a.mode };
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
      };
    default:
      return s;
  }
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('?')[0]!.split('/').filter(Boolean);
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
    return { screen: 'counters' };
  }
  if (a === 'build') {
    return b === 'team' ? { screen: 'custom' } : { screen: 'build' };
  }
  if (a === 'add') {
    return { screen: 'add' };
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
      return '#/counters';
    case 'build':
      return '#/build';
    case 'custom':
      return '#/build/team';
    case 'add':
      return '#/add';
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

export function filterKey(settings: Settings): string {
  return JSON.stringify({ league: settings.league ?? 'great', ...optionsFrom(settings) });
}

interface Actions {
  navigate(route: Route): void;
  back(): void;
  openSheet(): void;
  closeSheet(): void;
  importCsv(text: string, fileName: string | null): Promise<boolean>;
  runRecommend(): Promise<void>;
  loadVerdicts(): Promise<void>;
  loadCounters(): Promise<void>;
  loadScanList(): Promise<void>;
  setPick(slot: number, pick: TeamPick | null): void;
  setOrderMode(mode: 'best' | 'given'): void;
  analyze(): Promise<void>;
  addManual(input: ManualInput): Promise<ManualResult>;
  removeSpecimen(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings> | ((s: Settings) => Settings)): void;
  setLeague(id: string): void;
  toggleExcluded(specimenId: string): void;
  forget(): Promise<void>;
}

const StateCtx = createContext<AppState | null>(null);
const ActionsCtx = createContext<Actions | null>(null);

export function AppProvider({ children, host }: { children: ReactNode; host?: WorkerHost }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const hostRef = useRef<WorkerHost | null>(host ?? null);
  const stateRef = useRef(state);
  stateRef.current = state;

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
    h.league = id;
    let cancelled = false;
    dispatch({ type: 'league-start' });
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
        dispatch({ type: 'import-error', message });
        return false;
      }
    },
    [navigate],
  );

  const runRecommend = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    if (!s.collection || s.recommending || !s.leagueInfo) {
      return;
    }
    const key = filterKey(s.settings);
    dispatch({ type: 'rec-start', key });
    try {
      const recommendation = await h.recommend(
        s.collection.specimens,
        optionsFrom(s.settings),
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

  const loadCounters = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    if (!s.collection || s.countersLoading || !s.leagueInfo) {
      return;
    }
    dispatch({ type: 'counters-start' });
    try {
      const counters = await h.counters(s.collection.specimens, {});
      dispatch({ type: 'counters-done', counters });
    } catch (e) {
      recordError('counters', e);
      dispatch({ type: 'counters-done', counters: [] });
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

  const setPick = useCallback((slot: number, pick: TeamPick | null) => {
    dispatch({ type: 'pick', slot, pick });
  }, []);
  const setOrderMode = useCallback((mode: 'best' | 'given') => {
    dispatch({ type: 'order-mode', mode });
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
          order: s.orderMode,
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

  const EMPTY_REPORT: ImportReport = {
    scansRead: 0,
    recognized: 0,
    duplicatesMerged: 0,
    missingIvs: { count: 0, names: [] },
    unrecognized: [],
    rowProblems: [],
    header: { ok: true, missingRequired: [], missingOptional: [], unknown: [], columnCount: 0 },
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

  const forget = useCallback(async () => {
    await storage.forget();
    dispatch({ type: 'forget' });
    window.location.hash = '#/';
  }, []);

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
      setOrderMode,
      analyze,
      addManual,
      removeSpecimen,
      updateSettings,
      setLeague,
      toggleExcluded,
      forget,
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
      setOrderMode,
      analyze,
      addManual,
      removeSpecimen,
      updateSettings,
      setLeague,
      toggleExcluded,
      forget,
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
