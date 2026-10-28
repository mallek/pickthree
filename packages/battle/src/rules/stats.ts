import type { BattleData, FormId, StatStages } from '../data/types.js';

export interface Ivs {
  atk: number;
  def: number;
  hp: number;
}

export function cpmAt(data: BattleData, level: number): number {
  const index = (level - 1) * 2;
  if (!Number.isInteger(index) || level < 1) {
    throw new Error(`level ${level} is not a half level`);
  }
  if (index >= data.cpm.length) {
    throw new Error(`level ${level} is past the CPM table`);
  }
  return data.cpm[index] as number;
}

function speciesOf(data: BattleData, formId: FormId) {
  const species = data.species[formId];
  if (!species) {
    throw new Error(`unknown form ${formId}`);
  }
  return species;
}

export function formStats(
  data: BattleData,
  formId: FormId,
  ivs: Ivs,
  level: number,
): { atk: number; def: number; hp: number } {
  const base = speciesOf(data, formId).baseStats;
  const cpm = cpmAt(data, level);
  return {
    atk: (base.atk + ivs.atk) * cpm,
    def: (base.def + ivs.def) * cpm,
    hp: Math.max(10, Math.floor((base.hp + ivs.hp) * cpm)),
  };
}

export function cpOf(data: BattleData, formId: FormId, ivs: Ivs, level: number): number {
  const base = speciesOf(data, formId).baseStats;
  const cpm = cpmAt(data, level);
  const atk = base.atk + ivs.atk;
  const def = base.def + ivs.def;
  const hp = base.hp + ivs.hp;
  return Math.max(10, Math.floor((atk * Math.sqrt(def) * Math.sqrt(hp) * cpm * cpm) / 10));
}

export function stageMultiplier(
  stages: StatStages,
  stage: number,
  which: 'atk' | 'def' = 'atk',
): number {
  const clamped = Math.min(stages.max, Math.max(stages.min, stage));
  return stages[which][clamped - stages.min] as number;
}
