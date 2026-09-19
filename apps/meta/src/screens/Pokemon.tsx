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
import { Bar, Note, Sprite, TrendTag, TypeChips } from '../components.js';
import { speciesOf, type StaticData } from '../data.js';
import { battleWord, battles as battlesText, count, pct, pctPrecise, plural } from '../format.js';
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
  // E: zero is not a small number of battles, it is none, and "Only 0 battles have been shared"
  // used to say the former. battles < MEASURED_MIN gates this branch, and MEASURED_MIN is well
  // above 1, but the very first battle a league ever sees still passes through the non-zero
  // branch below, so its verb has to agree with a singular count just as much as the noun does.
  const lead =
    ranking.battles === 0
      ? `No ${leagueTitle} battles${bandSuffix} shared in this window yet.`
      : `Only ${count(ranking.battles)} ${leagueTitle} ${battleWord(ranking.battles)}${bandSuffix} ` +
        `${plural(ranking.battles, 'has', 'have')} been shared in this window.`;
  return (
    `${lead} The ranked list below is PvPoke's meta group, not measured play. What we have ` +
    'measured is under it, with its counts.'
  );
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
    <a className="rank-row" href={href({ name: 'species', league, speciesId: row.speciesId })}>
      <span className="fine">{row.rank}</span>
      <Sprite species={species} size={44} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span className="name">{species.short}</span>
          {/* B1: the trend tag now sits after the name rather than glued onto the share, and only
           * when the row is actually ranked by a measured share (the below-threshold branch never
           * carried a trend of its own, since rank.ts computes it off that same measured share). */}
          {measuredEnough && row.trend !== null ? <TrendTag points={row.trend} /> : null}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          <TypeChips types={species.types} />
        </span>
        <Bar pct={row.barPct} tone={measuredEnough ? 'accent' : 'muted'} />
      </span>
      <span className="row-figure">
        {measuredEnough && row.share !== null ? (
          <>
            <b>{pct(row.share)}%</b>
            <small>
              {row.wins}-{row.losses}
            </small>
          </>
        ) : (
          <>
            <b>{count(row.sightings)}</b>
            <small>of {count(battles)}</small>
          </>
        )}
      </span>
    </a>
  );
}

/** The "help fill this in" card, shared verbatim by Pokemon's below-threshold state and by
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
      <a className="btn" href={`${PICK3}/#/meta/log`}>
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
      <div className="list">
        {baselineRows.map((row) => (
          <BaselineRowView key={row.speciesId} row={row} data={data} league={league} href={href} />
        ))}
      </div>
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
    <a className="rank-row" href={href({ name: 'species', league, speciesId: row.speciesId })}>
      <span className="fine">{row.rank}</span>
      <Sprite species={species} size={44} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="name">{species.short}</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <TypeChips types={species.types} />
        </span>
        <Bar pct={row.barPct} />
      </span>
      <span style={{ textAlign: 'right' }}>{row.score !== null ? row.score : '-'}</span>
    </a>
  );
}

export function Pokemon(p: {
  league: string;
  query: Query;
  data: StaticData;
  meta: Loaded<MetaSummaryV1>;
  baseline: Loaded<Baseline>;
  now: Date;
  href: (view: View) => string;
}): ReactNode {
  const { league, query, data, meta, baseline, href } = p;
  const leagueInfo = data.leagues.find((l) => l.id === league) ?? null;
  const leagueTitle = leagueInfo?.title ?? league;

  if (meta.state === 'error') {
    return (
      <main>
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
        <p className="sub">Loading</p>
      </main>
    );
  }

  const ranking = rank(meta.data, baseline.data);
  const measuredEnough = ranking.source === 'measured';

  const measuredSection = (
    <section>
      <h2>Most faced</h2>
      {/* A3: this used to carry two paragraphs of definitions (what "faced", "record" and
       * "trend" mean) before the first row. Those definitions now live on the About page, under
       * "How to read the lists"; this is the one line that actually varies screen to screen, so
       * it is the one line that stays here. */}
      <p className="sub">
        From {battlesText(ranking.battles)} shared by {count(ranking.devices)}{' '}
        {plural(ranking.devices, 'device', 'devices')}.
      </p>
      <div className="fine" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Top {ranking.measured.length} - most faced</span>
        <span>faced - record</span>
      </div>
      <div className="list">
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
      </div>
      <p className="fine">
        {/* A4: RANKED_SHARE is a stated cut, not a glance-at number, so it keeps its decimal
         * (pctPrecise) rather than rounding 0.5% up to a misleading "1%". */}
        Only Pokemon faced in at least {pctPrecise(RANKED_SHARE)}% of battles are ranked.
      </p>
      <p className="fine">
        Updated every {count(BUCKET_MS / 60_000)} {plural(BUCKET_MS / 60_000, 'minute', 'minutes')}{' '}
        from battles shared by pick3 players.
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
          <div className="list">
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
          </div>
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
