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
  Chip,
  Header,
  PokemonToken,
  Progress,
  TypeChips,
  useName,
  useShortName,
  useSpecies,
  useSpeciesSearch,
} from '../components.tsx';
import { ivLine, topPct, typeColor } from '../format.ts';
import { matchesQuery, parseQuery } from '../search.ts';
import { stagedSpecimenRecord } from '../searchRecords.ts';
import { useActions, useAppState } from '../state/store.tsx';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { MovePicker } from '../components/MovePicker.tsx';

const SLOT_LABELS = ['Lead', 'Safe Switch', 'Closer'] as const;
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
  const { navigate, setPick, setPicks, setOrderMode, analyze, loadVerdicts, movePool } =
    useActions();
  const name = useName();
  const short = useShortName();
  const species = useSpecies();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  /** Set by a pick: the grid stays hidden until the search is typed in or tapped again. */
  const [picked, setPicked] = useState(false);
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
  /** Suggestions or matches show while the search is in use; a pick folds them away. */
  const showGrid = searching || (focused && !picked);

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

  const fillFirst = (pick: TeamPick): void => {
    const i = s.picks.findIndex((p) => p === null);
    if (i === -1) {
      return;
    }
    setPick(i, pick);
    setQuery('');
    // The grid folds away, leaving the cards. On a desktop the cursor stays in the search for
    // the next one; on a touch screen the keyboard drops so the cards are in view.
    const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
    if (fine) {
      searchRef.current?.focus();
    } else {
      searchRef.current?.blur();
    }
    setPicked(true);
  };

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

  /** The moves a pick runs, as chips coloured by type, once its pool is known. */
  const moveChips = (p: TeamPick, pool: MovePool | null) => {
    if (!pool) {
      return <span className="meta">Recommended moves</span>;
    }
    const ids = p.moves ?? pool.recommended;
    const all = [...pool.fast, ...pool.charged];
    const chip = (id: string) => {
      const m = all.find((x) => x.moveId === id);
      return (
        <span
          className="move-chip"
          key={id}
          style={
            m
              ? ({ '--c': typeColor(m.type), '--t': `var(--type-${m.type}-ink)` } as CSSProperties)
              : undefined
          }
        >
          {m?.name ?? id}
        </span>
      );
    };
    return (
      <span className="move-chips">
        {chip(ids.fast)}
        {ids.charged.map(chip)}
        {p.moves ? <span className="tag">changed</span> : null}
      </span>
    );
  };

  const movesLine = (p: TeamPick, pool: MovePool | null): string => {
    if (!pool) {
      return 'Recommended moves';
    }
    const ids = p.moves ?? pool.recommended;
    const all = [...pool.fast, ...pool.charged];
    const label = (id: string): string => all.find((m) => m.moveId === id)?.name ?? id;
    return [label(ids.fast), ...ids.charged.map(label)].join(', ');
  };

  /** What the card says about the Pokemon itself: your IVs and level, or the assumption. */
  const ownLine = (p: TeamPick): string => {
    const sp = specimenOf(p);
    if (!sp) {
      return 'Not in your collection; top-10% IVs assumed';
    }
    const build = s.verdicts[sp.id]?.build ?? null;
    const from = build && build.stageOffset > 0 ? ` · from your ${name(sp.speciesId)}` : '';
    const rank = build ? ` · IV rank top ${topPct(build.ivRank)}%` : '';
    return `${ivLine(sp.ivs)} · Level ${sp.level.max}${rank}${from}`;
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
      // A hand-made order is an order worth keeping.
      setOrderMode('given');
    }
  };

  const ready = s.picks.every(Boolean) && s.boot === 'ready' && !s.analyzing;
  const sheetPick = movesSlot !== null ? s.picks[movesSlot] : null;
  const sheetInfo = sheetPick ? pickInfo(sheetPick) : null;
  const sheetPool = sheetPick ? poolFor(sheetPick) : null;

  return (
    <div className="screen">
      <Header
        title="Build a Team"
        sub="Same breakdown your recommended teams get, for three you choose."
        onBack={() => navigate({ screen: 'teams' })}
        backLabel="Teams"
      />
      <div className="scroll" style={{ gap: 16 }}>
        <LeagueSwitcher compact />
        <input
          ref={searchRef}
          className="search"
          placeholder="Search any Pokemon"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setFocused(true);
            setPicked(false);
          }}
          onBlur={() => setFocused(false)}
          inputMode="search"
        />
        {showGrid ? (
          <div className="stack" style={{ gap: 8 }}>
            <span className="meta">{searching ? 'Matches' : 'Suggested'}</span>
            <div className="recent-row matches tall">
              {grid.map((p) => (
                <button
                  type="button"
                  className="recent-token"
                  key={p.key}
                  // Keep the search focused through the tap so the grid is still there to click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => fillFirst(p.pick)}
                  aria-label={name(p.speciesId)}
                >
                  <PokemonToken speciesId={p.speciesId} size={36} />
                  <span>{short(p.speciesId)}</span>
                  {p.mine ? <span className="tag">yours</span> : null}
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
                No collection imported. Import a Poke Genie export to include your own Pokemon here.
              </p>
            ) : null}
            {s.collection && Object.keys(s.verdicts).length === 0 ? (
              <Progress stage="verdicts" done={0} total={0} />
            ) : null}
          </div>
        ) : null}

        <div className="pick-cards">
          {s.picks.map((p, i) => {
            const info = pickInfo(p);
            const role = s.orderMode === 'best' ? `Pokemon ${i + 1}` : SLOT_LABELS[i];
            const dragStyle: CSSProperties | undefined =
              drag && drag.from === i
                ? { transform: `translateY(${drag.dy}px)`, zIndex: 3, position: 'relative' }
                : undefined;
            const overClass = drag && drag.over === i && drag.from !== i ? ' drop-target' : '';
            if (!p || !info) {
              return (
                <div
                  className={`pick-card empty${overClass}`}
                  key={SLOT_LABELS[i]}
                  aria-label={`${role}, empty`}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                >
                  <span className="opp-slot-empty" style={{ width: 44, height: 44 }}>
                    {i + 1}
                  </span>
                  <span className="pick-card-body">
                    <span className="pick-role">{role}</span>
                    <span className="small muted">Empty. Tap the search to add one.</span>
                  </span>
                </div>
              );
            }
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
                  onClick={() => setMovesSlot(movesSlot === i ? null : i)}
                  aria-label={`${info.title} moves`}
                >
                  <PokemonToken speciesId={info.speciesId} size={48} />
                  <span className="pick-card-body">
                    <span className="pick-role">{role}</span>
                    <span className="spec-name">
                      {info.title}
                      <TypeChips types={species(info.speciesId)?.types ?? []} small />
                    </span>
                    <span className="meta">{ownLine(p)}</span>
                    {moveChips(p, poolFor(p))}
                  </span>
                </button>
                <button
                  type="button"
                  className="slot-x"
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
              </div>
            );
          })}
        </div>

        <div className="chips">
          <Chip on={s.orderMode === 'best'} onClick={() => setOrderMode('best')}>
            Let pick3 pick the order
          </Chip>
          <Chip on={s.orderMode === 'given'} onClick={() => setOrderMode('given')}>
            Keep my order
          </Chip>
        </div>
        {s.analyzeError ? <div className="error">{s.analyzeError}</div> : null}
        {s.analyzing && s.progress ? (
          <Progress stage={s.progress.stage} done={s.progress.done} total={s.progress.total} />
        ) : null}
        <button type="button" className="btn" disabled={!ready} onClick={() => void analyze()}>
          {s.analyzing ? 'Analyzing...' : 'Analyze this team'}
        </button>
        <p className="meta faint" style={{ margin: 0 }}>
          Tap a card to change its moves; changes last only for this team. Your own Pokemon run with
          their real IVs at the level pick3 would build them to.
        </p>
      </div>
      {movesSlot !== null && sheetPick && sheetInfo ? (
        <>
          <div className="overlay" onClick={closeMoves} aria-hidden="true" />
          <div className="sheet" role="dialog" aria-label={`${sheetInfo.title} moves`}>
            <div className="grabber">
              <span />
            </div>
            <div className="between" style={{ padding: '4px 20px 8px' }}>
              <h3 style={{ fontSize: 19 }}>{sheetInfo.title}</h3>
              <button type="button" className="btn-ghost" onClick={closeMoves}>
                Done
              </button>
            </div>
            <div className="sheet-body">
              <span className="meta">{movesLine(sheetPick, sheetPool)}</span>
              {sheetPool ? (
                <MovePicker
                  pool={sheetPool}
                  value={sheetPick.moves ?? sheetPool.recommended}
                  onChange={(next) => setMoves(movesSlot, sheetPick, next)}
                />
              ) : (
                <Progress stage="moves" done={0} total={0} />
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
