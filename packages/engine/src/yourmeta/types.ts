/** Your team for a set of battles. Species ids are PvPoke ids; shadows are their own id. */
/** Fast move id and one or two charged move ids. */
export interface TeamMoves {
  fast: string;
  charged: string[];
}

export interface TeamRef {
  species: [string, string, string];
  /** Present when the team came from a pick3 recommendation or the collection. */
  specimenIds?: [string, string, string];
  /**
   * The moves each member ran, when known (Take to battle from an analysis, or a pick3 team).
   * The one accurate moveset signal there is; opponents' moves stay a guess.
   */
  moves?: [TeamMoves | null, TeamMoves | null, TeamMoves | null];
}

export interface LoggedBattle {
  id: string;
  /** ISO time the battle was logged. */
  at: string;
  /** 0 to 3 PvPoke species ids, in no particular order. */
  opponents: string[];
  /** null only when tanked. */
  result: 'win' | 'loss' | null;
  /** The opponent quit or threw. Kept in the set, counted nowhere. */
  tanked: boolean;
  /** ISO time this battle was sent to the community meta; absent means not yet. */
  sharedAt?: string;
}

export interface BattleSet {
  id: string;
  league: string;
  startedAt: string;
  team: TeamRef;
  battles: LoggedBattle[];
  /** Five battles logged or the player ended the set. */
  closed: boolean;
}

/** One Go Battle League season, from the hand-kept list the data build ships. */
export interface Season {
  id: number;
  name: string;
  /** ISO time with offset. */
  start: string;
}

export const SET_SIZE = 5;

/** Order-independent identity of a team, so the same three logged in any order roll up. */
export function teamKey(species: readonly string[]): string {
  return [...species].sort().join('+');
}
