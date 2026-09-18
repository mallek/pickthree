import type { TeamPick } from '@pickthree/engine';

/** One member of a shared team: a species id and, optionally, the moves it runs. */
export interface SharedPick {
  speciesId: string;
  moves?: { fast: string; charged: string[] };
}

export interface SharedTeam {
  league: string;
  picks: [SharedPick, SharedPick, SharedPick];
}

/** The public origin a shared link points at. */
export const SITE_ORIGIN = 'https://pick3.gg';

const SPECIES = /^[a-z0-9_]+$/;
const MOVE = /^[A-Z0-9_]+$/;

/**
 * The hash path for a team: `#/t/<league>/<member>+<member>+<member>`, a member being the
 * species id followed by `.FAST.CHARGED[.CHARGED]` when it runs chosen moves. Every character
 * is URL safe, so the link pastes anywhere as is.
 */
export function teamPath(league: string, picks: readonly SharedPick[]): string {
  const members = picks
    .map((p) => (p.moves ? [p.speciesId, p.moves.fast, ...p.moves.charged].join('.') : p.speciesId))
    .join('+');
  return `#/t/${league}/${members}`;
}

export function teamLink(
  league: string,
  picks: readonly SharedPick[],
  origin = SITE_ORIGIN,
): string {
  return `${origin}/${teamPath(league, picks)}`;
}

/** The link for a team the app has on screen, from its species ids and movesets. */
export function picksFromTeam(
  slots: readonly { speciesId: string; fast: string; charged: readonly string[] }[],
): SharedPick[] {
  return slots.map((s) => ({
    speciesId: s.speciesId,
    moves: { fast: s.fast, charged: [...s.charged] },
  }));
}

export type ParsedTeam = { team: SharedTeam } | { error: string };

/** Parses the `<league>/<members>` part of a team path. Shape only; ids are checked by the app. */
export function parseTeamPath(league: string, members: string): ParsedTeam {
  if (!SPECIES.test(league)) {
    return { error: 'That link has no league in it.' };
  }
  const parts = members.split('+').filter(Boolean);
  if (parts.length !== 3) {
    return { error: `A team link needs three Pokemon; this one has ${parts.length}.` };
  }
  const picks: SharedPick[] = [];
  for (const part of parts) {
    const [speciesId, fast, ...charged] = part.split('.');
    if (!speciesId || !SPECIES.test(speciesId)) {
      return { error: `"${speciesId ?? ''}" is not a Pokemon id pick3 knows.` };
    }
    if (fast === undefined) {
      picks.push({ speciesId });
      continue;
    }
    if (
      !MOVE.test(fast) ||
      charged.length < 1 ||
      charged.length > 2 ||
      !charged.every((c) => MOVE.test(c))
    ) {
      return { error: `The moves for ${speciesId} in that link are not readable.` };
    }
    picks.push({ speciesId, moves: { fast, charged } });
  }
  const ids = new Set(picks.map((p) => p.speciesId));
  if (ids.size < 3) {
    return { error: 'A team link needs three different Pokemon.' };
  }
  return { team: { league, picks: picks as [SharedPick, SharedPick, SharedPick] } };
}

/** Build's picks for a shared team: species picks, with the link's moves when it has them. */
export function toTeamPicks(team: SharedTeam): [TeamPick, TeamPick, TeamPick] {
  return team.picks.map((p) => ({
    kind: 'species' as const,
    id: p.speciesId,
    ...(p.moves ? { moves: { fast: p.moves.fast, charged: [...p.moves.charged] } } : {}),
  })) as [TeamPick, TeamPick, TeamPick];
}
