import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGameData } from '../src/build-gamedata.js';
import { GAMEMASTER_PATH, RANKINGS_DIR } from '../src/paths.js';

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

import { pvpokeEvolutionStage } from '../src/build-gamedata.js';

describe('pvpokeEvolutionStage', () => {
  it('mirrors PvPoke, where any evolutions key counts, even without inferred children', () => {
    expect(pvpokeEvolutionStage(undefined)).toBe(0);
    expect(pvpokeEvolutionStage({ id: 'F' })).toBe(0);
    expect(pvpokeEvolutionStage({ id: 'F', evolutions: ['marill'] })).toBe(1);
    expect(pvpokeEvolutionStage({ id: 'F', parent: 'azurill', evolutions: ['azumarill'] })).toBe(2);
    expect(pvpokeEvolutionStage({ id: 'F', parent: 'marill' })).toBe(3);
  });
});

describe.skipIf(!fs.existsSync(GAMEMASTER_PATH))('evolution stage on live data', () => {
  it('puts every species PvPoke ranks in Little Cup at stage 1', () => {
    const file = path.join(RANKINGS_DIR, 'little', 'overall', 'rankings-500.json');
    const ranked = JSON.parse(fs.readFileSync(file, 'utf8')) as { speciesId: string }[];
    const data = buildGameData(JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8')) as unknown);
    const byId = new Map(data.species.map((s) => [s.speciesId, s]));
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      expect(byId.get(r.speciesId)?.evolutionStage, r.speciesId).toBe(1);
    }
  });
});
