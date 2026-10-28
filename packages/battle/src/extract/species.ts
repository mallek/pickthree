import type { BaseStats, MoveId, SpeciesData } from '../data/types.js';
import type { MovePool } from './moves.js';
import {
  bad,
  formSpeciesId,
  isRec,
  ofKind,
  optArr,
  reqNum,
  reqRec,
  reqStr,
  typeName,
  type Rec,
  type Tpl,
} from './templates.js';

interface Parsed {
  tpl: Tpl;
  body: Rec;
  pokemonId: string;
  form: string | null;
  baseStats: BaseStats;
  types: string[];
  dex: number;
}

function parse(tpl: Tpl, body: Rec, types: string[]): Parsed {
  const pokemonId = reqStr(tpl.id, body['pokemonId'], 'pokemonId');
  const form = body['form'] === undefined ? null : reqStr(tpl.id, body['form'], 'form');
  const stats = reqRec(tpl.id, body['stats'], 'stats');
  const baseStats: BaseStats = {
    atk: reqNum(tpl.id, stats['baseAttack'], 'stats.baseAttack'),
    def: reqNum(tpl.id, stats['baseDefense'], 'stats.baseDefense'),
    hp: reqNum(tpl.id, stats['baseStamina'], 'stats.baseStamina'),
  };
  const tList = [typeName(tpl.id, body['type'], 'type')];
  if (body['type2'] !== undefined) {
    tList.push(typeName(tpl.id, body['type2'], 'type2'));
  }
  checkTypes(tpl.id, tList, types);
  const m = /^V(\d{4})_/.exec(tpl.id);
  if (!m?.[1]) {
    return bad(tpl.id, 'templateId must start with V<dex>_');
  }
  return { tpl, body, pokemonId, form, baseStats, types: tList, dex: Number(m[1]) };
}

function checkTypes(id: string, list: string[], types: string[]): void {
  for (const t of list) {
    if (!types.includes(t)) {
      bad(id, `type ${t} is not a known type`);
    }
  }
}

function asTypes(list: string[]): [string] | [string, string] {
  const [a, b] = list;
  return b === undefined ? [a as string] : [a as string, b];
}

function sameAs(a: Parsed, b: Parsed): boolean {
  return (
    a.baseStats.atk === b.baseStats.atk &&
    a.baseStats.def === b.baseStats.def &&
    a.baseStats.hp === b.baseStats.hp &&
    a.types.join('/') === b.types.join('/')
  );
}

function dedupe(list: MoveId[]): MoveId[] {
  return [...new Set(list)];
}

export function extractSpecies(
  tpls: Tpl[],
  types: string[],
  pool: MovePool,
  warnings: string[],
): Record<string, SpeciesData> {
  const costumes = new Set<string>();
  for (const { tpl, body } of ofKind(tpls, 'formSettings')) {
    for (const f of optArr(tpl.id, body['forms'], 'forms')) {
      if (isRec(f) && f['isCostume'] === true && typeof f['form'] === 'string') {
        costumes.add(f['form']);
      }
    }
  }

  const all = ofKind(tpls, 'pokemonSettings').map(({ tpl, body }) => parse(tpl, body, types));
  const formed = all.filter((p) => p.form !== null && !costumes.has(p.form));
  const chosen = new Map<string, Parsed>();
  for (const p of formed) {
    chosen.set(formSpeciesId(p.form as string), p);
  }
  for (const p of all) {
    if (p.form !== null) {
      continue;
    }
    if (formed.some((f) => f.pokemonId === p.pokemonId && sameAs(f, p))) {
      continue;
    }
    const id = p.pokemonId.toLowerCase();
    if (!chosen.has(id)) {
      chosen.set(id, p);
    }
  }

  const species: Record<string, SpeciesData> = {};
  for (const [id, p] of chosen) {
    species[id] = build(id, p, pool, warnings);
  }
  for (const [id, p] of chosen) {
    addMegas(id, p, species, pool, types);
  }
  return species;
}

