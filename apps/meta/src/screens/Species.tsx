/**
 * The species page: the hero (sprite, types, the one measured line and PvPoke's rank), how often
 * reporters faced this Pokemon over time, their record against it, what they saw it alongside,
 * and the moveset they ran when they used it themselves. PvPoke's own recommended set sits
 * alongside as a clearly separate, unmeasured card (see Pokemon.tsx's header comment for the
 * two-sources rule this whole site follows).
 *
 * Ruling 7 (docs/superpowers/specs/2026-09-28-design-meta-design.md, "Species"): the hero leads
 * with the same figure the Pokemon list's own rows lead with, `facedFigure`/`facedWords`
 * (Pokemon.tsx), so the two screens can never quietly disagree about the same species in the same
 * window. The rank band card ("Record against it, by rank") is retired with the band axis; the
 * old blend paragraph is retired too, since the list above already carries it.
 */
import { Fragment, type ReactNode } from 'react';
import { Button, Empty, ErrorState, Loading, MeasuredLine, Tag } from '@pickthree/ui';
import type { MetaSummaryV1, MovesetStats, SpeciesDetailV1 } from '../api.js';
import type { Baseline, BaselineSpecies } from '../baseline.js';
import { Chevron, ConfidenceTag, Sparkline, Sprite, TypeChip, TypeChips } from '../components.js';
import { speciesOf, type StaticData } from '../data.js';
import { battles as battlesText, count, pctFloor, plural } from '../format.js';
import type { Legal } from '../legal.js';
import { buildLink, countersLink } from '../links.js';
import type { SpeciesRanking } from '../rank.js';
import type { Query, View } from '../route.js';
import { facedFigure, facedWords } from './Pokemon.js';
import { marginSentence, SHARE_MIN, trendLabel, trendPoints, winRate } from '../stats.js';
import type { Loaded } from '../useMeta.js';

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

/** A move id and the battles behind it, aggregated across every complete set the worker
 * recorded. Correction 1 (task-12-report.md): the brief's own test expects one row per move,
 * not one per set, so sets containing the same move are folded together here before a share is
 * ever computed. */
interface MoveShare {
  moveId: string;
  battles: number;
}

/** Task 4: `detail.runs` counts every battle the species was run in, but the worker only records
 * a moveset when the moves it saw were actually known (workers/counter/src/battles.ts ~255-265),
 * so a move share must be a share of the battles whose moves are known, not of every run. Dividing
 * by `runs` instead is the bug this fixes: a species run in 62 battles with only 5 known movesets
 * showed each of those moves at 8% (5 of 62) rather than 100% (5 of 5). */
export function knownMoveBattles(movesets: readonly MovesetStats[]): number {
  return movesets.reduce((sum, m) => sum + m.battles, 0);
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
  known,
  data,
}: {
  moveId: string;
  kind: 'F' | 'C';
  battles: number;
  /** Task 4: the battles whose moves are known (`knownMoveBattles`), not every battle the
   * species was run in. */
  known: number;
  data: StaticData;
}) {
  const move = data.moves.get(moveId);
  const sharePct = known > 0 ? (battles / known) * 100 : 0;
  return (
    <span className="pick-move">
      <i className="pick-move-k">{kind}</i>
      <span className="pick-move-name">{move?.name ?? moveId}</span>
      {move ? <TypeChip type={move.type} small /> : null}
      <span className="fine pick-move-share">{Math.round(sharePct)}%</span>
    </span>
  );
}

/** Correction 2 (task-12-report.md): `runs` counts battles, not distinct reporters, so the sub
 * line never claims "N reporters ran it themselves", which this site's own numbers do not
 * support. Task 4: the sub line and every share below it are now over `known`, the battles whose
 * moves the worker actually recorded (Review Focus 4: `known === 0` renders "No moves reported
 * yet." instead of a share computed from a zero denominator, whether that is no movesets at all
 * or movesets that only ever recorded zero battles). */
