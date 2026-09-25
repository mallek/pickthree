import type { TeamRecommendation } from '@pickthree/engine';

export interface TeamFixtureInput {
  id: string;
  species: [string, string, string];
  battle: number;
  total: number;
  fit: 'Strong' | 'Solid' | 'Situational' | 'Weak';
  difficulty: 'Easy' | 'Moderate' | 'Demanding';
  stardust: number;
  structure: 'ABB' | 'ABC';
}

const DEFAULTS: TeamFixtureInput = {
  id: 't1',
  species: ['morpeko_full_belly', 'snorlax', 'tinkaton'],
  battle: 88,
  total: 84,
  fit: 'Strong',
  difficulty: 'Moderate',
  stardust: 263900,
  structure: 'ABC',
};

const ROLES = ['lead', 'switch', 'closer'] as const;

/**
 * A TeamRecommendation with only the fields the Teams screen and its components read. The engine
 * type is much larger; the cast keeps the fixture honest about what the UI depends on.
 */
export function makeTeam(over: Partial<TeamFixtureInput> = {}): TeamRecommendation {
  const t = { ...DEFAULTS, ...over };
  return {
    id: t.id,
    structure: t.structure,
    slots: t.species.map((speciesId, i) => ({
      role: ROLES[i],
      roleWhy: `${speciesId} role`,
      candidate: { build: { speciesId, specimenId: `${t.id}-${speciesId}` } },
      sim: { results: [], wins: 0 },
    })),
    score: {
      battle: t.battle,
      total: t.total,
      fit: t.fit,
      difficulty: t.difficulty,
      difficultyWhy: 'Snorlax needs to bait one shield.',
      factors: { coverage: 0, consistency: 0, safety: 0, cost: 0, accessibility: 0 },
      topUncovered: 0,
      coveredOpponents: [],
      uncoveredOpponents: [],
    },
    explanation: {
      why: `${t.species[0]} leads and handles the top threats.`,
      roleWhy: {
        lead: `${t.species[0]} opens the battle and handles the top threats.`,
        switch: `${t.species[1]} comes in safely when the lead matchup goes badly.`,
        closer: `${t.species[2]} finishes the battle once shields are gone.`,
      },
      slotDetail: [
        {
          types: ['normal', 'none'],
          weaknesses: [],
          resistances: [],
          shieldLine: '',
          keepShield: null,
          moveReads: [],
          formNote: null,
        },
        {
          types: ['normal', 'none'],
          weaknesses: [],
          resistances: [],
          shieldLine: '',
          keepShield: null,
          moveReads: [],
          formNote: null,
        },
        {
          types: ['normal', 'none'],
          weaknesses: [],
          resistances: [],
          shieldLine: '',
          keepShield: null,
          moveReads: [],
          formNote: null,
        },
      ],
      switchPlan: [
        {
          opponent: t.species[1],
          opponentName: t.species[1],
          opponentTypes: ['normal', 'none'],
          opponentRank: 5,
          to: 1,
          toName: t.species[1],
          rating: 60,
          line: `Switch to ${t.species[1]}.`,
        },
      ],
    },
    cost: { stardust: t.stardust, candy: 255, xlCandy: 0, eliteTm: 1 },
    hasShadow: false,
    needsXl: false,
    eliteTms: 1,
    leadCounters: [],
  } as unknown as TeamRecommendation;
}
