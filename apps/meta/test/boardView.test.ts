import { describe, expect, it } from 'vitest';
import type { BoardRow } from '../src/teamRank.js';
import { multiTeamOnly, sortRows, subLine, teamsSeen } from '../src/boardView.js';

function makeRow(species: string[], over: Partial<BoardRow> = {}): BoardRow {
  return {
    species,
    order: null,
    kind: species.length === 2 ? 'core' : 'team',
    source: 'observed',
    strength: 70,
    projection: 0.5,
    outsideSlice: [],
    weightCovered: 1,
    runBattles: 0,
    runWins: 0,
    runLosses: 0,
    facedBattles: 0,
    facedWins: 0,
    facedLosses: 0,
    decided: 0,
    measured: null,
    say: 0,
    score: 0.5,
    moves: species.map(() => null),
    builds: [],
    ...over,
  };
}

/** A complete team nested under a core, observed unless told otherwise. */
function build(third: string, over: Partial<BoardRow> = {}): BoardRow {
  return makeRow(['a', 'b', third], over);
}

describe('sortRows', () => {
  it('leaves the ranked order exactly as the board built it', () => {
    const rows = [makeRow(['a', 'b'], { strength: 10 }), makeRow(['c', 'd'], { strength: 90 })];
    expect(sortRows(rows, 'ranked').map((r) => r.species[0])).toEqual(['a', 'c']);
  });

  it('never mutates the array it was given', () => {
    const rows = [makeRow(['a', 'b'], { strength: 10 }), makeRow(['c', 'd'], { strength: 90 })];
    sortRows(rows, 'matchup');
    expect(rows.map((r) => r.species[0])).toEqual(['a', 'c']);
  });

  it('orders by matchup score, highest first', () => {
    const rows = [
      makeRow(['a', 'b'], { strength: 10 }),
      makeRow(['c', 'd'], { strength: 90 }),
      makeRow(['e', 'f'], { strength: 50 }),
    ];
    expect(sortRows(rows, 'matchup').map((r) => r.species[0])).toEqual(['c', 'e', 'a']);
  });

  it('puts a row with no projection last under the matchup sort', () => {
    const rows = [makeRow(['a', 'b'], { strength: null }), makeRow(['c', 'd'], { strength: 20 })];
    expect(sortRows(rows, 'matchup').map((r) => r.species[0])).toEqual(['c', 'a']);
  });

  it('orders by usage, run and faced battles together', () => {
    const rows = [
      makeRow(['a', 'b'], { runBattles: 5, facedBattles: 1 }),
      makeRow(['c', 'd'], { runBattles: 0, facedBattles: 40 }),
      makeRow(['e', 'f'], { runBattles: 12, facedBattles: 0 }),
    ];
    expect(sortRows(rows, 'usage').map((r) => r.species[0])).toEqual(['c', 'e', 'a']);
  });

  it('orders by spread, counting only the complete teams actually seen', () => {
    const rows = [
      makeRow(['a', 'b'], { builds: [build('x'), build('y')] }),
      // Three builds, but every one of them is a projection, so nobody has been seen in any.
      makeRow(['c', 'd'], {
        builds: [
          build('x', { source: 'generated' }),
          build('y', { source: 'generated' }),
          build('z', { source: 'generated' }),
        ],
      }),
      makeRow(['e', 'f'], { builds: [build('x'), build('y'), build('z')] }),
    ];
    expect(sortRows(rows, 'spread').map((r) => r.species[0])).toEqual(['e', 'a', 'c']);
  });

  it('keeps the ranked order as the tie break, so a sort never shuffles equal rows', () => {
    const rows = [
      makeRow(['a', 'b'], { strength: 50 }),
      makeRow(['c', 'd'], { strength: 50 }),
      makeRow(['e', 'f'], { strength: 50 }),
    ];
    expect(sortRows(rows, 'matchup').map((r) => r.species[0])).toEqual(['a', 'c', 'e']);
  });
});

