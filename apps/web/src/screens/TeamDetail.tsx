import { teamKey, type TeamRef } from '@pickthree/engine';
import { useState } from 'react';
import {
  GLOSSARY,
  Header,
  MoveRows,
  PokemonToken,
  ROLE_TEXT,
  StructureTag,
  Term,
  TypeChip,
  FitTag,
  MetaTags,
  RankTag,
  TypeChips,
  ShareButton,
  useMetaRank,
  useName,
} from '../components.tsx';
import { costLine, fitWhy, ivLine, num, topPct } from '../format.ts';
import { shareLink } from '../share.ts';
import { useActions, useAppState, type Route } from '../state/store.tsx';
import { picksFromTeam, teamLink } from '../teamLink.ts';

const ROLE_SHORT = { lead: 'Lead', switch: 'Switch', closer: 'Closer' } as const;

export function TeamDetail({ id }: { id: string }) {
  const s = useAppState();
  const { navigate, startSet, notify } = useActions();
  const name = useName();
  const [open, setOpen] = useState(false);
  const [allOpps, setAllOpps] = useState(false);
  const [openSafe, setOpenSafe] = useState<Set<number>>(() => new Set());
  const metaRank = useMetaRank();
  const custom = id === 'custom';
  const team = custom ? s.analysis?.team : s.recommendation?.teams.find((t) => t.id === id);
  const backRoute: Route = custom ? { screen: 'build' } : { screen: 'teams' };
  const backLabel = custom ? 'Build' : 'Teams';
  if (!team) {
    return (
      <div className="screen">
        <Header title="Team" onBack={() => navigate(backRoute)} backLabel={backLabel} />
        <div className="boot">
          <p>
            {custom
              ? 'No hand-built team yet. Pick three and analyze them.'
              : 'This team is not in the current results. Filters may have changed.'}
          </p>
          <button type="button" className="btn-ghost" onClick={() => navigate(backRoute)}>
            {custom ? 'Build a team' : 'Back to teams'}
          </button>
        </div>
      </div>
    );
  }
  const orders = ['First', 'Second', 'Third'];
  const lead = team.slots[0];
  const back = team.slots.slice(1);
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
  const structureLabel = team.structure === 'ABB' ? 'ABB line' : 'Balanced ABC';
  const a = custom ? s.analysis?.assumptions : s.recommendation?.assumptions;
  const tried = custom ? (s.analysis?.orders ?? []) : [];
  const best = custom ? (s.recommendation?.teams[0] ?? null) : null;
  const hypothetical = custom ? (s.analysis?.hypothetical ?? []) : [];
  const chosenMoves = custom ? (s.analysis?.chosenMoves ?? []) : [];
  const unranked = custom ? (s.analysis?.unranked ?? []) : [];

  /** A link to this team, species and moves only, for the share sheet or the clipboard. */
  const share = async (): Promise<void> => {
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

  /** Make this the team Your meta logs against, then go straight to Log a battle. */
  const takeToBattle = async (): Promise<void> => {
    const species = team.slots.map((x) => x.candidate.build.speciesId) as [string, string, string];
    const specimenIds = team.slots.map((x) => x.candidate.build.specimenId) as [
      string,
      string,
      string,
    ];
    const ref: TeamRef = { species, specimenIds };
    const open = s.sets.find((x) => !x.closed);
    if (open && teamKey(open.team.species) === teamKey(species)) {
      navigate({ screen: 'meta-log' });
      return;
    }
    if (open) {
      const played = open.battles.length;
      const ok = window.confirm(
        `You are running ${open.team.species.map(name).join(', ')} (${played} logged). Switch to this team?`,
      );
      if (!ok) {
        return;
      }
    }
    if (await startSet(ref)) {
      navigate({ screen: 'meta-log' });
    }
  };

  return (
    <div className="screen">
      <Header
        title="Team analysis"
        onBack={() => navigate(backRoute)}
        backLabel={backLabel}
        action={<ShareButton onClick={() => void share()} label="Share this team" />}
      />
      <div className="scroll" style={{ gap: 24 }}>
        <div className="card team-strip-card">
          <div className="team-strip-row">
            {team.slots.map((slot, i) => {
              const id = slot.candidate.build.speciesId;
              const assumed = hypothetical.includes(id);
              return (
                <div className="strip-member" key={`${id}-${i}`}>
                  <PokemonToken speciesId={id} size={48} />
                  <b>{name(id)}</b>
                  <span className="meta">{ROLE_SHORT[slot.role]}</span>
                  {custom ? (
                    <span className={`mtag${assumed ? '' : ' good'}`}>
                      {assumed ? 'assumed IVs' : 'yours'}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <span className="meta" style={{ textAlign: 'center' }}>
            {team.score.fit} fit · {structureLabel} · {team.score.difficulty} to play:{' '}
            {team.score.difficultyWhy}
          </span>
          {custom ? null : (
            <button
              type="button"
              className="btn take-to-battle"
              onClick={() => void takeToBattle()}
            >
              Take to battle
            </button>
          )}
        </div>
        {custom ? (
          <div className="card custom-note" style={{ gap: 6 }}>
            <div className="rating-row">
              <FitTag fit={team.score.fit} />
              <b>{Math.round(team.score.battle)} / 100 in battle</b>
            </div>
            <span className="small">
              {fitWhy(
                team.score.fit,
                team.score.coveredOpponents.length,
                team.score.coveredOpponents.length + team.score.uncoveredOpponents.length,
                team.score.topUncovered,
              )}
            </span>
            {s.sharedTeam ? (
              <span className="small muted">
                Shared team link.{' '}
                {hypothetical.length > 0
                  ? `IVs assumed for ${hypothetical.map((h) => name(h)).join(', ')}; the rest are yours.`
                  : 'All three are yours, so the numbers are exact.'}
              </span>
            ) : hypothetical.length > 0 ? (
              <span className="small muted">
                {hypothetical.map((h) => name(h)).join(', ')}{' '}
                {hypothetical.length === 1 ? 'is' : 'are'} not in your collection, so the numbers
                assume a top-10% IV spread rather than a perfect one.
              </span>
            ) : null}
            {best ? (
              <span className="small muted">
                Your best recommended team rates {best.score.fit.toLowerCase()} at{' '}
                {Math.round(best.score.battle)}:{' '}
                {best.slots.map((x) => name(x.candidate.build.speciesId)).join(', ')}.
              </span>
            ) : null}
            {tried.length > 1 ? (
              <>
                <b>Order</b>
                <span className="small">
                  pick3 tried all six orders. Best: {tried[0]!.names.join(', ')} at{' '}
                  {tried[0]!.total}.
                  {tried.length > 1 && tried[tried.length - 1]
                    ? ` Weakest: ${tried[tried.length - 1]!.names.join(', ')} at ${tried[tried.length - 1]!.total}.`
                    : ''}
                </span>
              </>
            ) : (
              <span className="small">Run in the order you picked.</span>
            )}
            {chosenMoves.length > 0 ? (
              <span className="small muted">
                {chosenMoves.map((h) => name(h)).join(', ')} ran the moves you chose, not the
                recommended set.
              </span>
            ) : null}
            {unranked.length > 0 ? (
              <span className="small muted">
                PvPoke does not rank {unranked.map((h) => name(h)).join(', ')} in{' '}
                {a?.leagueTitle ?? 'this league'}, so pick3 simulated{' '}
                {unranked.length === 1 ? 'it' : 'them'} against the meta on this phone. No rank
                badges; where it plays comes from those battles alone.
              </span>
            ) : null}
            <button
              type="button"
              className="btn take-to-battle"
              style={{ marginTop: 6 }}
              onClick={() => void takeToBattle()}
            >
              Take to battle
            </button>
          </div>
        ) : null}
        <div className="stack" style={{ gap: 12 }}>
          {team.slots.map((slot, i) => {
            const c = slot.candidate;
            const sp = c.build.specimen;
            const shadowFlag = c.build.shadow ? 'Shadow' : sp.lucky ? 'Lucky' : null;
            return (
              <div className="card" key={c.build.specimenId}>
                <div className="slot-card-head">
                  <PokemonToken speciesId={c.build.speciesId} size={48} />
                  <div>
                    <span className="role">
                      {orders[i]} · {ROLE_TEXT[slot.role]}
                    </span>
                    <div style={{ fontSize: 17, fontWeight: 500 }}>
                      {name(c.build.speciesId)}{' '}
                      <TypeChips types={team.explanation.slotDetail[i]!.types} small />
                    </div>
                    <MetaTags speciesId={c.build.speciesId} />
                    <div className="small muted">{slot.roleWhy}</div>
                    {team.explanation.slotDetail[i]!.formNote ? (
                      <div className="small form-note">
                        {team.explanation.slotDetail[i]!.formNote}
                      </div>
                    ) : null}
                  </div>
                </div>
                <MoveRows
                  fast={c.moveset.fast}
                  charged={c.moveset.charged}
                  reads={Object.fromEntries(
                    team.explanation.slotDetail[i]!.moveReads.map((r) => [r.moveId, r.line]),
                  )}
                />
                <div className="strategy">
                  <span className="strategy-title">Opponent charged attack strategy</span>
                  <div className="strategy-row">
                    <span>Shield</span>
                    <span className="tchips">
                      {team.explanation.slotDetail[i]!.weaknesses.map((t) => (
                        <TypeChip key={t} type={t} small />
                      ))}
                      {team.explanation.slotDetail[i]!.weaknesses.length === 0 ? (
                        <span className="small muted">the biggest one you see</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="strategy-row">
                    <span>Safe</span>
                    <span className="tchips">
                      {(openSafe.has(i)
                        ? team.explanation.slotDetail[i]!.resistances
                        : team.explanation.slotDetail[i]!.resistances.slice(0, 6)
                      ).map((t) => (
                        <TypeChip key={t} type={t} small />
                      ))}
                      {team.explanation.slotDetail[i]!.resistances.length > 6 ? (
                        <button
                          type="button"
                          className="mtag more-chip"
                          onClick={() =>
                            setOpenSafe((cur) => {
                              const next = new Set(cur);
                              if (next.has(i)) {
                                next.delete(i);
                              } else {
                                next.add(i);
                              }
                              return next;
                            })
                          }
                        >
                          {openSafe.has(i)
                            ? 'fewer'
                            : `+${team.explanation.slotDetail[i]!.resistances.length - 6} more`}
                        </button>
                      ) : null}
                      {team.explanation.slotDetail[i]!.resistances.length === 0 ? (
                        <span className="small muted">none, everything hits neutral or better</span>
                      ) : null}
                    </span>
                  </div>
                  <span className="strategy-note">
                    * Low on health and close to your own charged move? Shielding a neutral hit can
                    be worth it.
                  </span>
                </div>
                {team.explanation.slotDetail[i]!.keepShield ? (
                  <div className="small" style={{ color: 'var(--accent-text)' }}>
                    {team.explanation.slotDetail[i]!.keepShield!.line}
                  </div>
                ) : null}
                <div className="divider-top stack" style={{ gap: 4 }}>
                  <div className="kv">
                    <span className="muted">Yours</span>
                    <span>
                      {ivLine(c.build.ivs)} · Level {sp.level.max}
                      {c.build.stageOffset > 0 ? ` · from ${name(sp.speciesId)}` : ''} · IV rank top{' '}
                      {topPct(c.build.ivRank)}%
                      {shadowFlag ? (
                        <span style={{ marginLeft: 6, color: 'var(--warn)' }}>{shadowFlag}</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="kv">
                    <span className="muted">To build</span>
                    <span>
                      {c.build.level > sp.level.max
                        ? `Level ${sp.level.max} to ${c.build.level} · `
                        : 'Already at level · '}
                      {costLine(c.cost)}
                      {c.cost.secondMoveUnlock ? ' · second move unlock' : ''}
                      {c.cost.estimated ? ' (evolution candy estimated)' : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          <p className="meta">
            A move count like &ldquo;4-4-3&rdquo; is how many fast moves reach the charged move on
            its first, second and third use. An <Term term="Elite TM">{GLOSSARY['Elite TM']}</Term>{' '}
            teaches a move the Pokémon can no longer learn normally.{' '}
            <Term term="XL Candy">{GLOSSARY['XL Candy']}</Term> powers up past level 40.{' '}
            <Term term="IV rank">{GLOSSARY['IV rank']}</Term> compares your specimen with every
            possible one at this league&apos;s CP cap.
          </p>
        </div>

        <div className="stack">
          <div className="between">
            <h3>Team structure</h3>
            <StructureTag structure={team.structure} />
          </div>
          {team.structure === 'ABB' ? (
            <div className="card">
              <div className="struct-abb">
                <div className="slot">
                  <PokemonToken
                    speciesId={lead.candidate.build.speciesId}
                    size={40}
                    showInitial={false}
                  />
                  <span className="role">Lead</span>
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <span className="meta">Beaten by</span>
                  <div className="pills">
                    {team.leadCounters.slice(0, 6).map((op) => (
                      <span className="pill" key={op}>
                        <PokemonToken speciesId={op} size={18} showInitial={false} />
                        {name(op)}
                      </span>
                    ))}
                    {team.leadCounters.length === 0 ? (
                      <span className="meta">nothing in the meta</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="struct-abb divider-top" style={{ paddingTop: 12 }}>
                <div className="slot">
                  <div className="token-stack">
                    {back.map((b) => (
                      <PokemonToken
                        key={b.candidate.build.specimenId}
                        speciesId={b.candidate.build.speciesId}
                        size={40}
                        showInitial={false}
                      />
                    ))}
                  </div>
                  <span className="role">Back line</span>
                </div>
                <div style={{ fontSize: 14 }}>
                  Both your <Term term="back line">{GLOSSARY['back line']}</Term> Pokémon beat
                  these.
                  <span className="meta" style={{ display: 'block', marginTop: 4 }}>
                    {team.explanation.structureLine}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="slices">
                {team.slots.map((slot) => (
                  <div className="slice" key={slot.candidate.build.specimenId}>
                    <PokemonToken
                      speciesId={slot.candidate.build.speciesId}
                      size={32}
                      showInitial={false}
                    />
                    <span className="role">{ROLE_TEXT[slot.role]}</span>
                    <span className="meta" style={{ lineHeight: 1.3 }}>
                      beats {slot.sim.wins} of {slot.sim.results.length}
                    </span>
                  </div>
                ))}
              </div>
              <p className="meta">{team.explanation.structureLine}</p>
            </>
          )}
        </div>

        <div className="stack" style={{ gap: 4 }}>
          <h3 style={{ marginBottom: 4 }}>When to switch</h3>
          <p className="meta">
            What beats your {name(lead.candidate.build.speciesId)} lead and who answers it.
            Unanswered threats first, then the ones you meet most.
          </p>
          {team.explanation.switchPlan.length === 0 ? (
            <p className="small muted">
              Nothing in the meta group beats your lead in a 1-shield fight.
            </p>
          ) : null}
          {team.explanation.switchPlan.slice(0, 8).map((sw) => (
            <div className="switch-row" key={sw.opponent}>
              <PokemonToken speciesId={sw.opponent} size={32} showInitial={false} />
              <div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <b style={{ fontWeight: 500 }}>{sw.opponentName}</b>
                  <TypeChips types={sw.opponentTypes} small />
                  <RankTag rank={sw.opponentRank} />
                </div>
                <div className="meta">
                  {sw.to === null
                    ? 'Nobody on the team beats it. Shield, farm energy, switch on your terms.'
                    : `Switch to ${sw.toName}, ${sw.rating >= 650 ? 'wins comfortably' : sw.rating >= 550 ? 'wins' : 'edges it'}.`}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="stack">
          <h3>Key wins</h3>
          <div className="hscroll">
            {team.explanation.keyWins.map((w) => (
              <div className="mini" key={w.opponent}>
                <PokemonToken speciesId={w.opponent} size={32} showInitial={false} />
                <b>{w.opponentName}</b>
                <TypeChips types={w.opponentTypes} small />
                <RankTag rank={w.opponentRank} />
                <span>{w.line}</span>
              </div>
            ))}
          </div>
          <h3 style={{ marginTop: 8 }}>Key threats</h3>
          {team.explanation.keyThreats.length === 0 ? (
            <p className="small muted">
              Nothing in the meta group beats all three of these in the simulated scenarios. Real
              battles vary with shields and energy.
            </p>
          ) : (
            <div className="hscroll">
              {team.explanation.keyThreats.map((w) => (
                <div className="mini threat" key={w.opponent}>
                  <PokemonToken speciesId={w.opponent} size={32} showInitial={false} />
                  <b>{w.opponentName}</b>
                  <TypeChips types={w.opponentTypes} small />
                  <RankTag rank={w.opponentRank} />
                  <span>{w.line}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <h3>Why this team</h3>
          <p>{team.explanation.why}</p>
          <p className="meta">
            Score {team.score.total} of 100: coverage {team.score.factors.coverage}, consistency{' '}
            {team.score.factors.consistency}, safety {team.score.factors.safety}, cost{' '}
            {team.score.factors.cost}, accessibility {team.score.factors.accessibility}.
          </p>
        </div>

        <div className="stack" style={{ gap: 4 }}>
          <h3 style={{ marginBottom: 4 }}>Alternatives you own</h3>
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
            <span className={`chev${open ? ' open' : ''}`}>&#8964;</span>
          </button>
          {open && a ? (
            <div className="assump-body">
              <div>
                <b>Shields</b> · Lead: {a.shields.lead}. Switch: {a.shields.switch}. Closer:{' '}
                {a.shields.closer}. A <Term term="shield">{GLOSSARY['shield']}</Term> blocks one
                charged move.
              </div>
              <div>
                <b>Opponent meta</b> · {a.metaName}, {a.metaSize} Pokémon, PvPoke data from{' '}
                {a.pvpokeDate}
              </div>
              <div>
                <b>Opponent weights</b> · {a.facing}
              </div>
              <div>
                <b>IVs</b> · {a.ivs}
              </div>
              <div>
                <b>Level cap</b> · {a.levelCap}
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
                  <button
                    type="button"
                    className={`more-btn flush${allOpps ? ' on' : ''}`}
                    aria-expanded={allOpps}
                    onClick={() => setAllOpps((x) => !x)}
                  >
                    {allOpps ? 'Show fewer' : `Show all ${opps.length} meta Pokémon`}
                    <span className="more-caret">{allOpps ? '\u2303' : '\u2304'}</span>
                  </button>
                ) : null}
                <span className="meta">
                  W wins · L loses · ~ close, decided by shields. Most common opponents first.
                  Ratings out of 1000 in each slot&apos;s scenario.
                </span>
              </div>
              <div>
                <b>Total build</b> · {num(team.cost.stardust)} Stardust, {num(team.cost.candy)}{' '}
                Candy, {num(team.cost.xlCandy)} XL Candy, {team.cost.eliteTm} Elite TM
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
