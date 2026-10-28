import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formStats, loadBattleData } from '@pickthree/battle';
import { createPvPokeContext } from '@pickthree/sim-pvpoke';
import { pvpokeToBattleData } from '../../src/exam/convert.js';
import type { PvPokeGmPokemon } from '../../src/exam/pvpoke-types.js';
import { GAMEMASTER_PATH } from '../../src/paths.js';

// Live, invariants only: the converted data is compared to PvPoke itself, never to pinned numbers.

const here = path.dirname(fileURLToPath(import.meta.url));
const MECHANICS_PATH = path.resolve(here, '..', '..', 'src', 'exam', 'pvpoke-mechanics.yaml');

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);
if (!havePvPoke && process.env.PICKTHREE_REQUIRE_PVPOKE === '1') {
  throw new Error('PvPoke checkout missing. Run npm run data:fetch');
}

const FAMILIES = ['aegislash', 'cramorant', 'mimikyu', 'minior', 'morpeko'];
const IVS = { atk: 7, def: 11, hp: 13 };
const LEVEL = 20;
const SAMPLE = [
  'azumarill',
  'medicham',
  'aegislash_blade',
  'minior_meteor',
  'mimikyu_busted',
  'registeel',
];

describe.skipIf(!havePvPoke)('pvpokeToBattleData', () => {
  const gamemaster = JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8')) as unknown;
  const ctx = createPvPokeContext(gamemaster);
  const data = pvpokeToBattleData(ctx, fs.readFileSync(MECHANICS_PATH, 'utf8'), 'test-commit');
  const pokemon = ctx.runtime.gm.data.pokemon as unknown as PvPokeGmPokemon[];

  it('is accepted by loadBattleData and marked as PvPoke-sourced', () => {
    expect(loadBattleData(JSON.parse(JSON.stringify(data)) as unknown)).toBeDefined();
    expect(data.source.kind).toBe('pvpoke');
    expect(data.source.commit).toBe('test-commit');
  });

  it('carries every PvPoke species with base stats', () => {
    const withStats = pokemon.filter((p) => p.baseStats !== undefined);
    expect(withStats.length).toBeGreaterThan(1000);
    for (const p of withStats) {
      const s = data.species[p.speciesId];
      expect(s, p.speciesId).toBeDefined();
      expect(s?.baseStats).toEqual(p.baseStats);
      expect(s?.types).toEqual(p.types.filter((t) => t !== 'none'));
    }
  });

  it('has every move a species references', () => {
    for (const s of Object.values(data.species)) {
      for (const id of [...s.fast, ...s.charged, ...s.eliteFast, ...s.eliteCharged]) {
        expect(data.moves[id], `${s.id} -> ${id}`).toBeDefined();
      }
    }
  });

  it('gives every move the category PvPoke itself reads', () => {
    // Not always the list it sits in: PvPoke reads Ditto's TRANSFORM (energyGain 0) as charged.
    for (const m of Object.values(data.moves)) {
      expect(m.category, m.id).toBe(ctx.runtime.gm.getMoveById(m.id).category);
    }
  });

  it('has an 18 x 18 effectiveness table that agrees with PvPoke', () => {
    expect(data.types.length).toBe(18);
    expect(data.effectiveness.length).toBe(18);
    for (const row of data.effectiveness) {
      expect(row.length).toBe(18);
    }
    const calc = ctx.evaluate<{ getEffectiveness(a: string, d: string[]): number }>(
      'DamageCalculator',
    );
    data.types.forEach((a, i) => {
      data.types.forEach((d, j) => {
        expect(data.effectiveness[i]?.[j]).toBe(calc.getEffectiveness(a, [d]));
      });
    });
  });

  it('gives the five form families their mechanics, each form under its family', () => {
    expect(Object.keys(data.mechanics).sort()).toEqual(FAMILIES);
    for (const family of FAMILIES) {
      const forms = Object.values(data.species).filter((s) => s.family === family);
      expect(forms.length, family).toBeGreaterThan(1);
    }
  });

  it('never states an animation (PvPoke has no turn cost for a form change)', () => {
    const effects = Object.values(data.mechanics).flatMap((e) => e.rules.flatMap((r) => r.do));
    expect(effects.filter((e) => e.effect === 'animate')).toEqual([]);
  });

  it('formStats at level 20 equals PvPoke for the same IVs and level', () => {
    const battle = new ctx.runtime.Battle();
    battle.setCP(10000);
    for (const id of SAMPLE) {
      const poke = new ctx.runtime.Pokemon(id, 0, battle);
      poke.setLevel(LEVEL, false);
      poke.setIV('atk', IVS.atk);
      poke.setIV('def', IVS.def);
      poke.setIV('hp', IVS.hp);
      expect(poke.level, id).toBe(LEVEL);
      const ours = formStats(data, id, IVS, LEVEL);
      expect(ours.atk, `${id} atk`).toBe(poke.stats.atk);
      expect(ours.def, `${id} def`).toBe(poke.stats.def);
      expect(ours.hp, `${id} hp`).toBe(poke.stats.hp);
    }
  });

  it('settings come from PvPoke', () => {
    expect(data.settings.stab).toBe(ctx.evaluate<number>('DamageMultiplier.STAB'));
    expect(data.settings.fastBonus).toBe(ctx.evaluate<number>('DamageMultiplier.BONUS'));
    expect(data.settings.chargedBonus).toBe(data.settings.fastBonus);
    const { min, max, atk, def } = data.settings.stages;
    expect(max).toBe(-min);
    expect(atk.length).toBe(max - min + 1);
    expect(def).toEqual(atk);
    expect(atk[-min]).toBe(1);
  });
});
