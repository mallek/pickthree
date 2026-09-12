import type { MetaRank } from '@pickthree/engine';
import type {
  CounterEntry,
  ProgressEvent,
  Recommendation,
  RecommendOptions,
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
import type { SpeciesLite } from '../host/protocol.ts';
import { recordPick3 } from '../counter.ts';
import { ImportFailed, WorkerHost } from '../host/WorkerHost.ts';
import { DEFAULT_SETTINGS, storage, type Settings, type StoredCollection } from '../storage/db.ts';

export type Route =
  | { screen: 'welcome' }
  | { screen: 'report' }
  | { screen: 'teams' }
  | { screen: 'team'; id: string }
  | { screen: 'collection' }
  | { screen: 'specimen'; id: string }
  | { screen: 'counters' };

export interface DataInfo {
  pvpokeCommit: string;
  pvpokeDate: string;
  builtAt: string;
  metaSize: number;
  species: Record<string, SpeciesLite>;
  meta: string[];
  metaRanks: Record<string, MetaRank>;
}

export interface AppState {
  boot: 'loading' | 'ready' | 'error';
  bootError: string | null;
  data: DataInfo | null;
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
  counters: CounterEntry[] | null;
  countersLoading: boolean;
  /** Filters snapshot the current recommendation was computed with. */
  recommendedWith: string | null;
}

type Action =
  | { type: 'boot-ready'; data: DataInfo }
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
  | { type: 'counters-start' }
  | { type: 'counters-done'; counters: CounterEntry[] | null }
  | { type: 'forget' };

const initial: AppState = {
  boot: 'loading',
  bootError: null,
  data: null,
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
  counters: null,
  countersLoading: false,
  recommendedWith: null,
};

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'boot-ready':
      return { ...s, boot: 'ready', data: a.data };
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
    case 'verdicts-start':
      return { ...s, verdictsLoading: true };
    case 'verdicts-done':
      return { ...s, verdictsLoading: false, verdicts: a.verdicts };
    case 'forget':
      return {
        ...initial,
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
  return JSON.stringify(optionsFrom(settings));
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
  updateSettings(patch: Partial<Settings> | ((s: Settings) => Settings)): void;
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
          if (collection && initialRoute.screen === 'welcome') {
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
            data: { ...r.manifest, species: r.species, meta: r.meta, metaRanks: r.metaRanks },
          });
        }
      })
      .catch((e: unknown) => {
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
        dispatch({ type: 'import-error', message });
        return false;
      }
    },
    [navigate],
  );

  const runRecommend = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    if (!s.collection || s.recommending) {
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
      dispatch({ type: 'rec-error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const loadVerdicts = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    if (!s.collection || s.verdictsLoading) {
      return;
    }
    dispatch({ type: 'verdicts-start' });
    try {
      const verdicts = await h.verdicts(s.collection.specimens, optionsFrom(s.settings));
      dispatch({ type: 'verdicts-done', verdicts });
    } catch {
      dispatch({ type: 'verdicts-done', verdicts: {} });
    }
  }, []);

  const loadCounters = useCallback(async () => {
    const h = hostRef.current as WorkerHost;
    const s = stateRef.current;
    if (!s.collection || s.countersLoading) {
      return;
    }
    dispatch({ type: 'counters-start' });
    try {
      const counters = await h.counters(s.collection.specimens, {});
      dispatch({ type: 'counters-done', counters });
    } catch {
      dispatch({ type: 'counters-done', counters: [] });
    }
  }, []);

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
      updateSettings,
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
      updateSettings,
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
