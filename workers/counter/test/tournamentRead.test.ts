import { describe, expect, it } from 'vitest';
import type { BattleRow } from '../src/battles.js';
import type { EventRow, RosterRow, TournamentBattleRow } from '../src/tournamentStore.js';
import {
  eventDetail,
  eventList,
  mergedTeams,
  mirrorRows,
  speciesTournamentBlock,
  tournamentBlock,
  tournamentSpeciesDetail,
  tournamentSummary,
  tournamentTeams,
} from '../src/tournamentRead.js';
import fixture from '../../../fixtures/tournament-sample.json' with { type: 'json' };
import { parseBattlesBody, parseEventBody, parseRosterBody } from '../src/tournament.js';
import {
  createTournamentTables,
  getEvent,
  putBattles,
  putEvent,
  putRoster,
  readEventsInWindow,
  readEventRoster,
  readTournamentBattles,
} from '../src/tournamentStore.js';
import { sqliteShim } from './sqliteShim.js';

const NOW = new Date('2026-09-21T00:00:00.000Z');
const WINDOW = { since: '2026-09-01T00:00:00.000Z', until: '2026-10-01T00:00:00.000Z' };

function event(over: Partial<EventRow> = {}): EventRow {
  return {
    id: 'e1',
    name: 'Crown City',
    startDate: '2026-09-18',
    endDate: '2026-09-20',
    league: 'great',
    cup: 'championshipseries',
    vods: [],
    notes: null,
    received: NOW.toISOString(),
    ...over,
  };
}

function battle(over: Partial<TournamentBattleRow> = {}): TournamentBattleRow {
  return {
    id: 'b1',
    event: 'e1',
    league: 'great',
    cup: 'championshipseries',
    at: '2026-09-18T15:00:00.000Z',
    day: 1,
    stage: 'groups',
    group: 'A',
    roundLabel: 'ROUND 1',
    match: 'day1-1',
    game: 1,
    matchFormat: 'bo3',
    bracket: 'winners',
    bracketDepth: 1,
    leftPlayer: 'ARCWARDEN',
    rightPlayer: 'BLUEKITE',
    leftTeam: ['altaria', 'clodsire', 'melmetal'],
    rightTeam: ['azumarill', 'medicham', 'lanturn'],
    leftForms: ['rk9', 'rk9', 'rk9'],
    rightForms: ['rk9', 'rk9', 'rk9'],
    winnerSide: 'left',
    resultSource: 'banner',
    scoreAtStart: [0, 0],
    evidence: [],
    notes: null,
    source: 'broadcast',
    extractor: 'test',
    received: NOW.toISOString(),
    ...over,
  };
}

describe('mirrorRows', () => {
  it('makes two BattleRow views, each side as the reporter, with no device', () => {
    const [left, right] = mirrorRows(battle());
    expect(left!.team).toEqual(['altaria', 'clodsire', 'melmetal']);
    expect(left!.opponents).toEqual(['azumarill', 'medicham', 'lanturn']);
    expect(left!.result).toBe('win');
    expect(right!.team).toEqual(['azumarill', 'medicham', 'lanturn']);
    expect(right!.result).toBe('loss');
    expect(left!.device).toBe('');
    expect(left!.source).toBe('broadcast');
    expect(left!.tanked).toBe(false);
    expect(left!.band).toBeNull();
  });

  it('gives both sides a null result when the broadcast never showed one', () => {
    const [left, right] = mirrorRows(battle({ winnerSide: null, resultSource: null }));
    expect(left!.result).toBeNull();
    expect(right!.result).toBeNull();
  });
});

