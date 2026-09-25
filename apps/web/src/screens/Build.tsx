import {
  RECENT_LIMIT,
  recentOpponents,
  type MoveIds,
  type MovePool,
  type Specimen,
  type TeamPick,
  type VerdictLabel,
} from '@pickthree/engine';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  CogGlyph,
  PokemonToken,
  Progress,
  TypeChip,
  TypeChips,
  useName,
  useShortName,
  useSpecies,
  useSpeciesSearch,
} from '../components.tsx';
import { costLine, ivLine, SEP, topPct } from '../format.ts';
import { Button, ErrorState, Header, IconButton, Sheet, Tag, typeColor } from '@pickthree/ui';
import { matchesQuery, parseQuery } from '../search.ts';
import { stagedSpecimenRecord } from '../searchRecords.ts';
import { suggestKey, useActions, useAppState } from '../state/store.tsx';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { lineupCost } from '../components/lineupCost.ts';
import { MovePicker } from '../components/MovePicker.tsx';
import { TeammateSuggestions } from '../components/TeammateSuggestions.tsx';

const SLOT_LABELS = ['Lead', 'Safe Switch', 'Closer'] as const;
/** Each slot's job in one line, shortened from GLOSSARY in components.tsx. */
const ROLE_JOBS = [
  'Opens the battle and usually decides the first shield exchange',
  'Comes in when the lead matchup goes badly',
  'Finishes the battle after shields are gone',
] as const;
const ORDER: Record<VerdictLabel, number> = {
  'Ready to use': 0,
  'Worth building': 1,
  'Wait for better IVs': 2,
  'Not eligible': 3,
  'Needs rescan': 4,
};

