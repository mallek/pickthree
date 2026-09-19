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
 * two numbers, a projection (always labelled "a projection, not a win rate", in the same line)
 * and a measured record (always as a win-loss count, never a percentage), because those are the
 * two things about a row that are actually true.
 *
 * Two sources feed a card the same way they feed Pokemon.tsx (see that file's header comment for
 * the two-sources rule this site follows everywhere): PvPoke's projection, and measured play.
 * Neither is hidden here just because the other exists.
 */
import type { ReactNode } from 'react';
import type { MovesetStats } from '../api.js';
import { Chevron, Note, Sprite } from '../components.js';
import { speciesOf, type SpeciesLite, type StaticData } from '../data.js';
import { battles as battlesText, count, plural } from '../format.js';
import { teamLink, type LinkMember } from '../links.js';
import type { Epoch } from '../epochs.js';
import { commitMismatch } from '../epochs.js';
import type { SpeciesRanking } from '../rank.js';
import type { Board, BoardRow } from '../teamRank.js';
import { Contribute } from './Pokemon.js';

/** The members `teamLink` wants: each species id, with its most common moveset when the record
 * has enough battles behind it to name one. A core hands over only its two known members; pick3
 * fills in the third itself. */
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
    return `Seen ${count(total)} times, no result recorded`;
  }
  if (hasRun && hasFaced) {
    const wins = row.runWins + row.facedWins;
    const losses = row.runLosses + row.facedLosses;
    return `Run ${count(row.runBattles)} times and faced ${count(row.facedBattles)} times, the team went ${wins}-${losses} overall`;
  }
  if (hasFaced) {
    return `Faced ${count(row.facedBattles)} times, players went ${row.facedLosses}-${row.facedWins}`;
  }
  return `Run ${count(row.runBattles)} times, reporters went ${row.runWins}-${row.runLosses}`;
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
 * whole `pokemon.json`, not the ranked slice, so the lookup always resolves. */
function outsideText(ids: readonly string[], data: StaticData): string {
  const names = ids.map((id) => speciesOf(data, id).short);
  return `No projection: ${joinNames(names)} ${names.length === 1 ? 'is' : 'are'} outside PvPoke's ranked list.`;
}

/** `Projects <P>%`, with the "not a win rate" caveat immediately beside it, in the same line, so
 * it is never a footnote a reader can scroll past. The one and only place this screen turns a
 * projection into a percent sign. */
function projectionLine(projection: number): string {
  return `Projects ${Math.round(projection * 100)}% (a projection, not a win rate).`;
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
      {row.projection !== null ? (
        <p className="fine">{projectionLine(row.projection)}</p>
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
    : build.projection !== null
      ? projectionLine(build.projection)
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

/** A top-level row. A core with no complete teams under it is a plain card, same as a team; a
 * core WITH complete teams becomes a `<div>` instead of the usual `<a>`, because its nested build
 * lines are their own links and an anchor cannot contain another anchor (screen readers handle it
 * badly, and it is invalid markup regardless). */
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
  const href = teamLink(league, membersOf(row.species, row.moves));
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
        <p className="sub">{headerLine(ranking)}</p>
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
