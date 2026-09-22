/**
 * One stub for every request the site makes: the baked static files, the baseline, the matchup
 * slice, the rank order, the generated board, and the read endpoints. Pass overrides to shape a
 * scenario; the defaults are an empty measured dataset, which is the state the site actually
 * ships in.
 */
import type { MatchupMatrix } from '@pickthree/engine/meta';
import type { MetaSummaryV1, SpeciesDetailV1, TeamsV1 } from '../../src/api.js';
import type { Epoch } from '../../src/epochs.js';
import type { GeneratedTeamLite } from '../../src/slice.js';

export interface StubOptions {
  meta?: Partial<MetaSummaryV1>;
  species?: Partial<SpeciesDetailV1>;
  metaStatus?: number;
  epochs?: Epoch[];
  teams?: Partial<TeamsV1>;
  /** The baked generated board. Defaults to GENERATED_TEAMS below. */
  generated?: GeneratedTeamLite[];
  /** 404 the matchup slice, so the site has to render with no projections at all. */
  sliceStatus?: number;
  /** The commit stamped on the slice, for the mismatch banner. Defaults to the baseline's. */
  sliceCommit?: string;
  /** The Play! ban list. Defaults to a made-up open cup with one banned species. */
  legal?: { cup: string | null; banned: string[] };
}

export const EMPTY_META: MetaSummaryV1 = {
  league: 'great',
  since: '2026-09-08T20:00:00.000Z',
  until: '2026-09-18T12:00:00.000Z',
  source: 'all',
  band: 'all',
  battles: 0,
  tanked: 0,
  devices: 0,
  bands: {},
  sources: {},
  species: [],
  teams: [],
  previous: null,
  tournament: null,
  generatedAt: '2026-09-18T11:50:00.000Z',
};

export const EMPTY_TEAMS: TeamsV1 = {
  league: 'great',
  since: EMPTY_META.since,
  until: EMPTY_META.until,
  source: 'all',
  band: 'all',
  battles: 0,
  devices: 0,
  sources: {},
  teams: [],
  cores: [],
  generatedAt: EMPTY_META.generatedAt,
};

const EPOCHS_FILE: Epoch[] = [{ at: '2026-09-08T13:00:00-07:00', note: 'Season 28' }];

export const EMPTY_SPECIES: SpeciesDetailV1 = {
  league: 'great',
  speciesId: 'azumarill',
  since: EMPTY_META.since,
  until: EMPTY_META.until,
  source: 'all',
  band: 'all',
  sightings: 0,
  wins: 0,
  losses: 0,
  runs: 0,
  runWins: 0,
  runLosses: 0,
  weekly: [],
  bands: [],
  alongside: [],
  movesets: [],
  tournament: null,
  generatedAt: EMPTY_META.generatedAt,
};

const SPECIES_FILE = {
  azumarill: ['Azumarill', 184, 'water,fairy'],
  tinkaton: ['Tinkaton', 957, 'fairy,steel'],
  clodsire: ['Clodsire', 980, 'poison,ground'],
  medicham: ['Medicham', 308, 'fighting,psychic'],
  lanturn: ['Lanturn', 171, 'water,electric'],
  registeel: ['Registeel', 379, 'steel'],
};

const MOVES_FILE = {
  BUBBLE: ['Bubble', 'water'],
  ICE_BEAM: ['Ice Beam', 'ice'],
  PLAY_ROUGH: ['Play Rough', 'fairy'],
  FAIRY_WIND: ['Fairy Wind', 'fairy'],
  GIGATON_HAMMER: ['Gigaton Hammer', 'steel'],
};

const LEAGUES_FILE = [
  { id: 'great', title: 'Great League', short: 'Great', cp: 1500 },
  { id: 'ultra', title: 'Ultra League', short: 'Ultra', cp: 2500 },
  { id: 'master', title: 'Master League', short: 'Master', cp: 10000 },
];

