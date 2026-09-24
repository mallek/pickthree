import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { toSpecimens } from '../../src/collection/specimen.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { recommend } from '../../src/recommend.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { profileFor } from '../../src/yourmeta/facing.js';
import {
  FIXTURES_DIR,
  REPO_ROOT,
  haveStaticData,
  loadFixtureCsv,
  loadStaticData,
} from '../fixtures.js';

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
const summary = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, 'community-meta-sample.json'), 'utf8'),
);
const window = { since: summary.since, until: summary.until, label: 'This meta' };

describe.skipIf(!ready)('community weighting end to end', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const deps = { data, sim };

  it('a summary with nothing measured weights the columns in PvPoke order', () => {
    const empty = { battles: 0, devices: 0, species: [], tournament: null };
    const view = new MatrixView(data.matrix);
    const prior = profileFor(data, view, { kind: 'prior' });
    const community = profileFor(data, view, {
      kind: 'community',
      source: 'all',
      summary: empty,
      window,
    });
    const order = (w: Map<string, number>): string[] =>
      [...new Set(view.opponents)].sort(
        (a, b) => (w.get(b) ?? 0) - (w.get(a) ?? 0) || a.localeCompare(b),
      );
    expect(order(community.weights)).toEqual(order(prior.weights));
    const rec = recommend(
      specimens,
      { facing: { kind: 'community', source: 'all', summary: empty, window } },
      deps,
    );
    expect(rec.assumptions.source).toBe('all');
    expect(rec.assumptions.facing).toMatch(/0% measured$/);
  });

  it('a measured summary changes the weighting and says so', () => {
    const rec = recommend(
      specimens,
      { facing: { kind: 'community', source: 'ladder', summary, window } },
      deps,
    );
    expect(rec.assumptions.facing).toMatch(/^Weighted by GBL play: 1,240 battles from 18 devices/);
    expect(rec.teams.length).toBeGreaterThanOrEqual(3);
  });
});
