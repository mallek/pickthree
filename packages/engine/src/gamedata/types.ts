export type PokemonType =
  | 'normal'
  | 'fire'
  | 'water'
  | 'grass'
  | 'electric'
  | 'ice'
  | 'fighting'
  | 'poison'
  | 'ground'
  | 'flying'
  | 'psychic'
  | 'bug'
  | 'rock'
  | 'ghost'
  | 'dragon'
  | 'dark'
  | 'steel'
  | 'fairy';

export interface BaseStats {
  atk: number;
  def: number;
  hp: number;
}

export interface Species {
  speciesId: string;
  speciesName: string;
  dex: number;
  types: [PokemonType, PokemonType | 'none'];
  baseStats: BaseStats;
  fastMoves: string[];
  chargedMoves: string[];
  eliteMoves: string[];
  legacyMoves: string[];
  tags: string[];
  familyId: string | null;
  parentId: string | null;
  evolutionIds: string[];
  shadow: boolean;
  shadowEligible: boolean;
  released: boolean;
  thirdMoveCost: number;
  levelCap: number | null;
  levelFloor: number | null;
  greatLeagueIneligible: boolean;
  defaultIVs: Record<string, [number, number, number, number]>;
}

export interface Move {
  moveId: string;
  name: string;
  type: PokemonType;
  power: number;
  energy: number;
  energyGain: number;
  turns: number;
  cooldown: number;
  buffs: [number, number] | null;
  buffTarget: 'self' | 'opponent' | 'both' | null;
  buffApplyChance: number | null;
  buffsSelf: [number, number] | null;
  buffsOpponent: [number, number] | null;
  archetype: string | null;
}

export interface RankingScenario {
  slug: string;
  shields: [number, number];
  energy: [number, number];
}

export interface GameData {
  species: Species[];
  moves: Move[];
  rankingScenarios: RankingScenario[];
  settings: { maxBuffStages: number; buffDivisor: number };
  gamemasterTimestamp: string;
}

export interface RankingMoveUsage {
  moveId: string;
  uses: number;
}

export interface RankingMatchup {
  opponent: string;
  rating: number;
}

export interface RankingEntry {
  speciesId: string;
  score: number;
  rating: number;
  moveset: string[];
  fastMoves: RankingMoveUsage[];
  chargedMoves: RankingMoveUsage[];
  matchups: RankingMatchup[];
  counters: RankingMatchup[];
  /** Stat product at the ranking's default IVs. Only the overall file carries it. */
  statProduct: number | null;
}

export type RankingCategory = 'overall' | 'leads' | 'switches' | 'closers' | 'chargers';

export interface MetaEntry {
  speciesId: string;
  fastMove: string;
  chargedMoves: string[];
}

export interface MovesetOverride {
  speciesId: string;
  fastMove?: string;
  chargedMoves?: string[];
  weight?: number;
}

export interface MatrixScenario {
  shields: [number, number];
  energy: [number, number];
}

export interface MatchupMatrix {
  league: 'great';
  cp: number;
  scenarios: MatrixScenario[];
  candidates: string[];
  opponents: string[];
  candidateMovesets: Record<string, string[]>;
  opponentMovesets: Record<string, string[]>;
  ratings: number[];
}

export function matrixIndex(
  m: MatchupMatrix,
  candidate: number,
  opponent: number,
  scenario: number,
): number {
  return (candidate * m.opponents.length + opponent) * m.scenarios.length + scenario;
}

export interface DataManifest {
  pvpokeCommit: string;
  pvpokeDate: string;
  gamemasterTimestamp: string;
  builtAt: string;
  metaSize: number;
  matrix: { candidates: number; opponents: number; scenarios: number };
  files: string[];
}
