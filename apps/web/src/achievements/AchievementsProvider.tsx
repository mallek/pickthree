import {
  ACHIEVEMENTS,
  buildFacts,
  EMPTY_ACHIEVEMENTS,
  nearest,
  newlyEarned,
  nudgeLine,
  roll,
  statusAll,
  type AchievementFacts,
  type AchievementsRecord,
  type AchievementStatus,
  type EarnedAchievement,
} from '@pickthree/engine';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { recordError } from '../diag.ts';
import { useAppState } from '../state/store.tsx';
import { storage } from '../storage/db.ts';
import { loadMetaGroup } from './metaGroups.ts';

export type Announcement =
  { kind: 'earned'; earned: EarnedAchievement; name: string } | { kind: 'nudge'; line: string };

export interface Reveal {
  title: string;
  items: { earned: EarnedAchievement; name: string }[];
}

export interface AchievementsView {
  loaded: boolean;
  record: AchievementsRecord;
  statuses: AchievementStatus[];
  /** Earned ids that are in the current list (retired ones excluded). */
  earnedCount: number;
  total: number;
  shinyCount: number;
  nudge: string | null;
  toast: Announcement | null;
  reveal: Reveal | null;
  dismissToast(): void;
  closeReveal(): void;
}

const NAMES = new Map(ACHIEVEMENTS.map((d) => [d.id, d.name]));

/** A uniform number in [0, 1) from the platform's cryptographic source. */
function cryptoRandom(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] as number) / 2 ** 32;
}

const Ctx = createContext<AchievementsView | null>(null);

/**
 * Works out achievements on the phone and announces new ones. Evaluations run one at a time
 * through a promise chain, and the roll happens inside one IndexedDB transaction against the
 * stored record, so neither a second evaluation (StrictMode, a battle logged during boot) nor an
 * imported log merging at the same moment can roll an achievement twice or lose a write. New
 * Pokemon are saved before they are announced. `rng` is for tests.
 */
