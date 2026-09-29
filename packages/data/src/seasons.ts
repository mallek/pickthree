import fs from 'node:fs';
import path from 'node:path';
import type { Season } from '@pickthree/engine';
import { DATA_PACKAGE_DIR } from './paths.js';

export const SEASONS_PATH = path.join(DATA_PACKAGE_DIR, 'seasons.json');

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

/** The hand-kept Go Battle League season list, validated and sorted by start. */
export function readSeasons(file: string = SEASONS_PATH): Season[] {
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error(`${file}: expected an array`);
  }
  const out: Season[] = raw.map((entry, i) => {
    const e = entry as Partial<Season>;
    if (typeof e.id !== 'number' || typeof e.name !== 'string' || typeof e.start !== 'string') {
      throw new Error(`${file}: entry ${i} needs id, name and start`);
    }
    if (!ISO_WITH_OFFSET.test(e.start) || Number.isNaN(Date.parse(e.start))) {
      throw new Error(`${file}: entry ${i} start must be an ISO time with an offset`);
    }
    return { id: e.id, name: e.name, start: e.start };
  });
  const ids = new Set(out.map((s) => s.id));
  if (ids.size !== out.length) {
    throw new Error(`${file}: duplicate season ids`);
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** True when the newest start is more than `days` ago (or the list is empty). */
export function seasonsStale(seasons: Season[], now: Date, days: number): boolean {
  const newest = seasons[seasons.length - 1];
  if (!newest) {
    return true;
  }
  return now.getTime() - Date.parse(newest.start) > days * 86_400_000;
}

const DAY_MS = 86_400_000;

/** A feed time (`...Z`) in the offset form readSeasons requires. */
function withOffset(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

/**
 * Seasons seen in the GBL feed folded into the list: a listed name changes nothing; a
 * placeholder ("Season 29") starting within a day is renamed; anything else is appended with
 * the next id.
 */
export function mergeSeasons(
  seasons: readonly Season[],
  seen: readonly { name: string; start: string }[],
): Season[] {
  const out = [...seasons].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (const s of seen) {
    if (out.some((x) => x.name === s.name)) {
      continue;
    }
    const placeholder = out.find(
      (x) =>
        /^Season \d+$/.test(x.name) &&
        Math.abs(Date.parse(x.start) - Date.parse(s.start)) <= DAY_MS,
    );
    if (placeholder) {
      out[out.indexOf(placeholder)] = { ...placeholder, name: s.name };
      continue;
    }
    const nextId = out.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    out.push({ id: nextId, name: s.name, start: withOffset(s.start) });
    out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
  return out;
}

export function writeSeasons(seasons: readonly Season[], file: string = SEASONS_PATH): void {
  const lines = seasons.map(
    (s) =>
      `  { "id": ${s.id}, "name": ${JSON.stringify(s.name)}, "start": ${JSON.stringify(s.start)} }`,
  );
  fs.writeFileSync(file, `[\n${lines.join(',\n')}\n]\n`);
}
