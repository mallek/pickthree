import type { BattleData } from './types.js';

function fail(msg: string): never {
  throw new Error(`battle data: ${msg}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPosInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isNum(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

export function loadBattleData(raw: unknown): BattleData {
  if (!isRecord(raw)) {
    return fail('root must be an object');
  }
  if (raw['version'] !== 1) {
    return fail('version must be 1');
  }
  if (!isRecord(raw['settings'])) {
    return fail('settings must be an object');
  }
  const types = raw['types'];
  if (!Array.isArray(types) || !types.every((t) => typeof t === 'string')) {
    return fail('types must be an array of strings');
  }
  const n = types.length;
  const eff = raw['effectiveness'];
  if (
    !Array.isArray(eff) ||
    eff.length !== n ||
    !eff.every((row) => Array.isArray(row) && row.length === n && row.every(isNum))
  ) {
    return fail(`effectiveness must be ${n} x ${n}`);
  }
  const cpm = raw['cpm'];
  if (!Array.isArray(cpm) || !cpm.every(isNum)) {
    return fail('cpm must be an array of numbers');
  }
  const moves = raw['moves'];
  if (!isRecord(moves)) {
    return fail('moves must be an object');
  }
  for (const [id, m] of Object.entries(moves)) {
    if (!isRecord(m)) {
      return fail(`moves.${id} must be an object`);
    }
    if (m['id'] !== id) {
      return fail(`moves.${id}.id must equal its key`);
    }
    if (typeof m['type'] !== 'string' || !types.includes(m['type'])) {
      return fail(`moves.${id}.type ${String(m['type'])} is not a type`);
    }
    if (m['category'] !== 'fast' && m['category'] !== 'charged') {
      return fail(`moves.${id}.category must be fast or charged`);
    }
    for (const f of ['power', 'energy', 'energyGain']) {
      const v = m[f];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        return fail(`moves.${id}.${f} must be a non-negative number`);
      }
    }
    if (!isPosInt(m['turns'])) {
      return fail(`moves.${id}.turns must be a positive integer`);
    }
  }
  const species = raw['species'];
  if (!isRecord(species)) {
    return fail('species must be an object');
  }
  for (const [id, s] of Object.entries(species)) {
    if (!isRecord(s)) {
      return fail(`species.${id} must be an object`);
    }
    const sTypes = s['types'];
    if (!Array.isArray(sTypes) || sTypes.length < 1 || sTypes.length > 2) {
      return fail(`species.${id}.types must have 1 or 2 entries`);
    }
    for (let i = 0; i < sTypes.length; i++) {
      const t: unknown = sTypes[i];
      if (typeof t !== 'string' || !types.includes(t)) {
        return fail(`species.${id}.types[${i}] ${String(t)} is not a type`);
      }
    }
    for (const field of ['fast', 'charged', 'eliteFast', 'eliteCharged']) {
      const list = s[field];
      if (!Array.isArray(list)) {
        return fail(`species.${id}.${field} must be an array`);
      }
      for (let i = 0; i < list.length; i++) {
        const mid: unknown = list[i];
        if (typeof mid !== 'string' || !Object.hasOwn(moves, mid)) {
          return fail(`species.${id}.${field}[${i}] ${String(mid)} is not a move`);
        }
      }
    }
    const shadow = s['shadow'];
    if (shadow !== null && shadow !== undefined) {
      if (!isRecord(shadow)) {
        return fail(`species.${id}.shadow must be an object or null`);
      }
      for (const f of ['charged', 'purifiedCharged']) {
        const mid = shadow[f];
        if (typeof mid !== 'string' || !Object.hasOwn(moves, mid)) {
          return fail(`species.${id}.shadow.${f} ${String(mid)} is not a move`);
        }
      }
    }
  }
  if (!isRecord(raw['leagues'])) {
    return fail('leagues must be an object');
  }
  if (!isRecord(raw['mechanics'])) {
    return fail('mechanics must be an object');
  }
  return raw as unknown as BattleData;
}