export function AchievementsProvider({
  children,
  rng = cryptoRandom,
}: {
  children: ReactNode;
  rng?: () => number;
}) {
  const s = useAppState();
  const [record, setRecord] = useState<AchievementsRecord>(EMPTY_ACHIEVEMENTS);
  const [facts, setFacts] = useState<AchievementFacts | null>(null);
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const closedSeen = useRef<Set<string> | null>(null);
  const stateRef = useRef(s);
  stateRef.current = s;

  const run = useCallback((job: () => Promise<void>) => {
    chain.current = chain.current.then(job).catch((e: unknown) => recordError('achievements', e));
  }, []);

  const evaluate = useCallback(
    (extraMark?: string) =>
      run(async () => {
        const app = stateRef.current;
        if (app.boot !== 'ready' || !app.settingsLoaded || !app.data) {
          return;
        }
        const [sets, loaded] = await Promise.all([
          storage.loadAllSets(),
          storage.loadAchievements(),
        ]);
        const leagues = [...new Set(sets.map((x) => x.league))];
        const groups = await Promise.all(leagues.map((l) => loadMetaGroup(l)));
        const metaGroups = Object.fromEntries(leagues.map((l, i) => [l, groups[i] ?? []]));
        const withMark = (marks: readonly string[]): string[] =>
          extraMark !== undefined && !marks.includes(extraMark)
            ? [...marks, extraMark]
            : [...marks];
        const f = buildFacts({
          sets,
          seasons: app.data.seasons,
          metaGroups,
          hasCollection: (app.collection?.specimens.length ?? 0) > 0,
          marks: withMark(loaded.marks),
          now: new Date(),
        });
        // The roll runs inside the write's transaction against the record as stored right then,
        // so an import that merged while the reads above were in flight is kept, not overwritten.
        const out: { added: EarnedAchievement[]; wasEmpty: boolean; facts: AchievementFacts } = {
          added: [],
          wasEmpty: false,
          facts: f,
        };
        const saved = await storage.updateAchievements((cur) => {
          const marks = withMark(cur.marks);
          const facts = { ...f, marks: new Set(marks) };
          const owned = new Set(cur.earned.map((e) => e.species));
          const earnedAt = new Date().toISOString();
          const added: EarnedAchievement[] = [];
          for (const def of newlyEarned(facts, new Set(cur.earned.map((e) => e.id)))) {
            const r = roll(def.tier, owned, f.seasonStreak.current, rng);
            owned.add(r.species);
            added.push({ id: def.id, earnedAt, species: r.species, shiny: r.shiny });
          }
          out.added = added;
          out.wasEmpty = cur.earned.length === 0;
          out.facts = facts;
          return { earned: [...cur.earned, ...added], marks };
        });
        if (saved === null) {
          // Save before announce: a Pokemon the phone did not keep is never shown.
          setFacts(f);
          return;
        }
        setRecord(saved);
        setFacts(out.facts);
        const closedNow = new Set(sets.filter((x) => x.closed).map((x) => x.id));
        const seen = closedSeen.current;
        const justClosed = seen !== null && [...closedNow].some((id) => !seen.has(id));
        closedSeen.current = closedNow;
        const named = out.added.map((earned) => ({
          earned,
          name: NAMES.get(earned.id) ?? earned.id,
        }));
        const [only] = named;
        if (named.length === 1 && only) {
          setQueue((q) => [...q, { kind: 'earned', ...only }]);
        } else if (named.length > 1) {
          setReveal({
            title: out.wasEmpty
              ? `You have earned ${named.length} already`
              : `${named.length} new achievements`,
            items: named,
          });
        } else if (justClosed) {
          const n = nearest(out.facts, new Set(saved.earned.map((e) => e.id)));
          if (n) {
            setQueue((q) => [...q, { kind: 'nudge', line: nudgeLine(n) }]);
          }
        }
      }),
    [run, rng],
  );

  // Boot, every log change (saved, edited, imported, forgotten) and the collection arriving.
  useEffect(() => {
    evaluate();
  }, [evaluate, s.boot, s.settingsLoaded, s.data, s.logVersion, s.collection]);

  // A finished analysis is the Team builder mark: the only starter action with no history.
  const lastAnalysis = useRef(s.analysis);
  useEffect(() => {
    if (s.analysis && s.analysis !== lastAnalysis.current) {
      evaluate('analyzed');
    }
    lastAnalysis.current = s.analysis;
  }, [s.analysis, evaluate]);

  const view = useMemo<AchievementsView>(() => {
    const ids = new Set(record.earned.map((e) => e.id));
    const statuses = facts ? statusAll(facts, ids) : [];
    const n = facts ? nearest(facts, ids) : null;
    return {
      loaded: facts !== null,
      record,
      statuses,
      earnedCount: ACHIEVEMENTS.filter((d) => ids.has(d.id)).length,
      total: ACHIEVEMENTS.length,
      shinyCount: record.earned.filter((e) => e.shiny).length,
      nudge: n ? nudgeLine(n) : null,
      toast: queue[0] ?? null,
      reveal,
      dismissToast: () => setQueue((q) => q.slice(1)),
      closeReveal: () => setReveal(null),
    };
  }, [record, facts, queue, reveal]);

  return <Ctx.Provider value={view}>{children}</Ctx.Provider>;
}

const EMPTY_VIEW: AchievementsView = {
  loaded: false,
  record: EMPTY_ACHIEVEMENTS,
  statuses: [],
  earnedCount: 0,
  total: ACHIEVEMENTS.length,
  shinyCount: 0,
  nudge: null,
  toast: null,
  reveal: null,
  dismissToast: () => undefined,
  closeReveal: () => undefined,
};

/** The achievements view. Outside the provider (isolated screen tests) it is empty, never a throw. */
export function useAchievements(): AchievementsView {
  return useContext(Ctx) ?? EMPTY_VIEW;
}