describe('tournamentBlock', () => {
  it('counts a battle once, and inverts wins the way the ladder does', () => {
    const block = tournamentBlock('great', [battle()], [event()]);
    expect(block.events).toBe(1);
    expect(block.battles).toBe(1);
    expect(block.eventsOther).toBe(0);
    const altaria = block.species.find((s) => s.speciesId === 'altaria')!;
    // Altaria is on the left, which WON, so the record against Altaria is 0-1.
    expect(altaria).toEqual({
      speciesId: 'altaria',
      picks: 1,
      game1Picks: 1,
      wins: 0,
      losses: 1,
      unresolvedForms: 0,
    });
    const azumarill = block.species.find((s) => s.speciesId === 'azumarill')!;
    expect(azumarill.wins).toBe(1);
    expect(azumarill.losses).toBe(0);
  });

  it('counts a sighting and no result when nobody won', () => {
    const block = tournamentBlock(
      'great',
      [battle({ winnerSide: null, resultSource: null })],
      [event()],
    );
    const altaria = block.species.find((s) => s.speciesId === 'altaria')!;
    expect(altaria.picks).toBe(1);
    expect(altaria.wins + altaria.losses).toBe(0);
  });

  it('counts an unresolved form under the base id and says how many', () => {
    const block = tournamentBlock(
      'great',
      [battle({ leftForms: ['unresolved', 'rk9', 'rk9'] })],
      [event()],
    );
    expect(block.species.find((s) => s.speciesId === 'altaria')!.unresolvedForms).toBe(1);
  });

  it('separates only game one picks', () => {
    const block = tournamentBlock('great', [battle(), battle({ id: 'b2', game: 2 })], [event()]);
    const altaria = block.species.find((s) => s.speciesId === 'altaria')!;
    expect(altaria.picks).toBe(2);
    expect(altaria.game1Picks).toBe(1);
  });

  it('shows an event on another cup in eventsOther and never in the species list', () => {
    const other = event({ id: 'e2', cup: 'laic2027' });
    const block = tournamentBlock(
      'great',
      [battle(), battle({ id: 'b2', event: 'e2', cup: 'laic2027', leftTeam: ['registeel'], leftForms: ['rk9'] })],
      [event(), other],
    );
    expect(block.events).toBe(1);
    expect(block.battles).toBe(1);
    expect(block.eventsOther).toBe(1);
    expect(block.species.some((s) => s.speciesId === 'registeel')).toBe(false);
  });

  it('blends nothing for a league with no Play! format', () => {
    const block = tournamentBlock(
      'ultra',
      [battle({ league: 'ultra', cup: 'championshipseries' })],
      [event({ league: 'ultra' })],
    );
    expect(block.events).toBe(0);
    expect(block.battles).toBe(0);
    expect(block.eventsOther).toBe(1);
    expect(block.species).toEqual([]);
  });
});

describe('tournamentSummary', () => {
  it('returns the MetaSummaryV1 shape with no devices and a broadcast source count', () => {
    const s = tournamentSummary({
      league: 'great',
      ...WINDOW,
      source: 'tournament',
      rows: [battle(), battle({ id: 'b2', game: 2, winnerSide: 'right' })],
      events: [event()],
      now: NOW,
    });
    expect(s.source).toBe('tournament');
    expect(s.battles).toBe(2);
    expect(s.devices).toBe(0);
    expect(s.sources).toEqual({ broadcast: 2 });
    expect(s.bands).toEqual({});
    expect(s.previous).toBeNull();
    const altaria = s.species.find((x) => x.speciesId === 'altaria')!;
    // Picked in both battles: one sighting and one run each, from the two mirrored views.
    expect(altaria.sightings).toBe(2);
    expect(altaria.runs).toBe(2);
    // Left won the first and lost the second, so the record AGAINST Altaria is 1-1 and its own
    // run record is the mirror of that.
    expect([altaria.wins, altaria.losses]).toEqual([1, 1]);
    expect([altaria.runWins, altaria.runLosses]).toEqual([1, 1]);
    expect(s.tournament).not.toBeNull();
    expect(s.tournament!.battles).toBe(2);
  });
});

