/**
 * The core + flex boards (spec 2026-09-30-core-flex-boards-design.md): per board, five rows, each a
 * two-Pokemon core with up to four near-tied thirds. Same pools and honest views as cupBoards;
 * selectCores (cores.ts) does the choosing, this is the glue that runs it on scored trios.
 */
import type { Candidate } from '../search/candidates.js';
import { MatrixView } from '../search/matrixView.js';
import { DEFAULT_TRIO_OPTIONS, weightedTrioOptions, type TrioIndex } from '../search/trios.js';
import {
  BOARD_POOL,
  BOARD_ROWS,
  MEGA_SCAN,
  SPECIES_CAP,
  boardPool,
  honestBoardView,
  type BoardRow,
  type CupBoardsInput,
} from './boards.js';
import { selectCores } from './cores.js';
import { presentTeam, scoreTrios, type ScoredTrio } from './teams.js';

/** Most flex options a row lists. */
export const CORE_FLEX_MAX = 4;
/** Points below a row's best trio a regular third may sit. */
export const CORE_WINDOW = 1.0;
/** The same, when the third is a Mega. */
export const CORE_MEGA_WINDOW = 2.0;

export interface CoreFlexOut {
  third: Candidate;
  /** The whole trio in presented order, megaId set on the Mega board. */
  team: BoardRow;
}

export interface CoreRowOut {
  core: [Candidate, Candidate];
  /** 'mega' when the core has no Mega and every flex third is a Mega; 'regular' otherwise. */
  flexKind: 'mega' | 'regular';
  /** The Mega inside the core (species id), else null. */
  megaInCore: string | null;
  /** Best first; flex[0].team is the row's headline team. */
  flex: CoreFlexOut[];
}

export interface CoreBoards {
  top: CoreRowOut[];
  budget: CoreRowOut[];
  mega: CoreRowOut[] | null;
  resimulated: { top: string[]; budget: string[]; mega: string[] };
}

/** True when exactly one of the species is a Mega. */
export function hasExactlyOneMega(
  ids: readonly string[],
  isMega: (id: string) => boolean,
): boolean {
  return ids.filter(isMega).length === 1;
}

/**
 * Flex kind and the core's Mega, from the actual rows. A core holding a Mega takes regular
 * thirds; otherwise 'mega' exactly when there are flex thirds and every one is a Mega.
 */
export function coreRowKind(
  coreIds: readonly string[],
  flexThirdIds: readonly string[],
  isMega: (id: string) => boolean,
): { flexKind: 'mega' | 'regular'; megaInCore: string | null } {
  const megaInCore = coreIds.find(isMega) ?? null;
  const allMega = flexThirdIds.length > 0 && flexThirdIds.every(isMega);
  return { flexKind: megaInCore === null && allMega ? 'mega' : 'regular', megaInCore };
}

export function coreBoards(input: CupBoardsInput): CoreBoards {
  const { index } = input;
  const types: TrioIndex = {
    types: (id: string) => index.mustSpecies(id).types,
    teamSpeciesOf: (id: string) => index.teamSpeciesOf(id),
  };
  const isMega = (id: string): boolean => index.teamSpeciesOf(id) !== id;
  const base = (id: string): string => index.baseOf(index.teamSpeciesOf(id));
  const idsOf = (t: ScoredTrio): string[] => t.members.map((m) => m.c.build.speciesId);
  const shipped = new MatrixView(input.matrix);

  const build = (trios: readonly ScoredTrio[], view: MatrixView, onMegaBoard: boolean) => {
    const trioOpts = weightedTrioOptions(DEFAULT_TRIO_OPTIONS, view, input.weights);
    const rows = selectCores(trios, {
      rows: BOARD_ROWS,
      cap: SPECIES_CAP,
      flexMax: CORE_FLEX_MAX,
      window: CORE_WINDOW,
      megaWindow: CORE_MEGA_WINDOW,
      speciesOf: idsOf,
      strengthOf: (t) => t.strength,
      keyOf: (t) => t.key,
      base,
      isMega,
    });
    return rows.map((row): CoreRowOut => {
      const flex = row.flex.map((f): CoreFlexOut => {
        const members = f.trio.order.map((i) => f.trio.members[i]!.c) as [
          Candidate,
          Candidate,
          Candidate,
        ];
        const megaId = onMegaBoard
          ? (members.find((c) => isMega(c.build.speciesId))?.build.speciesId ?? null)
          : null;
        return {
          third: members.find((c) => c.build.speciesId === f.third)!,
          team: { team: presentTeam(f.trio, view, trioOpts), members, megaId },
        };
      });
      const head = flex[0]!.team.members;
      const core = head.filter((c) => row.core.includes(c.build.speciesId));
      if (core.length !== 2) {
        throw new Error(`core ${row.core.join('+')} not found in its headline team`);
      }
      const kind = coreRowKind(
        row.core,
        flex.map((f) => f.third.build.speciesId),
        isMega,
      );
      return { core: core as [Candidate, Candidate], ...kind, flex };
    });
  };

  const topPool = boardPool(input, shipped, true, BOARD_POOL);
  const top = honestBoardView(input, topPool);
  const topRows = build(scoreTrios(topPool, top.view, types, input.weights), top.view, false);

  const budgetPool = boardPool(input, shipped, false, BOARD_POOL);
  const budget = honestBoardView(input, budgetPool);
  const budgetRows = build(
    scoreTrios(budgetPool, budget.view, types, input.weights),
    budget.view,
    false,
  );

  let megaRows: CoreRowOut[] | null = null;
  let megaResim: string[] = [];
  if (input.mega) {
    const megas = boardPool(input, shipped, true, MEGA_SCAN).filter((c) =>
      isMega(c.build.speciesId),
    );
    const megaPool = [...topPool.filter((c) => !isMega(c.build.speciesId)), ...megas];
    const mega = honestBoardView(input, megaPool);
    megaResim = mega.resimulated;
    const trios = scoreTrios(megaPool, mega.view, types, input.weights).filter((t) =>
      hasExactlyOneMega(idsOf(t), isMega),
    );
    megaRows = build(trios, mega.view, true);
  }

  return {
    top: topRows,
    budget: budgetRows,
    mega: megaRows,
    resimulated: { top: top.resimulated, budget: budget.resimulated, mega: megaResim },
  };
}
