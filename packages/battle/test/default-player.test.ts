import { describe, expect, it } from 'vitest';
import type { MoveData } from '../src/data/types.js';
import { DefaultPlayer } from '../src/player/default.js';
import type { BattleView, IncomingCharged } from '../src/player/types.js';
import { seededRandom } from '../src/random.js';
import { runBattle } from '../src/rules/battle.js';
import { buildView } from '../src/rules/view.js';
import { createBattle } from '../src/state/state.js';
import { duel, makeBattleData, mon, thrower } from './fixtures/battle.js';
import { makeMove } from './fixtures/synthetic.js';

function dataWithMoves() {
  const d = makeBattleData();
  d.moves['CHLOW'] = makeMove('CHLOW', { category: 'charged', power: 30, energy: 35, energyGain: 0 });
  d.moves['CHHIGH'] = makeMove('CHHIGH', { category: 'charged', power: 80, energy: 60, energyGain: 0 });
  d.moves['CHCHEAP'] = makeMove('CHCHEAP', { category: 'charged', power: 50, energy: 40, energyGain: 0 });
  d.moves['FKO'] = makeMove('FKO', { power: 100, energyGain: 5, turns: 1 });
  return d;
}

function viewOf(
  d: ReturnType<typeof dataWithMoves>,
  self: Parameters<typeof mon>,
  opp: Parameters<typeof mon>,
  shields: [number, number] = [0, 0],
): BattleView {
  const state = createBattle(d, duel(mon(...self), mon(...opp), shields));
  return buildView(state, d, 0);
}

describe('DefaultPlayer', () => {
  it('finishes a battle between two default players', () => {
    const d = makeBattleData();
    const r = runBattle(
      d,
      duel(mon('tank', 'F1'), mon('tank', 'F2'), [1, 1]),
      [new DefaultPlayer(), new DefaultPlayer()],
      seededRandom(1),
    );
    expect(r.outcome).not.toBe('timeout');
  });

  it('throws the affordable charged move with more damage', () => {
    const d = dataWithMoves();
    const v = viewOf(d, ['tank', 'F1', { startEnergy: 100, chargedMoves: ['CHLOW', 'CHHIGH'] }], ['tank', 'F1']);
    expect(new DefaultPlayer().decide(v)).toEqual({ kind: 'charged', slot: 1 });
  });

  it('breaks damage ties by lower energy cost, then lower slot', () => {
    const d = dataWithMoves();
    d.moves['CHCHEAP'] = makeMove('CHCHEAP', { category: 'charged', power: 50, energy: 40, energyGain: 0 });
    const v = viewOf(d, ['tank', 'F1', { startEnergy: 100, chargedMoves: ['CH', 'CHCHEAP'] }], ['tank', 'F1']);
    expect(new DefaultPlayer().decide(v)).toEqual({ kind: 'charged', slot: 1 });
  });

  it('plays fast when fast knocks out', () => {
    const d = dataWithMoves();
    const v = viewOf(d, ['tank', 'FKO', { startEnergy: 100, chargedMoves: ['CHHIGH'] }], ['glass', 'F1']);
    expect(new DefaultPlayer().decide(v)).toEqual({ kind: 'fast' });
  });

  it('plays fast when no charged move is affordable', () => {
    const d = dataWithMoves();
    const v = viewOf(d, ['tank', 'F1', { startEnergy: 0, chargedMoves: ['CHHIGH'] }], ['tank', 'F1']);
    expect(new DefaultPlayer().decide(v)).toEqual({ kind: 'fast' });
  });

  it('shields a knockout hit', () => {
    const d = dataWithMoves();
    const v = viewOf(d, ['glass', 'F1'], ['tank', 'F1'], [1, 1]);
    const incoming: IncomingCharged = { move: d.moves['CH'] as MoveData, damage: v.self.hp, blockedByMechanic: false };
    expect(new DefaultPlayer().shield(v, incoming)).toBe(true);
  });

  it('shields a hit of at least 30 percent of max hp, not a smaller one', () => {
    const d = dataWithMoves();
    const v = viewOf(d, ['tank', 'F1'], ['tank', 'F1'], [1, 1]);
    const mv = d.moves['CH'] as MoveData;
    const big = Math.ceil(v.self.maxHp * 0.3);
    expect(new DefaultPlayer().shield(v, { move: mv, damage: big, blockedByMechanic: false })).toBe(true);
    expect(new DefaultPlayer().shield(v, { move: mv, damage: big - 1, blockedByMechanic: false })).toBe(false);
  });

  it('does not shield a hit its mechanics block', () => {
    const d = dataWithMoves();
    const v = viewOf(d, ['glass', 'F1'], ['tank', 'F1'], [1, 1]);
    const incoming: IncomingCharged = { move: d.moves['CH'] as MoveData, damage: 9999, blockedByMechanic: true };
    expect(new DefaultPlayer().shield(v, incoming)).toBe(false);
  });

  it('end to end, a blockDamage defender keeps its shield', () => {
    const d = dataWithMoves();
    d.species['fa'] = { ...(d.species['tank'] as object), id: 'fa', family: 'shape' } as never;
    d.mechanics['shape'] = {
      family: 'shape',
      source: 'synthetic',
      entered: '2026-10-27',
      resetOnSwitchOut: false,
      rules: [{ when: { event: 'hitByChargedMove', form: 'fa' }, do: [{ effect: 'blockDamage' }] }],
    };
    const r = runBattle(
      d,
      duel(mon('tank', 'F0', { startEnergy: 50 }), mon('fa', 'F0'), [0, 1]),
      [thrower(), new DefaultPlayer()],
      seededRandom(1),
      { maxTurns: 1 },
    );
    expect(r.final.sides[1].shields).toBe(1);
  });
});
