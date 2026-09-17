/**
 * Search grammar, borrowed from Pokemon GO's storage search: the subset players already know.
 *
 * A query is a list of AND groups (split on `&`, and on plain whitespace, which means the same
 * thing: "fire ch" narrows to Charizard). Within a group, terms separated by `,` `|` `;` `:` are
 * OR'd together, and any term can be negated with a leading `!`.
 *
 * Term forms, all case-insensitive:
 * - bare word: the display name (substring) or a type (prefix), e.g. "fire", "ch";
 * - `cp1500` exact, `cp1400-` at least, `cp-1500` at most, `cp1400-1500` range (inclusive);
 *   `hp...` takes the same forms;
 * - `0*` to `4*`: the game's IV-total star bands;
 * - `shadow`, `purified`, `lucky`: boolean flags;
 * - `@word`: a scanned move, by name substring or move type prefix (`@1`/`@2`/`@3` slot prefixes
 *   are not supported and are stripped, so `@1fire` behaves like `@fire`);
 * - `+word`: the whole evolutionary family of the species whose name contains the word.
 *
 * A bare number range like "1400-1500" is not supported (Pokemon GO reads that as a dex range;
 * pick3 has no dex, so it just falls through to a word match, which will not match anything).
 */

/** What a search term can be evaluated against. Owned-only fields are optional: when a term
 * needs a field the record does not carry (e.g. `cp1500` against a species with no owned CP),
 * that term simply does not match, no error. */
export interface Searchable {
  name: string;
  types: readonly string[];
  familyId?: string | null;
  cp?: number;
  hp?: number;
  ivTotal?: number;
  shadow?: boolean;
  purified?: boolean;
  lucky?: boolean;
  moves?: readonly { name: string; type: string }[];
}

/** Resolves the `+word` family term: the familyId of the first species whose name contains the
 * word, or null when nothing resolves (in which case the term never matches). */
export interface SearchContext {
  familyOf(nameWord: string): string | null;
}

const defaultContext: SearchContext = { familyOf: () => null };

interface NumRange {
  min: number | null;
  max: number | null;
}

type Term =
  | { kind: 'word'; value: string }
  | { kind: 'cp'; range: NumRange }
  | { kind: 'hp'; range: NumRange }
  | { kind: 'stars'; value: 0 | 1 | 2 | 3 | 4 }
  | { kind: 'flag'; flag: 'shadow' | 'purified' | 'lucky' }
  | { kind: 'move'; value: string }
  | { kind: 'family'; value: string };

interface Alt {
  negate: boolean;
  term: Term;
}

/** AND groups of OR alternatives: every group must have at least one matching (unnegated) or
 * non-matching (negated) alternative. */
export type ParsedQuery = Alt[][];

function parseNumRange(prefix: 'cp' | 'hp', body: string): NumRange | null {
  if (!body.startsWith(prefix)) {
    return null;
  }
  const rest = body.slice(prefix.length);
  const exact = /^(\d+)$/.exec(rest);
  if (exact?.[1] !== undefined) {
    const n = Number(exact[1]);
    return { min: n, max: n };
  }
  const range = /^(\d*)-(\d*)$/.exec(rest);
  if (range) {
    const [, lo, hi] = range;
    if (!lo && !hi) {
      return null;
    }
    return { min: lo ? Number(lo) : null, max: hi ? Number(hi) : null };
  }
  return null;
}

function parseTerm(body: string): Term {
  if (body.startsWith('@')) {
    let value = body.slice(1);
    if (/^[123]./.test(value)) {
      value = value.slice(1);
    }
    return { kind: 'move', value };
  }
  if (body.startsWith('+')) {
    return { kind: 'family', value: body.slice(1) };
  }
  const stars = /^([0-4])\*$/.exec(body);
  if (stars?.[1] !== undefined) {
    return { kind: 'stars', value: Number(stars[1]) as 0 | 1 | 2 | 3 | 4 };
  }
  if (body === 'shadow' || body === 'purified' || body === 'lucky') {
    return { kind: 'flag', flag: body };
  }
  const cp = parseNumRange('cp', body);
  if (cp) {
    return { kind: 'cp', range: cp };
  }
  const hp = parseNumRange('hp', body);
  if (hp) {
    return { kind: 'hp', range: hp };
  }
  return { kind: 'word', value: body };
}

function parseAlt(piece: string): Alt | null {
  if (!piece) {
    return null;
  }
  const negate = piece.startsWith('!');
  const body = negate ? piece.slice(1) : piece;
  if (!body) {
    return null;
  }
  return { negate, term: parseTerm(body) };
}

/** Parses a search query into AND groups of OR alternatives. Empty or whitespace-only text
 * parses to no groups, which matches everything. */
export function parseQuery(text: string): ParsedQuery {
  const groups: Alt[][] = [];
  for (const chunk of text.toLowerCase().split('&')) {
    for (const word of chunk.trim().split(/\s+/).filter(Boolean)) {
      const alts = word
        .split(/[,|;:]/)
        .map(parseAlt)
        .filter((a): a is Alt => a !== null);
      if (alts.length > 0) {
        groups.push(alts);
      }
    }
  }
  return groups;
}

function inRange(n: number, range: NumRange): boolean {
  if (range.min !== null && n < range.min) {
    return false;
  }
  if (range.max !== null && n > range.max) {
    return false;
  }
  return true;
}

/** The game's IV-total star bands: 4* = 45/45, 3* = 37-44, 2* = 30-36, 1* = 23-29, 0* below. */
export function starsOf(ivTotal: number): 0 | 1 | 2 | 3 | 4 {
  if (ivTotal >= 45) {
    return 4;
  }
  if (ivTotal >= 37) {
    return 3;
  }
  if (ivTotal >= 30) {
    return 2;
  }
  if (ivTotal >= 23) {
    return 1;
  }
  return 0;
}

function matchTerm(term: Term, record: Searchable, ctx: SearchContext): boolean {
  switch (term.kind) {
    case 'word': {
      if (record.name.toLowerCase().includes(term.value)) {
        return true;
      }
      return record.types.some((t) => t.toLowerCase().startsWith(term.value));
    }
    case 'cp':
      return record.cp !== undefined && inRange(record.cp, term.range);
    case 'hp':
      return record.hp !== undefined && inRange(record.hp, term.range);
    case 'stars':
      return record.ivTotal !== undefined && starsOf(record.ivTotal) === term.value;
    case 'flag':
      return record[term.flag] === true;
    case 'move': {
      if (!record.moves) {
        return false;
      }
      return record.moves.some(
        (m) =>
          m.name.toLowerCase().includes(term.value) || m.type.toLowerCase().startsWith(term.value),
      );
    }
    case 'family': {
      const familyId = ctx.familyOf(term.value);
      if (familyId === null) {
        return false;
      }
      return record.familyId === familyId;
    }
  }
}

/** Whether a record matches every AND group, each satisfied by at least one of its (possibly
 * negated) OR alternatives. */
export function matchesQuery(
  q: ParsedQuery,
  record: Searchable,
  ctx: SearchContext = defaultContext,
): boolean {
  return q.every((group) =>
    group.some((alt) => {
      const matched = matchTerm(alt.term, record, ctx);
      return alt.negate ? !matched : matched;
    }),
  );
}
