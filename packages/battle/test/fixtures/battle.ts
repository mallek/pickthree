import type { BattleData, MoveData } from '../../src/data/types.js';
import type {
  BattleView,
  Decision,
  IncomingCharged,
  Player,
  RandomSource,
} from '../../src/player/types.js';
import type { BattleSetup, CombatantSetup } from '../../src/state/state.js';
import { makeData, makeMove, makeSpecies } from './synthetic.js';

/** Level 1 at CPM 0.5: stat = floor-ish (base + iv) * 0.5, so base 100 gives 50. */
export function makeBattleData(): BattleData {
  const data = makeData();
  data.moves['F1'] = makeMove('F1', { power: 10, energyGain: 10, turns: 1 });
  data.moves['F2'] = makeMove('F2', { power: 10, energyGain: 10, turns: 2 });
  data.moves['F0'] = makeMove('F0', { power: 0, energyGain: 0, turns: 1 });
  data.moves['FBIG'] = makeMove('FBIG', { power: 10, energyGain: 60, turns: 1 });
  data.moves['CH'] = makeMove('CH', {
    category: 'charged',
    power: 50,
    energy: 50,
    energyGain: 0,
    turns: 1,
  });
  data.moves['CHBUFF'] = makeMove('CHBUFF', {
    category: 'charged',
    power: 50,
    energy: 50,
    energyGain: 0,
    buffs: { chance: 1, self: { atk: 1, def: 0 }, opponent: { atk: 0, def: -1 } },
  });
  data.moves['CHCHANCE'] = makeMove('CHCHANCE', {
    category: 'charged',
    power: 50,
    energy: 50,
    energyGain: 0,
    buffs: { chance: 0.5, self: { atk: 1, def: 0 } },
  });
  data.moves['CHHUGE'] = makeMove('CHHUGE', {
    category: 'charged',
    power: 50,
    energy: 50,
    energyGain: 0,
    buffs: { chance: 1, self: { atk: 5, def: 0 }, opponent: { atk: 0, def: -5 } },
  });
  // hp 500, atk 50, def 50
  data.species['tank'] = makeSpecies('tank', { baseStats: { atk: 100, def: 100, hp: 1000 } });
  // hp 2000
  data.species['giant'] = makeSpecies('giant', { baseStats: { atk: 100, def: 100, hp: 4000 } });
  // hp 30
  data.species['glass'] = makeSpecies('glass', { baseStats: { atk: 100, def: 100, hp: 60 } });
  data.species['glass_strong'] = makeSpecies('glass_strong', {
    baseStats: { atk: 200, def: 100, hp: 60 },
  });
  // hp 5
  data.species['tiny'] = makeSpecies('tiny', { baseStats: { atk: 100, def: 100, hp: 10 } });
  return data;
}

export function mon(
  formId: string,
  fastMove: string,
  over: Partial<CombatantSetup> = {},
): CombatantSetup {
  return {
    formId,
    level: 1,
    ivs: { atk: 0, def: 0, hp: 0 },
    fastMove,
    chargedMoves: ['CH'],
    ...over,
  };
}

export function duel(
  a: CombatantSetup,
  b: CombatantSetup,
  shields: [number, number] = [0, 0],
): BattleSetup {
  return {
    sides: [
      { team: [a], shields: shields[0] },
      { team: [b], shields: shields[1] },
    ],
  };
}

export interface TestPlayer extends Player {
  decisions: number[];
}

/** A player driven by a function; shields when told to. */
export function player(
  decide: (view: BattleView) => Decision = () => ({ kind: 'fast' }),
  shield: (view: BattleView, incoming: IncomingCharged) => boolean = () => false,
): TestPlayer {
  const decisions: number[] = [];
  return {
    decisions,
    decide(view) {
      decisions.push(view.turn);
      return decide(view);
    },
    shield,
  };
}

/** Throws charged slot 0 whenever it can afford it, else plays fast. */
export function thrower(): TestPlayer {
  return player((v) =>
    v.self.energy >= (v.self.chargedMoves[0] as MoveData).energy
      ? { kind: 'charged', slot: 0 }
      : { kind: 'fast' },
  );
}

export function fixedRandom(tie: 0 | 1, procs = false): RandomSource {
  return {
    buffProcs: () => procs,
    cmpTieWinner: () => tie,
  };
}
