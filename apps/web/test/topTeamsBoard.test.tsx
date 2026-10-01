// Copied from meta.pick3.gg's teams test (Task 9 of the meta-in-pick3 plan) and adapted to the
// board inside pick3: names come from the app's game data (a fake host's), the Window, Source and
// league controls live on the screen around the board (topTeams.test.tsx), and "Open in pick3" is
// now "Open in Build" plus "Run this team", both in-app navigation.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildBoard,
  MatrixView,
  measuredSay,
  type Epoch,
  type GeneratedTeamLite,
  type MatchupMatrix,
  type SourceKey,
  type SpeciesRanking,
  type SpeciesRow,
  type TeamRowV1,
  type TeamsV1,
} from '@pickthree/engine/meta';
import { TeamBoard } from '../src/screens/TopTeams.tsx';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

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
  // Review Focus 2: three long spelled names on one row, so a real projection (and score) exists
  // for the row the truncation test renders.
  'ninetalesa',
  'stunfiskg',
  'sableyes',
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

/** The in-app team route a team action leads to, as its member ids. */
function teamPathMembers(hash: string): string[] {
  const m = /^#\/t\/([^/]+)\/(.+)$/.exec(hash);
  if (!m) {
    throw new Error(`not a pick3 team path: ${hash}`);
  }
  return m[2]!.split('+').filter(Boolean);
}

/** The game data's names. `stranger` stays out of CANDIDATES (that is what makes it outside the
 * slice), but it IS a real, known species, so "outside the slice" never means "unknown". */
const NAMES: Record<string, string> = {
  gen_a: 'Gen A',
  gen_b: 'Gen B',
  gen_c: 'Gen C',
  azumarill: 'Azumarill',
  clodsire: 'Clodsire',
  tinkaton: 'Tinkaton',
  lonelya: 'Lonely A',
  lonelyb: 'Lonely B',
  faceda: 'Faced A',
  facedb: 'Faced B',
  facedc: 'Faced C',
  outsidera: 'Outsider A',
  outsiderb: 'Outsider B',
  stranger: 'Stranger',
  oppa: 'Opp A',
  oppb: 'Opp B',
  oppc: 'Opp C',
  ninetalesa: 'Shadow Alolan Ninetales',
  stunfiskg: 'Galarian Stunfisk',
  sableyes: 'Shadow Sableye',
};

/** A fake host whose game data knows every species these fixtures name. */
function host() {
  const base = fakeHost();
  const ready = base.ready as unknown as () => Promise<Record<string, unknown>>;
  return fakeHost({
    ready: vi.fn(async () => ({
      ...(await ready()),
      species: Object.fromEntries(
        Object.entries(NAMES).map(([id, name]) => [
          id,
          { name, types: ['normal'], familyId: id, dex: 0 },
        ]),
      ),
      allSpecies: Object.keys(NAMES),
    })),
  });
}

let latest: AppState | null = null;
function Probe() {
  latest = useAppState();
  return null;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  window.location.hash = '#/meta/teams';
  latest = null;
});

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

// Fix 1 (win/loss inversion): the worker (workers/counter/src/teams.ts) increments a faced row's
// `facedWins` on the REPORTER's loss and `facedLosses` on the REPORTER's win, because a reporter's
// loss is the team they faced winning that battle. So `facedWins` is the number of battles the
// faced team won, and `facedLosses` is the number it lost. The players' own record is the inverse:
// their wins are `facedLosses` (12) and their losses are `facedWins` (25). This fixture uses the
// spec's own worked example ("faced 37 times, players went 12-25") so the expected string in the
// test below is traceable to the spec, not just derived from the fix.
const FACED_SPEC_EXAMPLE = row(['faceda', 'facedb', 'facedc'], 'team', {
  facedBattles: 37,
  facedWins: 25,
  facedLosses: 12,
});

// Run and faced counts sum to the TEAM's total record: runWins is the team winning as the
// reporter's own pick, facedWins is the team winning as the reporter's opponent, so both add to
// the team's wins (12 + 25 = 37 here), and the sentence names the team, not the players.
const COMBINED = row(['faceda', 'facedb', 'facedc'], 'team', {
  runBattles: 10,
  runWins: 7,
  runLosses: 3,
  facedBattles: 37,
  facedWins: 25,
  facedLosses: 12,
});

/**
 * I3: `recordLine`'s four branches at exactly one battle, which is the regime the front door
 * opens in on day one. Four distinct trios, so a single render puts all four rows on the board.
 */
const ONE_RUN = row(['azumarill', 'clodsire', 'tinkaton'], 'team', {
  runBattles: 1,
  runWins: 1,
  runLosses: 0,
});
const ONE_FACED = row(['faceda', 'facedb', 'facedc'], 'team', {
  facedBattles: 1,
  facedWins: 1,
  facedLosses: 0,
});
const ONE_EACH = row(['lonelya', 'lonelyb', 'oppa'], 'team', {
  runBattles: 1,
  runWins: 1,
  runLosses: 0,
  facedBattles: 1,
  facedWins: 1,
  facedLosses: 0,
});
/** One battle, no result recorded: the `decided === 0` branch. */
const ONE_UNDECIDED = row(['oppb', 'oppc', 'outsidera'], 'team', { runBattles: 1 });

