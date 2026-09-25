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
import type { LoggedBattle } from '../../src/yourmeta/types.js';
import { REPO_ROOT, haveStaticData, loadFixtureCsv, loadStaticData } from '../fixtures.js';

const gmPath = path.join(REPO_ROOT, 'packages', 'data', '.pvpoke', 'src', 'data', 'gamemaster.json');
const ready = haveStaticData() && fs.existsSync(gmPath);

/**
 * PvPoke mode's output on the fixture, recorded before source weighting landed. Every change in
 * the source-weighted plan must leave this snapshot untouched: selecting PvPoke reproduces today.
 * The assumptions sentence is left out on purpose; its wording is tested on its own.
 * Exception (2026-09-25): teams now sort by battle strength first. diversify() keeps the
 * strongest sibling of near-duplicate trios, so one recommended team changed and thus the
 * analyze snapshot that reads teams[0] changed as well.
 */
describe.skipIf(!ready)('PvPoke baseline', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const deps = { data, sim };
  // PvPoke mode, named explicitly: the facing every run below uses, so each snapshot is what
  // selecting PvPoke produces.
  const prior = { facing: { kind: 'prior' as const } };

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

  it('a log under 15 battles recommends exactly what PvPoke mode does', () => {
    // Built like wiring.test.ts: a regular outside the meta group, and a meta-group species on
    // every other battle. Fourteen is one short of the threshold, so the log has no say yet.
    const cols = new Set(data.matrix.opponents);
    const outsider = data.rankings.overall.find((e) => !cols.has(e.speciesId) && e.moveset.length >= 2);
    expect(outsider).toBeDefined();
    const inMeta = data.matrix.opponents[0] as string;
    const battles: LoggedBattle[] = Array.from({ length: 14 }, (_, i) => ({
      id: `b${i}`,
      at: `2026-09-10T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
      opponents: i % 2 === 0 ? [outsider!.speciesId, inMeta] : [outsider!.speciesId],
      result: 'loss' as const,
      tanked: false,
    }));
    const shape = (rec: ReturnType<typeof recommend>) => ({
      teams: rec.teams.map((t) => ({
        id: t.id,
        structure: t.structure,
        species: t.slots.map((s) => s.candidate.build.speciesId),
        score: t.score,
      })),
      triosScored: rec.stats.triosScored,
      finalists: rec.stats.finalists,
    });
    const fromPrior = recommend(specimens, { ...prior }, deps);
    const fromLog = recommend(specimens, { facing: { kind: 'log', battles } }, deps);
    expect(fromLog.teams.length).toBeGreaterThan(0);
    expect(shape(fromLog)).toEqual(shape(fromPrior));
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
