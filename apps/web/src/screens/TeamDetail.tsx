import { teamKey, type TeamMoves, type TeamRef } from '@pickthree/engine';
import {
  Button,
  Chevron,
  ConfirmSheet,
  Empty,
  ErrorState,
  Header,
  IconButton,
  Term,
} from '@pickthree/ui';
import { useEffect, useState } from 'react';
import {
  CogGlyph,
  GLOSSARY,
  PokemonToken,
  Progress,
  ROLE_SHORT,
  ROLE_TEXT,
  ShareGlyph,
  useMetaRank,
  useName,
} from '../components.tsx';
import { PokemonDetails } from '../components/team/PokemonDetails.tsx';
import { ScoreCard, type CustomNotes } from '../components/team/ScoreCard.tsx';
import { KeyWins, SwitchList, Threats } from '../components/team/Threats.tsx';
import { WhyThisTeam } from '../components/team/WhyThisTeam.tsx';
import { costLine, SEP } from '../format.ts';
import { shareLink } from '../share.ts';
import { useActions, useAppState, type Route } from '../state/store.tsx';
import { picksFromTeam, teamLink } from '../teamLink.ts';

/** Smooth unless the player asked for reduced motion. */
function scrollToId(id: string): void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  document
    .getElementById(id)
    ?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
}

