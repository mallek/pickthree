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