function MovesetCard({ detail, data }: { detail: SpeciesDetailV1; data: StaticData }) {
  if (detail.runs === 0) {
    return (
      <section className="card">
        <h2>Moves reporters ran</h2>
        <p className="sub">Nobody who shares battles has run it in this window.</p>
      </section>
    );
  }
  const known = knownMoveBattles(detail.movesets);
  if (known === 0) {
    return (
      <section className="card">
        <h2>Moves reporters ran</h2>
        <p className="sub">No moves reported yet.</p>
      </section>
    );
  }
  const fastShares = aggregateMoves(detail.movesets, (m) => [m.fast]);
  const chargedShares = aggregateMoves(detail.movesets, (m) => m.charged);
  return (
    <section className="card">
      <h2>Moves reporters ran</h2>
      <p className="sub">
        {`Moves known in ${count(known)} of ${count(detail.runs)} ${plural(detail.runs, 'battle', 'battles')}`}
      </p>
      <div className="pick-moves">
        {fastShares.map((s) => (
          <MoveLine
            key={`fast-${s.moveId}`}
            moveId={s.moveId}
            kind="F"
            battles={s.battles}
            known={known}
            data={data}
          />
        ))}
        {chargedShares.map((s) => (
          <MoveLine
            key={`charged-${s.moveId}`}
            moveId={s.moveId}
            kind="C"
            battles={s.battles}
            known={known}
            data={data}
          />
        ))}
      </div>
    </section>
  );
}

/** Sets from RK9 roster entries, not from battles: a roster says what a player brought. Over
 *  KNOWN sets only, with the count stated, because a missing moveset is left out of the
 *  denominator and is never counted as "ran the recommended set". */
