import type { PvPokeBattle, PvPokePokemon } from '@pickthree/sim-pvpoke';

// The extra PvPoke shapes the exam harness reads, beyond what PvPokeSimulator needs (sim-pvpoke types.ts).

/** A PvPoke Pokemon mid-battle: the live fields the rules exam compares turn by turn. */
export interface PvPokeCombatant extends PvPokePokemon {
  energy: number;
  /** [attack, defense] stages. */
  statBuffs: [number, number];
  activeFormId: string;
  cpm: number;
  types: string[];
  setShadowType(t: 'normal' | 'shadow'): void;
}

/** A PvPoke Battle driven by a script instead of its AI (Battle.js sandbox mode). */
export interface PvPokeSandboxBattle extends PvPokeBattle {
  setSandboxMode(v: boolean): void;
  setActions(a: unknown[]): void;
  getActions(): { processed: boolean }[];
  step(): void;
  getTurns(): number;
}

/** A move as it sits in `gm.data.moves` (raw game master, before GameMaster.getMoveById). */
export interface PvPokeGmMove {
  moveId: string;
  name: string;
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  cooldown: number;
  turns: number;
  /** Present on a few moves (Gulp Missile); overrides the energyGain rule. */
  category?: 'fast' | 'charged';
  /** [attack, defense] stage change. With buffTarget 'both' it mirrors buffsSelf. */
  buffs?: [number, number];
  buffTarget?: 'self' | 'opponent' | 'both';
  buffsSelf?: [number, number];
  buffsOpponent?: [number, number];
  /** A string in the game master, e.g. "0.5"; GameMaster.getMoveById parseFloats it. */
  buffApplyChance?: string;
  damageMethod?: 'percentMaxHP';
  tags?: string[];
}

export interface PvPokeFormChange {
  type: 'set' | 'toggle';
  trigger: string;
  alternativeFormId?: string;
  defaultFormId?: string;
  moveId?: string;
  moveIDs?: string[];
  effect?: string;
  amount?: number;
  animationTime?: number;
  resetOnSwitch: boolean;
}

/** A species as it sits in `gm.data.pokemon`. */
export interface PvPokeGmPokemon {
  dex: number;
  speciesId: string;
  speciesName: string;
  baseStats: { atk: number; def: number; hp: number };
  /** Two entries; a single-typed species has 'none' second. */
  types: string[];
  fastMoves: string[];
  chargedMoves: string[];
  extraChargedMoves?: string[];
  eliteMoves?: string[];
  legacyMoves?: string[];
  tags?: string[];
  formChange?: PvPokeFormChange;
  nativeStatBuffs?: [number, number];
  originalFormId?: string;
}

export interface PvPokeGmData {
  timestamp?: string;
  pokemon: PvPokeGmPokemon[];
  moves: PvPokeGmMove[];
  settings: { maxBuffStages: number; buffDivisor: number };
}
