/**
 * The team board: cores as the spine, complete teams nested under each. This is the league root
 * (Task 11), so it is the first thing a reader sees, in whatever state the meta happens to be in
 * on day one: nothing measured yet, a handful of shared battles, or a mature league with hundreds
 * of devices reporting.
 *
 * `buildBoard` (teamRank.ts) does the ranking; this screen only renders it, and renders it
 * honestly. See docs/superpowers/specs/2026-09-18-meta-site-design.md and teamRank.ts's own
 * header comment for the rule this screen exists to enforce: the blended `score` that sorts the
 * board is a ranking key, never a fact about a team, and is never printed. A row prints at most
 * two things about itself: a matchup score out of 100 (a projection worked out from PvPoke's
 * matchup data, explained once by the `Term` in the section header, and NEVER printed as a
 * percentage) and a measured record (always as a win-loss count, never a percentage), because
 * those are the two things about a row that are actually true. A percentage on this site always
 * means real battles.
 *
 * Two sources feed a row the same way they feed Pokemon.tsx (see that file's header comment for
 * the two-sources rule this site follows everywhere): PvPoke's projection, and measured play.
 * Neither is hidden here just because the other exists.
 *
 * Shape: a row is one tappable line (sprites, title, a one-line summary, its matchup score) that
 * opens onto the full facts. The ranking rework made the board long enough that a full-height
 * card per row put one row on a phone screen; hundreds of cores need a list a reader can scan.
 * Nothing was dropped in the shrink, it moved into the panel: every sentence the old card
 * printed still prints, one tap away. `boardView.ts` holds the ordering and the summary line.
 */
import { useState, type ReactNode } from 'react';
import type { MovesetStats } from '../api.js';
import { Chevron, Chip, Note, Sprite, Term } from '../components.js';
import { speciesOf, type StaticData } from '../data.js';
import { battles as battlesText, battleWord, count, plural } from '../format.js';
import { sourceHeaderLine } from '../headerCopy.js';
import { teamLink, type LinkMember } from '../links.js';
import type { Epoch } from '../epochs.js';
import { commitMismatch } from '../epochs.js';
import type { SpeciesRanking } from '../rank.js';
import type { Board, BoardRow } from '../teamRank.js';
import { multiTeamOnly, sortRows, subLine, teamsSeen, SORTS, type SortKey } from '../boardView.js';
import { Contribute } from './Pokemon.js';

/** The members `teamLink` wants: each species id, with its most common moveset when the record
 * has enough battles behind it to name one. Only a complete, three-member team is ever passed
 * here: pick3's `parseTeamPath` (apps/web/src/teamLink.ts) answers any other count with "A team
 * link needs three Pokemon", so a core links through one of its builds instead (see `Row`). */
function membersOf(
  species: readonly string[],
  moves: readonly (MovesetStats | null)[],
): LinkMember[] {
  return species.map((speciesId, i): LinkMember => {
    const mv = moves[i];
    return mv ? { speciesId, moves: { fast: mv.fast, charged: mv.charged } } : { speciesId };
  });
}

/** "Core" for a two-member row, "Full team" for a complete one, or "Projected" for a row nobody
 * has run or faced yet: the generated tag always wins over the kind, since a generated row is
 * never a "team" a reporter actually fielded. */
function kindTag(row: BoardRow): string {
  if (row.source === 'generated') {
    return 'Projected';
  }
  return row.kind === 'core' ? 'Core' : 'Full team';
}

/** The observed record, as counts, never as a percentage: the honesty rule this whole screen
 * exists to enforce is easiest to keep when there is no rate to slip up and print. */
function recordLine(row: BoardRow): string {
  const hasRun = row.runBattles > 0;
  const hasFaced = row.facedBattles > 0;
  if (row.decided === 0) {
    const total = row.runBattles + row.facedBattles;
    return `Seen ${count(total)} ${plural(total, 'time', 'times')}, no result recorded`;
  }
  // I3: day one on the front door is exactly the low-count regime, so every branch inflects on
  // 1 rather than printing "Run 1 times".
  const run = `${count(row.runBattles)} ${plural(row.runBattles, 'time', 'times')}`;
  const faced = `${count(row.facedBattles)} ${plural(row.facedBattles, 'time', 'times')}`;
  if (hasRun && hasFaced) {
    const wins = row.runWins + row.facedWins;
    const losses = row.runLosses + row.facedLosses;
    return `Run ${run} and faced ${faced}, the team went ${wins}-${losses} overall`;
  }
  if (hasFaced) {
    return `Faced ${faced}, players went ${row.facedLosses}-${row.facedWins}`;
  }
  return `Run ${run}, reporters went ${row.runWins}-${row.runLosses}`;
}