function TournamentMovesCard({
  block,
  entry,
  data,
}: {
  block: NonNullable<SpeciesDetailV1['tournament']>;
  entry: BaselineSpecies | null;
  data: StaticData;
}) {
  if (block.movesets.length === 0) {
    return null;
  }
  const recommended =
    entry !== null ? `${entry.fastMove}|${[...entry.chargedMoves].sort().join('+')}` : null;
  return (
    <section className="card">
      <h2>Moves at tournaments</h2>
      <p className="sub">
        {`From ${count(block.movesetsKnown)} known ${plural(block.movesetsKnown, 'set', 'sets')} of ${count(block.broughtBy)} ${plural(block.broughtBy, 'roster entry', 'roster entries')}`}
      </p>
      <div className="pick-moves">
        {block.movesets.map((set) => {
          const key = `${set.fast}|${[...set.charged].sort().join('+')}`;
          const names = [set.fast, ...set.charged].map((id) => data.moves.get(id)?.name ?? id);
          return (
            // A Fragment, not a wrapping element: `.pick-moves` is a flex column, so its own
            // children (only) each land on their own line. The Tag needs to be one of those
            // children, not nested inside the `.pick-move` span, or it would sit on the same
            // line as the move names instead of the "on its own line" the spec asks for.
            <Fragment key={key}>
              <span className="pick-move">
                <span className="pick-move-name">{joinAnd(names)}</span>
                <span className="fine pick-move-share">
                  {`${count(set.entries)} ${plural(set.entries, 'entry', 'entries')}`}
                </span>
              </span>
              {key === recommended ? <Tag>PvPoke&apos;s set</Tag> : null}
            </Fragment>
          );
        })}
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
  // Ruling 7: shown only with 3 or more weeks in the window; with fewer, the card is left out
  // entirely (not even the counts-only fallback below), since two points cannot show a trend.
  if (weekly.length < 3) {
    return null;
  }
  // All-or-nothing, on purpose: see the comment above for the two bugs a per-week filter caused.
  const everyWeekQualifies = weekly.every((w) => w.battles >= SHARE_MIN);
  if (!everyWeekQualifies) {
    const sightings = weekly.reduce((sum, w) => sum + w.sightings, 0);
    const battles = weekly.reduce((sum, w) => sum + w.battles, 0);
    return (
      <section className="card">
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
    <section className="card">
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

/** The tournaments figures, under the ladder ones in the same card: the same species, a
 *  different population, and never merged into one number. A banned species says so instead of
 *  showing zeros, because zero says nobody picked it, which is false. */
function tournamentRow(block: SpeciesDetailV1['tournament'], banned: boolean): ReactNode {
  if (banned) {
    return <p className="fine">Banned at tournaments</p>;
  }
  if (!block || block.picks === 0) {
    return null;
  }
  const decided = block.wins + block.losses;
  return (
    <>
      <p className="sub">
        {`Tournaments: ${count(block.picks)} ${plural(block.picks, 'pick', 'picks')}, ${count(block.game1Picks)} in game one, players went ${block.wins}-${block.losses}`}{' '}
        {decided > 0 ? <ConfidenceTag n={decided} /> : null}
      </p>
      {block.unresolvedForms > 0 ? (
        <p className="fine">
          {`${count(block.unresolvedForms)} ${plural(block.unresolvedForms, 'pick', 'picks')} didn't show whether it was Shadow.`}
        </p>
      ) : null}
    </>
  );
}

/** The roster join, which is the one thing only tournaments can say: what a player BROUGHT, as
 * against what they picked. "Never picked" always means never picked on stream, and the
 * sentence says so rather than leaving a reader to assume a whole event was watched. A banned
 * species says so and nothing else (same rule `tournamentRow` applies, checked first here too):
 * "picked in their streamed battles" would contradict "Banned at tournaments" even when the
 * underlying roster counts are nonzero. */
function rosterLine(block: SpeciesDetailV1['tournament'], banned: boolean): string | null {
  if (banned || !block || block.rosterSize === 0 || block.broughtBy === 0) {
    return null;
  }
  const seen = `Brought by ${count(block.broughtBy)} of ${count(block.rosterSize)} ${plural(block.rosterSize, 'player', 'players')} seen on stream`;
  if (block.pickedOnStream === 0) {
    return `${seen}, never picked on stream.`;
  }
  return `${seen}, picked in ${count(block.pickedOnStream)} of their streamed ${plural(block.pickedOnStream, 'battle', 'battles')}.`;
}

/**
 * Fix (Finding 1, symptom 3 of the 2026-09-21 whole-branch review): under `source=tournament`,
 * `detail.wins`/`detail.losses` are the broadcast/tournament record (computed over the mirrored
 * rows `tournamentSpeciesDetail` builds, workers/counter/src/tournamentRead.ts), not reporters'
 * own results, and `tournamentRow` below already prints that same record as "players went W-L".
 * Printing both would show the same fact twice under two different, half-contradictory labels
 * ("Reporters' record" next to a number that has no reporters behind it). Under that source this
 * card shows only the tournament line and the roster join; the ladder-labeled rate block renders
 * only when this really is a reporter population. Ruling 7 moved the two action links (Who beats
 * it, Build a team around it) out of this card and onto the page itself (`ActionLinks` below),
 * since they apply on every source, including PvPoke and zero sightings, where this card never
 * renders at all. */
function RecordCard({
  detail,
  banned,
  tournamentSource,
}: {
  detail: SpeciesDetailV1;
  banned: boolean;
  /** True under `query.source === 'tournament'`: see the comment above. */
  tournamentSource: boolean;
}) {
  const rate = winRate(detail.wins, detail.losses);
  const decided = detail.wins + detail.losses;
  const roster = rosterLine(detail.tournament, banned);
  return (
    <section className="card">
      <h2>{tournamentSource ? 'At tournaments' : "Reporters' record against it"}</h2>
      {tournamentSource ? null : rate === null ? (
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
      {tournamentRow(detail.tournament, banned)}
      {roster ? <p className="fine">{roster}</p> : null}
    </section>
  );
}

/** Ruling 7's two labeled text links, at the foot of the page on every source, including PvPoke
 * and a species with zero sightings this window: neither depends on measured data, only on the
 * league and the id, so nothing above ever has to gate them. `Button`'s `text` variant is pick3's
 * plain violet link style; the trailing `Chevron` matches Teams.tsx's own "Open in pick3" links. */
function ActionLinks({ league, speciesId }: { league: string; speciesId: string }): ReactNode {
  return (
    <div className="species-actions">
      <Button variant="text" href={countersLink(league, speciesId)}>
        Who beats it <Chevron />
      </Button>
      <Button variant="text" href={buildLink(league, speciesId)}>
        Build a team around it <Chevron />
      </Button>
    </div>
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
    <section className="card">
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
                  {other.name}
                </span>
                {/* Spec: "share and count on their own lines so a long name never wraps into the
                 * numbers", as two elements, not one string joined by a dash: each is its own
                 * flex item of the column above, so each lands on its own line. */}
                <span className="fine">{`${Math.round(share)}%`}</span>
                <span className="fine">{battlesText(a.battles)}</span>
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
    <section className="card">
      <h2>PvPoke&apos;s set</h2>
      <p className="sub">{`PvPoke recommends ${joinAnd(names)}.`}</p>
      <p className="fine">PvPoke score: {entry.score !== null ? entry.score : '-'}.</p>
      <p className="fine">Not measured play.</p>
    </section>
  );
}

/** Ruling 7's hero line: the same figure the Pokemon list's own row leads with (`facedFigure`),
 * worded for a single-species page rather than a row among many. Ladder and All read as a share
 * of what players face; Tournaments reads as a share of tournament battles, in picks, since that
 * population is not what "what players face" means. */
function heroFigureText(
  isTournament: boolean,
  figure: { share: number; n: number; of: number },
): string {
  const p = pctFloor(figure.share);
  return isTournament
    ? `${p} of tournament battles · ${count(figure.n)} of ${count(figure.of)} ${plural(figure.of, 'pick', 'picks')}`
    : `${p} of what players face · ${count(figure.n)} of ${count(figure.of)} ${plural(figure.of, 'battle', 'battles')}`;
}

export function Species(p: {
  league: string;
  speciesId: string;
  query: Query;
  data: StaticData;
  detail: Loaded<SpeciesDetailV1>;
  meta: Loaded<MetaSummaryV1>;
  baseline: Loaded<Baseline>;
  /** The same blended ranking Pokemon and Teams read (App.tsx computes it once). Null while it
   * is loading or one of its own three sources failed; the hero simply omits its own line rather
   * than guessing at a figure it does not have. */
  ranking: SpeciesRanking | null;
  /** The league's Play! ban list, or null while it is loading. A banned species is marked as
   *  banned rather than shown with zeros. */
  legal: Legal | null;
  now: Date;
  href: (view: View) => string;
  /** Retries whichever of the species detail or the meta summary actually failed (App.tsx's
   *  `retryDetail`), the same shape as Teams' and Pokemon's own "Try again". */
  onRetry: () => void;
}): ReactNode {
  const { league, speciesId, data, detail, meta, baseline, ranking, legal, href, onRetry } = p;

  // Ruling: not found is decided from the static data alone, before any fetch result: a species
  // id nothing on this site knows about gets `Empty`, not a guessed title-cased name (`speciesOf`'s
  // own fallback) sitting over a card that can never load anything real.
  if (!data.species.has(speciesId)) {
    const leagueTitle = data.leagues.find((l) => l.id === league)?.title ?? league;
    return (
      <main>
        <Empty
          line={`No Pokémon by that name in ${leagueTitle}.`}
          action={
            <Button variant="text" href={href({ name: 'pokemon', league })}>
              See the Pokémon list <Chevron />
            </Button>
          }
        />
      </main>
    );
  }

  const species = speciesOf(data, speciesId);
  const banned = legal?.banned.has(speciesId) ?? false;

  // Finding 1 (2026-09-21 whole-branch review): this screen used to read query.source nowhere
  // past building the header line, so every card below it kept rendering as if the ladder's own
  // measured numbers applied no matter which source was picked. `isPrior` and `isTournament` are
  // read once here and gate every card the rest of the function draws, the same way Pokemon.tsx's
  // `facedFigure`/`recordOf` and Teams.tsx's `observed` memo already key off `query.source`/
  // `ranking.source` for their own cards.
  const isPrior = p.query.source === 'prior';
  const isTournament = p.query.source === 'tournament';

  // The same blended row Pokemon.tsx's own rows read (rank.ts's `rankSpecies`): ruling 7's hero
  // reuses `facedFigure`/`facedWords`, the exact rule the list's own rows follow, rather than a
  // second copy of it, so the hero and the list can never quietly disagree about this species in
  // this window.
  const rankRow = ranking?.rows.find((x) => x.speciesId === speciesId) ?? null;
  const figure = ranking && rankRow ? facedFigure(rankRow, ranking) : null;
  const words = ranking && rankRow ? facedWords(rankRow, ranking) : null;
  const pvpokeText = rankRow
    ? rankRow.pvpokeRank !== null
      ? `PvPoke #${rankRow.pvpokeRank}`
      : 'New'
    : null;

  // Task 5: the sub header carries no title any more (just the back control and the pick3 link),
  // so the species name has to live here instead, as the page's own title, or no build ever
  // names the page. Ruling 7: the sprite grows to 96px and the one MeasuredLine, then PvPoke's
  // rank (small and muted), finish the hero; the old blend paragraph and "#1 of what players
  // face" standing are both dropped (the list above already carries the first, and the list's own
  // order already says the second).
  const headerTop = (
    <>
      <h2 className="hero-name">{species.name}</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Sprite species={species} size={96} />
        <TypeChips types={species.types} />
      </div>
      {figure ? (
        <MeasuredLine>{heroFigureText(isTournament, figure)}</MeasuredLine>
      ) : words ? (
        <p className="sub">{words}</p>
      ) : null}
      {pvpokeText ? <p className="sub">{pvpokeText}</p> : null}
    </>
  );

  // Fix round 1: `headerTop` is wrapped in the same `<section>` in every branch below, error,
  // loading and loaded alike. It used to sit bare in `<main>` here and only gain a `<section>`
  // wrapper in the loaded branch further down; React sees that as two different element types at
  // the same position in the tree, so it tore the hero down and rebuilt it (losing the element a
  // caller was mid-query for, a real flake this task's own species detail gating exposed: the
  // fetch, and so this transition, now genuinely happens instead of usually resolving before
  // Species ever paints its loading state) the moment the page moved from loading to loaded. One
  // consistent wrapper keeps the hero's own DOM node stable across every state change.
  if (detail.state === 'error' || meta.state === 'error') {
    return (
      <main>
        <section>{headerTop}</section>
        <ErrorState
          line="Could not load this Pokémon's record."
          action={<Button onClick={onRetry}>Try again</Button>}
        />
      </main>
    );
  }

  if (!detail.data || !meta.data) {
    return (
      <main>
        <section>{headerTop}</section>
        <Loading label="Loading" />
      </main>
    );
  }

  const d = detail.data;
  const baselineEntry = baseline.data?.byId.get(speciesId) ?? null;

  // Used both by the zero-sightings branch's own tournaments card and by RecordCard, computed
  // once here rather than twice.
  const roster = rosterLine(d.tournament, banned);

  return (
    <main>
      <section>{headerTop}</section>
      {isPrior ? (
        // Symptom 1: under `prior` nothing is measured (rank.ts's `rankSpecies` turns both the
        // ladder and the tournament terms off for this source), so none of the cards below, which
        // are every one of them built from measured play, have anything honest to show.
        <p className="sub">Switch source to see what players have actually faced.</p>
      ) : d.sightings === 0 ? (
        <>
          <p className="sub">No shared battles mention it in this window.</p>
          {/* Task 14: tournament data can exist even when this window has zero ladder sightings,
           * so this branch must not hide it the way it used to hide every card. */}
          {d.tournament || banned ? (
            <section className="card">
              <h2>At tournaments</h2>
              {tournamentRow(d.tournament, banned)}
              {roster ? <p className="fine">{roster}</p> : null}
            </section>
          ) : null}
        </>
      ) : (
        <>
          <WeeklyCard weekly={d.weekly} />
          <RecordCard detail={d} banned={banned} tournamentSource={isTournament} />
          <AlongsideCard
            alongside={d.alongside}
            sightings={d.sightings}
            data={data}
            league={league}
            href={href}
          />
        </>
      )}
      {isPrior ? null : <MovesetCard detail={d} data={data} />}
      {!isPrior && d.tournament && !banned ? (
        <TournamentMovesCard block={d.tournament} entry={baselineEntry} data={data} />
      ) : null}
      {baselineEntry ? <PvPokeCard entry={baselineEntry} data={data} /> : null}
      <ActionLinks league={league} speciesId={speciesId} />
    </main>
  );
}
