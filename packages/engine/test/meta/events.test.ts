import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RECENT_DAYS,
  champion,
  eventOngoing,
  eventPlayers,
  recentSince,
  shortEventName,
  vodOffset,
  vodUrl,
  type EventDetailV1,
  type EventGameV1,
  type EventMatchV1,
} from '../../src/meta/index.js';

interface FixtureSide {
  player: string;
  team: string[];
  forms: string[];
}
interface FixtureBattle {
  at: string;
  day: number;
  stage: string;
  group: string | null;
  roundLabel: string | null;
  match: string;
  game: number;
  matchFormat: string;
  bracket: string;
  bracketDepth: number;
  left: FixtureSide;
  right: FixtureSide;
  winnerSide: string | null;
  resultSource: string | null;
  scoreAtStart: [number, number];
  notes: string | null;
}
interface Fixture {
  id: string;
  event: Omit<EventDetailV1['event'], 'id' | 'received'>;
  battles: { battles: FixtureBattle[] };
  roster: {
    entries: {
      player: string;
      slot: number;
      species: string;
      moves: { fast: string; charged: string[] } | null;
    }[];
  };
}

/** The synthetic event in the worker's read shape (tournamentRead.ts eventDetail), built here so
 *  the engine test never imports from workers/. */
function fixtureDetail(): EventDetailV1 {
  const url = new URL('../../../../fixtures/tournament-sample.json', import.meta.url);
  const f = JSON.parse(readFileSync(url, 'utf8')) as Fixture;
  const matches = new Map<string, EventMatchV1>();
  for (const b of f.battles.battles) {
    const held = matches.get(b.match) ?? {
      match: b.match,
      day: b.day,
      stage: b.stage,
      group: b.group,
      roundLabel: b.roundLabel,
      bracket: b.bracket,
      bracketDepth: b.bracketDepth,
      matchFormat: b.matchFormat,
      left: b.left.player,
      right: b.right.player,
      games: [],
    };
    held.games.push({
      game: b.game,
      at: b.at,
      leftTeam: b.left.team,
      rightTeam: b.right.team,
      leftForms: b.left.forms,
      rightForms: b.right.forms,
      winnerSide: b.winnerSide,
      resultSource: b.resultSource,
      scoreAtStart: b.scoreAtStart,
      notes: b.notes,
    });
    matches.set(b.match, held);
  }
  for (const m of matches.values()) {
    m.games.sort((a, b) => a.game - b.game);
  }
  const roster = new Map<string, EventDetailV1['roster'][number]>();
  for (const r of [...f.roster.entries].sort((a, b) => a.slot - b.slot)) {
    const held = roster.get(r.player.toLowerCase()) ?? { player: r.player, species: [] };
    held.species.push({ species: r.species, moves: r.moves });
    roster.set(r.player.toLowerCase(), held);
  }
  return {
    event: { ...f.event, id: f.id, received: '2026-09-21T00:00:00.000Z' },
    matches: [...matches.values()].sort(
      (a, b) => a.day - b.day || a.bracketDepth - b.bracketDepth || a.match.localeCompare(b.match),
    ),
    roster: [...roster.values()].sort((a, b) => a.player.localeCompare(b.player)),
    species: [],
  };
}

let gameClock = 0;
function game(
  leftTeam: string[],
  rightTeam: string[],
  winnerSide: string | null,
  n = 1,
): EventGameV1 {
  gameClock += 60;
  return {
    game: n,
    at: new Date(Date.parse('2026-10-17T00:00:00.000Z') + gameClock * 1000).toISOString(),
    leftTeam,
    rightTeam,
    leftForms: leftTeam.map(() => 'rk9'),
    rightForms: rightTeam.map(() => 'rk9'),
    winnerSide,
    resultSource: winnerSide === null ? null : 'score',
    scoreAtStart: [0, 0],
    notes: null,
  };
}

function match(
  id: string,
  left: string,
  right: string,
  games: EventGameV1[],
  opts: { stage?: string; bracket?: string; day?: number } = {},
): EventMatchV1 {
  return {
    match: id,
    day: opts.day ?? 1,
    stage: opts.stage ?? 'groups',
    group: null,
    roundLabel: 'ROUND 1',
    bracket: opts.bracket ?? 'winners',
    bracketDepth: 1,
    matchFormat: 'bo3',
    left,
    right,
    games: games.map((g, i) => ({ ...g, game: i + 1 })),
  };
}

