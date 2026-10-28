import type { BattleData, FormId, MoveId } from '../data/types.js';
import { formStats, type Ivs } from '../rules/stats.js';

export interface CombatantSetup {
  formId: FormId;
  level: number;
  ivs: Ivs;
  fastMove: MoveId;
  chargedMoves: [MoveId] | [MoveId, MoveId];
  shadow?: boolean;
  startEnergy?: number;
}
export interface SideSetup {
  team: CombatantSetup[];
  shields: number;
}
export interface BattleSetup {
  sides: [SideSetup, SideSetup];
}

export interface CombatantState {
  startFormId: FormId;
  formId: FormId;
  level: number;
  ivs: Ivs;
  shadow: boolean;
  atk: number;
  def: number;
  maxHp: number;
  hp: number;
  energy: number;
  atkStage: number;
  defStage: number;
  fastMove: MoveId;
  chargedMoves: MoveId[];
  cooldown: number; // turns until it may act again
  faintSource: 'fast' | 'charged' | null;
}
export interface SideState {
  shields: number;
  active: number;
  team: CombatantState[];
  switchTimer: number;
}
export interface QueuedAction {
  actor: 0 | 1;
  kind: 'fast' | 'charged';
  turn: number;
  slot: number;
}
export interface BattleState {
  turn: number; // next turn to play, starts at 1
  sides: [SideState, SideState];
  queue: QueuedAction[];
  chargedLastTurn: boolean;
  frozenTurns: number;
  usePriority: boolean; // set at start: attack stats differ
  outcome: 'win0' | 'win1' | 'tie' | 'timeout' | null;
}

function requireMove(data: BattleData, id: MoveId): void {
  if (!data.moves[id]) {
    throw new Error(`unknown move ${id}`);
  }
}

function buildCombatant(data: BattleData, setup: CombatantSetup): CombatantState {
  if (!data.species[setup.formId]) {
    throw new Error(`unknown form ${setup.formId}`);
  }
  requireMove(data, setup.fastMove);
  for (const id of setup.chargedMoves) {
    requireMove(data, id);
  }
  const startEnergy = setup.startEnergy ?? 0;
  if (!(startEnergy >= 0 && startEnergy <= data.settings.maxEnergy)) {
    throw new Error(`startEnergy ${startEnergy} is outside 0..${data.settings.maxEnergy}`);
  }
  const shadow = setup.shadow === true;
  const stats = formStats(data, setup.formId, setup.ivs, setup.level);
  return {
    startFormId: setup.formId,
    formId: setup.formId,
    level: setup.level,
    ivs: { atk: setup.ivs.atk, def: setup.ivs.def, hp: setup.ivs.hp },
    shadow,
    atk: stats.atk,
    def: stats.def,
    maxHp: stats.hp,
    hp: stats.hp,
    energy: startEnergy,
    atkStage: 0,
    defStage: 0,
    fastMove: setup.fastMove,
    chargedMoves: [...setup.chargedMoves],
    cooldown: 0,
    faintSource: null,
  };
}

function buildSide(data: BattleData, setup: SideSetup): SideState {
  if (setup.team.length !== 1) {
    throw new Error('3v3 arrives in spec 2; this slice takes one Pokemon per side');
  }
  if (!Number.isInteger(setup.shields) || setup.shields < 0 || setup.shields > 2) {
    throw new Error(`shields ${setup.shields} is outside 0..2`);
  }
  return {
    shields: setup.shields,
    active: 0,
    team: setup.team.map((c) => buildCombatant(data, c)),
    switchTimer: 0,
  };
}

export function createBattle(data: BattleData, setup: BattleSetup): BattleState {
  const sides: [SideState, SideState] = [buildSide(data, setup.sides[0]), buildSide(data, setup.sides[1])];
  const a0 = sides[0].team[0] as CombatantState;
  const a1 = sides[1].team[0] as CombatantState;
  return {
    turn: 1,
    sides,
    queue: [],
    chargedLastTurn: false,
    frozenTurns: 0,
    usePriority: a0.atk !== a1.atk,
    outcome: null,
  };
}

export function active(state: BattleState, side: 0 | 1): CombatantState {
  const s = state.sides[side];
  return s.team[s.active] as CombatantState;
}
