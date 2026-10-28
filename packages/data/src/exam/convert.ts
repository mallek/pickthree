import { parse } from 'yaml';
import {
  validateMechanics,
  type BattleData,
  type BattleSettings,
  type MoveBuffs,
  type MoveData,
  type SpeciesData,
  type StageChange,
  type TypeId,
} from '@pickthree/battle';
import type { PvPokeBattle, PvPokeContext } from '@pickthree/sim-pvpoke';
import type {
  PvPokeCombatant,
  PvPokeGmData,
  PvPokeGmMove,
  PvPokeGmPokemon,
} from './pvpoke-types.js';

// The rules exam runs both engines on PvPoke's numbers (spec, The exam, "Same numbers on both sides"),
// so a data difference can never pose as a rules bug. Everything below is read from PvPoke itself:
// the game master inside the vm context, and constants evaluated in that context.

/** PvPoke's 240000 ms battle guard (Battle.js:636) in 500 ms turns. */
const ROUND_TURNS = 240000 / 500;
/** PvPoke clamps energy at 100 (Battle.js:1339). */
const MAX_ENERGY = 100;
const MAX_LEVEL = 55;
const SHADOW_MOVES = { charged: 'FRUSTRATION', purifiedCharged: 'RETURN' };

function fail(msg: string): never {
  throw new Error(`pvpoke convert: ${msg}`);
}

function stage(change: [number, number] | undefined, moveId: string, field: string): StageChange {
  if (!Array.isArray(change) || change.length !== 2) {
    return fail(`${moveId}.${field} must be [atk, def]`);
  }
  return { atk: change[0], def: change[1] };
}

function convertBuffs(m: PvPokeGmMove): MoveBuffs | undefined {
  if (m.buffs === undefined) {
    return undefined;
  }
  // GameMaster.getMoveById parseFloats the string chance
  const chance = parseFloat(m.buffApplyChance ?? '');
  if (!Number.isFinite(chance)) {
    return fail(`${m.moveId}.buffApplyChance ${String(m.buffApplyChance)} is not a number`);
  }
  switch (m.buffTarget) {
    case 'self':
      return { chance, self: stage(m.buffs, m.moveId, 'buffs') };
    case 'opponent':
      return { chance, opponent: stage(m.buffs, m.moveId, 'buffs') };
    case 'both':
      return {
        chance,
        self: stage(m.buffsSelf, m.moveId, 'buffsSelf'),
        opponent: stage(m.buffsOpponent, m.moveId, 'buffsOpponent'),
      };
    default:
      return fail(`${m.moveId}.buffTarget ${String(m.buffTarget)} is not self, opponent or both`);
  }
}

function convertMove(m: PvPokeGmMove): MoveData {
  // GameMaster.getMoveById: energyGain > 0 is fast, else charged; an explicit category wins
  const category = m.category ?? (m.energyGain > 0 ? 'fast' : 'charged');
  const out: MoveData = {
    id: m.moveId,
    type: m.type,
    category,
    power: m.power,
    energy: m.energy,
    energyGain: m.energyGain,
    turns: m.turns,
  };
  const buffs = convertBuffs(m);
  if (buffs !== undefined) {
    out.buffs = buffs;
  }
  if (m.damageMethod === 'percentMaxHP') {
    out.damageKind = 'percentMaxHp';
  } else if (m.damageMethod !== undefined) {
    return fail(`${m.moveId}.damageMethod ${String(m.damageMethod)} is not modelled`);
  }
  return out;
}

function convertTypes(p: PvPokeGmPokemon): SpeciesData['types'] {
  const types = p.types.filter((t) => t !== 'none');
  const [first, second] = types;
  if (first === undefined || types.length > 2) {
    return fail(`${p.speciesId} has types ${JSON.stringify(p.types)}`);
  }
  return second === undefined ? [first] : [first, second];
}

function convertSpecies(
  p: PvPokeGmPokemon,
  moves: Record<string, MoveData>,
  family: string,
): SpeciesData {
  const elite = p.eliteMoves ?? [];
  const charged = [
    ...p.chargedMoves,
    ...(p.extraChargedMoves ?? []).filter((id) => !p.chargedMoves.includes(id)),
  ];
  return {
    id: p.speciesId,
    dex: p.dex,
    family,
    baseStats: { atk: p.baseStats.atk, def: p.baseStats.def, hp: p.baseStats.hp },
    types: convertTypes(p),
    fast: [...p.fastMoves],
    charged,
    eliteFast: elite.filter((id) => moves[id]?.category === 'fast'),
    eliteCharged: elite.filter((id) => moves[id]?.category === 'charged'),
    shadow: p.tags?.includes('shadoweligible') === true ? { ...SHADOW_MOVES } : null,
    tags: p.tags?.includes('mega') === true ? ['mega'] : [],
  };
}

