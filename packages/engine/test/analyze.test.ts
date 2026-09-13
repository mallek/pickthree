import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { analyzeTeam, hypotheticalSpecimen, type TeamPick } from '../src/analyze.js';
import { buildsFor, DEFAULT_BUILD_OPTIONS } from '../src/builds/eligibility.js';
import { toSpecimens } from '../src/collection/specimen.js';
import { parsePokeGenieCsv } from '../src/csv/parse.js';
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
  const { specimens } = toSpecimens(parsePokeGenieCsv(loadFixtureCsv()), index);
  const deps = { data, sim };
  const owned = specimens.filter((s) => buildsFor(s, index, DEFAULT_BUILD_OPTIONS).length > 0);
  const [a, b] = owned;

  it('runs at best IVs for a species you do not own', () => {
    const s = hypotheticalSpecimen('swampert', index, DEFAULT_BUILD_OPTIONS);
    expect(s.ivs).not.toBeNull();
    expect(s.id).toBe('species:swampert');
    const builds = buildsFor(s, index, { ...DEFAULT_BUILD_OPTIONS, minCp: 0 });
    expect(builds.some((x) => x.speciesId === 'swampert' && x.ivRank.rank === 1)).toBe(true);
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
