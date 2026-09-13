import type { PokemonType, Species } from './types.js';
import type { SimOptions } from '../sim/BattleSimulator.js';

/** One PvPoke cup filter, as written in gamemaster/cups/<cup>.json. */
export interface CupFilter {
  filterType: string;
  values: (string | number)[];
  /** CP caps this filter applies to; absent means all. */
  leagues?: number[];
  includeShadows?: boolean;
}

/**
 * A league or cup pick3 can build for. Standard leagues are PvPoke's "all" cup at a CP cap; special
 * cups add include and exclude rules. Each one has its own rankings, meta group and matchup matrix.
 */
export interface League {
  id: string;
  title: string;
  /** One word for tight spaces: Great, Ultra, Master, Mega Great, Willpower. */
  short: string;
  cp: number;
  /** PvPoke cup slug the rankings come from ("all" for the open leagues). */
  cup: string;
  /** PvPoke meta group name. */
  meta: string;
  kind: 'standard' | 'special';
  /** Builds whose best CP under the cap is below this are not competitive. */
  minCp: number;
  include: CupFilter[];
  exclude: CupFilter[];
  metaSize: number;
}

export const GREAT_LEAGUE_DEF: League = {
  id: 'great',
  title: 'Great League',
  short: 'Great',
  cp: 1500,
  cup: 'all',
  meta: 'great',
  kind: 'standard',
  minCp: 1400,
  include: [],
  exclude: [{ filterType: 'tag', values: ['mega'] }],
  metaSize: 0,
};

/** Competitive floor for a cap: a little under the cap, none for Master. */
export function minCpFor(cp: number): number {
  if (cp >= 10000) {
    return 0;
  }
  return Math.round(cp * 0.94);
}

export function simOptionsFor(league: League): SimOptions {
  return { cp: league.cp, levelCap: 50 };
}

function matches(filter: CupFilter, sp: Species, include: boolean): boolean {
  switch (filter.filterType) {
    case 'type':
      return filter.values.includes(sp.types[0]) || filter.values.includes(sp.types[1]);
    case 'dex': {
      const v = filter.values.map(Number);
      for (let k = 0; k + 1 < v.length; k += 2) {
        if (sp.dex >= (v[k] as number) && sp.dex <= (v[k + 1] as number)) {
          return true;
        }
      }
      return false;
    }
    case 'tag':
      return filter.values.some((t) => sp.tags.includes(String(t)));
    case 'id': {
      let id = sp.speciesId;
      if (!include || filter.includeShadows) {
        id = id.replace('_shadow', '').replace('_xs', '');
      }
      return filter.values.includes(id) || filter.values.includes(sp.speciesId);
    }
    case 'cost':
      return filter.values.includes(sp.thirdMoveCost);
    default:
      // move, moveType, evolution, distance: not modelled; PvPoke's rankings already reflect them.
      return false;
  }
}

/**
 * PvPoke's cup eligibility, trimmed to the filters cups actually use. Mirrors
 * GameMaster.generateFilteredPokemonList: every include filter must match (an explicit id include
 * overrides the rest), any exclude filter removes, the GO Battle League ban list applies under
 * 2500 CP, and unreleased species never qualify.
 */
export function allowedInLeague(sp: Species, league: League): boolean {
  if (!sp.released) {
    return false;
  }
  if (league.cp < 2500 && sp.greatLeagueIneligible) {
    return false;
  }
  const inLeague = (f: CupFilter): boolean => !f.leagues || f.leagues.includes(league.cp);
  const includes = league.include.filter(inLeague);
  let allowed = includes.length === 0;
  let idIncluded = false;
  if (includes.length > 0) {
    let matched = 0;
    let required = includes.length;
    for (const f of includes) {
      if (f.filterType === 'id') {
        if (includes.length > 1) {
          required -= 1;
        }
        if (matches(f, sp, true)) {
          matched += includes.length;
          idIncluded = true;
        }
      } else if (matches(f, sp, true)) {
        matched += 1;
      }
    }
    allowed = matched >= required;
  }
  if (allowed && !idIncluded) {
    for (const f of league.exclude.filter(inLeague)) {
      if (matches(f, sp, false)) {
        return false;
      }
    }
  }
  return allowed;
}

/** Types a cup restricts to, for copy like "Dark, Psychic and Fighting only". */
export function leagueTypes(league: League): PokemonType[] {
  const f = league.include.find((x) => x.filterType === 'type');
  return f ? (f.values as PokemonType[]) : [];
}