function detail(
  matches: EventMatchV1[],
  roster: EventDetailV1['roster'] = [],
  vods: EventDetailV1['event']['vods'] = [{ day: 1, id: 'v111' }],
): EventDetailV1 {
  return {
    event: {
      id: 'synthetic',
      name: '2027 Synthetic Pokemon GO Regional Championships',
      startDate: '2026-10-17',
      endDate: '2026-10-18',
      league: 'great',
      cup: 'championshipseries',
      vods,
      notes: null,
      received: '2026-10-19T00:00:00.000Z',
    },
    matches,
    roster,
    species: [],
  };
}

const A = ['azumarill', 'registeel', 'altaria'];
const B = ['medicham', 'lanturn', 'skarmory'];

describe('finish', () => {
  it('champion is the grand final match winner', () => {
    const d = fixtureDetail();
    // The fixture's grand final is DUSKHOLLOW vs CINDERVANE, 2-2 on decided games, and the last
    // game went left, so DUSKHOLLOW takes it.
    expect(champion(d)?.name).toBe('DUSKHOLLOW');
    const players = eventPlayers(d);
    expect(players[0]?.name).toBe('DUSKHOLLOW');
    expect(players[0]?.finish).toBe('Champion');
    expect(players[1]?.name).toBe('CINDERVANE');
    expect(players[1]?.finish).toBe('Finalist');
    expect(players.filter((p) => p.finish === 'Champion')).toHaveLength(1);
  });

  it('a short grand final falls back to its last decided game', () => {
    const d = detail([
      match('gf', 'LEFTY', 'RIGHTY', [game(A, B, 'right'), game(A, B, 'left')], {
        stage: 'top_cut',
        bracket: 'grand',
      }),
    ]);
    expect(champion(d)?.name).toBe('LEFTY');
    const byName = new Map(eventPlayers(d).map((p) => [p.name, p]));
    expect(byName.get('LEFTY')?.finish).toBe('Champion');
    expect(byName.get('RIGHTY')?.finish).toBe('Finalist');
  });

  it('a grand final with no decided game gives both Finalist and nobody Champion', () => {
    const d = detail([
      match('gf', 'LEFTY', 'RIGHTY', [game(A, B, null)], { stage: 'top_cut', bracket: 'grand' }),
    ]);
    expect(champion(d)).toBeNull();
    const players = eventPlayers(d);
    expect(players.map((p) => p.finish).sort()).toEqual(['Finalist', 'Finalist']);
    expect(players.some((p) => p.finish === 'Champion')).toBe(false);
  });

  it('a grand final with more decided games for one side goes to that side', () => {
    const d = detail([
      match(
        'gf',
        'LEFTY',
        'RIGHTY',
        [game(A, B, 'right'), game(A, B, 'right'), game(A, B, 'left')],
        { stage: 'top_cut', bracket: 'grand' },
      ),
    ]);
    expect(champion(d)?.name).toBe('RIGHTY');
  });

  it('no decided grand final game means no champion', () => {
    const d = detail([
      match('gf', 'LEFTY', 'RIGHTY', [game(A, B, null), game(A, B, null)], {
        stage: 'top_cut',
        bracket: 'grand',
      }),
    ]);
    expect(champion(d)).toBeNull();
    expect(eventPlayers(d).some((p) => p.finish === 'Champion')).toBe(false);
  });

  it('top cut players are Top cut, group-only players have no finish', () => {
    const byName = new Map(eventPlayers(fixtureDetail()).map((p) => [p.name, p]));
    // ARCWARDEN, BLUEKITE, EMBERFALL and HOLLOWPINE play top cut matches but not the grand final.
    for (const name of ['ARCWARDEN', 'BLUEKITE', 'EMBERFALL', 'HOLLOWPINE']) {
      expect(byName.get(name)?.finish).toBe('Top cut');
    }
    for (const name of ['FROSTQUILL', 'GLASSREEF']) {
      expect(byName.get(name)?.finish).toBeNull();
    }
  });

  it('orders by finish, then wins, losses and name', () => {
    const players = eventPlayers(fixtureDetail());
    const rank = { Champion: 0, Finalist: 1, 'Top cut': 2 } as const;
    for (let i = 1; i < players.length; i++) {
      const a = players[i - 1]!;
      const b = players[i]!;
      const ra = a.finish === null ? 3 : rank[a.finish];
      const rb = b.finish === null ? 3 : rank[b.finish];
      expect(ra).toBeLessThanOrEqual(rb);
      if (ra === rb) {
        const ok =
          a.wins > b.wins ||
          (a.wins === b.wins && a.losses < b.losses) ||
          (a.wins === b.wins && a.losses === b.losses && a.name.localeCompare(b.name) <= 0);
        expect(ok).toBe(true);
      }
    }
  });

  it('counts the record from decided games only', () => {
    const byName = new Map(eventPlayers(fixtureDetail()).map((p) => [p.name, p]));
    const arc = byName.get('ARCWARDEN')!;
    // day1-1 2-0 (2 games), day1-6 right side 1-1 plus a null (3), day2-9 1-1 plus a null (3).
    expect(arc.games).toBe(8);
    expect(arc.wins).toBe(4);
    expect(arc.losses).toBe(2);
    expect(arc.played).toHaveLength(8);
    expect(arc.played.filter((g) => g.result === null)).toHaveLength(1 + 1);
  });
});

