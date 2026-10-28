import type { BattleData } from '../data/types.js';
import {
  EFFECTS,
  EVENTS,
  type Effect,
  type MechanicsEntry,
  type MechanicsRule,
  type When,
} from './vocabulary.js';

type Rec = Record<string, unknown>;
type Ref = Pick<BattleData, 'species' | 'moves'>;

function fail(path: string, msg: string): never {
  throw new Error(`mechanics.yaml: ${path} ${msg}`);
}

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateMechanics(raw: unknown, data: Ref): Record<string, MechanicsEntry> {
  if (!isRec(raw)) {
    return fail('(root)', 'must be a mapping keyed by family');
  }
  const out: Record<string, MechanicsEntry> = {};
  for (const [family, entry] of Object.entries(raw)) {
    out[family] = validateEntry(family, entry, data);
  }
  return out;
}

function validateEntry(family: string, e: unknown, data: Ref): MechanicsEntry {
  if (!isRec(e)) {
    return fail(family, 'must be a mapping');
  }
  const source = e['source'];
  if (typeof source !== 'string' || source.trim() === '') {
    return fail(`${family}.source`, 'must be a non-empty string');
  }
  const entered = e['entered'];
  if (typeof entered !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entered)) {
    return fail(`${family}.entered`, `${JSON.stringify(entered)} must match YYYY-MM-DD`);
  }
  const reset = e['resetOnSwitchOut'];
  if (typeof reset !== 'boolean') {
    return fail(`${family}.resetOnSwitchOut`, 'must be a boolean');
  }
  const rules = e['rules'];
  if (!Array.isArray(rules)) {
    return fail(`${family}.rules`, 'must be a list');
  }
  return {
    family,
    source,
    entered,
    resetOnSwitchOut: reset,
    rules: rules.map((r, i) => validateRule(family, `${family}.rules[${i}]`, r, data)),
  };
}

function validateRule(family: string, path: string, r: unknown, data: Ref): MechanicsRule {
  if (!isRec(r)) {
    return fail(path, 'must be a mapping');
  }
  const when = validateWhen(family, `${path}.when`, r['when'], data);
  const doList = r['do'];
  if (!Array.isArray(doList)) {
    return fail(`${path}.do`, 'must be a list');
  }
  return {
    when,
    do: doList.map((d, i) => validateEffect(family, `${path}.do[${i}]`, d, when, data)),
  };
}

function checkFrac(path: string, v: unknown): number {
  if (typeof v !== 'number' || !(v > 0 && v < 1)) {
    return fail(path, 'must be a number in (0, 1)');
  }
  return v;
}

function checkForm(family: string, path: string, v: unknown, data: Ref): string {
  if (
    typeof v !== 'string' ||
    !Object.hasOwn(data.species, v) ||
    data.species[v]?.family !== family
  ) {
    return fail(path, `${JSON.stringify(v)} is not a form of family "${family}"`);
  }
  return v;
}

function checkMove(path: string, v: unknown, data: Ref): string {
  if (typeof v !== 'string' || !Object.hasOwn(data.moves, v)) {
    return fail(path, `${JSON.stringify(v)} is not a move`);
  }
  return v;
}

