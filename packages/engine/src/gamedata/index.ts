import type { Move, Species } from './types.js';

/** Fast lookups over the normalized game data. */
export class GameDataIndex {
  private readonly byId = new Map<string, Species>();
  private readonly moveMap = new Map<string, Move>();
  private readonly moveByName = new Map<string, Move>();

  constructor(species: Species[], moves: Move[]) {
    for (const s of species) {
      this.byId.set(s.speciesId, s);
    }
    for (const m of moves) {
      this.moveMap.set(m.moveId, m);
      this.moveByName.set(normalizeMoveName(m.name), m);
    }
  }

  species(id: string): Species | undefined {
    return this.byId.get(id);
  }

  mustSpecies(id: string): Species {
    const s = this.byId.get(id);
    if (!s) {
      throw new Error(`Unknown speciesId ${id}`);
    }
    return s;
  }

  allSpecies(): Species[] {
    return [...this.byId.values()];
  }

  move(id: string): Move | undefined {
    return this.moveMap.get(id);
  }

  mustMove(id: string): Move {
    const m = this.moveMap.get(id);
    if (!m) {
      throw new Error(`Unknown moveId ${id}`);
    }
    return m;
  }

  /** "Ice Beam" -> ICE_BEAM move, matching on normalized display name. */
  moveByDisplayName(name: string): Move | undefined {
    return this.moveByName.get(normalizeMoveName(name));
  }

  isShadowId(id: string): boolean {
    return id.endsWith('_shadow');
  }

  baseOf(id: string): string {
    return id.replace(/_shadow$/, '');
  }

  shadowVariant(id: string): Species | undefined {
    return this.byId.get(`${this.baseOf(id)}_shadow`);
  }

  /**
   * All evolution stages reachable from id (including id itself), following evolutionIds.
   * Shadow-aware: starting from a _shadow id yields the _shadow variants of later stages when
   * they exist, and skips stages that have no shadow entry.
   */
  stagesFrom(id: string): Species[] {
    const start = this.byId.get(id);
    if (!start) {
      return [];
    }
    const shadow = this.isShadowId(id);
    const out: Species[] = [];
    const seen = new Set<string>();
    const walk = (s: Species): void => {
      if (seen.has(s.speciesId)) {
        return;
      }
      seen.add(s.speciesId);
      out.push(s);
      const base = this.byId.get(this.baseOf(s.speciesId));
      const evolutionIds = base?.evolutionIds ?? s.evolutionIds;
      for (const evoId of evolutionIds) {
        const target = shadow ? this.byId.get(`${evoId}_shadow`) : this.byId.get(evoId);
        if (target) {
          walk(target);
        }
      }
    };
    walk(start);
    return out;
  }

  /** Number of evolutions from the family root to this species (0 for a base form). */
  stageDepth(id: string): number {
    let depth = 0;
    let cur = this.byId.get(this.baseOf(id));
    const guard = new Set<string>();
    while (cur && cur.parentId && !guard.has(cur.speciesId)) {
      guard.add(cur.speciesId);
      cur = this.byId.get(cur.parentId);
      depth += 1;
    }
    return depth;
  }

  /** Longest chain length in the family that contains id (1 for a single-stage species). */
  familyChainLength(id: string): number {
    const base = this.byId.get(this.baseOf(id));
    if (!base) {
      return 1;
    }
    let root: Species = base;
    const guard = new Set<string>();
    while (root.parentId && !guard.has(root.speciesId)) {
      guard.add(root.speciesId);
      const p = this.byId.get(root.parentId);
      if (!p) {
        break;
      }
      root = p;
    }
    const longest = (s: Species): number => {
      let best = 1;
      for (const evo of s.evolutionIds) {
        const child = this.byId.get(evo);
        if (child) {
          best = Math.max(best, 1 + longest(child));
        }
      }
      return best;
    };
    return longest(root);
  }
}

export function normalizeMoveName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}
