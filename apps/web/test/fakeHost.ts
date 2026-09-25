import type { CountersResult, Recommendation } from '@pickthree/engine';
import { vi } from 'vitest';
import type { WorkerHost } from '../src/host/WorkerHost.ts';

export const GREAT = {
  id: 'great',
  title: 'Great League',
  short: 'Great',
  cp: 1500,
  cup: 'all',
  meta: 'great',
  kind: 'standard' as const,
  minCp: 1410,
  include: [],
  exclude: [],
  metaSize: 3,
};

export const SEASONS = [{ id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' }];

export const EMPTY_COUNTERS: CountersResult = {
  entries: [],
  facing: 'PvPoke weights only (0 of 15 battles logged)',
  blended: false,
  battles: 0,
};

/**
 * A WorkerHost stand-in: the boot and league replies the provider needs, and spies for the
 * compute calls so a test can read what options they were given.
 */
export function fakeHost(overrides: Partial<Record<keyof WorkerHost, unknown>> = {}): WorkerHost {
  const host = {
    league: 'great',
    ready: vi.fn(async () => ({
      kind: 'ready' as const,
      manifest: { pvpokeCommit: 'abc', pvpokeDate: '2026-09-10', builtAt: '2026-09-14T00:00:00Z' },
      species: {
        tinkaton: { name: 'Tinkaton', types: ['fairy', 'steel'], familyId: 'tinkaton', dex: 959 },
        azumarill: {
          name: 'Azumarill',
          types: ['water', 'fairy'],
          familyId: 'azumarill',
          dex: 184,
        },
        clodsire: { name: 'Clodsire', types: ['poison', 'ground'], familyId: 'clodsire', dex: 980 },
        medicham: {
          name: 'Medicham',
          types: ['fighting', 'psychic'],
          familyId: 'medicham',
          dex: 308,
        },
        dragonite_shadow: {
          name: 'Dragonite (Shadow)',
          types: ['dragon', 'flying'],
          familyId: 'dragonite',
          dex: 149,
        },
      },
      leagues: [GREAT],
      allSpecies: ['tinkaton', 'azumarill', 'clodsire', 'medicham', 'dragonite_shadow'],
      seasons: SEASONS,
      epochs: [],
      moves: {
        MUD_SHOT: { name: 'Mud Shot', type: 'ground' },
        PLAY_ROUGH: { name: 'Play Rough', type: 'fairy' },
        DRAGON_BREATH: { name: 'Dragon Breath', type: 'dragon' },
      },
    })),
    leagueInfo: vi.fn(async () => ({
      id: 'great',
      meta: ['tinkaton', 'azumarill', 'clodsire'],
      metaSize: 3,
      metaRanks: {
        tinkaton: { overall: 1, score: 95, role: null, roleRank: null },
        azumarill: { overall: 2, score: 92, role: null, roleRank: null },
        clodsire: { overall: 3, score: 90, role: null, roleRank: null },
      },
      analyzable: ['tinkaton', 'azumarill', 'clodsire'],
    })),
    importCsv: vi.fn(),
    recommend: vi.fn(async (): Promise<Recommendation> => ({
      teams: [],
      assumptions: {
        league: 'great',
        leagueTitle: 'Great League',
        cpCap: 1500,
        levelCap: 50,
        shields: { lead: '', switch: '', closer: '' },
        ivs: '',
        metaName: '',
        metaSize: 3,
        facing: 'PvPoke weights only (0 of 15 battles logged)',
        source: 'prior',
        pvpokeCommit: 'abc',
        pvpokeDate: '2026-09-10',
        gamemasterTimestamp: '',
        dataBuiltAt: '',
      },
      stats: {
        specimens: 0,
        eligibleBuilds: 0,
        poolSize: 0,
        triosScored: 0,
        finalists: 0,
        ms: 0,
        dropped: [],
      },
    })),
    verdicts: vi.fn(async () => ({})),
    counters: vi.fn(async () => EMPTY_COUNTERS),
    scanList: vi.fn(),
    analyze: vi.fn(),
    movePool: vi.fn(),
    // Build asks for teammates on its own once a slot is filled; by default it finds none.
    suggestTeammates: vi.fn(async () => ({
      pinLine: '',
      suggestions: [],
      assumptions: {} as never,
      stats: { standIns: 0, poolSize: 0, cores: 0, simulatedRows: 0 },
      ms: 0,
    })),
    manual: vi.fn(),
    faceoff: vi.fn(async (team: { species: string[] }, _s: unknown, opponent: string) => ({
      opponent,
      ranked: true,
      moves: [
        {
          moveId: 'COUNTER',
          name: 'Counter',
          type: 'fighting',
          countFromFast: null,
          recommended: true,
        },
        {
          moveId: 'ICE_PUNCH',
          name: 'Ice Punch',
          type: 'ice',
          countFromFast: 7,
          recommended: true,
        },
      ],
      members: team.species.map((speciesId) => ({
        speciesId,
        specimenId: null,
        realIvs: false,
        fast: 'FAST',
        charged: ['CHARGED'],
        cells: [
          { efficacy: 'resisted', multiplier: 0.625 },
          { efficacy: 'neutral', multiplier: 1 },
        ],
        grid: [600, 600, 600, 400, 400, 400, 500, 500, 500],
        wins: 3,
        evenWins: 1,
        verdict: 'shields',
      })),
      best: 0,
      battles: 27,
      ms: 1,
    })),
    ...overrides,
  };
  return host as unknown as WorkerHost;
}
