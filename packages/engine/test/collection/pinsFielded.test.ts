import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { analyzeTeam } from '../../src/analyze.js';
import { DEFAULT_BUILD_OPTIONS, buildsFor, type Build } from '../../src/builds/eligibility.js';
import type { PinMap } from '../../src/collection/pins.js';
import type { Specimen } from '../../src/collection/specimen.js';
import { metaCounters } from '../../src/counters/counters.js';
import type { RawScan } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { candidatePool, type Candidate } from '../../src/search/candidates.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { REPO_ROOT, haveStaticData, loadStaticData } from '../fixtures.js';

const gmPath = path.join(
  REPO_ROOT,
  'packages',
  'data',
  '.pvpoke',
  'src',
  'data',
  'gamemaster.json',
);

function eevee(id: string, atk: number): Specimen {
  return {
    id,
    speciesId: 'eevee',
    familyId: null,
    ivs: { atk, def: 15, sta: 15 },
    level: { min: 18, max: 18 },
    cp: 509,
    hp: 91,
    shadow: false,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-01 00:00',
    raw: {} as RawScan,
  };
}

const copies = [eevee('e1', 0), eevee('e2', 1)];

describe.skipIf(!haveStaticData())('the engine fields the pin', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const view = new MatrixView(data.matrix);
  const builds: Build[] = copies.flatMap((s) => buildsFor(s, index, DEFAULT_BUILD_OPTIONS));
  const poolOf = (pins: PinMap, extra: { excludedSpecimenIds?: string[] } = {}): Candidate[] =>
    candidatePool(builds, data.rankings, view, index, {
      ...DEFAULT_BUILD_OPTIONS,
      poolSize: 100,
      excludedSpecimenIds: [],
      excludedSpecies: [],
      pins,
      ...extra,
    }).pool;
  const umbreon = (pool: Candidate[]): Candidate | undefined =>
    pool.find((c) => c.build.speciesId === 'umbreon');

  it('candidatePool fields the other copy when it is pinned, for that species only', () => {
    const plain = poolOf({});
    const def = umbreon(plain)?.build.specimenId as string;
    const other = def === 'e1' ? 'e2' : 'e1';
    const pinned = poolOf({ umbreon: other });
    expect(umbreon(pinned)?.build.specimenId).toBe(other);
    const rest = pinned.filter((c) => c.build.speciesId !== 'umbreon');
    expect(rest.length).toBeGreaterThan(0);
    for (const c of rest) {
      const before = plain.find((x) => x.build.speciesId === c.build.speciesId);
      expect(c.build.specimenId).toBe(before?.build.specimenId);
    }
  });

  it('an unpinned species leaves the pool and the others stay', () => {
    const all = poolOf({});
    const without = poolOf({ umbreon: null });
    expect(umbreon(without)).toBeUndefined();
    expect(without.length).toBe(all.length - 1);
  });

  it('a pinned copy the filters drop is not swapped for another', () => {
    const pool = poolOf({ umbreon: 'e2' }, { excludedSpecimenIds: ['e2'] });
    expect(umbreon(pool)).toBeUndefined();
    expect(pool.length).toBeGreaterThan(0);
  });

  it('a stale pin is the default pick', () => {
    const def = umbreon(poolOf({}))?.build.specimenId;
    expect(umbreon(poolOf({ umbreon: 'gone' }))?.build.specimenId).toBe(def);
  });

  it('Counters marks the pinned copy as the owned one, and none when unpinned', () => {
    const owned = (pins: PinMap) =>
      metaCounters(
        { matrix: data.matrix, rankings: data.rankings, meta: data.meta },
        copies,
        index,
        { limit: 5000, pins },
      ).entries.find((e) => e.speciesId === 'umbreon');
    expect(owned({ umbreon: 'e2' })?.ownedSpecimenId).toBe('e2');
    expect(owned({ umbreon: 'e1' })?.ownedSpecimenId).toBe('e1');
    expect(owned({ umbreon: null })?.owned).toBe('none');
  });
});

describe.skipIf(!haveStaticData() || !fs.existsSync(gmPath))('Analyze fields the pin', () => {
  const data = loadStaticData();
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const run = (pins: PinMap) =>
    analyzeTeam(
      [
        { kind: 'species', id: 'umbreon', preferOwned: true },
        { kind: 'species', id: 'azumarill' },
        { kind: 'species', id: 'medicham' },
      ],
      copies,
      { order: 'given', pins },
      { data, sim },
    );
  const ownerOf = (pins: PinMap): string | undefined =>
    run(pins).team.slots.find((s) => s.candidate.build.speciesId === 'umbreon')?.candidate.build
      .specimenId;

  it('a species pick runs the pinned copy, and a stand-in when unpinned', () => {
    expect(ownerOf({ umbreon: 'e2' })).toBe('e2');
    expect(ownerOf({ umbreon: 'e1' })).toBe('e1');
    expect(run({ umbreon: null }).hypothetical).toContain('umbreon');
  });
});
