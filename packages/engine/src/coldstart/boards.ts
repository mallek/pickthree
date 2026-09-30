/**
 * The cup boards the Reddit post script renders (spec 2026-09-30-cup-team-boards-design.md):
 * Top Teams, Budget Builds and Best Team for Each Mega, five rows each, one complete team a row.
 * Selection is generic over the item so it can be tested on plain data; cupBoards (below) is the
 * glue that runs it on the engine's scored trios.
 */
import { buildOptionsFor } from '../builds/eligibility.js';
import type { GameDataIndex } from '../gamedata/index.js';
import type { League } from '../gamedata/league.js';
import type { MatchupMatrix } from '../gamedata/types.js';
import { candidatePool, type Candidate, type Rankings } from '../search/candidates.js';
import { MatrixView } from '../search/matrixView.js';
import { DEFAULT_TRIO_OPTIONS, weightedTrioOptions, type TrioIndex } from '../search/trios.js';
import type { BattleSimulator } from '../sim/BattleSimulator.js';
import { movesetDrift, withReplacedRows } from '../sim/matrixSim.js';
import { coldStartBuilds, coldStartSpecimens, spreadsFromGameMaster } from './pool.js';
import { presentTeam, scoreTrios, type GeneratedTeam, type ScoredTrio } from './teams.js';

/** Rows on one image. */
export const BOARD_ROWS = 5;
/** Rows any one Pokemon may appear on, per image. A Shadow and a Mega count as their base. */
export const SPECIES_CAP = 2;

export interface SelectOptions {
  rows: number;
  cap: number;
}

/** True when `next` may join `taken`: it shares at most one Pokemon with every taken row, and no
 *  Pokemon would then be on more than `cap` rows. */
function fits<T>(
  taken: readonly T[],
  next: T,
  speciesOf: (t: T) => readonly string[],
  cap: number,
): boolean {
  const mine = speciesOf(next);
  for (const row of taken) {
    const theirs = speciesOf(row);
    if (mine.filter((id) => theirs.includes(id)).length >= 2) {
      return false;
    }
  }
  for (const id of mine) {
    const uses = taken.filter((row) => speciesOf(row).includes(id)).length;
    if (uses + 1 > cap) {
      return false;
    }
  }
  return true;
}

/** Strongest first, a team joins when it fits the variety rule; stops at `rows`. */
export function selectVaried<T>(
  items: readonly T[],
  speciesOf: (t: T) => readonly string[],
  opts: SelectOptions,
): T[] {
  const taken: T[] = [];
  for (const item of items) {
    if (taken.length >= opts.rows) {
      break;
    }
    if (fits(taken, item, speciesOf, opts.cap)) {
      taken.push(item);
    }
  }
  return taken;
}

/**
 * One row per Mega. Megas are ranked by their strongest team; walking them in that order, each
 * takes its strongest team that fits the variety rule against the rows already taken, or is
 * skipped. Rows come back in the items' own (strength) order.
 */
export function selectMegaRows<T>(
  items: readonly T[],
  speciesOf: (t: T) => readonly string[],
  megaOf: (t: T) => string | null,
  opts: SelectOptions,
): T[] {
  const byMega = new Map<string, T[]>();
  for (const item of items) {
    const mega = megaOf(item);
    if (mega === null) {
      continue;
    }
    const list = byMega.get(mega);
    if (list) {
      list.push(item);
    } else {
      byMega.set(mega, [item]);
    }
  }
  const taken: T[] = [];
  for (const list of byMega.values()) {
    if (taken.length >= opts.rows) {
      break;
    }
    const pick = list.find((item) => fits(taken, item, speciesOf, opts.cap));
    if (pick !== undefined) {
      taken.push(pick);
    }
  }
  const at = new Map(items.map((item, i) => [item, i]));
  return taken.sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0));
}

/** Species the Top and Budget boards draft from, the meta bake's COLD_POOL. */
export const BOARD_POOL = 60;
/** A pool wide enough to hold every Mega the league's matrix has. */
export const MEGA_SCAN = 1000;

export interface BoardRow {
  team: GeneratedTeam;
  /** Lead, switch, closer: the candidates in the order team.species lists them. */
  members: [Candidate, Candidate, Candidate];
  /** The Mega this row is built around (Mega board only), else null. */
  megaId: string | null;
}

export interface CupBoardsInput {
  league: League;
  index: GameDataIndex;
  matrix: MatchupMatrix;
  rankings: Rankings;
  gameMaster: unknown;
  /** Per-opponent weights (the meta blend, or PvPoke's prior). */
  weights: ReadonlyMap<string, number>;
  /** Re-simulates rows whose moveset differs from the matrix; PvPokeSimulator in the script. */
  sim: BattleSimulator;
  /** The league allows Megas (its schedule entry says mega: true). */
  mega: boolean;
}

