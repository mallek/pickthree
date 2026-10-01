/**
 * PvPoke's curated meta group for a league, baked in at build time. It is the seed until a
 * league has enough measured battles of its own, and it is labelled as PvPoke's list wherever it
 * appears. It is never described with a measured word.
 */
export interface BaselineSpecies {
  speciesId: string;
  score: number | null;
  rating: number | null;
  fastMove: string;
  chargedMoves: string[];
  fastUsage: { moveId: string; uses: number }[];
  chargedUsage: { moveId: string; uses: number }[];
}

export interface Baseline {
  league: string;
  pvpokeCommit: string;
  pvpokeDate: string;
  species: BaselineSpecies[];
  byId: Map<string, BaselineSpecies>;
}

/** One entry of PvPoke's meta group file (`meta/<league>.json`). */
export interface MetaEntryIn {
  speciesId: string;
  fastMove: string;
  chargedMoves: readonly string[];
}

/** The fields of one PvPoke overall ranking entry the baseline reads. */
export interface RankingIn {
  speciesId: string;
  score?: number;
  rating?: number;
  fastMoves?: { moveId: string; uses: number }[];
  chargedMoves?: { moveId: string; uses: number }[];
}

/** The most moves of one kind a baseline entry carries. */
const MOVE_LIMIT = 4;

/**
 * The baseline for one league: PvPoke's meta group, each entry joined to its overall ranking
 * (score, rating, the top four move usages of each kind), sorted by score, heaviest first, an
 * unscored species last, ties by id.
 */
export function baselineFor(
  league: string,
  group: readonly MetaEntryIn[],
  overall: readonly RankingIn[],
  commit: { pvpokeCommit: string; pvpokeDate: string },
): Baseline {
  const ranked = new Map(overall.map((r) => [r.speciesId, r]));
  const entries: BaselineSpecies[] = group.map((m) => {
    const r = ranked.get(m.speciesId);
    return {
      speciesId: m.speciesId,
      score: typeof r?.score === 'number' ? r.score : null,
      rating: typeof r?.rating === 'number' ? r.rating : null,
      fastMove: m.fastMove,
      chargedMoves: [...m.chargedMoves],
      fastUsage: (r?.fastMoves ?? []).slice(0, MOVE_LIMIT),
      chargedUsage: (r?.chargedMoves ?? []).slice(0, MOVE_LIMIT),
    };
  });
  entries.sort(
    (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.speciesId.localeCompare(b.speciesId),
  );
  return {
    league,
    pvpokeCommit: commit.pvpokeCommit,
    pvpokeDate: commit.pvpokeDate,
    species: entries,
    byId: new Map(entries.map((e) => [e.speciesId, e])),
  };
}
