import { describe, expect, it } from 'vitest';
import { alternativesFor, explainTeam, switchPlanFor } from '../../src/explain/explain.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import type { MatchupMatrix } from '../../src/gamedata/types.js';
import type { MetaRank } from '../../src/gamedata/metaRank.js';
import type { Candidate } from '../../src/search/candidates.js';
import type { SlotSim, TeamSim } from '../../src/search/finalists.js';
import { MatrixView } from '../../src/search/matrixView.js';
import type { TrioDraft } from '../../src/search/trios.js';
import type { TeamScore } from '../../src/score/score.js';

function view(opponents: string[]): MatrixView {
  const candidates = ['a', 'b', 'c'];
  const scenarios = [
    { shields: [0, 0] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [1, 1] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [2, 2] as [number, number], energy: [0, 0] as [number, number] },
  ];
  const m: MatchupMatrix = {
    league: 'great',
    cp: 1500,
    scenarios,
    candidates,
    opponents,
    candidateMovesets: {},
    opponentMovesets: {},
    ratings: new Array<number>(candidates.length * opponents.length * scenarios.length).fill(500),
  };
  return new MatrixView(m);
}

/** One slot whose simulated rating against each opponent is given; a win is over 500. */
function slot(id: string, role: SlotSim['role'], ratings: [string, number][]): SlotSim {
  const candidate = {
    build: { speciesId: id, needsXl: false, shadow: false },
    moveset: { fast: { moveId: 'F' }, charged: [{ moveId: 'C', type: 'normal' }], eliteTmCount: 0 },
    cost: { weight: 1000 },
    roleScores: { leads: 0, switches: 0, closers: 0 },
    matrixRow: 0,
  } as unknown as Candidate;
  const results = ratings.map(([opponent, rating]) => ({ opponent, rating, win: rating > 500 }));
  return {
    candidate,
    role,
    results,
    wins: results.filter((r) => r.win).length,
    winsWithShield: null,
  };
}

/** Every slot rates each opponent the same, so the best slot's rating is the one given. */
function team(ratings: [string, number][]): TeamSim {
  return {
    draft: { structure: 'ABC' } as TrioDraft,
    slots: [slot('a', 'lead', ratings), slot('b', 'switch', ratings), slot('c', 'closer', ratings)],
    scenario: { lead: '', switch: '', closer: '' },
  };
}

/** Each slot with its own ratings: lead, switch, closer. */
function teamOf(
  lead: [string, number][],
  sw: [string, number][],
  closer: [string, number][],
): TeamSim {
  return {
    draft: { structure: 'ABC' } as TrioDraft,
    slots: [slot('a', 'lead', lead), slot('b', 'switch', sw), slot('c', 'closer', closer)],
    scenario: { lead: '', switch: '', closer: '' },
  };
}

function ranks(ids: string[]): Map<string, MetaRank> {
  return new Map(
    ids.map((id, i) => [id, { overall: i + 1, score: 90, role: null, roleRank: null }]),
  );
}

const index = new GameDataIndex([], []);
const score = {} as TeamScore;

describe('explainTeam key threats', () => {
  it('keeps an unanswered threat over two close ones that outrank it, and lists it first', () => {
    // o1..o3 are close (shields decide them), o4 nobody beats, o5 is a win; meta rank o1 first.
    const ratings: [string, number][] = [
      ['o1', 470],
      ['o2', 460],
      ['o3', 455],
      ['o4', 300],
      ['o5', 700],
    ];
    const ids = ratings.map(([id]) => id);
    const e = explainTeam(team(ratings), score, [], view(ids), index, ranks(ids));
    expect(e.keyThreats.map((t) => t.opponent)).toEqual(['o4', 'o1', 'o2']);
    expect(e.keyThreats[0]!.line).toMatch(/^Nobody on the team beats it\./);
    expect(e.keyThreats[1]!.line).toMatch(/^Close; shields decide it\./);
    expect(e.why).toContain('Biggest risk: o4.');
  });

  it('orders every unanswered threat before the close ones, meta rank first within each', () => {
    const ratings: [string, number][] = [
      ['o1', 470],
      ['o2', 200],
      ['o3', 460],
      ['o4', 300],
    ];
    const ids = ratings.map(([id]) => id);
    const e = explainTeam(team(ratings), score, [], view(ids), index, ranks(ids));
    expect(e.keyThreats.map((t) => t.opponent)).toEqual(['o2', 'o4', 'o1']);
  });
});

