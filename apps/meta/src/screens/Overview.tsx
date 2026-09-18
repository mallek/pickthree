/**
 * The league overview: what is actually measured, or, while there is too little of that to trust,
 * PvPoke's hand-kept list, clearly labelled as PvPoke's and never as measured. This is the screen
 * that ships on day one, in its below-threshold state, so that state is the one to get right.
 *
 * See docs/superpowers/specs/2026-09-18-meta-site-design.md, "The two sources, and the rule that
 * keeps them apart" and "Honesty rules": the baseline section may never borrow the words "faced",
 * "record" or "win rate", and the measured numbers are always on screen with their counts, however
 * small.
 */
import type { ReactNode } from 'react';
import { BUCKET_MS, type MetaSummaryV1 } from '../api.js';
import type { Baseline } from '../baseline.js';
import { Bar, Note, Sprite, StatCard, TypeTags } from '../components.js';
import { speciesOf, type StaticData } from '../data.js';
import { ago, battleWord, battles as battlesText, count, pct, plural } from '../format.js';
import { PICK3 } from '../links.js';
import {
  RANKED_SHARE,
  SMALL_MIN,
  rank,
  type BaselineRow,
  type MeasuredRow,
  type Ranking,
} from '../rank.js';
import type { BandKey, Query, View } from '../route.js';
import { trendLabel } from '../stats.js';
import type { Loaded } from '../useMeta.js';

/** Same labels as App.tsx's own (private) map, for the sentences that name the chosen band. */
const BAND_LABELS: Record<Exclude<BandKey, 'all'>, string> = {
  below: 'Below Ace',
  ace: 'Ace',
  veteran: 'Veteran',
  expert: 'Expert',
  legend: 'Legend',
};

/**
 * The baseline rows alone, independent of any measured data. `rank()` computes these from a
 * `MetaSummaryV1` and a `Baseline` together, but PvPoke's list stands on its own: when the shared
 * battles failed to load there is no `MetaSummaryV1` to hand it, and the baseline section still has
 * to render (see the design spec's "never blank" rule). The sort and bar scaling here must match
 * `rank.ts`'s own `byScore` and `barPct` exactly, so the list looks identical whichever path built
 * it.
 */
