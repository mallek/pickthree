import type { PokemonType } from './types.js';

export const TYPES: PokemonType[] = [
  'normal',
  'fire',
  'water',
  'grass',
  'electric',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
];

/** Pokemon GO multipliers: super effective 1.6, not very effective 0.625, immune 0.390625. */
export const SUPER = 1.6;
export const RESIST = 0.625;
export const IMMUNE = 0.390625;

const SE: Record<PokemonType, PokemonType[]> = {
  normal: [],
  fire: ['grass', 'ice', 'bug', 'steel'],
  water: ['fire', 'ground', 'rock'],
  grass: ['water', 'ground', 'rock'],
  electric: ['water', 'flying'],
  ice: ['grass', 'ground', 'flying', 'dragon'],
  fighting: ['normal', 'ice', 'rock', 'dark', 'steel'],
  poison: ['grass', 'fairy'],
  ground: ['fire', 'electric', 'poison', 'rock', 'steel'],
  flying: ['grass', 'fighting', 'bug'],
  psychic: ['fighting', 'poison'],
  bug: ['grass', 'psychic', 'dark'],
  rock: ['fire', 'ice', 'flying', 'bug'],
  ghost: ['psychic', 'ghost'],
  dragon: ['dragon'],
  dark: ['psychic', 'ghost'],
  steel: ['ice', 'rock', 'fairy'],
  fairy: ['fighting', 'dragon', 'dark'],
};

const NVE: Record<PokemonType, PokemonType[]> = {
  normal: ['rock', 'steel'],
  fire: ['fire', 'water', 'rock', 'dragon'],
  water: ['water', 'grass', 'dragon'],
  grass: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'],
  electric: ['grass', 'electric', 'dragon'],
  ice: ['fire', 'water', 'ice', 'steel'],
  fighting: ['poison', 'flying', 'psychic', 'bug', 'fairy'],
  poison: ['poison', 'ground', 'rock', 'ghost'],
  ground: ['grass', 'bug'],
  flying: ['electric', 'rock', 'steel'],
  psychic: ['psychic', 'steel'],
  bug: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'],
  rock: ['fighting', 'ground', 'steel'],
  ghost: ['dark'],
  dragon: ['steel'],
  dark: ['fighting', 'dark', 'fairy'],
  steel: ['fire', 'water', 'electric', 'steel'],
  fairy: ['fire', 'poison', 'steel'],
};

const IMM: Record<PokemonType, PokemonType[]> = {
  normal: ['ghost'],
  fire: [],
  water: [],
  grass: [],
  electric: ['ground'],
  ice: [],
  fighting: ['ghost'],
  poison: ['steel'],
  ground: ['flying'],
  flying: [],
  psychic: ['dark'],
  bug: [],
  rock: [],
  ghost: ['normal'],
  dragon: ['fairy'],
  dark: [],
  steel: [],
  fairy: [],
};

/** Multiplier of an attack type against one defending type. */
export function single(attack: PokemonType, defend: PokemonType): number {
  if (IMM[attack].includes(defend)) {
    return IMMUNE;
  }
  if (SE[attack].includes(defend)) {
    return SUPER;
  }
  if (NVE[attack].includes(defend)) {
    return RESIST;
  }
  return 1;
}

/** Combined multiplier against a mono or dual typed defender. */
export function effectiveness(
  attack: PokemonType,
  defend: [PokemonType, PokemonType | 'none'],
): number {
  let m = single(attack, defend[0]);
  if (defend[1] !== 'none') {
    m *= single(attack, defend[1]);
  }
  return m;
}

export type Efficacy = 'super' | 'neutral' | 'resisted';

export function classify(multiplier: number): Efficacy {
  if (multiplier > 1.01) {
    return 'super';
  }
  if (multiplier < 0.99) {
    return 'resisted';
  }
  return 'neutral';
}

/** Attack types that are super effective against a defender. */
export function weaknesses(defend: [PokemonType, PokemonType | 'none']): PokemonType[] {
  return TYPES.filter((t) => effectiveness(t, defend) > 1.01);
}

/** Attack types the defender resists (including immunities). */
export function resistances(defend: [PokemonType, PokemonType | 'none']): PokemonType[] {
  return TYPES.filter((t) => effectiveness(t, defend) < 0.99);
}