describe('switchPlanFor, one meaning of unanswered with the key threats', () => {
  it('calls a lead loss nobody wins but someone keeps close "Close", naming the best try', () => {
    // Nobody wins o1; the Safe Switch comes closest at 470, in the close band.
    const t = teamOf([['o1', 300]], [['o1', 470]], [['o1', 420]]);
    const [row] = switchPlanFor(t, view(['o1']), index, ranks(['o1']));
    expect(row!.to).toBeNull();
    expect(row!.line).toBe('Close; shields decide it. Best try: b.');
    // Key threats read the same opponent the same way.
    const e = explainTeam(t, score, [], view(['o1']), index, ranks(['o1']));
    expect(e.keyThreats[0]!.line).toBe('Close; shields decide it. Best try: b');
  });

  it('counts the lead too when it comes closest, as the key threats do', () => {
    const t = teamOf([['o1', 480]], [['o1', 300]], [['o1', 200]]);
    const [row] = switchPlanFor(t, view(['o1']), index, ranks(['o1']));
    expect(row!.line).toBe('Close; shields decide it. Best try: a.');
  });

  it('keeps "Nobody on the team beats it" for a lead loss everyone loses badly', () => {
    const t = teamOf([['o1', 300]], [['o1', 440]], [['o1', 200]]);
    const [row] = switchPlanFor(t, view(['o1']), index, ranks(['o1']));
    expect(row!.to).toBeNull();
    expect(row!.line).toBe(
      'Nobody on the team beats it. Shield, farm energy, and switch on your terms.',
    );
    const e = explainTeam(t, score, [], view(['o1']), index, ranks(['o1']));
    expect(e.keyThreats[0]!.line).toMatch(/^Nobody on the team beats it\./);
  });

  it('lists the unanswered first, then the close ones, then the ones with a switch', () => {
    // Meta rank o1 first. o1 has a switch, o2 is close, o3 nobody comes near.
    const ids = ['o1', 'o2', 'o3'];
    const t = teamOf(
      [
        ['o1', 300],
        ['o2', 300],
        ['o3', 300],
      ],
      [
        ['o1', 600],
        ['o2', 470],
        ['o3', 200],
      ],
      [
        ['o1', 300],
        ['o2', 300],
        ['o3', 200],
      ],
    );
    const plan = switchPlanFor(t, view(ids), index, ranks(ids));
    expect(plan.map((x) => x.opponent)).toEqual(['o3', 'o2', 'o1']);
    expect(plan[2]!.line).toBe('Switch to b, wins.');
  });
});

describe('Mega names', () => {
  const sp = (speciesId: string, speciesName: string) =>
    ({ speciesId, speciesName, tags: ['mega'], evolutionIds: [] }) as never;
  const index = new GameDataIndex(
    [sp('sableye_mega', 'Sableye (Mega)'), sp('charizard_mega_y', 'Charizard (Mega Y)')],
    [],
  );

  it('puts the Mega word first', async () => {
    const { displayName } = await import('../../src/explain/explain.js');
    expect(displayName('sableye_mega', index)).toBe('Mega Sableye');
    expect(displayName('charizard_mega_y', index)).toBe('Mega Charizard Y');
  });
});

describe('alternatives you own obey the team rules', () => {
  const sp = (speciesId: string, megaOf?: string) =>
    ({
      speciesId,
      speciesName: speciesId,
      tags: megaOf ? ['mega'] : [],
      evolutionIds: [],
      megaOf,
    }) as never;
  const altIndex = new GameDataIndex(
    ['a_mega', 'b', 'c', 'd', 'e', 'x']
      .map((id) => sp(id))
      .concat([sp('b_mega', 'b'), sp('x_mega', 'x')]),
    [],
  );
  const cand = (speciesId: string, specimenId: string, mega: boolean, score: number): Candidate =>
    ({
      build: {
        speciesId,
        specimenId,
        mega: mega ? { ready: true, level4: false } : null,
        needsXl: false,
        shadow: false,
      },
      moveset: { fast: { moveId: 'F' }, charged: [], eliteTmCount: 0 },
      cost: { weight: 1000 },
      roleScores: { leads: score, switches: score, closers: score },
      matrixRow: 0,
    }) as unknown as Candidate;
  const at = (c: Candidate, role: SlotSim['role']): SlotSim => ({
    candidate: c,
    role,
    results: [],
    wins: 0,
    winsWithShield: null,
  });
  // A Mega lead, and two plain teammates.
  const t: TeamSim = {
    draft: { structure: 'ABC' } as TrioDraft,
    slots: [
      at(cand('a_mega', 'sa', true, 0), 'lead'),
      at(cand('b', 'sb', false, 0), 'switch'),
      at(cand('c', 'sc', false, 0), 'closer'),
    ],
    scenario: { lead: '', switch: '', closer: '' },
  };
  const pool = [
    cand('b_mega', 'sb2', true, 100), // the Mega form of b, which is on the team
    cand('x_mega', 'sx', true, 90), // a second Mega unless it replaces the lead
    cand('d', 'sc', false, 80), // another stage of the closer's own specimen
    cand('e', 'se', false, 10),
  ];

  it('offers no second Mega, no Mega of a teammate, and no specimen already on the team', () => {
    const alts = alternativesFor(t, pool, view(['o1']), altIndex);
    const bySlot = new Map(alts.map((a) => [a.slot, a.candidate.build.speciesId]));
    expect(bySlot.get(0)).toBe('x_mega');
    expect(bySlot.get(1)).toBe('e');
    expect(bySlot.get(2)).toBe('d');
  });
});
