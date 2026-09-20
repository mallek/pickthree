/**
 * Suggest teammates: the player pins one or two Pokemon they like and pick3 fills the rest.
 *
 * Matrix only. Nothing here simulates a battle, because the matchup matrix (ADR 002) already
 * holds every ranked species against the meta group and that is the whole question: who beats
 * your pin, and who beats them back. Analyze, one tap later, runs the real simulation against
 * the player's own IVs and prints the verdict. This module prints reasons.
 *
 * Spec: docs/superpowers/specs/2026-09-19-suggest-teammates-design.md
 */
import type { TeamPick } from '../analyze.js';
import { buildOptionsFor, buildsFor, type Build, type BuildOptions } from '../builds/eligibility.js';
import { rankingsById } from '../builds/moves.js';
import { coldStartBuilds, coldStartSpecimens, spreadsFromGameMaster } from '../coldstart/pool.js';
import type { Specimen } from '../collection/specimen.js';
import { GameDataIndex } from '../gamedata/index.js';
import {
  assumptionsFor,
  profileFor,
  type Assumptions,
  type EngineDeps,
} from '../recommend.js';
import {
  bestStrength,
  strengthContext,
  TOP_META,
  type StrengthContext,
} from '../score/simStrength.js';
import { candidateFor, candidatePool, type Candidate } from '../search/candidates.js';
import { MatrixView } from '../search/matrixView.js';
import { bestBuild } from '../verdicts/worth.js';
import { coverLines, weakPinLine } from './lines.js';
import type { YourMetaInput } from '../yourmeta/types.js';

export type Character = 'safest' | 'cheapest' | 'antimeta' | 'community';

export const CHARACTER_LABEL: Record<Character, string> = {
  safest: 'Safest',
  cheapest: 'Cheapest',
  antimeta: 'Anti-meta',
  community: 'What players run',
};

export const DEFAULT_CHARACTERS: Character[] = ['safest', 'cheapest', 'antimeta', 'community'];

/** What the engine needs from the community team board, so it never sees the API shape. */
export interface CommunityPairing {
  /** Sorted species ids of the pair actually seen. */
  species: string[];
  /** Third members seen completing it, most common first. */
  thirds: { speciesId: string; sightings: number }[];
}

export interface SuggestOptions extends BuildOptions {
  /** How many top-ranked species with a matrix row to consider beyond the collection. */
  chasePool: number;
  /** Characters to produce, in order. The first one fills the board. */
  characters: Character[];
  /** Specimens the player benched in Settings. */
  excludedSpecimenIds: string[];
  community?: CommunityPairing[];
  yourMeta?: YourMetaInput;
  /** PvPoke's game master, for the default-IV stand-ins the matrix was built from. */
  gameMaster?: unknown;
}

export const DEFAULT_SUGGEST_OPTIONS: Pick<
  SuggestOptions,
  'chasePool' | 'characters' | 'excludedSpecimenIds'
> = {
  chasePool: 60,
  characters: DEFAULT_CHARACTERS,
  excludedSpecimenIds: [],
};

export interface SuggestedSlot {
  /** Board slot this fills. */
  slot: 0 | 1 | 2;
  pick: TeamPick;
  speciesId: string;
  /** Not in the collection: run at a stand-in spread. */
  standIn: boolean;
  /** Opponents this fill beats that the pins and the earlier fills do not, heaviest first. */
  covers: string[];
  /** Why this one, framed against the pins and any earlier fill. */
  line: string;
}

export interface Suggestion {
  character: Character;
  label: string;
  fills: SuggestedSlot[];
  /** Meta opponents the whole trio beats at 1-1 shields. A count, never a score out of 100. */
  coverage: number;
  /** Summed build cost of the fills. The pin is already paid for, so it is not counted. */
  cost: number;
}

export interface SuggestResult {
  /** The honest line about a weak favorite, or null when the pins hold their own. */
  pinLine: string | null;
  suggestions: Suggestion[];
  assumptions: Assumptions;
  stats: {
    /** Stand-in builds constructed. Each one prices a full IV rank, so this is the cost driver. */
    standIns: number;
    /** Candidates the search ran over. */
    poolSize: number;
    /** Cores scored. */
    cores: number;
  };
  ms: number;
}

/**
 * Stand-ins are built for this multiple of `chasePool` before the pool is trimmed to it, leaving
 * room for the ones eligibility, budget and elite TM rules drop. Building all of them instead
 * costs about a second on a desktop, which is the whole budget for a button on a phone.
 */
export const STANDIN_FACTOR = 3;

type Board = [TeamPick | null, TeamPick | null, TeamPick | null];

