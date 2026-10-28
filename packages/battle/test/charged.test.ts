import { describe, expect, it } from 'vitest';
import { seededRandom } from '../src/random.js';
import { runBattle, type BattleContext } from '../src/rules/battle.js';
import { stepTurn } from '../src/rules/turn.js';
import { active, createBattle } from '../src/state/state.js';
import { hashState } from '../src/state/snapshot.js';
import { duel, fixedRandom, makeBattleData, mon, player, thrower } from './fixtures/battle.js';

const d = makeBattleData();
// CH from a tank onto a tank: floor(50 * 1.2 * 0.5 * 1.3) + 1 = 40
const CH_HIT = 40;
const F1_HIT = 8;

describe('charged moves', () => {
  it('charged move costs energy and lands the same turn', () => {
    const r = runBattle(
      d,
      duel(mon('tank', 'F0', { startEnergy: 50 }), mon('tank', 'F0')),
      [thrower(), player()],
      seededRandom(1),
      { maxTurns: 1 },
    );
    const a = r.final.sides[0].team[0]!;
    const b = r.final.sides[1].team[0]!;
    expect(a.energy).toBe(0);
    expect(b.maxHp - b.hp).toBe(CH_HIT);
  });

  it('the turn after a charged move takes no decisions and a queued fast move floats in', () => {
    const p0 = thrower();
    const p1 = player();
    const state = createBattle(d, duel(mon('tank', 'F0', { startEnergy: 50 }), mon('tank', 'F2')));
    const ctx: BattleContext = { data: d, players: [p0, p1], random: fixedRandom(0), events: [] };
    const aDealt = () => active(state, 0).maxHp - active(state, 0).hp;
    stepTurn(state, ctx);
    // side 1 queued a 2-turn fast on turn 1, which has not landed yet
    expect(aDealt()).toBe(0);
    expect(state.queue.length).toBe(1);
    expect(state.chargedLastTurn).toBe(true);
    stepTurn(state, ctx);
    expect(p1.decisions).toEqual([1]);
    expect(p0.decisions).toEqual([1]);
    expect(aDealt()).toBe(F1_HIT);
    expect(state.queue.length).toBe(0);
    stepTurn(state, ctx);
    expect(p1.decisions).toEqual([1, 3]);
  });

  it('higher attack goes first when both throw; the knocked-out side does not fire', () => {
    const r = runBattle(
      d,
      duel(mon('glass_strong', 'F0', { startEnergy: 50 }), mon('glass', 'F0', { startEnergy: 50 })),
      [thrower(), thrower()],
      seededRandom(1),
    );
    expect(r.outcome).toBe('win0');
    expect(r.final.sides[1].team[0]!.hp).toBe(0);
    expect(r.final.sides[0].team[0]!.hp).toBe(30);
    expect(r.final.sides[1].team[0]!.energy).toBe(50);
    // and the other way round
    const r2 = runBattle(
      d,
      duel(mon('glass', 'F0', { startEnergy: 50 }), mon('glass_strong', 'F0', { startEnergy: 50 })),
      [thrower(), thrower()],
      seededRandom(1),
    );
    expect(r2.outcome).toBe('win1');
    expect(r2.final.sides[0].team[0]!.energy).toBe(50);
  });

  it.each([0, 1] as const)('equal attack: cmpTieWinner %i picks the order and the loser does not fire', (winner) => {
    const r = runBattle(
      d,
      duel(mon('glass', 'F0', { startEnergy: 50 }), mon('glass', 'F0', { startEnergy: 50 })),
      [thrower(), thrower()],
      fixedRandom(winner),
    );
    expect(r.outcome).toBe(winner === 0 ? 'win0' : 'win1');
    const loser = r.final.sides[winner === 0 ? 1 : 0].team[0]!;
    const won = r.final.sides[winner].team[0]!;
    expect(loser.hp).toBe(0);
    expect(loser.energy).toBe(50);
    expect(won.hp).toBe(30);
    expect(won.energy).toBe(0);
  });

  it('a shield takes the hit for 1 damage and spends one shield', () => {
    const p1 = player(undefined, () => true);
    const r = runBattle(
      d,
      duel(mon('tank', 'F0', { startEnergy: 50 }), mon('tank', 'F0'), [0, 1]),
      [thrower(), p1],
      seededRandom(1),
      { maxTurns: 1, trace: true },
    );
    const b = r.final.sides[1].team[0]!;
    expect(b.maxHp - b.hp).toBe(1);
    expect(r.final.sides[1].shields).toBe(0);
    expect(r.trace[0]!.events.some((e) => e.kind === 'shield')).toBe(true);
  });

  it('declined shields keep the shield and take full damage', () => {
    const r = runBattle(
      d,
      duel(mon('tank', 'F0', { startEnergy: 50 }), mon('tank', 'F0'), [0, 1]),
      [thrower(), player()],
      seededRandom(1),
      { maxTurns: 1 },
    );
    expect(r.final.sides[1].shields).toBe(1);
    expect(r.final.sides[1].team[0]!.maxHp - r.final.sides[1].team[0]!.hp).toBe(CH_HIT);
  });

  it('a guaranteed self buff and an opponent debuff both apply, the debuff even through a shield', () => {
    const r = runBattle(
      d,
      duel(mon('tank', 'F0', { startEnergy: 50, chargedMoves: ['CHBUFF'] }), mon('tank', 'F0'), [0, 1]),
      [thrower(), player(undefined, () => true)],
      seededRandom(1),
      { maxTurns: 1 },
    );
    expect(r.final.sides[0].team[0]!.atkStage).toBe(1);
    expect(r.final.sides[1].team[0]!.defStage).toBe(-1);
    expect(r.final.sides[1].shields).toBe(0);
  });

  it('a chance buff applies only when buffProcs says so', () => {
    const run = (procs: boolean) =>
      runBattle(
        d,
        duel(mon('tank', 'F0', { startEnergy: 50, chargedMoves: ['CHCHANCE'] }), mon('tank', 'F0')),
        [thrower(), player()],
        fixedRandom(0, procs),
        { maxTurns: 1 },
      ).final.sides[0].team[0]!.atkStage;
    expect(run(false)).toBe(0);
    expect(run(true)).toBe(1);
  });

  it('stages clamp at +4 and -4', () => {
    const r = runBattle(
      d,
      duel(mon('tank', 'F0', { startEnergy: 50, chargedMoves: ['CHHUGE'] }), mon('tank', 'F0')),
      [thrower(), player()],
      seededRandom(1),
      { maxTurns: 1 },
    );
    expect(r.final.sides[0].team[0]!.atkStage).toBe(4);
    expect(r.final.sides[1].team[0]!.defStage).toBe(-4);
  });

  it('same inputs and same random outcomes give the same battle', () => {
    const setup = duel(mon('tank', 'F1', { startEnergy: 20 }), mon('tank', 'F2', { chargedMoves: ['CHCHANCE'] }), [1, 1]);
    const go = () =>
      runBattle(d, setup, [thrower(), thrower()], seededRandom(7), { trace: true, maxTurns: 60 });
    const a = go();
    const b = go();
    expect(hashState(a.final)).toBe(hashState(b.final));
    expect(a.trace).toEqual(b.trace);
  });

  it('the trace carries each turn state hash', () => {
    const setup = duel(mon('tank', 'F1', { startEnergy: 20 }), mon('tank', 'F2'), [1, 1]);
    const go = () => runBattle(d, setup, [thrower(), thrower()], seededRandom(3), { trace: true, maxTurns: 40 });
    const a = go();
    const b = go();
    expect(a.trace.at(-1)!.hash).toBe(hashState(a.final));
    expect(a.trace.map((r) => r.hash)).toEqual(b.trace.map((r) => r.hash));
    expect(new Set(a.trace.map((r) => r.hash)).size).toBe(a.trace.length);
  });

  it('the trace shows shields, stages and max HP as they stand after each turn', () => {
    const setup = duel(
      mon('tank', 'F1', { startEnergy: 40, chargedMoves: ['CHBUFF'] }),
      mon('tank', 'F0'),
      [0, 1],
    );
    const shieldsOnce = player(undefined, () => true);
    const r = runBattle(d, setup, [thrower(), shieldsOnce], seededRandom(4), { trace: true, maxTurns: 10 });
    const t = r.trace.findIndex((x) => x.events.some((e) => e.kind === 'shield'));
    expect(t).toBeGreaterThan(0);
    expect(r.trace[t]!.shields[1]).toBe(r.trace[t - 1]!.shields[1] - 1);
    const b = r.trace.findIndex((x) => x.events.some((e) => e.kind === 'buff' && e.actor === 0));
    expect(b).toBeGreaterThan(0);
    expect(r.trace[b]!.stages[0].atk).toBe(r.trace[b - 1]!.stages[0].atk + 1);
    expect(r.trace.every((x) => x.maxHp[0] === r.final.sides[0].team[0]!.maxHp)).toBe(true);
  });
});
