import type { HeaderReport } from '../csv/schema.js';
import type { IVs, ParsedCsv, RawScan, RowProblem } from '../csv/parse.js';
import type { GameDataIndex } from '../gamedata/index.js';
import { mapSpecies } from '../mapping/mapSpecies.js';

export interface Specimen {
  id: string;
  speciesId: string;
  familyId: string | null;
  ivs: IVs | null;
  level: { min: number; max: number };
  cp: number;
  hp: number;
  shadow: boolean;
  purified: boolean;
  lucky: boolean;
  currentMoves: { fast: string | null; charged: string[] };
  scannedAt: string;
  raw: RawScan;
}

export interface ImportReport {
  scansRead: number;
  recognized: number;
  duplicatesMerged: number;
  missingIvs: { count: number; names: string[] };
  unrecognized: { name: string; form: string; shadow: boolean; reason: string; count: number }[];
  rowProblems: RowProblem[];
  header: HeaderReport;
  newestScan: string | null;
}

/** FNV-1a 32-bit, hex. Stable across runs, no crypto dependency. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Stable identity of a scanned Pokemon: species, shadow flag, IVs and level. Two scans of the same
 * Pokemon share it regardless of when they were taken. Blank-IV scans add CP and HP so different
 * unappraised Pokemon at the same level stay apart.
 */
export function specimenId(
  speciesId: string,
  shadow: boolean,
  ivs: IVs | null,
  levelMax: number,
  cp: number,
  hp: number,
): string {
  const ivPart = ivs ? `${ivs.atk}/${ivs.def}/${ivs.sta}` : `noiv:${cp}/${hp}`;
  return fnv1a(`${speciesId}|${shadow ? 's' : 'n'}|${ivPart}|${levelMax}`);
}

function moveId(name: string | null, index: GameDataIndex): string | null {
  if (!name) {
    return null;
  }
  return index.moveByDisplayName(name)?.moveId ?? null;
}

export function toSpecimens(
  parsed: ParsedCsv,
  index: GameDataIndex,
): { specimens: Specimen[]; report: ImportReport } {
  const byId = new Map<string, Specimen>();
  let duplicates = 0;
  const missingIvNames: string[] = [];
  const unrecognized = new Map<string, ImportReport['unrecognized'][number]>();
  let newest: string | null = null;

  for (const row of parsed.rows) {
    const shadow = row.shadowCode === 1;
    const purified = row.shadowCode === 2;
    const mapped = mapSpecies(row.name, row.form, shadow, index);
    if (!mapped.ok) {
      const key = `${row.name}|${row.form}|${shadow}`;
      const existing = unrecognized.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        unrecognized.set(key, {
          name: row.name,
          form: row.form,
          shadow,
          reason: mapped.reason,
          count: 1,
        });
      }
      continue;
    }
    const species = index.mustSpecies(mapped.speciesId);
    const id = specimenId(mapped.speciesId, shadow, row.ivs, row.levelMax, row.cp, row.hp);
    const charged = row.chargedMoves
      .map((m) => moveId(m, index))
      .filter((m): m is string => m !== null);
    const specimen: Specimen = {
      id,
      speciesId: mapped.speciesId,
      familyId: species.familyId,
      ivs: row.ivs,
      level: { min: row.levelMin, max: row.levelMax },
      cp: row.cp,
      hp: row.hp,
      shadow,
      purified,
      lucky: row.lucky,
      currentMoves: { fast: moveId(row.fastMove, index), charged },
      scannedAt: row.scanDate,
      raw: row,
    };
    if (newest === null || row.scanDate > newest) {
      newest = row.scanDate;
    }
    const prev = byId.get(id);
    if (prev) {
      duplicates += 1;
      if (specimen.scannedAt > prev.scannedAt) {
        byId.set(id, specimen);
      }
    } else {
      byId.set(id, specimen);
    }
  }

  const specimens = [...byId.values()];
  for (const s of specimens) {
    if (s.ivs === null) {
      missingIvNames.push(index.mustSpecies(s.speciesId).speciesName);
    }
  }

  return {
    specimens,
    report: {
      scansRead: parsed.totalLines,
      recognized: specimens.length,
      duplicatesMerged: duplicates,
      missingIvs: { count: missingIvNames.length, names: missingIvNames },
      unrecognized: [...unrecognized.values()],
      rowProblems: parsed.problems,
      header: parsed.header,
      newestScan: newest,
    },
  };
}
