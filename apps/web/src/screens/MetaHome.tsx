import {
  yourMetaStats,
  type BattleSet,
  type SeasonStats,
  type SpeciesRecord,
} from '@pickthree/engine';
import type { Board, BoardRow, SpeciesRow } from '@pickthree/engine/meta';
import {
  Button,
  Chevron,
  ConfirmSheet,
  ErrorState,
  Header,
  IconButton,
  Loading,
  Switch,
  Tag,
} from '@pickthree/ui';
import { useEffect, useMemo, useState } from 'react';
import { CogGlyph, PokemonToken, Seg, useName, useSticky } from '../components.tsx';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import {
  battlesWord,
  Contribution,
  isRunLeague,
  ProgressLine,
  record,
  setRecord,
  SpeciesRows,
  useShareTeam,
} from '../components/meta/LogPieces.tsx';
import { shareEnabled } from '../metaShare.ts';
import { seasonsFor } from '../state/seasonsFor.ts';
import { hashFor, useActions, useAppState } from '../state/store.tsx';
import { useMetaRanking, useTopTeams } from '../state/useMeta.ts';
import { storage } from '../storage/db.ts';
import { STOP_LINE } from './settings/Community.tsx';

/** The landing always reads the default window and every source; the full lists carry controls. */
const READ = { window: 'meta', source: 'all' } as const;
const FAILED = 'Could not load the community meta.';

type Sort = 'faced' | 'losses';

function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** A whole percent, but a share that is not zero never reads "0%". */
function sharePct(share: number): string {
  if (share <= 0) {
    return '0%';
  }
  const whole = Math.round(share * 100);
  return whole === 0 ? '<1%' : `${whole}%`;
}

/** A measured share inline in a row: pink text led by the bar mark, never a pill. */
function Share({ value }: { value: string }) {
  return (
    <span className="ui-measured-num mh-share">
      <svg className="ui-measured-bars" width={9} height={9} viewBox="0 0 11 11" aria-hidden="true">
        <rect x="0" y="6" width="3" height="5" rx="1" />
        <rect x="4" y="0" width="3" height="11" rx="1" />
        <rect x="8" y="3" width="3" height="8" rx="1" />
      </svg>
      {value}
    </span>
  );
}

function Failed({ retry }: { retry: () => void }) {
  return <ErrorState line={FAILED} action={<Button onClick={retry}>Try again</Button>} />;
}

/**
 * Most seen: the top five by blended weight. A league nobody has shared battles in is PvPoke's
 * group order alone, with no share and no pink, since nothing was measured.
 */
function MostSeen({ league }: { league: string }) {
  const name = useName();
  const ranked = useMetaRanking(league, { ...READ, community: true });
  const data = ranked.data;
  let body;
  // Nothing measured: the list is PvPoke's order, so the subtitle must not claim a share.
  let sub = 'Share of reported battles';
  if (ranked.state === 'error' || data?.offline) {
    body = <Failed retry={ranked.retry} />;
  } else if (!data) {
    body = <Loading label="Loading the community meta" />;
  } else {
    const measured = data.ranking.battles > 0;
    if (!measured) {
      sub = "PvPoke's meta group. No battles shared yet.";
    }
    const byId = new Map(data.ranking.rows.map((r) => [r.speciesId, r]));
    const top = data.order
      .slice(0, 5)
      .map((id) => byId.get(id))
      .filter((r): r is SpeciesRow => r !== undefined);
    body = (
      <div>
        {top.map((r) => (
          <a
            className="mh-seen"
            key={r.speciesId}
            href={hashFor({ screen: 'species', id: r.speciesId })}
          >
            <PokemonToken speciesId={r.speciesId} size={36} showInitial={false} />
            <span className="mh-seen-name">
              <span>{name(r.speciesId)}</span>
              <span className="mh-bar" aria-hidden="true">
                <span style={{ width: `${r.barPct}%` }} />
              </span>
            </span>
            {measured && r.share !== null ? <Share value={sharePct(r.share)} /> : <span />}
            <span className="mh-go">
              <Chevron />
            </span>
          </a>
        ))}
      </div>
    );
  }
  return (
    <div className="mh-card">
      <div className="mh-card-head">
        <b>Most seen Pokémon</b>
        <span className="meta">{sub}</span>
      </div>
      {body}
      <a className="mh-more" href={hashFor({ screen: 'collection' })}>
        Explore Pokémon <Arrow />
      </a>
    </div>
  );
}

/**
 * The board's complete teams in its own order, cores opened up into their builds, each team
 * once. Teams trainers logged as their own come first; when fewer than `n` have been, the baked
 * generated teams fill in, marked Projected.
 */
