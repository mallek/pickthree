/**
 * The about page: the site's privacy promise and its statistical method, written in public.
 * Every claim here has to be literally true of what workers/counter/src/battles.ts parses and
 * workers/counter/src/index.ts stores, and of the real thresholds in ../rank.ts and ../stats.ts.
 * If this page and the worker ever disagree, this page is the one that is wrong, not the worker.
 *
 * This view carries no league (route.ts's View has no `league` on 'about'), so App.tsx renders
 * neither the league switcher nor the window/source filters above it. The PvPoke stamp at the foot
 * reads whichever league's baseline App.tsx already has loaded: every league is baked from the
 * same PvPoke commit and date in one data build, so any one of them says the same thing.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Baseline } from '../baseline.js';
import { battleWord, count, plural } from '../format.js';
import { PICK3 } from '../links.js';
import { HALF_SAY_BATTLES, HALF_SAY_DEVICES, HALF_SAY_EVENTS, HALF_SAY_TOURNAMENT_BATTLES } from '../rank.js';
import { MANY, SOME, TREND_MIN } from '../stats.js';
import type { Loaded } from '../useMeta.js';

/** The two decorative marks below. Their meaning lives in the section heading and the text next
 * to them, not in the mark, so both are aria-hidden rather than announced as their own icon. */
function CheckMark(): ReactNode {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, marginTop: 2 }}
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="var(--win)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossMark(): ReactNode {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, marginTop: 2 }}
    >
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="var(--loss)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const LIST_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const ITEM_STYLE: CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-start' };

/** Field for field, workers/counter/src/battles.ts's SharedBattle, plus three things the worker
 * stores alongside it that are not on SharedBattle itself: SharedBatch.device (per batch, not
 * per battle) and the two columns index.ts's MetaStore adds at ingest, `client` and `received`
 * (index.ts's `ingest()`: `batch.client` and `new Date().toISOString()`). A reader who goes on to
 * read that source should find nothing there this list left out. */
const CONTAINS: readonly string[] = [
  'League and season',
  'When the battle happened',
  "The reporter's three Pokemon, and the moves they had set when pick3 knew them",
  'Which opponent Pokemon were seen, up to three',
  'Win, loss, or tanked',
  'A self-reported rank band: Below Ace, Ace, Veteran, Expert or Legend',
  'A random device id, so contributors can be counted and a device can delete what it sent',
  'Which app and build sent it, so a misbehaving version can be spotted',
  'When the server received it',
];

/** None of these appear anywhere in SharedBattle, SharedBatch, or the `battles` table schema
 * (workers/counter/src/index.ts): no IP is read from the request at any ingest route. The two
 * columns CONTAINS added above, `client` and `received`, do not contradict any line here either:
 * `client` names an app build, not a person, and `received` is a server clock reading, not
 * anything the player supplied. */
const NEVER: readonly string[] = [
  'Your Pokemon collection or storage',
  'IVs, levels or CP',
  'Trainer names, friend codes, emails or anything that identifies you',
  'Location',
  'Your IP address',
];

