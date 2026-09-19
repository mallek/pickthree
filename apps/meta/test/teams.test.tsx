import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatrixView, type MatchupMatrix } from '@pickthree/engine/meta';
import type { TeamRowV1, TeamsV1 } from '../src/api.js';
import type { SpeciesLite, StaticData } from '../src/data.js';
import type { Epoch } from '../src/epochs.js';
import { measuredSay, type SpeciesRanking, type SpeciesRow } from '../src/rank.js';
import { Teams } from '../src/screens/Teams.js';
import type { GeneratedTeamLite } from '../src/slice.js';
import { buildBoard } from '../src/teamRank.js';

/**
 * One shared matchup slice for every test below. Every species the fixtures name, except
 * `stranger` (deliberately left out: it is the one member a projection can never cover), has a
 * candidate row here. Three opponents stand in for PvPoke's meta group; the ratings are uniform
 * because no test in this file checks a specific projected number, only whether one exists.
 */
const CANDIDATES = [
  'gen_a',
  'gen_b',
  'gen_c',
  'azumarill',
  'clodsire',
  'tinkaton',
  'lonelya',
  'lonelyb',
  'faceda',
  'facedb',
  'facedc',
  'outsidera',
  'outsiderb',
  'oppa',
  'oppb',
  'oppc',
];
const OPPONENTS = ['oppa', 'oppb', 'oppc'];

function view(): MatrixView {
  const scenarios = [
    { shields: [0, 0] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [1, 1] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [2, 2] as [number, number], energy: [0, 0] as [number, number] },
  ];
  const ratings: number[] = [];
  CANDIDATES.forEach(() => {
    OPPONENTS.forEach(() => {
      scenarios.forEach(() => {
        ratings.push(650);
      });
    });
  });
  const m: MatchupMatrix = {
    league: 'great',
    cp: 1500,
    scenarios,
    candidates: CANDIDATES,
    opponents: OPPONENTS,
    candidateMovesets: {},
    opponentMovesets: {},
    ratings,
  };
  return new MatrixView(m);
}

function species(id: string, name: string): SpeciesLite {
  return { id, name, short: name, dex: 0, types: ['normal'], shadow: false };
}

const STATIC_DATA: StaticData = {
  species: new Map(
    [
      ['gen_a', 'Gen A'],
      ['gen_b', 'Gen B'],
      ['gen_c', 'Gen C'],
      ['azumarill', 'Azumarill'],
      ['clodsire', 'Clodsire'],
      ['tinkaton', 'Tinkaton'],
      ['lonelya', 'Lonely A'],
      ['lonelyb', 'Lonely B'],
      ['faceda', 'Faced A'],
      ['facedb', 'Faced B'],
      ['facedc', 'Faced C'],
      ['outsidera', 'Outsider A'],
      ['outsiderb', 'Outsider B'],
      ['oppa', 'Opp A'],
      ['oppb', 'Opp B'],
      ['oppc', 'Opp C'],
    ].map(([id, name]) => [id as string, species(id as string, name as string)]),
  ),
  moves: new Map(),
  leagues: [{ id: 'great', title: 'Great League', short: 'Great', cp: 1500 }],
  seasons: [],
};

const BAKED_COMMIT = 'baked0000111';
const OTHER_COMMIT = 'other9999888';

function row(species: string[], kind: 'core' | 'team', over: Partial<TeamRowV1> = {}): TeamRowV1 {
  return {
    species,
    kind,
    runBattles: 0,
    runWins: 0,
    runLosses: 0,
    facedBattles: 0,
    facedWins: 0,
    facedLosses: 0,
    moves: species.map(() => null),
    thirds: [],
    ...over,
  };
}

const CORE = row(['azumarill', 'clodsire'], 'core', {
  runBattles: 40,
  runWins: 22,
  runLosses: 18,
  thirds: [{ speciesId: 'tinkaton', sightings: 12 }],
});

const FULL = row(['azumarill', 'clodsire', 'tinkaton'], 'team', {
  runBattles: 12,
  runWins: 7,
  runLosses: 5,
});

const LONELY_CORE = row(['lonelya', 'lonelyb'], 'core', {
  facedBattles: 9,
  facedWins: 4,
  facedLosses: 5,
});

const FACED = row(['faceda', 'facedb', 'facedc'], 'team', {
  facedBattles: 40,
  facedWins: 30,
  facedLosses: 10,
});

const OUTSIDER = row(['outsidera', 'outsiderb', 'stranger'], 'team', {
  runBattles: 6,
  runWins: 3,
  runLosses: 3,
});

const GENERATED: GeneratedTeamLite[] = [
  {
    species: ['gen_a', 'gen_b', 'gen_c'],
    strength: 80,
    coverage: 100,
    consistency: 100,
    safety: 100,
    structure: 'ABC',
    exposure: [],
  },
];

function opponentRow(id: string, i: number, weight: number): SpeciesRow {
  return {
    speciesId: id,
    rank: i + 1,
    weight,
    pvpokeRank: i + 1,
    inMetaGroup: true,
    sightings: 0,
    share: null,
    wins: 0,
    losses: 0,
    decided: 0,
    confidence: 'few',
    trend: null,
    barPct: 100,
  };
}

