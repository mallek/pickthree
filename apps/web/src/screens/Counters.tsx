import type { CounterEntry, CounterMatchup } from '@pickthree/engine';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Chip,
  HeadCog,
  MetaTags,
  PokemonToken,
  Progress,
  TypeChips,
  useName,
  useSpecies,
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
  /** Species to score against instead of the whole meta, from the Your meta most-faced rows. */
  const vs = s.route.screen === 'counters' ? (s.route.vs ?? null) : null;
  const stale = s.counters === null || s.countersVs !== vs;

  // The collection only marks what you own; the meta itself needs no import.
  useEffect(() => {
    if (s.boot === 'ready' && s.leagueInfo && stale && !s.countersLoading) {
      void loadCounters(vs);
    }
  }, [s.boot, s.leagueInfo, stale, s.countersLoading, loadCounters, vs]);

  const counters = stale ? null : s.counters;
  let rows: CounterEntry[] = counters?.entries ?? [];
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
        {vs ? (
          <button
            type="button"
            className="back"
            style={{ marginBottom: -6 }}
            onClick={() => navigate({ screen: 'meta' })}
          >
            &lsaquo; Your meta
          </button>
        ) : null}
        <div className="between">
          <h2>{vs ? `Who beats ${name(vs)}` : 'Counters'}</h2>
          <span className="row">
            {vs ? null : (
              <span className="meta">vs {s.leagueInfo?.metaSize ?? '...'} meta Pokémon</span>
            )}
            <HeadCog />
          </span>
        </div>
        <LeagueSwitcher compact />
        {vs ? (
          <p className="meta" style={{ margin: 0 }}>
            {counters?.vs?.simulated
              ? `The top ${counters.vs.simulated} ranked ${league.title} species`
              : `Every ranked ${league.title} species`}{' '}
            that wins at least one of the three shield scenarios against {name(vs)}, best first.{' '}
            <a href={hashFor({ screen: 'counters' })}>Back to the whole meta</a>
          </p>
        ) : (
          <p className="meta" style={{ margin: 0 }}>
            Who beats the current {league.title} meta, weighted by how often you meet each opponent.
            Under the radar means strong against the meta but ranked lower than that suggests.
          </p>
        )}
        {counters ? (
          <p className="meta" style={{ margin: 0 }}>
            {counters.facing}.
          </p>
        ) : null}
        {s.collection ? null : (
          <p className="meta" style={{ margin: 0 }}>
            <a href={hashFor({ screen: 'welcome' })}>Import your collection</a> and pick3 marks the
            ones you own or can build.
          </p>
        )}
        <div className="chips">
          <Chip on={own === 'all'} onClick={() => setOwn('all')}>
            All
          </Chip>
          {s.collection ? (
            <>
              <Chip on={own === 'have'} onClick={() => setOwn('have')}>
                You own
              </Chip>
              <Chip on={own === 'build'} onClick={() => setOwn('build')}>
                Own or can build
              </Chip>
            </>
          ) : null}
          <Chip on={radar} onClick={() => setRadar((x) => !x)}>
            Under the radar
          </Chip>
        </div>
      </div>
      <div className="scroll" style={{ gap: 0, paddingTop: 4 }}>
        {s.countersLoading && !counters ? (
          s.countersProgress ? (
            <Progress
              stage={s.countersProgress.stage}
              done={s.countersProgress.done}
              total={s.countersProgress.total}
            />
          ) : (
            <Progress stage="counters" done={0} total={0} />
          )
        ) : null}
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
                  {vs ? `#${c.antiRank} vs ${name(vs)}` : `#${c.antiRank} vs meta`} ·{' '}
                  {c.overallRank ? `#${c.overallRank} overall` : 'unranked'}
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
                <small>{vs ? 'of fights' : 'of meta'}</small>
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
        {counters && rows.length === 0 ? (
          <p className="muted" style={{ padding: '32px 12px', textAlign: 'center' }}>
            {counters.vs && !counters.vs.inMeta
              ? `PvPoke does not rank ${name(counters.vs.speciesId)} in ${league.title}, so pick3 has no moveset to simulate it with.`
              : 'Nothing here yet. Try another filter.'}
          </p>
        ) : null}
      </div>
    </div>
  );
}