/** Oxford-less "A, B and C", the only join this screen ever needs, and always with a leading
 * lowercase connector rather than a comma before "and" (matches the copy table's example). */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  const last = names[names.length - 1] as string;
  const rest = names.slice(0, -1).join(', ');
  return `${rest} and ${last}`;
}

/** The members that cost a row its projection, by their plain display name: `outsideSlice` only
 * means "not in the top-250 matrix slice", never "unknown". `species.json` is baked from the
 * whole `pokemon.json`, not the ranked slice, so the lookup always resolves.
 *
 * I4: this used to say "outside PvPoke's ranked list", which is false. PvPoke's Great League
 * overall list runs to over a thousand entries; the slice this site ships is the top 250 of it
 * (`MATRIX_TOP` in apps/meta/scripts/bake.ts). A species PvPoke ranks #400 is on PvPoke's list
 * and off ours, and pick3's opponent picker searches every species, so logging one is ordinary.
 * About.tsx's "What projected means" section carries the same wording. */
function outsideText(ids: readonly string[], data: StaticData): string {
  const names = ids.map((id) => speciesOf(data, id).short);
  return `No projection: ${joinNames(names)} ${names.length === 1 ? 'is' : 'are'} outside the ranked list this site ships projections for.`;
}

/** `Matchup score <S> of 100`, S = the row's own `strength` rounded to a whole number. A
 * percentage on this site always means real battles, so a projection is never turned into one:
 * this is the one and only place this screen prints a projection in a sentence, and it prints a
 * score out of 100, not a percent sign. The bare number on a collapsed row head is the same
 * figure through `scoreOf` below, named for a screen reader by the head's own label. The
 * explanation lives once, behind the `Term` in the section header, not repeated on every row. */
function matchupScoreLine(strength: number): string {
  return `Matchup score ${Math.round(strength)} of 100`;
}

/** The matchup score as the bare figure a collapsed row shows, or null when the row has no
 * projection at all. Same rounding as `matchupScoreLine`, so the head and the panel can never
 * print two different numbers for one row. */
function scoreOf(row: BoardRow): number | null {
  return row.strength === null ? null : Math.round(row.strength);
}

/** The explainer behind the "Matchup score" term, hosted once in the section header rather than
 * inside any row: a row's `Term` would be interactive content nested inside the row's own
 * controls, the same invalid-markup problem two earlier fix rounds already found and removed for
 * "New" on the Pokemon screen (see that file's `newExplainer`).
 *
 * Fix round 1, item 2: the closing clause used to say "not from battles anyone played", which is
 * false. `buildBoard` calls `strengthContext(view, ranking.weights)` with the BLENDED weights
 * (teamRank.ts), so which opponents count as "the meta" and "the top of it" is itself shaped by
 * measured play, same as simStrength.ts's own module doc says. What is true, and what the clause
 * says now, is that no battle RESULT feeds the number: only which opponents matter, never who won.
 * Also names the other half of the safety factor this used to leave out: a hard-losing switch
 * matchup (named already) is one half of `strengthOf`'s safety score, an unanswered top opponent
 * (`topUncovered`) is the other, and it is the one that actually separates most real teams. */
function matchupScoreExplainer(): string {
  return "How much of the meta the three of them beat between them, how well those wins hold when shields change, whether a top opponent goes completely unanswered, and whether the switch has matchups that simply end it. Worked out from PvPoke's matchup data, weighted by how often each opponent is actually faced, not from how anyone's battles turned out.";
}

/** The one fact block every row needs: what it is made of, and how (projected, run, faced, or
 * some mix), in that order, never printing the score that ranked it. */
function RowFacts({ row, data }: { row: BoardRow; data: StaticData }): ReactNode {
  return (
    <>
      {row.source === 'generated' ? (
        <p className="fine">
          Projected against PvPoke&apos;s group, not yet seen in shared battles
        </p>
      ) : (
        <p className="fine">{recordLine(row)}</p>
      )}
      {row.strength !== null ? (
        <p className="fine">{matchupScoreLine(row.strength)}</p>
      ) : row.outsideSlice.length > 0 ? (
        <p className="fine">{outsideText(row.outsideSlice, data)}</p>
      ) : null}
    </>
  );
}

