import type { MechanicsEntry } from '../mechanics/vocabulary.js';

export type TypeId = string; // lowercase, e.g. 'fire'
export type MoveId = string; // datamine name, e.g. 'ROLLOUT_FAST', 'DIVE'
export type FormId = string; // e.g. 'species_form'

export interface StatStages {
  min: number;
  max: number;
  atk: number[];
  def: number[];
} // index = stage - min
export interface BattleSettings {
  stab: number;
  fastBonus: number;
  chargedBonus: number;
  shadowAtk: number;
  shadowDef: number;
  maxEnergy: number;
  roundTurns: number;
  stages: StatStages;
}
export interface StageChange {
  atk: number;
  def: number;
}
export interface MoveBuffs {
  chance: number;
  self?: StageChange;
  opponent?: StageChange;
}
export interface MoveData {
  id: MoveId;
  type: TypeId;
  category: 'fast' | 'charged';
  power: number;
  energy: number;
  energyGain: number;
  turns: number;
  buffs?: MoveBuffs;
  damageKind?: 'percentMaxHp';
}
export interface BaseStats {
  atk: number;
  def: number;
  hp: number;
}
export interface SpeciesData {
  id: FormId;
  dex: number;
  family: string;
  baseStats: BaseStats;
  types: [TypeId] | [TypeId, TypeId];
  fast: MoveId[];
  charged: MoveId[];
  eliteFast: MoveId[];
  eliteCharged: MoveId[];
  shadow: { charged: MoveId; purifiedCharged: MoveId } | null;
  tags: string[]; // 'mega' for Mega forms
}
export interface FamilyRef {
  family: string;
  forms: FormId[] | null;
}
export interface LeagueData {
  id: string;
  title: string;
  enabled: boolean;
  leagueType: string;
  pokemonCount: number;
  cpCap: number | null;
  maxLevel: number | null;
  unique: boolean;
  allowMegas: boolean;
  types: TypeId[] | null;
  allowed: FamilyRef[] | null;
  banned: FamilyRef[];
  caughtWindow: { after: number; before: number } | null;
}
export interface BattleData {
  version: 1;
  source: { kind: 'datamine' | 'pvpoke'; commit: string; date: string };
  settings: BattleSettings;
  types: TypeId[];
  effectiveness: number[][]; // [attackIndex][defendIndex], indexes into types
  cpm: number[]; // index (level - 1) * 2
  moves: Record<MoveId, MoveData>;
  species: Record<FormId, SpeciesData>;
  leagues: Record<string, LeagueData>;
  mechanics: Record<string, MechanicsEntry>; // keyed by family; type from Task 3
}
