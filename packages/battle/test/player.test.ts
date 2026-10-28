import { describe, expect, it } from 'vitest';
import { ScriptedPlayer, scriptedRandom, type ScriptEntry } from '../src/player/scripted.js';
import type { BattleView, IncomingCharged } from '../src/player/types.js';
import { seededRandom } from '../src/random.js';
import { makeData, makeMove } from './fixtures/synthetic.js';

const data = makeData();
const move = makeMove('F10', { power: 10 });

function view(actor: 0 | 1, turn: number): BattleView {
  const c = {
    formId: 'x',
    types: ['alpha'],
    hp: 100,
    maxHp: 100,
    energy: 0,
    atkStage: 0,
    defStage: 0,
    shadow: false,
    fastMove: move,
    chargedMoves: [],
    cooldown: 0,
  };
  return { turn, actor, self: c, opponent: c, shields: 1, opponentShields: 1, data } as BattleView;
}

const incoming: IncomingCharged = { move, damage: 10, blockedByMechanic: false };

const script: readonly ScriptEntry[] = [
  { actor: 0, turn: 5, slot: 1, shielded: false, buff: true },
  { actor: 1, turn: 8, slot: 0, shielded: true },
];

function seq(seed: number): number[] {
  const r = seededRandom(seed);
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    out.push(r.cmpTieWinner({ turn: i }));
    out.push(r.buffProcs({ turn: i, actor: 0, move: 'm', chance: 0.5 }) ? 1 : 0);
  }
  return out;
}

describe('ScriptedPlayer', () => {
  it('picks the slot on its turn, fast otherwise', () => {
    const p0 = new ScriptedPlayer(0, script);
    expect(p0.decide(view(0, 5))).toEqual({ kind: 'charged', slot: 1 });
    expect(p0.decide(view(0, 6))).toEqual({ kind: 'fast' });
    expect(p0.decide(view(1, 5))).toEqual({ kind: 'fast' });
  });
  it('shield answers from the attacker entry', () => {
    const p0 = new ScriptedPlayer(0, script);
    expect(p0.shield(view(0, 8), incoming)).toBe(true);
    expect(p0.shield(view(0, 5), incoming)).toBe(false);
    expect(p0.shield(view(0, 9), incoming)).toBe(false);
    const p1 = new ScriptedPlayer(1, script);
    expect(p1.shield(view(1, 5), incoming)).toBe(false);
  });
});

describe('scriptedRandom', () => {
  it('buffProcs reads the attacker buff flag', () => {
    const r = scriptedRandom(script);
    expect(r.buffProcs({ turn: 5, actor: 0, move: 'm', chance: 0.1 })).toBe(true);
    expect(r.buffProcs({ turn: 8, actor: 1, move: 'm', chance: 0.9 })).toBe(false);
    expect(r.buffProcs({ turn: 9, actor: 0, move: 'm', chance: 0.9 })).toBe(false);
    expect(r.cmpTieWinner({ turn: 3 })).toBe(0);
  });
});

describe('seededRandom', () => {
  it('is deterministic per seed', () => {
    expect(seq(7)).toEqual(seq(7));
    expect(seq(7)).not.toEqual(seq(8));
  });
  it('chance 0 never procs, chance 1 always procs', () => {
    const r = seededRandom(3);
    for (let i = 0; i < 50; i++) {
      expect(r.buffProcs({ turn: i, actor: 0, move: 'm', chance: 0 })).toBe(false);
      expect(r.buffProcs({ turn: i, actor: 0, move: 'm', chance: 1 })).toBe(true);
    }
  });
});
