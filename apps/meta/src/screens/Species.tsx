/**
 * The species page: how often reporters faced this Pokemon over time, their record against it
 * overall and by rank band, what they saw it alongside, and the moveset they ran when they used
 * it themselves. PvPoke's own recommended set sits alongside as a clearly separate, unmeasured
 * card (see Overview.tsx's header comment for the two-sources rule this whole site follows).
 *
 * See docs/superpowers/specs/2026-09-18-meta-site-design.md and this task's brief
 * (.superpowers/sdd/2026-09-18-meta-site/task-12-brief.md, with four corrections recorded in
 * task-12-report.md) for the exact reader copy.
 */
import type { ReactNode } from 'react';
import type { MetaSummaryV1, MovesetStats, SpeciesDetailV1 } from '../api.js';
import type { Baseline, BaselineSpecies } from '../baseline.js';
import { Bar, Sparkline, Sprite, TypeChip, TypeChips } from '../components.js';
import { speciesOf, type StaticData } from '../data.js';
import { battles as battlesText, count, pctFloor, plural } from '../format.js';
import { countersLink, PICK3 } from '../links.js';
import { MEASURED_MIN, MEASURED_MIN_DEVICES } from '../rank.js';
import type { Query, View } from '../route.js';
import {
  marginSentence,
  SHARE_MIN,
  THIN_BAND_MAX,
  trendLabel,
  trendPoints,
  winRate,
} from '../stats.js';
import type { Loaded } from '../useMeta.js';

/** Same bands as elsewhere, plus 'unknown': the worker emits that band for a reporter it could
 * not place by rank, and this card has to show it rather than silently dropping its battles. */
const BAND_LABELS: Record<string, string> = {
  below: 'Below Ace',
  ace: 'Ace',
  veteran: 'Veteran',
  expert: 'Expert',
  legend: 'Legend',
  unknown: 'Unknown',
};

function bandLabel(band: string): string {
  return BAND_LABELS[band] ?? band;
}

