/**
 * The team board: cores as the spine, complete teams nested under each, one sort by score.
 *
 *   a     = decided / (decided + 30), and 0 below 15 decided
 *   score = (1 - a) * expectedWinRate(simStrength) + a * measuredWinRate
 *
 * `a` comes from the row's OWN decided battles, not the league's. A team reported 5-0 is under
 * the floor, so it ranks on its projection alone and cannot take the top spot on five battles. At
 * 30 decided battles the report and the projection split it evenly. Past a few hundred the record
 * simply wins.
 *
 * A core's prior is averaged over the third members actually seen alongside it, and an average
 * sits closer to the middle by construction, so a strong complete team rises above its own core
 * and a weak one sinks below it: we know all three of the one and only two of the other. No
 * constant, no thumb on the scale. A pair never seen complete has no observed thirds to average
 * over, so it averages across PvPoke's meta group weighted by the blended species weights, which
 * is the honest reading of "the third slot could be anything a player would reasonably bring".
 *
 * `score` mixes a projection into a win rate, so it is a RANKING KEY and is never printed as a
 * win rate. Only `measured` may be. See the spec's "A projected number is never printed as a win
 * rate".
 */
import {
  bestStrength,
  blendShare,
  expectedWinRate,
  strengthContext,
  type MatrixView,
  type StrengthContext,
} from '@pickthree/engine/meta';
import type { MovesetStats, TeamRowV1, TeamsV1 } from './api.js';
import type { SpeciesRanking } from './rank.js';
import type { GeneratedTeamLite } from './slice.js';

/** Decided battles at which a team's own record and its projection split the say evenly. */
export const TEAM_HALF_SAY = 30;
/** Below this many decided battles a team's record has no say at all. */
export const TEAM_MIN = 15;
/** The most top-level rows a board carries. */
export const BOARD_LIMIT = 60;
/** The most third members a core's fallback prior averages over. */
export const THIRD_SAMPLE = 48;

export type RowSource = 'generated' | 'observed';

export interface BoardRow {
  /** Sorted species ids, for identity. Two for a core, three for a team. */
  species: string[];
  /** Lead, switch, closer, when a projection could be computed. */
  order: string[] | null;
  kind: 'core' | 'team';
  source: RowSource;
  /** simStrength, 0 to 100, or null when a member is outside the slice. NOT a win rate. */
  strength: number | null;
  /** expectedWinRate(strength), 0 to 1, or null. A projection. Never printed as a win rate. */
  projection: number | null;
  /**
   * Members with no matrix row. It is the REASON a row has no projection, not the test for one:
   * a generated row keeps its baked strength and still projects. Ask `projection === null`.
   */
  outsideSlice: string[];
  /** Share of the blended facing weight the projection could speak for, 0 to 1. */
  weightCovered: number;
  runBattles: number;
  runWins: number;
  runLosses: number;
  facedBattles: number;
  facedWins: number;
  facedLosses: number;
  /** Total decided battles, run and faced together. */
  decided: number;
  /** Wins over decided, or null. The one number on this row that may be printed as a win rate. */
  measured: number | null;
  /** `a` for this row, from its own decided battles. */
  say: number;
  /**
   * The sort key, 0 to 1, or null when the row has neither a projection nor a decided battle.
   * It blends a projection into a measured rate, so it is a RANKING KEY and nothing else: it is
   * never rendered, and in particular never rendered as a win rate. Cards print `measured` as
   * the record and `projection` as a projection.
   */
  score: number | null;
  moves: (MovesetStats | null)[];
  /** Complete teams built on this core, best first. Empty on a team row. */
  builds: BoardRow[];
}

export interface Board {
  rows: BoardRow[];
  /**
   * True when the slice could not be loaded, so nothing was projected against the current meta:
   * every observed row has `projection` null and ranks on its record alone, and a generated row
   * falls back to the strength baked with it. No row carries an `order`.
   */
  projectionless: boolean;
  /**
   * Share of the blended facing weight the matrix's opponent columns account for, 0 to 1. The
   * same figure `rowFrom` copies onto every row as `weightCovered` (task-12 fix round 1, item 6:
   * it used to be read back off `board.rows[0]`, a board-wide fact reconstructed from a row that
   * might not exist). 0 when there is no slice, matching `projectionless`.
   */
  weightCovered: number;
  /**
   * The matrix's opponent-column count, i.e. how many species the projection is actually weighed
   * against. `weightCovered`'s numerator and this count come from the same `StrengthContext`, so
   * a screen's coverage note ("Projections cover the N Pokemon PvPoke lists, which is P% of what
   * players actually faced") reads both off this one object rather than pairing `weightCovered`
   * with a count computed some other way, which nothing would keep in step with it. 0 when there
   * is no slice.
   */
  metaGroupSize: number;
}

