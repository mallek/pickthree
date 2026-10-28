import type { BattleData, FormId, MoveData, MoveId, TypeId } from '../data/types.js';

export interface CombatantView {
  formId: FormId;
  types: readonly TypeId[];
  hp: number;
  maxHp: number;
  energy: number;
  /** Unbuffed form stats, the inputs damageOf expects. */
  atk: number;
  def: number;
  atkStage: number;
  defStage: number;
  shadow: boolean;
  fastMove: MoveData;
  chargedMoves: readonly MoveData[];
  cooldown: number;
}

export interface BattleView {
  turn: number;
  actor: 0 | 1;
  self: CombatantView;
  opponent: CombatantView;
  shields: number;
  opponentShields: number;
  data: BattleData;
}

// spec 2 adds 'switch'
export type Decision = { kind: 'fast' } | { kind: 'charged'; slot: number };

export interface IncomingCharged {
  move: MoveData;
  damage: number;
  blockedByMechanic: boolean;
}

export interface Player {
  decide(view: BattleView): Decision;
  shield(view: BattleView, incoming: IncomingCharged): boolean;
}

export interface RandomSource {
  buffProcs(ctx: { turn: number; actor: 0 | 1; move: MoveId; chance: number }): boolean;
  cmpTieWinner(ctx: { turn: number }): 0 | 1;
}
