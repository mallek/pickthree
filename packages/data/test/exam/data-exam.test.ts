import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BattleData, LeagueData, MoveData, SpeciesData } from '@pickthree/battle';
import { createPvPokeContext } from '@pickthree/sim-pvpoke';
import { diffCups, diffData, type PvPokeCups } from '../../src/exam/data-exam.js';
import { toPvPokeMoveId, toPvPokeSpeciesId } from '../../src/exam/idmap.js';
import { pvpokeToBattleData } from '../../src/exam/convert.js';
import { GAMEMASTER_PATH } from '../../src/paths.js';
import { liveBattleData } from '../live-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MECHANICS_PATH = path.resolve(here, '..', '..', 'src', 'exam', 'pvpoke-mechanics.yaml');

describe('idmap', () => {
  const ids = new Set([
    'azumarill',
    'rattata_alolan',
    'meowth_galarian',
    'growlithe_hisuian',
    'wooper_paldean',
    'mimikyu',
    'minior_meteor',
    'minior_core',
  ]);
  it('prefers an exact match', () => {
    expect(toPvPokeSpeciesId('azumarill', ids)).toBe('azumarill');
    expect(toPvPokeSpeciesId('minior_meteor', ids)).toBe('minior_meteor');
  });
  it('rewrites regional and form suffixes in order', () => {
    expect(toPvPokeSpeciesId('rattata_alola', ids)).toBe('rattata_alolan');
    expect(toPvPokeSpeciesId('meowth_galarian', ids)).toBe('meowth_galarian');
    expect(toPvPokeSpeciesId('wooper_paldea', ids)).toBe('wooper_paldean');
    expect(toPvPokeSpeciesId('mimikyu_disguised', ids)).toBe('mimikyu');
    expect(toPvPokeSpeciesId('minior', ids)).toBe('minior_meteor');
    expect(toPvPokeSpeciesId('minior_red', ids)).toBe('minior_core');
  });
  it('returns null when nothing matches', () => {
    expect(toPvPokeSpeciesId('unown_a', ids)).toBeNull();
    expect(toPvPokeSpeciesId('nidoran', ids)).toBeNull();
  });
  it('strips a trailing _FAST from move ids', () => {
    expect(toPvPokeMoveId('THUNDER_SHOCK_FAST')).toBe('THUNDER_SHOCK');
    expect(toPvPokeMoveId('DIVE')).toBe('DIVE');
    expect(toPvPokeMoveId('FAST_FORWARD')).toBe('FAST_FORWARD');
  });
});

function move(id: string, over: Partial<MoveData> = {}): MoveData {
  return {
    id,
    type: 'electric',
    category: 'fast',
    power: 3,
    energy: 0,
    energyGain: 9,
    turns: 1,
    ...over,
  };
}

function sp(id: string, over: Partial<SpeciesData> = {}): SpeciesData {
  return {
    id,
    dex: 1,
    family: id,
    baseStats: { atk: 112, def: 152, hp: 225 },
    types: ['water', 'fairy'],
    fast: ['BUBBLE'],
    charged: ['ICE_BEAM'],
    eliteFast: [],
    eliteCharged: [],
    shadow: null,
    tags: [],
    ...over,
  };
}

function data(over: {
  species?: Record<string, SpeciesData>;
  moves?: Record<string, MoveData>;
  settings?: Partial<BattleData['settings']>;
}): BattleData {
  return {
    version: 1,
    source: { kind: 'datamine', commit: 'c', date: '2026-01-01' },
    settings: {
      stab: 1.2,
      fastBonus: 1.3,
      chargedBonus: 1.3,
      shadowAtk: 1.2,
      shadowDef: 0.83,
      maxEnergy: 100,
      roundTurns: 480,
      stages: { min: -1, max: 1, atk: [0.5, 1, 2], def: [0.5, 1, 2] },
      ...over.settings,
    },
    types: ['water'],
    effectiveness: [[1]],
    cpm: [0.1, 0.2],
    moves: over.moves ?? {},
    species: over.species ?? {},
    leagues: {},
    mechanics: {},
  };
}

