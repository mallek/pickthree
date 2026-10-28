import type { MoveData, StageChange } from '../data/types.js';
import { active, type BattleState } from '../state/state.js';
import type { BattleContext } from './battle.js';
import { buildView, moveDamage } from './view.js';

function applyChange(ctx: BattleContext, target: { atkStage: number; defStage: number }, change: StageChange): void {
  const { min, max } = ctx.data.settings.stages;
  target.atkStage = Math.min(max, Math.max(min, target.atkStage + change.atk));
  target.defStage = Math.min(max, Math.max(min, target.defStage + change.def));
}

export function resolveCharged(state: BattleState, ctx: BattleContext, actor: 0 | 1, slot: number): void {
  const other: 0 | 1 = actor === 0 ? 1 : 0;
  const a = active(state, actor);
  const d = active(state, other);
  const move = ctx.data.moves[a.chargedMoves[slot] as string] as MoveData;
  a.energy -= move.energy;
  let damage = moveDamage(state, ctx.data, actor, move);

  const defenderSide = state.sides[other];
  if (defenderSide.shields > 0) {
    const blockedByMechanic = false; // Task 7 sets this
    const incoming = { move, damage, blockedByMechanic };
    if (ctx.players[other].shield(buildView(state, ctx.data, other), incoming)) {
      damage = 1;
      defenderSide.shields -= 1;
      ctx.events.push({ turn: state.turn, actor: other, kind: 'shield', move: move.id });
    }
  }

  d.hp = Math.max(0, d.hp - damage);
  if (d.hp <= 0) {
    d.faintSource = 'charged';
  }
  ctx.events.push({ turn: state.turn, actor, kind: 'charged', move: move.id, slot, damage });

  const buffs = move.buffs;
  if (buffs && (buffs.self || buffs.opponent)) {
    const procs =
      buffs.chance >= 1 || ctx.random.buffProcs({ turn: state.turn, actor, move: move.id, chance: buffs.chance });
    if (procs) {
      if (buffs.self) {
        applyChange(ctx, a, buffs.self);
      }
      if (buffs.opponent) {
        applyChange(ctx, d, buffs.opponent);
      }
      ctx.events.push({ turn: state.turn, actor, kind: 'buff', move: move.id });
    }
  }
  // Task 7: mechanics hooks go here
}
