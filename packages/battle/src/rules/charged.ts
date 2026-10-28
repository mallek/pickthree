import type { MoveData, StageChange } from '../data/types.js';
import { active, type BattleState, type CombatantState } from '../state/state.js';
import type { BattleContext } from './battle.js';
import { blocksDamage, fireEvent } from './mechanics.js';
import { buildView, moveDamage } from './view.js';

export function applyChange(
  ctx: BattleContext,
  target: { atkStage: number; defStage: number },
  change: StageChange,
): void {
  const { min, max } = ctx.data.settings.stages;
  target.atkStage = Math.min(max, Math.max(min, target.atkStage + change.atk));
  target.defStage = Math.min(max, Math.max(min, target.defStage + change.def));
}

function applyBuffs(
  state: BattleState,
  ctx: BattleContext,
  actor: 0 | 1,
  a: CombatantState,
  d: CombatantState,
  move: MoveData,
): void {
  const buffs = move.buffs;
  if (buffs && (buffs.self || buffs.opponent)) {
    const procs =
      buffs.chance >= 1 ||
      ctx.random.buffProcs({ turn: state.turn, actor, move: move.id, chance: buffs.chance });
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
}

export function resolveCharged(
  state: BattleState,
  ctx: BattleContext,
  actor: 0 | 1,
  slot: number,
): void {
  const other: 0 | 1 = actor === 0 ? 1 : 0;
  const a = active(state, actor);
  const d = active(state, other);
  const move = ctx.data.moves[a.chargedMoves[slot] as string] as MoveData;
  a.energy -= move.energy;
  fireEvent(state, ctx, actor, 'beforeChargedMove', { move: move.id });
  let damage = moveDamage(state, ctx.data, actor, move);

  const blockedByMechanic = blocksDamage(state, ctx, other, move.id);
  let shielded = false;
  const defenderSide = state.sides[other];
  if (defenderSide.shields > 0) {
    const incoming = { move, damage, blockedByMechanic };
    if (ctx.players[other].shield(buildView(state, ctx.data, other), incoming)) {
      shielded = true;
      damage = 1;
      defenderSide.shields -= 1;
      ctx.events.push({ turn: state.turn, actor: other, kind: 'shield', move: move.id });
      fireEvent(state, ctx, other, 'shieldUsed', { move: move.id });
    }
  }
  if (!shielded && blockedByMechanic) {
    damage = 1;
  }

  d.hp = Math.max(0, d.hp - damage);
  if (d.hp <= 0) {
    d.faintSource = 'charged';
  }
  ctx.events.push({ turn: state.turn, actor, kind: 'charged', move: move.id, slot, damage });

  applyBuffs(state, ctx, actor, a, d, move);
  fireEvent(state, ctx, other, 'hpBelow');
  fireEvent(state, ctx, actor, 'afterChargedMove', { move: move.id });
  if (!shielded) {
    fireEvent(state, ctx, other, 'hitByChargedMove', { move: move.id });
  }
}

/**
 * A mechanic's fired move: resolves at once as the owner's charged move with no energy cost, no shield
 * prompt, no CMP and no charged-move triggers. Fires from a fainted owner only when `ignoresFaint`.
 */
export function resolveFire(
  state: BattleState,
  ctx: BattleContext,
  actor: 0 | 1,
  moveId: string,
  ignoresFaint: boolean,
): void {
  const other: 0 | 1 = actor === 0 ? 1 : 0;
  const a = active(state, actor);
  const d = active(state, other);
  if (a.hp <= 0 && !ignoresFaint) {
    return;
  }
  const move = ctx.data.moves[moveId];
  if (!move) {
    throw new Error(`fireMove: unknown move ${moveId}`);
  }
  const damage = moveDamage(state, ctx.data, actor, move);
  d.hp = Math.max(0, d.hp - damage);
  if (d.hp <= 0 && d.faintSource === null) {
    d.faintSource = 'charged';
  }
  ctx.events.push({ turn: state.turn, actor, kind: 'fire', move: move.id, damage });
  applyBuffs(state, ctx, actor, a, d, move);
  fireEvent(state, ctx, other, 'hpBelow');
}
