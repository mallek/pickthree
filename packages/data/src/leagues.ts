import fs from 'node:fs';
import path from 'node:path';
import type { CupFilter, League } from '@pickthree/engine';
import { minCpFor } from '@pickthree/engine';
import { GROUPS_DIR, PVPOKE_DIR, RANKINGS_DIR } from './paths.js';

interface RawCup {
  name: string;
  title: string;
  include?: CupFilter[];
  exclude?: CupFilter[];
}

interface RawFormat {
  title: string;
  cup: string;
  cp: number;
  meta: string;
  showFormat?: boolean;
  hideRankings?: boolean;
}

const CUPS_DIR = path.join(PVPOKE_DIR, 'src', 'data', 'gamemaster', 'cups');
const FORMATS_PATH = path.join(PVPOKE_DIR, 'src', 'data', 'gamemaster', 'formats.json');

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) as T;
}

function readCup(name: string): RawCup {
  return readJson<RawCup>(path.join(CUPS_DIR, `${name}.json`));
}

function hasRankings(cup: string, cp: number): boolean {
  return fs.existsSync(path.join(RANKINGS_DIR, cup, 'overall', `rankings-${cp}.json`));
}

function hasGroup(meta: string): boolean {
  return fs.existsSync(path.join(GROUPS_DIR, `${meta}.json`));
}

const STANDARD: { id: string; title: string; short: string; cp: number; meta: string }[] = [
  { id: 'great', title: 'Great League', short: 'Great', cp: 1500, meta: 'great' },
  { id: 'ultra', title: 'Ultra League', short: 'Ultra', cp: 2500, meta: 'ultra' },
  { id: 'master', title: 'Master League', short: 'Master', cp: 10000, meta: 'master' },
];

function shortTitle(title: string): string {
  return title
    .replace(/ Championship Series Cup$/, '')
    .replace(/ League$/, '')
    .replace(/ Cup$/, '')
    .trim();
}

function idFor(f: RawFormat): string {
  const cap =
    f.cp === 1500 ? 'great' : f.cp === 2500 ? 'ultra' : f.cp === 10000 ? 'master' : String(f.cp);
  return f.cup === 'mega' ? `mega-${cap}` : f.cup;
}

/**
 * The leagues pick3 builds for: the three open leagues plus every special format PvPoke is
 * currently showing that has rankings and a meta group at the pinned commit.
 */
export function readLeagues(): League[] {
  const all = readCup('all');
  const out: League[] = STANDARD.map((s) => ({
    id: s.id,
    title: s.title,
    short: s.short,
    cp: s.cp,
    cup: 'all',
    meta: s.meta,
    kind: 'standard',
    minCp: minCpFor(s.cp),
    include: all.include ?? [],
    exclude: all.exclude ?? [],
    metaSize: 0,
  }));
  // Special cups are built only when asked for. The rules work, but the app does not yet know
  // enough about them (megas in the Mega cups, for one) to recommend with a straight face.
  const formats =
    process.env.PICKTHREE_SPECIAL_CUPS === '1' ? readJson<RawFormat[]>(FORMATS_PATH) : [];
  for (const f of formats) {
    if (!f.showFormat || f.hideRankings || f.cup === 'custom' || f.cup === 'all') {
      continue;
    }
    if (!hasRankings(f.cup, f.cp) || !hasGroup(f.meta)) {
      continue;
    }
    const cup = readCup(f.cup);
    out.push({
      id: idFor(f),
      title: f.title,
      short: shortTitle(f.title),
      cp: f.cp,
      cup: f.cup,
      meta: f.meta,
      kind: 'special',
      minCp: minCpFor(f.cp),
      include: cup.include ?? [],
      exclude: cup.exclude ?? [],
      metaSize: 0,
    });
  }
  return out;
}
