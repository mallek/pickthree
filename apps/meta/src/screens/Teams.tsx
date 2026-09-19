/**
 * The teams leaderboard: the three-Pokemon teams reporters ran themselves, each with a win rate,
 * a confidence badge and a deep link that opens the same team in pick3. There is no PvPoke
 * fallback here (see the header comment on Overview.tsx for the two-sources rule): PvPoke
 * publishes no team records, so an empty list simply says so rather than borrowing Overview's
 * baseline.
 *
 * See docs/superpowers/specs/2026-09-18-meta-site-design.md, "Honesty rules": a win rate is
 * never shown without its confidence tag, that same judgement of the decided battles behind the
 * rate rather than the team's raw count (FIX 4: C3 moved the trust judgement here, out of a
 * margin sentence that used to run under every card; the sentence itself now only appears on a
 * 'few'-confidence card, where the tag alone is not enough to say how wide the real range is).
 */
import type { ReactNode } from 'react';
import type { MetaSummaryV1, TeamStats } from '../api.js';
import { ConfidenceTag, Chevron, Sprite, Term } from '../components.js';
import { speciesOf, type StaticData } from '../data.js';
import { battles as battlesText, count } from '../format.js';
import { teamLink, type LinkMember } from '../links.js';
import type { Query } from '../route.js';
import { MANY, SOME, confidence, marginSentence, winRate } from '../stats.js';
import type { Loaded } from '../useMeta.js';
import { Contribute } from './Pokemon.js';

/** The members `teamLink` wants: each species id, with its most common moveset when the record
 * has enough battles behind it to name one. `team.moves` is aligned with `team.species` by
 * position; a missing or null entry means pick3 should fill in its own recommended set. */
function membersOf(team: TeamStats): LinkMember[] {
  return team.species.map((speciesId, i): LinkMember => {
    const mv = team.moves[i];
    return mv ? { speciesId, moves: { fast: mv.fast, charged: mv.charged } } : { speciesId };
  });
}

function TeamCard({ team, data, league }: { team: TeamStats; data: StaticData; league: string }) {
  const species = team.species.map((id) => speciesOf(data, id));
  const rate = winRate(team.wins, team.losses);
  const decided = team.wins + team.losses;
  const conf = confidence(decided);
  // The badge and the margin are honestly about decided battles (marginSentence's contract), but
  // team.battles is the number a reader wants for popularity. Printing only one of them lets the
  // two disagree silently, e.g. "300 battles" next to a "some" tag under a legend that calls 300
  // "many": the reader has no way to tell that the badge is counting something narrower. Naming
  // the decided count whenever it differs is what keeps the two numbers legible together.
  const countLine =
    decided < team.battles
      ? `${battlesText(team.battles)}, ${count(decided)} decided`
      : battlesText(team.battles);
  return (
    // C2: the whole card is the link, straight to the pick3 deep link; the foot's "Open in
    // pick3" is plain text, not a second <a>, since an <a> inside an <a> is invalid markup and
    // screen readers handle it badly. That leaves exactly one focusable element per card.
    <a className="team-card" href={teamLink(league, membersOf(team))}>
      {/* C1: three tokens with the name under each (pick3's .slots3/.slot/.slot-name), replacing
          the overlapping sprite cluster and the "A + B + C" line it used to sit next to: the
          names live here now, so a second copy of them would only repeat, and repeating them is
          what wrapped and truncated on a three-word team name at phone width. */}
      <div className="slots3">
        {species.map((s) => (
          <div className="slot" key={s.id}>
            <Sprite species={s} size={52} />
            <span className="slot-name">{s.short}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="fine">{countLine}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{rate === null ? 'no result yet' : `${Math.round(rate * 100)}%`}</span>
          <ConfidenceTag n={decided} />
        </span>
      </div>
      {/* C3: the margin sentence is the loud, honest caveat a thin sample needs; on "some" and
          "many" cards the tag above already says the bucket, and the sentence would only be
          noise repeating it. The tag itself never goes away, so the bucket is always visible. */}
      {rate !== null && conf === 'few' ? (
        <p className="fine">{marginSentence(rate, decided)}</p>
      ) : null}
      <div className="cost-line">
        <span className="team-details">
          Open in pick3 <Chevron />
        </span>
      </div>
    </a>
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
         * (ConfidenceTag); the exact cut points are reference material for a reader who wants
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
              <TeamCard key={team.species.join('+')} team={team} data={data} league={league} />
            ))}
            <p className="fine">Win rate is the reporters&apos; own result with this team.</p>
            <p className="fine">Small samples swing a lot; the badge says how much to trust it.</p>
          </>
        )}
      </section>
    </main>
  );
}
