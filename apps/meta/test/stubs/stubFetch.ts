/**
 * One stub for every request the site makes: the four baked files, the baseline, and the two read
 * endpoints. Pass overrides to shape a scenario; the defaults are an empty measured dataset, which
 * is the state the site actually ships in.
 */
import type { MetaSummaryV1, SpeciesDetailV1, TeamsV1 } from '../../src/api.js';
import type { Epoch } from '../../src/epochs.js';

export interface StubOptions {
  meta?: Partial<MetaSummaryV1>;
  species?: Partial<SpeciesDetailV1>;
  metaStatus?: number;
  epochs?: Epoch[];
  teams?: Partial<TeamsV1>;
}

export const EMPTY_META: MetaSummaryV1 = {
  league: 'great',
  since: '2026-09-08T20:00:00.000Z',
  until: '2026-09-18T12:00:00.000Z',
  band: 'all',
  battles: 0,
  tanked: 0,
  devices: 0,
  bands: {},
  sources: {},
  species: [],
  teams: [],
  previous: null,
  generatedAt: '2026-09-18T11:50:00.000Z',
};

export const EMPTY_TEAMS: TeamsV1 = {
  league: 'great',
  since: EMPTY_META.since,
  until: EMPTY_META.until,
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
    if (url.startsWith('/baseline/')) {
      const league = url.slice('/baseline/'.length).replace('.json', '');
      return json(baselineFile(league));
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