describe('diffData', () => {
  it('reports nothing for equal data', () => {
    const a = data({ species: { azumarill: sp('azumarill') }, moves: { A: move('A') } });
    const d = diffData(a, a);
    expect(d.onlyOurs).toEqual([]);
    expect(d.onlyTheirs).toEqual([]);
    expect(d.species).toEqual([]);
    expect(d.moves).toEqual([]);
    expect(d.settings).toEqual([]);
  });

  it('lists only-ours and only-theirs ids, mapping through idmap', () => {
    const ours = data({
      species: {
        azumarill: sp('azumarill'),
        rattata_alola: sp('rattata_alola'),
        ours_only: sp('ours_only'),
      },
      moves: { THUNDER_SHOCK_FAST: move('THUNDER_SHOCK_FAST'), OURS_FAST: move('OURS_FAST') },
    });
    const theirs = data({
      species: {
        azumarill: sp('azumarill'),
        rattata_alolan: sp('rattata_alolan'),
        theirs_only: sp('theirs_only'),
      },
      moves: { THUNDER_SHOCK: move('THUNDER_SHOCK'), THEIRS: move('THEIRS') },
    });
    const d = diffData(ours, theirs);
    expect(d.onlyOurs).toEqual(['species ours_only', 'move OURS_FAST']);
    expect(d.onlyTheirs).toEqual(['species theirs_only', 'move THEIRS']);
    expect(d.species).toEqual([]);
    expect(d.moves).toEqual([]);
  });

  it('gives exactly one line per differing field', () => {
    const ours = data({
      species: { azumarill: sp('azumarill', { baseStats: { atk: 113, def: 152, hp: 225 } }) },
      moves: { THUNDER_SHOCK_FAST: move('THUNDER_SHOCK_FAST', { energyGain: 9 }) },
      settings: { stab: 1.2000000476837158 },
    });
    const theirs = data({
      species: { azumarill: sp('azumarill') },
      moves: { THUNDER_SHOCK: move('THUNDER_SHOCK', { energyGain: 8 }) },
    });
    const d = diffData(ours, theirs);
    expect(d.species).toEqual(['species azumarill: baseStats.atk ours 113 pvpoke 112']);
    expect(d.moves).toEqual(['moves THUNDER_SHOCK: energyGain ours 9 pvpoke 8']);
    expect(d.settings).toEqual(['settings stab: ours 1.2000000476837158 pvpoke 1.2']);
    expect(d.summary).toContain('1 species');
  });

  it('compares the CPM table and the stage tables', () => {
    const ours = data({});
    const theirs = data({});
    theirs.cpm = [0.1, 0.25];
    theirs.settings.stages = { min: -1, max: 1, atk: [0.5, 1, 2], def: [0.5, 1, 3] };
    const d = diffData(ours, theirs);
    expect([...d.settings].sort()).toEqual([
      'settings cpm[level 1.5]: ours 0.2 pvpoke 0.25',
      'settings stages.def[stage 1]: ours 2 pvpoke 3',
    ]);
  });

  it('treats a PvPoke _shadow entry as the shadow flag of its base', () => {
    const shadow = { charged: 'FRUSTRATION', purifiedCharged: 'RETURN' };
    const ours = data({ species: { azumarill: sp('azumarill', { shadow }) } });
    const theirs = data({
      species: { azumarill: sp('azumarill', { shadow }), azumarill_shadow: sp('azumarill_shadow') },
    });
    const d = diffData(ours, theirs);
    expect(d.onlyTheirs).toEqual([]);
    expect(d.species).toEqual([]);
  });
});

describe('diffCups', () => {
  const cups: PvPokeCups = {
    cups: [
      {
        name: 'all',
        title: 'All',
        include: [],
        exclude: [{ filterType: 'id', values: ['a', 'b'] }],
      },
      {
        name: 'spring',
        title: 'Spring',
        include: [{ filterType: 'type', values: ['grass', 'water'] }],
        exclude: [],
      },
      { name: 'pvponly', title: 'Only', include: [], exclude: [] },
    ],
    formats: [
      { cup: 'all', cp: 1500 },
      { cup: 'spring', cp: 1500 },
      { cup: 'pvponly', cp: 1500 },
    ],
  };
  function league(id: string, cpCap: number, types: string[] | null, banned: string[]): LeagueData {
    return {
      id,
      title: id,
      enabled: true,
      leagueType: 'x',
      pokemonCount: 3,
      cpCap,
      maxLevel: null,
      unique: false,
      allowMegas: false,
      types,
      allowed: null,
      banned: banned.map((family) => ({ family, forms: null })),
      caughtWindow: null,
    };
  }
  it('maps ids, compares cap, types and bans, and lists unmapped both ways', () => {
    const leagues = {
      vs_seeker_great: league('vs_seeker_great', 1500, null, ['a']),
      vs_seeker_spring_great: league('vs_seeker_spring_great', 1500, ['grass'], []),
      mystery: league('mystery', 1500, null, []),
    };
    const out = diffCups(leagues, cups);
    expect(out.diffs).toEqual([
      'cups vs_seeker_great ~ all: banned only pvpoke b',
      'cups vs_seeker_spring_great ~ spring: types ours grass pvpoke grass,water',
    ]);
    expect(out.onlyOurs).toEqual(['league mystery']);
    expect(out.onlyTheirs).toEqual(['cup pvponly']);
  });
});

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);
if (!havePvPoke && process.env.PICKTHREE_REQUIRE_PVPOKE === '1') {
  throw new Error('PvPoke checkout missing. Run npm run data:fetch');
}
const ours = havePvPoke ? liveBattleData() : null;

describe.skipIf(!havePvPoke || ours === null)('diffData live', () => {
  it('maps more than 90 percent of PvPoke species to ours', () => {
    if (ours === null) {
      return;
    }
    const gamemaster = JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8')) as unknown;
    const ctx = createPvPokeContext(gamemaster);
    const theirs = pvpokeToBattleData(ctx, fs.readFileSync(MECHANICS_PATH, 'utf8'), 'test');
    const d = diffData(ours, theirs);
    const total = Object.keys(theirs.species).length;
    const missing = d.onlyTheirs.filter((l) => l.startsWith('species ')).length;
    expect((total - missing) / total).toBeGreaterThan(0.9);
  });
});