const SEASONS_FILE = [{ id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' }];

function baselineFile(league: string): unknown {
  return {
    league,
    source: 'pvpoke',
    pvpokeCommit: 'abc1234',
    pvpokeDate: '2026-09-10',
    species: [
      {
        speciesId: 'azumarill',
        score: 93,
        rating: 699,
        fastMove: 'BUBBLE',
        chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'],
        fastUsage: [{ moveId: 'BUBBLE', uses: 100 }],
        chargedUsage: [{ moveId: 'ICE_BEAM', uses: 90 }],
      },
      {
        speciesId: 'tinkaton',
        score: 90,
        rating: 690,
        fastMove: 'FAIRY_WIND',
        chargedMoves: ['GIGATON_HAMMER'],
        fastUsage: [],
        chargedUsage: [],
      },
    ],
  };
}

/**
 * PvPoke overall order over the species the stub knows about. `rankSpecies` reads it for the
 * prior, so a species missing from it is an unranked one: that is how a test asks for the "new
 * to the meta" marker.
 */
export const RANK_ORDER = ['azumarill', 'medicham', 'registeel', 'lanturn', 'tinkaton', 'clodsire'];

/** The slice's rows. A species outside this list has no matrix row, so a team containing it
 *  gets no projection at all: that is how a test asks for the "outside the slice" state. */
const SLICE_CANDIDATES = RANK_ORDER;
/** PvPoke's meta group, the slice's columns. A subset of the rows, as in production. */
const SLICE_OPPONENTS = ['azumarill', 'medicham', 'lanturn', 'tinkaton'];

/**
 * A rating that depends only on the two ids, so the stub is deterministic and the strong species
 * are strong against everything: azumarill and medicham win, registeel trades, the rest lose.
 * Ratings are the engine's own scale, where above 500 is a win.
 */
function ratingFor(candidate: string, opponent: string): number {
  if (candidate === opponent) {
    return 500;
  }
  if (candidate === 'azumarill' || candidate === 'medicham') {
    return 700;
  }
  if (candidate === 'registeel') {
    return opponent === 'tinkaton' ? 650 : 480;
  }
  return 250;
}

function sliceMatrix(league: string): MatchupMatrix {
  const scenarios: MatchupMatrix['scenarios'] = [
    { shields: [0, 0], energy: [0, 0] },
    { shields: [1, 1], energy: [0, 0] },
    { shields: [2, 2], energy: [0, 0] },
  ];
  const ratings: number[] = [];
  for (const candidate of SLICE_CANDIDATES) {
    for (const opponent of SLICE_OPPONENTS) {
      for (let s = 0; s < scenarios.length; s++) {
        ratings.push(ratingFor(candidate, opponent));
      }
    }
  }
  return {
    league,
    cp: 1500,
    scenarios,
    candidates: [...SLICE_CANDIDATES],
    opponents: [...SLICE_OPPONENTS],
    candidateMovesets: {},
    opponentMovesets: {},
    ratings,
  };
}

/** The baked board. Two teams, one clearly stronger, both inside the slice. */
export const GENERATED_TEAMS: GeneratedTeamLite[] = [
  {
    species: ['azumarill', 'medicham', 'registeel'],
    strength: 88,
    coverage: 100,
    consistency: 90,
    safety: 80,
    structure: 'ABC',
    exposure: [],
  },
  {
    species: ['lanturn', 'clodsire', 'tinkaton'],
    strength: 61,
    coverage: 60,
    consistency: 50,
    safety: 40,
    structure: 'ABC',
    exposure: ['medicham'],
  },
];

export function stubFetch(opts: StubOptions): typeof fetch {
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/species.json')) {
      return json(SPECIES_FILE);
    }
    if (url.startsWith('/moves.json')) {
      return json(MOVES_FILE);
    }
    if (url.startsWith('/leagues.json')) {
      return json(LEAGUES_FILE);
    }
    if (url.startsWith('/seasons.json')) {
      return json(SEASONS_FILE);
    }
    if (url.startsWith('/epochs.json')) {
      return json(opts.epochs ?? EPOCHS_FILE);
    }
    if (url.startsWith('/matrix/')) {
      if (opts.sliceStatus && opts.sliceStatus >= 400) {
        return json({ error: 'no slice' }, opts.sliceStatus);
      }
      const league = url.slice('/matrix/'.length).replace('.json', '');
      return json({
        league,
        pvpokeCommit: opts.sliceCommit ?? 'abc1234',
        pvpokeDate: '2026-09-10',
        matrix: sliceMatrix(league),
      });
    }
    if (url.startsWith('/ranks/')) {
      const league = url.slice('/ranks/'.length).replace('.json', '');
      return json({
        league,
        pvpokeCommit: 'abc1234',
        pvpokeDate: '2026-09-10',
        order: RANK_ORDER,
      });
    }
    if (url.startsWith('/legal/')) {
      return json(opts.legal ?? { cup: 'championshipseries', banned: ['mimikyu'] });
    }
    if (url.startsWith('/baseline/')) {
      const name = url.slice('/baseline/'.length).replace('.json', '');
      // The generated board shares the baseline folder: /baseline/great-teams.json.
      if (name.endsWith('-teams')) {
        return json({
          league: name.slice(0, -'-teams'.length),
          source: 'generated',
          pvpokeCommit: 'abc1234',
          pvpokeDate: '2026-09-10',
          projectionSlope: 0.006,
          projectionAnchor: 100,
          teams: opts.generated ?? GENERATED_TEAMS,
        });
      }
      return json(baselineFile(name));
    }
    if (url.startsWith('/api/v1/meta')) {
      if (opts.metaStatus && opts.metaStatus >= 400) {
        return json({ error: 'server error' }, opts.metaStatus);
      }
      return json({ ...EMPTY_META, ...opts.meta });
    }
    if (url.startsWith('/api/v1/species/')) {
      return json({ ...EMPTY_SPECIES, ...opts.species });
    }
    if (url.startsWith('/api/v1/teams')) {
      return json({ ...EMPTY_TEAMS, ...opts.teams });
    }
    return json({ error: 'not found' }, 404);
  }) as typeof fetch;
}