const OUTSIDER = row(['outsidera', 'outsiderb', 'stranger'], 'team', {
  runBattles: 6,
  runWins: 3,
  runLosses: 3,
});

/** A core with no OBSERVED complete team at all: the only thing that ever nests under it is a
 * generated one. Fix round 1, item 1's converse case. */
const GEN_CORE = row(['lonelya', 'facedc'], 'core', {
  runBattles: 5,
  runWins: 3,
  runLosses: 2,
});

/** Review Focus 2's worked example: three long spelled names on one row, run enough times to
 * carry both a projection (a score) and a record, at phone width. */
const LONG_NAMES_TEAM = row(['ninetalesa', 'stunfiskg', 'sableyes'], 'team', {
  runBattles: 5,
  runWins: 3,
  runLosses: 2,
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

/** Nests under GEN_CORE's own pair, the only build it will ever have. */
const GEN_MATCH_LONELY: GeneratedTeamLite = {
  species: ['lonelya', 'facedc', 'gen_a'],
  strength: 85,
  coverage: 100,
  consistency: 100,
  safety: 100,
  structure: 'ABC',
  exposure: [],
};

/** Nests under CORE's own pair ALONGSIDE the real FULL team: this is fix round 1, item 1's exact
 * reported bug, a generated third sitting next to an observed one under the same core. */
const GEN_MATCH_CORE: GeneratedTeamLite = {
  species: ['azumarill', 'clodsire', 'gen_b'],
  strength: 82,
  coverage: 100,
  consistency: 100,
  safety: 100,
  structure: 'ABC',
  exposure: [],
};

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
    tournamentPicks: 0,
    tournamentGame1Picks: 0,
    tournamentWins: 0,
    tournamentLosses: 0,
    tournamentUnresolvedForms: 0,
    banned: false,
  };
}

/** The blended weights and the ranking rows: `weightCovered` is the share of these weights that
 * land on a matrix opponent (see teamRank.ts's `strengthContext`). Every opponent carries weight
 * 1, so a coverage below 1 comes from adding weight the matrix cannot see at all. */
function makeRanking(
  battles: number,
  devices: number,
  weightCovered = 1,
  source: SourceKey = 'all',
): SpeciesRanking {
  const weights = new Map<string, number>(OPPONENTS.map((id) => [id, 1]));
  if (weightCovered < 1) {
    const total = OPPONENTS.length / weightCovered;
    weights.set('outside_the_matrix', total - OPPONENTS.length);
  }
  return {
    source,
    say: measuredSay(battles, devices),
    battles,
    devices,
    tournamentSay: 0,
    tournamentBattles: 0,
    events: 0,
    eventsOther: 0,
    rows: OPPONENTS.map((id, i) => opponentRow(id, i, weights.get(id) ?? 0)),
    weights,
    pvpokeCommit: BAKED_COMMIT,
    pvpokeDate: '2026-09-01',
  };
}

function makeTeams(
  battles: number,
  devices: number,
  teams: TeamRowV1[],
  cores: TeamRowV1[],
): TeamsV1 {
  return {
    league: 'great',
    since: '2026-09-01T00:00:00.000Z',
    until: '2026-09-30T00:00:00.000Z',
    source: 'all',
    battles,
    devices,
    sources: { ladder: battles },
    teams,
    cores,
    generatedAt: '2026-09-30T00:00:00.000Z',
  };
}

