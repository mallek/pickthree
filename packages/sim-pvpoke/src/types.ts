export interface PvPokeMove {
  moveId: string;
  name: string;
  category: 'fast' | 'charged';
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  cooldown: number;
  turns: number;
}

export interface PvPokeGameMaster {
  data: { pokemon: { speciesId: string }[]; moves: { moveId: string }[]; cups: { name: string }[] };
  rankings: Record<string, unknown>;
  getPokemonById(id: string): { speciesId: string; speciesName: string } | undefined;
  getMoveById(id: string): PvPokeMove;
  getCupById(id: string): { name: string } | undefined;
}

export interface PvPokePokemon {
  speciesId: string;
  cp: number;
  hp: number;
  level: number;
  ivs: { atk: number; def: number; hp: number };
  stats: { atk: number; def: number; hp: number };
  shields: number;
  startingShields: number;
  startEnergy: number;
  fastMove: PvPokeMove;
  chargedMoves: PvPokeMove[];
  initialize(targetCP: number | false, defaultMode?: string): void;
  setIV(iv: 'atk' | 'def' | 'hp', amount: number): void;
  setLevel(level: number, initialize?: boolean): void;
  selectMove(type: 'fast' | 'charged', id: string, index?: number): void;
  setShields(amount: number): void;
  reset(): void;
  getBattleRating(): number;
}

export interface PvPokeBattle {
  setCP(cp: number): void;
  setLevelCap(cap: number): void;
  setCup(name: string): void;
  setNewPokemon(p: PvPokePokemon, index: 0 | 1, initialize: boolean): void;
  simulate(): unknown;
  getTurnsToWin(): [number, number];
  getBattleRatings(): [number, number];
  getTurns(): number;
}

export interface PvPokeRuntime {
  GameMaster: { getInstance(): PvPokeGameMaster };
  Battle: new () => PvPokeBattle;
  Pokemon: new (id: string, index: number, battle: PvPokeBattle) => PvPokePokemon;
  gm: PvPokeGameMaster;
}
