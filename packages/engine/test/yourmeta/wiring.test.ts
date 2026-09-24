import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { toSpecimens } from '../../src/collection/specimen.js';
import { metaCounters } from '../../src/counters/counters.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { facingWeight, metaRanks } from '../../src/gamedata/metaRank.js';
import { recommend } from '../../src/recommend.js';
import type { LoggedBattle } from '../../src/yourmeta/types.js';
import { REPO_ROOT, haveStaticData, loadFixtureCsv, loadStaticData } from '../fixtures.js';

const gmPath = path.join(
  REPO_ROOT,
  'packages',
  'data',
  '.pvpoke',
  'src',
  'data',
  'gamemaster.json',
);
const ready = haveStaticData() && fs.existsSync(gmPath);

/** A regular outside the meta group: the highest-ranked species with no matrix column. */
function pickOutsider(data: ReturnType<typeof loadStaticData>): string {
  const cols = new Set(data.matrix.opponents);
  const found = data.rankings.overall.find((e) => !cols.has(e.speciesId) && e.moveset.length >= 2);
  if (!found) {
    throw new Error('every ranked species is in the meta group');
  }
  return found.speciesId;
}

/** Every other battle also lists the first meta-group species, so one matrix column gains weight. */
function log(outsider: string, inMeta: string, count: number): LoggedBattle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${i}`,
    at: `2026-09-10T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
    opponents: i % 2 === 0 ? [outsider, inMeta] : [outsider],
    result: 'loss' as const,
    tanked: false,
  }));
}

describe.skipIf(!ready)('your meta wiring', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const deps = { data, sim };
  const outsider = pickOutsider(data);
  const inMeta = data.matrix.opponents[0] as string;

  it('with the switch off the recommendation is what it was before the log existed', () => {
    const plain = recommend(specimens, { results: 5 }, deps);
    const off = recommend(specimens, { results: 5, facing: { kind: 'prior' } }, deps);
    expect(off.teams.map((t) => t.id)).toEqual(plain.teams.map((t) => t.id));
    expect(off.teams.map((t) => t.score.total)).toEqual(plain.teams.map((t) => t.score.total));
    expect(plain.assumptions.facing).toBe('PvPoke weights only');
    expect(off.assumptions.facing).toBe('PvPoke weights only');
  });

  it('with enough battles the outsider reaches the sims and the assumptions say so', () => {
    const rec = recommend(
      specimens,
      { results: 5, facing: { kind: 'log', battles: log(outsider, inMeta, 30) } },
      deps,
    );
    expect(rec.assumptions.facing).toBe(
      `Weighted by your log: 30 battles this season, 1 opponent outside PvPoke's list simulated`,
    );
    for (const team of rec.teams) {
      for (const slot of team.slots) {
        expect(slot.sim.results).toHaveLength(data.meta.length + 1);
        expect(slot.sim.results[data.meta.length]?.opponent).toBe(outsider);
      }
      const all = [...team.score.coveredOpponents, ...team.score.uncoveredOpponents];
      expect(all).toContain(outsider);
      // Safety is matrix-only: the outsider appended past the meta group must not move it.
      const hardLosses = team.slots[1].sim.results
        .slice(0, data.meta.length)
        .filter((r) => r.rating < 300).length;
      expect(team.score.factors.safety).toBe(
        Math.max(0, 100 - hardLosses * 20 - team.score.topUncovered * 10),
      );
    }
  });

  it('counters use the blended weights and carry the line', () => {
    const plain = metaCounters(data, specimens, index, { limit: 10 });
    expect(plain.blended).toBe(false);
    expect(plain.facing).toBe('PvPoke weights only');
    expect(plain.entries).toHaveLength(10);
    const blended = metaCounters(data, specimens, index, {
      limit: 10,
      facing: { kind: 'log', battles: log(outsider, inMeta, 30) },
    });
    expect(blended.blended).toBe(true);
    expect(blended.battles).toBe(30);
    expect(blended.facing).toContain('counted, not simulated');
    // The first meta species was in every other battle, so beating it is worth more now.
    const ranks = metaRanks(data.rankings);
    expect(facingWeight(ranks.get(inMeta)?.overall ?? null)).toBeGreaterThan(0);
    expect(blended.entries.map((e) => e.speciesId)).not.toEqual(
      plain.entries.map((e) => e.speciesId),
    );
  });
});

describe.skipIf(!ready)('who beats an outsider, simulated on device', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const outsider = pickOutsider(data);

  it('simulates the top ranked species against the outsider and scores them like the matrix', () => {
    const calls: [number, number][] = [];
    const r = metaCounters(
      data,
      specimens,
      index,
      { limit: 20, vs: outsider },
      { sim, league: data.league, onProgress: (d, t) => calls.push([d, t]) },
    );
    expect(r.vs).toEqual({ speciesId: outsider, inMeta: false, simulated: 300 });
    expect(r.facing).toMatch(/simulated on this device/);
    expect(r.entries.length).toBeGreaterThan(0);
    expect(r.entries.length).toBeLessThanOrEqual(20);
    r.entries.forEach((c, i) => {
      expect(c.antiRank).toBe(i + 1);
      expect(c.speciesId).not.toBe(outsider);
      expect(c.antiMeta).toBeGreaterThan(0);
      if (i > 0) {
        expect(c.antiMeta).toBeLessThanOrEqual(r.entries[i - 1]!.antiMeta);
      }
      // Only the top 300 by overall rank were simulated.
      expect(c.overallRank).not.toBeNull();
      expect(c.overallRank!).toBeLessThanOrEqual(300);
      // beats and losesTo still describe the real meta.
      for (const m of c.beats) {
        expect(data.matrix.opponents).toContain(m.opponent);
      }
    });
    // Progress reached the end: 300 species times three scenarios.
    expect(calls.at(-1)).toEqual([900, 900]);
  });

  it('still says no matchups when there is no simulator', () => {
    const r = metaCounters(data, specimens, index, { limit: 20, vs: outsider });
    expect(r.vs).toEqual({ speciesId: outsider, inMeta: false });
    expect(r.entries).toEqual([]);
  });

  it('says so for a species with no ranking entry even with a simulator', () => {
    const r = metaCounters(
      data,
      specimens,
      index,
      { limit: 20, vs: 'not-a-species' },
      { sim, league: data.league },
    );
    expect(r.vs).toEqual({ speciesId: 'not-a-species', inMeta: false });
    expect(r.entries).toEqual([]);
  });
});
