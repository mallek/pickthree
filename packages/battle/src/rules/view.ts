import type { BattleData, MoveData, TypeId } from '../data/types.js';
import type { BattleView, CombatantView } from '../player/types.js';
import { active, type BattleState, type CombatantState } from '../state/state.js';
import { damageOf } from './damage.js';

function typesOf(data: BattleData, c: CombatantState): readonly TypeId[] {
  return (data.species[c.formId] as { types: readonly TypeId[] }).types;
}

function combatantView(data: BattleData, c: CombatantState): CombatantView {
  return {
    formId: c.formId,
    types: typesOf(data, c),
    hp: c.hp,
    maxHp: c.maxHp,
    energy: c.energy,
    atkStage: c.atkStage,
    defStage: c.defStage,
    shadow: c.shadow,
    fastMove: data.moves[c.fastMove] as MoveData,
    chargedMoves: c.chargedMoves.map((id) => data.moves[id] as MoveData),
    cooldown: c.cooldown,
  };
}

/** The view `side` is shown when asked to decide or to shield. Built fresh from state each time. */
export function buildView(state: BattleState, data: BattleData, side: 0 | 1): BattleView {
  const other: 0 | 1 = side === 0 ? 1 : 0;
  return {
    turn: state.turn,
    actor: side,
    self: combatantView(data, active(state, side)),
    opponent: combatantView(data, active(state, other)),
    shields: state.sides[side].shields,
    opponentShields: state.sides[other].shields,
    data,
  };
}

/** Damage `actor`'s active Pokemon would deal with `move` to the other side's active Pokemon right now. */
export function moveDamage(state: BattleState, data: BattleData, actor: 0 | 1, move: MoveData): number {
  const other: 0 | 1 = actor === 0 ? 1 : 0;
  const a = active(state, actor);
  const d = active(state, other);
  return damageOf(data, {
    move,
    attackerTypes: typesOf(data, a),
    defenderTypes: typesOf(data, d),
    atk: a.atk,
    def: d.def,
    atkStage: a.atkStage,
    defStage: d.defStage,
    attackerShadow: a.shadow,
    defenderShadow: d.shadow,
    defenderMaxHp: d.maxHp,
  });
}
