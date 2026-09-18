/**
 * The teams leaderboard: the three-Pokemon teams reporters ran themselves, each with a win rate,
 * a confidence badge and a deep link that opens the same team in pick3. There is no PvPoke
 * fallback here (see the header comment on Overview.tsx for the two-sources rule): PvPoke
 * publishes no team records, so an empty list simply says so rather than borrowing Overview's
 * baseline.
 *
 * See docs/superpowers/specs/2026-09-18-meta-site-design.md, "Honesty rules": a win rate is
 * never shown without the margin sentence that says how much to trust it, and the confidence
 * badge is that same judgement of the decided battles behind the rate, not the team's raw count.
 */
import type { ReactNode } from 'react';
import type { MetaSummaryV1, TeamStats } from '../api.js';
import { ConfidenceDot, Chevron, SpriteStack, Term } from '../components.js';
import { speciesOf, type StaticData } from '../data.js';
import { battles as battlesText, count } from '../format.js';
import { teamLink, type LinkMember } from '../links.js';
import type { Query } from '../route.js';
import { MANY, SOME, marginSentence, winRate } from '../stats.js';
import type { Loaded } from '../useMeta.js';
import { Contribute } from './Overview.js';

/** The members `teamLink` wants: each species id, with its most common moveset when the record
 * has enough battles behind it to name one. `team.moves` is aligned with `team.species` by
 * position; a missing or null entry means pick3 should fill in its own recommended set. */
function membersOf(team: TeamStats): LinkMember[] {
  return team.species.map((speciesId, i): LinkMember => {
    const mv = team.moves[i];
    return mv ? { speciesId, moves: { fast: mv.fast, charged: mv.charged } } : { speciesId };
  });
}

function TeamRow({ team, data, league }: { team: TeamStats; data: StaticData; league: string }) {
  const species = team.species.map((id) => speciesOf(data, id));
  const label = species.map((s) => s.short).join(' + ');
  const rate = winRate(team.wins, team.losses);
  const decided = team.wins + team.losses;
  // The badge and the margin are honestly about decided battles (marginSentence's contract), but
  // team.battles is the number a reader wants for popularity. Printing only one of them lets the
  // two disagree silently, e.g. "300 battles" next to a "some" dot under a legend that calls 300
  // "many": the reader has no way to tell that the badge is counting something narrower. Naming
  // the decided count whenever it differs is what keeps the two numbers legible together.
  const countLine =
    decided < team.battles
      ? `${battlesText(team.battles)}, ${count(decided)} decided`
      : battlesText(team.battles);
  return (
    // .card is a flex column by default now (app.css); this row packs four dense sub-rows
    // (sprites, count/rate, the margin sentence, the link), so it keeps its own tighter 8px
    // gap instead of the card default 12px, rather than doubling up on both.
    <div className="card" style={{ gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SpriteStack species={species} />
        <span className="name">{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="fine">{countLine}</span>
        <span>{rate === null ? 'no result yet' : `${Math.round(rate * 100)}%`}</span>
        <ConfidenceDot n={decided} />
      </div>
      {rate !== null ? <p className="fine">{marginSentence(rate, decided)}</p> : null}
      <a className="btn btn-secondary" href={teamLink(league, membersOf(team))}>
        Open in pick3 <Chevron />
      </a>
    </div>
  );
}

export function Teams(p: {
  league: string;
  query: Query;
  data: StaticData;
  meta: Loaded<MetaSummaryV1>;
  now: Date;
}): ReactNode {
  const { league, data, meta } = p;

  if (meta.state === 'error') {
    return (
      <main>
        <p className="sub">Could not load the shared teams. Try again in a moment.</p>
      </main>
    );
  }

  if (!meta.data) {
    return (
      <main>
        <p className="sub">Loading</p>
      </main>
    );
  }

  const teams = meta.data.teams;

  return (
    <main>
      <section>
        {/* A1: this used to be App.tsx's centred page title; the switcher and filter chips above
            already say which league and window, so this is a plain left-aligned heading now,
            the same job pick3's own screens give a bare `h2`. */}
        <h2>Most run teams</h2>
        {/* A3: this was a standing line of thresholds ("few under 30, some 30 to 300, many 300
         * or more") ahead of every card. Each card already names its own confidence in a word
         * (ConfidenceDot); the exact cut points are reference material for a reader who wants
         * them, not something everyone needs to read past to reach the first team, so they move
         * behind a tap rather than staying printed above the list. */}
        <p className="fine">
          <Term term="What few, some and many mean">
            Few is under {count(SOME)} decided battles, some is {count(SOME)} to {count(MANY)},
            many is {count(MANY)} or more.
          </Term>
        </p>
        {teams.length === 0 ? (
          <>
            <p className="sub">No teams shared in this window yet.</p>
            <Contribute devices={meta.data.devices} />
          </>
        ) : (
          <>
            {teams.map((team) => (
              <TeamRow key={team.species.join('+')} team={team} data={data} league={league} />
            ))}
            <p className="fine">Win rate is the reporters&apos; own result with this team.</p>
            <p className="fine">Small samples swing a lot; the badge says how much to trust it.</p>
          </>
        )}
      </section>
    </main>
  );
}