function convertSettings(ctx: PvPokeContext, gm: PvPokeGmData): BattleSettings {
  const max = gm.settings.maxBuffStages;
  const d = gm.settings.buffDivisor;
  // Pokemon.getStatBuffMultiplier: (d + n) / d for n > 0, d / (d - n) otherwise, for attack and defense alike
  const multipliers: number[] = [];
  for (let n = -max; n <= max; n += 1) {
    multipliers.push(n > 0 ? (d + n) / d : d / (d - n));
  }
  const bonus = ctx.evaluate<number>('DamageMultiplier.BONUS');
  return {
    stab: ctx.evaluate<number>('DamageMultiplier.STAB'),
    fastBonus: bonus,
    chargedBonus: bonus,
    shadowAtk: ctx.evaluate<number>('DamageMultiplier.SHADOW_ATK'),
    shadowDef: ctx.evaluate<number>('DamageMultiplier.SHADOW_DEF'),
    maxEnergy: MAX_ENERGY,
    roundTurns: ROUND_TURNS,
    stages: { min: -max, max, atk: [...multipliers], def: [...multipliers] },
  };
}

function convertCpm(ctx: PvPokeContext, anySpecies: string): number[] {
  const battle: PvPokeBattle = new ctx.runtime.Battle();
  const out: number[] = [];
  for (let level = 1; level <= MAX_LEVEL; level += 0.5) {
    const poke = new ctx.runtime.Pokemon(anySpecies, 0, battle) as PvPokeCombatant;
    poke.setLevel(level, false);
    if (typeof poke.cpm !== 'number' || !Number.isFinite(poke.cpm)) {
      return fail(`no CPM at level ${level}`);
    }
    out.push(poke.cpm);
  }
  return out;
}

/** Every form a mechanics entry names (a `form` condition or a `switchForm.to`), mapped to that entry's key. */
function familiesFromMechanics(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return out;
  }
  const claim = (form: unknown, family: string): void => {
    if (typeof form !== 'string' || form === 'startForm') {
      return;
    }
    const prior = out.get(form);
    if (prior !== undefined && prior !== family) {
      fail(`form ${form} is named by both ${prior} and ${family}`);
    }
    out.set(form, family);
  };
  for (const [family, entry] of Object.entries(raw as Record<string, unknown>)) {
    const rules = (entry as { rules?: unknown } | null)?.rules;
    if (!Array.isArray(rules)) {
      continue;
    }
    for (const rule of rules as { when?: { form?: unknown }; do?: unknown }[]) {
      const form = rule.when?.form;
      for (const f of Array.isArray(form) ? form : [form]) {
        claim(f, family);
      }
      if (Array.isArray(rule.do)) {
        for (const effect of rule.do as { effect?: unknown; to?: unknown }[]) {
          if (effect.effect === 'switchForm') {
            claim(effect.to, family);
          }
        }
      }
    }
  }
  return out;
}

export function pvpokeToBattleData(
  ctx: PvPokeContext,
  mechanicsYaml: string,
  commit: string,
): BattleData {
  const gm = ctx.runtime.gm.data as unknown as PvPokeGmData;

  const moves: Record<string, MoveData> = {};
  for (const m of gm.moves) {
    moves[m.moveId] = convertMove(m);
  }

  const mechanicsRaw: unknown = parse(mechanicsYaml);
  const families = familiesFromMechanics(mechanicsRaw);
  const species: Record<string, SpeciesData> = {};
  for (const p of gm.pokemon) {
    if (p.baseStats === undefined) {
      continue;
    }
    species[p.speciesId] = convertSpecies(p, moves, families.get(p.speciesId) ?? p.speciesId);
  }

  const types = ctx.evaluate<string[]>('Pokemon.getAllTypes(true)').map((t): TypeId => t);
  const calc = ctx.evaluate<{ getEffectiveness(attack: string, defend: string[]): number }>(
    'DamageCalculator',
  );
  const effectiveness = types.map((a) => types.map((d) => calc.getEffectiveness(a, [d])));

  const first = gm.pokemon[0];
  if (first === undefined) {
    return fail('game master has no species');
  }
  const stamp = gm.timestamp ?? '';
  const data: BattleData = {
    version: 1,
    source: {
      kind: 'pvpoke',
      commit,
      date: /^\d{4}-\d{2}-\d{2}/.test(stamp) ? stamp.slice(0, 10) : stamp,
    },
    settings: convertSettings(ctx, gm),
    types,
    effectiveness,
    cpm: convertCpm(ctx, first.speciesId),
    moves,
    species,
    leagues: {},
    mechanics: {},
  };
  data.mechanics = validateMechanics(mechanicsRaw, data);
  return data;
}
