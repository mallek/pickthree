/**
 * The league's one ranked list: PvPoke's curated group and measured play blended continuously
 * (`rankSpecies`, rank.ts), never flipped wholesale between the two. Every row carries its own
 * provenance instead of living in one of two sections: PvPoke's rank (or the "new" marker when
 * PvPoke does not list it), how often it was actually faced, and the reporters' own record
 * against it. See docs/superpowers/specs/2026-09-18-meta-ranking-design.md.
 *
 * This screen used to hold two sections and a below-threshold banner, because the site FLIPPED
 * from PvPoke's list to a measured one at 300 battles and 5 devices. The blend dissolved that
 * threshold into a curve, so the flip (and the banner announcing it) is gone: the header line
 * says how measured the ranking currently is, continuously, including the 0% state.
 *
 * Task 7 (ruling 6): a row used to lead with PvPoke's rank, bold, and bury the measured share
 * inside a small sentence underneath. That inverted what the site is for. A row now leads with
 * what players actually faced -- `MeasuredValue`, pink, with its mark -- and PvPoke's rank drops
 * to a small, muted line at the foot, the same demotion ruling 7 gives the Species hero.
 */
import type { ReactNode } from 'react';
import { Button, ErrorState, Loading, MeasuredValue } from '@pickthree/ui';
import { Bar, BlendLine, ConfidenceTag, Sprite, TrendTag, TypeChips } from '../components.js';
import { speciesOf, type StaticData } from '../data.js';
import { count, pctFloor, plural } from '../format.js';
import { PICK3 } from '../links.js';
import {
  HALF_SAY_BATTLES,
  HALF_SAY_EVENTS,
  HALF_SAY_TOURNAMENT_BATTLES,
  type SpeciesRanking,
  type SpeciesRow,
} from '../rank.js';
import type { View } from '../route.js';

/** The tap-to-reveal note on the header line. Both numbers come from the constants rather than
 *  being typed again, so this sentence cannot drift from the curves `measuredSay` and
 *  `tournamentSay` actually compute. */
function blendExplainer(ranking: SpeciesRanking): string {
  const base =
    "Every row blends PvPoke's ranking with what players actually faced. The more battles and " +
    `the more devices, the more the measured side counts. At ${count(HALF_SAY_BATTLES)} battles ` +
    'it is half.';
  if (ranking.source !== 'all' && ranking.source !== 'tournament') {
    return base;
  }
  return (
    `${base} Tournament picks blend into PvPoke's side first, on their own curve: half at ` +
    `${count(HALF_SAY_TOURNAMENT_BATTLES)} tournament battles and at ${count(HALF_SAY_EVENTS)} events.`
  );
}

/**
 * The measured share, count and total behind a row, the one thing the right side leads with. Null
 * when there is nothing to divide by (Ruling 6: under PvPoke there is no measured side at all, and
 * a banned row has no tournament share to show regardless of how many battles the window carries)
 * OR when the row's own count is zero (fix round 1 controller ruling: a species nobody actually
 * saw reads as words, not a pink "0%" or "<1%", the same as the Species hero's own headerText).
 * This is the one place that decides pink figure vs. plain words; `facedWords` below only picks
 * which words once this has already said no.
 */
export function facedFigure(
  row: SpeciesRow,
  ranking: SpeciesRanking,
): { share: number; n: number; of: number } | null {
  if (ranking.source === 'prior') {
    return null;
  }
  if (ranking.source === 'tournament') {
    if (row.banned || ranking.tournamentBattles === 0 || row.tournamentPicks === 0) {
      return null;
    }
    return {
      share: row.tournamentPicks / ranking.tournamentBattles,
      n: row.tournamentPicks,
      of: ranking.tournamentBattles,
    };
  }
  if (row.share === null || row.sightings === 0) {
    return null;
  }
  return { share: row.share, n: row.sightings, of: ranking.battles };
}