interface Projection {
  strength: number | null;
  order: string[] | null;
  outside: string[];
}

/** No projection, and no reason to name: a fresh object each time, because `outside` is a
 *  mutable array that ends up on a BoardRow and must not be shared between rows. */
function nothing(): Projection {
  return { strength: null, order: null, outside: [] };
}

/** The projection for three named species, or nothing when any of them is outside the slice. */
function projectTeam(ctx: StrengthContext | null, species: readonly string[]): Projection {
  if (!ctx) {
    return nothing();
  }
  const rows = species.map((id) => ctx.view.rowOf(id));
  const outside = species.filter((_, i) => rows[i] === null);
  // Any member outside the slice means no projection at all, rather than a partial one computed
  // from the members that happen to be covered: a projection missing a member is not a weaker
  // projection, it is a wrong one.
  if (outside.length > 0 || rows.length !== 3) {
    return { strength: null, order: null, outside };
  }
  const s = bestStrength(ctx, [rows[0] as number, rows[1] as number, rows[2] as number]);
  const byRow = new Map(rows.map((row, i) => [row as number, species[i] as string]));
  return {
    strength: s.value,
    order: s.order.map((row) => byRow.get(row) as string),
    outside: [],
  };
}

/** A core's projection: the average over the thirds it was seen with, or over PvPoke's group. */
function projectCore(
  ctx: StrengthContext | null,
  pair: readonly string[],
  thirds: readonly { speciesId: string; sightings: number }[],
  fallback: readonly string[],
): Projection {
  if (!ctx) {
    return nothing();
  }
  const outside = pair.filter((id) => ctx.view.rowOf(id) === null);
  if (outside.length > 0 || pair.length !== 2) {
    return { strength: null, order: null, outside };
  }
  const sample: { speciesId: string; weight: number }[] =
    thirds.length > 0
      ? thirds.map((t) => ({ speciesId: t.speciesId, weight: t.sightings }))
      : // `fallback` is ctx.view.opponents and ctx.weights is aligned with it, so the index is
        // the weight's index too. The blended weights are what PvPoke's group means here: once
        // measured play has said what players bring, that is what the third slot could be.
        fallback
          .slice(0, THIRD_SAMPLE)
          .map((id, i) => ({ speciesId: id, weight: ctx.weights[i] ?? 0 }));

  let total = 0;
  let sum = 0;
  for (const s of sample) {
    // The meta group contains the core's own members, and a team cannot field the same Pokemon
    // twice. Averaging a pair against itself would score a team nobody can bring.
    if (s.speciesId === pair[0] || s.speciesId === pair[1]) {
      continue;
    }
    if (ctx.view.rowOf(s.speciesId) === null || s.weight <= 0) {
      continue;
    }
    const p = projectTeam(ctx, [pair[0] as string, pair[1] as string, s.speciesId]);
    if (p.strength === null) {
      continue;
    }
    sum += p.strength * s.weight;
    total += s.weight;
  }
  if (total === 0) {
    // Nothing to average over is not a weak projection, it is no projection.
    return nothing();
  }
  // A core has no single best order: its order depends on the third, which is not decided here.
  return { strength: Math.round((sum / total) * 10) / 10, order: null, outside: [] };
}

/** Blended when both sides exist; whichever one exists otherwise; null when neither does. */
function scoreOf(projection: number | null, measured: number | null, say: number): number | null {
  if (projection === null && measured === null) {
    return null;
  }
  if (projection === null) {
    return measured;
  }
  if (measured === null || say === 0) {
    return projection;
  }
  return (1 - say) * projection + say * measured;
}

function rowFrom(src: TeamRowV1, projection: Projection, weightCovered: number): BoardRow {
  const wins = src.runWins + src.facedWins;
  const losses = src.runLosses + src.facedLosses;
  const decided = wins + losses;
  const measured = decided > 0 ? wins / decided : null;
  // The row's own decided battles, not the league's: a team reported 5-0 has earned nothing yet.
  const say =
    measured === null ? 0 : blendShare(decided, { minBattles: TEAM_MIN, halfLife: TEAM_HALF_SAY });
  const projected = projection.strength === null ? null : expectedWinRate(projection.strength);
  // `moves` is documented as aligned with `species`, so the two are sorted together. The worker
  // already emits both sorted, which makes this a no-op on real data and a guard on any other
  // caller; sorting the ids alone would quietly hand a card the wrong Pokemon's moveset.
  const paired = src.species
    .map((speciesId, i) => ({ speciesId, moves: src.moves[i] ?? null }))
    .sort((a, b) => a.speciesId.localeCompare(b.speciesId));
  return {
    species: paired.map((p) => p.speciesId),
    order: projection.order,
    kind: src.kind,
    source: 'observed',
    strength: projection.strength,
    projection: projected,
    outsideSlice: projection.outside,
    weightCovered,
    runBattles: src.runBattles,
    runWins: src.runWins,
    runLosses: src.runLosses,
    facedBattles: src.facedBattles,
    facedWins: src.facedWins,
    facedLosses: src.facedLosses,
    decided,
    measured,
    say,
    score: scoreOf(projected, measured, say),
    moves: paired.map((p) => p.moves),
    builds: [],
  };
}