function baselineRowsOf(baseline: Baseline): BaselineRow[] {
  const sorted = [...baseline.species].sort(
    (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.speciesId.localeCompare(b.speciesId),
  );
  const best = sorted[0]?.score ?? null;
  return sorted.map((s, i) => ({
    speciesId: s.speciesId,
    rank: i + 1,
    score: s.score,
    rating: s.rating,
    fastMove: s.fastMove,
    chargedMoves: s.chargedMoves,
    barPct: best !== null && best > 0 && s.score !== null ? Math.round((s.score / best) * 100) : 0,
  }));
}

function tailLine(tail: number): string {
  if (tail === 1) {
    return '1 more was faced once.';
  }
  return `${count(tail)} more were faced once each.`;
}

/** The below-threshold banner body. `holdback` says which of the two floors was not cleared;
 * 'devices' needs its own wording because the battles are there and the problem is who sent them,
 * not how many. */
function bannerBody(ranking: Ranking, leagueTitle: string, band: BandKey): string {
  if (ranking.holdback === 'devices') {
    const n = ranking.devices;
    // At n = 1 this is not "a few players' matchmaking", a phrase that promises more than one
    // player; it is one player's, plainly. This is the likely day-one state, not an edge case.
    const whose = n === 1 ? "one player's matchmaking" : "a few players' matchmaking";
    return (
      `Only ${count(n)} ${plural(n, 'device', 'devices')} ${plural(n, 'has', 'have')} shared ` +
      `battles in this window, so this is ${whose} rather than what everyone is facing. The ` +
      "ranked list below is PvPoke's meta group, not measured play. What we have measured is " +
      'under it, with its counts.'
    );
  }
  const bandSuffix = band === 'all' ? '' : ` from ${BAND_LABELS[band]} players`;
  // battles < MEASURED_MIN gates this branch, and MEASURED_MIN is well above 1, but the very
  // first battle a league ever sees passes through here on day one, so the verb has to agree
  // with a singular count just as much as the noun does.
  return (
    `Only ${count(ranking.battles)} ${leagueTitle} ${battleWord(ranking.battles)}${bandSuffix} ` +
    `${plural(ranking.battles, 'has', 'have')} been shared in this window. The ranked list ` +
    "below is PvPoke's meta group, not measured play. What we have measured is under it, with " +
    'its counts.'
  );
}

/** The paragraph above the measured list explaining what "faced" and "record" mean, with the band
 * and trend sentences folded in only when they apply. */
function explainerText(ranking: Ranking, band: BandKey): string {
  const n = count(ranking.battles);
  let s =
    `Faced is the share of the ${n} shared ${battleWord(ranking.battles)} where this Pokemon ` +
    'was on the other side. ';
  s +=
    band === 'all'
      ? 'Record is how the people who shared those battles did against it.'
      : `Record is how ${BAND_LABELS[band]} reporters did against it.`;
  if (ranking.measured.some((r) => r.trend !== null)) {
    s += ' Trend is the change in share since the window before this one.';
  }
  return s;
}

function MeasuredRowView({
  row,
  data,
  league,
  battles,
  measuredEnough,
  href,
}: {
  row: MeasuredRow;
  data: StaticData;
  league: string;
  battles: number;
  measuredEnough: boolean;
  href: (view: View) => string;
}) {
  const species = speciesOf(data, row.speciesId);
  return (
    <a className="row" href={href({ name: 'species', league, speciesId: row.speciesId })}>
      <span className="fine">{row.rank}</span>
      <Sprite species={species} size={40} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="name">{species.short}</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <TypeTags types={species.types} />
        </span>
        <Bar pct={row.barPct} tone={measuredEnough ? 'accent' : 'muted'} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span>
          {measuredEnough && row.share !== null ? (
            <>
              <span>{pct(row.share)}%</span>
              {row.trend !== null ? <span className="fine"> {trendLabel(row.trend)}</span> : null}
            </>
          ) : (
            <>
              <span>{count(row.sightings)}</span>
              <span className="fine"> of {count(battles)}</span>
            </>
          )}
        </span>
        <span className="fine">
          <span>
            {row.wins}-{row.losses}
          </span>
          {row.winRate !== null ? <span> {pct(row.winRate)}%</span> : null}
        </span>
      </span>
    </a>
  );
}

/** The "help fill this in" card, shared verbatim by Overview's below-threshold state and by
 * Teams' empty state: both are the same appeal (log battles in pick3) and must read identically. */
export function Contribute({ devices }: { devices: number }) {
  return (
    <div className="card">
      <b>Help fill this in</b>
      <p className="sub">
        Every battle logged in pick3 is shared here automatically, and you can switch it off in
        Settings. {count(devices)} {plural(devices, 'device is', 'devices are')} contributing to
        this view so far.
      </p>
      <a className="btn btn-primary" href={`${PICK3}/#/meta/log`}>
        Log battles in pick3
      </a>
    </div>
  );
}

function BaselineSection({
  baselineRows,
  data,
  league,
  leagueTitle,
  pvpokeDate,
  href,
}: {
  baselineRows: BaselineRow[];
  data: StaticData;
  league: string;
  leagueTitle: string;
  pvpokeDate: string;
  href: (view: View) => string;
}) {
  return (
    <section>
      <h2>PvPoke&apos;s meta group</h2>
      <p className="sub">
        {`PvPoke's hand-kept list for ${leagueTitle}, from its rankings of ${pvpokeDate}. Not measured play.`}
      </p>
      {baselineRows.map((row) => (
        <BaselineRowView key={row.speciesId} row={row} data={data} league={league} href={href} />
      ))}
    </section>
  );
}

function BaselineRowView({
  row,
  data,
  league,
  href,
}: {
  row: BaselineRow;
  data: StaticData;
  league: string;
  href: (view: View) => string;
}) {
  const species = speciesOf(data, row.speciesId);
  return (
    <a className="row" href={href({ name: 'species', league, speciesId: row.speciesId })}>
      <span className="fine">{row.rank}</span>
      <Sprite species={species} size={40} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="name">{species.short}</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <TypeTags types={species.types} />
        </span>
        <Bar pct={row.barPct} />
      </span>
      <span style={{ textAlign: 'right' }}>{row.score !== null ? row.score : '-'}</span>
    </a>
  );
}

export function Overview(p: {
  league: string;
  query: Query;
  data: StaticData;
  meta: Loaded<MetaSummaryV1>;
  baseline: Loaded<Baseline>;
  now: Date;
  href: (view: View) => string;
}): ReactNode {
  const { league, query, data, meta, baseline, now, href } = p;
  const leagueInfo = data.leagues.find((l) => l.id === league) ?? null;
  const leagueTitle = leagueInfo?.title ?? league;

  const statCards = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      <StatCard value={meta.data ? count(meta.data.battles) : '-'} label="battles" />
      <StatCard value={meta.data ? count(meta.data.devices) : '-'} label="devices" />
      <StatCard value={meta.data ? ago(meta.data.generatedAt, now) : '-'} label="updated" />
    </div>
  );

  // The api failed: there is no MetaSummaryV1 to rank against, so the measured half of the page
  // cannot exist. The baseline half does not depend on it, and the design spec's "never blank"
  // rule says to show it anyway rather than leaving the reader with only an error line.
  if (meta.state === 'error') {
    return (
      <main>
        {statCards}
        <p className="sub">
          Could not load the shared battles. PvPoke&apos;s list is below; try again in a moment.
        </p>
        {baseline.data ? (
          <BaselineSection
            baselineRows={baselineRowsOf(baseline.data)}
            data={data}
            league={league}
            leagueTitle={leagueTitle}
            pvpokeDate={baseline.data.pvpokeDate}
            href={href}
          />
        ) : null}
      </main>
    );
  }

  // Both requests still in flight (or the baseline one failed on its own, which is rare: it is a
  // baked file, not a live query). Nothing honest to rank yet, so say so rather than guess.
  if (!meta.data || !baseline.data) {
    return (
      <main>
        {statCards}
        <p className="sub">Loading</p>
      </main>
    );
  }

  const ranking = rank(meta.data, baseline.data);
  const measuredEnough = ranking.source === 'measured';

  const measuredSection = (
    <section>
      <h2>Most faced</h2>
      <p className="sub">
        Measured from {battlesText(ranking.battles)} shared by {count(ranking.devices)}{' '}
        {plural(ranking.devices, 'device', 'devices')}.
      </p>
      <p className="sub">{explainerText(ranking, query.band)}</p>
      <div className="fine" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Top {ranking.measured.length} - most faced</span>
        <span>faced - record</span>
      </div>
      {ranking.measured.map((row) => (
        <MeasuredRowView
          key={row.speciesId}
          row={row}
          data={data}
          league={league}
          battles={ranking.battles}
          measuredEnough={measuredEnough}
          href={href}
        />
      ))}
      <p className="fine">
        Only Pokemon faced in at least {pct(RANKED_SHARE)}% of battles are ranked.
      </p>
      <p className="fine">
        Updated every {count(BUCKET_MS / 60_000)}{' '}
        {plural(BUCKET_MS / 60_000, 'minute', 'minutes')} from battles shared by pick3 players.
      </p>
    </section>
  );

  // Nothing measured yet: the rule below describes what qualifies a row for this list, which is
  // meaningless to state about a set that has nothing in it (worse, it used to print "these 0
  // battles" right above a line saying no battles have been shared at all). Only the empty-state
  // sentence needs to show.
  const hasSeenAny = ranking.measured.length > 0 || ranking.tail > 0;
  const seenSection = (
    <section>
      <h2>What we have seen</h2>
      {hasSeenAny ? (
        <p className="sub">
          Faced {count(SMALL_MIN)} or more times in the {battlesText(ranking.battles)} shared so
          far.
        </p>
      ) : (
        <p className="sub">No battles shared in this window yet.</p>
      )}
      {hasSeenAny ? (
        <>
          {ranking.measured.map((row) => (
            <MeasuredRowView
              key={row.speciesId}
              row={row}
              data={data}
              league={league}
              battles={ranking.battles}
              measuredEnough={measuredEnough}
              href={href}
            />
          ))}
          {ranking.tail > 0 ? <p className="fine">{tailLine(ranking.tail)}</p> : null}
        </>
      ) : null}
    </section>
  );

  const baselineSection = (
    <BaselineSection
      baselineRows={ranking.baseline}
      data={data}
      league={league}
      leagueTitle={leagueTitle}
      pvpokeDate={ranking.pvpokeDate}
      href={href}
    />
  );

  return (
    <main>
      {statCards}
      {ranking.source === 'baseline' ? (
        <Note tone="warn" title="Too few battles to trust yet.">
          <p className="sub">{bannerBody(ranking, leagueTitle, query.band)}</p>
        </Note>
      ) : null}
      {ranking.source === 'measured' ? (
        measuredSection
      ) : (
        <>
          {baselineSection}
          {seenSection}
          <Contribute devices={ranking.devices} />
        </>
      )}
      {ranking.source === 'measured' ? baselineSection : null}
    </main>
  );
}
