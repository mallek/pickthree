import { describe, expect, it } from 'vitest';
import { active, createBattle, type BattleSetup } from '../src/state/state.js';
import { hashState, restore, snapshot } from '../src/state/snapshot.js';
import { makeData, makeSpecies } from './fixtures/synthetic.js';

const d = makeData();
d.species['m'] = makeSpecies('m', { baseStats: { atk: 100, def: 80, hp: 100 } });
d.species['n'] = makeSpecies('n', { baseStats: { atk: 120, def: 80, hp: 100 } });

function mon(formId = 'm', over: Record<string, unknown> = {}) {
  return {
    formId,
    level: 1,
    ivs: { atk: 0, def: 0, hp: 0 },
    fastMove: 'TACKLE_FAST',
    chargedMoves: ['SLAM_CHARGED'] as ['SLAM_CHARGED'],
    ...over,
  };
}
const setup: BattleSetup = {
  sides: [
    { team: [mon()], shields: 2 },
    { team: [mon()], shields: 1 },
  ],
};

describe('battle state', () => {
  it('creates full HP, zero energy unless startEnergy, shields per side', () => {
    const s = createBattle(d, {
      sides: [
        { team: [mon('m', { startEnergy: 30 })], shields: 2 },
        { team: [mon('n')], shields: 0 },
      ],
    });
    expect(s.turn).toBe(1);
    expect(active(s, 0).hp).toBe(active(s, 0).maxHp);
    expect(active(s, 0).energy).toBe(30);
    expect(active(s, 1).energy).toBe(0);
    expect(s.sides[0].shields).toBe(2);
    expect(s.sides[1].shields).toBe(0);
    expect(s.usePriority).toBe(true);
    expect(createBattle(d, setup).usePriority).toBe(false);
    expect(s.outcome).toBeNull();
    expect(active(s, 0).startFormId).toBe('m');
  });
  it('keeps raw form stats for shadow combatants, only the flag differs', () => {
    const s = createBattle(d, {
      sides: [{ team: [mon('m', { shadow: true })], shields: 0 }, setup.sides[1]],
    });
    expect(active(s, 0).shadow).toBe(true);
    expect(active(s, 1).shadow).toBe(false);
    expect(active(s, 0).atk).toBe(active(s, 1).atk);
    expect(active(s, 0).def).toBe(active(s, 1).def);
    expect(s.usePriority).toBe(false);
  });
  it('rejects a team of two with the spec 2 message', () => {
    expect(() =>
      createBattle(d, { sides: [{ team: [mon(), mon()], shields: 0 }, setup.sides[1]] }),
    ).toThrow('3v3 arrives in spec 2; this slice takes one Pokemon per side');
  });
  it('rejects bad input', () => {
    const bad = (m: Record<string, unknown>, shields = 0) =>
      createBattle(d, { sides: [{ team: [mon('m', m)], shields }, setup.sides[1]] });
    expect(() => bad({ formId: 'nope' })).toThrow();
    expect(() => bad({ fastMove: 'NOPE' })).toThrow();
    expect(() => bad({ chargedMoves: ['NOPE'] })).toThrow();
    expect(() => bad({}, 3)).toThrow();
    expect(() => bad({}, -1)).toThrow();
    expect(() => bad({ startEnergy: 101 })).toThrow();
    expect(() => bad({ startEnergy: -1 })).toThrow();
  });
});

describe('snapshot and hash', () => {
  it('snapshot is independent of the original', () => {
    const s = createBattle(d, setup);
    const c = snapshot(s);
    active(c, 0).hp -= 5;
    c.queue.push({ actor: 0, kind: 'fast', turn: 1, slot: 0 });
    expect(active(s, 0).hp).toBe(active(createBattle(d, setup), 0).hp);
    expect(s.queue).toEqual([]);
  });
  it('equal states hash equal, built separately, as 16 hex chars', () => {
    const h = hashState(createBattle(d, setup));
    expect(h).toBe(hashState(createBattle(d, setup)));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
  it('any field change changes the hash', () => {
    const base = createBattle(d, setup);
    base.queue.push({ actor: 1, kind: 'charged', turn: 2, slot: 0 });
    const h0 = hashState(base);
    const muts: Array<(s: ReturnType<typeof snapshot>) => void> = [
      (s) => (s.turn += 1),
      (s) => (s.sides[0].shields -= 1),
      (s) => (active(s, 1).hp -= 1),
      (s) => (active(s, 0).energy += 1),
      (s) => (active(s, 0).atkStage += 1),
      (s) => (active(s, 1).defStage -= 1),
      (s) => (active(s, 0).formId = 'n'),
      (s) => (active(s, 1).cooldown += 1),
      (s) => (s.queue[0]!.turn += 1),
      (s) => (s.chargedLastTurn = !s.chargedLastTurn),
      (s) => (s.frozenTurns += 1),
      (s) => (s.outcome = 'tie'),
      (s) => (active(s, 0).faintSource = 'fast'),
      (s) => (s.sides[1].switchTimer += 1),
      (s) => (s.usePriority = !s.usePriority),
      (s) => (active(s, 0).shadow = true),
      (s) => (active(s, 0).chargedMoves = ['SLAM_CHARGED', 'X']),
    ];
    const seen = new Set<string>([h0]);
    for (const m of muts) {
      const c = snapshot(base);
      m(c);
      const h = hashState(c);
      expect(h).not.toBe(h0);
      seen.add(h);
    }
    expect(seen.size).toBe(muts.length + 1);
  });
  it('restore returns a mutated state to the snapshot', () => {
    const s = createBattle(d, setup);
    const snap = snapshot(s);
    active(s, 1).energy = 40;
    s.queue.push({ actor: 0, kind: 'fast', turn: 1, slot: 0 });
    s.outcome = 'win0';
    restore(s, snap);
    expect(hashState(s)).toBe(hashState(snap));
    expect(s.queue).toEqual([]);
  });
});