describe('tournamentTeams and mergedTeams', () => {
  it('puts both sides on the board, as a run row and a faced row each', () => {
    const b = tournamentTeams({
      league: 'great',
      ...WINDOW,
      source: 'tournament',
      rows: [battle()],
      now: NOW,
    });
    expect(b.battles).toBe(1);
    expect(b.devices).toBe(0);
    expect(b.sources).toEqual({ broadcast: 1 });
    const left = b.teams.find((t) => t.species.join('+') === ['altaria', 'clodsire', 'melmetal'].sort().join('+'))!;
    expect(left.runBattles).toBe(1);
    expect(left.runWins).toBe(1);
    expect(left.facedBattles).toBe(1);
    expect(left.facedWins).toBe(1);
    const right = b.teams.find((t) => t.species.includes('azumarill'))!;
    expect(right.runBattles).toBe(1);
    expect(right.runLosses).toBe(1);
  });

  it('merges the two populations and says how many battles came from each', () => {
    const ladder: BattleRow = {
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
      source: 'ladder',
    };
    const b = mergedTeams({
      league: 'great',
      ...WINDOW,
      source: 'all',
      ladderRows: [ladder],
      rows: [battle()],
      now: NOW,
    });
    expect(b.battles).toBe(2);
    expect(b.devices).toBe(1);
    expect(b.sources).toEqual({ ladder: 1, broadcast: 1 });
    expect(b.teams.some((t) => t.species.includes('tinkaton'))).toBe(true);
    expect(b.teams.some((t) => t.species.includes('melmetal'))).toBe(true);
  });
});

describe('speciesTournamentBlock', () => {
  const roster: RosterRow[] = [
    { event: 'e1', player: 'ARCWARDEN', slot: 1, species: 'altaria', moves: { fast: 'DRAGON_BREATH', charged: ['MOONBLAST'] }, received: NOW.toISOString() },
    { event: 'e1', player: 'ARCWARDEN', slot: 2, species: 'clodsire', moves: null, received: NOW.toISOString() },
    { event: 'e1', player: 'BLUEKITE', slot: 1, species: 'altaria', moves: null, received: NOW.toISOString() },
    { event: 'e1', player: 'CINDERVANE', slot: 1, species: 'altaria', moves: { fast: 'DRAGON_BREATH', charged: ['MOONBLAST'] }, received: NOW.toISOString() },
  ];

  it('joins roster to broadcast: brought by, roster size, and picks on stream', () => {
    const block = speciesTournamentBlock({
      league: 'great',
      speciesId: 'altaria',
      rows: [battle()],
      roster,
    });
    expect(block.picks).toBe(1);
    expect(block.game1Picks).toBe(1);
    expect([block.wins, block.losses]).toEqual([0, 1]);
    expect(block.byDepth).toHaveLength(9);
    expect(block.byDepth[0]).toBe(1);
    // Two of the three roster players were on stream; both list Altaria.
    expect(block.rosterSize).toBe(2);
    expect(block.broughtBy).toBe(2);
    expect(block.pickedOnStream).toBe(1);
    expect(block.movesetsKnown).toBe(1);
    expect(block.movesets).toEqual([
      { fast: 'DRAGON_BREATH', charged: ['MOONBLAST'], entries: 1 },
    ]);
  });

  it('reports a species nobody picked as zero picks rather than as missing', () => {
    const block = speciesTournamentBlock({
      league: 'great',
      speciesId: 'registeel',
      rows: [battle()],
      roster,
    });
    expect(block.picks).toBe(0);
    expect(block.broughtBy).toBe(0);
    expect(block.pickedOnStream).toBe(0);
    expect(block.movesets).toEqual([]);
  });
});

describe('tournamentSpeciesDetail', () => {
  it('counts each battle once per week and zeroes the rank bands', () => {
    const d = tournamentSpeciesDetail({
      league: 'great',
      speciesId: 'altaria',
      ...WINDOW,
      source: 'tournament',
      rows: [battle(), battle({ id: 'b2', game: 2 })],
      roster: [],
      now: NOW,
    });
    expect(d.weekly).toHaveLength(1);
    expect(d.weekly[0]!.battles).toBe(2);
    expect(d.weekly[0]!.sightings).toBe(2);
    expect(d.bands.every((b) => b.sightings === 0)).toBe(true);
    expect(d.tournament!.picks).toBe(2);
  });
});

