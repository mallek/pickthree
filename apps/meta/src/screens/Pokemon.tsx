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
import { battles as battlesText, count, pct, plural } from '../format.js';
import { PICK3 } from '../links.js';
import { HALF_SAY_BATTLES, type SpeciesRanking, type SpeciesRow } from '../rank.js';
import type { View } from '../route.js';

/** The tap-to-reveal note on the header line: how the continuous blend works, with the one
 * number (`HALF_SAY_BATTLES`) read from the constant rather than typed again, so this sentence
 * cannot drift from the curve `measuredSay` actually computes. */
function blendExplainer(): string {
  return (
    "Every row blends PvPoke's ranking with what players actually faced. The more battles and " +
    `the more devices, the more the measured side counts. At ${count(HALF_SAY_BATTLES)} battles ` +
    'it is half.'
  );
}

/** At 0% measured this says so in plain words, the same honesty the old below-threshold banner
 * carried, now said continuously rather than as a flip. */
function headerLine(ranking: SpeciesRanking): string {
  if (ranking.battles === 0) {
    return "PvPoke's list. No shared battles in this window yet.";
  }
  const pctVal = Math.round(ranking.say * 100);
  const devices = `${count(ranking.devices)} ${plural(ranking.devices, 'device', 'devices')}`;
  return `${pctVal}% measured, from ${battlesText(ranking.battles)} shared by ${devices}`;
}

/** A row with `share === null` prints a count, never a percentage: a share of nothing is not
 * zero, it is nothing to divide by. */
function facedLine(row: SpeciesRow, battles: number): string {
  if (row.share === null) {
    return 'Not faced in this window';
  }
  return `${count(row.sightings)} of ${count(battles)} battles (${pct(row.share)}%)`;
}

function recordLine(row: SpeciesRow): string {
  if (row.decided === 0) {
    return 'no result recorded';
  }
  return `players went ${row.wins}-${row.losses}`;
}

/** PvPoke's list is never described with a measured word: this marker only ever says that PvPoke
 * does not rank the species, never anything about how much it was faced. */
function NewMarker(): ReactNode {
  return (
    <Term term="New">
      PvPoke does not rank this one, so its place here comes entirely from how often players faced
      it.
    </Term>
  );
}

function tailLine(n: number): string {
  return `${count(n)} more were faced once each`;
}

function RowView({
  row,
  data,
  league,
  battles,
  href,
}: {
  row: SpeciesRow;
  data: StaticData;
  league: string;
  battles: number;
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
        <b>{row.pvpokeRank !== null ? `PvPoke #${row.pvpokeRank}` : <NewMarker />}</b>
        <small>{facedLine(row, battles)}</small>
        <small>
          {recordLine(row)} <ConfidenceTag n={row.decided} />
        </small>
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

  // The list cut: a row draws when PvPoke ranks it, or when it was faced at least twice. A row
  // PvPoke does not rank that was faced exactly once cannot have come from anywhere else (see
  // rank.ts's own `add`: an unranked id only enters the list via a sighting), so what is left out
  // here is, by construction, species faced once each; they are counted, not dropped.
  const drawn = ranking.rows.filter((row) => row.pvpokeRank !== null || row.sightings >= 2);
  const tail = ranking.rows.length - drawn.length;

  return (
    <main>
      <section>
        <h2>What you face</h2>
        <p className="sub">
          {headerLine(ranking)} <Term term="How the blend works">{blendExplainer()}</Term>
        </p>
        <div className="list">
          {drawn.map((row) => (
            <RowView
              key={row.speciesId}
              row={row}
              data={data}
              league={league}
              battles={ranking.battles}
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