/** The plain words a row falls back to when `facedFigure` is null. Under PvPoke this is never
 *  called BY THIS SCREEN: "Nothing measured." already prints once, in the fine-print line above
 *  the list (not the header's own blend line), and repeating it on every row would say the same
 *  thing over and over for no reason (`RowFigure` below short-circuits `ranking.source ===
 *  'prior'` to `null` before ever calling this). The `prior` branch exists for Species' own hero
 *  (ruling 7), which shows exactly one row and so has no "said once above the list" line to lean
 *  on instead; it reuses this function rather than a second copy of the words. The remaining
 *  branches mirror `facedFigure`'s own null cases in the same order, so every null the figure can
 *  return has exactly one form of words to explain it. */
export function facedWords(row: SpeciesRow, ranking: SpeciesRanking): string {
  if (ranking.source === 'prior') {
    return 'Nothing measured';
  }
  if (ranking.source === 'tournament') {
    if (row.banned) {
      return 'Banned at tournaments';
    }
    if (ranking.tournamentBattles === 0) {
      return 'No tournament battles in this window';
    }
    return 'Not picked in this window';
  }
  return 'Not faced in this window';
}

function recordOf(row: SpeciesRow, ranking: SpeciesRanking): { wins: number; losses: number } {
  return ranking.source === 'tournament'
    ? { wins: row.tournamentWins, losses: row.tournamentLosses }
    : { wins: row.wins, losses: row.losses };
}

function recordLine(row: SpeciesRow, ranking: SpeciesRanking): string {
  const { wins, losses } = recordOf(row, ranking);
  if (wins + losses === 0) {
    return 'no result recorded';
  }
  return `went ${wins}-${losses}`;
}

/** Battles behind a row's record, in whichever population `ranking.source` reads from: the count
 * `ConfidenceTag` is asked to grade. */
function decidedOf(row: SpeciesRow, ranking: SpeciesRanking): number {
  return ranking.source === 'tournament' ? row.tournamentWins + row.tournamentLosses : row.decided;
}

/** The explainer behind the "New" word: PvPoke does not rank the species, never anything about
 * how much it was faced (PvPoke's list is never described with a measured word). Fix round 1,
 * item 2: this used to be a `Term` nested inside each row's own `<a>`, which put interactive
 * content inside an anchor (invalid markup, and the tap bubbled into a navigation before the tip
 * could ever be read). Hosted once here, outside every row, in the "How it is ranked" `Term`. */
function newExplainer(): string {
  return 'PvPoke does not rank this one, so its place here comes entirely from how often players faced it.';
}

function tailLine(n: number): string {
  return plural(n, '1 more was faced once', `${count(n)} more were faced once each`);
}

/** The row's own right column, leading with what players faced (Ruling 6): the measured share,
 *  pink with its mark; the count it is a share of; the reporters' record and its confidence tag;
 *  and, last and small, PvPoke's rank or "New". Under PvPoke there is no measured side to show at
 *  all, so the first two lines drop out entirely and the rank stands alone. */
function RowFigure({ row, ranking }: { row: SpeciesRow; ranking: SpeciesRanking }): ReactNode {
  const figure = facedFigure(row, ranking);
  // A record belongs to a measured figure: with none (PvPoke alone, banned at tournaments, or not
  // faced or picked in this window) the muted words already say there is nothing to report, and
  // "no result recorded" under "Not faced in this window" only said it twice.
  const showRecord = figure !== null;
  return (
    <span className="row-figure">
      {ranking.source === 'prior' ? null : figure ? (
        <MeasuredValue value={pctFloor(figure.share)} />
      ) : (
        <small>{facedWords(row, ranking)}</small>
      )}
      {figure ? <small>{`${count(figure.n)} of ${count(figure.of)} battles`}</small> : null}
      {showRecord ? (
        <small>
          {recordLine(row, ranking)}{' '}
          {decidedOf(row, ranking) > 0 ? <ConfidenceTag n={decidedOf(row, ranking)} /> : null}
        </small>
      ) : null}
      <small>{row.pvpokeRank !== null ? `PvPoke #${row.pvpokeRank}` : 'New'}</small>
    </span>
  );
}