/** A pinned pick resolved to the build it will actually play as. */
function resolvePin(
  pick: TeamPick,
  specimens: Specimen[],
  index: GameDataIndex,
  opts: BuildOptions,
  overall: Map<string, { score: number }>,
  standIn: (speciesId: string) => Build | null,
): Build {
  if (pick.kind === 'specimen') {
    const s = specimens.find((x) => x.id === pick.id);
    if (!s) {
      throw new Error('One of those Pokemon is no longer in your collection.');
    }
    const builds = buildsFor(s, index, opts);
    const chosen = pick.asSpeciesId
      ? builds.find((b) => b.speciesId === pick.asSpeciesId)
      : bestBuild(builds, overall as never);
    if (!chosen) {
      throw new Error(`${index.mustSpecies(s.speciesId).speciesName} cannot play this league.`);
    }
    return chosen;
  }
  const build = standIn(pick.id);
  if (!build) {
    throw new Error(`${index.mustSpecies(pick.id).speciesName} cannot play this league.`);
  }
  return build;
}

export function suggestTeammates(
  board: Board,
  specimens: Specimen[],
  options: Partial<SuggestOptions>,
  deps: EngineDeps,
): SuggestResult {
  const started = Date.now();
  const opts: SuggestOptions = {
    ...DEFAULT_SUGGEST_OPTIONS,
    ...buildOptionsFor(deps.data.league),
    ...options,
  };
  const index = new GameDataIndex(deps.data.species, deps.data.moves);
  const view = new MatrixView(deps.data.matrix);
  const overall = rankingsById(deps.data.rankings.overall);

  const pinnedSlots: number[] = [];
  const emptySlots: number[] = [];
  board.forEach((p, i) => {
    if (p) {
      pinnedSlots.push(i);
    } else {
      emptySlots.push(i);
    }
  });

  // Stand-ins at PvPoke's own default IVs, which is exactly what the matrix was built from.
  // Only the top of the rankings is worth chasing, so only that is built, plus whatever the
  // player pinned however far down the list it sits. Each build prices a full IV rank.
  const rows = new Set(deps.data.matrix.candidates);
  const pinnedIds = board
    .filter((p): p is TeamPick => p !== null && p.kind === 'species')
    .map((p) => p.id);
  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const id of [...pinnedIds, ...deps.data.rankings.overall.map((r) => r.speciesId)]) {
    if (!rows.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    wanted.push(id);
    if (wanted.length >= opts.chasePool * STANDIN_FACTOR + pinnedIds.length) {
      break;
    }
  }
  const spreads = spreadsFromGameMaster(opts.gameMaster, deps.data.league.cp);
  const standInBuilds = new Map<string, Build>();
  for (const b of coldStartBuilds(coldStartSpecimens(wanted, spreads, index), index, opts)) {
    standInBuilds.set(b.speciesId, b);
  }
  const standIn = (speciesId: string): Build | null => standInBuilds.get(speciesId) ?? null;

  const pins: Candidate[] = pinnedSlots.map((i) => {
    const build = resolvePin(
      board[i] as TeamPick,
      specimens,
      index,
      opts,
      overall as never,
      standIn,
    );
    return candidateFor(build, deps.data.rankings, view, index, {
      allowEliteTm: opts.allowEliteTm,
      moves: (board[i] as TeamPick).moves,
    });
  });
  const pinnedSpecies = new Set(pins.map((c) => c.build.speciesId));

  // The pool: what the player caught, plus the top-ranked stand-ins they have not.
  const owned: Build[] = [];
  for (const s of specimens) {
    owned.push(...buildsFor(s, index, opts));
  }
  const mine = candidatePool(owned, deps.data.rankings, view, index, {
    ...opts,
    poolSize: opts.chasePool,
    excludedSpecimenIds: opts.excludedSpecimenIds,
  }).pool;
  const mineSpecies = new Set(mine.map((c) => c.build.speciesId));
  const chase = candidatePool([...standInBuilds.values()], deps.data.rankings, view, index, {
    ...opts,
    poolSize: opts.chasePool,
    excludedSpecimenIds: [],
  }).pool.filter((c) => !mineSpecies.has(c.build.speciesId));

  const pool = [...mine, ...chase].filter((c) => !pinnedSpecies.has(c.build.speciesId));

  const profile = profileFor(deps.data, view, opts.yourMeta);
  const facing = new Map([...profile.weights, ...profile.outsiderWeights]);
  const ctx = strengthContext(view, facing);
  // Anti-meta scores against the heaviest opponents only, so it answers "what do I actually run
  // into" rather than "what covers the whole list".
  const heaviest = [...facing.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_META);
  const topCtx = strengthContext(view, new Map(heaviest));

  const cores = search(ctx, topCtx, pins, pool, emptySlots.length, mineSpecies);
  const suggestions = choose(cores, opts.characters).map(({ character, core }) => {
    const said = coverLines(pins, core.fills, view, index, facing);
    return {
      character,
      label: CHARACTER_LABEL[character],
      coverage: core.coverage,
      cost: core.cost,
      fills: core.fills.map((c, n) => ({
        slot: emptySlots[n] as 0 | 1 | 2,
        pick: pickFor(c, mineSpecies),
        speciesId: c.build.speciesId,
        standIn: !mineSpecies.has(c.build.speciesId),
        covers: said[n]?.covers ?? [],
        line: said[n]?.line ?? '',
      })),
    };
  });

  return {
    pinLine: weakPinLine(pins, emptySlots.length, view, index, deps.data.league.title),
    suggestions,
    assumptions: assumptionsFor(deps.data, opts, profile),
    stats: { standIns: standInBuilds.size, poolSize: pool.length, cores: cores.length },
    ms: Date.now() - started,
  };
}

