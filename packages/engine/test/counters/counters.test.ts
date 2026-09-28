import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { toSpecimens } from '../../src/collection/specimen.js';
import { counterGrids, metaCounters, type CounterEntry } from '../../src/counters/counters.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { simOptionsFor } from '../../src/gamedata/league.js';
import { facingWeight } from '../../src/gamedata/metaRank.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { haveStaticData, loadFixtureCsv, loadStaticData, readGameMaster } from '../fixtures.js';

describe('facing weight', () => {
  it('drops with rank and treats unranked as rare', () => {
    expect(facingWeight(1)).toBe(1);
    expect(facingWeight(4)).toBeCloseTo(0.5);
    expect(facingWeight(16)).toBeCloseTo(0.25);
    expect(facingWeight(null)).toBeLessThan(facingWeight(40));
  });
});

describe.skipIf(!haveStaticData())('meta counters', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const counters = metaCounters(data, specimens, index, { limit: 40 }).entries;

  it('ranks by anti-meta score, best first', () => {
    expect(counters).toHaveLength(40);
    counters.forEach((c, i) => {
      expect(c.antiRank).toBe(i + 1);
      if (i > 0) {
        expect(c.antiMeta).toBeLessThanOrEqual(counters[i - 1]!.antiMeta);
      }
      expect(c.antiMeta).toBeGreaterThan(0);
      expect(c.antiMeta).toBeLessThanOrEqual(100);
    });
  });

  it('lists the most common opponents first in beats and losesTo', () => {
    for (const c of counters) {
      const ranksOf = (m: { opponentRank: number | null }[]): number[] =>
        m.map((x) => x.opponentRank ?? 9999);
      const b = ranksOf(c.beats);
      expect([...b].sort((x, y) => x - y)).toEqual(b);
      expect(c.beats.length).toBeLessThanOrEqual(5);
      expect(c.losesTo.length).toBeLessThanOrEqual(3);
      for (const m of c.beats) {
        expect(m.scenarios).toBeGreaterThanOrEqual(2);
      }
      for (const m of c.losesTo) {
        expect(m.scenarios).toBe(0);
        expect(m.opponent).not.toBe(c.speciesId);
      }
    }
  });

  it('marks what the collection owns or can build', () => {
    const marked = counters.filter((c) => c.owned !== 'none');
    expect(marked.length).toBeGreaterThan(0);
    for (const c of marked) {
      expect(c.ownedSpecimenId).not.toBeNull();
      expect(specimens.some((s) => s.id === c.ownedSpecimenId)).toBe(true);
      if (c.owned === 'have') {
        expect(c.ownedStageOffset).toBe(0);
      } else {
        expect(c.ownedStageOffset).toBeGreaterThan(0);
      }
    }
  });

  it('leaves the shield grid empty against the whole meta', () => {
    for (const c of counters) {
      expect(c.grid).toBeNull();
    }
  });

  it('computes the gap against the overall rank', () => {
    for (const c of counters) {
      if (c.overallRank !== null) {
        expect(c.gap).toBe(c.overallRank - c.antiRank);
      }
    }
  });
});

describe.skipIf(!haveStaticData())('counters against one opponent', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const target = data.matrix.opponents[0]!;

  it('scores every candidate by its win share against that species only', () => {
    const r = metaCounters(data, specimens, index, { limit: 40, vs: target });
    expect(r.vs).toEqual({ speciesId: target, inMeta: true });
    expect(r.blended).toBe(false);
    expect(r.entries.length).toBeGreaterThan(0);
    expect(r.entries.length).toBeLessThanOrEqual(40);
    r.entries.forEach((c, i) => {
      expect(c.antiRank).toBe(i + 1);
      expect(c.speciesId).not.toBe(target);
      expect(c.antiMeta).toBeGreaterThan(0);
      expect(c.antiMeta).toBeLessThanOrEqual(100);
      if (i > 0) {
        expect(c.antiMeta).toBeLessThanOrEqual(r.entries[i - 1]!.antiMeta);
      }
    });
    // Anything listed beats the target in every scenario it is scored 100 for.
    const top = r.entries[0]!;
    expect(top.antiMeta).toBe(100);
    expect(r.facing).toMatch(/one opponent/);
  });

  it('says so when the species is not in the meta group', () => {
    const r = metaCounters(data, specimens, index, { limit: 40, vs: 'not-a-species' });
    expect(r.vs).toEqual({ speciesId: 'not-a-species', inMeta: false });
    expect(r.entries).toEqual([]);
  });

  it('ignores the log while scoring against one opponent', () => {
    const battles = Array.from({ length: 20 }, (_, i) => ({
      id: `b${i}`,
      at: new Date().toISOString(),
      opponents: [target],
      result: 'loss' as const,
      tanked: false,
    }));
    const r = metaCounters(data, specimens, index, {
      limit: 10,
      vs: target,
      facing: { kind: 'log', battles },
    });
    expect(r.blended).toBe(false);
    expect(r.battles).toBe(0);
  });
});

