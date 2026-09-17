import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { buildsFor, DEFAULT_BUILD_OPTIONS } from '../../src/builds/eligibility.js';
import { toSpecimens } from '../../src/collection/specimen.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { faceoff } from '../../src/yourmeta/faceoff.js';
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

describe.skipIf(!ready)('faceoff: one opponent against the set team', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);

  it('lists likely moves with counts, a badge per move per member, and a shield grid', () => {
    const r = faceoff(
      data,
      { species: ['tinkaton', 'azumarill', 'clodsire'] },
      [],
      'medicham',
      sim,
    );
    expect(r.ranked).toBe(true);
    expect(r.moves[0]?.countFromFast).toBeNull();
    expect(r.moves.length).toBeGreaterThanOrEqual(3);
    expect(r.moves.length).toBeLessThanOrEqual(4);
    expect(r.moves[0]?.recommended).toBe(true);
    for (const m of r.moves.slice(1)) {
      expect(m.countFromFast).toBeGreaterThan(0);
    }
    expect(r.members).toHaveLength(3);
    expect(r.battles).toBe(27);
    for (const m of r.members) {
      expect(m.realIvs).toBe(false);
      expect(m.cells).toHaveLength(r.moves.length);
      expect(m.grid).toHaveLength(9);
      for (const rating of m.grid) {
        expect(rating).toBeGreaterThanOrEqual(0);
        expect(rating).toBeLessThanOrEqual(1000);
      }
      expect(m.wins).toBe(m.grid.filter((x) => x > 500).length);
      expect(m.verdict).toBe(m.wins === 9 ? 'wins' : m.wins === 0 ? 'loses' : 'shields');
    }
    // Medicham's fighting moves: Water/Fairy Azumarill resists them; Fairy/Steel Tinkaton
    // resists with one type and is weak with the other, so they land neutral.
    const fighting = r.moves.findIndex((m) => m.type === 'fighting');
    expect(fighting).toBeGreaterThanOrEqual(0);
    expect(r.members[0]?.cells[fighting]?.efficacy).toBe('neutral');
    expect(r.members[1]?.cells[fighting]?.efficacy).toBe('resisted');
    expect(r.best).not.toBeNull();
    const best = r.members[r.best as number]!;
    for (const m of r.members) {
      expect(best.wins).toBeGreaterThanOrEqual(m.wins);
    }
  });

  it('runs a member at its real IVs when the set team came from the collection', () => {
    const owned = specimens.find((s) =>
      buildsFor(s, index, DEFAULT_BUILD_OPTIONS).some((b) => b.speciesId === s.speciesId),
    )!;
    const r = faceoff(
      data,
      {
        species: [owned.speciesId, 'azumarill', 'clodsire'],
        specimenIds: [owned.id, 'missing-1', 'missing-2'],
      },
      specimens,
      'medicham',
      sim,
    );
    expect(r.members[0]?.realIvs).toBe(true);
    expect(r.members[0]?.specimenId).toBe(owned.id);
    expect(r.members[1]?.realIvs).toBe(false);
    expect(r.members[1]?.specimenId).toBeNull();
  });

  it('copes with an opponent PvPoke does not rank', () => {
    const r = faceoff(
      data,
      { species: ['tinkaton', 'azumarill', 'clodsire'] },
      [],
      'magikarp',
      sim,
    );
    expect(r.ranked).toBe(false);
    expect(r.moves.length).toBeGreaterThanOrEqual(2);
    expect(r.members.every((m) => m.verdict === 'wins')).toBe(true);
  });
});