const byScore = (a: BoardRow, b: BoardRow): number => {
  // A row with no score at all sorts last, whatever its counts.
  if (a.score === null || b.score === null) {
    return (
      (a.score === null ? 1 : 0) - (b.score === null ? 1 : 0) ||
      b.runBattles + b.facedBattles - (a.runBattles + a.facedBattles) ||
      a.species.join('+').localeCompare(b.species.join('+'))
    );
  }
  return b.score - a.score || a.species.join('+').localeCompare(b.species.join('+'));
};

function pairsOf(ids: readonly string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push([ids[i] as string, ids[j] as string]);
    }
  }
  return out;
}

export function buildBoard(input: {
  teams: TeamsV1;
  ranking: SpeciesRanking;
  generated: readonly GeneratedTeamLite[];
  view: MatrixView | null;
  limit?: number;
}): Board {
  const limit = input.limit ?? BOARD_LIMIT;
  const ctx = input.view ? strengthContext(input.view, input.ranking.weights) : null;
  const covered = ctx?.weightCovered ?? 0;
  const fallbackThirds = ctx ? ctx.view.opponents : [];

  const observedTeams = input.teams.teams.map((t) =>
    rowFrom(t, projectTeam(ctx, [...t.species].sort()), covered),
  );
  const observedCores = input.teams.cores.map((c) =>
    rowFrom(c, projectCore(ctx, [...c.species].sort(), c.thirds, fallbackThirds), covered),
  );

  // I2: the generated teams are the strongest projections from the same 60-species pool the
  // teams people actually run come from, so a generated trio matching an observed one is likely,
  // not exotic. Without this the board would carry two rows for one team, one saying "not yet
  // seen in shared battles" beside the other's record, and both keyed on the same
  // `species.join('+')` in Teams.tsx. One row per team: the observed one, which knows more.
  const observedKeys = new Set(observedTeams.map((t) => t.species.join('+')));

  const generatedRows: BoardRow[] = input.generated
    .filter((g) => !observedKeys.has([...g.species].sort().join('+')))
    .map((g) => {
      // Recomputed against the blended weights when the slice is here: the baked strength was
      // weighted by PvPoke's prior alone, and measured play may since have said otherwise.
      const p = projectTeam(ctx, [...g.species].sort());
      const strength = p.strength ?? g.strength;
      // The baked species array is already lead, switch, closer (GeneratedTeam in the engine), so
      // it stands in when the recompute could not run. With no slice at all the board says so
      // through `projectionless` and claims no order for any row, generated or observed.
      const order = p.order ?? (ctx ? [...g.species] : null);
      // A generated row has no record at all, so its score IS its projection: say is 0 and there
      // is nothing on the other side of the blend.
      const projection = expectedWinRate(strength);
      return {
        species: [...g.species].sort(),
        order,
        kind: 'team',
        source: 'generated',
        strength,
        projection,
        outsideSlice: p.outside,
        weightCovered: covered,
        runBattles: 0,
        runWins: 0,
        runLosses: 0,
        facedBattles: 0,
        facedWins: 0,
        facedLosses: 0,
        decided: 0,
        measured: null,
        say: 0,
        score: projection,
        moves: [null, null, null],
        builds: [],
      };
    });

  // Cores are the spine. Every complete team, observed or generated, is nested under each of its
  // pairs that is on the board. A generated team whose pairs were never seen has no core to sit
  // under, so it stands on its own: the board must not assert that a pair is played together
  // when nobody has played it.
  const coreByKey = new Map(observedCores.map((c) => [c.species.join('+'), c]));
  const orphans: BoardRow[] = [];
  for (const team of [...observedTeams, ...generatedRows]) {
    let nested = false;
    for (const pair of pairsOf(team.species)) {
      const core = coreByKey.get(pair.join('+'));
      if (core) {
        core.builds.push(team);
        nested = true;
      }
    }
    if (!nested) {
      orphans.push(team);
    }
  }
  for (const core of coreByKey.values()) {
    core.builds.sort(byScore);
  }

  const rows = [...coreByKey.values(), ...orphans].sort(byScore).slice(0, limit);
  return {
    rows,
    projectionless: ctx === null,
    weightCovered: covered,
    metaGroupSize: ctx ? ctx.view.opponents.length : 0,
  };
}
