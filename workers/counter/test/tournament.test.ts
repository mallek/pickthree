import { describe, expect, it } from 'vitest';
import {
  OPEN_EQUIVALENT_CUP,
  parseBattlesBody,
  parseEventBody,
  parseRosterBody,
} from '../src/tournament.js';
import fixture from '../../../fixtures/tournament-sample.json' assert { type: 'json' };

const event = {
  name: '2027 Baltimore Pokemon GO Regional Championships',
  startDate: '2026-09-18',
  endDate: '2026-09-20',
  league: 'great',
  cup: 'championshipseries',
  vods: ['v2878411375', 'v2879365540'],
  notes: null,
};

const battle = {
  id: 'v2878411375-051',
  at: '2026-09-18T21:55:13Z',
  day: 1,
  stage: 'groups',
  group: 'G',
  roundLabel: 'LOSERS FINALS - GROUP G',
  match: 'day1-22',
  game: 1,
  matchFormat: 'bo3',
  bracket: 'losers',
  bracketDepth: 7,
  left: { player: 'ARCWARDEN', team: ['altaria', 'clodsire', 'melmetal'], forms: ['rk9', 'rk9', 'rk9'] },
  right: { player: 'BLUEKITE', team: ['corviknight', 'dunsparce'], forms: ['rk9', 'unresolved'] },
  winnerSide: null,
  resultSource: null,
  scoreAtStart: [0, 0],
  evidence: ['v2878411375_06-55-34_score_0-0.jpg'],
  notes: null,
};

const batch = { extractor: 'pogo-stream-spike 0.3', battles: [battle] };

describe('OPEN_EQUIVALENT_CUP', () => {
  it("matches the bake's own copy of the rule", () => {
    expect(OPEN_EQUIVALENT_CUP).toEqual({ great: 'championshipseries' });
  });
});

describe('parseEventBody', () => {
  it('accepts the shape the pipeline sends and stamps the id from the path', () => {
    const r = parseEventBody(event, '2027-baltimore-regional');
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.id).toBe('2027-baltimore-regional');
    expect(r.ok && r.value.vods).toEqual(['v2878411375', 'v2879365540']);
    expect(r.ok && r.value.notes).toBeNull();
  });

  it('rejects a bad id, a bad date and a non-ASCII name', () => {
    expect(parseEventBody(event, 'Baltimore 2027').ok).toBe(false);
    expect(parseEventBody({ ...event, startDate: '18/09/2026' }, 'e-1').ok).toBe(false);
    expect(parseEventBody({ ...event, name: 'Sao ' + String.fromCharCode(0xe3) + ' Paulo' }, 'e-1').ok).toBe(false);
    expect(parseEventBody({ ...event, vods: [''] }, 'e-1').ok).toBe(false);
    expect(parseEventBody({ ...event, league: 'Great' }, 'e-1').ok).toBe(false);
  });
});

describe('parseBattlesBody', () => {
  it('accepts a partial team, an unresolved form and a null winner', () => {
    const r = parseBattlesBody(batch);
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.battles[0]!.right.team).toEqual(['corviknight', 'dunsparce']);
    expect(r.ok && r.value.battles[0]!.right.forms).toEqual(['rk9', 'unresolved']);
    expect(r.ok && r.value.battles[0]!.winnerSide).toBeNull();
    expect(r.ok && r.value.battles[0]!.at).toBe('2026-09-18T21:55:13.000Z');
  });

  it('accepts a resolved result when both winner and source are set', () => {
    const r = parseBattlesBody({
      ...batch,
      battles: [{ ...battle, winnerSide: 'left', resultSource: 'banner' }],
    });
    expect(r.ok && r.value.battles[0]!.winnerSide).toBe('left');
  });

  it('rejects a record for shape, naming the offending index and reason', () => {
    const bad = (patch: Record<string, unknown>) =>
      parseBattlesBody({ ...batch, battles: [battle, { ...battle, id: 'x2', ...patch }] });
    for (const patch of [
      { left: { ...battle.left, forms: ['rk9'] } },
      { left: { ...battle.left, team: [] } },
      { left: { ...battle.left, team: ['a', 'b', 'c', 'd'], forms: ['rk9', 'rk9', 'rk9', 'rk9'] } },
      { left: { ...battle.left, player: '' } },
      { winnerSide: 'left' },
      { resultSource: 'banner' },
      { game: 0 },
      { game: 8 },
      { day: 4 },
      { bracketDepth: 10 },
      { stage: 'quarters' },
      { bracket: 'consolation' },
      { matchFormat: 'bo7' },
      { scoreAtStart: [0, 4] },
      { scoreAtStart: [0] },
      { at: 'yesterday' },
      { notes: 'x'.repeat(501) },
      { evidence: [''] },
    ]) {
      const r = bad(patch);
      expect(r.ok, JSON.stringify(patch)).toBe(false);
      expect(!r.ok && r.index).toBe(1);
      expect(!r.ok && r.reason.length).toBeGreaterThan(0);
    }
  });

  it('rejects an empty batch, an over-long batch and a missing extractor', () => {
    expect(parseBattlesBody({ ...batch, battles: [] }).ok).toBe(false);
    expect(
      parseBattlesBody({
        ...batch,
        battles: Array.from({ length: 201 }, (_, i) => ({ ...battle, id: `b${i}` })),
      }).ok,
    ).toBe(false);
    expect(parseBattlesBody({ battles: [battle] }).ok).toBe(false);
  });
});

describe('parseRosterBody', () => {
  const entries = [
    {
      player: 'FIRESTAR73',
      slot: 1,
      species: 'corsola_galarian',
      moves: { fast: 'ASTONISH', charged: ['NIGHT_SHADE', 'POWER_GEM'] },
    },
    { player: 'FIRESTAR73', slot: 2, species: 'jumpluff_shadow', moves: null },
  ];

  it('accepts entries with and without a moveset', () => {
    const r = parseRosterBody({ entries });
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.entries[1]!.moves).toBeNull();
    expect(r.ok && r.value.entries[0]!.moves!.charged).toEqual(['NIGHT_SHADE', 'POWER_GEM']);
  });

  it('rejects a bad slot, a bad species and a charged list of three', () => {
    const bad = (patch: Record<string, unknown>) =>
      parseRosterBody({ entries: [entries[0], { ...entries[1], ...patch }] });
    expect(bad({ slot: 0 }).ok).toBe(false);
    expect(bad({ slot: 7 }).ok).toBe(false);
    expect(bad({ species: 'Corsola' }).ok).toBe(false);
    expect(bad({ moves: { fast: 'ASTONISH', charged: ['A', 'B', 'C'] } }).ok).toBe(false);
    expect(bad({ moves: { fast: 'astonish', charged: ['A'] } }).ok).toBe(false);
    const r = bad({ slot: 0 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.index).toBe(1);
    expect(!r.ok && r.reason).toBe('bad slot');
  });
});

describe('the synthetic event fixture', () => {
  it('validates against every parser, with no real screen name in it', () => {
    expect(parseEventBody(fixture.event, fixture.id).ok).toBe(true);
    const battles = parseBattlesBody(fixture.battles);
    expect(battles.ok).toBe(true);
    expect(battles.ok && battles.value.battles.length).toBeGreaterThan(20);
    expect(parseRosterBody(fixture.roster).ok).toBe(true);
    // Invented handles only: caps and digits, the shape make-tournament.ts writes.
    for (const b of fixture.battles.battles) {
      expect(b.left.player).toMatch(/^[A-Z0-9]+$/);
      expect(b.right.player).not.toBe(b.left.player);
    }
  });
});
