import {
  battlesInWindow,
  seasonWindow,
  type BattleSet,
  type FacingInput,
  type FacingSource,
  type League,
  type LoggedBattle,
  type Season,
} from '@pickthree/engine';
import type { WindowKey } from '@pickthree/engine/meta';
import { communityLeague, type CommunityPayload, type CommunityRequest } from '../communityMeta.ts';
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

/**
 * Whether the league in play has community data (GBL, Tournaments, All). A league not known yet
 * counts as having it: on a cold start straight into Teams (store.tsx routes there before boot
 * finishes) the league list is still null, and nothing should be greyed out or labeled missing on
 * the strength of data that has not loaded yet. Only a known league whose communityLeague is null
 * is without.
 */
export function hasCommunityData(settings: Settings, leagues: League[] | undefined): boolean {
  const league = leagues?.find((l) => l.id === (settings.league ?? 'great'));
  return league ? communityLeague(league) !== null : true;
}

/** This season's battles for one league, after any fresh mark: what the Your meta source weights by. */
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
