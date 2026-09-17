import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { analyzeTeam, hypotheticalSpecimen, type TeamPick } from '../src/analyze.js';
import { buildsFor, DEFAULT_BUILD_OPTIONS } from '../src/builds/eligibility.js';
import { toSpecimens } from '../src/collection/specimen.js';
import { parseCollectionCsv } from '../src/csv/parse.js';
import { GameDataIndex } from '../src/gamedata/index.js';
import { REPO_ROOT, haveStaticData, loadFixtureCsv, loadStaticData } from './fixtures.js';

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

describe.skipIf(!ready)('analyze a hand-built team', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const deps = { data, sim };
  const owned = specimens.filter((s) => buildsFor(s, index, DEFAULT_BUILD_OPTIONS).length > 0);
  const [a, b] = owned;

  it('runs at a top-10% spread for a species you do not own', () => {
    const s = hypotheticalSpecimen('swampert', index, DEFAULT_BUILD_OPTIONS);
    expect(s.ivs).not.toBeNull();
    expect(s.id).toBe('species:swampert');
    const builds = buildsFor(s, index, { ...DEFAULT_BUILD_OPTIONS, minCp: 0 });
    const b = builds.find((x) => x.speciesId === 'swampert');
    expect(b).toBeDefined();
    // The last spread inside the top 10%: about rank 410 of 4096 (ties can shave a place).
    const line = Math.ceil(b!.ivRank.total * 0.1);
    expect(b!.ivRank.rank).toBeGreaterThanOrEqual(line - 3);
    expect(b!.ivRank.rank).toBeLessThanOrEqual(line);
  });

  it('tries all six orders and keeps the best', () => {
    const picks: [TeamPick, TeamPick, TeamPick] = [
      { kind: 'specimen', id: a!.id },
      { kind: 'specimen', id: b!.id },
      { kind: 'species', id: 'swampert' },
    ];
    const r = analyzeTeam(picks, specimens, {}, deps);
    expect(r.team.id).toBe('custom');
    expect(r.team.slots).toHaveLength(3);
    expect(r.orders).toHaveLength(6);
    for (let i = 1; i < r.orders.length; i++) {
      expect(r.orders[i]!.total).toBeLessThanOrEqual(r.orders[i - 1]!.total);
    }
    expect(r.orders[0]!.total).toBe(r.team.score.total);
    expect(r.hypothetical).toEqual(['swampert']);
    expect(r.team.explanation.switchPlan).toBeDefined();
    expect(r.team.explanation.slotDetail).toHaveLength(3);
  });

  it('keeps the given order when asked', () => {
    const picks: [TeamPick, TeamPick, TeamPick] = [
      { kind: 'species', id: 'swampert' },
      { kind: 'specimen', id: a!.id },
      { kind: 'specimen', id: b!.id },
    ];
    const r = analyzeTeam(picks, specimens, { order: 'given' }, deps);
    expect(r.orders).toHaveLength(1);
    expect(r.team.slots[0]!.candidate.build.speciesId).toBe('swampert');
    expect(r.team.slots[0]!.role).toBe('lead');
    expect(r.team.slots[2]!.role).toBe('closer');
  });

  it('runs a pick with the moves the trainer chose', () => {
    const picks: [TeamPick, TeamPick, TeamPick] = [
      { kind: 'species', id: 'swampert', moves: { fast: 'WATER_GUN', charged: ['SURF'] } },
      { kind: 'specimen', id: a!.id },
      { kind: 'specimen', id: b!.id },
    ];
    const r = analyzeTeam(picks, specimens, { order: 'given' }, deps);
    const lead = r.team.slots[0]!.candidate;
    expect(lead.build.speciesId).toBe('swampert');
    expect(lead.moveset.source).toBe('chosen');
    expect(lead.moveset.fast.moveId).toBe('WATER_GUN');
    expect(lead.moveset.charged.map((c) => c.moveId)).toEqual(['SURF']);
    expect(r.chosenMoves).toEqual(['swampert']);
    // The other two ran the recommendation.
    expect(r.team.slots[1]!.candidate.moveset.source).not.toBe('chosen');
  });

  it('refuses a move the species cannot learn', () => {
    expect(() =>
      analyzeTeam(
        [
          { kind: 'species', id: 'swampert', moves: { fast: 'COUNTER', charged: ['SURF'] } },
          { kind: 'specimen', id: a!.id },
          { kind: 'specimen', id: b!.id },
        ],
        specimens,
        {},
        deps,
      ),
    ).toThrow(/Swampert cannot learn Counter/);
  });

  it('refuses duplicate picks and impossible ones', () => {
    expect(() =>
      analyzeTeam(
        [
          { kind: 'specimen', id: a!.id },
          { kind: 'specimen', id: a!.id },
          { kind: 'species', id: 'swampert' },
        ],
        specimens,
        {},
        deps,
      ),
    ).toThrow(/three different/);
    expect(() =>
      analyzeTeam(
        [
          { kind: 'specimen', id: 'nope' },
          { kind: 'specimen', id: a!.id },
          { kind: 'species', id: 'swampert' },
        ],
        specimens,
        {},
        deps,
      ),
    ).toThrow(/no longer in your collection/);
  });
});

