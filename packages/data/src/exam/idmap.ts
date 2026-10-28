// PvPoke ids and datamine ids differ in forms and regional suffixes. The rewrites are tried in
// order after an exact match; the first candidate PvPoke actually has wins.

const SUFFIX_REWRITES: readonly (readonly [RegExp, string])[] = [
  [/_alola$/, '_alolan'],
  [/_galar$/, '_galarian'],
  [/_hisui$/, '_hisuian'],
  [/_paldea$/, '_paldean'],
  [/^mimikyu_disguised$/, 'mimikyu'],
  [/^minior$/, 'minior_meteor'],
  [/^minior_red$/, 'minior_core'],
];

export function toPvPokeSpeciesId(ourId: string, pvpokeIds: ReadonlySet<string>): string | null {
  if (pvpokeIds.has(ourId)) {
    return ourId;
  }
  for (const [pattern, replacement] of SUFFIX_REWRITES) {
    if (pattern.test(ourId)) {
      const candidate = ourId.replace(pattern, replacement);
      if (pvpokeIds.has(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/** The datamine names fast moves `X_FAST`; PvPoke names them `X`. */
export function toPvPokeMoveId(ourId: string): string {
  return ourId.endsWith('_FAST') ? ourId.slice(0, -'_FAST'.length) : ourId;
}
