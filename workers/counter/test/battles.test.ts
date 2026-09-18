import { describe, expect, it } from 'vitest';
import { aggregate, parseBatch, type BattleRow } from '../src/battles.js';

const device = '3b241101-e2bb-4255-8caf-4136c566a962';
const battle = {
  id: 'b1',
  league: 'great',
  season: 28,
  at: '2026-09-17T10:00:00Z',
  team: ['tinkaton', 'azumarill', 'clodsire'],
  opponents: ['medicham', 'medicham', 'dragonite_shadow'],
  result: 'win',
  tanked: false,
  band: 'ace',
};

describe('parseBatch', () => {
  it('accepts the shape the app sends and de-duplicates opponents', () => {
    const r = parseBatch({ device, client: 'pick3 a114140', battles: [battle] });
    expect(r).not.toBeNull();
    expect(r!.battles[0]!.opponents).toEqual(['medicham', 'dragonite_shadow']);
    expect(r!.battles[0]!.at).toBe('2026-09-17T10:00:00.000Z');
    expect(r!.battles[0]!.band).toBe('ace');
  });

  it('takes the moves each of the three ran, and refuses a malformed set', () => {
    const moves = [
      { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER', 'BULLDOZE'] },
      null,
      { fast: 'POISON_STING', charged: ['EARTHQUAKE', 'EARTHQUAKE'] },
    ];
    const r = parseBatch({ device, client: 'pick3', battles: [{ ...battle, moves }] });
    expect(r!.battles[0]!.moves).toEqual([
      { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER', 'BULLDOZE'] },
      null,
      { fast: 'POISON_STING', charged: ['EARTHQUAKE'] },
    ]);
    expect(
      parseBatch({ device, client: 'pick3', battles: [battle] })!.battles[0]!.moves,
    ).toBeNull();
    const bad = (m: unknown) =>
      parseBatch({ device, client: 'pick3', battles: [{ ...battle, moves: m }] });
    expect(bad([moves[0], moves[1]])).toBeNull();
    expect(bad([{ fast: 'fairy wind', charged: ['X'] }, null, null])).toBeNull();
    expect(bad([{ fast: 'FAIRY_WIND', charged: [] }, null, null])).toBeNull();
    expect(bad([{ fast: 'FAIRY_WIND', charged: ['A', 'B', 'C'] }, null, null])).toBeNull();
  });

  it('takes a missing band as null', () => {
    const { band: _b, ...noBand } = battle;
    void _b;
    const r = parseBatch({ device, client: 'pick3', battles: [noBand] });
    expect(r!.battles[0]!.band).toBeNull();
  });

  it('rejects anything off the shape, whole batch at a time', () => {
    const bad = (patch: Record<string, unknown>) =>
      parseBatch({ device, client: 'pick3', battles: [{ ...battle, ...patch }] });
    expect(bad({ team: ['tinkaton', 'azumarill'] })).toBeNull();
    expect(bad({ opponents: ['a', 'b', 'c', 'd'] })).toBeNull();
    expect(bad({ opponents: ['Medicham'] })).toBeNull();
    expect(bad({ result: 'draw' })).toBeNull();
    expect(bad({ band: 'god' })).toBeNull();
    expect(bad({ at: 'yesterday' })).toBeNull();
    expect(bad({ id: 'has spaces' })).toBeNull();
    expect(parseBatch({ device: 'me', client: 'pick3', battles: [battle] })).toBeNull();
    expect(parseBatch({ device, client: '', battles: [battle] })).toBeNull();
    expect(parseBatch({ device, client: 'pick3', battles: [] })).toBeNull();
    expect(
      parseBatch({ device, client: 'pick3', battles: Array.from({ length: 201 }, () => battle) }),
    ).toBeNull();
    expect(parseBatch({ device, client: 'pick3', battles: [battle, { nope: true }] })).toBeNull();
  });
});

describe('aggregate', () => {
  const row = (patch: Partial<BattleRow>): BattleRow => ({
    device,
    league: 'great',
    season: 28,
    at: '2026-09-17T10:00:00Z',
    team: ['tinkaton', 'azumarill', 'clodsire'],
    moves: null,
    opponents: ['medicham'],
    result: 'win',
    tanked: false,
    band: 'ace',
    ...patch,
  });

  it('rolls up the movesets reporters ran each species with', () => {
    const tink = { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER', 'BULLDOZE'] };
    const tinkSwapped = { fast: 'FAIRY_WIND', charged: ['BULLDOZE', 'GIGATON_HAMMER'] };
    const tinkOther = { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER'] };
    const s = aggregate('great', [
      row({ moves: [tink, null, null] }),
      row({ moves: [tinkSwapped, null, null] }),
      row({ moves: [tinkOther, null, null] }),
      row({ moves: [tink, null, null], tanked: true, result: null }),
    ]);
    expect(s.movesets['tinkaton']).toEqual([
      { fast: 'FAIRY_WIND', charged: ['BULLDOZE', 'GIGATON_HAMMER'], battles: 2 },
      { fast: 'FAIRY_WIND', charged: ['GIGATON_HAMMER'], battles: 1 },
    ]);
    expect(s.movesets['azumarill']).toBeUndefined();
  });

  it('counts sightings with the reporter record, rolls teams up in any order, skips tanked', () => {
    const s = aggregate('great', [
      row({}),
      row({ opponents: ['medicham', 'tinkaton'], result: 'loss', device: 'other' }),
      row({ team: ['clodsire', 'tinkaton', 'azumarill'], opponents: [], band: null }),
      row({ tanked: true, result: null, opponents: ['medicham'] }),
    ]);
    expect(s.battles).toBe(3);
    expect(s.tanked).toBe(1);
    expect(s.devices).toBe(2);
    expect(s.bands).toEqual({ ace: 2, unknown: 1 });
    expect(s.species[0]).toEqual({ speciesId: 'medicham', sightings: 2, wins: 1, losses: 1 });
    expect(s.species[1]).toEqual({ speciesId: 'tinkaton', sightings: 1, wins: 0, losses: 1 });
    expect(s.teams).toEqual([
      { species: ['azumarill', 'clodsire', 'tinkaton'], battles: 3, wins: 2, losses: 1 },
    ]);
  });
});