/** Joins move names the way a sentence would: "A", "A and B", "A, B and C". */
function joinAnd(names: string[]): string {
  if (names.length === 0) {
    return '';
  }
  if (names.length === 1) {
    return names[0]!;
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
}

/**
 * This species' rank among every species the window recorded, highest sightings first, same
 * tiebreak as rank.ts's own comparator (species id, ascending). Computed by counting how many
 * species are ahead of it rather than indexing into a sorted copy, so a species missing from
 * `meta.species` (impossible in production, since the summary lists everything it has ever
 * faced, but true of a species detail fetched in isolation, as the tests do) still gets a sane
 * answer instead of an undefined one.
 */
function rankAmong(meta: MetaSummaryV1, speciesId: string, sightings: number): number {
  let ahead = 0;
  for (const s of meta.species) {
    if (s.speciesId === speciesId) {
      continue;
    }
    const tiedButFirst = s.sightings === sightings && s.speciesId.localeCompare(speciesId) < 0;
    if (s.sightings > sightings || tiedButFirst) {
      ahead += 1;
    }
  }
  return ahead + 1;
}

/** A move id and the battles behind it, aggregated across every complete set the worker
 * recorded. Correction 1 (task-12-report.md): the brief's own test expects one row per move,
 * not one per set, so sets containing the same move are folded together here before a share is
 * ever computed. */
interface MoveShare {
  moveId: string;
  battles: number;
}

function aggregateMoves(
  movesets: readonly MovesetStats[],
  pick: (m: MovesetStats) => readonly string[],
): MoveShare[] {
  const totals = new Map<string, number>();
  for (const set of movesets) {
    for (const moveId of pick(set)) {
      totals.set(moveId, (totals.get(moveId) ?? 0) + set.battles);
    }
  }
  return [...totals.entries()]
    .map(([moveId, battles]) => ({ moveId, battles }))
    .sort((a, b) => b.battles - a.battles || a.moveId.localeCompare(b.moveId));
}

/** D3: one line per move, pick3's own shape from Build's cards (`.pick-move`/`.pick-move-k`,
 * `moveLines` in apps/web/src/screens/Build.tsx): an F or C marker, the move's name, its type
 * chip, and this card's own addition at the end of the line, the share of battles a set with this
 * move was run in (pick3's version has no share to show, since it is picking a build, not
 * reporting one). A move id with no entry in the static move file still renders under its raw id,
 * rather than going blank. */
function MoveLine({
  moveId,
  kind,
  battles,
  runs,
  data,
}: {
  moveId: string;
  kind: 'F' | 'C';
  battles: number;
  runs: number;
  data: StaticData;
}) {
  const move = data.moves.get(moveId);
  const sharePct = runs > 0 ? (battles / runs) * 100 : 0;
  return (
    <span className="pick-move">
      <i className="pick-move-k">{kind}</i>
      <span className="pick-move-name">{move?.name ?? moveId}</span>
      {move ? <TypeChip type={move.type} small /> : null}
      <span className="fine pick-move-share">{Math.round(sharePct)}%</span>
    </span>
  );
}

/** Correction 2 (task-12-report.md): `runs` counts battles, not distinct reporters, so the
 * header says "Run by reporters in N battles" rather than the brief's "N reporters ran it
 * themselves", which this site's own numbers do not support. */
function MovesetCard({ detail, data }: { detail: SpeciesDetailV1; data: StaticData }) {
  if (detail.runs === 0) {
    return (
      <section>
        <h2>Moves reporters ran</h2>
        <p className="sub">Nobody who shares battles has run it in this window.</p>
      </section>
    );
  }
  const fastShares = aggregateMoves(detail.movesets, (m) => [m.fast]);
  const chargedShares = aggregateMoves(detail.movesets, (m) => m.charged);
  return (
    <section>
      <h2>Moves reporters ran</h2>
      <p className="sub">Run by reporters in {battlesText(detail.runs)}</p>
      <div className="pick-moves">
        {fastShares.map((s) => (
          <MoveLine
            key={`fast-${s.moveId}`}
            moveId={s.moveId}
            kind="F"
            battles={s.battles}
            runs={detail.runs}
            data={data}
          />
        ))}
        {chargedShares.map((s) => (
          <MoveLine
            key={`charged-${s.moveId}`}
            moveId={s.moveId}
            kind="C"
            battles={s.battles}
            runs={detail.runs}
            data={data}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Fix round 3 ("FIX 1"): this card used to compute a share and a point change from any two
 * weeks at all, with no floor, so a species faced once in a two-battle week and not at all in a
 * three-battle week rendered "0% latest, -50.0 pts since the first week": a trend the data
 * cannot support, one tap away from the About page's own promise that a trend needs at least
 * `TREND_MIN` counted battles in both compared windows. Task 12's tests missed it because every
 * fixture week happened to have 500 battles.
 *
 * Two independent rules now apply. The series is charted, and a share quoted, only when EVERY
 * week clears `SHARE_MIN` battles: this used to filter down to just the qualifying weeks (fix
 * round 3's first pass), which review caught as two bugs at once. `Sparkline` spaces points
 * evenly by array index with no labels, so dropping a thin week from the MIDDLE of the series
 * (not just the ends) drew a straight line between two weeks that are not actually adjacent, a
 * chart that invents continuity a reader has no way to see. And "latest" stopped meaning the
 * real latest week once a thin week could be filtered off the end, which a current, still
 * in-progress week is exactly likely to be. All-or-nothing avoids both at once: any week under
 * the floor drops the whole series to the raw-counts fallback, so a rendered chart always joins
 * genuinely consecutive weeks and "latest" always means the actual latest one. The week-over-
 * week CHANGE still goes through `trendPoints`, the same statistical gate the League overview
 * and the About page's own promise both use (`TREND_MIN` counted battles on both sides, and the
 * difference has to clear its own 95% band); `null` means the data cannot say, which the card
 * must not silently render as "no change".
 */
function WeeklyCard({ weekly }: { weekly: SpeciesDetailV1['weekly'] }) {
  if (weekly.length < 2) {
    return null;
  }
  // All-or-nothing, on purpose: see the comment above for the two bugs a per-week filter caused.
  const everyWeekQualifies = weekly.every((w) => w.battles >= SHARE_MIN);
  if (!everyWeekQualifies) {
    const sightings = weekly.reduce((sum, w) => sum + w.sightings, 0);
    const battles = weekly.reduce((sum, w) => sum + w.battles, 0);
    return (
      <section>
        <h2>Faced, week by week</h2>
        <p className="sub">
          Faced {count(sightings)} {plural(sightings, 'time', 'times')} in {battlesText(battles)}{' '}
          over {count(weekly.length)} {plural(weekly.length, 'week', 'weeks')}
        </p>
        <p className="fine">Too few battles in some weeks to chart a share yet.</p>
      </section>
    );
  }
  const shares = weekly.map((w) => w.sightings / w.battles);
  const first = weekly[0]!;
  const latest = weekly[weekly.length - 1]!;
  const latestShare = shares[shares.length - 1]!;
  const change = trendPoints(latest.sightings, latest.battles, first.sightings, first.battles);
  let changeText: string | null = null;
  if (change !== null) {
    const label = trendLabel(change);
    // trendLabel returns the word "even" precisely so a caller does not print a number next to
    // it; appending "pts" to that word reads as nonsense ("even pts"), so that case gets its own
    // sentence instead of the number's unit.
    changeText =
      label === 'even' ? 'about the same as the first week' : `${label} pts since the first week`;
  }
  return (
    <section>
      <h2>Faced, week by week</h2>
      {/* D1: the latest reading is labelled on the chart itself now, not in a line of text
       * below it; the trend clause (when there is one to state) is the only text left here. */}
      <Sparkline
        values={shares}
        weekLabels={weekly.map((w) => w.week)}
        latestLabel={`${pctFloor(latestShare)} latest`}
      />
      {changeText ? <p className="sub">{changeText}</p> : null}
    </section>
  );
}

function RecordCard({
  detail,
  league,
  speciesId,
}: {
  detail: SpeciesDetailV1;
  league: string;
  speciesId: string;
}) {
  const rate = winRate(detail.wins, detail.losses);
  const decided = detail.wins + detail.losses;
  return (
    <section>
      <h2>Reporters&apos; record against it</h2>
      {rate === null ? (
        <p className="sub">No decided battles yet.</p>
      ) : (
        <>
          <div className="stat-n">{Math.round(rate * 100)}%</div>
          <p className="sub">
            {count(detail.wins)} {plural(detail.wins, 'win', 'wins')}, {count(detail.losses)}{' '}
            {plural(detail.losses, 'loss', 'losses')}
          </p>
          <p className="fine">{marginSentence(rate, decided)}</p>
          {rate < 0.5 ? (
            <p className="fine">Under 50% means it usually wins when it shows up.</p>
          ) : null}
        </>
      )}
      {/* D4: pick3's own outlined pair (.btn-pair, both .btn.btn-secondary): neither link is
       * more "primary" than the other, they are two different destinations on pick3. */}
      <div className="btn-pair">
        <a className="btn btn-secondary" href={countersLink(league, speciesId)}>
          Who beats it
        </a>
        <a className="btn btn-secondary" href={`${PICK3}/#/build`}>
          Build a team
        </a>
      </div>
    </section>
  );
}

/** Every band under `THIN_BAND_MAX` that has at least one battle, most battles first (so a
 * multi-band caveat reads best-attested band to worst-attested, matching how a reader scans the
 * rows above it). Correction 3 (task-12-report.md) originally read this as "the single
 * thinnest band", which under-warned: two bands tied at one sighting named only the first, and
 * a 90-battle band next to a 3-battle band got no caveat at all. Fix round 3 ("FIX 3") widens it
 * to every band that clears the bar, not just the minimum. */
function thinBands(bands: SpeciesDetailV1['bands']): SpeciesDetailV1['bands'] {
  return bands
    .filter((b) => b.sightings > 0 && b.sightings < THIN_BAND_MAX)
    .sort((a, b) => b.sightings - a.sightings || a.band.localeCompare(b.band));
}

/** D2: one short muted line, replacing the old sentence that named every thin band and its own
 * count (each band's own count is already on screen in the row above it; naming them again here
 * was the "too much prose above the data" this handoff is about). The gate is unchanged, only the
 * words are shorter: no caveat at all once every band clears `THIN_BAND_MAX`. The threshold stays
 * interpolated, the same discipline About.tsx uses for its own thresholds, so this sentence can
 * never say a number the code does not actually enforce. */
function thinBandCaveat(thin: SpeciesDetailV1['bands']): string | null {
  if (thin.length === 0) {
    return null;
  }
  return `Under ${count(THIN_BAND_MAX)} battles per band: hints, not facts.`;
}

function BandsCard({ bands }: { bands: SpeciesDetailV1['bands'] }) {
  const thin = thinBands(bands);
  const caveat = thinBandCaveat(thin);
  return (
    <section>
      <h2>Record against it, by rank</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bands.map((b) => {
          if (b.sightings === 0) {
            return (
              <div
                key={b.band}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{bandLabel(b.band)}</span>
                <span className="fine">no battles</span>
              </div>
            );
          }
          const rate = winRate(b.wins, b.losses);
          return (
            <div key={b.band} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{bandLabel(b.band)}</span>
                <span>
                  {rate !== null ? `${Math.round(rate * 100)}%` : '-'}{' '}
                  <span className="fine">{battlesText(b.sightings)}</span>
                </span>
              </div>
              <Bar pct={rate !== null ? rate * 100 : 0} label={`${bandLabel(b.band)} record`} />
            </div>
          );
        })}
      </div>
      {caveat ? <p className="fine">{caveat}</p> : null}
    </section>
  );
}

function AlongsideCard({
  alongside,
  sightings,
  measuredEnough,
  data,
  league,
  href,
}: {
  alongside: SpeciesDetailV1['alongside'];
  sightings: number;
  /** Same gate as the header ("#R most faced" vs "Faced S times"): below it a share is not a
   * share, it is two small counts pretending to be one, so this card shows the raw count
   * instead, the same rule Overview.tsx's own rows already follow. */
  measuredEnough: boolean;
  data: StaticData;
  league: string;
  href: (view: View) => string;
}) {
  return (
    <section>
      <h2>Seen next to</h2>
      {alongside.length === 0 ? (
        <p className="sub">Not enough shared battles yet to see what it is paired with.</p>
      ) : (
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto' }}>
          {alongside.slice(0, 5).map((a) => {
            const other = speciesOf(data, a.speciesId);
            const share = sightings > 0 ? (a.battles / sightings) * 100 : 0;
            return (
              <a
                key={a.speciesId}
                href={href({ name: 'species', league, speciesId: a.speciesId })}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'none',
                  // A sprite tile reads as content, not a call to action, same convention as
                  // a.row in app.css: plain ink, not the base link accent.
                  color: 'var(--text)',
                }}
              >
                <Sprite species={other} size={40} />
                <span className="fine" style={{ color: 'var(--muted)' }}>
                  {other.short}
                </span>
                <span className="fine">
                  {measuredEnough ? `${Math.round(share)}% - ` : ''}
                  {battlesText(a.battles)}
                </span>
              </a>
            );
          })}
        </div>
      )}
      <p className="sub">
        Share of the battles where you faced it and also saw this one. Reporters note up to three
        opponents, so this is not the whole enemy team.
      </p>
    </section>
  );
}

/** Correction 4 (task-12-report.md): `SpeciesDetailV1` carries no baseline of its own, so this
 * looks the species up in the `Baseline.byId` map App.tsx already loads, and the whole card is
 * left out (not rendered empty) when PvPoke does not curate this species. */
function PvPokeCard({ entry, data }: { entry: BaselineSpecies; data: StaticData }) {
  const names = [entry.fastMove, ...entry.chargedMoves].map((id) => data.moves.get(id)?.name ?? id);
  return (
    <section>
      <h2>PvPoke&apos;s set</h2>
      <p className="sub">{`PvPoke recommends ${joinAnd(names)}.`}</p>
      <p className="fine">PvPoke score: {entry.score !== null ? entry.score : '-'}.</p>
      <p className="fine">Not measured play.</p>
    </section>
  );
}

export function Species(p: {
  league: string;
  speciesId: string;
  query: Query;
  data: StaticData;
  detail: Loaded<SpeciesDetailV1>;
  meta: Loaded<MetaSummaryV1>;
  baseline: Loaded<Baseline>;
  now: Date;
  href: (view: View) => string;
}): ReactNode {
  const { league, speciesId, data, detail, meta, baseline, href } = p;
  const species = speciesOf(data, speciesId);

  // The species name itself is App.tsx's sticky header title now, not a heading printed here, so
  // this row is just the visual identity (sprite and types) that title sits above.
  const headerTop = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Sprite species={species} size={64} />
      <TypeChips types={species.types} />
    </div>
  );

  if (detail.state === 'error' || meta.state === 'error') {
    return (
      <main>
        {headerTop}
        <p className="sub">Could not load this Pokemon&apos;s record. Try again in a moment.</p>
      </main>
    );
  }

  if (!detail.data || !meta.data) {
    return (
      <main>
        {headerTop}
        <p className="sub">Loading</p>
      </main>
    );
  }

  const d = detail.data;
  const m = meta.data;
  const measuredEnough = m.battles >= MEASURED_MIN && m.devices >= MEASURED_MIN_DEVICES;

  let headerText: string;
  if (d.sightings === 0) {
    headerText = 'Not faced in this window';
  } else if (measuredEnough) {
    const share = m.battles > 0 ? d.sightings / m.battles : 0;
    const rankNum = rankAmong(m, speciesId, d.sightings);
    headerText = `#${rankNum} most faced - in ${pctFloor(share)} of ${battlesText(m.battles)}`;
  } else {
    headerText = `Faced ${count(d.sightings)} ${plural(d.sightings, 'time', 'times')} in ${battlesText(m.battles)}`;
  }

  const baselineEntry = baseline.data?.byId.get(speciesId) ?? null;

  return (
    <main>
      {headerTop}
      <p className="sub">{headerText}</p>
      {d.sightings === 0 ? (
        <p className="sub">No shared battles mention it in this window.</p>
      ) : (
        <>
          <WeeklyCard weekly={d.weekly} />
          <RecordCard detail={d} league={league} speciesId={speciesId} />
          <BandsCard bands={d.bands} />
          <AlongsideCard
            alongside={d.alongside}
            sightings={d.sightings}
            measuredEnough={measuredEnough}
            data={data}
            league={league}
            href={href}
          />
        </>
      )}
      <MovesetCard detail={d} data={data} />
      {baselineEntry ? <PvPokeCard entry={baselineEntry} data={data} /> : null}
    </main>
  );
}
