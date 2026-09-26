import {
  DEFAULT_PROFILE_OPTIONS,
  seasonListStale,
  yourMetaStats,
  type BattleSet,
  type LoggedBattle,
  type SeasonStats,
  type SpeciesRecord,
  type TeamRecord,
} from '@pickthree/engine';
import {
  Button,
  Chevron,
  ConfirmSheet,
  Header,
  IconButton,
  MeasuredLine,
  progressPercent,
} from '@pickthree/ui';
import { useEffect, useMemo, useState } from 'react';
import {
  CogGlyph,
  MetaGlyph,
  META_URL,
  PokemonToken,
  Seg,
  useLogCount,
  useName,
  useSticky,
} from '../components.tsx';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { dateLabel } from '../format.ts';
import { shareEnabled } from '../metaShare.ts';
import { shareLink } from '../share.ts';
import { teamLink } from '../teamLink.ts';
import { contributedCount } from '../state/contribution.ts';
import { hashFor, useActions, useAppState } from '../state/store.tsx';
import { facingSettings } from '../state/facing.ts';
import { storage } from '../storage/db.ts';

type Sort = 'faced' | 'losses';

function record(wins: number, losses: number): string {
  return `${wins}-${losses}`;
}

function battlesWord(n: number): string {
  return `${n} ${n === 1 ? 'battle' : 'battles'}`;
}

/** A battle's own time, for a result with no opponents logged: "Sep 15, 10:05 AM". */
function when(at: string): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Progress to the 15 battles, said once on the page. Under 15: the count, what is left and the
 * bar; from 15: that the meta is weighting, with a full bar. When the log is not the Teams source,
 * the state line alone.
 */
