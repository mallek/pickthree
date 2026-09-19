/**
 * The team board: cores as the spine, complete teams nested under each, one sort by score. This
 * is the league root (Task 11), so it is the first thing a reader sees, in whatever state the
 * meta happens to be in on day one: nothing measured yet, a handful of shared battles, or a
 * mature league with hundreds of devices reporting.
 *
 * `buildBoard` (teamRank.ts) does the ranking; this screen only renders it, and renders it
 * honestly. See docs/superpowers/specs/2026-09-18-meta-site-design.md and teamRank.ts's own
 * header comment for the rule this screen exists to enforce: the blended `score` that sorts the
 * board is a ranking key, never a fact about a team, and is never printed. A card prints at most
 * two things about a row: a matchup score out of 100 (a projection worked out from PvPoke's
 * matchup data, explained once by the `Term` in the section header, and NEVER printed as a
 * percentage) and a measured record (always as a win-loss count, never a percentage), because
 * those are the two things about a row that are actually true. A percentage on this site always
 * means real battles.
 *
 * Two sources feed a card the same way they feed Pokemon.tsx (see that file's header comment for
 * the two-sources rule this site follows everywhere): PvPoke's projection, and measured play.
 * Neither is hidden here just because the other exists.
 */
import type { ReactNode } from 'react';
import type { MovesetStats } from '../api.js';
import { Chevron, Note, Sprite, Term } from '../components.js';
import { speciesOf, type SpeciesLite, type StaticData } from '../data.js';
import { battles as battlesText, count, plural } from '../format.js';
import { teamLink, type LinkMember } from '../links.js';
import type { Epoch } from '../epochs.js';
import { commitMismatch } from '../epochs.js';
import type { SpeciesRanking } from '../rank.js';
import type { Board, BoardRow } from '../teamRank.js';
import { Contribute } from './Pokemon.js';

/** The members `teamLink` wants: each species id, with its most common moveset when the record
 * has enough battles behind it to name one. Only a complete, three-member team is ever passed
 * here: pick3's `parseTeamPath` (apps/web/src/teamLink.ts) answers any other count with "A team
 * link needs three Pokemon", so a core links through one of its builds instead (see `Card`). */
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
 * this is the one and only place this screen prints a projection at all, and it prints a score
 * out of 100, not a percent sign. The explanation lives once, behind the `Term` in the section
 * header, not repeated on every card. */
function matchupScoreLine(strength: number): string {
  return `Matchup score ${Math.round(strength)} of 100`;
}

/** The explainer behind the "Matchup score" term, hosted once in the section header rather than
 * inside any card: a card's `Term` would be interactive content nested inside the card's own
 * anchor, invalid markup two earlier fix rounds already found and removed for "New" on the
 * Pokemon screen (see that file's `newExplainer`).
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

/** The one fact block every card needs: what it is made of, and how (projected, run, faced, or
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

/** `core.builds` nests generated teams alongside observed ones (a generated team whose pair was
 * never run still belongs under its core on the board), but "seen with" and "never seen complete"
 * are claims about OBSERVED play. Reading `core.builds` directly for either would print a
 * projected third as something this core was actually seen alongside, and the converse: a core
 * whose only builds are generated would wrongly skip "never seen complete." This is the one
 * filter both of those sentences share. */
function observedBuilds(core: BoardRow): BoardRow[] {
  return core.builds.filter((build) => build.source !== 'generated');
}

/** The distinct thirds a core has actually been seen complete with, read off its own observed
 * `builds` rather than a separate field: the nested list and this sentence must never be able to
 * disagree about what "seen with" means, so there is only one source for it. */
function thirdsOf(core: BoardRow): string[] {
  const pair = new Set(core.species);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const build of observedBuilds(core)) {
    const third = build.species.find((id) => !pair.has(id));
    if (third !== undefined && !seen.has(third)) {
      seen.add(third);
      out.push(third);
    }
  }
  return out;
}

function CoreFacts({ core, data }: { core: BoardRow; data: StaticData }): ReactNode {
  const observed = observedBuilds(core);
  if (observed.length > 0) {
    const names = thirdsOf(core).map((id) => speciesOf(data, id).short);
    return <p className="fine">{`Seen with ${joinNames(names)}`}</p>;
  }
  // The canned sentence below claims a projection exists ("Projected against any third PvPoke
  // would expect"). When it does not (the pair itself is outside the slice), RowFacts already
  // says so with its own "No projection: ..." line; printing this one too would have the card
  // contradict itself in two adjacent lines about whether a projection exists at all.
  if (core.projection !== null) {
    return (
      <p className="fine">Never seen complete. Projected against any third PvPoke would expect.</p>
    );
  }
  return null;
}