describe('eventList and eventDetail', () => {
  it('lists an event with its counts and whether it is blended', () => {
    const rows = [battle(), battle({ id: 'b2', game: 2, winnerSide: null, resultSource: null })];
    const other = event({ id: 'e2', cup: 'laic2027' });
    const list = eventList('great', [event(), other], [
      ...rows,
      battle({ id: 'b3', event: 'e2', cup: 'laic2027' }),
    ]);
    const first = list.find((e) => e.id === 'e1')!;
    expect(first.battles).toBe(2);
    expect(first.decided).toBe(1);
    expect(first.players).toBe(2);
    expect(first.blended).toBe(true);
    expect(list.find((e) => e.id === 'e2')!.blended).toBe(false);
  });

  it('groups an event detail by match, in game order, with the roster per player', () => {
    const detail = eventDetail(
      'great',
      event(),
      [battle(), battle({ id: 'b2', game: 2, winnerSide: 'right', scoreAtStart: [1, 0] })],
      [
        { event: 'e1', player: 'ARCWARDEN', slot: 1, species: 'altaria', moves: null, received: NOW.toISOString() },
      ],
    );
    expect(detail.matches).toHaveLength(1);
    expect(detail.matches[0]!.games.map((g) => g.game)).toEqual([1, 2]);
    expect(detail.matches[0]!.left).toBe('ARCWARDEN');
    expect(detail.matches[0]!.games[1]!.scoreAtStart).toEqual([1, 0]);
    expect(detail.roster).toEqual([
      { player: 'ARCWARDEN', species: [{ species: 'altaria', moves: null }] },
    ]);
    expect(detail.species.find((s) => s.speciesId === 'altaria')!.picks).toBe(2);
    expect(detail.species.find((s) => s.speciesId === 'altaria')!.broughtBy).toBe(1);
  });
});

describe('the synthetic event, end to end through the store', () => {
  it('rolls up into a block whose battle count matches the fixture', () => {
    const { sql, close } = sqliteShim();
    try {
      createTournamentTables(sql);
      const e = parseEventBody(fixture.event, fixture.id);
      const bs = parseBattlesBody(fixture.battles);
      const rs = parseRosterBody(fixture.roster);
      expect(e.ok && bs.ok && rs.ok).toBe(true);
      if (!e.ok || !bs.ok || !rs.ok) {
        return;
      }
      putEvent(sql, e.value, NOW.toISOString());
      putBattles(sql, getEvent(sql, fixture.id)!, bs.value.extractor, bs.value.battles, NOW.toISOString());
      putRoster(sql, fixture.id, rs.value.entries, NOW.toISOString());

      const rows = readTournamentBattles(sql, 'great', WINDOW.since, WINDOW.until);
      const events = readEventsInWindow(sql, 'great', WINDOW.since, WINDOW.until);
      expect(rows).toHaveLength(bs.value.battles.length);

      const block = tournamentBlock('great', rows, events);
      expect(block.events).toBe(1);
      expect(block.battles).toBe(rows.length);
      expect(block.eventsOther).toBe(0);
      // Every battle contributes up to six picks, so the total is at most six per battle and at
      // least two: the count is a real roll-up, not a constant.
      const picks = block.species.reduce((n, s) => n + s.picks, 0);
      expect(picks).toBeGreaterThan(rows.length * 2);
      expect(picks).toBeLessThanOrEqual(rows.length * 6);
      expect(block.species.some((s) => s.unresolvedForms > 0)).toBe(true);
      expect(block.species.some((s) => s.speciesId === 'mimikyu')).toBe(false);

      const roster = readEventRoster(sql, fixture.id);
      const top = block.species[0]!;
      const detail = speciesTournamentBlock({
        league: 'great',
        speciesId: top.speciesId,
        rows,
        roster,
      });
      expect(detail.picks).toBe(top.picks);
      expect(detail.rosterSize).toBeGreaterThan(0);
      expect(detail.broughtBy).toBeLessThanOrEqual(detail.rosterSize);
      expect(detail.movesetsKnown).toBeLessThanOrEqual(detail.broughtBy);
    } finally {
      close();
    }
  });
});
