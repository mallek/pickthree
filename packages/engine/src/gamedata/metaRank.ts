import type { RankingCategory, RankingEntry } from './types.js';

export type MetaRole = 'lead' | 'switch' | 'closer' | 'charger';

/** Where a species sits in PvPoke's current Great League rankings, ignoring IVs. */
export interface MetaRank {
  /** 1-based position in the overall ranking. */
  overall: number;
  /** PvPoke overall score, 0 to 100. */
  score: number;
  /** The role this species ranks best in, when that rank beats its overall rank. */
  role: MetaRole | null;
  roleRank: number | null;
}

/** Only species inside this cutoff get meta tags in the UI. */
export const META_CUTOFF = 50;

const ROLE_OF: Record<Exclude<RankingCategory, 'overall'>, MetaRole> = {
  leads: 'lead',
  switches: 'switch',
  closers: 'closer',
  chargers: 'charger',
};

/** Position of each species in a ranking file. PvPoke writes them sorted by score. */
function positions(entries: RankingEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  entries.forEach((e, i) => {
    if (!out.has(e.speciesId)) {
      out.set(e.speciesId, i + 1);
    }
  });
  return out;
}

export function metaRanks(
  rankings: Record<RankingCategory, RankingEntry[]>,
): Map<string, MetaRank> {
  const roles = (Object.keys(ROLE_OF) as Exclude<RankingCategory, 'overall'>[]).map((cat) => ({
    role: ROLE_OF[cat],
    pos: positions(rankings[cat]),
  }));
  const out = new Map<string, MetaRank>();
  rankings.overall.forEach((e, i) => {
    if (out.has(e.speciesId)) {
      return;
    }
    const overall = i + 1;
    let role: MetaRole | null = null;
    let roleRank: number | null = null;
    for (const r of roles) {
      const p = r.pos.get(e.speciesId);
      if (p !== undefined && p < overall && (roleRank === null || p < roleRank)) {
        role = r.role;
        roleRank = p;
      }
    }
    out.set(e.speciesId, { overall, score: e.score, role, roleRank });
  });
  return out;
}

/** Short tags like "#18 overall" and "#5 closer". Empty outside the cutoff. */
export function metaRankTags(rank: MetaRank | undefined, cutoff = META_CUTOFF): string[] {
  if (!rank) {
    return [];
  }
  const tags: string[] = [];
  if (rank.overall <= cutoff) {
    tags.push(`#${rank.overall} overall`);
  }
  if (rank.role && rank.roleRank !== null && rank.roleRank <= cutoff) {
    tags.push(`#${rank.roleRank} ${rank.role}`);
  }
  return tags;
}

/** A sentence for verdict copy, or null when the species is outside the cutoff. */
export function metaRankSentence(
  name: string,
  rank: MetaRank | undefined,
  cutoff = META_CUTOFF,
): string | null {
  const tags = metaRankTags(rank, cutoff);
  if (tags.length === 0) {
    return null;
  }
  return `${name} is ${tags.join(' and ')} in the current meta.`;
}
