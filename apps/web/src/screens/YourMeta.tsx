import {
  DEFAULT_PROFILE_OPTIONS,
  seasonListStale,
  yourMetaStats,
  type BattleSet,
  type SeasonStats,
  type SpeciesRecord,
  type TeamRecord,
} from '@pickthree/engine';
import { useMemo, useState } from 'react';
import {
  HeadCog,
  MetaButton,
  PokemonToken,
  Seg,
  useLogCount,
  useName,
  useSticky,
} from '../components.tsx';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { dateLabel } from '../format.ts';
import { shareLink } from '../share.ts';
import { teamLink } from '../teamLink.ts';
import { hashFor, useActions, useAppState } from '../state/store.tsx';
import { facingSettings } from '../state/facing.ts';

type Sort = 'faced' | 'losses';

function record(wins: number, losses: number): string {
  return `${wins}-${losses}`;
}

/** The last few results with this team, newest last, as one chip each. */
function ResultStrip({ battles }: { battles: BattleSet['battles'] }) {
  const recent = battles.slice(-10);
  if (recent.length === 0) {
    return <span className="small muted">No battles logged yet.</span>;
  }
  return (
    <span className="result-strip" aria-label="Recent results">
      {recent.map((b) => (
        <span
          className={`result-chip ${b.tanked ? 'tanked' : b.result === 'win' ? 'win' : 'loss'}`}
          key={b.id}
          title={b.tanked ? 'Tanked' : b.result === 'win' ? 'Win' : 'Loss'}
        >
          {b.tanked ? 'T' : b.result === 'win' ? 'W' : 'L'}
        </span>
      ))}
    </span>
  );
}

function CurrentTeam({ set }: { set: BattleSet }) {
  const { navigate, notify } = useActions();
  const name = useName();
  const share = async (): Promise<void> => {
    const url = teamLink(
      set.league,
      set.team.species.map((speciesId) => ({ speciesId })),
    );
    const r = await shareLink(url, `pick3 team: ${set.team.species.map(name).join(', ')}`);
    if (r === 'copied') {
      notify('Link copied. Paste it anywhere; it opens this team in pick3.');
    } else if (r === 'failed') {
      notify(`Could not copy the link. It is ${url}`);
    }
  };
  const counted = set.battles.filter((b) => !b.tanked);
  const wins = counted.filter((b) => b.result === 'win').length;
  return (
    <div className="card set-card">
      <div className="between">
        <b>Current team</b>
        <span className="meta">
          {counted.length === 0
            ? `since ${dateLabel(set.startedAt)}`
            : `${wins}-${counted.length - wins} since ${dateLabel(set.startedAt)}`}
        </span>
      </div>
      <div className="row" style={{ gap: 10 }}>
        {set.team.species.map((id) => (
          <span className="row" key={id} style={{ gap: 6 }}>
            <PokemonToken speciesId={id} size={28} showInitial={false} />
            <span className="small">{name(id)}</span>
          </span>
        ))}
      </div>
      <ResultStrip battles={set.battles} />
      <div className="btn-pair">
        <button type="button" className="btn" onClick={() => navigate({ screen: 'meta-log' })}>
          Log a battle
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => navigate({ screen: 'meta-new' })}
        >
          Change team
        </button>
      </div>
      <button type="button" className="link-btn" onClick={() => void share()}>
        Share this team
      </button>
    </div>
  );
}

function NoTeam() {
  const { navigate } = useActions();
  return (
    <div className="card set-card" style={{ gap: 10 }}>
      <b>No team picked</b>
      <span className="small muted">
        Pick the three you are running and log battles as you play.
      </span>
      <button type="button" className="btn" onClick={() => navigate({ screen: 'meta-new' })}>
        Pick your team
      </button>
    </div>
  );
}

