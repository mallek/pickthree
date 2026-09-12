import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGameData } from '../src/build-gamedata.js';
import { GAMEMASTER_PATH } from '../src/paths.js';

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);
if (!havePvPoke && process.env.PICKTHREE_REQUIRE_PVPOKE === '1') {
  throw new Error('PvPoke checkout missing. Run npm run data:fetch');
}

describe.skipIf(!havePvPoke)('buildGameData', () => {
  const gm = JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8')) as unknown;
  const data = buildGameData(gm);

  it('normalizes azumarill', () => {
    const azu = data.species.find((s) => s.speciesId === 'azumarill');
    expect(azu).toBeDefined();
    expect(azu?.baseStats).toEqual({ atk: 112, def: 152, hp: 225 });
    expect(azu?.types).toEqual(['water', 'fairy']);
    expect(azu?.familyId).toBe('FAMILY_MARILL');
    expect(azu?.parentId).toBe('marill');
    expect(azu?.shadow).toBe(false);
    expect(azu?.thirdMoveCost).toBe(50000);
  });

  it('links evolutions from parent pointers', () => {
    const marill = data.species.find((s) => s.speciesId === 'marill');
    expect(marill?.evolutionIds).toContain('azumarill');
  });

  it('marks shadow variants and elite moves', () => {
    const q = data.species.find((s) => s.speciesId === 'quagsire_shadow');
    expect(q?.shadow).toBe(true);
    expect(q?.eliteMoves).toContain('AQUA_TAIL');
  });

  it('flags great league ineligible species', () => {
    const mewtwo = data.species.find((s) => s.speciesId === 'mewtwo');
    expect(mewtwo?.greatLeagueIneligible).toBe(true);
  });

  it('normalizes moves with buffs', () => {
    const ice = data.moves.find((m) => m.moveId === 'ICE_BEAM');
    expect(ice).toMatchObject({ type: 'ice', power: 90, energy: 55, energyGain: 0, turns: 1 });
    const acid = data.moves.find((m) => m.moveId === 'ACID_SPRAY');
    expect(acid?.buffs).toEqual([0, -2]);
    expect(acid?.buffTarget).toBe('opponent');
    expect(acid?.buffApplyChance).toBe(1);
  });

  it('carries scenarios, settings and timestamp', () => {
    const slugs = data.rankingScenarios.map((s) => s.slug);
    for (const slug of ['leads', 'closers', 'switches', 'chargers']) {
      expect(slugs).toContain(slug);
    }
    expect(data.settings).toEqual({ maxBuffStages: 4, buffDivisor: 4 });
    expect(data.gamemasterTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
