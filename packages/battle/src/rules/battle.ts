import type { BattleData, FormId, MoveId, StageChange } from '../data/types.js';
import type { Player, RandomSource } from '../player/types.js';
import { hashState } from '../state/snapshot.js';
import { active, createBattle, type BattleSetup, type BattleState } from '../state/state.js';
import { fireEvent } from './mechanics.js';
import { stepTurn } from './turn.js';

export interface BattleEvent {
  turn: number;
  actor: 0 | 1;
  kind: 'fast' | 'charged' | 'shield' | 'buff' | 'form' | 'faint' | 'animate' | 'fire';
  move?: MoveId;
  slot?: number;
  damage?: number;
  form?: FormId;
  turns?: number;
}
export interface TurnRecord {
  turn: number;
  hp: [number, number];
  maxHp: [number, number];
  energy: [number, number];
  shields: [number, number];
  stages: [StageChange, StageChange];
  forms: [FormId, FormId];
  hash: string;
  events: BattleEvent[];
}
export interface RunOptions {
  trace?: boolean;
  maxTurns?: number;
}
export interface BattleResult {
  outcome: 'win0' | 'win1' | 'tie' | 'timeout';
  turns: number;
  final: BattleState;
  trace: TurnRecord[];
}
export interface BattleContext {
  data: BattleData;
  players: [Player, Player];
  random: RandomSource;
  events: BattleEvent[];
  /** Turn limit for the timeout outcome. Defaults to settings.roundTurns. */
  maxTurns?: number;
  /** Set when a mechanic's animate effect fires this turn, so the turn resets cooldowns like a charged move. */
  animated?: boolean;
}

function record(state: BattleState, played: number, events: BattleEvent[]): TurnRecord {
  const a = active(state, 0);
  const b = active(state, 1);
  return {
    turn: played,
    hp: [a.hp, b.hp],
    maxHp: [a.maxHp, b.maxHp],
    energy: [a.energy, b.energy],
    shields: [state.sides[0].shields, state.sides[1].shields],
    stages: [
      { atk: a.atkStage, def: a.defStage },
      { atk: b.atkStage, def: b.defStage },
    ],
    forms: [a.formId, b.formId],
    hash: hashState(state),
    events,
  };
}

export function runBattle(
  data: BattleData,
  setup: BattleSetup,
  players: [Player, Player],
  random: RandomSource,
  opts: RunOptions = {},
): BattleResult {
  const state = createBattle(data, setup);
  const ctx: BattleContext = { data, players, random, events: [] };
  if (opts.maxTurns !== undefined) {
    ctx.maxTurns = opts.maxTurns;
  }
  fireEvent(state, ctx, 0, 'battleStart');
  fireEvent(state, ctx, 1, 'battleStart');
  state.usePriority = active(state, 0).atk !== active(state, 1).atk;
  const trace: TurnRecord[] = [];
  while (state.outcome === null) {
    const played = state.turn;
    stepTurn(state, ctx);
    const events = ctx.events.splice(0);
    if (opts.trace) {
      trace.push(record(state, played, events));
    }
  }
  return { outcome: state.outcome, turns: state.turn - 1, final: state, trace };
}
