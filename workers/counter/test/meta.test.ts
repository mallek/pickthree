import { describe, expect, it } from 'vitest';
import type { BattleRow } from '../src/battles.js';
import {
  MOVESET_MIN,
  bandRows,
  isoWeek,
  movesetsBySpecies,
  speciesDetail,
  summarize,
} from '../src/meta.js';

const NOW = new Date('2026-09-18T12:00:00.000Z');

function row(over: Partial<BattleRow> = {}): BattleRow {
  return {
    device: 'd1',
    league: 'great',
    season: 28,
    at: '2026-09-17T10:00:00.000Z',
    team: ['tinkaton', 'azumarill', 'clodsire'],
    moves: null,
    opponents: ['medicham', 'lanturn'],
    result: 'win',
    tanked: false,
    band: 'ace',
    ...over,
  };
}

const WINDOW = { since: '2026-09-11T00:00:00.000Z', until: '2026-09-18T00:00:00.000Z' };

function run(rows: BattleRow[], over: Partial<Parameters<typeof summarize>[0]> = {}) {
  return summarize({
    league: 'great',
    ...WINDOW,
    band: 'all',
    rows,
    previousRows: null,
    now: NOW,
    ...over,
  });
}

describe('bandRows', () => {
  it('keeps every row for "all" and filters to one band otherwise', () => {
    const rows = [row({ band: 'ace' }), row({ band: 'legend' }), row({ band: null })];
    expect(bandRows(rows, 'all')).toHaveLength(3);
    expect(bandRows(rows, 'legend')).toHaveLength(1);
    expect(bandRows(rows, 'ace')[0]!.band).toBe('ace');
  });
});

describe('summarize', () => {
  it('counts tanked battles separately and never lets them touch the records', () => {
    const s = run([row(), row({ tanked: true, result: null })]);
    expect(s.battles).toBe(1);
    expect(s.tanked).toBe(1);
    expect(s.species.find((x) => x.speciesId === 'medicham')!.sightings).toBe(1);
  });

  it('separates facing a species from running it', () => {
    const s = run([row(), row({ result: 'loss', opponents: ['tinkaton'] })]);
    const tink = s.species.find((x) => x.speciesId === 'tinkaton')!;
    expect(tink.sightings).toBe(1);
    expect(tink.wins).toBe(0);
    expect(tink.losses).toBe(1);
    expect(tink.runs).toBe(2);
    expect(tink.runWins).toBe(1);
    expect(tink.runLosses).toBe(1);
  });

  it('counts a device once however many battles it sends', () => {
    const s = run([row(), row({ device: 'd1' }), row({ device: 'd2' })]);
    expect(s.devices).toBe(2);
  });

  it('does not count a device whose only rows are tanked', () => {
    // A device that only ever tanked has shared nothing usable, and must not inflate the count
    // gating MEASURED_MIN_DEVICES or the "shared by N devices" line on the site.
    const s = run([row({ device: 'd1' }), row({ device: 'd2', tanked: true, result: null })]);
    expect(s.devices).toBe(1);
  });

  it('counts every band even when filtered to one', () => {
    const rows = [row({ band: 'ace' }), row({ band: 'legend' }), row({ band: null })];
    const s = run(rows, { band: 'legend' });
    expect(s.battles).toBe(1);
    expect(s.bands).toEqual({ ace: 1, legend: 1, unknown: 1 });
  });

  it('rolls the same three into one team whatever the order, sorted', () => {
    const s = run([row(), row({ team: ['clodsire', 'tinkaton', 'azumarill'], result: 'loss' })]);
    expect(s.teams).toHaveLength(1);
    expect(s.teams[0]!.species).toEqual(['azumarill', 'clodsire', 'tinkaton']);
    expect(s.teams[0]!.battles).toBe(2);
    expect(s.teams[0]!.wins).toBe(1);
    expect(s.teams[0]!.losses).toBe(1);
  });

  it('attaches a member moveset only once enough battles back it', () => {
    const moves: BattleRow['moves'] = [
      { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER', 'BULLDOZE'] },
      { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
      null,
    ];
    const many = Array.from({ length: MOVESET_MIN }, () => row({ moves }));
    const s = run([...many, row()]);
    const team = s.teams[0]!;
    // species is sorted: azumarill, clodsire, tinkaton
    expect(team.moves[0]!.fast).toBe('BUBBLE');
    expect(team.moves[1]).toBeNull();
    expect(team.moves[2]!.fast).toBe('FAIRY_WIND');
  });

  it('reports no trend until both windows are big enough', () => {
    const few = [row()];
    expect(run(few, { previousRows: few }).previous).toBeNull();
  });

  it('reports the previous window once both sides clear the bar', () => {
    const many = Array.from({ length: 200 }, (_, i) => row({ device: `d${i}` }));
    const prev = Array.from({ length: 200 }, (_, i) => row({ device: `p${i}` }));
    const s = run(many, { previousRows: prev });
    expect(s.previous!.battles).toBe(200);
    expect(s.previous!.species.find((x) => x.speciesId === 'medicham')!.sightings).toBe(200);
  });

  it('orders species by sightings and teams by battles, and caps the team list', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ opponents: ['medicham'] })),
      row({ opponents: ['lanturn'], team: ['umbreon', 'skarmory', 'furret'] }),
    ];
    const s = run(rows, { teamLimit: 1 });
    expect(s.species[0]!.speciesId).toBe('medicham');
    expect(s.teams).toHaveLength(1);
    expect(s.teams[0]!.battles).toBe(3);
  });

  it('carries the window, the band and the time it was made', () => {
    const s = run([row()]);
    expect(s).toMatchObject({ league: 'great', band: 'all', ...WINDOW });
    expect(s.generatedAt).toBe(NOW.toISOString());
  });
});