function ProgressLine() {
  const s = useAppState();
  const logCount = useLogCount();
  const min = DEFAULT_PROFILE_OPTIONS.minBattles;
  if (facingSettings(s.settings).source !== 'log') {
    return (
      <p className="meta ym-line">
        Pick &quot;Your meta&quot; as the Source on Teams to weight teams by these battles.
      </p>
    );
  }
  const pct = progressPercent(logCount, min);
  return (
    <>
      <p className="meta ym-line">
        {logCount >= min
          ? `Your meta is weighting Teams, Counters and Build · ${logCount} battles this season`
          : `${logCount} of ${min} battles · ${min - logCount} more until your meta weights Teams, Counters and Build`}
      </p>
      <div
        className="ui-progress-bar"
        role="progressbar"
        aria-label="Battles toward your meta"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

/**
 * What the player's battles add to the community meta: a measured count (pink) of sent battles
 * across every league and season, tanked left out. Sharing off and nothing sent yet are plain
 * text, never pink.
 */
function Contribution() {
  const s = useAppState();
  const { openSheet } = useActions();
  const sharing = shareEnabled(s.settings);
  const [sent, setSent] = useState<number | null>(null);
  // Every league's sets, not only the league in play; read again whenever this league's change
  // (a save or a share stamp both land there).
  useEffect(() => {
    let live = true;
    void storage.loadAllSets().then((all) => {
      if (live) {
        setSent(contributedCount(all));
      }
    });
    return () => {
      live = false;
    };
  }, [s.sets]);
  if (!sharing) {
    return (
      <p className="meta ym-line ym-share-off">
        <span>Sharing is off</span>
        <Button variant="text" onClick={openSheet}>
          Settings
        </Button>
      </p>
    );
  }
  if (sent === null) {
    return null;
  }
  if (sent === 0) {
    return <p className="meta ym-line">Your battles join the community meta as you log them</p>;
  }
  return (
    <MeasuredLine>
      {sent === 1
        ? '1 of your battles is in the community meta'
        : `${sent} of your battles are in the community meta`}
    </MeasuredLine>
  );
}

function resultWord(b: LoggedBattle): 'Win' | 'Loss' | 'Tanked' {
  return b.tanked ? 'Tanked' : b.result === 'win' ? 'Win' : 'Loss';
}

/** The last few results with this team, newest last: each a button that opens it for editing. */
function ResultStrip({ set }: { set: BattleSet }) {
  const { navigate } = useActions();
  const name = useName();
  const recent = set.battles.slice(-10);
  if (recent.length === 0) {
    return <span className="small muted">No battles logged yet.</span>;
  }
  return (
    <>
      <span className="result-strip" role="group" aria-label="Recent results">
        {recent.map((b) => {
          const word = resultWord(b);
          const label =
            b.opponents.length > 0
              ? `${word} against ${b.opponents.map(name).join(', ')}`
              : `${word}, ${when(b.at)}`;
          return (
            <button
              type="button"
              className={`result-chip ${word.toLowerCase()}`}
              key={b.id}
              aria-label={label}
              title={label}
              // One letter is too short for axe to judge; test/contrast.test.ts checks it.
              data-audit-contrast="static"
              onClick={() => navigate({ screen: 'meta-log', edit: { set: set.id, battle: b.id } })}
            >
              <span aria-hidden="true">{word[0]}</span>
            </button>
          );
        })}
      </span>
      <span className="meta">Tap a result to fix it</span>
    </>
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
      notify('Link copied. Paste it anywhere; it opens this team in pick3.', 'info');
    } else if (r === 'failed') {
      notify(`Could not copy the link. It is ${url}`);
    }
  };
  // The record is wins and losses: a tanked battle stays in the strip and counts for nothing.
  const counted = set.battles.filter((b) => !b.tanked);
  const wins = counted.filter((b) => b.result === 'win').length;
  return (
    <div className="card set-card">
      <div className="between">
        <b>Current team</b>
        <span className="meta">
          {counted.length === 0
            ? `since ${dateLabel(set.startedAt)}`
            : `${record(wins, counted.length - wins)} since ${dateLabel(set.startedAt)}`}
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
      <ResultStrip set={set} />
      <Button variant="primary" onClick={() => navigate({ screen: 'meta-log' })}>
        Log a battle
      </Button>
      <div className="ym-team-actions">
        <Button variant="text" onClick={() => navigate({ screen: 'meta-new' })}>
          Change team
        </Button>
        <Button variant="text" onClick={() => void share()}>
          Share this team
        </Button>
      </div>
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
      <Button variant="primary" onClick={() => navigate({ screen: 'meta-new' })}>
        Pick your team
      </Button>
    </div>
  );
}

function SpeciesRows({
  rows,
  outside,
}: {
  rows: SpeciesRecord[];
  outside: (id: string) => boolean;
}) {
  const name = useName();
  const max = Math.max(1, ...rows.map((r) => r.faced));
  if (rows.length === 0) {
    return <p className="muted small">Nothing logged yet.</p>;
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      {rows.map((r) => {
        const out = outside(r.speciesId);
        const rec = record(r.wins, r.losses);
        return (
          <a
            className="faced-row"
            key={r.speciesId}
            href={hashFor({ screen: 'counters', vs: r.speciesId })}
            aria-label={`Who beats ${name(r.speciesId)}: faced ${r.faced}, ${rec}${out ? ", outside PvPoke's meta group" : ''}`}
          >
            <PokemonToken speciesId={r.speciesId} size={36} />
            <span className="faced-name">
              <span className="faced-title">
                <span className="spec-name">{name(r.speciesId)}</span>
                {out ? (
                  <span className="faced-out" aria-hidden="true">
                    †
                  </span>
                ) : null}
              </span>
              <span className="meta">faced {r.faced}</span>
            </span>
            <b className="faced-rec">{rec}</b>
            <span className="faced-go">
              Who beats it
              <Chevron />
            </span>
            <span
              className="faced-bar"
              aria-hidden="true"
              style={{ width: `${(r.faced / max) * 100}%` }}
            />
          </a>
        );
      })}
    </div>
  );
}

/** The mark's meaning, said once under the list that first shows it. */
function OutsideLegend({ size }: { size: number }) {
  return (
    <p className="meta faced-legend">
      <span aria-hidden="true">† </span>
      Outside PvPoke&apos;s {size}: logged here, simulated on this phone.
    </p>
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
          <span className="meta">{battlesWord(t.battles)}</span>
          <b>{record(t.wins, t.losses)}</b>
        </button>
      ))}
    </div>
  );
}

function sorted(stats: SeasonStats, sort: Sort): SpeciesRecord[] {
  return sort === 'losses'
    ? [...stats.species].sort((a, b) => b.losses - a.losses || b.faced - a.faced)
    : stats.species;
}

