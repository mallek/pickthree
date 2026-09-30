import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { CupFilter, League, ScheduleEntry } from '@pickthree/engine';
import { minCpFor, runsOf } from '@pickthree/engine';
import { readLock } from './lock.js';
import { GROUPS_DIR, PVPOKE_DIR, RANKINGS_DIR } from './paths.js';
import { readSchedule } from './schedule-feed.js';

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

export function hasRankings(cup: string, cp: number): boolean {
  return fs.existsSync(path.join(RANKINGS_DIR, cup, 'overall', `rankings-${cp}.json`));
}

export function hasGroup(meta: string): boolean {
  return fs.existsSync(path.join(GROUPS_DIR, `${meta}.json`));
}

export const STALE_DAYS = 30;

/**
 * PvPoke's meta group name for a cup at a cap: formats.json's `meta` for the format that lists
 * the cup at that cap, else for the first format that lists the cup at any cap, else the slug.
 * The cap matters: the Mega cup has a different group per league.
 */
export function metaGroupFor(cup: string, cp: number): string {
  return metaGroupIn(readJson<RawFormat[]>(FORMATS_PATH), cup, cp);
}

/** metaGroupFor over a given formats list. */
export function metaGroupIn(
  formats: readonly Pick<RawFormat, 'cup' | 'cp' | 'meta'>[],
  cup: string,
  cp: number,
): string {
  return (
    formats.find((f) => f.cup === cup && f.cp === cp)?.meta ??
    formats.find((f) => f.cup === cup)?.meta ??
    cup
  );
}

/** The day PvPoke last changed the cup's overall rankings at the pinned commit, or null. */
export function rankingsUpdated(cup: string, cp: number): string | null {
  const rel = path.posix.join('src', 'data', 'rankings', cup, 'overall', `rankings-${cp}.json`);
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', 'HEAD', '--', rel], {
      cwd: PVPOKE_DIR,
      encoding: 'utf8',
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** Rankings older than the run by more than STALE_DAYS, or of unknown age. */
export function isStale(updated: string | null, runStart: string): boolean {
  if (updated === null) {
    return true;
  }
  return Date.parse(runStart) - Date.parse(`${updated}T00:00:00Z`) > STALE_DAYS * 86_400_000;
}

const STANDARD: { id: string; title: string; short: string; cp: number; meta: string }[] = [
  { id: 'great', title: 'Great League', short: 'Great', cp: 1500, meta: 'great' },
  { id: 'ultra', title: 'Ultra League', short: 'Ultra', cp: 2500, meta: 'ultra' },
  { id: 'master', title: 'Master League', short: 'Master', cp: 10000, meta: 'master' },
];

/** One PvPoke cup promoted to a pick3 league whatever PICKTHREE_SPECIAL_CUPS says, because it is
 *  a ruleset players actually build for. Its rankings, meta group and matrix are derived from
 *  `derivesFrom` filtered to the cup's legal species (build-derived.ts) rather than simulated
 *  again: PvPoke's own `rankingAlias` for championshipseries is `all`, and matchups do not change
 *  when a species is banned. */
interface ShippedCup {
  id: string;
  cup: string;
  title: string;
  short: string;
  cp: number;
  meta: string;
  derivesFrom: string;
}

export const SHIPPED_CUPS: readonly ShippedCup[] = [
  {
    id: 'championshipseries',
    cup: 'championshipseries',
    title: 'Tournament',
    short: 'Tournament',
    cp: 1500,
    meta: 'great',
    derivesFrom: 'great',
  },
];

/** League id to the league whose rankings, meta group and matrix it is filtered from. */
export const DERIVES_FROM: Record<string, string> = Object.fromEntries(
  SHIPPED_CUPS.map((c) => [c.id, c.derivesFrom]),
);

const MEGA_BAN: CupFilter = { filterType: 'tag', values: ['mega'] };

function bansMega(exclude: readonly CupFilter[]): boolean {
  return exclude.some((f) => f.filterType === 'tag' && f.values.includes('mega'));
}

/**
 * The exclude list of a rotation league. A league from a GBL format that is not a Mega format
 * always bans Megas, whatever PvPoke's cup file allows (its laic2027 cup allows them, GBL's LAIC
 * Cup does not). An entry without the flag falls back to "Mega" in its title.
 */
export function rotationExclude(
  cupExclude: readonly CupFilter[],
  entry: Pick<ScheduleEntry, 'mega' | 'title'>,
): CupFilter[] {
  const isMegaFormat = entry.mega ?? /Mega/.test(entry.title);
  return isMegaFormat || bansMega(cupExclude) ? [...cupExclude] : [...cupExclude, MEGA_BAN];
}

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
  for (const shipped of SHIPPED_CUPS) {
    const cup = readCup(shipped.cup);
    out.push({
      id: shipped.id,
      title: shipped.title,
      short: shipped.short,
      cp: shipped.cp,
      cup: shipped.cup,
      meta: shipped.meta,
      kind: 'cup',
      minCp: minCpFor(shipped.cp),
      include: cup.include ?? [],
      exclude: cup.exclude ?? [],
      metaSize: 0,
    });
  }
  // GO Battle League cups from the schedule, whatever today's date: the build depends only on
  // committed files. The phone decides which are live or upcoming.
  const schedule = readSchedule();
  const pinDate = Date.parse(`${readLock().date}T00:00:00Z`);
  for (const id of [...new Set(schedule.map((e) => e.league))]) {
    const first = schedule.find((e) => e.league === id)!;
    if (!hasRankings(first.cup, first.cp)) {
      console.log(`no rankings: ${first.cup} at ${first.cp} (league ${id} not built)`);
      continue;
    }
    const runs = runsOf(schedule, id);
    // Staleness is judged against the run in play at the pinned commit's date, else the next.
    const run = runs.find((r) => Date.parse(r.end) > pinDate) ?? runs[runs.length - 1]!;
    const updated = rankingsUpdated(first.cup, first.cp);
    const cup = readCup(first.cup);
    out.push({
      id,
      title: first.title,
      short: first.short ?? shortTitle(first.title),
      cp: first.cp,
      cup: first.cup,
      meta: metaGroupFor(first.cup, first.cp),
      kind: 'rotation',
      minCp: minCpFor(first.cp),
      include: cup.include ?? [],
      exclude: rotationExclude(cup.exclude ?? [], first),
      metaSize: 0,
      ...(updated ? { rankingsUpdated: updated } : {}),
      stale: isStale(updated, run.start),
    });
  }
  // Special cups are built only when asked for. The rules work, but the app does not yet know
  // enough about them (megas in the Mega cups, for one) to recommend with a straight face.
  const formats =
    process.env.PICKTHREE_SPECIAL_CUPS === '1' ? readJson<RawFormat[]>(FORMATS_PATH) : [];
  for (const f of formats) {
    if (!f.showFormat || f.hideRankings || f.cup === 'custom' || f.cup === 'all') {
      continue;
    }
    if (out.some((l) => l.id === idFor(f))) {
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