/** Hand-pick three Pokémon, from the collection or any species at top-10% IVs, and analyze them. */
export function Build() {
  const s = useAppState();
  const {
    back,
    openSheet,
    setPick,
    setPicks,
    findOrder,
    analyze,
    loadVerdicts,
    movePool,
    suggestTeammates,
  } = useActions();
  /** True after pick3 ordered the cards, until a drag or a pick changes them. */
  const [orderedByPick3, setOrderedByPick3] = useState(false);
  const [finding, setFinding] = useState(false);
  const name = useName();
  const short = useShortName();
  const species = useSpecies();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  /** The empty slot being filled: the search and its grid show only while one is open. */
  const [target, setTarget] = useState<number | null>(null);
  /** Which slot has its move sheet open. */
  const [movesSlot, setMovesSlot] = useState<number | null>(null);
  /** Move pools by league, species, scanned moves and fast move, fetched once each. */
  const [pools, setPools] = useState<Record<string, MovePool>>({});
  const poolsAsked = useRef(new Set<string>());

  useEffect(() => {
    if (
      s.boot === 'ready' &&
      s.leagueInfo &&
      s.collection &&
      Object.keys(s.verdicts).length === 0 &&
      !s.verdictsLoading &&
      !s.verdictsError
    ) {
      void loadVerdicts();
    }
  }, [
    s.boot,
    s.leagueInfo,
    s.collection,
    s.verdicts,
    s.verdictsLoading,
    s.verdictsError,
    loadVerdicts,
  ]);

  const parsed = useMemo(() => parseQuery(query), [query]);
  const hits = useSpeciesSearch(query, 30);
  const searching = query.trim().length > 0;

  /** The stage a specimen would be built to, which is the species it plays as. */
  const stageOf = (sp: Specimen): string => s.verdicts[sp.id]?.build?.speciesId ?? sp.speciesId;
  const usable = (sp: Specimen): boolean => {
    const v = s.verdicts[sp.id];
    return Boolean(sp.ivs) && v?.label !== 'Not eligible' && v?.label !== 'Needs rescan';
  };
  const byWorth = (a: Specimen, b: Specimen): number => {
    const oa = s.verdicts[a.id] ? ORDER[s.verdicts[a.id]!.label] : 9;
    const ob = s.verdicts[b.id] ? ORDER[s.verdicts[b.id]!.label] : 9;
    const ra = s.verdicts[a.id]?.build?.ivRank.rank ?? 99_999;
    const rb = s.verdicts[b.id]?.build?.ivRank.rank ?? 99_999;
    return oa - ob || ra - rb;
  };

  const mine = useMemo(() => {
    if (parsed.length === 0 || !s.collection) {
      return [];
    }
    const moves = s.data?.moves;
    const seen = new Set<string>();
    return s.collection.specimens
      .filter((sp) => {
        if (!usable(sp)) {
          return false;
        }
        const stage = stageOf(sp);
        // One merged record (both names, union of both types), not an OR of two matches, so a
        // negated term correctly excludes a specimen whose stage differs from its owned species.
        const record = stagedSpecimenRecord(
          sp,
          name(sp.speciesId),
          species(sp.speciesId),
          name(stage),
          species(stage),
          moves,
        );
        return matchesQuery(parsed, record);
      })
      .sort(byWorth)
      .filter((sp) => {
        const stage = stageOf(sp);
        if (seen.has(stage)) {
          return false;
        }
        seen.add(stage);
        return true;
      })
      .slice(0, 30);
    // stageOf, usable and byWorth read s.verdicts, which is in the list.
  }, [s.collection, s.verdicts, s.data, parsed, name, species]);

  /** Your best specimen that plays as this species, or null when you have none. */
  const bestOwned = (stageId: string): Specimen | null => {
    const owned = (s.collection?.specimens ?? [])
      .filter((sp) => usable(sp) && stageOf(sp) === stageId)
      .sort(byWorth);
    return owned[0] ?? null;
  };

  type GridItem = { key: string; speciesId: string; pick: TeamPick; mine: boolean };

  /** Collection matches first, then the rest of the species search, for the search grid. */
  const picksGrid = useMemo((): GridItem[] => {
    if (!searching) {
      return [];
    }
    const mineStages = new Set(mine.map(stageOf));
    const fromMine = mine.map((sp) => ({
      key: sp.id,
      speciesId: stageOf(sp),
      pick: { kind: 'specimen', id: sp.id } as TeamPick,
      mine: true,
    }));
    const others = hits
      .filter((id) => !mineStages.has(id))
      .map((id) => ({
        key: id,
        speciesId: id,
        pick: { kind: 'species', id } as TeamPick,
        mine: false,
      }));
    return [...fromMine, ...others];
  }, [searching, mine, hits, s.verdicts]);

  /** With nothing typed: the same weighted list Log a Battle shows, your own where you have one. */
  const fallback = useMemo(() => {
    const ranks = s.leagueInfo?.metaRanks ?? {};
    return [...(s.leagueInfo?.meta ?? [])].sort(
      (a, b) => (ranks[a]?.overall ?? 999) - (ranks[b]?.overall ?? 999),
    );
  }, [s.leagueInfo]);
  const ranks = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(s.leagueInfo?.metaRanks ?? {}).map(([id, r]) => [id, r.overall]),
      ),
    [s.leagueInfo],
  );
  const suggested = useMemo((): GridItem[] => {
    const ids = recentOpponents(s.sets, fallback, RECENT_LIMIT, ranks);
    return ids.map((id) => {
      const sp = bestOwned(id);
      return {
        key: id,
        speciesId: id,
        pick: sp
          ? ({ kind: 'specimen', id: sp.id } as TeamPick)
          : ({ kind: 'species', id } as TeamPick),
        mine: sp !== null,
      };
    });
    // bestOwned reads the collection and verdicts, both in the list.
  }, [s.sets, fallback, ranks, s.collection, s.verdicts]);
  const grid = searching ? picksGrid : suggested;

  /** Open the search for one empty slot. */
  const openSlot = (i: number): void => {
    setQuery('');
    setTarget(i);
  };
  /** The pick lands in the slot that opened the search, and the search folds away. */
  const fill = (pick: TeamPick): void => {
    if (target === null) {
      return;
    }
    setPick(target, pick);
    setQuery('');
    setTarget(null);
    setOrderedByPick3(false);
  };
  useEffect(() => {
    if (target !== null) {
      searchRef.current?.focus();
    }
  }, [target]);

  const specimenOf = (p: TeamPick | null): Specimen | null =>
    p?.kind === 'specimen' ? (s.collection?.specimens.find((x) => x.id === p.id) ?? null) : null;

  const pickInfo = (p: TeamPick | null): { title: string; speciesId: string } | null => {
    if (!p) {
      return null;
    }
    if (p.kind === 'species') {
      return { title: name(p.id), speciesId: p.id };
    }
    const sp = specimenOf(p);
    if (!sp) {
      return { title: 'Missing', speciesId: '' };
    }
    const stage = stageOf(sp);
    return { title: name(stage), speciesId: stage };
  };

  type Target = { speciesId: string; current: { fast: string | null; charged: string[] } };
  /** The species a pick runs as and the moves that Pokemon has, for the move pool. */
  const pickTarget = (p: TeamPick | null): Target | null => {
    if (!p) {
      return null;
    }
    if (p.kind === 'species') {
      return { speciesId: p.id, current: { fast: null, charged: [] } };
    }
    const sp = specimenOf(p);
    if (!sp) {
      return null;
    }
    return { speciesId: stageOf(sp), current: sp.currentMoves };
  };
  const league = s.settings.league ?? 'great';
  const poolKey = (t: Target, fastId: string | null): string =>
    `${league}|${t.speciesId}|${t.current.fast ?? ''}|${t.current.charged.join('+')}|${fastId ?? ''}`;
  const poolFor = (p: TeamPick | null): MovePool | null => {
    const t = pickTarget(p);
    return t ? (pools[poolKey(t, p?.moves?.fast ?? null)] ?? null) : null;
  };

  // Fetch the pool each filled slot needs: the recommendation names the default moves line, and
  // the charged counts depend on the fast move in play.
  const wanted = s.picks
    .map((p) => {
      const t = pickTarget(p);
      return t
        ? { t, key: poolKey(t, p?.moves?.fast ?? null), fastId: p?.moves?.fast ?? null }
        : null;
    })
    .filter((w) => w !== null);
  const wantedKeys = wanted.map((w) => w.key).join('\n');
  useEffect(() => {
    if (s.boot !== 'ready' || !s.leagueInfo) {
      return;
    }
    for (const w of wanted) {
      if (pools[w.key] || poolsAsked.current.has(w.key)) {
        continue;
      }
      poolsAsked.current.add(w.key);
      // Promise.resolve tolerates a test double that returns the pool directly (or nothing)
      // instead of a real promise, same as the worker host always returns.
      Promise.resolve(movePool(w.t.speciesId, w.fastId, w.t.current))
        .then((pool) => {
          if (pool) {
            setPools((prev) => ({ ...prev, [w.key]: pool }));
          }
        })
        .catch(() => poolsAsked.current.delete(w.key));
    }
    // wanted is derived from the same state wantedKeys summarises.
  }, [wantedKeys, s.boot, s.leagueInfo, pools, movePool]);

  /** The moves a pick runs, one line each: F or C, the name, its type. */
  const moveLines = (p: TeamPick, pool: MovePool | null) => {
    if (!pool) {
      return <span className="meta">Recommended moves</span>;
    }
    const ids = p.moves ?? pool.recommended;
    const all = [...pool.fast, ...pool.charged];
    const line = (id: string, kind: 'F' | 'C') => {
      const m = all.find((x) => x.moveId === id);
      return (
        <span className="pick-move" key={id}>
          <i className="pick-move-k">{kind}</i>
          <span className="pick-move-name">{m?.name ?? id}</span>
          {m ? <TypeChip type={m.type} small /> : null}
        </span>
      );
    };
    return (
      <span className="pick-moves">
        {line(ids.fast, 'F')}
        {ids.charged.map((id) => line(id, 'C'))}
        {p.moves ? <Tag>Moves changed</Tag> : null}
      </span>
    );
  };

  const setMoves = (i: number, p: TeamPick, next: MoveIds): void => {
    setPick(i, { ...p, moves: next });
  };

  const closeMoves = (): void => setMovesSlot(null);
  const removePick = (i: number): void => {
    setPick(i, null);
    if (movesSlot === i) {
      setMovesSlot(null);
    }
  };

  // Drag a card by its grip to another slot. Pointer events, so it works by finger and mouse.
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<{ from: number; dy: number; over: number } | null>(null);
  const dragStart = useRef<{ from: number; y: number } | null>(null);
  const slotAt = (clientY: number): number => {
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    cardRefs.current.forEach((el, i) => {
      if (!el) {
        return;
      }
      const r = el.getBoundingClientRect();
      const d = Math.abs(clientY - (r.top + r.height / 2));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };
  const onGripDown = (i: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragStart.current = { from: i, y: e.clientY };
    setDrag({ from: i, dy: 0, over: i });
  };
  const onGripMove = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const st = dragStart.current;
    if (!st) {
      return;
    }
    setDrag({ from: st.from, dy: e.clientY - st.y, over: slotAt(e.clientY) });
  };
  const onGripUp = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const st = dragStart.current;
    dragStart.current = null;
    if (!st) {
      return;
    }
    const to = slotAt(e.clientY);
    setDrag(null);
    if (to !== st.from) {
      const next = [...s.picks] as typeof s.picks;
      const moved = next[st.from] ?? null;
      next.splice(st.from, 1);
      next.splice(to, 0, moved);
      setPicks(next, false);
      setOrderedByPick3(false);
    }
  };
  const findBest = async (): Promise<void> => {
    setFinding(true);
    try {
      if (await findOrder()) {
        setOrderedByPick3(true);
      }
    } finally {
      setFinding(false);
    }
  };

  const allIn = s.picks.every(Boolean);
  const ready = allIn && s.boot === 'ready' && !s.analyzing;
  const pinned = s.picks.filter(Boolean).length;
  const boardKey = suggestKey(s.picks, league);
  const lastAsked = useRef<string | null>(null);
  // A list or an error for the board on screen. Every pick change clears the list in the store,
  // even one that leaves the same board (a move change, or the same Pokémon picked again).
  const answered = s.suggestion !== null || s.suggestError !== null;
  // Runs on its own whenever the board has one or two picks and has no answer since the last ask.
  // A run in flight finishes (and is dropped if the board moved on); this effect then asks again.
  useEffect(() => {
    if (
      pinned === 0 ||
      pinned === 3 ||
      s.boot !== 'ready' ||
      !s.leagueInfo ||
      s.analyzing ||
      s.suggesting ||
      (lastAsked.current === boardKey && answered)
    ) {
      return;
    }
    lastAsked.current = boardKey;
    void suggestTeammates();
  }, [
    boardKey,
    answered,
    pinned,
    s.boot,
    s.leagueInfo,
    s.analyzing,
    s.suggesting,
    suggestTeammates,
  ]);

  /** + Add on a suggested teammate: it takes the first empty slot, and no search opens. */
  const addTeammate = (pick: TeamPick): void => {
    const slot = s.picks.findIndex((p) => p === null);
    if (slot < 0) {
      return;
    }
    setPick(slot, pick);
    setOrderedByPick3(false);
  };
  const onBoard = s.picks.map((p) => pickInfo(p)?.speciesId).filter((id): id is string => !!id);
  // undefined while a verdict is on its way, null once it came back with no cost.
  const cost = lineupCost(s.picks, (id) => s.verdicts[id]?.cost);
  const sheetPick = movesSlot !== null ? s.picks[movesSlot] : null;
  const sheetInfo = sheetPick ? pickInfo(sheetPick) : null;
  const sheetPool = sheetPick ? poolFor(sheetPick) : null;

  return (
    <div className="screen">
      <Header
        variant="sub"
        title="Build Your Team"
        back={{ label: 'Back', onClick: () => back({ screen: 'teams' }) }}
        actions={
          <IconButton label="Settings" onClick={openSheet}>
            <CogGlyph />
          </IconButton>
        }
      />
      <div className="scroll build-scroll">
        <LeagueSwitcher compact />
        {target !== null ? (
          <div className="build-choose">
            <p className="build-choosing">
              <b>Choosing {SLOT_LABELS[target]}</b>
              <span className="meta">{ROLE_JOBS[target]}</span>
            </p>
            <input
              ref={searchRef}
              className="search"
              placeholder={`Search any Pokémon for ${SLOT_LABELS[target]}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Tapping away closes the search; grid taps keep focus so they still land.
              onBlur={() => setTarget(null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setTarget(null);
                }
              }}
              inputMode="search"
            />
            <span className="meta">{searching ? 'Matches' : 'Suggested'}</span>
            <div className="recent-row matches tall">
              {grid.map((p) => (
                <button
                  type="button"
                  className="recent-token"
                  key={p.key}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => fill(p.pick)}
                  aria-label={name(p.speciesId)}
                >
                  <PokemonToken speciesId={p.speciesId} size={36} />
                  <span>{short(p.speciesId)}</span>
                  {p.mine ? <Tag>yours</Tag> : null}
                </button>
              ))}
            </div>
            {grid.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                Nothing matches.
              </p>
            ) : null}
            {!s.collection ? (
              <p className="small muted" style={{ margin: 0 }}>
                No collection imported. Import a CSV to include your own Pokémon here.
              </p>
            ) : null}
            {s.collection && Object.keys(s.verdicts).length === 0 ? (
              <Progress stage="verdicts" done={0} total={0} />
            ) : null}
          </div>
        ) : null}

        <div className="build-lineup">
          <div className="build-lineup-head">
            <h3>Your lineup</h3>
            <Button variant="text" disabled={!ready} onClick={() => void findBest()}>
              {finding ? 'Finding...' : 'Find best order'}
            </Button>
          </div>
          <p className="meta">
            {orderedByPick3
              ? 'Ordered by pick3. Drag a card to change it.'
              : 'Tap a card to change its moves'}
          </p>
        </div>

        <div className="pick-cards">
          {s.picks.map((p, i) => {
            const info = pickInfo(p);
            const role = SLOT_LABELS[i];
            const dragStyle: CSSProperties | undefined =
              drag && drag.from === i
                ? { transform: `translateY(${drag.dy}px)`, zIndex: 3, position: 'relative' }
                : undefined;
            const overClass = drag && drag.over === i && drag.from !== i ? ' drop-target' : '';
            if (!p || !info) {
              return (
                <div
                  className={`pick-card empty${overClass}${target === i ? ' open' : ''}`}
                  key={SLOT_LABELS[i]}
                  role="button"
                  tabIndex={0}
                  aria-label={`${role}, empty`}
                  onClick={() => openSlot(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openSlot(i);
                    }
                  }}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                >
                  <span className="opp-slot-empty" style={{ width: 44, height: 44 }}>
                    {i + 1}
                  </span>
                  <span className="pick-card-body">
                    <span className="pick-role">{role}</span>
                    <span className="small muted">Tap to pick a Pokémon.</span>
                  </span>
                </div>
              );
            }
            const types = species(info.speciesId)?.types ?? ['normal', 'none'];
            const sp = specimenOf(p);
            const build = sp ? (s.verdicts[sp.id]?.build ?? null) : null;
            return (
              <div
                className={`slot-wrap${overClass}`}
                key={SLOT_LABELS[i]}
                style={dragStyle}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
              >
                <button
                  type="button"
                  className="pick-card filled"
                  style={{ '--c1': typeColor(types[0]) } as CSSProperties}
                  onClick={() => setMovesSlot(movesSlot === i ? null : i)}
                  aria-label={`${info.title} moves`}
                >
                  <span className="pick-token">
                    <PokemonToken speciesId={info.speciesId} size={56} />
                    <span className="pick-role-pill">{role}</span>
                  </span>
                  <span className="pick-card-body">
                    <span className="pick-head">
                      <b className="pick-name">{info.title}</b>
                      <TypeChips types={types} small />
                    </span>
                    <span className="pick-v">
                      {sp ? (
                        <>
                          <b>{ivLine(sp.ivs)}</b>
                          {build ? `${SEP}top ${topPct(build.ivRank)}%` : ''}
                          {SEP}
                          {'Lv\u00a0'}
                          {sp.level.max}
                          {build && build.stageOffset > 0 ? (
                            <span className="muted">
                              {SEP}from your {name(sp.speciesId)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="muted">Not yours; top-10% IVs assumed</span>
                      )}
                    </span>
                    {moveLines(p, poolFor(p))}
                  </span>
                </button>
                <span className="pick-side">
                  <button
                    type="button"
                    className="pick-x"
                    aria-label={`Remove ${info.title}`}
                    onClick={() => removePick(i)}
                  >
                    &times;
                  </button>
                  <button
                    type="button"
                    className="drag-grip"
                    aria-label={`Drag ${info.title} to another slot`}
                    onPointerDown={onGripDown(i)}
                    onPointerMove={onGripMove}
                    onPointerUp={onGripUp}
                    onPointerCancel={() => {
                      dragStart.current = null;
                      setDrag(null);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="5" cy="3" r="1.5" fill="currentColor" />
                      <circle cx="11" cy="3" r="1.5" fill="currentColor" />
                      <circle cx="5" cy="8" r="1.5" fill="currentColor" />
                      <circle cx="11" cy="8" r="1.5" fill="currentColor" />
                      <circle cx="5" cy="13" r="1.5" fill="currentColor" />
                      <circle cx="11" cy="13" r="1.5" fill="currentColor" />
                    </svg>
                  </button>
                </span>
              </div>
            );
          })}
        </div>

        {allIn ? (
          <div className="build-cost" data-testid="build-cost">
            {cost.total ? (
              <>
                <span className="meta">Total to build</span>
                <span>{costLine(cost.total)}</span>
              </>
            ) : cost.notCaught === 3 ? (
              <span className="meta">
                None of these are yours yet, so there is nothing to price.
              </span>
            ) : null}
            {cost.notCaught > 0 && cost.notCaught < 3 ? (
              <span className="meta">Not counting {cost.notCaught} you have not caught</span>
            ) : null}
            {cost.unpriced > 0 ? (
              <span className="meta">Not counting {cost.unpriced} not priced yet</span>
            ) : null}
            {cost.unbuildable > 0 ? (
              <span className="meta">
                Not counting {cost.unbuildable} that cannot be built here
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Shortcuts last, and hidden while a slot's search is open: the keyboard covers them. */}
        {target === null && (pinned === 1 || pinned === 2) ? (
          <TeammateSuggestions filled={pinned as 1 | 2} onBoard={onBoard} onAdd={addTeammate} />
        ) : null}

        {s.analyzeError ? <ErrorState line={s.analyzeError} /> : null}
        {s.analyzing && s.progress ? (
          <Progress stage={s.progress.stage} done={s.progress.done} total={s.progress.total} />
        ) : null}
        <Button variant="primary" disabled={!ready} onClick={() => void analyze()}>
          {s.analyzing && !finding ? 'Analyzing...' : 'Analyze this team'}
        </Button>
      </div>
      {movesSlot !== null && sheetPick && sheetInfo ? (
        <Sheet
          onClose={closeMoves}
          root={{
            id: 'moves',
            title: sheetInfo.title,
            render: () =>
              sheetPool ? (
                <MovePicker
                  pool={sheetPool}
                  value={sheetPick.moves ?? sheetPool.recommended}
                  onChange={(next) => setMoves(movesSlot, sheetPick, next)}
                />
              ) : (
                <Progress stage="moves" done={0} total={0} />
              ),
          }}
        />
      ) : null}
    </div>
  );
}
