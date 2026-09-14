/**
 * Works out which column holds what in a collection file. The header is a hint; the values are
 * the proof. See docs/superpowers/specs/2026-09-14-adaptive-import-design.md.
 */
import {
  CONCEPTS,
  CONCEPT_LABEL,
  IGNORED_HEADERS,
  REQUIRED_CONCEPTS,
  headerScore,
  looksLikeHeader,
  normalizeHeader,
  type Concept,
  type ConceptDef,
  type NormalizedHeader,
  type ShapeDeps,
} from './concepts.js';

export interface LayoutColumn {
  concept: Concept;
  index: number;
  header: string | null;
  via: 'header' | 'content' | 'order';
  /** Share of sampled non-blank cells that fit the concept, 0..1. */
  confidence: number;
}

export interface Layout {
  format: 'poke-genie' | 'calcy-iv' | 'sheet';
  delimiter: string;
  hasHeader: boolean;
  columnCount: number;
  columns: LayoutColumn[];
  /** Headers (or "column N") of columns nothing claimed. */
  unused: string[];
  /** Optional concepts that did not resolve. */
  missing: Concept[];
  /** The three IV columns were taken in file order because nothing labelled them. */
  ivOrderAssumed: boolean;
  /** Lowest confidence among the required concepts. */
  confidence: number;
}

export function emptyLayout(): Layout {
  return {
    format: 'sheet',
    delimiter: ',',
    hasHeader: true,
    columnCount: 0,
    columns: [],
    unused: [],
    missing: [],
    ivOrderAssumed: false,
    confidence: 1,
  };
}

const DELIMITERS = [',', '\t', ';', '|'] as const;

/** Counts a delimiter outside double quotes. */
function countOutsideQuotes(line: string, d: string): number {
  let n = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === d) {
      n += 1;
    }
  }
  return n;
}

/** The delimiter that splits the first lines into the most fields, most consistently. */
export function sniffDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, 20);
  let best: { d: string; score: number } = { d: ',', score: -1 };
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    if (min <= 0) {
      continue;
    }
    const score = min - (max - min) * 0.5;
    if (score > best.score) {
      best = { d, score };
    }
  }
  return best.d;
}

const NUMBER = /^-?\d+(\.\d+)?%?$/;

/** Row one is a header when none of its cells are numbers and at least one names a concept. */
export function detectHeader(row: string[]): boolean {
  const cells = row.map((c) => c.trim()).filter((c) => c !== '');
  if (cells.length === 0) {
    return false;
  }
  if (cells.some((c) => NUMBER.test(c))) {
    return false;
  }
  return cells.some((c) => looksLikeHeader(normalizeHeader(c)));
}

const SAMPLE = 200;

interface ColumnStats {
  index: number;
  header: NormalizedHeader | null;
  raw: string | null;
  values: string[];
  /** Largest numeric value seen, for telling CP from level and IVs from flags. */
  maxNumber: number;
}

function columnStats(rows: string[][], hasHeader: boolean, index: number): ColumnStats {
  const raw = hasHeader ? ((rows[0] ?? [])[index] ?? '') : null;
  const values: string[] = [];
  let maxNumber = Number.NEGATIVE_INFINITY;
  const start = hasHeader ? 1 : 0;
  const step = Math.max(1, Math.floor((rows.length - start) / SAMPLE));
  for (let r = start; r < rows.length && values.length < SAMPLE; r += step) {
    const v = (rows[r] ?? [])[index];
    if (v === undefined) {
      continue;
    }
    const t = v.trim();
    if (t === '') {
      continue;
    }
    values.push(t);
    const n = Number(t.replace(/,/g, ''));
    if (Number.isFinite(n) && n > maxNumber) {
      maxNumber = n;
    }
  }
  return { index, header: raw === null ? null : normalizeHeader(raw), raw, values, maxNumber };
}

/** Share of non-blank sampled cells that fit, adjusted for shapes that overlap. */
function contentScore(def: ConceptDef, col: ColumnStats, deps: ShapeDeps): number {
  if (col.values.length === 0) {
    return 0.5;
  }
  let fits = 0;
  for (const v of col.values) {
    if (def.fits(v, deps)) {
      fits += 1;
    }
  }
  let score = fits / col.values.length;
  if (def.concept === 'cp' && col.maxNumber <= 51) {
    // whole-number levels also look like CP; real CP columns go past 51
    score *= 0.6;
  }
  if (
    (def.concept === 'atk' || def.concept === 'def' || def.concept === 'sta') &&
    col.maxNumber <= 2
  ) {
    // a 0/1/2 flag column is not an IV column
    score *= 0.5;
  }
  return score;
}

interface Candidate {
  def: ConceptDef;
  col: ColumnStats;
  header: number;
  content: number;
}

/** A header that names no concept and is not on the ignore list, or no header row at all. */
function unlabelled(col: ColumnStats): boolean {
  if (col.header === null) {
    return true;
  }
  // a league-tagged header is some per-league stat, never a plain concept
  return (
    col.header.tag === null && !looksLikeHeader(col.header) && !IGNORED_HEADERS.has(col.header.key)
  );
}

/** Can this pairing be assigned at all? Thresholds from the spec. */
function acceptable(c: Candidate): boolean {
  if (c.header >= 1) {
    return c.content >= 0.5;
  }
  if (c.header > 0) {
    return c.content >= 0.7;
  }
  return c.def.contentAlone && c.content >= 0.8 && unlabelled(c.col);
}

