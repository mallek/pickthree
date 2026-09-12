/**
 * Builds the synthetic Poke Genie fixtures from a real export kept OUTSIDE the repo
 * (private/poke_genie_export.csv, gitignored). Keeps a stratified subset of rows so the awkward
 * cases survive (forms, shadows, blank IVs, level ranges, duplicates, unmapped species), drops
 * dates, weight and height, renumbers Index and shifts scan dates. IVs and Poke Genie's own rank
 * and cost columns are kept verbatim because tests use them as a cross-check oracle.
 *
 * Usage: npm run fixtures:make
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const source =
  process.env.PICKTHREE_PRIVATE_CSV ?? path.join(repoRoot, 'private', 'poke_genie_export.csv');

if (!fs.existsSync(source)) {
  console.error(`No private export at ${source}. Nothing to do.`);
  process.exit(1);
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function toLine(fields: string[]): string {
  return fields.map((f) => (/[",\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(',');
}

// Small seeded PRNG so the fixture is reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const text = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
const header = parseLine(lines[0] as string);
const rows = lines.slice(1).map(parseLine);
const col = (name: string): number => {
  const i = header.indexOf(name);
  if (i < 0) {
    throw new Error(`column ${name} missing in private export`);
  }
  return i;
};

const cName = col('Name');
const cForm = col('Form');
const cAtk = col('Atk IV');
const cDef = col('Def IV');
const cSta = col('Sta IV');
const cLMin = col('Level Min');
const cLMax = col('Level Max');
const cShadow = col('Shadow/Purified');
const cScan = col('Scan Date');
const cOrig = col('Original Scan Date');
const cCatch = col('Catch Date');
const cWeight = col('Weight');
const cHeight = col('Height');
const cIndex = col('Index');

const rand = mulberry32(20260912);
const pick = new Set<number>();

const dupKey = (r: string[]): string =>
  [r[cName], r[cForm], r[cAtk], r[cDef], r[cSta], r[cLMax], r[cShadow]].join('|');
const groups = new Map<string, number[]>();
rows.forEach((r, i) => {
  const k = dupKey(r);
  const g = groups.get(k) ?? [];
  g.push(i);
  groups.set(k, g);
});

rows.forEach((r, i) => {
  const form = r[cForm] ?? '';
  const shadow = r[cShadow] === '1' || r[cShadow] === '2';
  const blankIv = (r[cAtk] ?? '') === '';
  const levelRange = r[cLMin] !== r[cLMax];
  const unmapped = ['Gimmighoul', 'Tatsugiri', 'Morpeko', 'Thundurus'].includes(r[cName] ?? '');
  if ((form !== '' && form !== 'Normal') || shadow || levelRange || unmapped) {
    pick.add(i);
  }
  if (blankIv && [...pick].filter((j) => (rows[j]?.[cAtk] ?? '') === '').length < 10) {
    pick.add(i);
  }
});

let dupGroups = 0;
for (const g of groups.values()) {
  if (g.length > 1 && (rows[g[0] as number]?.[cAtk] ?? '') !== '' && dupGroups < 2) {
    g.forEach((i) => pick.add(i));
    dupGroups++;
  }
}

const target = 120;
const others = rows.map((_, i) => i).filter((i) => !pick.has(i));
while (pick.size < target && others.length > 0) {
  const j = Math.floor(rand() * others.length);
  pick.add(others[j] as number);
  others.splice(j, 1);
}

const dayShift = 7 + Math.floor(rand() * 20);
function shiftDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/.exec(v);
  if (!m) {
    return v;
  }
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - dayShift);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${m[4]}`;
}

const chosen = [...pick].sort((a, b) => a - b);
const sample = chosen.map((i, n) => {
  const r = [...(rows[i] as string[])];
  r[cIndex] = String(n + 1);
  r[cCatch] = '';
  r[cWeight] = '';
  r[cHeight] = '';
  r[cScan] = shiftDate(r[cScan] ?? '');
  r[cOrig] = shiftDate(r[cOrig] ?? '');
  return r;
});

const out = (name: string, hdr: string[], body: string[][]): void => {
  const p = path.join(here, name);
  fs.writeFileSync(p, [toLine(hdr), ...body.map(toLine)].join('\n') + '\n');
  console.log(`${name}: ${body.length} rows`);
};

out('pokegenie-sample.csv', header, sample);

// Malformed: 10 clean rows plus three broken ones.
const malformed = sample.slice(0, 10).map((r) => [...r]);
const broken1 = [...(sample[10] as string[])].slice(0, 47);
const broken2 = [...(sample[11] as string[])];
broken2[col('CP')] = 'abc';
const broken3 = [...(sample[12] as string[])];
broken3[cAtk] = '17';
out('pokegenie-malformed.csv', header, [...malformed, broken1, broken2, broken3]);

// Renamed column plus an unknown extra column.
const renamedHeader = header.map((h) => (h === 'Quick Move' ? 'Fast Move' : h));
renamedHeader.push('Notes');
out(
  'pokegenie-renamed-column.csv',
  renamedHeader,
  sample.slice(0, 20).map((r) => [...r, 'exported by a newer app']),
);