async function renderTeams(opts: {
  battles?: number;
  devices?: number;
  teams?: TeamRowV1[];
  cores?: TeamRowV1[];
  generated?: GeneratedTeamLite[];
  weightCovered?: number;
  mismatch?: boolean;
  /** Fix round 1, item 3: a failure of any of the four sources the board is built from, not just
   * the shared teams themselves. */
  boardError?: boolean;
  /** Fix round 1, item 4: the slice failing to load (`buildBoard`'s `view: null`), distinct from
   * `boardError` above; this degrades to `board.projectionless` rather than blanking the screen. */
  sliceMissing?: boolean;
  /** Defaults to 'all', same as every existing test that predates the Source select. */
  source?: SourceKey;
  /** Counted battles by source (`MetaSummaryV1.sources`), fed straight to `Teams`' own prop
   * rather than through `makeTeams`, since the two are unrelated inputs on the real screen. */
  sources?: Record<string, number>;
  /** `Teams`' own "Try again" callback (App.tsx's `retryBoard`). Defaults to a no-op; a test that
   *  cares passes its own spy and reads it after a click. */
  onRetry?: () => void;
}) {
  const battles = opts.battles ?? 0;
  const devices = opts.devices ?? 0;
  const teams = opts.teams ?? [];
  const cores = opts.cores ?? [];
  const generated = opts.generated ?? [];
  const teamsData = makeTeams(battles, devices, teams, cores);
  const ranking = makeRanking(battles, devices, opts.weightCovered ?? 1, opts.source ?? 'all');
  const board = opts.boardError
    ? null
    : buildBoard({
        teams: teamsData,
        ranking,
        generated,
        view: opts.sliceMissing ? null : view(),
      });
  const epoch: Epoch | null = opts.mismatch
    ? { at: '2026-01-01T00:00:00Z', note: 'test epoch', pvpokeCommit: OTHER_COMMIT }
    : null;
  const view_ = render(
    <AppProvider host={host()}>
      <Probe />
      <TeamBoard
        league="great"
        boardError={opts.boardError ?? false}
        board={board}
        ranking={opts.boardError ? null : ranking}
        epoch={epoch}
        bakedCommit={BAKED_COMMIT}
        sources={opts.sources ?? {}}
        onRetry={opts.onRetry ?? (() => {})}
      />
    </AppProvider>,
  );
  // The names come from the game data, so wait for the app to boot before reading them.
  await waitFor(() => expect(latest?.boot).toBe('ready'));
  return view_;
}

/** "How it is ranked": the one `Term` this screen hosts, its body carrying the source sentence,
 * the sources line (under All), the matchup score explainer and the coverage line. Opening it is
 * a precondition for every assertion on that body, since `Term` renders nothing until tapped. */
async function openRanked(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'How it is ranked' }));
}

/**
 * Every row on the board renders collapsed: a head line with a one-line summary, and the full
 * facts only once it is tapped. The sentences these tests pin are the honest, full-length ones,
 * so they live in the panel; this opens every row so a test can read them. Row heads are found by
 * class rather than by `aria-expanded`, because `Term` (the matchup score explainer in the
 * section header) is an expandable button too and is not a row.
 */
async function openEveryRow(): Promise<void> {
  for (const head of Array.from(document.querySelectorAll('.row-head'))) {
    fireEvent.click(head);
  }
}

describe('Top teams board, cold start', () => {
  it('shows the blend line and, once opened, the projection sentence', async () => {
    await renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: GENERATED });
    // The h2 "Teams" and the separate paragraphs it used to sit above are gone: one blend line
    // (blendParts) and a single "How it is ranked" Term carry everything they said.
    expect(screen.queryByRole('heading', { name: 'Teams' })).toBeNull();
    await openRanked();
    expect(
      screen.getByText(/Projected against PvPoke's meta group\. No shared battles/),
    ).toBeInTheDocument();
    // A generated row's collapsed sub-line is the `Projected` tag itself (ruling 5), visible
    // without opening the row: unlike the record summary it replaces, it is not a fact one tap
    // away, it is the tag right there on the collapsed head.
    expect(screen.getAllByText('Projected').length).toBeGreaterThan(0);
    // A projection is a matchup score out of 100, never a percentage; that sentence is still in
    // the row panel, one tap away.
    await openEveryRow();
    expect(screen.getByText(/^Matchup score \d+ of 100$/)).toBeInTheDocument();
  });

  // Fix round 1, item 2: the spec's own line is "PvPoke 100% · No shared battles yet · How it is
  // ranked" (and, under a live blend, "PvPoke 37% · Tournaments 37% · GBL 26% · How it is
  // ranked"), the same " · " joining `blendParts` and the "How it is ranked" `Term`, not just
  // between the parts themselves. Pinned on the blend line's whole text, not a substring, so a
  // missing or doubled separator fails this test either way.
  it('joins the blend parts and "How it is ranked" with the same " · "', async () => {
    await renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: [] });
    const sub = document.querySelector('.tb-blend');
    expect(sub?.textContent).toBe('PvPoke 100% · No shared battles yet · How it is ranked');
  });

  // Fix round 1, item 3: the brief's own empty-board case (no shared teams, no projections) was
  // missing a test; this pins the line and the Contribute card the spec names for it.
  it('shows the empty-board line and the Contribute card when nothing loaded at all', async () => {
    await renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: [] });
    expect(
      screen.getByText('No teams shared in this window yet, and no projections could be loaded.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Help fill this in')).toBeInTheDocument();
    // In pick3 the card leads straight to picking a team to log, no site hop.
    expect(screen.getByRole('link', { name: 'Log a battle' })).toHaveAttribute(
      'href',
      '#/meta/new',
    );
  });

  // Fix round 1, item 1: the Term's body used to be several <p> elements inside a <p className=
  // "sub">, which React flags as invalid HTML ("In HTML, <p> cannot be a descendant of <p>") on
  // every render that opens it. The line is a <div> now and the sentences inside the Term are
  // block-level spans; this pins that opening the Term logs nothing.
  it('opening "How it is ranked" logs no console error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await renderTeams({
        battles: 480,
        devices: 9,
        cores: [CORE],
        teams: [FULL],
        generated: GENERATED,
      });
      await openRanked();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  // The retired caveat ("a projection, not a win rate") existed because a projection used to be
  // printed as a percentage, which reads as a win rate. A matchup score is not a percentage, so
  // the ambiguity it guarded against is gone; the rule left standing is that nothing but a real
  // measured record ever prints with a percent sign.
  it('never prints a projection as a percentage', async () => {
    const { container } = await renderTeams({
      battles: 0,
      devices: 0,
      teams: [],
      cores: [],
      generated: GENERATED,
    });
    await openEveryRow();
    const rows = container.querySelectorAll('.tb-team-row');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.textContent ?? '').not.toMatch(/%/);
    }
  });
});