function validateWhen(family: string, path: string, w: unknown, data: Ref): When {
  if (!isRec(w)) {
    return fail(path, 'must be a mapping');
  }
  const ev = w['event'];
  if (typeof ev !== 'string' || !(EVENTS as readonly string[]).includes(ev)) {
    return fail(
      `${path}.event`,
      `${JSON.stringify(ev)} is not in the vocabulary (${EVENTS.join(', ')}). A new trigger is a code change in packages/battle/src/mechanics/.`,
    );
  }
  const out: When = { event: ev as When['event'] };
  if (ev === 'hpBelow') {
    if (w['fraction'] === undefined) {
      return fail(`${path}.fraction`, 'is required for the hpBelow event');
    }
  } else if (w['fraction'] !== undefined) {
    return fail(`${path}.fraction`, 'is only valid with the hpBelow event');
  }
  if (w['fraction'] !== undefined) {
    out.fraction = checkFrac(`${path}.fraction`, w['fraction']);
  }
  if (w['moves'] !== undefined) {
    if (ev !== 'beforeChargedMove' && ev !== 'afterChargedMove') {
      return fail(`${path}.moves`, 'is only valid with beforeChargedMove or afterChargedMove');
    }
    const moves = w['moves'];
    if (!Array.isArray(moves)) {
      return fail(`${path}.moves`, 'must be a list');
    }
    out.moves = moves.map((m, i) => checkMove(`${path}.moves[${i}]`, m, data));
  }
  if (w['form'] !== undefined) {
    const f = w['form'];
    out.form = Array.isArray(f)
      ? f.map((x, i) => checkForm(family, `${path}.form[${i}]`, x, data))
      : checkForm(family, `${path}.form`, f, data);
  }
  if (w['hpAbove'] !== undefined) {
    out.hpAbove = checkFrac(`${path}.hpAbove`, w['hpAbove']);
  }
  if (w['hpAtMost'] !== undefined) {
    out.hpAtMost = checkFrac(`${path}.hpAtMost`, w['hpAtMost']);
  }
  if (w['notStartForm'] !== undefined) {
    if (w['notStartForm'] !== true) {
      return fail(`${path}.notStartForm`, 'must be true (omit it otherwise)');
    }
    out.notStartForm = true;
  }
  return out;
}

function validateEffect(family: string, path: string, d: unknown, when: When, data: Ref): Effect {
  if (!isRec(d)) {
    return fail(path, 'must be a mapping');
  }
  const name = d['effect'];
  if (typeof name !== 'string' || !(EFFECTS as readonly string[]).includes(name)) {
    return fail(
      `${path}.effect`,
      `${JSON.stringify(name)} is not in the vocabulary (${EFFECTS.join(', ')}). A new effect is a code change in packages/battle/src/mechanics/.`,
    );
  }
  switch (name) {
    case 'switchForm': {
      const to = d['to'];
      if (to === 'startForm') {
        return { effect: 'switchForm', to };
      }
      return { effect: 'switchForm', to: checkForm(family, `${path}.to`, to, data) };
    }
    case 'blockDamage': {
      if (when.event !== 'hitByChargedMove') {
        return fail(path, 'effect "blockDamage" is only valid under the hitByChargedMove event');
      }
      return { effect: 'blockDamage' };
    }
    case 'replaceMove': {
      return {
        effect: 'replaceMove',
        from: checkMove(`${path}.from`, d['from'], data),
        to: checkMove(`${path}.to`, d['to'], data),
      };
    }
    case 'statStages': {
      const target = d['target'];
      if (target !== 'self' && target !== 'opponent') {
        return fail(`${path}.target`, `${JSON.stringify(target)} must be "self" or "opponent"`);
      }
      const out: Extract<Effect, { effect: 'statStages' }> = { effect: 'statStages', target };
      for (const k of ['atk', 'def'] as const) {
        const v = d[k];
        if (v !== undefined) {
          if (typeof v !== 'number' || !Number.isInteger(v)) {
            return fail(`${path}.${k}`, 'must be an integer');
          }
          out[k] = v;
        }
      }
      return out;
    }
    case 'fireMove': {
      const move = checkMove(`${path}.move`, d['move'], data);
      if (data.moves[move]?.category !== 'charged') {
        return fail(`${path}.move`, `${JSON.stringify(move)} is not a charged move`);
      }
      const out: Extract<Effect, { effect: 'fireMove' }> = { effect: 'fireMove', move };
      const ig = d['ignoresFaint'];
      if (ig !== undefined) {
        if (typeof ig !== 'boolean') {
          return fail(`${path}.ignoresFaint`, 'must be a boolean');
        }
        out.ignoresFaint = ig;
      }
      return out;
    }
    default: {
      const turns = d['turns'];
      if (typeof turns !== 'number' || !Number.isInteger(turns) || turns <= 0) {
        return fail(`${path}.turns`, 'must be a positive integer');
      }
      return { effect: 'animate', turns };
    }
  }
}
