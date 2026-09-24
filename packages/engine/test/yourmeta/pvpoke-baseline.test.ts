import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { analyzeTeam } from '../../src/analyze.js';
import { toSpecimens } from '../../src/collection/specimen.js';
import { metaCounters } from '../../src/counters/counters.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { recommend } from '../../src/recommend.js';
import { REPO_ROOT, haveStaticData, loadFixtureCsv, loadStaticData } from '../fixtures.js';

const gmPath = path.join(REPO_ROOT, 'packages', 'data', '.pvpoke', 'src', 'data', 'gamemaster.json');
const ready = haveStaticData() && fs.existsSync(gmPath);

/**
 * PvPoke mode's output on the fixture, recorded before source weighting landed. Every change in
 * the source-weighted plan must leave this snapshot untouched: selecting PvPoke reproduces today.
 * The assumptions sentence is left out on purpose; its wording is tested on its own.
 */
describe.skipIf(!ready)('PvPoke baseline', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const deps = { data, sim };
  // Tasks 5 and 6 replace {} with { facing: { kind: 'prior' } }. Nothing else in this file changes.
  const prior = {};

  it('recommend', () => {
    const rec = recommend(specimens, { ...prior }, deps);
    const teams = rec.teams.map((t) => ({
      id: t.id,
      structure: t.structure,
      species: t.slots.map((s) => s.candidate.build.speciesId),
      score: t.score,
    }));
    expect({ teams, triosScored: rec.stats.triosScored, finalists: rec.stats.finalists }).toMatchSnapshot();
  });

  it('analyze', () => {
    const top = recommend(specimens, { ...prior }, deps).teams[0];
    expect(top).toBeDefined();
    const picks = top!.slots.map((s) => ({ kind: 'specimen' as const, id: s.candidate.build.specimenId })) as [
      { kind: 'specimen'; id: string },
      { kind: 'specimen'; id: string },
      { kind: 'specimen'; id: string },
    ];
    const a = analyzeTeam(picks, specimens, { order: 'best', ...prior }, deps);
    expect({
      species: a.team.slots.map((s) => s.candidate.build.speciesId),
      score: a.team.score,
    }).toMatchSnapshot();
  });

  it('counters', () => {
    const c = metaCounters(data, specimens, index, { ...prior });
    expect(c.entries.slice(0, 15).map((e) => ({ id: e.speciesId, antiMeta: e.antiMeta }))).toMatchSnapshot();
  });
});
