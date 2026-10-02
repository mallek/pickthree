import { buildsFor, type Build } from '../builds/eligibility.js';
import type { GameDataIndex } from '../gamedata/index.js';
import {
  specimenVerdict,
  unjudgedVerdict,
  type Verdict,
  type VerdictDeps,
} from '../verdicts/worth.js';
import { comparePicks, defaultPick, fieldedBuilds, resolvePick, type PinMap } from './pins.js';
import type { Specimen } from './specimen.js';

export interface SpeciesCopy {
  specimenId: string;
  /** The copy judged as the page's species, whatever its best stage is. */
  verdict: Verdict;
  /** Other species this copy is the fielded pick for by evolving. Empty for most. */
  alsoPickFor: string[];
}

/** One species page: your copies of it and of every lower form that can become it. */
export interface SpeciesView {
  speciesId: string;
  /** Best IV rank for the species first; copies with no build of it after; no IVs last. */
  copies: SpeciesCopy[];
  /** The copy fielded for the species in the league: the pin or the default. Null: none. */
  pickId: string | null;
  /** The default pick, whatever the pin says. Null when no copy has a build of the species. */
  defaultId: string | null;
  /** The player unpinned the species: none of their copies is fielded. */
  unpinned: boolean;
}

/**
 * The species id a copy is listed under. A Shadow saved with the flag on its plain id is its
 * Shadow form when the game data has one.
 */
function ownId(s: Pick<Specimen, 'speciesId' | 'shadow'>, index: GameDataIndex): string {
  if (!s.shadow || s.speciesId.endsWith('_shadow')) {
    return s.speciesId;
  }
  const shadow = `${s.speciesId}_shadow`;
  return index.species(shadow) ? shadow : s.speciesId;
}

/** The copy as the engine builds it: under its own species id. */
function asOwn(s: Specimen, index: GameDataIndex): Specimen {
  const own = ownId(s, index);
  return own === s.speciesId ? s : { ...s, speciesId: own };
}

/**
 * The copies a species page holds: the species itself, every lower form that can evolve into it,
 * and, on a Mega's page, whatever can become its base. Never a higher form: Eevee's page has no
 * Umbreon. A Shadow belongs to its Shadow form's page only.
 */
export function speciesMembers(
  speciesId: string,
  specimens: readonly Specimen[],
  index: GameDataIndex,
): Specimen[] {
  const base = index.species(speciesId)?.megaOf ?? speciesId;
  const reaches = new Map<string, boolean>();
  return specimens.filter((s) => {
    const own = ownId(s, index);
    let hit = reaches.get(own);
    if (hit === undefined) {
      hit = own === base || index.stagesFrom(own).some((stage) => stage.speciesId === base);
      reaches.set(own, hit);
    }
    return hit;
  });
}

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function speciesView(
  speciesId: string,
  specimens: readonly Specimen[],
  pins: PinMap,
  deps: VerdictDeps,
): SpeciesView {
  const { index } = deps;
  // The page lists a copy however far it is from competitive: no CP floor.
  const opts = { ...deps.buildOptions, minCp: 0 };
  const members = speciesMembers(speciesId, specimens, index).map((s) => asOwn(s, index));
  const buildOf = new Map<string, Build>();
  for (const m of members) {
    const b = buildsFor(m, index, opts).find((x) => x.speciesId === speciesId);
    if (b) {
      buildOf.set(m.id, b);
    }
  }
  const all = [...buildOf.values()];
  const pin = pins[speciesId];

  // What each member is fielded as elsewhere: the same family's builds, one pick per species.
  const family = index.species(index.baseOf(speciesId))?.familyId ?? null;
  const memberIds = new Set(members.map((m) => m.id));
  const also = new Map<string, string[]>();
  if (family !== null) {
    const kin = specimens
      .filter((s) => index.species(index.baseOf(s.speciesId))?.familyId === family)
      .map((s) => asOwn(s, index));
    const builds = kin.flatMap((s) => buildsFor(s, index, opts));
    for (const f of fieldedBuilds(builds, pins)) {
      if (
        f.speciesId !== speciesId &&
        f.stageOffset > 0 &&
        f.mega === null &&
        memberIds.has(f.specimenId)
      ) {
        also.set(f.specimenId, [...(also.get(f.specimenId) ?? []), f.speciesId]);
      }
    }
  }

  const tier = (s: Specimen): number => (buildOf.has(s.id) ? 0 : s.ivs ? 1 : 2);
  const sorted = [...members].sort((a, b) => {
    const ba = buildOf.get(a.id);
    const bb = buildOf.get(b.id);
    if (ba && bb) {
      return ba.ivRank.rank - bb.ivRank.rank || comparePicks(ba, bb);
    }
    return tier(a) - tier(b) || byId(a.id, b.id);
  });

  return {
    speciesId,
    copies: sorted.map((s) => {
      let verdict: Verdict;
      try {
        verdict = specimenVerdict(s, deps, speciesId);
      } catch (e) {
        verdict = unjudgedVerdict(s, e, deps.meta.length);
      }
      return { specimenId: s.id, verdict, alsoPickFor: also.get(s.id) ?? [] };
    }),
    pickId: resolvePick(all, all, pin)?.specimenId ?? null,
    defaultId: defaultPick(all)?.specimenId ?? null,
    unpinned: pin === null,
  };
}