/** The distinct thirds a core has actually been seen complete with, read off its own observed
 * `builds` rather than a separate field: the chips below and the nested build list must never be
 * able to disagree about what "seen with" means, so there is only one source for it.
 *
 * `builds` nests generated teams alongside observed ones (a generated team whose pair was never
 * run still belongs under its core), but "seen with" is a claim about OBSERVED play, so a
 * generated build is filtered out here. `teamsSeen` (boardView.ts) counts the same builds this
 * walks, which is what keeps the chips, the collapsed line's team count and the multi-team
 * filter in step. */
function thirdsOf(core: BoardRow): string[] {
  const pair = new Set(core.species);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const build of core.builds) {
    if (build.source === 'generated') {
      continue;
    }
    const third = build.species.find((id) => !pair.has(id));
    if (third !== undefined && !seen.has(third)) {
      seen.add(third);
      out.push(third);
    }
  }
  return out;
}

/** What has filled a core's third slot, as tokens rather than a sentence: on a board of hundreds
 * this is the fact a reader is actually scanning for, and three names in a row read faster as
 * three sprites than as prose. A core nobody has been seen complete with gets the sentence
 * instead, since there is nothing to show. */
function CoreThirds({ core, data }: { core: BoardRow; data: StaticData }): ReactNode {
  const thirds = thirdsOf(core);
  if (thirds.length > 0) {
    return (
      <div className="row-part">
        <p className="row-label">Seen with</p>
        <div className="third-chips">
          {thirds.map((id) => {
            const s = speciesOf(data, id);
            return (
              <span className="third-chip" key={id}>
                <Sprite species={s} size={18} />
                {s.short}
              </span>
            );
          })}
        </div>
      </div>
    );
  }
  // The canned sentence below claims a projection exists ("Projected against any third PvPoke
  // would expect"). When it does not (the pair itself is outside the slice), RowFacts already
  // says so with its own "No projection: ..." line; printing this one too would have the row
  // contradict itself in two adjacent lines about whether a projection exists at all.
  if (core.projection !== null) {
    return (
      <p className="fine">Never seen complete. Projected against any third PvPoke would expect.</p>
    );
  }
  return null;
}

/** A nested build under a core: a compact line, not a row of its own, since the core's head
 * already carries the sprites at that size. Its own fact is whichever of a record or a projection
 * actually applies to it, never both, to keep the line to one thought. */
function BuildLine({
  build,
  data,
  league,
}: {
  build: BoardRow;
  data: StaticData;
  league: string;
}): ReactNode {
  const species = build.species.map((id) => speciesOf(data, id));
  const href = teamLink(league, membersOf(build.species, build.moves));
  const seen = build.runBattles + build.facedBattles > 0;
  const fact = seen
    ? recordLine(build)
    : build.strength !== null
      ? matchupScoreLine(build.strength)
      : build.outsideSlice.length > 0
        ? outsideText(build.outsideSlice, data)
        : '';
  return (
    <a className="build-line" href={href}>
      <span className="build-sprites">
        {species.map((s) => (
          <Sprite key={s.id} species={s} size={26} />
        ))}
      </span>
      <span className="tag tag-kind">{kindTag(build)}</span>
      <span className="fine build-fact">{fact}</span>
      <span className="team-details">
        Open in pick3 <Chevron />
      </span>
    </a>
  );
}

/** What a collapsed head says out loud. The bare figure on the right is the matchup score and
 * nothing else identifies it, so the label names it rather than leaving a screen reader to read
 * "87" after the record and let the listener guess what it counts. */
function headLabel(row: BoardRow, title: string): string {
  const score = scoreOf(row);
  const tail = score === null ? '' : `. ${matchupScoreLine(score)}`;
  return `${title}. ${subLine(row)}${tail}`;
}

/** A top-level row: a head that toggles, and the facts underneath when it is open.
 *
 * The head is a `<button>` and every link lives in the panel below it, so nothing interactive is
 * ever nested inside anything else interactive. That is what the old card shape had to work
 * around with three separate branches (a plain div, a div with a foot link, or one big anchor);
 * the split removes the problem rather than routing around it.
 *
 * C1: a core never carries a pick3 link of its own. A core is two species and a pick3 team link
 * needs three (apps/web/src/teamLink.ts), so the only honest destinations a core has are the
 * complete teams built on it, and those are the nested build lines, each already linking to its
 * own three-member team, best first. A core with no build at all therefore has no link anywhere
 * under it, which is right: there is no three-Pokemon team to point at. */
