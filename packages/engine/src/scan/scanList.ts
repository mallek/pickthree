import { metaCounters, type CountersData } from '../counters/counters.js';
import type { GameDataIndex } from '../gamedata/index.js';
import type { BuildOptions } from '../builds/eligibility.js';

export interface ScanListOptions {
  /** Eligibility rules for the league; defaults to open Great League. */
  buildOptions?: BuildOptions;
  /** PvPoke overall rank cutoff for species worth scanning. */
  overallTop: number;
  /** How many anti-meta counters to include. */
  countersTop: number;
  cpCap: number;
}

export const DEFAULT_SCAN_LIST_OPTIONS: ScanListOptions = {
  overallTop: 100,
  countersTop: 60,
  cpCap: 1500,
};

export interface ScanList {
  /** Pokémon GO search string, e.g. "cp-1500&1-3,25-26,258-260". */
  search: string;
  /** Distinct dex numbers in the string. */
  dexCount: number;
  /** Species covered, pre-evolutions included. */
  speciesCount: number;
  sources: { overall: number; counters: number; preEvolutions: number };
}

/** "1,2,3,7,9" -> "1-3,7,9". */
export function compressRanges(nums: number[]): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) {
      j += 1;
    }
    const a = sorted[i]!;
    const b = sorted[j]!;
    parts.push(j - i >= 1 ? `${a}-${b}` : `${a}`);
    i = j + 1;
  }
  return parts.join(',');
}

/**
 * A Pokémon GO search string that narrows storage to what is worth scanning for Great League:
 * the top overall picks, the strongest meta counters, and every stage that evolves into one,
 * all at or under the CP cap. Dex numbers cover regional forms and shadows for free.
 */
export function scanList(
  data: CountersData,
  index: GameDataIndex,
  options: Partial<ScanListOptions> = {},
): ScanList {
  const opts: ScanListOptions = { ...DEFAULT_SCAN_LIST_OPTIONS, ...options };
  const picked = new Set<string>();
  let overall = 0;
  for (const r of data.rankings.overall.slice(0, opts.overallTop)) {
    if (!picked.has(r.speciesId)) {
      picked.add(r.speciesId);
      overall += 1;
    }
  }
  let counters = 0;
  for (const c of metaCounters(data, [], index, {
    limit: opts.countersTop,
    ...(options.buildOptions ? { buildOptions: options.buildOptions } : {}),
  })) {
    if (!picked.has(c.speciesId)) {
      picked.add(c.speciesId);
      counters += 1;
    }
  }
  let preEvolutions = 0;
  for (const id of [...picked]) {
    let cur = index.species(id);
    const guard = new Set<string>();
    while (cur && cur.parentId && !guard.has(cur.speciesId)) {
      guard.add(cur.speciesId);
      cur = index.species(cur.parentId);
      if (cur && !picked.has(cur.speciesId)) {
        picked.add(cur.speciesId);
        preEvolutions += 1;
      }
    }
  }
  const dex = [...picked]
    .map((id) => index.species(id)?.dex)
    .filter((d): d is number => typeof d === 'number' && d > 0);
  const search =
    opts.cpCap >= 10000 ? compressRanges(dex) : `cp-${opts.cpCap}&${compressRanges(dex)}`;
  return {
    search,
    dexCount: new Set(dex).size,
    speciesCount: picked.size,
    sources: { overall, counters, preEvolutions },
  };
}
