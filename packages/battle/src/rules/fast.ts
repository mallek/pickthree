import type { MoveData } from '../data/types.js';
import { active, type BattleState } from '../state/state.js';
import type { BattleContext } from './battle.js';
import { moveDamage } from './view.js';

export function resolveFast(state: BattleState, ctx: BattleContext, actor: 0 | 1): void {
  const other: 0 | 1 = actor === 0 ? 1 : 0;
  const a = active(state, actor);
  const d = active(state, other);
  const move = ctx.data.moves[a.fastMove] as MoveData;
  const damage = moveDamage(state, ctx.data, actor, move);
  d.hp = Math.max(0, d.hp - damage);
  a.energy = Math.min(ctx.data.settings.maxEnergy, a.energy + move.energyGain);
  if (d.hp <= 0) {
    d.faintSource = 'fast';
  }
  ctx.events.push({ turn: state.turn, actor, kind: 'fast', move: move.id, damage });
  // Task 7: mechanics hooks go here
}
