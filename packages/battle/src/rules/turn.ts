import type { MoveData } from '../data/types.js';
import type { Decision } from '../player/types.js';
import { active, type BattleState, type QueuedAction } from '../state/state.js';
import type { BattleContext } from './battle.js';
import { resolveCharged } from './charged.js';
import { resolveFast } from './fast.js';
import { buildView } from './view.js';

function settle(state: BattleState, ctx: BattleContext): void {
  const h0 = active(state, 0).hp;
  const h1 = active(state, 1).hp;
  if (h0 <= 0 && h1 <= 0) {
    state.outcome = 'tie';
  } else if (h0 <= 0) {
    state.outcome = 'win1';
  } else if (h1 <= 0) {
    state.outcome = 'win0';
  } else if (state.turn > (ctx.maxTurns ?? ctx.data.settings.roundTurns)) {
    state.outcome = 'timeout';
  }
}

function queueDecisions(state: BattleState, ctx: BattleContext): void {
  const choices: (Decision | null)[] = [null, null];
  const bothAlive = active(state, 0).hp > 0 && active(state, 1).hp > 0;
  if (!state.chargedLastTurn && bothAlive) {
    // both sides decide from the state at the start of the turn, before either queues
    for (const side of [0, 1] as const) {
      if (active(state, side).cooldown === 0) {
        choices[side] = ctx.players[side].decide(buildView(state, ctx.data, side));
      }
    }
  }
  for (const side of [0, 1] as const) {
    const choice = choices[side];
    if (!choice) {
      continue;
    }
    const c = active(state, side);
    let move: MoveData | undefined;
    if (choice.kind === 'charged' && Number.isInteger(choice.slot) && choice.slot >= 0) {
      const id = c.chargedMoves[choice.slot];
      move = id === undefined ? undefined : ctx.data.moves[id];
    }
    if (choice.kind === 'charged' && move && c.energy >= move.energy) {
      state.queue.push({ actor: side, kind: 'charged', turn: state.turn, slot: choice.slot });
      c.cooldown += 1;
    } else {
      // an unaffordable charged move or a bad slot becomes a fast move
      state.queue.push({ actor: side, kind: 'fast', turn: state.turn, slot: 0 });
      c.cooldown += (ctx.data.moves[c.fastMove] as MoveData).turns;
    }
  }
}

function chargedOrder(state: BattleState, ctx: BattleContext, x: QueuedAction, y: QueuedAction): QueuedAction[] {
  if (state.usePriority) {
    const ax = active(state, x.actor).atk;
    const ay = active(state, y.actor).atk;
    if (ax !== ay) {
      return ax > ay ? [x, y] : [y, x];
    }
  }
  return ctx.random.cmpTieWinner({ turn: state.turn }) === x.actor ? [x, y] : [y, x];
}

/** Plays exactly one turn, or one frozen turn. */
export function stepTurn(state: BattleState, ctx: BattleContext): void {
  if (state.frozenTurns > 0) {
    state.frozenTurns -= 1;
    state.turn += 1;
    settle(state, ctx);
    return;
  }
  for (const side of [0, 1] as const) {
    const c = active(state, side);
    c.cooldown = Math.max(0, c.cooldown - 1);
  }
  const chargedLast = state.chargedLastTurn;
  queueDecisions(state, ctx);

  const charged: QueuedAction[] = [];
  const fast: QueuedAction[] = [];
  const waiting: QueuedAction[] = [];
  for (const q of state.queue) {
    if (q.kind === 'charged') {
      charged.push(q);
    } else {
      const turns = (ctx.data.moves[active(state, q.actor).fastMove] as MoveData).turns;
      if (state.turn - q.turn >= turns - 1 || (chargedLast && q.turn < state.turn)) {
        fast.push(q);
      } else {
        waiting.push(q);
      }
    }
  }
  state.queue = waiting;
  fast.sort((p, q) => p.actor - q.actor);
  const chargedQueue =
    charged.length === 2 ? chargedOrder(state, ctx, charged[0] as QueuedAction, charged[1] as QueuedAction) : charged;

  let anyCharged = false;
  for (const q of chargedQueue) {
    const self = active(state, q.actor);
    const move = ctx.data.moves[self.chargedMoves[q.slot] as string] as MoveData;
    if (self.energy < move.energy || (self.hp <= 0 && self.faintSource === 'charged')) {
      continue;
    }
    resolveCharged(state, ctx, q.actor, q.slot);
    anyCharged = true;
  }
  for (const q of fast) {
    const self = active(state, q.actor);
    const opp = active(state, q.actor === 0 ? 1 : 0);
    if (opp.hp <= 0 || (self.hp <= 0 && self.faintSource === 'charged')) {
      continue;
    }
    resolveFast(state, ctx, q.actor);
  }

  state.chargedLastTurn = anyCharged;
  if (anyCharged) {
    for (const side of [0, 1] as const) {
      active(state, side).cooldown = 1;
    }
  }
  state.turn += 1;
  settle(state, ctx);
}
