import type { GameDataIndex } from '../gamedata/index.js';
import { megaFormOf, type Specimen } from './specimen.js';

/** What is left of a Pokemon the player removed, so a re-import does not bring it back. */
export interface RemovedMark {
  /** matchKey of the Pokemon when it was removed. */
  key: string;
  /** Its species, without the Shadow suffix: a mark only blocks its own evolution line. */
  speciesId: string;
  removedAt: string;
}

export interface MergeBreakdown {
  /** Scan rows that became new Pokemon. */
  added: number;
  /** Scan rows that matched a Pokemon already stored. */
  merged: number;
  /** Of the merged, how many a newer scan changed. */
  updated: number;
  /** Scan rows that matched a Pokemon the player removed. */
  skipped: number;
  /** Ids of stored, scanned Pokemon this scan did not contain. They are kept. */
  notInScan: string[];
}

export interface MergeResult {
  specimens: Specimen[];
  breakdown: MergeBreakdown;
}

/** Phone-local wall-clock time, the frame scan dates are written in, so the two compare as text. */
export function localStamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

type Values = Pick<Specimen, 'speciesId' | 'shadow' | 'ivs' | 'cp' | 'hp'>;

/**
 * What two records of one Pokemon share whatever its level or stage: the Shadow flag and the
 * IVs. With no IVs, the species, CP and HP stand in, as the id does.
 */
export function matchKey(s: Values, index: GameDataIndex): string {
  const side = s.shadow ? 's' : 'n';
  return s.ivs
    ? `${side}|${s.ivs.atk}/${s.ivs.def}/${s.ivs.sta}`
    : `${side}|noiv|${index.baseOf(s.speciesId)}|${s.cp}/${s.hp}`;
}

/** The same species, or one evolves into the other. Regional forms are their own lines. */
function sameLine(a: string, b: string, index: GameDataIndex): boolean {
  const x = index.baseOf(a);
  const y = index.baseOf(b);
  return (
    x === y ||
    index.stagesFrom(x).some((s) => s.speciesId === y) ||
    index.stagesFrom(y).some((s) => s.speciesId === x)
  );
}

const DATED = /^\d{4}-\d{2}-\d{2}/;

function byId(a: Specimen, b: Specimen): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function movesOf(s: Specimen): string {
  return `${s.currentMoves.fast ?? ''}|${s.currentMoves.charged.join('+')}`;
}

function differs(a: Specimen, b: Specimen): boolean {
  return (
    a.speciesId !== b.speciesId ||
    a.cp !== b.cp ||
    a.level.max !== b.level.max ||
    (a.ivs === null) !== (b.ivs === null) ||
    a.lucky !== b.lucky ||
    a.purified !== b.purified ||
    movesOf(a) !== movesOf(b)
  );
}

/** The stored Pokemon with a newer scan's values: its id and what only pick3 knows stay. */
function applyScan(old: Specimen, scan: Specimen, at: string): Specimen {
  const next: Specimen = {
    ...scan,
    id: old.id,
    scannedAt: at,
    megaForm: megaFormOf(scan) ?? megaFormOf(old),
  };
  if (old.megaLevel4) {
    next.megaLevel4 = true;
  }
  if (old.editedAt) {
    next.editedAt = old.editedAt;
  }
  if (old.evolvedFrom) {
    next.evolvedFrom = old.evolvedFrom;
  }
  return next;
}

/**
 * Fold a parsed scan into the stored collection. A scan row that is a stored Pokemon (same Shadow
 * flag, same IVs, same evolution line) keeps that Pokemon's id and updates it only when the scan
 * is newer than everything known about it. A row matching a removed Pokemon is skipped. Nothing
 * stored is dropped: what the scan lacks is reported, not removed.
 */