describe('six slots', () => {
  it('six comes from the roster when there is one', () => {
    const arc = eventPlayers(fixtureDetail()).find((p) => p.name === 'ARCWARDEN')!;
    expect(arc.fromRoster).toBe(true);
    expect(arc.six).toEqual([
      'altaria',
      'melmetal',
      'dunsparce',
      'medicham',
      'registeel',
      'jumpluff_shadow',
    ]);
    expect(arc.seen).toBe(6);
    expect(arc.moves['altaria']).toEqual({
      fast: 'DRAGON_BREATH',
      charged: ['MOONBLAST', 'FLAMETHROWER'],
    });
    expect(arc.moves['medicham']).toBeNull();
  });

  it('six pads unseen slots with null', () => {
    const d = detail([
      match('m1', 'SOLO', 'OTHER', [
        game(['azumarill', 'registeel', 'altaria'], B, 'left'),
        game(['azumarill', 'medicham', 'altaria'], B, 'right'),
      ]),
    ]);
    const solo = eventPlayers(d).find((p) => p.name === 'SOLO')!;
    expect(solo.fromRoster).toBe(false);
    expect(solo.six).toHaveLength(6);
    expect(solo.six.filter(Boolean).length).toBe(4);
    expect(solo.seen).toBe(4);
    expect(solo.six).toEqual(['azumarill', 'registeel', 'altaria', 'medicham', null, null]);
    expect(solo.moves).toEqual({});
  });

  it('more than six seen keeps the first six seen', () => {
    const d = detail([
      match('m1', 'SOLO', 'OTHER', [
        game(['a1', 'a2', 'a3'], B, 'left'),
        game(['a4', 'a5', 'a6'], B, 'left'),
        game(['a7', 'a1', 'a2'], B, 'left'),
      ]),
    ]);
    const solo = eventPlayers(d).find((p) => p.name === 'SOLO')!;
    expect(solo.six).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    expect(solo.seen).toBe(6);
  });
});

describe('picks and trios', () => {
  it('picks count games, not matches', () => {
    const d = detail([
      match('m1', 'SOLO', 'OTHER', [
        game(['azumarill', 'registeel', 'altaria'], B, 'left'),
        game(['azumarill', 'medicham', 'altaria'], B, 'right'),
        game(['azumarill', 'registeel', 'altaria'], B, 'left'),
      ]),
      match('m2', 'OTHER', 'SOLO', [game(B, ['medicham', 'registeel', 'azumarill'], 'left')]),
    ]);
    const solo = eventPlayers(d).find((p) => p.name === 'SOLO')!;
    expect(solo.picks).toEqual({ azumarill: 4, registeel: 3, altaria: 3, medicham: 2 });
    expect(solo.games).toBe(4);
  });

  it('trios order by games then wins', () => {
    const d = detail([
      match('m1', 'SOLO', 'OTHER', [
        game(['x1', 'x2', 'x3'], B, 'right'),
        game(['y1', 'y2', 'y3'], B, 'left'),
        game(['z1', 'z2', 'z3'], B, 'left'),
        game(['z2', 'z1', 'z3'], B, 'right'),
        game(['y3', 'y2', 'y1'], B, 'left'),
      ]),
    ]);
    const solo = eventPlayers(d).find((p) => p.name === 'SOLO')!;
    // y and z both have two games; y has two wins, z one. Ids keep the order first played.
    expect(solo.trios).toEqual([
      { ids: ['y1', 'y2', 'y3'], games: 2, wins: 2, losses: 0 },
      { ids: ['z1', 'z2', 'z3'], games: 2, wins: 1, losses: 1 },
      { ids: ['x1', 'x2', 'x3'], games: 1, wins: 0, losses: 1 },
    ]);
  });

  it('played carries each game from the player side', () => {
    const d = detail([match('m2', 'OTHER', 'SOLO', [game(B, A, 'right')])]);
    const solo = eventPlayers(d).find((p) => p.name === 'SOLO')!;
    expect(solo.played).toHaveLength(1);
    const g = solo.played[0]!;
    expect(g.side).toBe('right');
    expect(g.mine).toEqual(A);
    expect(g.theirs).toEqual(B);
    expect(g.result).toBe('W');
    expect(g.match.match).toBe('m2');
  });
});

