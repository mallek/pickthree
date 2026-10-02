import type { IVs, RawScan } from '../csv/parse.js';
import { LEGACY_SHADOW_MOVES } from '../builds/moves.js';
import { emptyLayout } from '../csv/layout.js';
import type { GameDataIndex } from '../gamedata/index.js';
import type { Species } from '../gamedata/types.js';
import { cpFor, statsFor } from '../math/cp.js';
import { specimenId, type ImportReport, type Specimen } from './specimen.js';

/** A Pokémon typed in by hand: what the appraisal screen shows plus the CP on the card. */
export interface ManualInput {
  /** Species id; shadow forms are their own species (swampert_shadow). */
  speciesId: string;
  ivs: IVs;
  cp: number;
  lucky?: boolean;
  /** Ignored for a Shadow: a Shadow is not Purified. */
  purified?: boolean;
  /** The moves it knows now. Absent or empty: not entered. Each must be in the species' pool. */
  currentMoves?: { fast: string | null; charged: string[] };
  /**
   * The level to keep when it gives exactly this CP: an evolved Pokemon keeps its level, and at
   * low levels two levels can share a CP.
   */
  level?: number;
}

export interface ManualResult {
  specimen: Specimen;
  level: number;
  /** False when no level produces exactly that CP with those IVs; matchedCp is the nearest. */
  exactCp: boolean;
  matchedCp: number;
}

const MAX_LEVEL = 51;

/** The level whose CP matches, or the nearest one. */
export function levelForCp(
  base: { atk: number; def: number; hp: number },
  ivs: IVs,
  cp: number,
): { level: number; cp: number; exact: boolean } {
  let best = { level: 1, cp: cpFor(base, ivs, 1), exact: false };
  for (let level = 1; level <= MAX_LEVEL; level += 0.5) {
    const c = cpFor(base, ivs, level);
    if (c === cp) {
      return { level, cp: c, exact: true };
    }
    if (Math.abs(c - cp) < Math.abs(best.cp - cp)) {
      best = { level, cp: c, exact: false };
    }
  }
  return best;
}

function checkIv(n: number, what: string): void {
  if (!Number.isInteger(n) || n < 0 || n > 15) {
    throw new Error(`${what} IV must be a whole number from 0 to 15.`);
  }
}

/** The moves typed in, checked against what the species can learn. */
function knownMoves(
  moves: ManualInput['currentMoves'],
  sp: Species,
  index: GameDataIndex,
): { fast: string | null; charged: string[] } {
  if (!moves) {
    return { fast: null, charged: [] };
  }
  const charged = [...new Set(moves.charged)];
  if (charged.length > 2) {
    throw new Error('A Pokémon knows at most two charged moves.');
  }
  const check = (id: string, pool: string[]): void => {
    if (!pool.includes(id)) {
      throw new Error(`${sp.speciesName} cannot learn ${index.move(id)?.name ?? id}.`);
    }
  };
  if (moves.fast !== null) {
    check(moves.fast, sp.fastMoves);
  }
  for (const id of charged) {
    // Frustration and Return come with being Shadow or Purified, not from the species' pool.
    if (!LEGACY_SHADOW_MOVES.has(id)) {
      check(id, sp.chargedMoves);
    }
  }
  return { fast: moves.fast, charged };
}

export function manualSpecimen(input: ManualInput, index: GameDataIndex): ManualResult {
  const sp = index.species(input.speciesId);
  if (!sp) {
    throw new Error('Pick a Pokémon first.');
  }
  checkIv(input.ivs.atk, 'Attack');
  checkIv(input.ivs.def, 'Defense');
  checkIv(input.ivs.sta, 'HP');
  if (!Number.isInteger(input.cp) || input.cp < 10) {
    throw new Error('Enter the CP shown on the Pokémon.');
  }
  const hinted =
    input.level !== undefined &&
    input.level >= 1 &&
    input.level <= MAX_LEVEL &&
    Number.isInteger(input.level * 2) &&
    cpFor(sp.baseStats, input.ivs, input.level) === input.cp;
  const match = hinted
    ? { level: input.level as number, cp: input.cp, exact: true }
    : levelForCp(sp.baseStats, input.ivs, input.cp);
  const moves = knownMoves(input.currentMoves, sp, index);
  const purified = input.purified === true && !sp.shadow;
  const hp = statsFor(sp.baseStats, input.ivs, match.level).hp;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const id = specimenId(sp.speciesId, sp.shadow, input.ivs, match.level, match.cp, hp);
  const raw: RawScan = {
    line: 0,
    name: sp.speciesName,
    form: '',
    dex: sp.dex,
    cp: match.cp,
    hp,
    ivs: { ...input.ivs },
    levelMin: match.level,
    levelMax: match.level,
    shadowCode: sp.shadow ? 1 : purified ? 2 : 0,
    lucky: input.lucky ?? false,
    fastMove: null,
    chargedMoves: [],
    scanDate: now,
    originalScanDate: null,
    pokeGenie: {} as RawScan['pokeGenie'],
  };
  return {
    specimen: {
      id,
      speciesId: sp.speciesId,
      familyId: sp.familyId,
      ivs: { ...input.ivs },
      level: { min: match.level, max: match.level },
      cp: match.cp,
      hp,
      shadow: sp.shadow,
      purified,
      lucky: input.lucky ?? false,
      currentMoves: moves,
      scannedAt: now,
      raw,
      source: 'manual',
    },
    level: match.level,
    exactCp: match.exact,
    matchedCp: match.cp,
  };
}

/** The report a collection gets when it was typed in rather than imported. */
export function emptyReport(): ImportReport {
  return {
    scansRead: 0,
    recognized: 0,
    duplicatesMerged: 0,
    missingIvs: { count: 0, names: [] },
    unrecognized: [],
    rowProblems: [],
    layout: emptyLayout(),
    newestScan: null,
  };
}
