import { describe, expect, it } from 'vitest';
import { suggestTeammates } from '../../src/teammates/suggest.js';
import { toSpecimens } from '../../src/collection/specimen.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import type { BattleSimulator } from '../../src/sim/BattleSimulator.js';
import type { EngineDeps } from '../../src/recommend.js';
import { haveStaticData, loadFixtureCsv, loadStaticData, readGameMaster } from '../fixtures.js';

const run = haveStaticData() ? describe : describe.skip;

/**
 * The button is matrix only. A simulator that throws proves it: every pin here is one PvPoke
 * ranks, so nothing should ever reach the sim.
 */
const noSim: BattleSimulator = {
  simulate() {
    throw new Error('the suggestion ran a battle simulation');
  },
};

function deps(): EngineDeps {
  return { data: loadStaticData(), sim: noSim };
}

function collection() {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  return toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index).specimens;
}

const coreOf = (s: { fills: { speciesId: string }[] }): string =>
  s.fills
    .map((f) => f.speciesId)
    .sort()
    .join('+');

run('suggestTeammates', () => {
  it('fills the empty slots and never suggests the pin back', () => {
    const result = suggestTeammates(
      [{ kind: 'species', id: 'azumarill' }, null, null],
      [],
      { gameMaster: readGameMaster() },
      deps(),
    );

    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const s of result.suggestions) {
      expect(s.fills.map((f) => f.slot)).toEqual([1, 2]);
      expect(s.fills.map((f) => f.speciesId)).not.toContain('azumarill');
      expect(new Set(s.fills.map((f) => f.speciesId)).size).toBe(2);
    }
  });

  it('fills only the one empty slot when two are pinned', () => {
    const result = suggestTeammates(
      [{ kind: 'species', id: 'azumarill' }, null, { kind: 'species', id: 'registeel' }],
      [],
      { gameMaster: readGameMaster() },
      deps(),
    );

    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const s of result.suggestions) {
      expect(s.fills).toHaveLength(1);
      expect(s.fills[0]?.slot).toBe(1);
      expect(['azumarill', 'registeel']).not.toContain(s.fills[0]?.speciesId);
    }
  });

  it('gives every character its own core, and never repeats one', () => {
    const result = suggestTeammates(
      [{ kind: 'species', id: 'azumarill' }, null, null],
      collection(),
      { gameMaster: readGameMaster(), characters: ['safest', 'cheapest', 'antimeta'] },
      deps(),
    );

    const cores = result.suggestions.map(coreOf);
    expect(cores.length).toBeGreaterThan(1);
    expect(new Set(cores).size).toBe(cores.length);
    expect(result.suggestions[0]?.character).toBe('safest');
    for (const s of result.suggestions) {
      expect(['safest', 'cheapest', 'antimeta']).toContain(s.character);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });
});