function pickFor(c: Candidate, mineSpecies: Set<string>): TeamPick {
  if (mineSpecies.has(c.build.speciesId)) {
    return { kind: 'specimen', id: c.build.specimenId, asSpeciesId: c.build.speciesId };
  }
  return { kind: 'species', id: c.build.speciesId };
}

interface Core {
  fills: Candidate[];
  /** Matrix team score against the full facing profile, 0 to 100. */
  strength: number;
  /** The same, against the heaviest opponents only. */
  topStrength: number;
  /** Summed build cost of the fills. The pin's cost is already accepted, so it is not counted. */
  cost: number;
  /** Meta opponents the whole trio beats at 1-1 shields, as a plain count. */
  coverage: number;
  /** Every fill is one the player has caught. */
  owned: boolean;
  /** Sorted species ids, so two characters landing on one core can be spotted. */
  key: string;
}

/** Every combination of `slots` candidates that can sit alongside the pins. */
function search(
  ctx: StrengthContext,
  topCtx: StrengthContext,
  pins: Candidate[],
  pool: Candidate[],
  slots: number,
  mineSpecies: Set<string>,
): Core[] {
  const out: Core[] = [];
  const s11 = ctx.view.scenarioIndex([1, 1]);
  const consider = (fills: Candidate[]): void => {
    const members = [...pins, ...fills];
    const rows = members.map((c) => c.matrixRow) as [number, number, number];
    const beaten = new Array<boolean>(ctx.view.opponents.length).fill(false);
    for (const m of members) {
      ctx.view.wins(m.matrixRow, s11).forEach((w, o) => {
        if (w) {
          beaten[o] = true;
        }
      });
    }
    out.push({
      fills,
      strength: bestStrength(ctx, rows).value,
      topStrength: bestStrength(topCtx, rows).value,
      coverage: beaten.filter(Boolean).length,
      cost: fills.reduce((acc, c) => acc + c.cost.weight, 0),
      owned: fills.every((c) => mineSpecies.has(c.build.speciesId)),
      key: fills
        .map((c) => c.build.speciesId)
        .sort()
        .join('+'),
    });
  };
  if (slots === 1) {
    for (const c of pool) {
      consider([c]);
    }
  } else if (slots === 2) {
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i] as Candidate;
        const b = pool[j] as Candidate;
        if (a.build.speciesId === b.build.speciesId) {
          continue;
        }
        consider([a, b]);
      }
    }
  }
  return out;
}

/**
 * How many strength points the most expensive core in the pool gives up to the free one, when
 * the player asked for cheap. A discount, not a minimum: hunting pure minimum cost buys a
 * Pokemon that is already built and covers nothing, which is a trap rather than a suggestion.
 */
export const CHEAP_DISCOUNT = 25;

/** The best core for one character, or null when that character has nothing to offer. */
function pickCore(cores: Core[], character: Character): Core | null {
  let best: Core | null = null;
  if (character === 'cheapest') {
    // Cheapest means cheapest to field now, so it only ever offers what the player has caught.
    const owned = cores.filter((c) => c.owned);
    const dearest = owned.reduce((acc, c) => Math.max(acc, c.cost), 0);
    let bestValue = -Infinity;
    for (const c of owned) {
      const value = c.strength - (dearest > 0 ? CHEAP_DISCOUNT * (c.cost / dearest) : 0);
      if (value > bestValue || (value === bestValue && best && c.key.localeCompare(best.key) < 0)) {
        bestValue = value;
        best = c;
      }
    }
    return best;
  }
  for (const c of cores) {
    const value = character === 'antimeta' ? c.topStrength : c.strength;
    const against = best ? (character === 'antimeta' ? best.topStrength : best.strength) : -1;
    if (!best || value > against || (value === against && c.key.localeCompare(best.key) < 0)) {
      best = c;
    }
  }
  return best;
}

/**
 * One core per character, in the order asked for, dropping a character that has nothing to offer
 * and one that landed on a core an earlier character already took.
 */
function choose(cores: Core[], characters: Character[]): { character: Character; core: Core }[] {
  const taken = new Set<string>();
  const out: { character: Character; core: Core }[] = [];
  for (const character of characters) {
    const core = pickCore(cores, character);
    if (!core || taken.has(core.key)) {
      continue;
    }
    taken.add(core.key);
    out.push({ character, core });
  }
  return out;
}