function build(id: string, p: Parsed, pool: MovePool, warnings: string[]): SpeciesData {
  const b = p.body;
  const cache = new Map<unknown, MoveId | null>();
  const resolve = (ref: unknown): MoveId | null => {
    if (cache.has(ref)) {
      return cache.get(ref) ?? null;
    }
    let hit: MoveId | null = null;
    if (typeof ref === 'number') {
      hit = pool.byNumber.get(ref) ?? null;
    } else if (typeof ref === 'string' && Object.hasOwn(pool.moves, ref)) {
      hit = ref;
    }
    if (hit === null) {
      warnings.push(`species ${id}: move ref ${String(ref)} has no combatMove template`);
    }
    cache.set(ref, hit);
    return hit;
  };
  const list = (key: string): MoveId[] => {
    const out: MoveId[] = [];
    for (const ref of optArr(p.tpl.id, b[key], key)) {
      const m = resolve(ref);
      if (m !== null) {
        out.push(m);
      }
    }
    return out;
  };
  const quick = list('quickMoves');
  const cine = list('cinematicMoves');
  const eliteFast = dedupe(list('eliteQuickMove'));
  const eliteCharged = dedupe(list('eliteCinematicMove'));
  const nonTm = list('nonTmCinematicMoves');

  let shadow: SpeciesData['shadow'] = null;
  if (b['shadow'] !== undefined) {
    const s = reqRec(p.tpl.id, b['shadow'], 'shadow');
    const charged = resolve(s['shadowChargeMove']);
    const purified = resolve(s['purifiedChargeMove']);
    if (charged !== null && purified !== null) {
      shadow = { charged, purifiedCharged: purified };
    }
  }
  return {
    id,
    dex: p.dex,
    family: p.pokemonId.toLowerCase(),
    baseStats: p.baseStats,
    types: asTypes(p.types),
    fast: dedupe([...quick, ...eliteFast]),
    charged: dedupe([...cine, ...eliteCharged, ...nonTm]),
    eliteFast,
    eliteCharged,
    shadow,
    tags: [],
  };
}

function addMegas(
  id: string,
  p: Parsed,
  species: Record<string, SpeciesData>,
  pool: MovePool,
  types: string[],
): void {
  const base = species[id];
  if (!base || id !== base.family) {
    return;
  }
  for (const o of optArr(p.tpl.id, p.body['tempEvoOverrides'], 'tempEvoOverrides')) {
    const ov = reqRec(p.tpl.id, o, 'tempEvoOverrides entry');
    if (ov['stats'] === undefined) {
      continue;
    }
    const evo = reqStr(p.tpl.id, ov['tempEvoId'], 'tempEvoOverrides.tempEvoId');
    const suffix = evo.replace(/^TEMP_EVOLUTION_/, '');
    const stats = reqRec(p.tpl.id, ov['stats'], 'tempEvoOverrides.stats');
    let mtypes: [string] | [string, string] = base.types;
    if (ov['typeOverride1'] !== undefined) {
      const list = [typeName(p.tpl.id, ov['typeOverride1'], 'typeOverride1')];
      if (ov['typeOverride2'] !== undefined) {
        list.push(typeName(p.tpl.id, ov['typeOverride2'], 'typeOverride2'));
      }
      checkTypes(p.tpl.id, list, types);
      mtypes = asTypes(list);
    }
    const megaMove = `${evo}_V${String(p.dex).padStart(4, '0')}_POKEMON_${p.pokemonId}`;
    const charged = Object.hasOwn(pool.moves, megaMove)
      ? dedupe([...base.charged, megaMove])
      : [...base.charged];
    const mid = `${id}_${suffix.toLowerCase()}`;
    species[mid] = {
      id: mid,
      dex: base.dex,
      family: base.family,
      baseStats: {
        atk: reqNum(p.tpl.id, stats['baseAttack'], 'tempEvoOverrides.stats.baseAttack'),
        def: reqNum(p.tpl.id, stats['baseDefense'], 'tempEvoOverrides.stats.baseDefense'),
        hp: reqNum(p.tpl.id, stats['baseStamina'], 'tempEvoOverrides.stats.baseStamina'),
      },
      types: mtypes,
      fast: [...base.fast],
      charged,
      eliteFast: [...base.eliteFast],
      eliteCharged: [...base.eliteCharged],
      shadow: null,
      tags: ['mega'],
    };
  }
}
