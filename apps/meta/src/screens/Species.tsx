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
import { Bar, Chevron, Sparkline, Sprite, TypeTags, WHITE_TEXT, typeColor } from '../components.js';
import { speciesOf, type StaticData } from '../data.js';
import { battles as battlesText, count, pct } from '../format.js';
import { countersLink, PICK3 } from '../links.js';
import { MEASURED_MIN, MEASURED_MIN_DEVICES } from '../rank.js';
import type { Query, View } from '../route.js';
import { marginSentence, trendLabel, winRate } from '../stats.js';
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

/** A move name tinted by its type, the same foreground rule TypeTags uses. A move id with no
 * entry in the static move file still renders, under its raw id, rather than going blank. */
function MoveTag({ moveId, data }: { moveId: string; data: StaticData }) {
  const move = data.moves.get(moveId);
  const name = move?.name ?? moveId;
  const type = move?.type ?? '';
  return (
    <span
      className="type-tag"
      style={{ background: typeColor(type), color: WHITE_TEXT.has(type) ? '#fff' : '#161826' }}
    >
      {name}
    </span>
  );
}

function MoveShareRow({ share, runs, data }: { share: MoveShare; runs: number; data: StaticData }) {
  const sharePct = runs > 0 ? (share.battles / runs) * 100 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <MoveTag moveId={share.moveId} data={data} />
        <span className="fine">{Math.round(sharePct)}%</span>
      </div>
      <Bar pct={sharePct} label={`${share.moveId} share`} />
    </div>
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
      <p className="sub">Run by reporters in {count(detail.runs)} battles</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fastShares.map((s) => (
          <MoveShareRow key={`fast-${s.moveId}`} share={s} runs={detail.runs} data={data} />
        ))}
        {chargedShares.map((s) => (
          <MoveShareRow key={`charged-${s.moveId}`} share={s} runs={detail.runs} data={data} />
        ))}
      </div>
      <p className="fine">
        Most Pokemon carry two charged moves, so those shares add up to about 200%.
      </p>
    </section>
  );
}

function WeeklyCard({ weekly }: { weekly: SpeciesDetailV1['weekly'] }) {
  if (weekly.length < 2) {
    return null;
  }
  const shares = weekly.map((w) => (w.battles > 0 ? w.sightings / w.battles : 0));
  const first = shares[0]!;
  const latest = shares[shares.length - 1]!;
  const changePoints = (latest - first) * 100;
  return (
    <section>
      <h2>Faced, week by week</h2>
      <Sparkline values={shares} />
      <p className="sub">
        {pct(latest)}% latest, {trendLabel(changePoints)} pts since the first week
      </p>
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
            {count(detail.wins)} wins, {count(detail.losses)} losses
          </p>
          <p className="fine">{marginSentence(rate, decided)}</p>
          {rate < 0.5 ? (
            <p className="fine">Under 50% means it usually wins when it shows up.</p>
          ) : null}
        </>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <a className="btn btn-primary" href={countersLink(league, speciesId)}>
          Who beats it
        </a>
        <a className="btn btn-secondary" href={`${PICK3}/#/build`}>
          Build a team
        </a>
      </div>
    </section>
  );
}

/**
 * Correction 3 (task-12-report.md): "the smallest band with battles under 100" is ambiguous
 * when several bands are under 100, so this is defined precisely as the band with the fewest
 * battles among those with at least one, warned on only when that count is itself under 100.
 */
function BandsCard({ bands }: { bands: SpeciesDetailV1['bands'] }) {
  const withBattles = bands.filter((b) => b.sightings > 0);
  const thin =
    withBattles.length > 0
      ? withBattles.reduce((min, b) => (b.sightings < min.sightings ? b : min))
      : null;
  const warnThin = thin !== null && thin.sightings < 100;
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
      {warnThin && thin ? (
        <p className="fine">
          {bandLabel(thin.band)} is {count(thin.sightings)} battles, treat it as a hint, not a
          fact.
        </p>
      ) : null}
    </section>
  );
}

function AlongsideCard({
  alongside,
  sightings,
  data,
  league,
  href,
}: {
  alongside: SpeciesDetailV1['alongside'];
  sightings: number;
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
                }}
              >
                <Sprite species={other} size={40} />
                <span className="fine">{other.short}</span>
                <span className="fine">{Math.round(share)}%</span>
              </a>
            );
          })}
        </div>
      )}
      <p className="sub">
        Share of the battles where you faced it and also saw this one. Reporters note up to
        three opponents, so this is not the whole enemy team.
      </p>
    </section>
  );
}

/** Correction 4 (task-12-report.md): `SpeciesDetailV1` carries no baseline of its own, so this
 * looks the species up in the `Baseline.byId` map App.tsx already loads, and the whole card is
 * left out (not rendered empty) when PvPoke does not curate this species. */
function PvPokeCard({ entry, data }: { entry: BaselineSpecies; data: StaticData }) {
  const names = [entry.fastMove, ...entry.chargedMoves].map(
    (id) => data.moves.get(id)?.name ?? id,
  );
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
  const leagueInfo = data.leagues.find((l) => l.id === league) ?? null;
  const leagueTitle = leagueInfo?.title ?? league;

  const backLink = (
    <a
      className="fine"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      href={href({ name: 'overview', league })}
    >
      <Chevron dir="left" /> Back to {leagueTitle}
    </a>
  );

  const headerTop = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Sprite species={species} size={64} />
      <div>
        <h1>{species.name}</h1>
        <TypeTags types={species.types} />
      </div>
    </div>
  );

  if (detail.state === 'error' || meta.state === 'error') {
    return (
      <main>
        {backLink}
        {headerTop}
        <p className="sub">Could not load this Pokemon&apos;s record. Try again in a moment.</p>
      </main>
    );
  }

  if (!detail.data || !meta.data) {
    return (
      <main>
        {backLink}
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
    headerText = `#${rankNum} most faced - in ${pct(share)}% of ${count(m.battles)} battles`;
  } else {
    headerText = `Faced ${count(d.sightings)} times in ${count(m.battles)} battles`;
  }

  const baselineEntry = baseline.data?.byId.get(speciesId) ?? null;

  return (
    <main>
      {backLink}
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
