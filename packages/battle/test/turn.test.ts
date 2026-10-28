import { describe, expect, it } from 'vitest';
import { seededRandom } from '../src/random.js';
import { runBattle, type BattleContext } from '../src/rules/battle.js';
import { stepTurn } from '../src/rules/turn.js';
import { active, createBattle } from '../src/state/state.js';
import { hashState } from '../src/state/snapshot.js';
import { duel, fixedRandom, makeBattleData, mon, player } from './fixtures/battle.js';

const d = makeBattleData();

// F1 on a tank: stab 1.2, equal stats, power 10 -> floor(10 * 1.2 * 0.5 * 1.3) + 1 = 8
const HIT = 8;

describe('turn loop', () => {
  it('1-turn fast moves land every turn', () => {
    const r = runBattle(d, duel(mon('tank', 'F1'), mon('tank', 'F1')), [player(), player()], seededRandom(1), {
      maxTurns: 3,
    });
    for (const side of [0, 1] as const) {
      const c = r.final.sides[side].team[0]!;
      expect(c.maxHp - c.hp).toBe(3 * HIT);
      expect(c.energy).toBe(30);
    }
  });

  it('a 2-turn fast move lands on its second turn and decides again on its third', () => {
    const p0 = player();
    const p1 = player();
    const state = createBattle(d, duel(mon('tank', 'F2'), mon('tank', 'F2')));
    const ctx: BattleContext = { data: d, players: [p0, p1], random: fixedRandom(0), events: [] };
    const dealt = () => active(state, 1).maxHp - active(state, 1).hp;
    stepTurn(state, ctx);
    expect(dealt()).toBe(0);
    stepTurn(state, ctx);
    expect(dealt()).toBe(HIT);
    expect(p0.decisions).toEqual([1]);
    stepTurn(state, ctx);
    expect(p0.decisions).toEqual([1, 3]);
    expect(dealt()).toBe(HIT);
    stepTurn(state, ctx);
    expect(dealt()).toBe(2 * HIT);
  });

  it('energy caps at maxEnergy', () => {
    const r = runBattle(d, duel(mon('tank', 'FBIG'), mon('tank', 'FBIG')), [player(), player()], seededRandom(1), {
      maxTurns: 3,
    });
    expect(r.final.sides[0].team[0]!.energy).toBe(100);
  });

  it('plays fast when the chosen charged move is unaffordable or the slot is missing', () => {
    const unaffordable = player(() => ({ kind: 'charged', slot: 0 }));
    const noSlot = player(() => ({ kind: 'charged', slot: 5 }));
    const negative = player(() => ({ kind: 'charged', slot: -1 }));
    const r = runBattle(d, duel(mon('tank', 'F1'), mon('tank', 'F1')), [unaffordable, noSlot], seededRandom(1), {
      maxTurns: 2,
    });
    const a = r.final.sides[0].team[0]!;
    const b = r.final.sides[1].team[0]!;
    // turn 1: energy 0 < 50, fast; turn 2: energy 10 < 50, fast. Never negative.
    expect(a.energy).toBe(20);
    expect(b.energy).toBe(20);
    expect(b.maxHp - b.hp).toBe(2 * HIT);
    expect(() =>
      runBattle(d, duel(mon('tank', 'F1'), mon('tank', 'F1')), [negative, negative], seededRandom(1), { maxTurns: 2 }),
    ).not.toThrow();
  });

  it('simultaneous fast knockouts are a tie, deterministically', () => {
    const setup = duel(mon('tiny', 'F1'), mon('tiny', 'F1'));
    const a = runBattle(d, setup, [player(), player()], seededRandom(1));
    const b = runBattle(d, setup, [player(), player()], seededRandom(2));
    expect(a.outcome).toBe('tie');
    expect(a.final.sides[0].team[0]!.hp).toBe(0);
    expect(a.final.sides[1].team[0]!.hp).toBe(0);
    expect(hashState(a.final)).toBe(hashState(b.final));
  });

  it('stops at maxTurns with timeout', () => {
    const r = runBattle(d, duel(mon('tank', 'F0'), mon('tank', 'F0')), [player(), player()], seededRandom(1), {
      maxTurns: 20,
    });
    expect(r.outcome).toBe('timeout');
    expect(r.turns).toBe(20);
    expect(r.final.sides[0].team[0]!.hp).toBe(500 - 20);
  });

  it('defaults maxTurns to settings.roundTurns', () => {
    const r = runBattle(d, duel(mon('giant', 'F0'), mon('giant', 'F0')), [player(), player()], seededRandom(1));
    expect(r.outcome).toBe('timeout');
    expect(r.turns).toBe(d.settings.roundTurns);
  });

  it('a frozen turn only advances the counter', () => {
    const state = createBattle(d, duel(mon('tank', 'F1'), mon('tank', 'F1')));
    state.frozenTurns = 2;
    const ctx: BattleContext = { data: d, players: [player(), player()], random: fixedRandom(0), events: [] };
    stepTurn(state, ctx);
    expect(state.turn).toBe(2);
    expect(state.frozenTurns).toBe(1);
    expect(active(state, 0).hp).toBe(active(state, 0).maxHp);
    stepTurn(state, ctx);
    stepTurn(state, ctx);
    expect(active(state, 1).maxHp - active(state, 1).hp).toBe(HIT);
  });
});
