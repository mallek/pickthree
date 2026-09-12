export interface SimPokemonSpec {
  speciesId: string;
  fastMove: string;
  /** One or two charged move ids. */
  chargedMoves: string[];
  ivs?: { atk: number; def: number; sta: number };
  /** Required when ivs are given. */
  level?: number;
  /** 0..2 */
  shields: number;
  /** PvPoke scenario "energy": turns of fast-move advantage at battle start. Default 0. */
  startEnergyTurns?: number;
}

export interface SimOptions {
  cp: number;
  levelCap: number;
}

export interface SimResult {
  /** 0..1000 battle rating for spec A (PvPoke formula). */
  rating: number;
  /** 0..1000 battle rating for spec B. */
  opRating: number;
  winner: 0 | 1 | null;
  turnsToWin: [number, number];
}

export interface BattleSimulator {
  simulate(a: SimPokemonSpec, b: SimPokemonSpec, opts: SimOptions): SimResult;
}

export const GREAT_LEAGUE: SimOptions = { cp: 1500, levelCap: 50 };