export function loggedTeams(board: Board, n: number): BoardRow[] {
  const flat: BoardRow[] = [];
  const seen = new Set<string>();
  for (const row of board.rows) {
    for (const t of row.kind === 'team' ? [row] : row.builds) {
      const key = t.species.join('+');
      if (!seen.has(key)) {
        seen.add(key);
        flat.push(t);
      }
    }
  }
  const logged = flat.filter((t) => t.source === 'observed' && t.runBattles > 0);
  const projected = flat.filter((t) => t.source === 'generated');
  return [...logged, ...projected].slice(0, n);
}

function MostLogged({ league, caption }: { league: string; caption: boolean }) {
  const name = useName();
  const { navigate, setPick } = useActions();
  const board = useTopTeams(league, READ);
  const openInBuild = (t: BoardRow): void => {
    (t.order ?? t.species).forEach((id, i) => setPick(i, { kind: 'species', id }));
    navigate({ screen: 'build' });
  };
  let body;
  if (board.state === 'error') {
    body = <Failed retry={board.retry} />;
  } else if (!board.data) {
    body = <Loading label="Loading the community meta" />;
  } else {
    const rows = loggedTeams(board.data, 2);
    body =
      rows.length === 0 ? (
        <p className="meta">No teams logged yet.</p>
      ) : (
        <>
          {rows.map((t) => {
            const projected = t.source === 'generated';
            const names = t.species.map(name).join(', ');
            const rec = record(t.runWins, t.runLosses);
            return (
              <button
                type="button"
                className="team-row"
                key={t.species.join('+')}
                aria-label={
                  projected
                    ? `${names}: projected`
                    : `${names}: ${battlesWord(t.runBattles)}, ${rec}`
                }
                onClick={() => openInBuild(t)}
              >
                <span className="row" style={{ gap: 4 }}>
                  {t.species.map((id) => (
                    <PokemonToken speciesId={id} size={32} showInitial={false} key={id} />
                  ))}
                </span>
                {projected ? (
                  <>
                    <span />
                    <Tag>Projected</Tag>
                  </>
                ) : (
                  <>
                    <span className="meta">{battlesWord(t.runBattles)}</span>
                    <b>{rec}</b>
                  </>
                )}
              </button>
            );
          })}
          {caption ? (
            <span className="meta">
              {rows.some((t) => t.source === 'observed')
                ? 'Results from trainers logging their own teams.'
                : "Projected from PvPoke's meta group until players log teams."}
            </span>
          ) : null}
        </>
      );
  }
  return (
    <div className="mh-card">
      <div className="mh-card-head">
        <b>Most logged teams</b>
      </div>
      {body}
      <a className="mh-more" href={hashFor({ screen: 'meta-teams' })}>
        Explore teams <Arrow />
      </a>
    </div>
  );
}

/** The same switch as Settings: turning it off deletes what this phone sent, so it confirms. */
function ShareSwitch() {
  const s = useAppState();
  const { setShareEnabled } = useActions();
  const [confirmStop, setConfirmStop] = useState(false);
  return (
    <>
      <Switch
        label="Share battles anonymously"
        checked={shareEnabled(s.settings)}
        onChange={(next) => {
          if (next) {
            void setShareEnabled(true);
            return;
          }
          setConfirmStop(true);
        }}
      />
      {confirmStop ? (
        <ConfirmSheet
          title="Stop sharing?"
          line={STOP_LINE}
          confirmLabel="Stop and delete"
          cancelLabel="Keep sharing"
          tone="danger"
          onConfirm={() => {
            setConfirmStop(false);
            void setShareEnabled(false);
          }}
          onCancel={() => setConfirmStop(false)}
        />
      ) : null}
    </>
  );
}

function HelpBuild({ open }: { open: BattleSet | undefined }) {
  const { navigate } = useActions();
  return (
    <div className="mh-card mh-accent">
      <div className="mh-card-head">
        <b>Help build the meta</b>
        <span className="meta">
          Log your team, opponents and result to add to the community picture.
        </span>
      </div>
      <ShareSwitch />
      <Button
        variant="primary"
        onClick={() => navigate(open ? { screen: 'meta-log' } : { screen: 'meta-new' })}
      >
        Log a battle
      </Button>
      <span className="meta mh-center">No collection import needed.</span>
    </div>
  );
}