describe('Top teams board, sources', () => {
  it('says how many battles each source contributed, under All only', async () => {
    await renderTeams({ source: 'all', sources: { ladder: 480, broadcast: 105 } });
    await openRanked();
    expect(
      screen.getByText('From 480 battles shared and 105 tournament battles.'),
    ).toBeInTheDocument();
  });

  it('says nothing about sources when only one population has anything', async () => {
    await renderTeams({ source: 'all', sources: { ladder: 480 } });
    await openRanked();
    expect(screen.queryByText(/tournament battles\./)).not.toBeInTheDocument();
  });
});

describe('Top teams board, with measured play', () => {
  it('says how measured the board is', async () => {
    await renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE],
      teams: [FULL],
      generated: GENERATED,
    });
    await openRanked();
    expect(
      screen.getByText(/% measured, from 480 shared battles by 9 devices/),
    ).toBeInTheDocument();
  });

  it('says "1 device" rather than "1 devices"', async () => {
    await renderTeams({ battles: 40, devices: 1, cores: [CORE], teams: [], generated: [] });
    await openRanked();
    expect(screen.getByText(/by 1 device$/)).toBeInTheDocument();
  });

  it("prints the players' own record for a faced-only row, not the faced team's", async () => {
    await renderTeams({ battles: 100, devices: 4, cores: [], teams: [FACED], generated: [] });
    await openEveryRow();
    // facedWins (30) counts battles the faced team WON (the reporters lost); facedLosses (10)
    // counts battles the faced team LOST (the reporters won). "players went" must read the
    // players' own wins-losses, so 10-30, never the raw field order 30-10.
    expect(screen.getByText('Faced 40 times, players went 10-30')).toBeInTheDocument();
  });

  // Fix 1: this is the test that would have caught the inversion. Using the spec's own worked
  // example (37 faced battles, facedWins 25, facedLosses 12) means the expected string below,
  // "players went 12-25", is checked against the spec text itself rather than re-derived from the
  // (possibly still-wrong) implementation.
  it('matches the spec worked example: faced 37 times, players went 12-25', async () => {
    await renderTeams({
      battles: 100,
      devices: 4,
      cores: [],
      teams: [FACED_SPEC_EXAMPLE],
      generated: [],
    });
    await openEveryRow();
    expect(screen.getByText('Faced 37 times, players went 12-25')).toBeInTheDocument();
  });

  // I3: every branch of `recordLine` used to read "1 times". Day one on the front door is
  // exactly the one-battle regime, so all four are pinned at n = 1.
  it('says "1 time" rather than "1 times", in every branch', async () => {
    await renderTeams({
      battles: 4,
      devices: 2,
      cores: [],
      teams: [ONE_RUN, ONE_FACED, ONE_EACH, ONE_UNDECIDED],
      generated: [],
    });
    await openEveryRow();
    expect(screen.getByText('Run 1 time, reporters went 1-0')).toBeInTheDocument();
    expect(screen.getByText('Faced 1 time, players went 0-1')).toBeInTheDocument();
    expect(
      screen.getByText('Run 1 time and faced 1 time, the team went 2-0 overall'),
    ).toBeInTheDocument();
    expect(screen.getByText('Seen 1 time, no result recorded')).toBeInTheDocument();
    expect(screen.queryByText(/1 times/)).toBeNull();
  });

  it('names the team, not the players, for a run-and-faced row', async () => {
    await renderTeams({ battles: 100, devices: 4, cores: [], teams: [COMBINED], generated: [] });
    await openEveryRow();
    // wins = runWins (7) + facedWins (25) = 32, the team's own wins across both roles.
    expect(
      screen.getByText('Run 10 times and faced 37 times, the team went 32-15 overall'),
    ).toBeInTheDocument();
  });

  it('nests complete teams under their core', async () => {
    await renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    await openEveryRow();
    expect(screen.getByText('Built as')).toBeInTheDocument();
    expect(screen.getByText('Core')).toBeInTheDocument();
  });

  it('says when a core has never been seen complete', async () => {
    await renderTeams({ battles: 100, devices: 4, cores: [LONELY_CORE], teams: [], generated: [] });
    await openEveryRow();
    expect(screen.getByText(/Never seen complete/)).toBeInTheDocument();
  });

  // Fix round 1, item 1: `core.builds` nests generated teams alongside observed ones, so "seen
  // with" and "never seen complete" must filter to observed builds only, or a core reads as
  // having been played complete when only a projection ever named that third.
  it('still says never seen complete when a core only has a generated build under it', async () => {
    await renderTeams({
      battles: 100,
      devices: 4,
      cores: [GEN_CORE],
      teams: [],
      generated: [GEN_MATCH_LONELY],
    });
    await openEveryRow();
    // The generated team IS nested and shown (source is honestly labelled 'Projected'), but the
    // "seen with" sentence must not fire off a build nobody actually played.
    expect(screen.getByText('Built as')).toBeInTheDocument();
    expect(screen.getAllByText('Projected').length).toBeGreaterThan(0);
    expect(screen.getByText(/Never seen complete/)).toBeInTheDocument();
    expect(screen.queryByText(/Seen with/)).toBeNull();
  });

  it('never names a generated third in "seen with", even nested alongside a real one', async () => {
    const { container } = await renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE],
      teams: [FULL],
      generated: [GEN_MATCH_CORE],
    });
    await openEveryRow();
    // The thirds a core has been seen with are tokens now rather than a sentence, but the rule
    // they enforce is the same one: only a third somebody actually played may appear here.
    expect(screen.getByText('Seen with')).toBeInTheDocument();
    const chips = Array.from(container.querySelectorAll('.third-chip')).map((c) => c.textContent);
    expect(chips).toEqual(['Tinkaton']);
    expect(screen.queryByText(/Gen B/)).toBeNull();
  });

  it('names the members that cost a row its projection, by their plain display name', async () => {
    await renderTeams({ battles: 100, devices: 4, cores: [], teams: [OUTSIDER], generated: [] });
    await openEveryRow();
    expect(
      screen.getByText(
        'No projection: Stranger is outside the ranked list this site ships projections for.',
      ),
    ).toBeInTheDocument();
  });

  it('says how much of the real facing the projections speak for, with the accent on Pokémon', async () => {
    await renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE],
      teams: [],
      generated: [],
      weightCovered: 0.6,
    });
    await openRanked();
    // Fix round 1, minor: "Pokemon" -> "Pokémon", the accent CLAUDE.md asks for everywhere else
    // on this site.
    expect(screen.getByText(/Projections cover the \d+ Pokémon PvPoke lists/)).toBeInTheDocument();
    expect(screen.getByText(/which is 60% of what players actually faced/)).toBeInTheDocument();
  });

  // Fix round 1, item 4: `covered = ctx?.weightCovered ?? 0` and `projectionless: ctx === null`
  // are the same condition, so without this guard the coverage note would fire with "0%" right
  // above the "Projections are unavailable" note when the slice itself failed.
  it('does not show the coverage note when the slice itself could not be loaded', async () => {
    await renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE],
      teams: [],
      generated: [],
      sliceMissing: true,
    });
    // "Projections are unavailable right now" is a warning, above the list, never hidden behind
    // the Term (ruling 4's "Warnings stay at the top").
    expect(screen.getByText(/Projections are unavailable right now/)).toBeInTheDocument();
    await openRanked();
    expect(screen.queryByText(/Pokémon PvPoke lists/)).toBeNull();
  });

  it('warns when the epoch expects a different PvPoke commit', async () => {
    await renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE],
      teams: [],
      generated: [],
      mismatch: true,
    });
    expect(screen.getByText(/may still describe the old movesets/)).toBeInTheDocument();
  });

  it('gives every complete team Open in Build and Run this team, nothing nested', async () => {
    await renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    await openEveryRow();
    const opens = screen.getAllByRole('button', { name: /Open in Build/ });
    const runs = screen.getAllByRole('button', { name: /Run this team/ });
    // C1: a core carries no action of its own, so every action here belongs to a real
    // three-member team (FULL, nested under CORE and on its own row).
    expect(opens.length).toBeGreaterThanOrEqual(1);
    expect(runs).toHaveLength(opens.length);
    for (const open of opens) {
      fireEvent.click(open);
      // The in-app team route pick3's own links use, so the same parsing reads it.
      expect(teamPathMembers(window.location.hash)).toHaveLength(3);
      expect(open.querySelector('a, button')).toBeNull();
    }
  });

  it('gives a projected row both actions too, since a projection still names three', async () => {
    await renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: GENERATED });
    await openEveryRow();
    fireEvent.click(screen.getByRole('button', { name: /Run this team/ }));
    expect(window.location.hash).toMatch(/^#\/meta\/new\?team=/);
    expect(window.location.hash.replace('#/meta/new?team=', '').split('+').sort()).toEqual([
      'gen_a',
      'gen_b',
      'gen_c',
    ]);
    fireEvent.click(screen.getByRole('button', { name: /Open in Build/ }));
    expect(teamPathMembers(window.location.hash).sort()).toEqual(['gen_a', 'gen_b', 'gen_c']);
  });

  // C1: a core is two species and pick3's team link needs three, so a core's actions are its
  // builds' (`row.builds`, already sorted by score), never its own pair.
  it('acts on a core through its builds, never on its own two-member pair', async () => {
    await renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    await openEveryRow();
    const opens = screen.getAllByRole('button', { name: /Open in Build/ });
    expect(opens.length).toBeGreaterThanOrEqual(1);
    for (const open of opens) {
      fireEvent.click(open);
      expect(teamPathMembers(window.location.hash).sort()).toEqual([
        'azumarill',
        'clodsire',
        'tinkaton',
      ]);
    }
    for (const run of screen.getAllByRole('button', { name: /Run this team/ })) {
      fireEvent.click(run);
      expect(window.location.hash.replace('#/meta/new?team=', '').split('+').sort()).toEqual([
        'azumarill',
        'clodsire',
        'tinkaton',
      ]);
    }
  });

  // C1: and a core nobody has been seen complete with has no three-member team to act on, so it
  // carries no action rather than a broken one.
  it('gives a core with no complete team under it no team action at all', async () => {
    await renderTeams({ battles: 100, devices: 4, cores: [LONELY_CORE], teams: [], generated: [] });
    await openEveryRow();
    expect(screen.getByText(/Never seen complete/)).toBeInTheDocument();
    expect(screen.queryAllByText(/Open in Build/)).toHaveLength(0);
    expect(screen.queryAllByText(/Run this team/)).toHaveLength(0);
  });

  // Fix round 1, item 7 (superseded by the matchup-score change): `matchupScoreLine` builds the
  // whole "Matchup score N of 100" string in one function, so a future change cannot split the
  // number from its unit across two elements the way the old caveat could once have been split
  // from its percentage.
  it('prints the matchup score as a whole number out of 100, in one element', async () => {
    await renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: GENERATED });
    await openEveryRow();
    expect(screen.getByText(/^Matchup score \d+ of 100$/)).toBeInTheDocument();
  });

  // The `Term` explaining the matchup score is hosted once in the section header (folded into
  // "How it is ranked", ruling 4), never inside a card: a card WITH nested builds is a link-free
  // div (see `Card`), but a link-less complete-team card is itself an `<a>`, and a `Term` renders
  // a real `<button>`. Nesting one there would be interactive content inside an anchor, the same
  // invalid-markup problem fix round 1 already found and fixed for a nested build line's own
  // chevron link.
  it('keeps the matchup score explainer out of every row, never nested in an anchor', async () => {
    const { container } = await renderTeams({
      battles: 0,
      devices: 0,
      teams: [],
      cores: [],
      generated: GENERATED,
    });
    await openEveryRow();
    expect(screen.getByRole('button', { name: 'How it is ranked' })).toBeInTheDocument();
    for (const row of container.querySelectorAll('.tb-team-row')) {
      expect(row.querySelector('.term')).toBeNull();
    }
    // Nothing interactive nested inside anything else interactive, in either direction.
    for (const link of container.querySelectorAll('a')) {
      expect(link.querySelector('a, button')).toBeNull();
    }
    for (const button of container.querySelectorAll('button')) {
      expect(button.querySelector('a, button')).toBeNull();
    }
  });

  // Fix round 1, item 2: the explainer used to claim the matchup score is worked out "not from
  // battles anyone played", but `buildBoard` weighs coverage and the top-of-the-meta cut by the
  // BLENDED (measured-aware) weights, not PvPoke's alone. It also named only half of the safety
  // factor (a hard-losing switch) and left out the other half (an unanswered top opponent). Both
  // are corrected in the tip text; this pins the corrected wording, not the retired claim.
  it('explains the matchup score honestly: no battle result feeds it, and both safety terms', async () => {
    await renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: GENERATED });
    await openRanked();
    expect(
      screen.getByText(/weighted by how often each opponent is actually faced/),
    ).toBeInTheDocument();
    expect(screen.getByText(/not from how anyone's battles turned out/)).toBeInTheDocument();
    expect(
      screen.getByText(/whether a top opponent goes completely unanswered/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not from battles anyone played/)).toBeNull();
  });

  // Fix round 1, item 3: a failure of meta, baseline or ranks (not just the shared teams) used to
  // leave `ranking` null forever with no error surfaced, since only `teams.state` was checked.
  it('says so when any of its four sources failed to load, with a Try again that refetches', async () => {
    let retried = false;
    await renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE],
      teams: [],
      generated: [],
      boardError: true,
      onRetry: () => {
        retried = true;
      },
    });
    expect(screen.getByText('Could not load the team board.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retried).toBe(true);
  });

  it('shows a Loading state while the board is not yet ready', async () => {
    render(
      <AppProvider host={host()}>
        <TeamBoard
          league="great"
          boardError={false}
          board={null}
          ranking={null}
          epoch={null}
          bakedCommit={null}
          sources={{}}
          onRetry={() => {}}
        />
      </AppProvider>,
    );
    expect(screen.getByText('Loading the team board')).toBeInTheDocument();
  });
});

