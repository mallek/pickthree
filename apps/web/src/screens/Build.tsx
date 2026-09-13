import type { Specimen, TeamPick, VerdictLabel } from '@pickthree/engine';
import { useEffect, useMemo, useState } from 'react';
import {
  Chip,
  Header,
  MetaTags,
  PokemonToken,
  Progress,
  TypeChips,
  VerdictChip,
  useMetaRank,
  useName,
  useSpecies,
} from '../components.tsx';
import { useActions, useAppState } from '../state/store.tsx';
import { rankLabel } from './Collection.tsx';

const SLOT_LABELS = ['Lead', 'Safe Switch', 'Closer'] as const;
const ORDER: Record<VerdictLabel, number> = {
  'Great League ready': 0,
  'Worth building': 1,
  'Wait for better IVs': 2,
  'Not eligible': 3,
  'Needs rescan': 4,
};

/** Hand-pick three Pokémon, from the collection or any species at top-10% IVs, and analyze them. */
export function Build() {
  const s = useAppState();
  const { navigate, setPick, setOrderMode, analyze, loadVerdicts } = useActions();
  const name = useName();
  const species = useSpecies();
  const metaRank = useMetaRank();
  const [slot, setSlot] = useState<number | null>(null);
  const [source, setSource] = useState<'mine' | 'any'>(s.collection ? 'mine' : 'any');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (
      s.boot === 'ready' &&
      s.collection &&
      Object.keys(s.verdicts).length === 0 &&
      !s.verdictsLoading &&
      !s.verdictsError
    ) {
      void loadVerdicts();
    }
  }, [s.boot, s.collection, s.verdicts, s.verdictsLoading, s.verdictsError, loadVerdicts]);

  const q = query.trim().toLowerCase();
  const picked = new Set(s.picks.map((p) => p?.id));

  const mine = useMemo(() => {
    if (!s.collection) {
      return [];
    }
    const rankOf = (sp: Specimen): number => s.verdicts[sp.id]?.build?.ivRank.rank ?? 99_999;
    return s.collection.specimens
      .filter((sp) => {
        const v = s.verdicts[sp.id];
        if (!sp.ivs || v?.label === 'Not eligible' || v?.label === 'Needs rescan') {
          return false;
        }
        if (q) {
          const stage = v?.build?.speciesId ?? sp.speciesId;
          return (
            name(sp.speciesId).toLowerCase().includes(q) || name(stage).toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const oa = s.verdicts[a.id] ? ORDER[s.verdicts[a.id]!.label] : 9;
        const ob = s.verdicts[b.id] ? ORDER[s.verdicts[b.id]!.label] : 9;
        return oa - ob || rankOf(a) - rankOf(b);
      })
      .slice(0, 60);
  }, [s.collection, s.verdicts, q, name]);

  const any = useMemo(() => {
    const ids = s.data?.analyzable ?? [];
    return ids
      .filter((id) => !q || name(id).toLowerCase().includes(q))
      .sort((a, b) => (metaRank(a)?.overall ?? 9999) - (metaRank(b)?.overall ?? 9999))
      .slice(0, 60);
  }, [s.data, q, name, metaRank]);

  const choose = (pick: TeamPick): void => {
    if (slot === null) {
      return;
    }
    setPick(slot, pick);
    setSlot(null);
    setQuery('');
  };

  const pickLabel = (
    p: TeamPick | null,
  ): { title: string; sub: string; speciesId: string } | null => {
    if (!p) {
      return null;
    }
    if (p.kind === 'species') {
      return { title: name(p.id), sub: 'Top 10% IVs, not one you own', speciesId: p.id };
    }
    const sp = s.collection?.specimens.find((x) => x.id === p.id);
    if (!sp) {
      return { title: 'Missing', sub: 'No longer in your collection', speciesId: '' };
    }
    const v = s.verdicts[sp.id];
    const stage = v?.build?.speciesId ?? sp.speciesId;
    return {
      title: name(stage),
      sub: `Your ${stage === sp.speciesId ? '' : `${name(sp.speciesId)}, `}CP ${sp.cp} · ${rankLabel(sp, v)}`,
      speciesId: stage,
    };
  };

  const ready = s.picks.every(Boolean) && s.boot === 'ready' && !s.analyzing;

  return (
    <div className="screen">
      <Header
        title="Build a team"
        sub="Same breakdown your recommended teams get, for three you choose."
        onBack={() => navigate({ screen: 'teams' })}
        backLabel="Teams"
      />
      <div className="scroll" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 10 }}>
          {s.picks.map((p, i) => {
            const info = pickLabel(p);
            const open = slot === i;
            return (
              <button
                type="button"
                key={SLOT_LABELS[i]}
                className={`pick-slot${open ? ' open' : ''}`}
                onClick={() => setSlot(open ? null : i)}
              >
                <span className="pick-role">
                  {s.orderMode === 'best' ? `Pokémon ${i + 1}` : SLOT_LABELS[i]}
                </span>
                {info ? (
                  <span className="pick-body">
                    <PokemonToken speciesId={info.speciesId} size={40} />
                    <span style={{ minWidth: 0 }}>
                      <span className="spec-name">
                        {info.title}
                        {info.speciesId ? (
                          <TypeChips types={species(info.speciesId)?.types ?? []} small />
                        ) : null}
                      </span>
                      <span className="meta" style={{ display: 'block' }}>
                        {info.sub}
                      </span>
                    </span>
                    <span className="pick-change">Change</span>
                  </span>
                ) : (
                  <span className="pick-empty">Tap to choose</span>
                )}
              </button>
            );
          })}
        </div>

        {slot !== null ? (
          <div className="picker card" style={{ gap: 10 }}>
            <div className="seg" aria-label="Source">
              <span
                className={source === 'mine' ? 'on' : ''}
                onClick={() => setSource('mine')}
                role="button"
                tabIndex={0}
              >
                Your Pokémon
              </span>
              <span
                className={source === 'any' ? 'on' : ''}
                onClick={() => setSource('any')}
                role="button"
                tabIndex={0}
              >
                Any Pokémon
              </span>
            </div>
            <input
              className="search"
              placeholder={source === 'mine' ? 'Search your Pokémon' : 'Search all Pokémon'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              inputMode="search"
              autoFocus
            />
            {source === 'mine' && !s.collection ? (
              <p className="small muted" style={{ margin: 0 }}>
                No collection imported. Pick from Any Pokémon, or import a Poke Genie export first.
              </p>
            ) : null}
            {source === 'mine' && s.collection && Object.keys(s.verdicts).length === 0 ? (
              <Progress stage="verdicts" done={0} total={0} />
            ) : null}
            <div className="picker-list">
              {source === 'mine'
                ? mine.map((sp) => {
                    const v = s.verdicts[sp.id];
                    const stage = v?.build?.speciesId ?? sp.speciesId;
                    const taken = picked.has(sp.id);
                    return (
                      <button
                        type="button"
                        className="spec-row"
                        key={sp.id}
                        disabled={taken}
                        onClick={() => choose({ kind: 'specimen', id: sp.id })}
                      >
                        <PokemonToken speciesId={stage} size={40} />
                        <span style={{ minWidth: 0 }}>
                          <span className="spec-name">
                            {name(stage)}
                            {sp.shadow ? <span className="shadow-flag">Shadow</span> : null}
                          </span>
                          <span className="meta" style={{ display: 'block' }}>
                            {stage !== sp.speciesId ? `From your ${name(sp.speciesId)} · ` : ''}
                            CP {sp.cp} · {rankLabel(sp, v)}
                            {taken ? ' · picked' : ''}
                          </span>
                        </span>
                        {v ? <VerdictChip label={v.label} /> : <span className="meta">...</span>}
                      </button>
                    );
                  })
                : any.map((id) => {
                    const taken = picked.has(id);
                    return (
                      <button
                        type="button"
                        className="spec-row"
                        key={id}
                        disabled={taken}
                        onClick={() => choose({ kind: 'species', id })}
                      >
                        <PokemonToken speciesId={id} size={40} />
                        <span style={{ minWidth: 0 }}>
                          <span className="spec-name">
                            {name(id)}
                            <TypeChips types={species(id)?.types ?? []} small />
                          </span>
                          <MetaTags speciesId={id} />
                        </span>
                        <span className="meta small">{taken ? 'picked' : 'top 10% IVs'}</span>
                      </button>
                    );
                  })}
              {(source === 'mine' ? mine.length : any.length) === 0 && q ? (
                <p className="muted small" style={{ padding: '16px 0', textAlign: 'center' }}>
                  Nothing matches.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

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
          them to.
        </p>
      </div>
    </div>
  );
}
