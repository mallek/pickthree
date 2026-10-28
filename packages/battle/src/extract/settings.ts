import type { BattleSettings } from '../data/types.js';
import { bad, numArr, ofKind, reqNum, type Rec, type Tpl } from './templates.js';

/** The datamine type enum order, which is the column order of every attackScalar. */
export const TYPE_ENUM_ORDER = [
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

export function extractTypes(tpls: Tpl[]): { types: string[]; effectiveness: number[][] } {
  const rows = new Map<string, number[]>();
  for (const { tpl, body } of ofKind(tpls, 'typeEffective')) {
    const at = body['attackType'];
    if (typeof at !== 'string' || !at.startsWith('POKEMON_TYPE_')) {
      return bad(tpl.id, 'attackType must be a POKEMON_TYPE_ name');
    }
    const scalars = numArr(tpl.id, body['attackScalar'], 'attackScalar');
    if (scalars.length !== TYPE_ENUM_ORDER.length) {
      bad(tpl.id, `attackScalar must have ${TYPE_ENUM_ORDER.length} entries`);
    }
    rows.set(
      at.slice('POKEMON_TYPE_'.length).toLowerCase(),
      scalars.map((v) => Math.fround(v)),
    );
  }
  const effectiveness = TYPE_ENUM_ORDER.map((t) => {
    const row = rows.get(t);
    if (!row) {
      throw new Error(`datamine: no typeEffective template for type ${t}`);
    }
    return row;
  });
  return { types: [...TYPE_ENUM_ORDER], effectiveness };
}

function only(tpls: Tpl[], templateId: string, key: string): { tpl: Tpl; body: Rec } {
  const hit = ofKind(tpls, key).find((x) => x.tpl.id === templateId);
  if (!hit) {
    throw new Error(`datamine: missing ${templateId} template`);
  }
  return hit;
}

export function extractSettings(tpls: Tpl[]): BattleSettings {
  const cs = only(tpls, 'COMBAT_SETTINGS', 'combatSettings');
  const num = (k: string): number => reqNum(cs.tpl.id, cs.body[k], k);
  const st = only(tpls, 'COMBAT_STAT_STAGE_SETTINGS', 'combatStatStageSettings');
  const fr = (k: string): number[] => numArr(st.tpl.id, st.body[k], k).map((v) => Math.fround(v));
  const min = reqNum(st.tpl.id, st.body['minimumStatStage'], 'minimumStatStage');
  const max = reqNum(st.tpl.id, st.body['maximumStatStage'], 'maximumStatStage');
  const atk = fr('attackBuffMultiplier');
  const def = fr('defenseBuffMultiplier');
  if (atk.length !== max - min + 1 || def.length !== max - min + 1) {
    bad(st.tpl.id, 'multiplier arrays must have one entry per stage');
  }
  return {
    stab: Math.fround(num('sameTypeAttackBonusMultiplier')),
    fastBonus: Math.fround(num('fastAttackBonusMultiplier')),
    chargedBonus: Math.fround(num('chargeAttackBonusMultiplier')),
    shadowAtk: Math.fround(num('shadowPokemonAttackBonusMultiplier')),
    shadowDef: Math.fround(num('shadowPokemonDefenseBonusMultiplier')),
    maxEnergy: num('maxEnergy'),
    roundTurns: num('roundDurationSeconds') / num('turnDurationSeconds'),
    stages: { min, max, atk, def },
  };
}

export function extractCpm(tpls: Tpl[]): number[] {
  const pl = only(tpls, 'PLAYER_LEVEL_SETTINGS', 'playerLevel');
  const whole = numArr(pl.tpl.id, pl.body['cpMultiplier'], 'cpMultiplier').map((v) =>
    Math.fround(v),
  );
  const out: number[] = [];
  whole.forEach((a, i) => {
    out.push(a);
    const b = whole[i + 1];
    if (b !== undefined) {
      out.push(Math.sqrt((a * a + b * b) / 2));
    }
  });
  return out;
}
