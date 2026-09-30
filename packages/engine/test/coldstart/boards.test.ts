import { describe, expect, it } from 'vitest';
import {
  cupBoards,
  selectMegaRows,
  selectVaried,
  type BoardRow,
} from '../../src/coldstart/boards.js';
import type { BattleSimulator } from '../../src/sim/BattleSimulator.js';
import { haveStaticData, loadIndex, loadStaticData, readGameMaster } from '../fixtures.js';

type T = { id: number; species: string[]; mega?: string };
const t = (id: number, species: string[], mega?: string): T =>
  mega === undefined ? { id, species } : { id, species, mega };
const sp = (x: T): string[] => x.species;
const megaOf = (x: T): string | null => x.mega ?? null;
const count = (rows: T[], key: string): number =>
  rows.filter((r) => r.species.includes(key)).length;

describe('selectVaried', () => {
  it('caps any one Pokemon at two rows even when it is in every strong team', () => {
    const items = [
      t(1, ['kingdra', 'a', 'b']),
      t(2, ['kingdra', 'c', 'd']),
      t(3, ['kingdra', 'e', 'f']),
      t(4, ['kingdra', 'g', 'h']),
      t(5, ['i', 'j', 'k']),
      t(6, ['l', 'm', 'n']),
      t(7, ['o', 'p', 'q']),
    ];
    const rows = selectVaried(items, sp, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 2, 5, 6, 7]);
    expect(count(rows, 'kingdra')).toBe(2);
  });

  it('never lets two rows share two Pokemon', () => {
    const items = [t(1, ['a', 'b', 'c']), t(2, ['a', 'b', 'd']), t(3, ['a', 'e', 'f'])];
    expect(selectVaried(items, sp, { rows: 5, cap: 2 }).map((r) => r.id)).toEqual([1, 3]);
  });

  it('stops at the row limit and keeps strength order', () => {
    const items = Array.from({ length: 10 }, (_, i) => t(i, [`x${i}`, `y${i}`, `z${i}`]));
    expect(selectVaried(items, sp, { rows: 5, cap: 2 }).map((r) => r.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns fewer rows when the list runs out', () => {
    const items = [t(1, ['a', 'b', 'c']), t(2, ['a', 'b', 'd'])];
    expect(selectVaried(items, sp, { rows: 5, cap: 2 })).toHaveLength(1);
  });
});

describe('selectMegaRows', () => {
  it('gives each Mega one row, its strongest team that fits the cap', () => {
    const items = [
      t(1, ['charizard', 'kingdra', 'magnezone'], 'charizard_mega_y'),
      t(2, ['venusaur', 'kingdra', 'magnezone'], 'venusaur_mega'),
      t(3, ['blastoise', 'kingdra', 'magnezone'], 'blastoise_mega'),
      t(4, ['charizard', 'a', 'b'], 'charizard_mega_y'),
      t(5, ['blastoise', 'c', 'd'], 'blastoise_mega'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 5]);
    expect(new Set(rows.map((r) => r.mega)).size).toBe(rows.length);
  });

  it('ranks Megas by their best team and returns rows in strength order', () => {
    const items = [
      t(1, ['a', 'b', 'venusaur'], 'venusaur_mega'),
      t(2, ['c', 'd', 'charizard'], 'charizard_mega_x'),
      t(3, ['e', 'f', 'charizard'], 'charizard_mega_y'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('lets Mega X and Mega Y of one base share its two rows, never a third', () => {
    const items = [
      t(1, ['charizard', 'a', 'b'], 'charizard_mega_x'),
      t(2, ['charizard', 'c', 'd'], 'charizard_mega_y'),
      t(3, ['charizard', 'e', 'f'], 'charizard_mega_z'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it('ignores teams without a Mega and skips a Mega whose teams all break the cap', () => {
    const items = [
      t(1, ['k', 'a', 'venusaur'], 'venusaur_mega'),
      t(2, ['k', 'b', 'x']),
      t(3, ['k', 'c', 'blastoise'], 'blastoise_mega'),
      t(4, ['k', 'd', 'charizard'], 'charizard_mega_y'),
    ];
    const rows = selectMegaRows(items, sp, megaOf, { rows: 5, cap: 2 });
    expect(rows.map((r) => r.id)).toEqual([1, 3]);
  });
});

/** Every re-simulated battle is a loss, so a drifted row can only get weaker. */
const losingSim: BattleSimulator = {
  simulate: () => ({ rating: 0, opRating: 1000, winner: 1, turnsToWin: [0, 0] }),
};

describe.skipIf(!haveStaticData())('cupBoards on the built data', () => {
  const data = loadStaticData();
  const index = loadIndex();
  const boards = cupBoards({
    league: data.league,
    index,
    matrix: data.matrix,
    rankings: data.rankings,
    gameMaster: readGameMaster(),
    weights: new Map(),
    sim: losingSim,
    mega: true,
  });
  const base = (id: string): string => index.baseOf(index.teamSpeciesOf(id));
  const everyBoard = (): BoardRow[][] => [boards.top, boards.budget, boards.mega ?? []];

  it('gives Top and Budget five rows, strongest first', () => {
    for (const rows of [boards.top, boards.budget]) {
      expect(rows).toHaveLength(5);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1]!.team.strength).toBeGreaterThanOrEqual(rows[i]!.team.strength);
      }
    }
  });

  it('never puts one Pokemon on more than two rows of an image', () => {
    for (const rows of everyBoard()) {
      const uses = new Map<string, number>();
      for (const r of rows) {
        for (const id of r.team.species) {
          uses.set(base(id), (uses.get(base(id)) ?? 0) + 1);
        }
      }
      for (const n of uses.values()) {
        expect(n).toBeLessThanOrEqual(2);
      }
    }
  });

  it('lists members in the order the team is presented', () => {
    for (const rows of everyBoard()) {
      for (const r of rows) {
        expect(r.members.map((c) => c.build.speciesId)).toEqual(r.team.species);
      }
    }
  });

  it('builds the budget board with no Elite TM moves and re-simulates what changed', () => {
    for (const r of boards.budget) {
      for (const c of r.members) {
        expect(c.moveset.eliteTmCount).toBe(0);
      }
    }
    expect(boards.resimulated.budget.length).toBeGreaterThan(0);
  });

  it('gives the Mega board one Mega per row, each a different Mega', () => {
    const mega = boards.mega ?? [];
    for (const r of mega) {
      expect(r.megaId).not.toBeNull();
      const megas = r.team.species.filter((id) => index.teamSpeciesOf(id) !== id);
      expect(megas).toEqual([r.megaId]);
    }
    expect(new Set(mega.map((r) => r.megaId)).size).toBe(mega.length);
  });

  it('has no Mega board when the league does not allow Megas', () => {
    const plain = cupBoards({
      league: data.league,
      index,
      matrix: data.matrix,
      rankings: data.rankings,
      gameMaster: readGameMaster(),
      weights: new Map(),
      sim: losingSim,
      mega: false,
    });
    expect(plain.mega).toBeNull();
  });
});
