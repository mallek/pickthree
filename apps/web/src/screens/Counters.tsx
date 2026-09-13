import type { CounterEntry, CounterMatchup } from '@pickthree/engine';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Chip,
  MetaTags,
  PokemonToken,
  Progress,
  TypeChips,
  useName,
  useSpecies,
  NoCollection,
} from '../components.tsx';
import { hashFor, useActions, useAppState } from '../state/store.tsx';
import { LeagueSwitcher, useLeague } from '../components/LeagueSwitcher.tsx';

type Own = 'all' | 'have' | 'build';

export function Counters() {
  const s = useAppState();
  const { loadCounters, navigate, setPick } = useActions();
  const league = useLeague();
  const name = useName();
  const species = useSpecies();
  const [own, setOwn] = useState<Own>('all');
  const [radar, setRadar] = useState(false);

  useEffect(() => {
    if (
      s.boot === 'ready' &&
      s.leagueInfo &&
      s.collection &&
      s.counters === null &&
      !s.countersLoading
    ) {
      void loadCounters();
    }
  }, [s.boot, s.leagueInfo, s.collection, s.counters, s.countersLoading, loadCounters]);

  if (!s.collection) {
    return (
      <div className="screen">
        <NoCollection navigate={navigate} />
      </div>
    );
  }

  let rows: CounterEntry[] = s.counters ?? [];
  if (own === 'have') {
    rows = rows.filter((c) => c.owned === 'have');
  }
  if (own === 'build') {
    rows = rows.filter((c) => c.owned !== 'none');
  }
  if (radar) {
    rows = [...rows].sort((a, b) => b.gap - a.gap || a.antiRank - b.antiRank);
  }
  const specimenSpecies = (id: string | null): string | null => {
    const sp = id ? s.collection?.specimens.find((x) => x.id === id) : undefined;
    return sp ? sp.speciesId : null;
  };
  const oppText = (m: CounterMatchup): string =>
    m.opponentRank ? `${name(m.opponent)} #${m.opponentRank}` : name(m.opponent);

  return (
    <div className="screen">
      <div className="page-head">
        <div className="between">
          <h2>Counters</h2>
          <span className="meta">vs {s.leagueInfo?.metaSize ?? '...'} meta Pokémon</span>
        </div>
        <LeagueSwitcher compact />
        <p className="meta" style={{ margin: 0 }}>
          Who beats the current {league.title} meta, weighted by how often you meet each opponent.
          Under the radar means strong against the meta but ranked lower than that suggests.
        </p>
        <div className="chips">
          <Chip on={own === 'all'} onClick={() => setOwn('all')}>
            All
          </Chip>
          <Chip on={own === 'have'} onClick={() => setOwn('have')}>
            You own
          </Chip>
          <Chip on={own === 'build'} onClick={() => setOwn('build')}>
            Own or can build
          </Chip>
          <Chip on={radar} onClick={() => setRadar((x) => !x)}>
            Under the radar
          </Chip>
        </div>
      </div>
      <div className="scroll" style={{ gap: 0, paddingTop: 4 }}>
        {s.countersLoading && !s.counters ? <Progress stage="counters" done={0} total={0} /> : null}
        {rows.map((c) => {
          const href = c.ownedSpecimenId
            ? hashFor({ screen: 'specimen', id: c.ownedSpecimenId })
            : null;
          const from = specimenSpecies(c.ownedSpecimenId);
          const inner: ReactNode = (
            <>
              <PokemonToken speciesId={c.speciesId} size={44} />
              <span style={{ minWidth: 0 }}>
                <span className="spec-name">
                  {name(c.speciesId)}
                  <TypeChips types={species(c.speciesId)?.types ?? ['normal', 'none']} small />
                </span>
                <span className="meta" style={{ display: 'block' }}>
                  #{c.antiRank} vs meta · {c.overallRank ? `#${c.overallRank} overall` : 'unranked'}
                </span>
                <MetaTags speciesId={c.speciesId} />
                {c.beats.length > 0 ? (
                  <span className="counter-line">Beats {c.beats.map(oppText).join(', ')}</span>
                ) : null}
                {c.losesTo.length > 0 ? (
                  <span className="counter-line muted">
                    Loses to {c.losesTo.map(oppText).join(', ')}
                  </span>
                ) : null}
                {c.owned === 'have' ? (
                  <span className="counter-own">You own one &rsaquo;</span>
                ) : c.owned === 'build' && from ? (
                  <span className="counter-own">Build from your {name(from)} &rsaquo;</span>
                ) : (
                  <span className="counter-own faint">Tap to build a team around it &rsaquo;</span>
                )}
              </span>
              <span className="anti">
                <b>{Math.round(c.antiMeta)}%</b>
                <small>of meta</small>
              </span>
            </>
          );
          return href ? (
            <a className="counter-row" key={c.speciesId} href={href}>
              {inner}
            </a>
          ) : (
            <button
              type="button"
              className="counter-row"
              key={c.speciesId}
              title="Build a team around it"
              onClick={() => {
                setPick(0, { kind: 'species', id: c.speciesId });
                navigate({ screen: 'build' });
              }}
            >
              {inner}
            </button>
          );
        })}
        {s.counters && rows.length === 0 ? (
          <p className="muted" style={{ padding: '32px 12px', textAlign: 'center' }}>
            Nothing here yet. Try another filter.
          </p>
        ) : null}
      </div>
    </div>
  );
}