export function mergeScan(
  existing: readonly Specimen[],
  removed: readonly RemovedMark[],
  scanned: readonly Specimen[],
  index: GameDataIndex,
  now: string,
): MergeResult {
  const buckets = new Map<string, Specimen[]>();
  for (const old of existing) {
    const key = matchKey(old, index);
    const list = buckets.get(key) ?? [];
    list.push(old);
    buckets.set(key, list);
  }
  // Every stored Pokemon a scan row could be, best pairing first: the same species before
  // another stage, then the closest level, then the closest CP, then ids so file order is moot.
  const options: { old: Specimen; scan: Specimen; stage: number; level: number; cp: number }[] =
    [];
  for (const scan of scanned) {
    for (const old of buckets.get(matchKey(scan, index)) ?? []) {
      if (sameLine(old.speciesId, scan.speciesId, index)) {
        options.push({
          old,
          scan,
          stage: index.baseOf(old.speciesId) === index.baseOf(scan.speciesId) ? 0 : 1,
          level: Math.abs(old.level.max - scan.level.max),
          cp: Math.abs(old.cp - scan.cp),
        });
      }
    }
  }
  options.sort(
    (a, b) =>
      a.stage - b.stage ||
      a.level - b.level ||
      a.cp - b.cp ||
      byId(a.old, b.old) ||
      byId(a.scan, b.scan),
  );
  const scanOf = new Map<Specimen, Specimen>();
  const taken = new Set<Specimen>();
  for (const o of options) {
    if (!scanOf.has(o.old) && !taken.has(o.scan)) {
      scanOf.set(o.old, o.scan);
      taken.add(o.scan);
    }
  }
  // The rescan pick3 asks for: a Pokemon stored without IVs, scanned again with them.
  const free = scanned.filter((s) => !taken.has(s)).sort(byId);
  for (const old of existing) {
    if (old.ivs !== null || scanOf.has(old)) {
      continue;
    }
    const scan = free.find(
      (s) =>
        !taken.has(s) &&
        s.ivs !== null &&
        s.shadow === old.shadow &&
        index.baseOf(s.speciesId) === index.baseOf(old.speciesId) &&
        s.cp === old.cp &&
        s.hp === old.hp,
    );
    if (scan) {
      scanOf.set(old, scan);
      taken.add(scan);
    }
  }

  const breakdown: MergeBreakdown = { added: 0, merged: 0, updated: 0, skipped: 0, notInScan: [] };
  const out: Specimen[] = [];
  for (const old of existing) {
    const scan = scanOf.get(old);
    if (!scan) {
      out.push(old);
      if (old.source !== 'manual') {
        breakdown.notInScan.push(old.id);
      }
      continue;
    }
    breakdown.merged += 1;
    // A row with no usable date (a hand-made sheet) is dated at the import itself.
    const at = DATED.test(scan.scannedAt) ? scan.scannedAt : now;
    const known = old.editedAt && old.editedAt > old.scannedAt ? old.editedAt : old.scannedAt;
    if (at > known) {
      const next = applyScan(old, scan, at);
      if (differs(old, next)) {
        breakdown.updated += 1;
      }
      out.push(next);
    } else {
      out.push(old);
    }
  }
  const marks = [...removed];
  const ids = new Set(out.map((s) => s.id));
  for (const scan of scanned.filter((s) => !taken.has(s)).sort(byId)) {
    const key = matchKey(scan, index);
    const m = marks.findIndex((x) => x.key === key && sameLine(x.speciesId, scan.speciesId, index));
    if (m >= 0) {
      // One mark skips one row per import; the stored marks themselves are not used up.
      marks.splice(m, 1);
      breakdown.skipped += 1;
      continue;
    }
    // An id is minted from values, so a new Pokemon can hash to one a stored Pokemon already
    // holds (it has since been edited). The stored one keeps it.
    let id = scan.id;
    for (let n = 2; ids.has(id); n++) {
      id = `${scan.id}-${n}`;
    }
    ids.add(id);
    breakdown.added += 1;
    out.push(id === scan.id ? scan : { ...scan, id });
  }
  return { specimens: out, breakdown };
}

/** Take Pokemon out of the collection, leaving a mark for each so an import skips them. */
export function removeSpecimens(
  existing: readonly Specimen[],
  removed: readonly RemovedMark[],
  ids: ReadonlySet<string>,
  index: GameDataIndex,
  now: string,
): { specimens: Specimen[]; removed: RemovedMark[] } {
  const marks = [...removed];
  const specimens: Specimen[] = [];
  for (const s of existing) {
    if (ids.has(s.id)) {
      marks.push({ key: matchKey(s, index), speciesId: index.baseOf(s.speciesId), removedAt: now });
    } else {
      specimens.push(s);
    }
  }
  return { specimens, removed: marks };
}

/** The marks without one that would block this Pokemon: it was added back on purpose. */
export function clearMark(
  removed: readonly RemovedMark[],
  s: Specimen,
  index: GameDataIndex,
): RemovedMark[] {
  const key = matchKey(s, index);
  const m = removed.findIndex((x) => x.key === key && sameLine(x.speciesId, s.speciesId, index));
  return m < 0 ? [...removed] : removed.filter((_, i) => i !== m);
}
