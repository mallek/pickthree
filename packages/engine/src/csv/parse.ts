import Papa from 'papaparse';
import { fingerprintHeader, type HeaderReport } from './schema.js';

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
  header: HeaderReport;
  rows: RawScan[];
  problems: RowProblem[];
  totalLines: number;
}

export class ImportError extends Error {
  readonly header: HeaderReport;

  constructor(message: string, header: HeaderReport) {
    super(message);
    this.name = 'ImportError';
    this.header = header;
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

export function parsePokeGenieCsv(text: string): ParsedCsv {
  const cleaned = text.replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(cleaned, { skipEmptyLines: 'greedy' });
  const data = parsed.data;
  const headerRow = (data[0] ?? []).map((h) => h.trim());
  const header = fingerprintHeader(headerRow);
  if (!header.ok) {
    throw new ImportError(
      `This does not look like a Poke Genie export. Missing column(s): ${header.missingRequired.join(', ')}`,
      header,
    );
  }
  const idx = new Map<string, number>();
  headerRow.forEach((h, i) => {
    if (!idx.has(h)) {
      idx.set(h, i);
    }
  });
  const get = (row: string[], col: string): string | undefined => {
    const i = idx.get(col);
    return i === undefined ? undefined : row[i];
  };

  const rows: RawScan[] = [];
  const problems: RowProblem[] = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r] as string[];
    const line = r + 1;
    if (row.length !== headerRow.length) {
      problems.push({
        line,
        kind: 'field-count',
        detail: `expected ${headerRow.length} fields, got ${row.length}`,
      });
      continue;
    }
    const name = str(get(row, 'Name'));
    if (!name) {
      problems.push({ line, kind: 'missing-name', detail: 'Name is empty' });
      continue;
    }
    const cp = num(get(row, 'CP'));
    const hp = num(get(row, 'HP'));
    const dex = num(get(row, 'Pokemon Number'));
    const levelMin = num(get(row, 'Level Min'));
    const levelMax = num(get(row, 'Level Max'));
    if (cp === null || hp === null || dex === null || levelMin === null || levelMax === null) {
      problems.push({
        line,
        kind: 'bad-number',
        detail: `CP, HP, Pokemon Number or Level is not a number (${name})`,
      });
      continue;
    }
    const atk = num(get(row, 'Atk IV'));
    const def = num(get(row, 'Def IV'));
    const sta = num(get(row, 'Sta IV'));
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
    const shadowRaw = num(get(row, 'Shadow/Purified'));
    let shadowCode: 0 | 1 | 2 = 0;
    if (shadowRaw === 1 || shadowRaw === 2) {
      shadowCode = shadowRaw;
    } else if (shadowRaw !== null && shadowRaw !== 0) {
      problems.push({
        line,
        kind: 'bad-number',
        detail: `unknown Shadow/Purified code ${shadowRaw} (${name}), treated as normal`,
      });
    }
    const charged = [str(get(row, 'Charge Move')), str(get(row, 'Charge Move 2'))].filter(
      (m): m is string => m !== null,
    );
    rows.push({
      line,
      name,
      form: str(get(row, 'Form')) ?? '',
      dex,
      cp,
      hp,
      ivs,
      levelMin,
      levelMax,
      shadowCode,
      lucky: num(get(row, 'Lucky')) === 1,
      fastMove: str(get(row, 'Quick Move')),
      chargedMoves: charged,
      scanDate: str(get(row, 'Scan Date')) ?? '',
      originalScanDate: str(get(row, 'Original Scan Date')),
      pokeGenie: {
        rankPctG: num(get(row, 'Rank % (G)')),
        rankNumG: num(get(row, 'Rank # (G)')),
        dustCostG: num(get(row, 'Dust Cost (G)')),
        candyCostG: num(get(row, 'Candy Cost (G)')),
        nameG: str(get(row, 'Name (G)')),
        formG: str(get(row, 'Form (G)')),
        shaPurG: num(get(row, 'Sha/Pur (G)')),
      },
    });
  }

  return { header, rows, problems, totalLines: data.length - 1 };
}
