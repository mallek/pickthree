import {
  battlesInWindow,
  seasonWindow,
  type BattleSet,
  type FacingInput,
  type FacingSource,
  type LoggedBattle,
  type Season,
} from '@pickthree/engine';
import type { WindowKey } from '@pickthree/engine/meta';
import type { CommunityPayload, CommunityRequest } from '../communityMeta.ts';
import type { Settings } from '../storage/db.ts';

export interface FacingChoice {
  source: FacingSource;
  window: WindowKey;
}

/** The saved choice, with the migration from the retired blend switch. */
export function facingSettings(settings: Settings): FacingChoice {
  const legacy: FacingSource = settings.yourMeta?.blend === false ? 'prior' : 'log';
  return {
    source: settings.facing?.source ?? legacy,
    window: settings.facing?.window ?? 'meta',
  };
}

export function isCommunity(source: FacingSource): source is 'ladder' | 'tournament' | 'all' {
  return source === 'ladder' || source === 'tournament' || source === 'all';
}

/** This season's battles for one league, after any fresh mark: what Your log weights by. */
export function logBattles(
  sets: BattleSet[],
  seasons: Season[],
  settings: Settings,
  league: string,
  now: Date = new Date(),
): LoggedBattle[] {
  const freshFrom = settings.yourMeta?.freshFrom?.[league] ?? null;
  return battlesInWindow(sets, seasonWindow(seasons, freshFrom, now));
}

export function facingInput(args: {
  choice: FacingChoice;
  battles: LoggedBattle[];
  request: CommunityRequest | null;
  payload: CommunityPayload | null;
}): FacingInput {
  const { choice } = args;
  if (choice.source === 'log') {
    return { kind: 'log', battles: args.battles };
  }
  if (!isCommunity(choice.source)) {
    return { kind: 'prior' };
  }
  if (!args.request || !args.payload) {
    return { kind: 'prior', unavailable: choice.source };
  }
  return {
    kind: 'community',
    source: choice.source,
    summary: args.payload.summary,
    window: { since: args.request.since, until: args.request.until, label: args.request.label },
  };
}
