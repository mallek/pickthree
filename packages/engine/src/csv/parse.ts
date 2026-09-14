import Papa from 'papaparse';
import { levelForCp } from '../collection/manual.js';
import type { GameDataIndex } from '../gamedata/index.js';
import { mapSpecies } from '../mapping/mapSpecies.js';
import { statsFor } from '../math/cp.js';
import { boolOf, shadowCodeOf, splitName, type Concept, type ShapeDeps } from './concepts.js';
import { LayoutError, emptyLayout, resolveLayout, sniffDelimiter, type Layout } from './layout.js';

export interface IVs {
  atk: number;
  def: number;
  sta: number;
}

export interface RawScan {
  line: number;
  name: string;
  form: string;
  dex: number;
  cp: number;
  hp: number;
  ivs: IVs | null;
  levelMin: number;
  levelMax: number;
  shadowCode: 0 | 1 | 2;
  lucky: boolean;
  fastMove: string | null;
  chargedMoves: string[];
  scanDate: string;
  originalScanDate: string | null;
  /** Resolved while parsing; null when the species is not in the game data. Absent on old saves. */
  speciesId?: string | null;
  /** True when level came from CP and IVs rather than the file. */
  levelDerived?: boolean;
  pokeGenie: {
    rankPctG: number | null;
    rankNumG: number | null;
    dustCostG: number | null;
    candyCostG: number | null;
    nameG: string | null;
    formG: string | null;
    shaPurG: number | null;
  };
}

export type RowProblemKind = 'field-count' | 'bad-number' | 'iv-out-of-range' | 'missing-name';

export interface RowProblem {
  line: number;
  kind: RowProblemKind;
  detail: string;
}

export interface ParsedCsv {
  layout: Layout;
  rows: RawScan[];
  problems: RowProblem[];
  totalLines: number;
}

export class ImportError extends Error {
  readonly layout: Layout;

  constructor(message: string, layout: Layout = emptyLayout()) {
    super(message);
    this.name = 'ImportError';
    this.layout = layout;
  }
}