export interface CupBoards {
  top: BoardRow[];
  budget: BoardRow[];
  mega: BoardRow[] | null;
  /** Species whose matrix row was re-simulated, per board, for teams.json. */
  resimulated: { top: string[]; budget: string[]; mega: string[] };
}

export function boardPool(
  input: CupBoardsInput,
  view: MatrixView,
  allowEliteTm: boolean,
  poolSize: number,
): Candidate[] {
  const opts = { ...buildOptionsFor(input.league), allowEliteTm };
  const builds = coldStartBuilds(
    coldStartSpecimens(
      input.matrix.candidates,
      spreadsFromGameMaster(input.gameMaster, input.league.cp),
      input.index,
    ),
    input.index,
    opts,
  );
  return candidatePool(builds, input.rankings, view, input.index, {
    ...opts,
    poolSize,
    excludedSpecimenIds: [],
    excludedSpecies: [],
  }).pool;
}

/** A view whose rows match the pool's movesets, re-simulating the rows that do not. */
export function honestBoardView(
  input: CupBoardsInput,
  pool: readonly Candidate[],
): { view: MatrixView; resimulated: string[] } {
  const fighters = pool.map((c) => ({
    speciesId: c.build.speciesId,
    moveset: [c.moveset.fast.moveId, ...c.moveset.charged.map((m) => m.moveId)],
  }));
  const drift = movesetDrift(fighters, input.matrix);
  const matrix = withReplacedRows(input.matrix, drift, { sim: input.sim, league: input.league });
  return { view: new MatrixView(matrix), resimulated: drift.map((d) => d.speciesId) };
}

export function cupBoards(input: CupBoardsInput): CupBoards {
  const { index } = input;
  const types: TrioIndex = {
    types: (id: string) => index.mustSpecies(id).types,
    teamSpeciesOf: (id: string) => index.teamSpeciesOf(id),
  };
  const isMega = (id: string): boolean => index.teamSpeciesOf(id) !== id;
  const base = (id: string): string => index.baseOf(index.teamSpeciesOf(id));
  const speciesOf = (t: ScoredTrio): string[] => t.members.map((m) => base(m.c.build.speciesId));
  const select = { rows: BOARD_ROWS, cap: SPECIES_CAP };
  const shipped = new MatrixView(input.matrix);

  const rowsOf = (
    items: readonly ScoredTrio[],
    view: MatrixView,
    megaOf: (t: ScoredTrio) => string | null,
  ): BoardRow[] => {
    const trioOpts = weightedTrioOptions(DEFAULT_TRIO_OPTIONS, view, input.weights);
    return items.map((item) => ({
      team: presentTeam(item, view, trioOpts),
      members: item.order.map((i) => item.members[i]!.c) as [Candidate, Candidate, Candidate],
      megaId: megaOf(item),
    }));
  };
  const noMega = (): null => null;

  const topPool = boardPool(input, shipped, true, BOARD_POOL);
  const top = honestBoardView(input, topPool);
  const topRows = rowsOf(
    selectVaried(scoreTrios(topPool, top.view, types, input.weights), speciesOf, select),
    top.view,
    noMega,
  );

  const budgetPool = boardPool(input, shipped, false, BOARD_POOL);
  const budget = honestBoardView(input, budgetPool);
  const budgetRows = rowsOf(
    selectVaried(scoreTrios(budgetPool, budget.view, types, input.weights), speciesOf, select),
    budget.view,
    noMega,
  );

  let megaRows: BoardRow[] | null = null;
  let megaResim: string[] = [];
  if (input.mega) {
    const megas = boardPool(input, shipped, true, MEGA_SCAN).filter((c) =>
      isMega(c.build.speciesId),
    );
    const megaPool = [...topPool.filter((c) => !isMega(c.build.speciesId)), ...megas];
    const mega = honestBoardView(input, megaPool);
    megaResim = mega.resimulated;
    const megaOf = (t: ScoredTrio): string | null =>
      t.members.find((m) => isMega(m.c.build.speciesId))?.c.build.speciesId ?? null;
    megaRows = rowsOf(
      selectMegaRows(
        scoreTrios(megaPool, mega.view, types, input.weights),
        speciesOf,
        megaOf,
        select,
      ),
      mega.view,
      megaOf,
    );
  }

  return {
    top: topRows,
    budget: budgetRows,
    mega: megaRows,
    resimulated: { top: top.resimulated, budget: budget.resimulated, mega: megaResim },
  };
}
