import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { toSpecimens } from '../../src/collection/specimen.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
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

/**
 * PvPoke mode against the log, on the same data. PvPoke's numbers move every refresh, so nothing
 * here pins a team or a score; each test compares two runs over one data set. (Snapshots of PvPoke
 * mode's output guarded the source-weighting refactor and were retired 2026-09-29.)
 */
describe.skipIf(!ready)('PvPoke baseline', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const deps = { data, sim };
  // PvPoke mode, named explicitly.
  const prior = { facing: { kind: 'prior' as const } };

  it('a log under 15 battles recommends exactly what PvPoke mode does', () => {
    // Built like wiring.test.ts: a regular outside the meta group, and a meta-group species on
    // every other battle. Fourteen is one short of the threshold, so the log has no say yet.
    const cols = new Set(data.matrix.opponents);
    const outsider = data.rankings.overall.find(
      (e) => !cols.has(e.speciesId) && e.moveset.length >= 2,
    );
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
});