function num(v: string | undefined): number | null {
  if (v === undefined) {
    return null;
  }
  const t = v.trim().replace(/%$/, '').replace(/,/g, '');
  if (t === '') {
    return null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function str(v: string | undefined): string | null {
  if (v === undefined) {
    return null;
  }
  const t = v.trim();
  return t === '' ? null : t;
}

/** The value matchers, backed by the game data. */
export function shapeDeps(index: GameDataIndex): ShapeDeps {
  return {
    isSpecies: (name, form, shadow) => mapSpecies(name, form, shadow, index).ok,
    isFastMove: (name) => {
      const m = index.moveByDisplayName(name);
      return m !== undefined && m.energyGain > 0;
    },
    isChargedMove: (name) => {
      const m = index.moveByDisplayName(name);
      return m !== undefined && m.energy > 0;
    },
  };
}

const XLSX_SIGNATURE = 'PK\u0003\u0004';

/**
 * Reads any tabular collection file: Poke Genie or Calcy IV exports, or a sheet of your own.
 * The layout is worked out from the headers and the values; see layout.ts.
 */
export function parseCollectionCsv(text: string, index: GameDataIndex): ParsedCsv {
  if (text.startsWith(XLSX_SIGNATURE)) {
    throw new ImportError('This looks like an Excel file. Export it as CSV first.');
  }
  const cleaned = text.replace(/^\uFEFF/, '');
  if (cleaned.trim() === '') {
    throw new ImportError('The file is empty.');
  }
  const delimiter = sniffDelimiter(cleaned);
  const parsed = Papa.parse<string[]>(cleaned, { delimiter, skipEmptyLines: 'greedy' });
  const data = parsed.data;
  let layout: Layout;
  try {
    layout = resolveLayout(data, delimiter, shapeDeps(index));
  } catch (e) {
    if (e instanceof LayoutError) {
      throw new ImportError(e.message, e.layout);
    }
    throw e;
  }
  const at = new Map<Concept, number>(layout.columns.map((c) => [c.concept, c.index]));
  const get = (row: string[], concept: Concept): string | undefined => {
    const i = at.get(concept);
    return i === undefined ? undefined : row[i];
  };

  const rows: RawScan[] = [];
  const problems: RowProblem[] = [];
  const start = layout.hasHeader ? 1 : 0;

  for (let r = start; r < data.length; r++) {
    const row = data[r] as string[];
    const line = r + 1;
    if (row.length !== layout.columnCount) {
      problems.push({
        line,
        kind: 'field-count',
        detail: `expected ${layout.columnCount} fields, got ${row.length}`,
      });
      continue;
    }
    let name = str(get(row, 'name'));
    if (!name) {
      problems.push({ line, kind: 'missing-name', detail: 'Name is empty' });
      continue;
    }
    const cp = num(get(row, 'cp'));
    if (cp === null) {
      problems.push({ line, kind: 'bad-number', detail: `CP is not a number (${name})` });
      continue;
    }
    const atk = num(get(row, 'atk'));
    const def = num(get(row, 'def'));
    const sta = num(get(row, 'sta'));
    let ivs: IVs | null = null;
    if (atk !== null || def !== null || sta !== null) {
      if (atk === null || def === null || sta === null) {
        problems.push({ line, kind: 'bad-number', detail: `partial IVs (${name})` });
        continue;
      }
      const inRange = (v: number): boolean => Number.isInteger(v) && v >= 0 && v <= 15;
      if (!inRange(atk) || !inRange(def) || !inRange(sta)) {
        problems.push({
          line,
          kind: 'iv-out-of-range',
          detail: `IVs ${atk}/${def}/${sta} outside 0..15 (${name})`,
        });
        continue;
      }
      ivs = { atk, def, sta };
    }

    let form = str(get(row, 'form')) ?? '';
    const shadowCell = get(row, 'shadow');
    let shadowCode: 0 | 1 | 2 = 0;
    const code = shadowCodeOf(shadowCell);
    if (code !== null) {
      shadowCode = code;
    } else if (shadowCell !== undefined && shadowCell.trim() !== '') {
      problems.push({
        line,
        kind: 'bad-number',
        detail: `unknown shadow value "${shadowCell.trim()}" (${name}), treated as normal`,
      });
    }
    if (boolOf(get(row, 'purified'))) {
      shadowCode = 2;
    }

    // Species now, so level and HP can be derived and folded-in form words can be split out.
    // A folded name ("Shadow Swampert", "Sableye (Mega)") is split before the plain try, since
    // "Sableye (Mega)" slugs straight to the mega entry that Poke Genie folds into the base.
    let mapped = mapSpecies(name, form, shadowCode === 1, index);
    const split = splitName(name);
    if (split.name !== name || split.form !== '' || split.shadow !== null) {
      const sForm = split.form !== '' ? split.form : form;
      const sShadow = split.shadow ?? shadowCode;
      const viaSplit = mapSpecies(split.name, sForm, sShadow === 1, index);
      if (viaSplit.ok) {
        mapped = viaSplit;
        name = split.name;
        form = sForm;
        shadowCode = sShadow;
      }
    }
    const species = mapped.ok ? index.species(mapped.speciesId) : undefined;

    let levelMin = num(get(row, 'levelMin'));
    let levelMax = num(get(row, 'levelMax'));
    let levelDerived = false;
    if (levelMin === null && levelMax !== null) {
      levelMin = levelMax;
    }
    if (levelMin === null && species && ivs) {
      levelMin = levelForCp(species.baseStats, ivs, cp).level;
      levelDerived = true;
    }
    if (levelMin === null) {
      levelMin = 0;
    }
    if (levelMax === null || levelMax < levelMin) {
      levelMax = levelMin;
    }

    let hp = num(get(row, 'hp'));
    if (hp === null) {
      hp = species && ivs && levelMin > 0 ? statsFor(species.baseStats, ivs, levelMin).hp : 0;
    }

    const charged = [str(get(row, 'chargedMove1')), str(get(row, 'chargedMove2'))].filter(
      (m): m is string => m !== null && m.toLowerCase() !== 'none',
    );
    rows.push({
      line,
      name,
      form,
      dex: num(get(row, 'dex')) ?? species?.dex ?? 0,
      cp,
      hp,
      ivs,
      levelMin,
      levelMax,
      shadowCode,
      lucky: boolOf(get(row, 'lucky')),
      fastMove: str(get(row, 'fastMove')),
      chargedMoves: charged,
      scanDate: str(get(row, 'scanDate')) ?? '',
      originalScanDate: str(get(row, 'originalScanDate')),
      speciesId: mapped.ok ? mapped.speciesId : null,
      levelDerived,
      pokeGenie: {
        rankPctG: num(get(row, 'pgRankPctG')),
        rankNumG: num(get(row, 'pgRankNumG')),
        dustCostG: num(get(row, 'pgDustCostG')),
        candyCostG: num(get(row, 'pgCandyCostG')),
        nameG: str(get(row, 'pgNameG')),
        formG: str(get(row, 'pgFormG')),
        shaPurG: num(get(row, 'pgShaPurG')),
      },
    });
  }

  return { layout, rows, problems, totalLines: data.length - start };
}