export function YourMeta() {
  const s = useAppState();
  const { startFresh, openSheet } = useActions();
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
  const min = DEFAULT_PROFILE_OPTIONS.minBattles;
  const stale = seasonListStale(seasons);
  const [sort, setSort] = useSticky<Sort>('meta.sort', 'faced');
  const [explained, setExplained] = useSticky('meta.explained', false);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false);
  // Before the league's meta group loads, nothing is marked: an empty group would mark every row.
  const inMeta = useMemo(() => new Set(meta), [meta]);
  const outside = (id: string): boolean => inMeta.size > 0 && !inMeta.has(id);
  const hasOutside = (b: SeasonStats): boolean => b.species.some((r) => outside(r.speciesId));
  const legendInCurrent = hasOutside(stats.current);
  const legendInEarlier = !legendInCurrent && earlierOpen && stats.earlier.some(hasOutside);
  const sharing = shareEnabled(s.settings);

  return (
    <div className="screen">
      <div className="page-head">
        <Header
          variant="top"
          title="Your Meta"
          actions={
            <>
              <IconButton label="meta.pick3.gg, the community meta" href={META_URL}>
                <MetaGlyph />
              </IconButton>
              <IconButton label="Settings" onClick={openSheet}>
                <CogGlyph />
              </IconButton>
            </>
          }
        />
        <LeagueSwitcher />
        <ProgressLine />
        <Contribution />
      </div>
      <div className="scroll" style={{ gap: 18 }}>
        {stale ? (
          <div className="card" style={{ borderColor: 'var(--warn-tint)', gap: 8 }}>
            <span className="small">The season list may be out of date.</span>
            <Button onClick={() => setConfirmFresh(true)}>Start fresh</Button>
          </div>
        ) : null}
        {confirmFresh ? (
          <ConfirmSheet
            title="Start fresh?"
            line="Battles before now move to Earlier seasons. Nothing is deleted."
            confirmLabel="Start fresh"
            cancelLabel="Cancel"
            onConfirm={() => {
              setConfirmFresh(false);
              startFresh();
            }}
            onCancel={() => setConfirmFresh(false)}
          />
        ) : null}
        {!explained ? (
          <div className="card explainer">
            <button
              type="button"
              className="card-x"
              aria-label="Dismiss"
              onClick={() => setExplained(true)}
            >
              &times;
            </button>
            <span className="small">
              {`Once you log ${min} battles, Teams, Counters and Build weigh opponents by how often you face them. Your collection never leaves this phone; battle records are shared anonymously unless you turn sharing off in Settings.`}
            </span>
          </div>
        ) : null}
        {stats.openSet ? <CurrentTeam set={stats.openSet} /> : <NoTeam />}
        <a className="action-row" href={META_URL}>
          <b>See what everyone else is facing</b>
          <span className="chev">
            <Chevron />
          </span>
        </a>
        <div className="stack" style={{ gap: 8 }}>
          <div className="between ym-list-head">
            <span className="meta">
              {stats.current.label} · {battlesWord(stats.current.battles)}
            </span>
            <Seg
              value={sort}
              onChange={setSort}
              options={[
                { value: 'faced', label: 'Most faced' },
                { value: 'losses', label: 'Worst record' },
              ]}
            />
          </div>
          <SpeciesRows rows={sorted(stats.current, sort)} outside={outside} />
          {legendInCurrent ? <OutsideLegend size={meta.length} /> : null}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <b>Your teams</b>
          <TeamRows rows={stats.current.teams} />
        </div>
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
              <span className="chev">
                <Chevron dir={earlierOpen ? 'down' : 'right'} />
              </span>
            </button>
            {earlierOpen
              ? stats.earlier.map((b) => (
                  <div className="card" key={b.label} style={{ gap: 12 }}>
                    <div className="between">
                      <b>{b.label}</b>
                      <span className="meta">{battlesWord(b.battles)}</span>
                    </div>
                    <SpeciesRows rows={sorted(b, sort)} outside={outside} />
                    <TeamRows rows={b.teams} />
                  </div>
                ))
              : null}
            {legendInEarlier ? <OutsideLegend size={meta.length} /> : null}
          </div>
        ) : null}
        <p className="meta ym-foot">
          {sharing
            ? 'Your collection stays on this phone. Battle sharing is on and anonymous; change it in Settings.'
            : 'Battle sharing is off; change it in Settings.'}
        </p>
      </div>
    </div>
  );
}