function SpeciesSlots({ species, twoUp }: { species: SpeciesLite[]; twoUp: boolean }): ReactNode {
  return (
    <div className={twoUp ? 'slots2' : 'slots3'}>
      {species.map((s) => (
        <div className="slot" key={s.id}>
          <Sprite species={s} size={52} />
          <span className="slot-name">{s.short}</span>
        </div>
      ))}
    </div>
  );
}

/** A nested build under a core: a compact line, not a full card, since the core's own card
 * already carries the sprites and the deep link at that size. Its own fact is whichever of a
 * record or a projection actually applies to it, never both, to keep the line to one thought. */
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
          <Sprite key={s.id} species={s} size={32} />
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

/** A top-level row. A complete team is one big `<a>`; a core WITH complete teams under it is a
 * `<div>` with its link in the foot instead, because its nested build lines are their own links
 * and an anchor cannot contain another anchor (screen readers handle it badly, and it is invalid
 * markup regardless). A core with no build under it is a `<div>` with no link at all, for the
 * reason below.
 *
 * C1: what a card links to is NOT always its own row. A core is two species and a pick3 team
 * link needs three (apps/web/src/teamLink.ts), so a core links to its best build, which is a
 * real three-Pokemon team and the thing a reader tapping the card most likely wants. A core with
 * no build at all has no honest destination, so it carries no link rather than one pick3 would
 * refuse. `builds` is already sorted by score, so `builds[0]` is the best one. */
function Card({
  row,
  data,
  league,
}: {
  row: BoardRow;
  data: StaticData;
  league: string;
}): ReactNode {
  const isCore = row.kind === 'core';
  const species = row.species.map((id) => speciesOf(data, id));
  const target: BoardRow | null = isCore ? (row.builds[0] ?? null) : row;
  const href = target ? teamLink(league, membersOf(target.species, target.moves)) : null;
  const hasChildren = isCore && row.builds.length > 0;

  const body = (
    <>
      <SpeciesSlots species={species} twoUp={isCore} />
      <span className="tag tag-kind">{kindTag(row)}</span>
      <RowFacts row={row} data={data} />
      {isCore ? <CoreFacts core={row} data={data} /> : null}
      {hasChildren ? (
        <div className="builds">
          <p className="fine">Built as</p>
          {row.builds.map((build) => (
            <BuildLine key={build.species.join('+')} build={build} data={data} league={league} />
          ))}
        </div>
      ) : null}
    </>
  );

  // A core with no build under it: no three-member team to point at, so no link at all rather
  // than one pick3 would refuse. Every other row has a `href`, and this narrows it for both
  // branches below.
  if (href === null) {
    return <div className="team-card">{body}</div>;
  }

  if (hasChildren) {
    return (
      <div className="team-card">
        {body}
        <div className="cost-line">
          <a className="team-details" href={href}>
            Open in pick3 <Chevron />
          </a>
        </div>
      </div>
    );
  }

  return (
    <a className="team-card" href={href}>
      {body}
      <div className="cost-line">
        <span className="team-details">
          Open in pick3 <Chevron />
        </span>
      </div>
    </a>
  );
}

function headerLine(ranking: SpeciesRanking): string {
  if (ranking.battles === 0) {
    return "Projected against PvPoke's meta group. No shared battles in this window yet.";
  }
  const pct = Math.round(ranking.say * 100);
  const devices = `${count(ranking.devices)} ${plural(ranking.devices, 'device', 'devices')}`;
  return `${pct}% measured, from ${battlesText(ranking.battles)} shared by ${devices}`;
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
}): ReactNode {
  const { league, data, boardError, board, ranking, epoch, bakedCommit } = p;

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

  return (
    <main>
      <section>
        <h2>Teams</h2>
        <p className="sub">
          {headerLine(ranking)}
          {!empty && !board.projectionless ? (
            <>
              {' '}
              <Term term="Matchup score">{matchupScoreExplainer()}</Term>
            </>
          ) : null}
        </p>
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
          board.rows.map((row) => (
            <Card key={row.species.join('+')} row={row} data={data} league={league} />
          ))
        )}
      </section>
    </main>
  );
}