function YourContribution({ open }: { open: BattleSet | undefined }) {
  const { navigate } = useActions();
  const name = useName();
  const shareTeam = useShareTeam();
  const rec = open ? setRecord(open) : null;
  return (
    <div className="mh-card mh-accent">
      <div className="mh-card-head">
        <b>Your contribution</b>
      </div>
      <Contribution />
      <ShareSwitch />
      {open && rec ? (
        <>
          <div className="between">
            <b>Current team</b>
            <b>{record(rec.wins, rec.losses)}</b>
          </div>
          <div className="mh-team3">
            {open.team.species.map((id) => (
              <span key={id}>
                <PokemonToken speciesId={id} size={52} showInitial={false} />
                <span className="small">{name(id)}</span>
              </span>
            ))}
          </div>
          <Button variant="primary" onClick={() => navigate({ screen: 'meta-log' })}>
            Log a battle
          </Button>
          <div className="ym-team-actions">
            <Button variant="text" onClick={() => navigate({ screen: 'meta-new' })}>
              Change team
            </Button>
            <Button variant="text" onClick={() => void shareTeam(open)}>
              Share team
            </Button>
          </div>
        </>
      ) : (
        <>
          <b>No team picked</b>
          <span className="small muted">
            Pick the three you are running and log battles as you play.
          </span>
          <Button variant="primary" onClick={() => navigate({ screen: 'meta-new' })}>
            Pick your team
          </Button>
        </>
      )}
    </div>
  );
}

function sorted(stats: SeasonStats, sort: Sort): SpeciesRecord[] {
  return sort === 'losses'
    ? [...stats.species].sort((a, b) => b.losses - a.losses || b.faced - a.faced)
    : stats.species;
}

/** Your meta with a log: this run or season's count, the progress box and the top two faced. */
function YourMeta() {
  const s = useAppState();
  const run = isRunLeague(s);
  const leagueId = s.settings.league ?? 'great';
  const seasons = seasonsFor(s.data, leagueId);
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
  const [sort, setSort] = useSticky<Sort>('meta.sort', 'faced');
  const inMeta = useMemo(() => new Set(meta), [meta]);
  const outside = (id: string): boolean => inMeta.size > 0 && !inMeta.has(id);
  return (
    <div className="mh-card">
      <div className="between mh-card-head">
        <b>Your meta</b>
        <span className="meta">
          {battlesWord(stats.current.battles)} this {run ? 'run' : 'season'}
        </span>
      </div>
      <div className="mh-progress">
        <ProgressLine />
      </div>
      <Seg
        value={sort}
        onChange={setSort}
        options={[
          { value: 'faced', label: 'Most faced' },
          { value: 'losses', label: 'Worst record' },
        ]}
      />
      <SpeciesRows rows={sorted(stats.current, sort).slice(0, 2)} outside={outside} />
      <a className="mh-more" href={hashFor({ screen: 'meta-battles' })}>
        View your battle history <Arrow />
      </a>
    </div>
  );
}

function EmptyYourMeta() {
  return (
    <div className="mh-card">
      <div className="mh-card-head">
        <b>Your meta</b>
      </div>
      <p className="meta mh-empty">Your battle history will appear here.</p>
    </div>
  );
}

/**
 * Meta, the tab root: what trainers are facing (community, read because the player opened it),
 * then either a first visit's invitation to log or the player's own contribution and meta. The
 * community cards fail on their own; the personal cards come from this phone and never wait.
 */
export function MetaHome() {
  const s = useAppState();
  const { openSheet } = useActions();
  const league = s.settings.league ?? 'great';
  const open = s.sets.find((x) => !x.closed);
  // A first visit is no battle sets in any league, not only the one in play.
  const [anySets, setAnySets] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void storage.loadAllSets().then((all) => {
      if (live) {
        setAnySets(all.length > 0);
      }
    });
    return () => {
      live = false;
    };
  }, [s.sets]);
  // Wait for this league's sets too, so the open team is known before the card is drawn.
  const known = s.setsLoaded && anySets !== null;
  const hasLog = s.sets.length > 0 || anySets === true;

  return (
    <div className="screen">
      <div className="page-head">
        <Header
          variant="top"
          title="Meta"
          actions={
            <IconButton label="Settings" onClick={openSheet}>
              <CogGlyph />
            </IconButton>
          }
        />
        <LeagueSwitcher />
      </div>
      <div className="scroll" style={{ gap: 14 }}>
        <div>
          <h2 className="mh-title">What trainers are facing</h2>
          <p className="meta mh-sub">A community snapshot, built from shared battle logs.</p>
        </div>
        {/* The saved league, not the default, is the one to read: wait for settings. */}
        {s.settingsLoaded ? <MostSeen league={league} /> : null}
        {!known || !s.settingsLoaded ? null : hasLog ? (
          <>
            <YourContribution open={open} />
            <YourMeta />
            <MostLogged league={league} caption={false} />
          </>
        ) : (
          <>
            <MostLogged league={league} caption={true} />
            <HelpBuild open={open} />
            <EmptyYourMeta />
          </>
        )}
        <p className="meta mh-center">Community data reflects shared logs.</p>
      </div>
    </div>
  );
}
