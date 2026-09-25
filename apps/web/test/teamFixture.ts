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

/** One candidate: a built, costed, movesetted Pokémon, minimal but complete enough that the real
 * components (MoveRows, cost lines, IV lines) render without crashing. */
function candidateFor(speciesId: string, id: string, matrixRow: number) {
  return {
    build: {
      specimenId: id,
      specimen: {
        id,
        speciesId,
        familyId: speciesId,
        ivs: { atk: 12, def: 14, sta: 13 },
        level: { min: 20, max: 20 },
        cp: 1350,
        hp: 120,
        shadow: false,
        purified: false,
        lucky: false,
        currentMoves: { fast: null, charged: [] },
        scannedAt: '2026-09-01',
        raw: {} as never,
      },
      speciesId,
      shadow: false,
      stageOffset: 0,
      level: 25,
      cp: 1490,
      ivs: { atk: 12, def: 14, sta: 13 },
      ivRank: { rank: 120, total: 4096 },
      needsXl: false,
    },
    moveset: {
      fast: {
        moveId: 'FAST',
        name: 'Fast Move',
        type: 'normal',
        tm: 'have',
        energy: 8,
        energyGain: 8,
        turns: 1,
        countFromFast: null,
        counts: null,
        effects: [],
        altType: null,
      },
      charged: [
        {
          moveId: 'CHARGED',
          name: 'Charged Move',
          type: 'normal',
          tm: 'have',
          energy: 50,
          energyGain: 0,
          turns: 0,
          countFromFast: 4,
          counts: [4, 4, 3],
          effects: [],
          altType: null,
        },
      ],
      source: 'rankings',
      eliteTmCount: 0,
    },
    cost: {
      stardust: 12500,
      candy: 25,
      xlCandy: 0,
      eliteTm: 0,
      evolutionCandy: 0,
      secondMoveUnlock: false,
      powerUpSteps: 3,
      estimated: false,
      weight: 15000,
    },
    score: 80,
    overallScore: 80,
    roleScores: { leads: 80, switches: 80, closers: 80, chargers: 80 },
    matrixRow,
  };
}

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
      candidate: candidateFor(speciesId, `${t.id}-${speciesId}`, i),
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
      structureLine:
        t.structure === 'ABB'
          ? `Anything that beats your ${t.species[0]} lead loses to both your back-line Pokémon, so you win the back line either way.`
          : 'Each Pokémon covers a different slice of the meta, so no single opponent breaks the team.',
      keyWins: [
        {
          opponent: 'azumarill',
          opponentName: 'Azumarill',
          opponentTypes: ['water', 'fairy'],
          opponentRank: 2,
          line: `${t.species[0]} wins comfortably as Lead`,
        },
        {
          opponent: 'clodsire',
          opponentName: 'Clodsire',
          opponentTypes: ['poison', 'ground'],
          opponentRank: 3,
          line: `${t.species[1]} wins as Safe Switch`,
        },
      ],
      keyThreats: [
        {
          opponent: 'medicham',
          opponentName: 'Medicham',
          opponentTypes: ['fighting', 'psychic'],
          opponentRank: 10,
          line: `Close; shields decide it. Best try: ${t.species[2]}`,
        },
        {
          opponent: 'dragonite_shadow',
          opponentName: 'Dragonite',
          opponentTypes: ['dragon', 'flying'],
          opponentRank: 15,
          line: `Nobody on the team beats it. Best try: ${t.species[0]}`,
        },
      ],
      roleWhy: {
        lead: `${t.species[0]} opens the battle and handles the top threats.`,
        switch: `${t.species[1]} comes in safely when the lead matchup goes badly.`,
        closer: `${t.species[2]} finishes the battle once shields are gone.`,
      },
      alternatives: [],
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
