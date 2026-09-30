import { describe, expect, it } from 'vitest';
import { coreBoards, coreRowKind, hasExactlyOneMega } from '../../src/coldstart/coreBoards.js';
import type { CoreRowOut } from '../../src/coldstart/coreBoards.js';
import type { BattleSimulator } from '../../src/sim/BattleSimulator.js';
import { haveStaticData, loadIndex, loadStaticData, readGameMaster } from '../fixtures.js';

describe('coreRowKind and hasExactlyOneMega (plain data)', () => {
  const isMega = (id: string): boolean => id.includes('_mega');

  it('counts exactly one Mega in a trio', () => {
    expect(hasExactlyOneMega(['a', 'b', 'c_mega'], isMega)).toBe(true);
    expect(hasExactlyOneMega(['a', 'b', 'c'], isMega)).toBe(false);
    expect(hasExactlyOneMega(['a_mega', 'b_mega', 'c'], isMega)).toBe(false);
  });

  it('a core with no Mega on the Mega board gets Mega flex thirds', () => {
    expect(coreRowKind(['a', 'b'], ['c_mega', 'd_mega'], isMega, true)).toEqual({
      flexKind: 'mega',
      megaInCore: null,
    });
  });

  it('a core holding a Mega gets regular flex thirds and names the Mega', () => {
    expect(coreRowKind(['a_mega', 'b'], ['c', 'd'], isMega, true)).toEqual({
      flexKind: 'regular',
      megaInCore: 'a_mega',
    });
  });

  it('is always regular off the Mega board', () => {
    expect(coreRowKind(['a', 'b'], ['c', 'd'], isMega, false)).toEqual({
      flexKind: 'regular',
      megaInCore: null,
    });
  });
});

/** Every re-simulated battle is a loss, so a drifted row can only get weaker. */
const losingSim: BattleSimulator = {
  simulate: () => ({ rating: 0, opRating: 1000, winner: 1, turnsToWin: [0, 0] }),
};

describe.skipIf(!haveStaticData())('coreBoards on the built data', () => {
  const data = loadStaticData();
  const index = loadIndex();
  const make = (mega: boolean) =>
    coreBoards({
      league: data.league,
      index,
      matrix: data.matrix,
      rankings: data.rankings,
      gameMaster: readGameMaster(),
      weights: new Map(),
      sim: losingSim,
      mega,
    });
  const boards = make(true);
  const base = (id: string): string => index.baseOf(index.teamSpeciesOf(id));
  const isMega = (id: string): boolean => index.teamSpeciesOf(id) !== id;
  const key = (ids: readonly string[]): string => [...ids].sort().join('+');

  for (const name of ['top', 'budget'] as const) {
    describe(`${name} board`, () => {
      const rows: CoreRowOut[] = boards[name];

      it('has five rows, headline strengths non-increasing', () => {
        expect(rows).toHaveLength(5);
        for (let i = 1; i < rows.length; i++) {
          expect(rows[i - 1]!.flex[0]!.team.team.strength).toBeGreaterThanOrEqual(
            rows[i]!.flex[0]!.team.team.strength,
          );
        }
      });

      it('lists 1 to 4 flex options, strongest first, each holding both core species', () => {
        for (const r of rows) {
          expect(r.flex.length).toBeGreaterThanOrEqual(1);
          expect(r.flex.length).toBeLessThanOrEqual(4);
          for (let i = 1; i < r.flex.length; i++) {
            expect(r.flex[i - 1]!.team.team.strength).toBeGreaterThanOrEqual(
              r.flex[i]!.team.team.strength,
            );
          }
          const coreIds = r.core.map((c) => c.build.speciesId);
          for (const f of r.flex) {
            for (const id of coreIds) {
              expect(f.team.team.species).toContain(id);
            }
            expect(f.team.members.map((c) => c.build.speciesId)).toEqual(f.team.team.species);
          }
        }
      });

      it('has flex thirds distinct by base species', () => {
        for (const r of rows) {
          const bases = r.flex.map((f) => base(f.third.build.speciesId));
          expect(new Set(bases).size).toBe(bases.length);
        }
      });

      it('never shows a team twice across rows', () => {
        const seen = new Set<string>();
        for (const r of rows) {
          for (const f of r.flex) {
            const k = key(f.team.team.species);
            expect(seen.has(k)).toBe(false);
            seen.add(k);
          }
        }
      });

      it('uses each base species as a core member in at most two rows, never the same core pair', () => {
        const uses = new Map<string, number>();
        const pairs = new Set<string>();
        for (const r of rows) {
          const bases = r.core.map((c) => base(c.build.speciesId));
          for (const b of bases) {
            uses.set(b, (uses.get(b) ?? 0) + 1);
          }
          const pk = key(bases);
          expect(pairs.has(pk)).toBe(false);
          pairs.add(pk);
        }
        for (const n of uses.values()) {
          expect(n).toBeLessThanOrEqual(2);
        }
      });
    });
  }

  it('builds the budget board with no Elite TM moves', () => {
    for (const r of boards.budget) {
      for (const f of r.flex) {
        for (const c of f.team.members) {
          expect(c.moveset.eliteTmCount).toBe(0);
        }
      }
    }
  });

  it('has no Mega board when the league does not allow Megas', () => {
    expect(make(false).mega).toBeNull();
  });

  // Vacuous on a stale local data build with no Mega league (boards.mega is empty); it binds in CI.
  it('keeps the Mega board to one Mega per team with consistent flex kinds', () => {
    for (const r of boards.mega ?? []) {
      const coreIds = r.core.map((c) => c.build.speciesId);
      const coreMegas = coreIds.filter(isMega);
      for (const f of r.flex) {
        expect(f.team.team.species.filter(isMega)).toHaveLength(1);
        expect(f.team.megaId).not.toBeNull();
      }
      expect(r.flexKind === 'regular').toBe(coreMegas.length > 0);
      if (coreMegas.length > 0) {
        expect(r.megaInCore).toBe(coreMegas[0]);
      } else {
        expect(r.megaInCore).toBeNull();
      }
      if (r.flexKind === 'mega') {
        for (const f of r.flex) {
          expect(isMega(f.third.build.speciesId)).toBe(true);
        }
      }
    }
  });
});
