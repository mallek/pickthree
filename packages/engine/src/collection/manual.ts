import type { IVs, RawScan } from '../csv/parse.js';
import type { GameDataIndex } from '../gamedata/index.js';
import { cpFor, statsFor } from '../math/cp.js';
import { specimenId, type ImportReport, type Specimen } from './specimen.js';

/** A Pokémon typed in by hand: what the appraisal screen shows plus the CP on the card. */
export interface ManualInput {
  /** Species id; shadow forms are their own species (swampert_shadow). */
  speciesId: string;
  ivs: IVs;
  cp: number;
  lucky?: boolean;
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
  const match = levelForCp(sp.baseStats, input.ivs, input.cp);
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
    shadowCode: sp.shadow ? 1 : 0,
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
      purified: false,
      lucky: input.lucky ?? false,
      currentMoves: { fast: null, charged: [] },
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
    header: { ok: true, missingRequired: [], missingOptional: [], unknown: [], columnCount: 0 },
    newestScan: null,
  };
}