/**
 * The board's shape and its controls. With the ranking rework a live league carries hundreds of
 * cores, so the row is collapsed by default and the reader thins and re-orders the list rather
 * than scrolling past every row. The rules these pin: nothing is lost in the collapse (every
 * sentence is one tap away, which the suite above checks), the blended score still orders the
 * board by default and still never appears as a number or as a sort label, and a control is only
 * offered when it would actually do something.
 */
describe('Top teams board, the board controls', () => {
  /** A second complete team on the same pair as FULL, so CORE is a core seen in TWO teams: the
   * only shape the multi-team filter keeps. */
  const FULL_TWO = row(['azumarill', 'clodsire', 'oppa'], 'team', {
    runBattles: 8,
    runWins: 5,
    runLosses: 3,
  });

  function titles(): string[] {
    return Array.from(document.querySelectorAll('.row-title')).map((el) => el.textContent ?? '');
  }

  function heads(): HTMLElement[] {
    return Array.from(document.querySelectorAll('.row-head'));
  }

  it('renders every row collapsed, with its summary on one line', async () => {
    await renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    // The glanceable version of the record, plus the one fact a core has that a team does not.
    expect(screen.getByText('Run in 40 battles · went 22-18 · 1 team')).toBeInTheDocument();
    // The full sentence and the matchup score are in the panel, which is shut.
    expect(screen.queryByText(/Matchup score \d+ of 100/)).toBeNull();
    expect(screen.queryByText(/reporters went 22-18/)).toBeNull();
  });

  it('opens a row on tap and shuts it again on a second tap', async () => {
    await renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    const head = heads()[0]!;
    expect(head.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(head);
    expect(screen.getByText('Run 40 times, reporters went 22-18')).toBeInTheDocument();
    fireEvent.click(heads()[0]!);
    expect(screen.queryByText('Run 40 times, reporters went 22-18')).toBeNull();
  });

  it('names the row and its matchup score for a screen reader, since the figure stands alone', async () => {
    await renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    const label = heads()[0]!.getAttribute('aria-label') ?? '';
    expect(label).toContain('Azumarill, Clodsire');
    expect(label).toMatch(/Matchup score \d+ of 100/);
  });

  it('counts what is on screen, by kind', async () => {
    await renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE, LONELY_CORE],
      teams: [FULL],
      generated: [],
    });
    expect(screen.getByText('2 cores')).toBeInTheDocument();
  });

  it('offers no multi-team filter when no core is in more than one team', async () => {
    await renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    expect(screen.queryByRole('button', { name: 'Multi-team only' })).toBeNull();
  });

  it('drops the cores that only restate a single team when asked', async () => {
    await renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE, LONELY_CORE],
      teams: [FULL, FULL_TWO],
      generated: [],
    });
    expect(titles()).toContain('Lonely A, Lonely B');
    fireEvent.click(screen.getByRole('button', { name: 'Multi-team only' }));
    expect(titles()).toEqual(['Azumarill, Clodsire']);
    expect(screen.getByText('1 core')).toBeInTheDocument();
  });

  it('stops thinning rows once the filter is hidden, as after a league switch', async () => {
    const ranking = makeRanking(480, 9);
    const boardOf = (teams: TeamRowV1[], cores: TeamRowV1[]) =>
      buildBoard({ teams: makeTeams(480, 9, teams, cores), ranking, generated: [], view: view() });
    const props = {
      league: 'great',
      boardError: false,
      ranking,
      epoch: null,
      bakedCommit: BAKED_COMMIT,
      sources: {},
      onRetry: () => {},
    };
    const h = host();
    const view_ = render(
      <AppProvider host={h}>
        <Probe />
        <TeamBoard {...props} board={boardOf([FULL, FULL_TWO], [CORE, LONELY_CORE])} />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.boot).toBe('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Multi-team only' }));
    expect(titles()).toEqual(['Azumarill, Clodsire']);
    // The next league's board has no core in two teams, so the chip is gone; its state must not
    // keep filtering rows the reader can no longer un-filter.
    view_.rerender(
      <AppProvider host={h}>
        <Probe />
        <TeamBoard {...props} board={boardOf([FULL], [CORE, LONELY_CORE])} />
      </AppProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Multi-team only' })).toBeNull();
    expect(titles()).toContain('Lonely A, Lonely B');
  });

  it("starts on the board's own ranked order, which has no number attached to it", async () => {
    await renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    expect(screen.getByLabelText('Sort')).toHaveValue('ranked');
    expect(screen.getByText('Sort: Ranked')).toBeInTheDocument();
  });

  // Sort is a menu now, not a cycle (ruling: "InlineSelect labelled 'Sort' over SORTS and
  // choosing sets the order, no cycling"): every option is reachable in one choice.
  it('sets the order directly from a menu, no cycling', async () => {
    await renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    const select = screen.getByLabelText('Sort');
    for (const [value, label] of [
      ['matchup', 'Matchup'],
      ['spread', 'Spread'],
      ['usage', 'Usage'],
      ['ranked', 'Ranked'],
    ] as const) {
      fireEvent.change(select, { target: { value } });
      expect(select).toHaveValue(value);
      expect(screen.getByText(`Sort: ${label}`)).toBeInTheDocument();
    }
  });

  it('orders by battles behind a row under the usage sort', async () => {
    await renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE, LONELY_CORE, GEN_CORE],
      teams: [FULL],
      generated: [],
    });
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'usage' } });
    // CORE 40 battles, LONELY_CORE 9, GEN_CORE 5.
    expect(titles()).toEqual(['Azumarill, Clodsire', 'Lonely A, Lonely B', 'Faced C, Lonely A']);
  });

  // Two taps inside one React batch both read the same `openRows`, so a spread of the captured
  // object would drop the first row's state. The screenshot pass taps three heads in one tick
  // and only ever opened the last one.
  it('opens every row tapped in the same tick, not just the last one', async () => {
    await renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE, LONELY_CORE, GEN_CORE],
      teams: [FULL],
      generated: [],
    });
    const [first, second] = heads();
    act(() => {
      first!.click();
      second!.click();
    });
    expect(heads().filter((h) => h.getAttribute('aria-expanded') === 'true')).toHaveLength(2);
  });

  it('keeps a row open while the sort moves it', async () => {
    await renderTeams({
      battles: 480,
      devices: 9,
      cores: [CORE, LONELY_CORE, GEN_CORE],
      teams: [FULL],
      generated: [],
    });
    fireEvent.click(heads()[0]!);
    const opened = heads()[0]!.getAttribute('aria-label');
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'matchup' } });
    const stillOpen = heads().filter((h) => h.getAttribute('aria-expanded') === 'true');
    expect(stillOpen).toHaveLength(1);
    expect(stillOpen[0]!.getAttribute('aria-label')).toBe(opened);
  });

  it('shows the Core, Team or Projected label as a read-only Tag in an open row', async () => {
    await renderTeams({ battles: 480, devices: 9, cores: [CORE], teams: [FULL], generated: [] });
    await openEveryRow();
    const coreTag = screen.getAllByText('Core')[0]!;
    expect(coreTag.className).toMatch(/ui-tag/);
    const teamTag = screen.getAllByText('Full team')[0]!;
    expect(teamTag.className).toMatch(/ui-tag/);
  });

  it('shows the Projected tag as a Tag on a collapsed generated row too', async () => {
    await renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: GENERATED });
    const projected = screen.getAllByText('Projected')[0]!;
    expect(projected.className).toMatch(/ui-tag/);
  });

  // Regression guard: `headLabel` already filtered empty parts before this join, so a generated
  // row's aria-label never had a literal '. .' in it even when `subLine` still returned ''. This
  // pins that invariant now that a generated row's part is 'Projected' (`rowSubText`) rather than
  // '', so a future change to either function cannot reintroduce the double-period join.
  it("a collapsed generated row's aria-label has no '. .' sequence", async () => {
    await renderTeams({ battles: 0, devices: 0, teams: [], cores: [], generated: GENERATED });
    for (const head of heads()) {
      expect(head.getAttribute('aria-label') ?? '').not.toMatch(/\.\s*\./);
    }
  });

  // Review Focus 2: three long spelled names on one row. The CSS ellipsis itself is checked in
  // the captures (app.css's `.row-title` already truncates); what a unit test can pin is that the
  // score stays on the row and renders as a real number, not blanked or pushed off by the long
  // title.
  it('keeps the matchup score on the row when its title is three long spelled names', async () => {
    await renderTeams({
      battles: 5,
      devices: 2,
      cores: [],
      teams: [LONG_NAMES_TEAM],
      generated: [],
    });
    const title = document.querySelector('.row-title');
    expect(title).not.toBeNull();
    // buildBoard may reorder a row's own species (by rank), so this checks the three long names
    // are all present rather than pinning an order the row's own component list does not promise.
    const text = title!.textContent ?? '';
    for (const name of ['Shadow Alolan Ninetales', 'Galarian Stunfisk', 'Shadow Sableye']) {
      expect(text).toContain(name);
    }
    const score = document.querySelector('.row-score');
    expect(score).not.toBeNull();
    expect(score!.textContent ?? '').toMatch(/^\d+$/);
  });
});