export function TeamDetail({ id }: { id: string }) {
  const s = useAppState();
  const { back, navigate, openSheet, startSet, notify, setPick, runRecommend } = useActions();
  const name = useName();
  const [open, setOpen] = useState(false);
  const [allOpps, setAllOpps] = useState(false);
  /** Which Pokémon details rows are open: the lead's by default. */
  const [rows, setRows] = useState<boolean[]>([true, false, false]);
  /** The running set Take to battle would replace, while the switch sheet asks. */
  const [confirming, setConfirming] = useState<{ running: string; played: number } | null>(null);
  const metaRank = useMetaRank();
  const custom = id === 'custom';
  const team = custom ? s.analysis?.team : s.recommendation?.teams.find((t) => t.id === id);
  const shared = custom && s.sharedTeam;
  /**
   * Where Back goes when pick3 has nothing behind this screen: Build for a hand-built team, Teams
   * for a recommended one and for a team link opened fresh (its landing replaced its own entry).
   */
  const fallback: Route = custom && !shared ? { screen: 'build' } : { screen: 'teams' };

  // A reload or a pasted address lands here with no recommendation in memory: run it, as Teams
  // would, rather than call the team missing. A failed run waits for Try again, so it never loops.
  useEffect(() => {
    if (
      !custom &&
      s.boot === 'ready' &&
      s.leagueInfo &&
      s.collection &&
      !s.recommending &&
      !s.recommendError &&
      s.recommendation === null
    ) {
      void runRecommend();
    }
  }, [
    custom,
    s.boot,
    s.leagueInfo,
    s.collection,
    s.recommending,
    s.recommendError,
    s.recommendation,
    runRecommend,
  ]);
  /** Still finding out whether the team exists: game data, the saved collection or the run. */
  const waiting =
    s.boot === 'loading' ||
    (custom
      ? s.analyzing
      : !s.settingsLoaded ||
        s.recommending ||
        (s.recommendation === null && s.collection !== null && !s.recommendError));

  /** A link to this team, species and moves only, for the share sheet or the clipboard. */
  const share = async (): Promise<void> => {
    if (!team) {
      return;
    }
    const url = teamLink(
      s.settings.league ?? 'great',
      picksFromTeam(
        team.slots.map((x) => ({
          speciesId: x.candidate.build.speciesId,
          fast: x.candidate.moveset.fast.moveId,
          charged: x.candidate.moveset.charged.map((m) => m.moveId),
        })),
      ),
    );
    const title = `pick3 team: ${team.slots.map((x) => name(x.candidate.build.speciesId)).join(', ')}`;
    const r = await shareLink(url, title);
    if (r === 'copied') {
      notify('Link copied. Paste it anywhere; it opens this team in pick3.');
    } else if (r === 'failed') {
      notify(`Could not copy the link. It is ${url}`);
    }
  };

  const header = (
    <Header
      variant="sub"
      title="Team Analysis"
      back={{ label: 'Back', onClick: () => back(fallback) }}
      actions={
        <>
          {team ? (
            <IconButton label="Share this team" onClick={() => void share()}>
              <ShareGlyph />
            </IconButton>
          ) : null}
          <IconButton label="Settings" onClick={openSheet}>
            <CogGlyph />
          </IconButton>
        </>
      }
    />
  );

  if (!team && (waiting || (!custom && s.recommendError))) {
    return (
      <div className="screen">
        {header}
        <div className="scroll">
          {waiting ? (
            s.progress ? (
              <Progress {...s.progress} />
            ) : (
              <Progress stage={s.boot === 'loading' ? 'boot' : 'eligibility'} done={0} total={0} />
            )
          ) : (
            <ErrorState
              line={s.recommendError ?? ''}
              action={
                <Button variant="secondary" onClick={() => void runRecommend()}>
                  Try again
                </Button>
              }
            />
          )}
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="screen">
        {header}
        <div className="scroll">
          <Empty
            line={
              custom
                ? 'No hand-built team yet. Pick three and analyze them.'
                : 'This team is not in the current results. Filters may have changed.'
            }
            action={
              <Button onClick={() => navigate({ screen: custom ? 'build' : 'teams' })}>
                {custom ? 'Build a team' : 'Back to teams'}
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const lead = team.slots[0];
  // Meta group, one row per species (PvPoke lists a few twice), most common first.
  const seenOpp = new Set<string>();
  const opps = (s.leagueInfo?.meta ?? [])
    .filter((id) => (seenOpp.has(id) ? false : (seenOpp.add(id), true)))
    .sort((a2, b2) => (metaRank(a2)?.overall ?? 9999) - (metaRank(b2)?.overall ?? 9999));
  const shownOpps = allOpps ? opps : opps.slice(0, 12);
  /** Worst rating against a species listed twice with different movesets. */
  const ratingFor = (slot: (typeof team.slots)[number], op: string): number => {
    const rs = slot.sim.results.filter((r) => r.opponent === op).map((r) => r.rating);
    return rs.length === 0 ? 500 : Math.min(...rs);
  };
  const a = custom ? s.analysis?.assumptions : s.recommendation?.assumptions;
  const best = custom ? (s.recommendation?.teams[0] ?? null) : null;
  const hypothetical = custom ? (s.analysis?.hypothetical ?? []) : [];
  const notes: CustomNotes | null =
    custom && s.analysis
      ? {
          analysis: s.analysis,
          best,
          shared,
          leagueTitle: a?.leagueTitle ?? 'this league',
        }
      : null;

  /**
   * The edit path: Build with these three loaded, ready to swap one and analyze again.
   * A hand-built team is already Build's picks; a recommended one is loaded from its builds.
   */
  const editInBuild = (): void => {
    if (!custom) {
      team.slots.forEach((slot, i) => {
        const b = slot.candidate.build;
        if (s.collection?.specimens.some((x) => x.id === b.specimenId)) {
          setPick(i, { kind: 'specimen', id: b.specimenId, asSpeciesId: b.speciesId });
        } else {
          setPick(i, { kind: 'species', id: b.speciesId });
        }
      });
    }
    navigate({ screen: 'build' });
  };

  const teamRef = (): TeamRef => {
    const species = team.slots.map((x) => x.candidate.build.speciesId) as [string, string, string];
    const specimenIds = team.slots.map((x) => x.candidate.build.specimenId) as [
      string,
      string,
      string,
    ];
    const moves = team.slots.map((x) => ({
      fast: x.candidate.moveset.fast.moveId,
      charged: x.candidate.moveset.charged.map((m) => m.moveId),
    })) as [TeamMoves | null, TeamMoves | null, TeamMoves | null];
    return { species, specimenIds, moves };
  };

  const startAndLog = async (): Promise<void> => {
    if (await startSet(teamRef())) {
      navigate({ screen: 'meta-log' });
    }
  };

  /** Make this the team Your meta logs against, then go straight to Log a battle. */
  const takeToBattle = async (): Promise<void> => {
    const species = team.slots.map((x) => x.candidate.build.speciesId);
    const running = s.sets.find((x) => !x.closed);
    if (running && teamKey(running.team.species) === teamKey(species)) {
      navigate({ screen: 'meta-log' });
      return;
    }
    if (running) {
      setConfirming({
        running: running.team.species.map(name).join(', '),
        played: running.battles.length,
      });
      return;
    }
    await startAndLog();
  };

  /** Tapping a strip member opens its row (never closes it) and brings the row into view. */
  const showMember = (i: number): void => {
    setRows((cur) => cur.map((o, j) => (j === i ? true : o)));
    scrollToId(`pokemon-${i}`);
  };

  return (
    <div className="screen">
      {header}
      <div className="scroll" style={{ gap: 24 }}>
        <ScoreCard
          team={team}
          custom={notes}
          onTakeToBattle={() => void takeToBattle()}
          onEdit={editInBuild}
          onShowMember={showMember}
        />

        <Threats team={team} gridIds={opps} />

        <SwitchList team={team} leadName={name(lead.candidate.build.speciesId)} />

        <section className="stack">
          <h3 id="pokemon" className="analysis-section">
            Pokémon details
          </h3>
          <PokemonDetails
            team={team}
            hypothetical={hypothetical}
            open={rows}
            onToggle={(i) => setRows((cur) => cur.map((o, j) => (j === i ? !o : o)))}
          />
        </section>

        <KeyWins team={team} />

        <section className="stack">
          <h3 id="details" className="analysis-section">
            Why this team
          </h3>
          <WhyThisTeam team={team} />
        </section>

        <div className="stack" style={{ gap: 4 }}>
          <h3 className="analysis-section" style={{ marginBottom: 4 }}>
            Alternatives you own
          </h3>
          {team.explanation.alternatives.map((alt) => (
            <div className="alt-row" key={`${alt.slot}-${alt.candidate.build.specimenId}`}>
              <PokemonToken
                speciesId={alt.candidate.build.speciesId}
                size={36}
                showInitial={false}
              />
              <div>
                <div className="meta">
                  Instead of {name(team.slots[alt.slot].candidate.build.speciesId)} as{' '}
                  {ROLE_TEXT[alt.role]}
                </div>
                <div style={{ fontSize: 14 }}>{alt.line}</div>
              </div>
            </div>
          ))}
          {team.explanation.alternatives.length === 0 ? (
            <p className="small muted">No other Pokémon in your collection fits these slots yet.</p>
          ) : null}
        </div>

        <div className="assump">
          <button
            type="button"
            className="assump-head"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <span>Assumptions and detail</span>
            <Chevron dir={open ? 'up' : 'down'} />
          </button>
          {open && a ? (
            <div className="assump-body">
              <div>
                <b>Shields</b>
                {SEP}Lead: {a.shields.lead}. Switch: {a.shields.switch}. Closer: {a.shields.closer}.
                A <Term term="shield">{GLOSSARY['shield']}</Term> blocks one charged move.
              </div>
              <div>
                <b>Opponent meta</b>
                {SEP}
                {a.metaName}, {a.metaSize} Pokémon, PvPoke data from {a.pvpokeDate}
              </div>
              <div>
                <b>Opponent weights</b>
                {SEP}
                {a.facing}
              </div>
              <div>
                <b>IVs</b>
                {SEP}
                {a.ivs}
              </div>
              <div>
                <b>Level cap</b>
                {SEP}
                {a.levelCap}
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <b>Matchup grid</b>
                <div className="ogrid">
                  <div className="ogrid-head">
                    <span />
                    {team.slots.map((slot) => (
                      <span className="ogrid-col" key={slot.candidate.build.specimenId}>
                        <PokemonToken
                          speciesId={slot.candidate.build.speciesId}
                          size={28}
                          showInitial={false}
                        />
                        <span>{ROLE_SHORT[slot.role]}</span>
                      </span>
                    ))}
                  </div>
                  {shownOpps.map((op) => (
                    <div className="ogrid-row" key={op}>
                      <span className="ogrid-opp">
                        <PokemonToken speciesId={op} size={22} showInitial={false} />
                        <span className="ogrid-name">{name(op)}</span>
                        {metaRank(op)?.overall ? (
                          <span className="ogrid-rank">#{metaRank(op)!.overall}</span>
                        ) : null}
                      </span>
                      {team.slots.map((slot) => {
                        const r = ratingFor(slot, op);
                        const cls = r > 550 ? 'w' : r < 450 ? 'l' : 'c';
                        return (
                          <span
                            className={`cell ${cls}`}
                            key={slot.candidate.build.specimenId}
                            title={`${r}`}
                          >
                            {cls === 'w' ? 'W' : cls === 'l' ? 'L' : '~'}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {opps.length > 12 ? (
                  <Button
                    variant="text"
                    ariaExpanded={allOpps}
                    onClick={() => setAllOpps((x) => !x)}
                  >
                    {allOpps ? 'Show fewer' : `Show all ${opps.length} meta Pokémon`}
                  </Button>
                ) : null}
                <span className="meta">
                  W wins{SEP}L loses{SEP}~ close, decided by shields. Most common opponents first.
                  Ratings out of 1000 in each slot&apos;s scenario.
                </span>
              </div>
              <div>
                <b>Total build</b>
                {SEP}
                {costLine(team.cost)}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {confirming ? (
        <ConfirmSheet
          title="Switch teams?"
          line={`You are running ${confirming.running} (${confirming.played}\u00a0logged). Switch to this team?`}
          confirmLabel="Switch"
          cancelLabel="Keep it"
          onConfirm={() => {
            setConfirming(null);
            void startAndLog();
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </div>
  );
}
