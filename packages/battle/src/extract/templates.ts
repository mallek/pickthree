// Shared helpers for reading raw datamine templates. Pure: no node built-ins.

export type Rec = Record<string, unknown>;

export interface Tpl {
  id: string;
  data: Rec;
}

export function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function bad(id: string, msg: string): never {
  throw new Error(`template ${id}: ${msg}`);
}

export function parseTemplates(raw: unknown): Tpl[] {
  if (!Array.isArray(raw)) {
    throw new Error('datamine: templates must be an array');
  }
  const out: Tpl[] = [];
  (raw as unknown[]).forEach((item, i) => {
    if (!isRec(item) || typeof item['templateId'] !== 'string' || !isRec(item['data'])) {
      throw new Error(
        `datamine: template at index ${i} needs a templateId string and a data object`,
      );
    }
    out.push({ id: item['templateId'], data: item['data'] });
  });
  return out;
}

/** The templates carrying a payload under `key`, with the payload. A non-object payload throws. */
export function ofKind(tpls: Tpl[], key: string): { tpl: Tpl; body: Rec }[] {
  const out: { tpl: Tpl; body: Rec }[] = [];
  for (const tpl of tpls) {
    if (!Object.hasOwn(tpl.data, key)) {
      continue;
    }
    const body = tpl.data[key];
    if (!isRec(body)) {
      bad(tpl.id, `${key} must be an object`);
    }
    out.push({ tpl, body });
  }
  return out;
}

export function reqRec(id: string, v: unknown, what: string): Rec {
  if (!isRec(v)) {
    return bad(id, `${what} must be an object`);
  }
  return v;
}

export function reqNum(id: string, v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return bad(id, `${what} must be a number`);
  }
  return v;
}

export function optNum(id: string, v: unknown, what: string): number | undefined {
  if (v === undefined) {
    return undefined;
  }
  return reqNum(id, v, what);
}

export function reqStr(id: string, v: unknown, what: string): string {
  if (typeof v !== 'string') {
    return bad(id, `${what} must be a string`);
  }
  return v;
}

export function optArr(id: string, v: unknown, what: string): unknown[] {
  if (v === undefined) {
    return [];
  }
  if (!Array.isArray(v)) {
    return bad(id, `${what} must be an array`);
  }
  return v as unknown[];
}

export function numArr(id: string, v: unknown, what: string): number[] {
  if (!Array.isArray(v)) {
    return bad(id, `${what} must be an array of numbers`);
  }
  return (v as unknown[]).map((x, i) => reqNum(id, x, `${what}[${i}]`));
}

/** POKEMON_TYPE_FIRE -> fire. */
export function typeName(id: string, v: unknown, what: string): string {
  const s = reqStr(id, v, what);
  if (!s.startsWith('POKEMON_TYPE_')) {
    return bad(id, `${what} ${s} is not a POKEMON_TYPE_ name`);
  }
  return s.slice('POKEMON_TYPE_'.length).toLowerCase();
}

/** A form name to its species id: lowercase, trailing _normal removed. */
export function formSpeciesId(form: string): string {
  return form.toLowerCase().replace(/_normal$/, '');
}
