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
 */
import type { ReactNode } from 'react';
import { ConfidenceTag, Bar, Sprite, Term, TrendTag, TypeChips } from '../components.js';
import { speciesOf, type StaticData } from '../data.js';
import { count, pct, plural } from '../format.js';
import { sourceHeaderLine } from '../headerCopy.js';
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

/** A row with nothing to divide by prints a count, never a percentage: a share of nothing is not
 * zero, it is nothing. Under PvPoke there is no measured side at all and the row says so. */
function facedLine(row: SpeciesRow, ranking: SpeciesRanking): string {
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
    if (row.tournamentPicks === 0) {
      return 'Not picked in this window';
    }
    return `${count(row.tournamentPicks)} of ${count(ranking.tournamentBattles)} battles (${pct(row.tournamentPicks / ranking.tournamentBattles)}%)`;
  }
  if (row.share === null) {
    return 'Not faced in this window';
  }
  return `${count(row.sightings)} of ${count(ranking.battles)} battles (${pct(row.share)}%)`;
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
  return `players went ${wins}-${losses}`;
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
 * could ever be read). Hosted once here, outside every row, next to the header line's own `Term`. */
function newExplainer(): string {
  return 'PvPoke does not rank this one, so its place here comes entirely from how often players faced it.';
}

function tailLine(n: number): string {
  return plural(n, '1 more was faced once', `${count(n)} more were faced once each`);
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
  return (
    <a className="rank-row" href={href({ name: 'species', league, speciesId: row.speciesId })}>
      <span className="fine">{row.rank}</span>
      <Sprite species={species} size={44} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span className="name">{species.short}</span>
          {row.trend !== null ? <TrendTag points={row.trend} /> : null}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          <TypeChips types={species.types} />
        </span>
        <Bar pct={row.barPct} />
      </span>
      <span className="row-figure">
        <b>{row.pvpokeRank !== null ? `PvPoke #${row.pvpokeRank}` : 'New'}</b>
        <small>{facedLine(row, ranking)}</small>
        {ranking.source === 'prior' || (ranking.source === 'tournament' && row.banned) ? null : (
          <small>
            {recordLine(row, ranking)}{' '}
            {decidedOf(row, ranking) > 0 ? <ConfidenceTag n={decidedOf(row, ranking)} /> : null}
          </small>
        )}
      </span>
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
}): ReactNode {
  const { league, data, rankingError, ranking, href } = p;

  if (rankingError) {
    return (
      <main>
        <p className="sub">Could not load the shared battles. Try again in a moment.</p>
      </main>
    );
  }

  if (!ranking) {
    return (
      <main>
        <p className="sub">Loading</p>
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
        <h2>What you face</h2>
        <p className="sub">
          {sourceHeaderLine(ranking, "PvPoke's list. No shared battles in this window yet.")}{' '}
          <Term term="How the blend works">{blendExplainer(ranking)}</Term>{' '}
          <Term term="New">{newExplainer()}</Term>
        </p>
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
