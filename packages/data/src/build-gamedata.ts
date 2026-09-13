import fs from 'node:fs';
import path from 'node:path';
import type { GameData, Move, PokemonType, Species } from '@pickthree/engine';
import { GAMEMASTER_PATH } from './paths.js';

interface RawPokemon {
  dex: number;
  speciesName: string;
  speciesId: string;
  baseStats: { atk: number; def: number; hp: number };
  types: string[];
  fastMoves: string[];
  chargedMoves: string[];
  eliteMoves?: string[];
  legacyMoves?: string[];
  tags?: string[];
  family?: { id: string; parent?: string; evolutions?: string[] };
  released?: boolean;
  thirdMoveCost?: number | false;
  levelCap?: number;
  levelFloor?: number;
  defaultIVs?: Record<string, [number, number, number, number]>;
  formChange?: {
    type: 'set' | 'toggle';
    trigger: string;
    moveId?: string;
    moveIDs?: string[];
    alternativeFormId?: string;
    defaultFormId?: string;
    effect?: string;
    resetOnSwitch?: boolean;
  };
}

interface RawMove {
  moveId: string;
  name: string;
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  turns?: number;
  cooldown: number;
  buffs?: [number, number];
  buffTarget?: string;
  buffApplyChance?: string | number;
  buffsSelf?: [number, number];
  buffsOpponent?: [number, number];
  archetype?: string;
}

interface RawGameMaster {
  timestamp: string;
  settings: { maxBuffStages: number; buffDivisor: number };
  rankingScenarios: { slug: string; shields: [number, number]; energy: [number, number] }[];
  greatLeagueIneligible: string[];
  pokemon: RawPokemon[];
  moves: RawMove[];
}

function asType(t: string | undefined): PokemonType | 'none' {
  return (t ?? 'none') as PokemonType | 'none';
}

export function buildGameData(input: unknown): GameData {
  const gm = input as RawGameMaster;
  const banned = new Set(gm.greatLeagueIneligible);

  const children = new Map<string, string[]>();
  for (const p of gm.pokemon) {
    const parent = p.family?.parent;
    if (parent) {
      const list = children.get(parent) ?? [];
      list.push(p.speciesId);
      children.set(parent, list);
    }
  }

  const species: Species[] = gm.pokemon.map((p) => {
    const tags = p.tags ?? [];
    const evolutions = p.family?.evolutions ?? children.get(p.speciesId) ?? [];
    return {
      speciesId: p.speciesId,
      speciesName: p.speciesName,
      dex: p.dex,
      types: [asType(p.types[0]) as PokemonType, asType(p.types[1])],
      baseStats: { ...p.baseStats },
      fastMoves: [...p.fastMoves],
      chargedMoves: [...p.chargedMoves],
      eliteMoves: [...(p.eliteMoves ?? [])],
      legacyMoves: [...(p.legacyMoves ?? [])],
      tags: [...tags],
      familyId: p.family?.id ?? null,
      parentId: p.family?.parent ?? null,
      evolutionIds: [...evolutions].sort(),
      shadow: tags.includes('shadow'),
      shadowEligible: tags.includes('shadoweligible'),
      released: p.released !== false,
      // PvPoke marks a species that cannot learn a second charged move (Smeargle) with false.
      thirdMoveCost: typeof p.thirdMoveCost === 'number' ? p.thirdMoveCost : 0,
      levelCap: p.levelCap ?? null,
      levelFloor: p.levelFloor ?? null,
      greatLeagueIneligible: banned.has(p.speciesId),
      defaultIVs: { ...(p.defaultIVs ?? {}) },
      formChange: p.formChange
        ? {
            type: p.formChange.type,
            trigger: p.formChange.trigger,
            moveIds: [
              ...(p.formChange.moveIDs ?? []),
              ...(p.formChange.moveId && p.formChange.moveId !== 'ANY'
                ? [p.formChange.moveId]
                : []),
            ],
            alternativeFormId:
              p.formChange.alternativeFormId && p.formChange.alternativeFormId !== 'variable'
                ? p.formChange.alternativeFormId
                : null,
            defaultFormId: p.formChange.defaultFormId ?? null,
            effect: p.formChange.effect ?? null,
            resetOnSwitch: p.formChange.resetOnSwitch ?? false,
          }
        : null,
    };
  });

  const moves: Move[] = gm.moves.map((m) => ({
    moveId: m.moveId,
    name: m.name,
    type: m.type as PokemonType,
    power: m.power,
    energy: m.energy,
    energyGain: m.energyGain,
    turns: m.turns ?? Math.round(m.cooldown / 500),
    cooldown: m.cooldown,
    buffs: m.buffs ? [m.buffs[0], m.buffs[1]] : null,
    buffTarget: (m.buffTarget as Move['buffTarget']) ?? null,
    buffApplyChance: m.buffApplyChance === undefined ? null : Number(m.buffApplyChance),
    buffsSelf: m.buffsSelf ? [m.buffsSelf[0], m.buffsSelf[1]] : null,
    buffsOpponent: m.buffsOpponent ? [m.buffsOpponent[0], m.buffsOpponent[1]] : null,
    archetype: m.archetype ?? null,
  }));

  return {
    species,
    moves,
    rankingScenarios: gm.rankingScenarios.map((s) => ({
      slug: s.slug,
      shields: s.shields,
      energy: s.energy,
    })),
    settings: { maxBuffStages: gm.settings.maxBuffStages, buffDivisor: gm.settings.buffDivisor },
    gamemasterTimestamp: gm.timestamp,
  };
}

export function readRawGameMaster(): unknown {
  return JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8')) as unknown;
}

export function writeGameData(outDir: string): GameData {
  const data = buildGameData(readRawGameMaster());
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'pokemon.json'), JSON.stringify(data.species));
  fs.writeFileSync(path.join(outDir, 'moves.json'), JSON.stringify(data.moves));
  fs.writeFileSync(
    path.join(outDir, 'gamedata-meta.json'),
    JSON.stringify({
      rankingScenarios: data.rankingScenarios,
      settings: data.settings,
      gamemasterTimestamp: data.gamemasterTimestamp,
    }),
  );
  return data;
}
