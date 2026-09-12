import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadPvPokeInNode } from '../src/node-host.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const gmPath =
  process.env.PICKTHREE_PVPOKE_DIR !== undefined
    ? path.join(process.env.PICKTHREE_PVPOKE_DIR, 'src', 'data', 'gamemaster.json')
    : path.resolve(here, '..', '..', 'data', '.pvpoke', 'src', 'data', 'gamemaster.json');
const havePvPoke = fs.existsSync(gmPath);

describe.skipIf(!havePvPoke)('node host', () => {
  const gamemaster = JSON.parse(fs.readFileSync(gmPath, 'utf8')) as unknown;
  const rt = loadPvPokeInNode(gamemaster);

  it('exposes a loaded GameMaster', () => {
    expect(rt.gm.data.pokemon.length).toBeGreaterThan(1500);
    expect(rt.gm.getPokemonById('azumarill')?.speciesName).toBe('Azumarill');
    const ice = rt.gm.getMoveById('ICE_BEAM');
    expect(ice.category).toBe('charged');
    expect(ice.energy).toBe(55);
  });

  it('constructs a Battle and default-IV Pokemon at 1500', () => {
    const battle = new rt.Battle();
    battle.setCP(1500);
    battle.setLevelCap(50);
    battle.setCup('all');
    const azu = new rt.Pokemon('azumarill', 0, battle);
    azu.initialize(1500);
    expect(azu.cp).toBeLessThanOrEqual(1500);
    expect(azu.cp).toBeGreaterThan(1480);
    expect(azu.ivs).toEqual({ atk: 4, def: 15, hp: 13 });
    expect(azu.level).toBe(43);
  });

  it('does not share state between two runtimes', () => {
    const rt2 = loadPvPokeInNode(gamemaster);
    expect(rt2.gm).not.toBe(rt.gm);
  });
});