describe('multiTeamOnly', () => {
  it('drops a core seen in only one complete team', () => {
    const rows = [
      makeRow(['a', 'b'], { builds: [build('x')] }),
      makeRow(['c', 'd'], { builds: [build('x'), build('y')] }),
    ];
    expect(multiTeamOnly(rows).map((r) => r.species[0])).toEqual(['c']);
  });

  it('drops a core whose only builds are projections', () => {
    const rows = [
      makeRow(['a', 'b'], {
        builds: [build('x', { source: 'generated' }), build('y', { source: 'generated' })],
      }),
    ];
    expect(multiTeamOnly(rows)).toEqual([]);
  });

  it('leaves a complete team row alone: it is one team by definition', () => {
    const rows = [makeRow(['a', 'b', 'c'])];
    expect(multiTeamOnly(rows).map((r) => r.species[2])).toEqual(['c']);
  });
});

describe('teamsSeen', () => {
  it('counts observed builds only', () => {
    const row = makeRow(['a', 'b'], {
      builds: [build('x'), build('y', { source: 'generated' })],
    });
    expect(teamsSeen(row)).toBe(1);
  });
});

describe('subLine', () => {
  it('says a generated row is a projection and nothing else', () => {
    expect(subLine(makeRow(['a', 'b', 'c'], { source: 'generated' }))).toBe('Projected');
  });

  it('gives a run-only row its record straight', () => {
    expect(
      subLine(makeRow(['a', 'b', 'c'], { runBattles: 42, runWins: 26, runLosses: 16, decided: 42 })),
    ).toBe('Run 42 / 26-16');
  });

  /** The worker counts a faced row's wins for the TEAM, so the players' own record is the
   * inverse. The collapsed line says whose record it is rather than leaving it to be guessed. */
  it("gives a faced-only row the players' own record, inverted and labelled", () => {
    expect(
      subLine(
        makeRow(['a', 'b', 'c'], {
          facedBattles: 37,
          facedWins: 25,
          facedLosses: 12,
          decided: 37,
        }),
      ),
    ).toBe('Faced 37 / players 12-25');
  });

  it("gives a run-and-faced row the team's own record, labelled", () => {
    expect(
      subLine(
        makeRow(['a', 'b', 'c'], {
          runBattles: 10,
          runWins: 7,
          runLosses: 3,
          facedBattles: 37,
          facedWins: 25,
          facedLosses: 12,
          decided: 47,
        }),
      ),
    ).toBe('Seen 47 / team 32-15');
  });

  it('says so when a row was seen but no result was recorded', () => {
    expect(subLine(makeRow(['a', 'b', 'c'], { runBattles: 3, decided: 0 }))).toBe(
      'Seen 3 / no result',
    );
  });

  it('adds the count of complete teams a core has been seen in', () => {
    const row = makeRow(['a', 'b'], {
      runBattles: 42,
      runWins: 26,
      runLosses: 16,
      decided: 42,
      builds: [build('x'), build('y')],
    });
    expect(subLine(row)).toBe('Run 42 / 26-16 / 2 teams');
  });

  it('says "1 team" rather than "1 teams"', () => {
    const row = makeRow(['a', 'b'], {
      runBattles: 42,
      runWins: 26,
      runLosses: 16,
      decided: 42,
      builds: [build('x')],
    });
    expect(subLine(row)).toBe('Run 42 / 26-16 / 1 team');
  });

  it('leaves the team count off a core nobody has been seen complete with', () => {
    const row = makeRow(['a', 'b'], {
      runBattles: 42,
      runWins: 26,
      runLosses: 16,
      decided: 42,
      builds: [build('x', { source: 'generated' })],
    });
    expect(subLine(row)).toBe('Run 42 / 26-16');
  });

  it('stays 7-bit ASCII', () => {
    const row = makeRow(['a', 'b'], {
      runBattles: 1200,
      runWins: 700,
      runLosses: 500,
      decided: 1200,
      builds: [build('x'), build('y')],
    });
    expect(subLine(row)).toMatch(/^[\x20-\x7e]*$/);
  });
});
