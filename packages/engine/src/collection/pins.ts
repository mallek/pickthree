import { isAlreadyBuilt, type Build } from '../builds/eligibility.js';

/**
 * One league's pins, by the species as it battles (a build's speciesId, so the Umbreon pin can
 * name an Eevee and a Shadow form has its own). No entry: the default pick. An id: the player's
 * override. null: unpinned, none of the player's copies is fielded.
 */
export type PinMap = Record<string, string | null>;

/** A built copy leads the default pick only inside this share of the IV ranks, in percent. */
export const BUILT_TOP_PCT = 25;

function builtAndGood(b: Build): boolean {
  const pct = Math.max(1, Math.round((b.ivRank.rank / b.ivRank.total) * 100));
  return pct <= BUILT_TOP_PCT && isAlreadyBuilt(b, b.specimen);
}

/**
 * The order copies of one battling species are picked in: a built copy with good IVs, then IV
 * rank, then fewest evolutions to go, then fewest levels to go, then the id. "Best verdict, then
 * IV rank" without a simulation.
 */
export function comparePicks(a: Build, b: Build): number {
  const tier = Number(!builtAndGood(a)) - Number(!builtAndGood(b));
  if (tier !== 0) {
    return tier;
  }
  const togo = (x: Build): number => x.baseLevel - x.specimen.level.max;
  return (
    a.ivRank.rank - b.ivRank.rank ||
    a.stageOffset - b.stageOffset ||
    togo(a) - togo(b) ||
    (a.specimenId < b.specimenId ? -1 : a.specimenId > b.specimenId ? 1 : 0)
  );
}

export function defaultPick(builds: readonly Build[]): Build | null {
  return [...builds].sort(comparePicks)[0] ?? null;
}

/**
 * The fielded build of one species. `passing` are its builds that passed the caller's filters,
 * `all` every build of it. An override names a copy: fielded when it passed, nothing when it has
 * a build that did not (the player's word is not swapped), the default when it has no build of
 * this species at all (a stale pin).
 */
export function resolvePick(
  passing: readonly Build[],
  all: readonly Build[],
  pin: string | null | undefined,
): Build | null {
  if (pin === null) {
    return null;
  }
  if (pin !== undefined && all.some((b) => b.specimenId === pin)) {
    return passing.find((b) => b.specimenId === pin) ?? null;
  }
  return defaultPick(passing);
}

/** One build per battling species: the pinned copy's, or the default pick's. */
export function fieldedBuilds(builds: readonly Build[], pins: PinMap = {}): Build[] {
  const bySpecies = new Map<string, Build[]>();
  for (const b of builds) {
    const list = bySpecies.get(b.speciesId) ?? [];
    list.push(b);
    bySpecies.set(b.speciesId, list);
  }
  const out: Build[] = [];
  for (const [speciesId, list] of bySpecies) {
    const pick = resolvePick(list, list, pins[speciesId]);
    if (pick) {
      out.push(pick);
    }
  }
  return out;
}

/** Every league's pins without the ones that named these Pokemon. Empty leagues are dropped. */
export function dropPins(
  pins: Record<string, PinMap>,
  ids: ReadonlySet<string>,
): Record<string, PinMap> {
  const out: Record<string, PinMap> = {};
  for (const [league, map] of Object.entries(pins)) {
    const kept = Object.entries(map).filter(([, v]) => v === null || !ids.has(v));
    if (kept.length > 0) {
      out[league] = Object.fromEntries(kept);
    }
  }
  return out;
}
