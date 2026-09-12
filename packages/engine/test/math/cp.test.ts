import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { cpFor, maxLevelUnderCap, statsFor } from '../../src/math/cp.js';
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

describe.skipIf(!haveStaticData())('cp math', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const azu = index.mustSpecies('azumarill').baseStats;

  it('computes azumarill at its PvPoke default spread', () => {
    const cp = cpFor(azu, { atk: 4, def: 15, sta: 13 }, 43);
    expect(cp).toBeGreaterThan(1480);
    expect(cp).toBeLessThanOrEqual(1500);
  });

  it('finds the max level under 1500 for that spread', () => {
    expect(maxLevelUnderCap(azu, { atk: 4, def: 15, sta: 13 }, 1500, 50)).toBe(43);
    expect(maxLevelUnderCap(azu, { atk: 4, def: 15, sta: 13 }, 1500, 40)).toBe(40);
  });

  it('returns null when even level 1 is over the cap', () => {
    const slaking = index.mustSpecies('slaking').baseStats;
    expect(maxLevelUnderCap(slaking, { atk: 15, def: 15, sta: 15 }, 500, 50, 20)).toBe(null);
    expect(maxLevelUnderCap(slaking, { atk: 15, def: 15, sta: 15 }, 500, 50)).toBeGreaterThan(1);
  });

  it('floors hp and never drops under 10', () => {
    const s = statsFor(azu, { atk: 0, def: 0, sta: 0 }, 1);
    expect(Number.isInteger(s.hp)).toBe(true);
    expect(s.hp).toBeGreaterThanOrEqual(10);
  });
});

describe.skipIf(!haveStaticData() || !fs.existsSync(gmPath))('cp math agrees with PvPoke', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const rt = loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8')));

  it('matches Pokemon.calculateCP for several species, spreads and levels', () => {
    const cases: [string, { atk: number; def: number; sta: number }, number][] = [
      ['azumarill', { atk: 4, def: 15, sta: 13 }, 43],
      ['medicham', { atk: 7, def: 15, sta: 14 }, 49],
      ['tinkaton', { atk: 0, def: 15, sta: 15 }, 30.5],
      ['registeel', { atk: 15, def: 15, sta: 15 }, 22],
      ['rookidee', { atk: 15, def: 14, sta: 13 }, 1],
    ];
    for (const [id, ivs, level] of cases) {
      const battle = new rt.Battle();
      battle.setCP(1500);
      battle.setLevelCap(50);
      battle.setCup('all');
      const p = new rt.Pokemon(id, 0, battle);
      p.setIV('atk', ivs.atk);
      p.setIV('def', ivs.def);
      p.setIV('hp', ivs.sta);
      p.setLevel(level, true);
      expect(cpFor(index.mustSpecies(id).baseStats, ivs, level), id).toBe(p.cp);
      expect(statsFor(index.mustSpecies(id).baseStats, ivs, level).hp, id).toBe(p.stats.hp);
    }
  });
});
