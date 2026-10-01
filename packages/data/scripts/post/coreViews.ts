/**
 * Pure view-building for `npm run post`: engine core rows in, template views and post records out.
 * Kept out of post.ts (which runs main on import) so it can be unit tested.
 */
import {
  cautionName,
  cautionNames,
  memberDisplay,
  type BoardRow,
  type Candidate,
  type CoreRowOut,
  type GameDataIndex,
} from '@pickthree/engine';
import type { CoreBoardView, CoreMemberView, CoreRowView, CoreTag, FlexView } from './fillCores.js';
import type { PostCoreBoard, PostCoreRow, PostTeam } from './markdown.js';

export type CoreBoardId = 'top' | 'budget' | 'mega';
export type CoreIndex = Pick<GameDataIndex, 'mustSpecies' | 'teamSpeciesOf'>;

export const SUBTITLES: Record<CoreBoardId, string> = {
  top: 'Top Cores + Flex Picks',
  budget: 'Budget Cores - No Elite TM',
  mega: 'Cores + Your Mega',
};
export const HEADINGS: Record<CoreBoardId, string> = {
  top: 'Top Cores',
  budget: 'Budget Cores - No Elite TM',
  mega: 'Cores + Your Mega',
};
export const READING_LINES: Record<CoreBoardId, string> = {
  top: 'Keep the pair. Choose one flex. That makes your team of three.',
  budget: 'Keep the pair. Choose one flex. That makes your team of three.',
  mega: 'Keep the pair. Choose one flex. Every team gets one Mega.',
};
export const MASCOT: Record<CoreBoardId, string> = {
  top: 'mascot-pointing.png',
  budget: 'mascot-thinking.png',
  mega: 'mascot-fingerguns.png',
};

/** Display tags for one Candidate, with an Elite TM tag when its moveset needs one. */
export function candidateTags(index: CoreIndex, c: Candidate): CoreTag[] {
  const id = c.build.speciesId;
  const d = memberDisplay(index.mustSpecies(id).speciesName, id);
  return [
    ...d.tags,
    ...(c.moveset.eliteTmCount > 0 ? [{ kind: 'elite' as const, text: 'Elite TM' }] : []),
  ];
}

export function memberView(index: CoreIndex, c: Candidate): CoreMemberView {
  const id = c.build.speciesId;
  const sp = index.mustSpecies(id);
  const d = memberDisplay(sp.speciesName, id);
  return {
    name: d.name,
    sprite: d.sprite,
    type: sp.types[0],
    tags: candidateTags(index, c),
    moves: [c.moveset.fast.name, ...c.moveset.charged.map((m) => m.name)] as [
      string,
      string,
      ...string[],
    ],
    isMega: index.teamSpeciesOf(id) !== id,
  };
}

export function flexView(index: CoreIndex, third: Candidate, strength: number): FlexView {
  const m = memberView(index, third);
  return {
    name: m.name,
    sprite: m.sprite,
    type: m.type,
    tags: m.tags,
    strength,
    isMega: m.isMega,
  };
}

export function coreRowView(index: CoreIndex, row: CoreRowOut): CoreRowView {
  const head = row.flex[0]!.team.team;
  const nameOf = (id: string): string => cautionName(index.mustSpecies(id).speciesName, id);
  return {
    core: [memberView(index, row.core[0]), memberView(index, row.core[1])],
    flexKind: row.flexKind,
    flex: row.flex.map((f) => flexView(index, f.third, f.team.team.strength)),
    strength: head.strength,
    caution: cautionNames(head.exposure, nameOf),
  };
}

export interface CoreBoardInputs {
  id: CoreBoardId;
  rows: CoreRowOut[];
  title: string;
  label: string;
  mixLine: string;
  mascot: string;
}

export function coreBoardView(index: CoreIndex, i: CoreBoardInputs): CoreBoardView {
  return {
    id: i.id,
    title: i.title,
    subtitle: SUBTITLES[i.id],
    readingLine: READING_LINES[i.id],
    label: i.label,
    source: [
      `Strength: pick3 sims vs the ${i.title} meta`,
      i.mixLine,
      'Flex moves and team order: full analysis in the post',
    ],
    mascot: i.mascot,
    rows: i.rows.map((r) => coreRowView(index, r)),
  };
}

/** One complete team, as the post records it (species order, moves, scores). */
export function postTeam(index: CoreIndex, row: BoardRow): PostTeam {
  return {
    species: row.team.species,
    names: row.members.map((c) => index.mustSpecies(c.build.speciesId).speciesName) as [
      string,
      string,
      string,
    ],
    moves: row.members.map((c) => [
      c.moveset.fast.moveId,
      ...c.moveset.charged.map((m) => m.moveId),
    ]) as [string[], string[], string[]],
    strength: row.team.strength,
    coverage: row.team.coverage,
    consistency: row.team.consistency,
    safety: row.team.safety,
    structure: row.team.structure,
    exposure: row.team.exposure,
  };
}

export function postCoreRow(index: CoreIndex, row: CoreRowOut): PostCoreRow {
  const full = (c: Candidate): string => index.mustSpecies(c.build.speciesId).speciesName;
  return {
    coreNames: [full(row.core[0]), full(row.core[1])],
    flexKind: row.flexKind,
    flex: row.flex.map((f) => ({ name: full(f.third), team: postTeam(index, f.team) })),
  };
}

export function postCoreBoard(
  index: CoreIndex,
  id: CoreBoardId,
  rows: CoreRowOut[],
): PostCoreBoard {
  return { id, heading: HEADINGS[id], rows: rows.map((r) => postCoreRow(index, r)) };
}
