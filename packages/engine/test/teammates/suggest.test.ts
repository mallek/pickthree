import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { suggestTeammates } from '../../src/teammates/suggest.js';
import { toSpecimens } from '../../src/collection/specimen.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { MatrixView } from '../../src/search/matrixView.js';
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

  it('covers only what the pin and the earlier fills do not already beat', () => {
    const data = loadStaticData();
    const view = new MatrixView(data.matrix);
    const s11 = view.scenarioIndex([1, 1]);
    const result = suggestTeammates(
      [{ kind: 'species', id: 'azumarill' }, null, null],
      [],
      { gameMaster: readGameMaster(), characters: ['safest'] },
      deps(),
    );

    const first = result.suggestions[0];
    expect(first).toBeDefined();
    const beaten = [...view.wins(view.rowOf('azumarill') as number, s11)];
    for (const f of first!.fills) {
      const wins = view.wins(view.rowOf(f.speciesId) as number, s11);
      for (const id of f.covers) {
        const o = view.opponentIndex(id);
        // Nobody before this fill beat it, and this fill does.
        expect(beaten[o]).toBe(false);
        expect(wins[o]).toBe(true);
      }
      wins.forEach((w, o) => {
        beaten[o] = beaten[o] || w;
      });
    }
    expect(first!.fills[0]?.covers.length).toBeGreaterThan(0);
    expect(first!.fills[0]?.line).toContain('Azumarill');
  });

  it('builds stand-ins for the top of the rankings only, and for the pin wherever it sits', () => {
    // Slaking is rank 1145 of 1146. Building every stand-in to reach it costs a second, and the
    // player who pins it is exactly the player this feature is for.
    const result = suggestTeammates(
      [{ kind: 'species', id: 'slaking' }, null, null],
      [],
      { gameMaster: readGameMaster(), characters: ['safest'] },
      deps(),
    );

    expect(result.stats.standIns).toBeLessThanOrEqual(250);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0]?.fills).toHaveLength(2);
  });

  it('says out loud when the favorite is weak, with the real numbers', () => {
    const result = suggestTeammates(
      [{ kind: 'species', id: 'slaking' }, null, null],
      [],
      { gameMaster: readGameMaster(), characters: ['safest'] },
      deps(),
    );

    expect(result.pinLine).toBeTruthy();
    expect(result.pinLine).toContain('Slaking');
    expect(result.pinLine).toMatch(/beats \d+ of \d+/);
    expect(result.pinLine).toContain('Great League');
    // Said once, then built around anyway.
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('stays quiet when the favorite holds its own', () => {
    const result = suggestTeammates(
      [{ kind: 'species', id: 'azumarill' }, null, null],
      [],
      { gameMaster: readGameMaster(), characters: ['safest'] },
      deps(),
    );

    expect(result.pinLine).toBeNull();
  });

  it('buys a cheaper core without giving away the meta', () => {
    const result = suggestTeammates(
      [{ kind: 'species', id: 'skarmory' }, null, null],
      collection(),
      { gameMaster: readGameMaster(), characters: ['safest', 'cheapest'] },
      deps(),
    );

    const safest = result.suggestions.find((s) => s.character === 'safest');
    const cheapest = result.suggestions.find((s) => s.character === 'cheapest');
    expect(safest).toBeDefined();
    expect(cheapest).toBeDefined();
    expect(cheapest!.cost).toBeLessThan(safest!.cost);
    // Cheap must not mean useless. A core that saves dust by covering nothing is a trap, not a
    // suggestion, so it may give up at most a fifth of what the safest core covers.
    expect(cheapest!.coverage).toBeGreaterThanOrEqual(Math.floor(safest!.coverage * 0.8));
  });

  it('keeps a chase pick in its own tier rather than slipping it into the caught one', () => {
    const result = suggestTeammates(
      [{ kind: 'species', id: 'skarmory' }, null, null],
      collection(),
      { gameMaster: readGameMaster(), characters: ['safest'] },
      deps(),
    );

    const safest = result.suggestions.find((s) => s.character === 'safest');
    expect(safest).toBeDefined();
    expect(safest!.chase).toBe(false);
    // The fixture collection can fill both slots, so tier 1 owes the player nothing it lacks.
    expect(safest!.fills.every((f) => !f.standIn)).toBe(true);

    const chase = result.suggestions.filter((s) => s.chase);
    expect(chase.length).toBeLessThanOrEqual(1);
    for (const c of chase) {
      expect(c.fills.filter((f) => f.standIn)).toHaveLength(1);
    }
  });

  it('does not call a forced stand-in a chase when there is no collection', () => {
    const result = suggestTeammates(
      [{ kind: 'species', id: 'azumarill' }, null, null],
      [],
      { gameMaster: readGameMaster(), characters: ['safest'] },
      deps(),
    );

    expect(result.suggestions.every((s) => !s.chase)).toBe(true);
    expect(result.suggestions[0]?.fills.every((f) => f.standIn)).toBe(true);
  });

  it('prefers the third that players actually run with the pair', () => {
    const result = suggestTeammates(
      [{ kind: 'species', id: 'azumarill' }, null, { kind: 'species', id: 'registeel' }],
      [],
      {
        gameMaster: readGameMaster(),
        characters: ['community'],
        community: [
          { species: ['azumarill', 'registeel'], thirds: [{ speciesId: 'mandibuzz', sightings: 40 }] },
        ],
      },
      deps(),
    );

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.fills[0]?.speciesId).toBe('mandibuzz');
    expect(result.suggestions[0]?.sightings).toBe(40);
  });

  it('drops the community chip when the board has nothing for the pair', () => {
    const result = suggestTeammates(
      [{ kind: 'species', id: 'azumarill' }, null, { kind: 'species', id: 'registeel' }],
      [],
      { gameMaster: readGameMaster(), characters: ['safest', 'community'], community: [] },
      deps(),
    );

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.every((s) => s.character !== 'community')).toBe(true);
    expect(result.suggestions.every((s) => s.sightings === null)).toBe(true);
  });

  it('simulates one row for a pin PvPoke does not rank, then reads it like any other', () => {
    const data = loadStaticData();
    const sim = new PvPokeSimulator(loadPvPokeInNode(readGameMaster()));
    const result = suggestTeammates(
      [{ kind: 'species', id: 'magikarp' }, null, null],
      [],
      { gameMaster: readGameMaster(), characters: ['safest'] },
      { data, sim },
    );

    // One row of sims, not a team search: the exception the spec allows, and no more.
    expect(result.stats.simulatedRows).toBe(1);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.pinLine).toContain('Magikarp');
    expect(result.pinLine).toMatch(/beats \d+ of \d+/);
  });

  it('names a Pokemon once even when the meta group lists it twice', () => {
    // PvPoke's Great League group has 48 entries but 46 species: Shadow Forretress and Shadow
    // Quagsire each appear twice, with different movesets. Two columns, one Pokemon to a player.
    for (const pin of ['skarmory', 'azumarill', 'registeel']) {
      const result = suggestTeammates(
        [{ kind: 'species', id: pin }, null, null],
        collection(),
        { gameMaster: readGameMaster() },
        deps(),
      );
      for (const s of result.suggestions) {
        for (const f of s.fills) {
          expect(new Set(f.covers).size).toBe(f.covers.length);
        }
      }
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