function RowView({
  row,
  data,
  league,
  ranking,
  href,
}: {
  row: SpeciesRow;
  data: StaticData;
  league: string;
  ranking: SpeciesRanking;
  href: (view: View) => string;
}) {
  const species = speciesOf(data, row.speciesId);
  // `row.trend` is the change in the ladder share (rank.ts compares sightings with the previous
  // window's), so it belongs only beside a ladder figure: All and GBL. Under PvPoke the list says
  // "Nothing measured.", and under Tournaments the figure is a pick share; a ladder trend next to
  // either would be a measured claim about a number the row is not showing.
  const trend = ranking.source === 'all' || ranking.source === 'ladder' ? row.trend : null;
  return (
    <a className="rank-row" href={href({ name: 'species', league, speciesId: row.speciesId })}>
      <span className="fine">{row.rank}</span>
      <Sprite species={species} size={44} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span className="name">{species.name}</span>
          {trend !== null ? <TrendTag points={trend} /> : null}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          <TypeChips types={species.types} />
        </span>
        <Bar pct={row.barPct} />
      </span>
      <RowFigure row={row} ranking={ranking} />
    </a>
  );
}

/** The "help fill this in" card, shared verbatim by Pokemon and by Teams' empty state: both are
 * the same appeal (log battles in pick3) and must read identically. */
export function Contribute({ devices }: { devices: number }) {
  return (
    <div className="card">
      <b>Help fill this in</b>
      <p className="sub">
        Every battle logged in pick3 is shared here automatically, and you can switch it off in
        Settings. {count(devices)} {plural(devices, 'device is', 'devices are')} contributing to
        this view so far.
      </p>
      <a className="btn" href={`${PICK3}/#/meta/log`}>
        Log battles in pick3
      </a>
    </div>
  );
}

export function Pokemon(p: {
  league: string;
  data: StaticData;
  /** True when any of the three sources `ranking` is blended from (the meta summary, the
   * baseline or the rank order) failed to load. */
  rankingError: boolean;
  ranking: SpeciesRanking | null;
  href: (view: View) => string;
  /** Retries whichever of the three sources actually failed (App.tsx's `retryRanking`). */
  onRetry: () => void;
}): ReactNode {
  const { league, data, rankingError, ranking, href, onRetry } = p;

  if (rankingError) {
    return (
      <main>
        <ErrorState
          line="Could not load the shared battles."
          action={<Button onClick={onRetry}>Try again</Button>}
        />
      </main>
    );
  }

  if (!ranking) {
    return (
      <main>
        <Loading label="Loading" />
      </main>
    );
  }

  // A row draws when PvPoke ranks it, when it was faced at least twice, or when it was picked at
  // a blended event at all. What is left out is, by construction, species faced exactly once on
  // the ladder and picked at no tournament; they are counted below, not dropped.
  const drawn = ranking.rows.filter(
    (row) => row.pvpokeRank !== null || row.sightings >= 2 || row.tournamentPicks >= 1,
  );
  const tail = ranking.rows.length - drawn.length;

  return (
    <main>
      <section>
        <BlendLine ranking={ranking} zero="PvPoke's list. No shared battles in this window yet.">
          <span className="term-line">{blendExplainer(ranking)}</span>
          <span className="term-line">{newExplainer()}</span>
        </BlendLine>
        {ranking.source === 'prior' ? <p className="fine">Nothing measured.</p> : null}
        <div className="list">
          {drawn.map((row) => (
            <RowView
              key={row.speciesId}
              row={row}
              data={data}
              league={league}
              ranking={ranking}
              href={href}
            />
          ))}
        </div>
        {tail > 0 ? <p className="fine">{tailLine(tail)}</p> : null}
      </section>
      <Contribute devices={ranking.devices} />
    </main>
  );
}