function SpeciesRows({ rows, meta }: { rows: SpeciesRecord[]; meta: string[] }) {
  const name = useName();
  const max = Math.max(1, ...rows.map((r) => r.faced));
  if (rows.length === 0) {
    return <p className="muted small">Nothing logged yet.</p>;
  }
  return (
    <div className="stack" style={{ gap: 4 }}>
      {rows.map((r) => (
        <a
          className="faced-row"
          key={r.speciesId}
          href={hashFor({ screen: 'counters', vs: r.speciesId })}
          aria-label={`Who beats ${name(r.speciesId)}`}
        >
          <span className="faced-bar" style={{ width: `${(r.faced / max) * 100}%` }} />
          <PokemonToken speciesId={r.speciesId} size={36} />
          <span style={{ minWidth: 0 }}>
            <span className="row" style={{ gap: 6 }}>
              <span className="spec-name">{name(r.speciesId)}</span>
              {meta.includes(r.speciesId) ? null : (
                <span
                  className="verdict"
                  style={{ background: 'var(--warn-tint)', color: 'var(--warn)' }}
                >
                  outside the meta {meta.length}
                </span>
              )}
            </span>
            <span className="meta" style={{ display: 'block' }}>
              faced {r.faced}
            </span>
          </span>
          <b>{record(r.wins, r.losses)}</b>
          <span className="chev">&rsaquo;</span>
        </a>
      ))}
    </div>
  );
}

function TeamRows({ rows }: { rows: TeamRecord[] }) {
  const s = useAppState();
  const { navigate, setPick } = useActions();
  const openInBuild = (t: TeamRecord): void => {
    t.team.species.forEach((id, i) => {
      const specimenId = t.team.specimenIds?.[i];
      if (specimenId && s.collection?.specimens.some((x) => x.id === specimenId)) {
        setPick(i, { kind: 'specimen', id: specimenId, asSpeciesId: id });
      } else {
        setPick(i, { kind: 'species', id });
      }
    });
    navigate({ screen: 'build' });
  };
  if (rows.length === 0) {
    return <p className="muted small">No sets yet.</p>;
  }
  return (
    <div className="stack" style={{ gap: 4 }}>
      {rows.map((t) => (
        <button type="button" className="team-row" key={t.key} onClick={() => openInBuild(t)}>
          <span className="row" style={{ gap: 4 }}>
            {t.team.species.map((id) => (
              <PokemonToken speciesId={id} size={32} showInitial={false} key={id} />
            ))}
          </span>
          <span className="meta">
            {t.battles} {t.battles === 1 ? 'battle' : 'battles'}
          </span>
          <b>{record(t.wins, t.losses)}</b>
        </button>
      ))}
    </div>
  );
}

function Bucket({ stats, meta, sort }: { stats: SeasonStats; meta: string[]; sort: Sort }) {
  const species =
    sort === 'losses'
      ? [...stats.species].sort((a, b) => b.losses - a.losses || b.faced - a.faced)
      : stats.species;
  return (
    <>
      <div className="stack" style={{ gap: 8 }}>
        <div className="between">
          <b>Most faced</b>
          <span className="meta">
            {stats.battles} {stats.battles === 1 ? 'battle' : 'battles'}
          </span>
        </div>
        <SpeciesRows rows={species} meta={meta} />
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <b>Your teams</b>
        <TeamRows rows={stats.teams} />
      </div>
    </>
  );
}

