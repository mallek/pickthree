/** League ids as the data build writes them: lowercase, digits, underscores and hyphens
 * (rotation and Mega ids such as `mega-great`). One rule for every `?l=` pick3 parses. */
export const LEAGUE_ID = /^[a-z0-9_-]+$/;

export function leagueParam(raw: string | null): string | null {
  return raw !== null && LEAGUE_ID.test(raw) ? raw : null;
}
