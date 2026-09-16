import {
  battlesInWindow,
  seasonWindow,
  type BattleSet,
  type Season,
  type YourMetaInput,
} from '@pickthree/engine';
import type { Settings } from '../storage/db.ts';

/** The engine input for one league: this season's battles (after any fresh mark) and the switch. */
export function yourMetaFrom(
  sets: BattleSet[],
  seasons: Season[],
  settings: Settings,
  league: string,
  now: Date = new Date(),
): YourMetaInput {
  const freshFrom = settings.yourMeta?.freshFrom?.[league] ?? null;
  return {
    battles: battlesInWindow(sets, seasonWindow(seasons, freshFrom, now)),
    blend: settings.yourMeta?.blend !== false,
  };
}

/** A uuid, with a fallback for contexts without crypto.randomUUID (old WebViews, some test envs). */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
