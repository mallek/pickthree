import type { GameDataIndex } from '../gamedata/index.js';
import type { Move, PokemonType, RankingEntry, Species } from '../gamedata/types.js';

export type TmBadge = 'have' | 'tm' | 'elite';

export interface MoveEffect {
  who: 'self' | 'opponent';
  stat: 'atk' | 'def';
  /** Stages, negative lowers. */
  stages: number;
  /** 0..1 */
  chance: number;
}

export interface MoveChoice {
  moveId: string;
  name: string;
  type: PokemonType;
  tm: TmBadge;
  energy: number;
  energyGain: number;
  turns: number;
  /** Fast moves needed to reach this charged move from zero energy. Charged moves only. */
  countFromFast: number | null;
  /** Fast moves per charged move over the first three uses, energy carried over. Charged only. */
  counts: number[] | null;
  effects: MoveEffect[];
}

/**
 * PvPoke-style move counts: how many fast moves reach the charged move on the first, second and
 * third use, with leftover energy carried between uses.
 */
export function moveCounts(chargedEnergy: number, fastGain: number, uses = 3): number[] {
  if (fastGain <= 0 || chargedEnergy <= 0) {
    return [];
  }
  const out: number[] = [];
  let energy = 0;
  for (let i = 0; i < uses; i++) {
    let n = 0;
    while (energy < chargedEnergy) {
      energy += fastGain;
      n += 1;
    }
    out.push(n);
    energy = Math.min(100, energy) - chargedEnergy;
  }
  return out;
}

export function moveEffects(move: Move): MoveEffect[] {
  if (!move.buffs) {
    return [];
  }
  const chance = move.buffApplyChance ?? 1;
  const out: MoveEffect[] = [];
  const push = (who: 'self' | 'opponent', pair: [number, number] | null): void => {
    if (!pair) {
      return;
    }
    if (pair[0] !== 0) {
      out.push({ who, stat: 'atk', stages: pair[0], chance });
    }
    if (pair[1] !== 0) {
      out.push({ who, stat: 'def', stages: pair[1], chance });
    }
  };
  if (move.buffTarget === 'both') {
    push('self', move.buffsSelf);
    push('opponent', move.buffsOpponent);
  } else if (move.buffTarget === 'opponent') {
    push('opponent', move.buffs);
  } else {
    push('self', move.buffs);
  }
  return out;
}

export interface Moveset {
  fast: MoveChoice;
  charged: MoveChoice[];
  source: 'rankings' | 'fallback';
  eliteTmCount: number;
}

export const LEGACY_SHADOW_MOVES = new Set(['RETURN', 'FRUSTRATION']);

export function isEliteMove(species: Species, moveId: string): boolean {
  return (
    species.eliteMoves.includes(moveId) ||
    species.legacyMoves.includes(moveId) ||
    LEGACY_SHADOW_MOVES.has(moveId)
  );
}

function badge(
  species: Species,
  moveId: string,
  current: { fast: string | null; charged: string[] },
): TmBadge {
  if (current.fast === moveId || current.charged.includes(moveId)) {
    return 'have';
  }
  return isEliteMove(species, moveId) ? 'elite' : 'tm';
}

function choice(
  move: Move,
  species: Species,
  current: { fast: string | null; charged: string[] },
  fast: Move | null,
): MoveChoice {
  return {
    moveId: move.moveId,
    name: move.name,
    type: move.type,
    tm: badge(species, move.moveId, current),
    energy: move.energy,
    energyGain: move.energyGain,
    turns: move.turns,
    countFromFast: fast && fast.energyGain > 0 ? Math.ceil(move.energy / fast.energyGain) : null,
    counts: fast && fast.energyGain > 0 ? moveCounts(move.energy, fast.energyGain) : null,
    effects: moveEffects(move),
  };
}

/**
 * The moveset PickThree recommends: PvPoke's most used fast move and two most used charged moves
 * for the species, filtered by the player's exclusions. Falls back to the species pool order when
 * the species has no ranking entry.
 */
export function recommendMoveset(
  speciesId: string,
  rankings: Map<string, RankingEntry>,
  current: { fast: string | null; charged: string[] },
  opts: { allowEliteTm: boolean },
  index: GameDataIndex,
): Moveset {
  const species = index.mustSpecies(speciesId);
  const entry = rankings.get(speciesId) ?? rankings.get(index.baseOf(speciesId));
  const allowed = (id: string): boolean =>
    opts.allowEliteTm ||
    !isEliteMove(species, id) ||
    current.charged.includes(id) ||
    current.fast === id;

  let fastIds: string[];
  let chargedIds: string[];
  let source: Moveset['source'];
  if (entry) {
    // PvPoke's published moveset is the recommendation; usage order supplies the alternates.
    const [recFast, ...recCharged] = entry.moveset;
    const usageFast = entry.fastMoves.map((m) => m.moveId);
    const usageCharged = entry.chargedMoves.map((m) => m.moveId);
    fastIds = [...new Set([...(recFast ? [recFast] : []), ...usageFast])];
    chargedIds = [...new Set([...recCharged, ...usageCharged])];
    source = 'rankings';
  } else {
    fastIds = [...species.fastMoves];
    chargedIds = [...species.chargedMoves];
    source = 'fallback';
  }
  // Pools can miss moves the ranking mentions (data drift); keep only real moves.
  fastIds = fastIds.filter((id) => index.move(id));
  chargedIds = chargedIds.filter((id) => index.move(id));

  const fastId = fastIds.find(allowed) ?? fastIds[0] ?? species.fastMoves[0];
  if (!fastId) {
    throw new Error(`No fast move for ${speciesId}`);
  }
  const fastMove = index.mustMove(fastId);
  const chargedPicked: string[] = [];
  for (const id of chargedIds) {
    if (chargedPicked.length >= 2) {
      break;
    }
    if (allowed(id) && !chargedPicked.includes(id)) {
      chargedPicked.push(id);
    }
  }
  if (chargedPicked.length === 0) {
    const any = chargedIds[0] ?? species.chargedMoves[0];
    if (any) {
      chargedPicked.push(any);
    }
  }
  const fast = choice(fastMove, species, current, null);
  const charged = chargedPicked.map((id) => choice(index.mustMove(id), species, current, fastMove));
  const eliteTmCount = [fast, ...charged].filter((m) => m.tm === 'elite').length;
  return { fast, charged, source, eliteTmCount };
}

export function rankingsById(entries: RankingEntry[]): Map<string, RankingEntry> {
  return new Map(entries.map((e) => [e.speciesId, e]));
}