function Row({
  row,
  data,
  league,
  open,
  onToggle,
}: {
  row: BoardRow;
  data: StaticData;
  league: string;
  open: boolean;
  onToggle: () => void;
}): ReactNode {
  const isCore = row.kind === 'core';
  const species = row.species.map((id) => speciesOf(data, id));
  // A label, not a sentence: "A, B and C" wastes three characters on a line that truncates at
  // phone width, and it truncated mid-"and". A plain comma join breaks at a name boundary more
  // often and fits one more name before the ellipsis.
  const title = species.map((sp) => sp.short).join(', ');
  const score = scoreOf(row);

  return (
    <div className={`team-row${open ? ' open' : ''}`}>
      <button
        type="button"
        className="row-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={headLabel(row, title)}
      >
        <span className="row-sprites">
          {species.map((s) => (
            <Sprite key={s.id} species={s} size={30} />
          ))}
        </span>
        <span className="row-text">
          <span className="row-title">{title}</span>
          <span className="row-sub">{subLine(row)}</span>
        </span>
        <span className="row-score">{score === null ? '' : count(score)}</span>
        <Chevron dir={open ? 'up' : 'down'} />
      </button>

      {open ? (
        <div className="row-body">
          <div className="row-facts">
            <span className="tag tag-kind">{kindTag(row)}</span>
            <RowFacts row={row} data={data} />
          </div>
          {isCore ? <CoreThirds core={row} data={data} /> : null}
          {isCore && row.builds.length > 0 ? (
            <div className="row-part">
              <p className="row-label">Built as</p>
              <div className="builds">
                {row.builds.map((build) => (
                  <BuildLine
                    key={build.species.join('+')}
                    build={build}
                    data={data}
                    league={league}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {isCore ? null : (
            <div className="cost-line">
              <a
                className="team-details"
                href={teamLink(league, membersOf(row.species, row.moves))}
              >
                Open in pick3 <Chevron />
              </a>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Under All the board mixes two populations, which is the one place on this site they are
 *  mixed, so it says so with the count from each rather than leaving a reader to assume one. */
function sourcesLine(sources: Record<string, number>): string | null {
  const ladder = sources['ladder'] ?? 0;
  const tournament = sources['broadcast'] ?? 0;
  if (ladder === 0 || tournament === 0) {
    return null;
  }
  return `From ${battlesText(ladder)} shared and ${count(tournament)} tournament ${battleWord(tournament)}.`;
}

/** What is on screen right now, counted by kind rather than as a bare row total: "14 cores, 3
 * teams" tells a reader what the list is made of, and it moves when the filter does, which is
 * the whole point of showing it next to the filter. */
function countLabel(rows: readonly BoardRow[]): string {
  const cores = rows.filter((row) => row.kind === 'core').length;
  const teams = rows.length - cores;
  const parts: string[] = [];
  if (cores > 0) {
    parts.push(`${count(cores)} ${plural(cores, 'core', 'cores')}`);
  }
  if (teams > 0) {
    parts.push(`${count(teams)} ${plural(teams, 'team', 'teams')}`);
  }
  return parts.join(', ');
}

/** The board's own controls: how many rows are on screen, the multi-team filter and the sort.
 * The sort is a cycle rather than a menu because there are four of them and the current one is
 * the label, so it costs one tap and no screen space. */
function Controls({
  rows,
  multiOnly,
  onToggleMulti,
  sort,
  onCycleSort,
  showFilter,
}: {
  rows: readonly BoardRow[];
  multiOnly: boolean;
  onToggleMulti: () => void;
  sort: SortKey;
  onCycleSort: () => void;
  showFilter: boolean;
}): ReactNode {
  const label = SORTS.find((s) => s.key === sort)?.label ?? SORTS[0]?.label ?? '';
  return (
    <div className="board-controls">
      <span className="fine board-count">{countLabel(rows)}</span>
      {showFilter ? (
        <Chip on={multiOnly} onClick={onToggleMulti}>
          Multi-team only
        </Chip>
      ) : null}
      <Chip on={sort !== 'ranked'} onClick={onCycleSort}>
        {`Sort: ${label}`}
      </Chip>
    </div>
  );
}

export function Teams(p: {
  league: string;
  data: StaticData;
  /**
   * True when any of the four sources the board is built from (the shared teams, the meta
   * summary, the baseline or the rank order) failed to load. `useSlice` is deliberately not one
   * of them: it is allowed to degrade to `board.projectionless` rather than blank the screen.
   */
  boardError: boolean;
  board: Board | null;
  ranking: SpeciesRanking | null;
  epoch: Epoch | null;
  bakedCommit: string | null;
  /** Counted battles by source in the window (`MetaSummaryV1.sources`), for the one sentence
   *  under the header that says how much of the All board came from each population. */
  sources: Record<string, number>;
}): ReactNode {
  const { league, data, boardError, board, ranking, epoch, bakedCommit, sources } = p;
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [multiOnly, setMultiOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('ranked');

  if (boardError) {
    return (
      <main>
        <p className="sub">Could not load the shared teams. Try again in a moment.</p>
      </main>
    );
  }

  if (!board || !ranking) {
    return (
      <main>
        <p className="sub">Loading</p>
      </main>
    );
  }

  const mismatch = bakedCommit !== null && epoch !== null && commitMismatch(epoch, bakedCommit);
  const bakedShort = bakedCommit !== null ? bakedCommit.slice(0, 7) : null;
  const empty = board.rows.length === 0;
  // The filter is only offered when it has something to act on: a board with no core in two or
  // more teams would answer every tap with an empty list, which is a control that lies about
  // what it does.
  const showFilter = board.rows.some((row) => row.kind === 'core' && teamsSeen(row) >= 2);
  const shown = sortRows(multiOnly ? multiTeamOnly(board.rows) : board.rows, sort);
  const sourcesText = sourcesLine(sources);

  const cycleSort = (): void => {
    const i = SORTS.findIndex((s) => s.key === sort);
    setSort((SORTS[(i + 1) % SORTS.length] ?? SORTS[0])?.key ?? 'ranked');
  };

  return (
    <main>
      <section>
        <h2>Teams</h2>
        <p className="sub">
          {sourceHeaderLine(ranking, "Projected against PvPoke's meta group. No shared battles in this window yet.")}
          {!empty && !board.projectionless ? (
            <>
              {' '}
              <Term term="Matchup score">{matchupScoreExplainer()}</Term>
            </>
          ) : null}
        </p>
        {ranking.source === 'all' && sourcesText ? <p className="fine">{sourcesText}</p> : null}
        {!empty && !board.projectionless && board.weightCovered < 0.95 ? (
          <p className="fine">
            {`Projections cover the ${count(board.metaGroupSize)} Pokemon PvPoke lists, which is ${Math.round(board.weightCovered * 100)}% of what players actually faced.`}
          </p>
        ) : null}
        {mismatch && epoch?.pvpokeCommit !== undefined && bakedShort !== null ? (
          <Note tone="warn">
            <p className="sub">
              {`This meta expects PvPoke commit ${epoch.pvpokeCommit.slice(0, 7)}. The projections were built from ${bakedShort}, so they may still describe the old movesets.`}
            </p>
          </Note>
        ) : null}
        {!empty && board.projectionless ? (
          <p className="fine">
            Projections are unavailable right now. Rows are ordered by their record.
          </p>
        ) : null}
        {empty ? (
          <>
            <p className="sub">
              No teams shared in this window yet, and no projections could be loaded.
            </p>
            <Contribute devices={ranking.devices} />
          </>
        ) : (
          <>
            <Controls
              rows={shown}
              multiOnly={multiOnly}
              onToggleMulti={() => setMultiOnly(!multiOnly)}
              sort={sort}
              onCycleSort={cycleSort}
              showFilter={showFilter}
            />
            <div className="team-rows">
              {shown.map((row) => {
                const key = row.species.join('+');
                return (
                  <Row
                    key={key}
                    row={row}
                    data={data}
                    league={league}
                    open={openRows[key] ?? false}
                    // Functional update, not a spread of the captured `openRows`: two taps in one
                    // tick both read the same stale object, so the second would throw away the
                    // first row's open state instead of adding to it.
                    onToggle={() => setOpenRows((prev) => ({ ...prev, [key]: !prev[key] }))}
                  />
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