export class LayoutError extends Error {
  readonly layout: Layout;

  constructor(message: string, layout: Layout) {
    super(message);
    this.name = 'LayoutError';
    this.layout = layout;
  }
}

/**
 * Scores every column against every concept, assigns greedily (best pairing first, one column
 * per concept, one concept per column), then applies the IV order rule. Throws when a required
 * concept is missing.
 */
export function resolveLayout(rows: string[][], delimiter: string, deps: ShapeDeps): Layout {
  const first = rows[0] ?? [];
  const hasHeader = detectHeader(first);
  const columnCount = first.length;
  const cols = Array.from({ length: columnCount }, (_, i) => columnStats(rows, hasHeader, i));

  const candidates: Candidate[] = [];
  for (const def of CONCEPTS) {
    for (const col of cols) {
      const header = col.header ? headerScore(def, col.header) : 0;
      const content = contentScore(def, col, deps);
      const c = { def, col, header, content };
      if (acceptable(c)) {
        candidates.push(c);
      }
    }
  }
  candidates.sort((a, b) => {
    const d = b.header + b.content - (a.header + a.content);
    if (d !== 0) {
      return d;
    }
    return a.col.index - b.col.index;
  });

  const byConcept = new Map<Concept, LayoutColumn>();
  const taken = new Set<number>();
  const assign = (list: Candidate[]): void => {
    for (const c of list) {
      if (byConcept.has(c.def.concept) || taken.has(c.col.index)) {
        continue;
      }
      byConcept.set(c.def.concept, {
        concept: c.def.concept,
        index: c.col.index,
        header: c.col.raw,
        via: c.header > 0 ? 'header' : 'content',
        confidence: c.content,
      });
      taken.add(c.col.index);
    }
  };

  // Labelled columns first: a header is worth more than any value shape.
  assign(candidates.filter((c) => c.header > 0));

  // IV order rule: unlabelled IV-shaped columns fill attack, defense, stamina in file order,
  // ahead of the value-only pass so a whole-number level column cannot take an IV's place.
  let ivOrderAssumed = false;
  const ivConcepts: Concept[] = ['atk', 'def', 'sta'];
  const openIvs = ivConcepts.filter((k) => !byConcept.has(k));
  if (openIvs.length > 0) {
    const ivDef = CONCEPTS.find((d) => d.concept === 'atk') as ConceptDef;
    const free = cols
      .filter((col) => !taken.has(col.index) && col.values.length > 0 && unlabelled(col))
      .filter((col) => contentScore(ivDef, col, deps) >= 0.8 && col.maxNumber > 2);
    for (const k of openIvs) {
      const col = free.shift();
      if (!col) {
        break;
      }
      byConcept.set(k, {
        concept: k,
        index: col.index,
        header: col.raw,
        via: 'order',
        confidence: 1,
      });
      taken.add(col.index);
      ivOrderAssumed = true;
    }
  }

  // Then whatever the values alone can prove.
  assign(candidates.filter((c) => c.header === 0));

  const columns = [...byConcept.values()].sort((a, b) => a.index - b.index);
  const unused = cols
    .filter((col) => !taken.has(col.index))
    .map((col) =>
      col.raw !== null && col.raw.trim() !== '' ? col.raw.trim() : `column ${col.index + 1}`,
    );
  const missing = CONCEPTS.map((d) => d.concept).filter(
    (k) => !byConcept.has(k) && !REQUIRED_CONCEPTS.includes(k),
  );
  const missingRequired = REQUIRED_CONCEPTS.filter((k) => !byConcept.has(k));
  const confidence = Math.min(
    1,
    ...REQUIRED_CONCEPTS.map((k) => byConcept.get(k)?.confidence ?? 0),
  );

  const headerKeys = new Set(cols.map((c) => c.header?.key ?? ''));
  let format: Layout['format'] = 'sheet';
  if (byConcept.has('pgShaPurG') || byConcept.has('pgRankPctG')) {
    format = 'poke-genie';
  } else if (headerKeys.has('uniqueivcombos') || headerKeys.has('overallappraisal')) {
    format = 'calcy-iv';
  }

  const layout: Layout = {
    format,
    delimiter,
    hasHeader,
    columnCount,
    columns,
    unused,
    missing,
    ivOrderAssumed,
    confidence,
  };

  if (missingRequired.length > 0) {
    const what = missingRequired.map((k) => CONCEPT_LABEL[k]);
    throw new LayoutError(
      `Could not find the ${what.join(', ')} column${what.length === 1 ? '' : 's'}. pick3 needs a name, CP and the three IVs.`,
      layout,
    );
  }
  return layout;
}

/** One line for the diagnostics log: structure only, never values. */
export function describeLayout(layout: Layout): string {
  const cols = layout.columns
    .map((c) => `${c.concept}=${c.header ?? `col${c.index + 1}`}<${c.via[0]}>`)
    .join(' ');
  const unused = layout.unused.length > 0 ? ` unused=${layout.unused.join('|')}` : '';
  return `format=${layout.format} cols=${layout.columnCount} header=${layout.hasHeader ? 1 : 0} conf=${layout.confidence.toFixed(2)} ${cols}${unused}`;
}