describe.skipIf(!haveStaticData())('the shield grid against one opponent', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(readGameMaster()));
  const live = { sim, league: data.league };
  const target = data.matrix.opponents[0]!;
  const first = metaCounters(data, [], index, { limit: 20, vs: target }, live);
  const won = (c: CounterEntry): number => c.grid!.filter((r) => r > 500).length;
  const mean = (c: CounterEntry): number => c.grid!.reduce((a, b) => a + b, 0) / 9;

  it('leaves the grid empty until it is filled', () => {
    expect(first.entries.length).toBe(20);
    for (const c of first.entries) {
      expect(c.grid).toBeNull();
    }
  });

  const filled = counterGrids(data, target, first.entries, live);

  it('fills nine ratings per counter, your shields by theirs, row-major', () => {
    expect(filled.entries).toHaveLength(first.entries.length);
    expect(filled.gridMs).toBeGreaterThanOrEqual(0);
    for (const c of filled.entries) {
      expect(c.grid).toHaveLength(9);
      for (const r of c.grid!) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1000);
      }
      // Two shields against none is never worse than none against two.
      expect(c.grid![2 * 3 + 0]).toBeGreaterThanOrEqual(c.grid![0 * 3 + 2]!);
    }
    // One cell off the diagonal, battled directly: yours 0, theirs 1 is index 1.
    const c = filled.entries[0]!;
    // The counter at its rankings moveset, the meta-group opponent at its meta moveset.
    const spec = (id: string, moveset: string[], shields: number) => ({
      speciesId: id,
      fastMove: moveset[0]!,
      chargedMoves: moveset.slice(1, 3),
      shields,
      startEnergyTurns: 0,
    });
    const direct = sim.simulate(
      spec(c.speciesId, data.matrix.candidateMovesets[c.speciesId]!, 0),
      spec(target, data.matrix.opponentMovesets[target]!, 1),
      simOptionsFor(data.league),
    );
    expect(c.grid![1]).toBe(direct.rating);
  });

  it('orders by cells won, then mean rating, then overall rank, and renumbers', () => {
    filled.entries.forEach((c, i) => {
      expect(c.antiRank).toBe(i + 1);
      expect(c.gap).toBe((c.overallRank ?? data.matrix.candidates.length) - c.antiRank);
      if (i === 0) {
        return;
      }
      const p = filled.entries[i - 1]!;
      expect(won(c)).toBeLessThanOrEqual(won(p));
      if (won(c) === won(p)) {
        expect(mean(c)).toBeLessThanOrEqual(mean(p));
        if (mean(c) === mean(p)) {
          expect(c.overallRank ?? 9999).toBeGreaterThanOrEqual(p.overallRank ?? 9999);
        }
      }
    });
    // The same species as went in, only reordered.
    expect(filled.entries.map((c) => c.speciesId).sort()).toEqual(
      first.entries.map((c) => c.speciesId).sort(),
    );
  });

  it('reports each batch, in the incoming order, as it finishes', () => {
    const calls: { done: number; total: number; ids: string[]; gridded: number }[] = [];
    counterGrids(
      data,
      target,
      first.entries,
      live,
      (done, total, entries) =>
        calls.push({
          done,
          total,
          ids: entries.map((e) => e.speciesId),
          gridded: entries.filter((e) => e.grid !== null).length,
        }),
      7,
    );
    expect(calls.map((c) => c.done)).toEqual([7, 14, 20]);
    for (const c of calls) {
      expect(c.total).toBe(20);
      expect(c.gridded).toBe(c.done);
      expect(c.ids).toEqual(first.entries.map((e) => e.speciesId));
    }
  });
});

describe.skipIf(!haveStaticData())('the shield grid against a meta-group opponent', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(readGameMaster()));
  const live = { sim, league: data.league };
  const view = new MatrixView(data.matrix);
  // A meta-group species whose meta moveset has a move its rankings moveset lacks: talonflame in
  // Great League (Flame Charge in the meta group, Brave Bird in the rankings).
  const moves = (m: string[] | undefined): string => [...(m ?? [])].sort().join(',');
  const candidates = data.matrix.opponents.filter(
    (id) =>
      data.matrix.opponents.indexOf(id) === data.matrix.opponents.lastIndexOf(id) &&
      data.rankings.overall.some((e) => e.speciesId === id) &&
      moves(data.matrix.opponentMovesets[id]) !==
        moves(data.rankings.overall.find((e) => e.speciesId === id)?.moveset),
  );
  const target = candidates.includes('talonflame') ? 'talonflame' : candidates[0];

  it.skipIf(!target)('battles at the meta moveset, so equal shields agree with the matrix', () => {
    const r = metaCounters(data, [], index, { limit: 10, vs: target! }, live);
    expect(r.vs?.inMeta).toBe(true);
    const { entries } = counterGrids(data, target!, r.entries, live);
    const col = data.matrix.opponents.indexOf(target!);
    expect(entries.length).toBeGreaterThan(0);
    for (const c of entries) {
      const row = view.rowOf(c.speciesId)!;
      // Diagonal cells 0, 4 and 8 are 0-0, 1-1 and 2-2: the matrix's three scenarios.
      expect([c.grid![0], c.grid![4], c.grid![8]]).toEqual(
        [0, 1, 2].map((sc) => view.rating(row, col, sc)),
      );
    }
  });
});
