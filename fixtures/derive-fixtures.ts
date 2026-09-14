/**
 * Derives the other-layout fixtures from pokegenie-sample.csv so every layout carries the same
 * Pokémon and the import tests can compare them row for row.
 *
 *   pokegenie-2025.csv   the layout a Reddit tester sent on 2026-09-13: "Pokemon" instead of
 *                        "Pokemon Number", "Stat Product" instead of "Stat Prod", no
 *                        Original Scan Date
 *   calcy-iv-sample.csv  approximate Calcy IV headers (not copied from a real export)
 *   sheet-headers.csv    a hand-made sheet: Name, CP, Atk, Def, Sta, Level, forms and shadows
 *                        folded into the name
 *   sheet-noheader.tsv   the same six columns, tab separated, no header row
 *   sheet-semicolon.csv  Pokemon;CP;Attack;Defense;Stamina;Level;Shadow with yes/no flags
 *
 * Usage: npm run fixtures:derive
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

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

function toLine(fields: string[], d = ','): string {
  const special = new RegExp(`["${d === '|' ? '\\|' : d}\\n]`);
  return fields.map((f) => (special.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(d);
}

const text = fs
  .readFileSync(path.join(here, 'pokegenie-sample.csv'), 'utf8')
  .replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
const header = parseLine(lines[0] as string);
const rows = lines.slice(1).map(parseLine);
const col = (name: string): number => {
  const i = header.indexOf(name);
  if (i < 0) {
    throw new Error(`column ${name} missing in sample`);
  }
  return i;
};
const cell = (r: string[], name: string): string => {
  const i = header.indexOf(name);
  return i < 0 ? '' : (r[i] ?? '');
};

function write(name: string, body: string[]): void {
  fs.writeFileSync(path.join(here, name), body.join('\n') + '\n');
  console.log(`${name}: ${body.length} lines`);
}

// 1. Poke Genie, the 2025 layout.
{
  const renamed = header
    .filter((h) => h !== 'Original Scan Date')
    .map((h) => (h === 'Pokemon Number' ? 'Pokemon' : h.replace('Stat Prod (', 'Stat Product (')));
  const drop = col('Original Scan Date');
  const body = [toLine(renamed), ...rows.map((r) => toLine(r.filter((_, i) => i !== drop)))];
  write('pokegenie-2025.csv', body);
}

// Shared shape for the hand-made sheets: fold form and shadow into the name.
function foldedName(r: string[]): string {
  const form = cell(r, 'Form');
  const shadow = cell(r, 'Shadow/Purified') === '1';
  const parts = [
    shadow ? 'Shadow' : '',
    form !== '' && form !== 'Normal' ? form : '',
    cell(r, 'Name'),
  ];
  return parts.filter((p) => p !== '').join(' ');
}

// 2. Calcy IV, approximate headers.
{
  const head = [
    'Nr',
    'Name',
    'Form',
    'Gender',
    'Fast move',
    'Charge move',
    'Charge move 2',
    'Level',
    'CP',
    'HP',
    'Dust cost',
    'Overall appraisal',
    'Att IV',
    'Def IV',
    'HP IV',
    'Unique IV combos',
    'Catch date',
    'Lucky',
    'Shadow',
    'Purified',
    'Scan date',
  ];
  const body = [
    toLine(head),
    ...rows.map((r, i) =>
      toLine([
        String(i + 1),
        cell(r, 'Name'),
        cell(r, 'Form'),
        cell(r, 'Gender'),
        cell(r, 'Fast Move') || cell(r, 'Quick Move'),
        cell(r, 'Charge Move'),
        cell(r, 'Charge Move 2'),
        cell(r, 'Level Min'),
        cell(r, 'CP'),
        cell(r, 'HP'),
        cell(r, 'Dust'),
        '',
        cell(r, 'Atk IV'),
        cell(r, 'Def IV'),
        cell(r, 'Sta IV'),
        '1',
        cell(r, 'Catch Date'),
        cell(r, 'Lucky') === '1' ? 'yes' : 'no',
        cell(r, 'Shadow/Purified') === '1' ? 'yes' : 'no',
        cell(r, 'Shadow/Purified') === '2' ? 'yes' : 'no',
        cell(r, 'Scan Date'),
      ]),
    ),
  ];
  write('calcy-iv-sample.csv', body);
}

// 3. Hand-made sheet with headers.
{
  const body = [
    toLine(['Name', 'CP', 'Atk', 'Def', 'Sta', 'Level']),
    ...rows.map((r) =>
      toLine([
        foldedName(r),
        cell(r, 'CP'),
        cell(r, 'Atk IV'),
        cell(r, 'Def IV'),
        cell(r, 'Sta IV'),
        cell(r, 'Level Min'),
      ]),
    ),
  ];
  write('sheet-headers.csv', body);
}

// 4. The same, tab separated, no header, no level.
{
  const body = rows.map((r) =>
    toLine(
      [foldedName(r), cell(r, 'CP'), cell(r, 'Atk IV'), cell(r, 'Def IV'), cell(r, 'Sta IV')],
      '\t',
    ),
  );
  write('sheet-noheader.tsv', body);
}

// 5. Semicolon separated with yes/no shadow flags and different words for the IVs.
{
  const body = [
    toLine(['Pokemon', 'CP', 'Attack', 'Defense', 'Stamina', 'Level', 'Shadow'], ';'),
    ...rows.map((r) => {
      const form = cell(r, 'Form');
      const name =
        form !== '' && form !== 'Normal' ? `${cell(r, 'Name')} (${form})` : cell(r, 'Name');
      return toLine(
        [
          name,
          cell(r, 'CP'),
          cell(r, 'Atk IV'),
          cell(r, 'Def IV'),
          cell(r, 'Sta IV'),
          cell(r, 'Level Min'),
          cell(r, 'Shadow/Purified') === '1' ? 'yes' : 'no',
        ],
        ';',
      );
    }),
  ];
  write('sheet-semicolon.csv', body);
}