describe.skipIf(!ready)('analyze with a species PvPoke does not rank', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const deps = { data, sim };
  const unranked = 'magikarp';

  it('is really unranked in the fixture data', () => {
    expect(data.matrix.candidates).not.toContain(unranked);
    expect(data.rankings.overall.some((e) => e.speciesId === unranked)).toBe(false);
  });

  it('simulates the pick against the meta and runs the rest of the analysis unchanged', () => {
    const stages: string[] = [];
    const picks: [TeamPick, TeamPick, TeamPick] = [
      { kind: 'species', id: unranked },
      { kind: 'species', id: 'azumarill' },
      { kind: 'species', id: 'tinkaton' },
    ];
    const r = analyzeTeam(picks, specimens, { order: 'given' }, deps, (stage) => {
      if (!stages.includes(stage)) {
        stages.push(stage);
      }
    });
    expect(r.unranked).toEqual([unranked]);
    expect(r.hypothetical).toContain(unranked);
    expect(stages).toContain('simulate-picks');
    const lead = r.team.slots[0]!;
    expect(lead.candidate.build.speciesId).toBe(unranked);
    expect(lead.candidate.overallScore).toBe(0);
    // The simulated row is a real matrix row: coverage counted it against every meta opponent.
    expect(lead.sim.results).toHaveLength(data.meta.length);
    expect(lead.candidate.moveset.source).toBe('fallback');
    expect(lead.candidate.moveset.charged.length).toBeGreaterThan(0);
  });

  it('runs the moves the trainer chose for it', () => {
    const sp = index.mustSpecies(unranked);
    const picks: [TeamPick, TeamPick, TeamPick] = [
      { kind: 'species', id: 'azumarill' },
      {
        kind: 'species',
        id: unranked,
        moves: { fast: sp.fastMoves[0]!, charged: [sp.chargedMoves[0]!] },
      },
      { kind: 'species', id: 'tinkaton' },
    ];
    const r = analyzeTeam(picks, specimens, { order: 'given' }, deps);
    expect(r.unranked).toEqual([unranked]);
    expect(r.chosenMoves).toEqual([unranked]);
    expect(r.team.slots[1]!.candidate.moveset.fast.moveId).toBe(sp.fastMoves[0]);
  });

  it('a ranked team simulates nothing extra', () => {
    const picks: [TeamPick, TeamPick, TeamPick] = [
      { kind: 'species', id: 'azumarill' },
      { kind: 'species', id: 'tinkaton' },
      { kind: 'species', id: 'clodsire' },
    ];
    const r = analyzeTeam(picks, specimens, { order: 'given' }, deps);
    expect(r.unranked).toEqual([]);
  });
});