describe('VODs', () => {
  it("vodOffset reads at as seconds into that day's VOD", () => {
    const d = detail(
      [],
      [],
      [
        { day: 1, id: 'v111' },
        { day: 2, id: 'v222' },
      ],
    );
    expect(vodOffset(d.event, 1, '2026-10-17T00:57:51.000Z')).toBe(3471);
    expect(vodOffset(d.event, 2, '2026-10-18T00:05:33.000Z')).toBe(333);
  });

  it('vodOffset is null when negative or over a day', () => {
    const d = detail([]);
    expect(vodOffset(d.event, 1, '2026-10-16T23:59:00.000Z')).toBeNull();
    expect(vodOffset(d.event, 1, '2026-10-18T00:00:01.000Z')).toBeNull();
  });

  it('vodOffset is null for a day without a VOD', () => {
    const d = fixtureDetail();
    const day3 = d.matches.flatMap((m) => m.games).find((g) => g.at.startsWith('2026-09-20'));
    const at = day3?.at ?? '2026-09-20T00:10:00.000Z';
    expect(vodOffset(d.event, 3, at)).toBeNull();
    expect(vodUrl(d.event, 3, at)).toBeNull();
    expect(vodUrl(d.event, 3)).toBeNull();
    expect(vodOffset(d.event, 1, '2026-09-18T00:10:00.000Z')).toBe(600);
  });

  it('vodUrl formats the offset', () => {
    const d = detail([]);
    expect(vodUrl(d.event, 1, '2026-10-17T00:57:51.000Z')).toBe(
      'https://www.twitch.tv/videos/111?t=0h57m51s',
    );
    expect(vodUrl(d.event, 1)).toBe('https://www.twitch.tv/videos/111');
    const bare = detail([], [], [{ day: 1, id: '123' }]);
    expect(vodUrl(bare.event, 1, '2026-10-17T01:02:03.000Z')).toBe(
      'https://www.twitch.tv/videos/123?t=1h2m3s',
    );
  });
});

describe('recentSince', () => {
  it('recentSince is 55 days back', () => {
    expect(RECENT_DAYS).toBe(55);
    expect(recentSince(new Date('2026-10-18T12:00:00.000Z'))).toBe('2026-08-24T00:00:00.000Z');
  });
});

describe('shortEventName', () => {
  it('shortens Regional names and leaves the rest', () => {
    expect(shortEventName('2027 Nice Pokemon GO Regional Championships')).toBe('Nice Regional');
    expect(shortEventName('2027 Frankfurt Pokemon GO Regional Championships')).toBe(
      'Frankfurt Regional',
    );
    expect(shortEventName('Spring Invitational')).toBe('Spring Invitational');
  });
});

describe('eventOngoing', () => {
  const event = { endDate: '2027-10-18' };
  // Local-time constructors: the viewer's own calendar day, whatever the machine's zone.
  it('is ongoing through the end date itself', () => {
    expect(eventOngoing(event, new Date(2027, 9, 16, 9, 0))).toBe(true);
    expect(eventOngoing(event, new Date(2027, 9, 18, 0, 0))).toBe(true);
    expect(eventOngoing(event, new Date(2027, 9, 18, 23, 59))).toBe(true);
  });

  it('is over from the next day', () => {
    expect(eventOngoing(event, new Date(2027, 9, 19, 0, 0))).toBe(false);
    expect(eventOngoing(event, new Date(2027, 10, 1, 12, 0))).toBe(false);
  });

  it('reads only the date part of an end date', () => {
    expect(eventOngoing({ endDate: '2027-10-18T00:00:00Z' }, new Date(2027, 9, 18, 22, 0))).toBe(
      true,
    );
  });
});