/** The blended weights and the ranking rows: `weightCovered` is the share of these weights that
 * land on a matrix opponent (see teamRank.ts's `strengthContext`). Every opponent carries weight
 * 1, so a coverage below 1 comes from adding weight the matrix cannot see at all. */
function makeRanking(battles: number, devices: number, weightCovered = 1): SpeciesRanking {
  const weights = new Map<string, number>(OPPONENTS.map((id) => [id, 1]));
  if (weightCovered < 1) {
    const total = OPPONENTS.length / weightCovered;
    weights.set('outside_the_matrix', total - OPPONENTS.length);
  }
  return {
    say: measuredSay(battles, devices),
    battles,
    devices,
    rows: OPPONENTS.map((id, i) => opponentRow(id, i, weights.get(id) ?? 0)),
    weights,
    pvpokeCommit: BAKED_COMMIT,
    pvpokeDate: '2026-09-01',
  };
}

function makeTeams(battles: number, devices: number, teams: TeamRowV1[], cores: TeamRowV1[]): TeamsV1 {
  return {
    league: 'great',
    since: '2026-09-01T00:00:00.000Z',
    until: '2026-09-30T00:00:00.000Z',
    band: 'all',
    battles,
    devices,
    sources: { ladder: battles },
    teams,
    cores,
    generatedAt: '2026-09-30T00:00:00.000Z',
  };
}

function renderTeams(opts: {
  battles: number;
  devices: number;
  teams: TeamRowV1[];
  cores: TeamRowV1[];
  generated: GeneratedTeamLite[];
  weightCovered?: number;
  mismatch?: boolean;
}) {
  const teamsData = makeTeams(opts.battles, opts.devices, opts.teams, opts.cores);
  const ranking = makeRanking(opts.battles, opts.devices, opts.weightCovered ?? 1);
  const board = buildBoard({
    teams: teamsData,
    ranking,
    generated: opts.generated,
    view: view(),
  });
  const epoch: Epoch | null = opts.mismatch
    ? { at: '2026-01-01T00:00:00Z', note: 'test epoch', pvpokeCommit: OTHER_COMMIT }
    : null;
  return render(
    <Teams
      league="great"
      data={STATIC_DATA}
      teams={{ state: 'ready', data: teamsData, error: null }}
      board={board}
      ranking={ranking}
      epoch={epoch}
      bakedCommit={BAKED_COMMIT}
    />,
  );
}

describe('Teams, cold start', () => {
  it('shows generated teams and says plainly that they are projections', async () => {
    renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: GENERATED });
    expect(await screen.findByRole('heading', { name: 'Teams' })).toBeInTheDocument();
    expect(
      screen.getByText(/Projected against PvPoke's meta group\. No shared battles/),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Projected').length).toBeGreaterThan(0);
    expect(screen.getByText(/a projection, not a win rate/)).toBeInTheDocument();
  });

  it('never prints a projection as a win rate', () => {
    renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: GENERATED });
    expect(screen.queryByText(/win rate/i)?.textContent).toMatch(/not a win rate/);
  });
});

describe('Teams, with measured play', () => {
  it('says how measured the board is', () => {
    renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: GENERATED });
    expect(screen.getByText(/% measured, from 480 battles shared by 9 devices/)).toBeInTheDocument();
  });

  it('says "1 device" rather than "1 devices"', () => {
    renderTeams({ battles: 40, devices: 1, cores: [CORE], teams: [], generated: [] });
    expect(screen.getByText(/shared by 1 device$/)).toBeInTheDocument();
  });

  it("prints a faced record as the faced team's own, not the reporters'", () => {
    renderTeams({ battles: 100, devices: 4, cores: [], teams: [FACED], generated: [] });
    expect(screen.getByText('Faced 40 times, players went 30-10')).toBeInTheDocument();
  });

  it('nests complete teams under their core', () => {
    renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    expect(screen.getByText('Built as')).toBeInTheDocument();
    expect(screen.getByText('Core')).toBeInTheDocument();
  });

  it('says when a core has never been seen complete', () => {
    renderTeams({ battles: 100, devices: 4, cores: [LONELY_CORE], teams: [], generated: [] });
    expect(screen.getByText(/Never seen complete/)).toBeInTheDocument();
  });

  it('names the members that cost a row its projection', () => {
    renderTeams({ battles: 100, devices: 4, cores: [], teams: [OUTSIDER], generated: [] });
    expect(
      screen.getByText("No projection: stranger is outside PvPoke's ranked list."),
    ).toBeInTheDocument();
  });

  it('says how much of the real facing the projections speak for', () => {
    renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE],
      teams: [],
      generated: [],
      weightCovered: 0.6,
    });
    expect(screen.getByText(/which is 60% of what players actually faced/)).toBeInTheDocument();
  });

  it('warns when the epoch expects a different PvPoke commit', () => {
    renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [], generated: [], mismatch: true });
    expect(screen.getByText(/may still describe the old movesets/)).toBeInTheDocument();
  });

  it('deep links every card into pick3', () => {
    renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    for (const link of screen.getAllByRole('link', { name: /Open in pick3/ })) {
      expect(link).toHaveAttribute('href', expect.stringContaining('https://pick3.gg/#/t/great/'));
    }
  });
});
