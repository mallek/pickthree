/**
 * A species matches a search query when every whitespace-separated word matches either the
 * species name (substring) or one of its types (prefix), e.g. "fire ch" narrows to Charizard,
 * "grass lud" finds Ludicolo, "elec" matches every Electric type.
 */
export function matchesSpeciesQuery(
  words: string[],
  name: string,
  types: readonly string[],
): boolean {
  const lowerName = name.toLowerCase();
  const lowerTypes = types.map((t) => t.toLowerCase());
  return words.every((word) => {
    const w = word.toLowerCase();
    if (lowerName.includes(w)) {
      return true;
    }
    return lowerTypes.some((t) => t.startsWith(w));
  });
}
