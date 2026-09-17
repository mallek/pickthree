import type { MoveIds, MovePool, Specimen, TeamPick, VerdictLabel } from '@pickthree/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Chip,
  Header,
  PokemonToken,
  Progress,
  useName,
  useShortName,
  useSpecies,
  useSpeciesSearch,
} from '../components.tsx';
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
  const { navigate, setPick, setOrderMode, analyze, loadVerdicts, movePool } = useActions();
  const name = useName();
  const short = useShortName();
  const species = useSpecies();
  const [query, setQuery] = useState('');
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

  const mine = useMemo(() => {
    if (parsed.length === 0 || !s.collection) {
      return [];
    }
    const moves = s.data?.moves;
    const rankOf = (sp: Specimen): number => s.verdicts[sp.id]?.build?.ivRank.rank ?? 99_999;
    const seen = new Set<string>();
    return s.collection.specimens
      .filter((sp) => {
        const v = s.verdicts[sp.id];
        if (!sp.ivs || v?.label === 'Not eligible' || v?.label === 'Needs rescan') {
          return false;
        }
        const stage = v?.build?.speciesId ?? sp.speciesId;
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
      .sort((a, b) => {
        const oa = s.verdicts[a.id] ? ORDER[s.verdicts[a.id]!.label] : 9;
        const ob = s.verdicts[b.id] ? ORDER[s.verdicts[b.id]!.label] : 9;
        return oa - ob || rankOf(a) - rankOf(b);
      })
      .filter((sp) => {
        const stage = s.verdicts[sp.id]?.build?.speciesId ?? sp.speciesId;
        if (seen.has(stage)) {
          return false;
        }
        seen.add(stage);
        return true;
      })
      .slice(0, 30);
  }, [s.collection, s.verdicts, s.data, parsed, name, species]);

  /** Collection matches first, then the rest of the species search, for the search grid. */
  const picksGrid = useMemo(() => {
    if (!query.trim()) {
      return [];
    }
    const mineStages = new Set(
      mine.map((sp) => s.verdicts[sp.id]?.build?.speciesId ?? sp.speciesId),
    );
    const fromMine = mine.map((sp) => {
      const stage = s.verdicts[sp.id]?.build?.speciesId ?? sp.speciesId;
      return {
        key: sp.id,
        speciesId: stage,
        pick: { kind: 'specimen', id: sp.id } as TeamPick,
        mine: true,
      };
    });
    const others = hits
      .filter((id) => !mineStages.has(id))
      .map((id) => ({
        key: id,
        speciesId: id,
        pick: { kind: 'species', id } as TeamPick,
        mine: false,
      }));
    return [...fromMine, ...others];
  }, [query, mine, hits, s.verdicts]);

  const fillFirst = (pick: TeamPick): void => {
    const i = s.picks.findIndex((p) => p === null);
    if (i === -1) {
      return;
    }
    setPick(i, pick);
    setQuery('');
  };

  const pickInfo = (p: TeamPick | null): { title: string; speciesId: string } | null => {
    if (!p) {
      return null;
    }
    if (p.kind === 'species') {
      return { title: name(p.id), speciesId: p.id };
    }
    const sp = s.collection?.specimens.find((x) => x.id === p.id);
    if (!sp) {
      return { title: 'Missing', speciesId: '' };
    }
    const stage = s.verdicts[sp.id]?.build?.speciesId ?? sp.speciesId;
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
    const sp = s.collection?.specimens.find((x) => x.id === p.id);
    if (!sp) {
      return null;
    }
    const stage = s.verdicts[sp.id]?.build?.speciesId ?? sp.speciesId;
    return { speciesId: stage, current: sp.currentMoves };
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

  const movesLine = (p: TeamPick, pool: MovePool | null): string => {
    if (!pool) {
      return 'Recommended moves';
    }
    const ids = p.moves ?? pool.recommended;
    const all = [...pool.fast, ...pool.charged];
    const label = (id: string): string => all.find((m) => m.moveId === id)?.name ?? id;
    return [label(ids.fast), ...ids.charged.map(label)].join(', ');
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

  const ready = s.picks.every(Boolean) && s.boot === 'ready' && !s.analyzing;
  const sheetPick = movesSlot !== null ? s.picks[movesSlot] : null;
  const sheetInfo = sheetPick ? pickInfo(sheetPick) : null;
  const sheetPool = sheetPick ? poolFor(sheetPick) : null;

  return (
    <div className="screen">
      <Header
        title="Build a team"
        sub="Same breakdown your recommended teams get, for three you choose."
        onBack={() => navigate({ screen: 'teams' })}
        backLabel="Teams"
      />
      <div className="scroll" style={{ gap: 16 }}>
        <LeagueSwitcher compact />
        <input
          className="search"
          placeholder="Search any Pokemon"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputMode="search"
        />
        {query.trim() ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="recent-row matches tall">
              {picksGrid.map((p) => (
                <button
                  type="button"
                  className="recent-token"
                  key={p.key}
                  onClick={() => fillFirst(p.pick)}
                  aria-label={name(p.speciesId)}
                >
                  <PokemonToken speciesId={p.speciesId} size={36} />
                  <span>{short(p.speciesId)}</span>
                  {p.mine ? <span className="tag">yours</span> : null}
                </button>
              ))}
            </div>
            {picksGrid.length === 0 ? (
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

        <div className="opp-slots">
          {s.picks.map((p, i) => {
            const info = pickInfo(p);
            const role = s.orderMode === 'best' ? `Pokemon ${i + 1}` : SLOT_LABELS[i];
            return (
              <div className="stack" style={{ alignItems: 'center', gap: 6 }} key={SLOT_LABELS[i]}>
                <span className="pick-role">{role}</span>
                <div className="slot-wrap">
                  {info ? (
                    <button
                      type="button"
                      className="opp-slot filled"
                      onClick={() => setMovesSlot(movesSlot === i ? null : i)}
                      aria-label={`${info.title} moves`}
                    >
                      <PokemonToken speciesId={info.speciesId} size={56} />
                      <span className="small">{info.title}</span>
                      {p?.moves ? <span className="small muted">moves changed</span> : null}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="opp-slot"
                      disabled
                      aria-label={`${role}, empty`}
                    >
                      <span className="opp-slot-empty" style={{ width: 56, height: 56 }}>
                        {i + 1}
                      </span>
                      <span className="small muted">Empty</span>
                    </button>
                  )}
                  {info ? (
                    <button
                      type="button"
                      className="slot-x"
                      aria-label={`Remove ${info.title}`}
                      onClick={() => removePick(i)}
                    >
                      &times;
                    </button>
                  ) : null}
                </div>
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
          Pokémon picked by species run at a top-10% IV spread, the kind you would realistically
          find, not the perfect one. Your own run with their real IVs at the level pick3 would build
          them to. Each runs its recommended moves unless you change them here, and changes last
          only for this team.
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