export function About(p: { baseline: Loaded<Baseline> }): ReactNode {
  const { baseline } = p;
  return (
    <main>
      <p className="sub">
        Every number on this site comes from one of three places: real GO Battle League battles
        that pick3 players chose to share, official tournament broadcasts read off the stream and
        joined to the published rosters, or PvPoke&apos;s own curated meta group and the simulated
        matchups behind it. Nothing is scraped. A percentage on this site always means real battles;
        a projection is shown as a matchup score out of 100 instead, never a percentage.
      </p>

      <section className="card">
        <h2>What one shared battle contains</h2>
        <ul style={LIST_STYLE}>
          {CONTAINS.map((line) => (
            <li key={line} style={ITEM_STYLE}>
              <CheckMark />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Never collected</h2>
        <ul style={LIST_STYLE}>
          {NEVER.map((line) => (
            <li key={line} style={ITEM_STYLE}>
              <CrossMark />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>How to contribute</h2>
        <p className="sub">
          Log your battles in pick3. Sharing is on by default, so every battle you log shows up here
          within about ten minutes. To stop, switch off Share your battles in Settings. Switching it
          off also deletes what your device has already sent.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn" href={PICK3}>
            Open pick3
          </a>
          <a className="btn btn-secondary" href={`${PICK3}/#/meta/log`}>
            Log a battle
          </a>
        </div>
      </section>

      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2>For other apps</h2>
          <span
            style={{
              background: 'var(--surface2)',
              color: 'var(--muted)',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            Planned
          </span>
        </div>
        <p className="sub">
          Any battle logger will be able to post records here with an API key, using the same fields
          listed above and tagged with the source app. That is not built yet, so there is nothing to
          sign up for.
        </p>
        <p className="fine">
          Reading needs no key. A server or script can call it freely; a page running in someone
          else&apos;s browser is limited by this site&apos;s CORS allow-list for now. The team board
          behind Teams:
        </p>
        <p className="fine">
          <code>
            {
              'GET https://meta.pick3.gg/api/v1/teams?league=great&since=<iso>&until=<iso>&source=tournament'
            }
          </code>
        </p>
      </section>

      {/* A3: the species list, now the Pokemon screen, used to carry these three definitions as
       * prose above its own list, on every visit, whether or not the reader had ever wondered
       * what the words meant. They live here now, once, and Pokemon links nowhere to them (the
       * words are common enough to read in place without a footnote) but a curious reader knows
       * where the site's glossary is: this page. */}
      <section className="card">
        <h2>How to read the lists</h2>
        <p className="sub">
          Faced is the share of a window&apos;s shared battles where a Pokemon was on the other
          side. Record is how the reporters who shared those battles did against it, or, when you
          pick a different source, how that source&apos;s own population did. Trend is the change
          in a Pokemon&apos;s share since the window before this one; it is only shown when there
          is enough data in both windows to trust the difference (the thresholds are below).
        </p>
      </section>

      <section className="card">
        <h2>How the lists are built</h2>
        <p className="sub">
          Tanked battles are counted separately and never touch a record. On the Pokemon list, a
          record is always the raw win-loss count, never a percentage, with a confidence tag beside
          it: few under {count(SOME)} decided {battleWord(SOME)}, some from there up to{' '}
          {count(MANY)}, many at {count(MANY)} or more. On the Species page, a win rate is shown as
          a percentage, with a plain-language range beside it that narrows the more decided battles
          stand behind it. On Teams, a record is always the raw win-loss count too; a projection,
          when a row has one, is shown as a matchup score out of 100, never a percentage. A trend is
          only shown when both windows being compared hold at least {count(TREND_MIN)}{' '}
          {battleWord(TREND_MIN)}, and only when the change is bigger than the noise in the numbers.
        </p>
      </section>

      <section className="card">
        <h2>How the ranking works</h2>
        <p className="sub">
          Three sources, one number. PvPoke keeps a curated list of what a league&apos;s meta looks
          like, hand made by people who play it. Official tournament broadcasts show what
          competitive players actually pick. And we have battles players have shared from pick3.
          None of the three is the answer on its own, so every number here is a blend of all three.
        </p>
        <p className="sub">
          How much the measured side counts depends on two things: how many battles have been
          shared, and how many different devices shared them. At {count(HALF_SAY_BATTLES)} counted{' '}
          {battleWord(HALF_SAY_BATTLES)} the measured side has half the say. At{' '}
          {count(HALF_SAY_DEVICES)} {plural(HALF_SAY_DEVICES, 'device', 'devices')} it also has half
          the say, and the smaller of the two wins. One person sharing 900 battles is one
          person&apos;s matchmaking queue, so they are held to a sixth of the say until other people
          show up. Tournament pick share works the same way, on its own curve: at{' '}
          {count(HALF_SAY_TOURNAMENT_BATTLES)} tournament{' '}
          {battleWord(HALF_SAY_TOURNAMENT_BATTLES)} it has half the say, and at{' '}
          {count(HALF_SAY_EVENTS)} {plural(HALF_SAY_EVENTS, 'event', 'events')} it also has half the
          say.
        </p>
        <p className="sub">
          Tournament results come from official Play! Pokemon broadcasts, read off the stream and
          joined to the published rosters. They are a different population from ladder play, so
          they blend into PvPoke&apos;s side of the number first, on their own curve, and recede as
          shared ladder battles arrive. Only events on the league&apos;s own Play! format count
          toward the blend; the rest are listed and never mixed in. Tournament win rates are never
          part of the ranking: pick share is.
        </p>
        <p className="sub">
          Nothing flips. There is no point where the list suddenly becomes measured. Every battle
          shared moves it a little, and the header on each screen says exactly how far along it is
          right now.
        </p>
      </section>

      <section className="card">
        <h2>What &quot;projected&quot; means</h2>
        <p className="sub">
          A team nobody has shared yet still gets a number, worked out from PvPoke&apos;s matchup
          data and weighted by how often each opponent is actually faced: how much of the meta the
          three of them beat between them, how well those wins hold up when shields change, whether
          a top opponent goes completely unanswered, and whether the switch has any matchups that
          simply end it. No battle result feeds it, only which opponents matter.
        </p>
        <p className="sub">
          That is a projection, not a measurement, and this site never prints one as a percentage. A
          percentage here always means battles that actually happened. A projection is shown as a
          matchup score out of 100 instead.
        </p>
        <p className="sub">
          Projections cover the top few hundred Pokemon by PvPoke rank, which is the ranked list
          this site ships projections for, not every Pokemon PvPoke ranks. Someone you faced who is
          not on that list is counted in the measured numbers and left out of the projections, and
          any card that is missing a member says so instead of guessing.
        </p>
      </section>

      <section className="card">
        <h2>Teams and cores</h2>
        <p className="sub">
          Players log up to three opponents, and most of the time they log one or two. So a pair
          counts as a core: two Pokemon that were seen together, with whatever came third. A
          core&apos;s projection is the average over the thirds it was actually seen with; a core
          never seen complete is instead projected against PvPoke&apos;s own group, the same thirds
          any of them would expect to face. That is why a complete team usually scores above or
          below its own core rather than the same: we know all three of one, and only two of the
          other, or sometimes none at all.
        </p>
        <p className="sub">
          A team&apos;s record counts both sides. If you ran it, that is your result. If you faced
          it, that is your result reversed: you winning means the team you faced lost that battle. A
          card with both keeps the battle counts apart (run this many times, faced that many times)
          but combines the win-loss record into one line, labelled overall.
        </p>
      </section>

      <section className="card">
        <h2>When the game changes</h2>
        <p className="sub">
          A move rebalance or a season turn can make everything before it stop describing what you
          face now. When that happens we move the default window forward to the new starting point.
          Nothing is deleted: the 30 day and 7 day views keep working and still count every battle
          in them.
        </p>
        <p className="sub">
          The projections come from a pinned copy of PvPoke&apos;s data. If a rebalance has landed
          and that copy has not caught up yet, the projections describe the old movesets while the
          measured numbers already describe the new ones. When we know those two disagree, the
          affected screens say so.
        </p>
      </section>

      <footer className="fine">
        <p>
          Pokemon and Pokemon GO are trademarks of their owners. meta.pick3.gg is a fan-made tool
          and is not affiliated with them.
        </p>
        <p>Build {__META_BUILD__}</p>
        {baseline.data ? (
          <p>
            PvPoke rankings of {baseline.data.pvpokeDate}, commit {baseline.data.pvpokeCommit}.
          </p>
        ) : null}
      </footer>
    </main>
  );
}
