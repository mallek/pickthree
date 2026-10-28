import type { BattleData, MoveData, TypeId } from '../data/types.js';
import { stageMultiplier } from './stats.js';

export interface DamageInput {
  move: MoveData;
  attackerTypes: readonly TypeId[];
  defenderTypes: readonly TypeId[];
  atk: number; // unbuffed form stats
  def: number;
  atkStage: number;
  defStage: number;
  attackerShadow: boolean;
  defenderShadow: boolean;
  defenderMaxHp: number;
}

export function effectiveness(
  data: BattleData,
  moveType: TypeId,
  defender: readonly TypeId[],
): number {
  const row = data.types.indexOf(moveType);
  if (row < 0) {
    throw new Error(`unknown type ${moveType}`);
  }
  let result = 1;
  for (const t of defender) {
    const col = data.types.indexOf(t);
    if (col < 0) {
      throw new Error(`unknown type ${t}`);
    }
    result *= (data.effectiveness[row] as number[])[col] as number;
  }
  return result;
}

export function damageOf(data: BattleData, input: DamageInput): number {
  const s = data.settings;
  const move = input.move;
  if (move.damageKind === 'percentMaxHp') {
    return Math.floor((move.power / 100) * input.defenderMaxHp) + 1;
  }
  const attack =
    input.atk *
    (stageMultiplier(s.stages, input.atkStage, 'atk') * (input.attackerShadow ? s.shadowAtk : 1));
  const defense =
    input.def *
    (stageMultiplier(s.stages, input.defStage, 'def') * (input.defenderShadow ? s.shadowDef : 1));
  const eff = effectiveness(data, move.type, input.defenderTypes);
  const stab = input.attackerTypes.includes(move.type) ? s.stab : 1;
  const bonus = move.category === 'fast' ? s.fastBonus : s.chargedBonus;
  return Math.floor(move.power * stab * (attack / defense) * eff * 0.5 * bonus) + 1;
}
