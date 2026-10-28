// Synthetic datamine template builders. Every species, move and value here is invented.

export interface Template {
  templateId: string;
  data: Record<string, unknown>;
}

function wrap(templateId: string, key: string, body: unknown): Template {
  return { templateId, data: { templateId, [key]: body } };
}

export const ENUM_TYPES = [
  'normal',
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark',
  'fairy',
];

export function tCombatMove(templateId: string, combatMove: Record<string, unknown>): Template {
  return wrap(templateId, 'combatMove', combatMove);
}

export function tPokemon(templateId: string, pokemonSettings: Record<string, unknown>): Template {
  return wrap(templateId, 'pokemonSettings', pokemonSettings);
}

export function tForms(pokemon: string, forms: Record<string, unknown>[]): Template {
  return wrap(`FORMS_${pokemon}`, 'formSettings', { pokemon, forms });
}

export function tType(attackType: string, attackScalar: number[]): Template {
  return wrap(attackType, 'typeEffective', { attackType, attackScalar });
}

export function tCombatSettings(over: Record<string, unknown> = {}): Template {
  return wrap('COMBAT_SETTINGS', 'combatSettings', {
    roundDurationSeconds: 240,
    turnDurationSeconds: 0.5,
    sameTypeAttackBonusMultiplier: 1.2,
    fastAttackBonusMultiplier: 1.3,
    chargeAttackBonusMultiplier: 1.3,
    maxEnergy: 100,
    shadowPokemonAttackBonusMultiplier: 1.2,
    shadowPokemonDefenseBonusMultiplier: 0.8333333,
    ...over,
  });
}

export function tStageSettings(over: Record<string, unknown> = {}): Template {
  return wrap('COMBAT_STAT_STAGE_SETTINGS', 'combatStatStageSettings', {
    minimumStatStage: -1,
    maximumStatStage: 1,
    attackBuffMultiplier: [0.8, 1, 1.25],
    defenseBuffMultiplier: [0.8, 1, 1.25],
    ...over,
  });
}

export function tPlayerLevel(cpMultiplier: number[]): Template {
  return wrap('PLAYER_LEVEL_SETTINGS', 'playerLevel', { cpMultiplier });
}

export function tLeague(templateId: string, combatLeague: Record<string, unknown>): Template {
  return wrap(templateId, 'combatLeague', combatLeague);
}

/** The datamine type enum order, as 18 templates with neutral scalars, in alphabetical (file) order. */
export function typeTemplates(): Template[] {
  return [...ENUM_TYPES].sort().map((t) =>
    tType(
      `POKEMON_TYPE_${t.toUpperCase()}`,
      ENUM_TYPES.map(() => 1),
    ),
  );
}

export function minimalTemplates(): Template[] {
  return [...typeTemplates(), tCombatSettings(), tStageSettings(), tPlayerLevel([0.1, 0.2, 0.3])];
}