describe('movesetsBySpecies', () => {
  it('sorts a species sets by how often they were run and de-duplicates charged moves', () => {
    const a: BattleRow['moves'] = [
      { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
      null,
      null,
    ];
    const b: BattleRow['moves'] = [{ fast: 'BUBBLE', charged: ['HYDRO_PUMP'] }, null, null];
    const rows = [
      row({ team: ['azumarill', 'x', 'y'], moves: a }),
      row({ team: ['azumarill', 'x', 'y'], moves: a }),
      row({ team: ['azumarill', 'x', 'y'], moves: b }),
    ];
    const sets = movesetsBySpecies(rows).get('azumarill')!;
    expect(sets[0]).toEqual({ fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'], battles: 2 });
    expect(sets[1]!.battles).toBe(1);
  });
});

function detail(rows: BattleRow[], over: Partial<Parameters<typeof speciesDetail>[0]> = {}) {
  return speciesDetail({
    league: 'great',
    speciesId: 'medicham',
    ...WINDOW,
    band: 'all',
    rows,
    now: NOW,
    ...over,
  });
}

describe('isoWeek', () => {
  it('labels a date with its ISO week', () => {
    expect(isoWeek('2026-09-17T10:00:00.000Z')).toBe('2026-W38');
    expect(isoWeek('2026-01-01T00:00:00.000Z')).toBe('2026-W01');
  });
});

describe('speciesDetail', () => {
  it('reports the record facing it and the record running it', () => {
    const d = detail([
      row(),
      row({ result: 'loss' }),
      row({ team: ['medicham', 'lanturn', 'registeel'], opponents: ['azumarill'] }),
    ]);
    expect(d.sightings).toBe(2);
    expect(d.wins).toBe(1);
    expect(d.losses).toBe(1);
    expect(d.runs).toBe(1);
    expect(d.runWins).toBe(1);
  });

  it('buckets by ISO week, oldest first, with the window total beside it', () => {
    const d = detail([
      row({ at: '2026-09-10T10:00:00.000Z' }),
      row({ at: '2026-09-17T10:00:00.000Z', opponents: ['lanturn'] }),
      row({ at: '2026-09-17T11:00:00.000Z' }),
    ]);
    expect(d.weekly).toEqual([
      { week: '2026-W37', battles: 1, sightings: 1 },
      { week: '2026-W38', battles: 2, sightings: 1 },
    ]);
  });

  it('breaks the record down by band whatever the filter is', () => {
    const d = detail([row({ band: 'ace' }), row({ band: 'legend', result: 'loss' })], {
      band: 'ace',
    });
    expect(d.sightings).toBe(1);
    expect(d.bands).toEqual([
      { band: 'below', sightings: 0, wins: 0, losses: 0 },
      { band: 'ace', sightings: 1, wins: 1, losses: 0 },
      { band: 'veteran', sightings: 0, wins: 0, losses: 0 },
      { band: 'expert', sightings: 0, wins: 0, losses: 0 },
      { band: 'legend', sightings: 1, wins: 0, losses: 1 },
      { band: 'unknown', sightings: 0, wins: 0, losses: 0 },
    ]);
  });

  it('counts who else was seen in the same battles, never itself', () => {
    const d = detail([
      row({ opponents: ['medicham', 'lanturn'] }),
      row({ opponents: ['medicham', 'lanturn'] }),
      row({ opponents: ['medicham', 'registeel'] }),
    ]);
    expect(d.alongside).toEqual([
      { speciesId: 'lanturn', battles: 2 },
      { speciesId: 'registeel', battles: 1 },
    ]);
  });

  it('reports the sets reporters ran it with, most common first', () => {
    const moves: BattleRow['moves'] = [
      { fast: 'COUNTER', charged: ['ICE_PUNCH', 'PSYCHIC'] },
      null,
      null,
    ];
    const d = detail([row({ team: ['medicham', 'a', 'b'], moves })]);
    expect(d.movesets).toEqual([
      { fast: 'COUNTER', charged: ['ICE_PUNCH', 'PSYCHIC'], battles: 1 },
    ]);
  });

  it('answers with empty series for a species nobody saw', () => {
    const d = detail([row()], { speciesId: 'nosepass' });
    expect(d.sightings).toBe(0);
    expect(d.alongside).toEqual([]);
    expect(d.movesets).toEqual([]);
  });
});
