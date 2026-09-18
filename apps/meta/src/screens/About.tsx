/**
 * The about page: the site's privacy promise and its statistical method, written in public.
 * Every claim here has to be literally true of what workers/counter/src/battles.ts parses and
 * workers/counter/src/index.ts stores, and of the real thresholds in ../rank.ts and ../stats.ts.
 * If this page and the worker ever disagree, this page is the one that is wrong, not the worker.
 *
 * This view carries no league (route.ts's View has no `league` on 'about'), so App.tsx renders
 * neither the league switcher nor the window/band filters above it. The PvPoke stamp at the foot
 * reads whichever league's baseline App.tsx already has loaded: every league is baked from the
 * same PvPoke commit and date in one data build, so any one of them says the same thing.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Baseline } from '../baseline.js';
import { battleWord, count, plural } from '../format.js';
import { PICK3 } from '../links.js';
import { MEASURED_MIN, MEASURED_MIN_DEVICES, WIN_RATE_MIN } from '../rank.js';
import { TREND_MIN } from '../stats.js';
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
        stroke="var(--up)"
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
        stroke="var(--down)"
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
        Every number on this site is built from real GO Battle League battles that pick3 players
        chose to share. Nothing is scraped, estimated or simulated. The one exception is
        PvPoke&apos;s meta group, which is labelled as PvPoke&apos;s list wherever it appears.
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
          Log your battles in pick3. Sharing is on by default, so every battle you log shows up
          here within about ten minutes. To stop, switch off Share your battles in Settings.
          Switching it off also deletes what your device has already sent.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn btn-primary" href={PICK3}>
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
          Any battle logger will be able to post records here with an API key, using the same
          fields listed above and tagged with the source app. That is not built yet, so there is
          nothing to sign up for.
        </p>
      </section>

      <section className="card">
        <h2>How the lists are built</h2>
        <p className="sub">
          A league&apos;s ranked list is measured once {count(MEASURED_MIN)} or more counted{' '}
          {battleWord(MEASURED_MIN)} have been shared, from {count(MEASURED_MIN_DEVICES)} or more{' '}
          {plural(MEASURED_MIN_DEVICES, 'device', 'devices')}, for the window and rank band you
          are looking at. Under either floor, the ranked list is PvPoke&apos;s meta group,
          clearly marked, and everything we have measured is shown under it with its counts.
          Tanked battles are counted separately and never touch a record. A record with fewer
          than {count(WIN_RATE_MIN)} decided {battleWord(WIN_RATE_MIN)} shows its raw win-loss
          count instead of a percentage. A trend is only shown when both windows being compared
          hold at least {count(TREND_MIN)} {battleWord(TREND_MIN)}, and only when the change is
          bigger than the noise in the numbers.
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