export function YourMeta() {
  const s = useAppState();
  const { startFresh } = useActions();
  const logCount = useLogCount();
  const leagueId = s.settings.league ?? 'great';
  const seasons = s.data?.seasons ?? [];
  const freshFrom = s.settings.yourMeta?.freshFrom?.[leagueId] ?? null;
  const meta = s.leagueInfo?.meta ?? [];
  const fallback = useMemo(() => {
    const ranks = s.leagueInfo?.metaRanks ?? {};
    return [...meta].sort((a, b) => (ranks[a]?.overall ?? 999) - (ranks[b]?.overall ?? 999));
  }, [meta, s.leagueInfo]);
  const stats = useMemo(
    () => yourMetaStats({ sets: s.sets, seasons, freshFrom, fallback }),
    [s.sets, seasons, freshFrom, fallback],
  );
  const blendOn = facingSettings(s.settings).source === 'log';
  const min = DEFAULT_PROFILE_OPTIONS.minBattles;
  const stale = seasonListStale(seasons);
  const [sort, setSort] = useSticky<Sort>('meta.sort', 'faced');
  const [explained, setExplained] = useSticky('meta.explained', false);
  const [earlierOpen, setEarlierOpen] = useState(false);

  return (
    <div className="screen">
      <div className="page-head">
        <div className="between">
          <h2>Your Meta</h2>
          <span className="row">
            <MetaButton />
            <HeadCog />
          </span>
        </div>
        <LeagueSwitcher compact />
        <p className="log-status meta" style={{ margin: 0 }}>
          {!blendOn
            ? 'Pick "Your meta" as the Source on Teams to weight teams by these battles.'
            : logCount >= min
              ? `Weighting Teams and Counters by ${logCount} battles this season.`
              : `${logCount} of ${min} battles until your log weights Teams and Counters.`}
        </p>
        {blendOn && logCount < min ? (
          <div className="log-bar">
            <span style={{ width: `${Math.min(100, (logCount / min) * 100)}%` }} />
          </div>
        ) : null}
      </div>
      <div className="scroll" style={{ gap: 18 }}>
        {stale ? (
          <div className="card" style={{ borderColor: 'var(--warn-tint)', gap: 8 }}>
            <span className="small">The season list may be out of date.</span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (
                  window.confirm(
                    'Start fresh? Battles before now move to Earlier seasons. Nothing is deleted.',
                  )
                ) {
                  startFresh();
                }
              }}
            >
              Start fresh
            </button>
          </div>
        ) : null}
        {!explained ? (
          <div className="card explainer" style={{ gap: 8, position: 'relative' }}>
            <button
              type="button"
              className="card-x"
              aria-label="Dismiss"
              onClick={() => setExplained(true)}
            >
              &times;
            </button>
            <span className="small" style={{ paddingRight: 22 }}>
              Once you log {min} battles, Teams and Counters weigh opponents by how often you
              actually face them. Your log never leaves this phone.
            </span>
          </div>
        ) : null}
        {stats.openSet ? <CurrentTeam set={stats.openSet} /> : <NoTeam />}
        <a className="action-row" href="https://meta.pick3.gg">
          <span>
            <b>See what everyone else is facing</b>
            <span className="small muted">
              meta.pick3.gg turns shared battle logs like this one into the community's most-faced
              Pokemon and teams, by league and rank.
            </span>
          </span>
          <span className="chev">&rsaquo;</span>
        </a>
        <div className="between">
          <span className="meta">{stats.current.label}</span>
          <Seg
            value={sort}
            onChange={setSort}
            options={[
              { value: 'faced', label: 'Most faced' },
              { value: 'losses', label: 'Worst record' },
            ]}
          />
        </div>
        <Bucket stats={stats.current} meta={meta} sort={sort} />
        {stats.earlier.length > 0 ? (
          <div className="stack" style={{ gap: 10 }}>
            <button type="button" className="action-row" onClick={() => setEarlierOpen((o) => !o)}>
              <span>
                <b>Earlier seasons</b>
                <span className="small muted">
                  {stats.earlier.length} {stats.earlier.length === 1 ? 'bucket' : 'buckets'}, kept
                  apart because the meta changes each season.
                </span>
              </span>
              <span className="chev">{earlierOpen ? <>&#8964;</> : <>&rsaquo;</>}</span>
            </button>
            {earlierOpen
              ? stats.earlier.map((b) => (
                  <div className="card" key={b.label} style={{ gap: 12 }}>
                    <b>{b.label}</b>
                    <Bucket stats={b} meta={meta} sort={sort} />
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
