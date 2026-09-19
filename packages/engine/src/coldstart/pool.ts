/**
 * The full legal pool with no collection behind it: one synthetic Specimen per species, at
 * PvPoke's own default IV spread for the cap, so the rest of the engine can draft teams the way
 * it drafts them from a real bag. meta.pick3.gg's cold start is built on this, and nothing here
 * simulates.
 *
 * The spread is PvPoke's, not ours. Pokemon.initialize reads defaultIVs["cp<cap>"] out of the
 * game master, and for an uncapped battle (Master League, cp 10000, which has no table) it uses
 * 15/15/15 at the level cap. We match both branches so a generated team is scored against exactly
 * the Pokemon the shipped matrix was built from.
 */
import { buildsFor, type Build, type BuildOptions } from '../builds/eligibility.js';
import { specimenId, type Specimen } from '../collection/specimen.js';
import type { IVs, RawScan } from '../csv/parse.js';
import type { GameDataIndex } from '../gamedata/index.js';
import { cpFor, statsFor } from '../math/cp.js';

export interface DefaultSpread {
  level: number;
  ivs: IVs;
}

export type SpreadLookup = (speciesId: string) => DefaultSpread | null;

/** At or above this cap PvPoke stops capping and runs 15/15/15 at the level cap. */
const UNCAPPED = 10_000;
const UNCAPPED_LEVEL = 50;
/** A fixed timestamp: a generated pool must not change because the clock moved. */
const SCANNED_AT = '2000-01-01 00:00:00';

interface GameMasterShape {
  pokemon?: { speciesId?: unknown; defaultIVs?: Record<string, unknown> }[];
}

export function spreadsFromGameMaster(gameMaster: unknown, cp: number): SpreadLookup {
  const table = new Map<string, DefaultSpread>();
  const gm = (gameMaster ?? {}) as GameMasterShape;
  const list = Array.isArray(gm.pokemon) ? gm.pokemon : [];
  for (const entry of list) {
    const id = entry.speciesId;
    if (typeof id !== 'string') {
      continue;
    }
    if (cp >= UNCAPPED) {
      table.set(id, { level: UNCAPPED_LEVEL, ivs: { atk: 15, def: 15, sta: 15 } });
      continue;
    }
    const combo = entry.defaultIVs?.[`cp${cp}`];
    if (!Array.isArray(combo) || combo.length < 4 || !combo.every((n) => typeof n === 'number')) {
      continue;
    }
    const [level, atk, def, sta] = combo as [number, number, number, number];
    table.set(id, { level, ivs: { atk, def, sta } });
  }
  return (speciesId: string) => table.get(speciesId) ?? null;
}

/** A synthetic scan row. Nothing reads it except code that expects a Specimen to have one. */
function rawFor(
  name: string,
  dex: number,
  shadow: boolean,
  ivs: IVs,
  level: number,
  cp: number,
  hp: number,
): RawScan {
  return {
    line: 0,
    name,
    form: '',
    dex,
    cp,
    hp,
    ivs: { ...ivs },
    levelMin: level,
    levelMax: level,
    shadowCode: shadow ? 1 : 0,
    lucky: false,
    fastMove: null,
    chargedMoves: [],
    scanDate: SCANNED_AT,
    originalScanDate: null,
    pokeGenie: {
      rankPctG: null,
      rankNumG: null,
      dustCostG: null,
      candyCostG: null,
      nameG: null,
      formG: null,
      shaPurG: null,
    },
  };
}

export function coldStartSpecimens(
  speciesIds: readonly string[],
  spreads: SpreadLookup,
  index: GameDataIndex,
): Specimen[] {
  const out: Specimen[] = [];
  for (const speciesId of speciesIds) {
    const sp = index.species(speciesId);
    const spread = spreads(speciesId);
    if (!sp || !spread) {
      continue;
    }
    const { level, ivs } = spread;
    const cp = cpFor(sp.baseStats, ivs, level);
    const hp = statsFor(sp.baseStats, ivs, level).hp;
    out.push({
      id: specimenId(sp.speciesId, sp.shadow, ivs, level, cp, hp),
      speciesId: sp.speciesId,
      familyId: sp.familyId,
      ivs: { ...ivs },
      // level.max pins buildsFor's floor to PvPoke's own level rather than letting it recompute
      // one. They agree for 1737 of 1742 entries at cp1500; the handful that differ are entries
      // PvPoke parks at level 1, and none of them clear a league's minCp anyway.
      level: { min: level, max: level },
      cp,
      hp,
      shadow: sp.shadow,
      purified: false,
      lucky: false,
      currentMoves: { fast: null, charged: [] },
      scannedAt: SCANNED_AT,
      raw: rawFor(sp.speciesName, sp.dex, sp.shadow, ivs, level, cp, hp),
    });
  }
  return out;
}

export function coldStartBuilds(
  specimens: readonly Specimen[],
  index: GameDataIndex,
  opts: BuildOptions,
): Build[] {
  const out: Build[] = [];
  for (const s of specimens) {
    // buildsFor walks the evolution line, so a Mudkip specimen would otherwise produce a Swampert
    // build carrying Mudkip's spread. Every species has its own specimen here, so the evolved
    // stages are covered properly by their own rows.
    for (const b of buildsFor(s, index, opts)) {
      if (b.speciesId === s.speciesId) {
        out.push(b);
      }
    }
  }
  return out;
}
