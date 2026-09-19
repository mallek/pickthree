/**
 * The teams meta.pick3.gg shows a league that has no shared battles yet. Generated from the full
 * legal pool at PvPoke default IVs (coldstart/pool.ts), drafted with the engine's own trio
 * evaluation, and scored by the same simStrength the site runs in the browser.
 *
 * Scored by simStrength and NOT by scoreTeam, deliberately. scoreTeam's battle field comes from
 * simulated slot results, where the switch carries four turns of starting energy; the matrix has
 * no such cell, so the two are different numbers. The client can only ever compute the matrix
 * one. Ranking generated teams by a number the client cannot reproduce would put the top of the
 * board out of step with the number printed on it, so both sides use the same function. The
 * simulator was measured doing this job (1 to 3 seconds a league) and left out for that reason,
 * not for cost.
 *
 * A generated team is a baked prior. It is never written into the battle store, because then
 * "from 480 battles shared by 9 devices" would count battles nobody fought.
 */
import type { PokemonType } from '../gamedata/types.js';
import { bestStrength, strengthContext } from '../score/simStrength.js';
import type { Candidate } from '../search/candidates.js';
import type { MatrixView } from '../search/matrixView.js';
import {
  DEFAULT_TRIO_OPTIONS,
  evaluateTrio,
  prepare,
  type Prepared,
  type Structure,
} from '../search/trios.js';

/** How many uncovered top opponents a card names before it stops listing them. */
const EXPOSURE_SHOWN = 5;

export interface GeneratedTeam {
  /** Lead, switch, closer, in the order the strength was computed for. */
  species: [string, string, string];
  /** simStrength, 0 to 100. */
  strength: number;
  coverage: number;
  consistency: number;
  safety: number;
  /** From the engine's own draft, for the card: 'ABB' or 'ABC'. */
  structure: Structure;
  /** Meta opponents nobody on the team beats, at most five. */
  exposure: string[];
}

export interface GenerateOptions {
  /** How many teams to emit. */
  results: number;
  /** Per-opponent weights for coverage. Absent means every opponent counts the same. */
  weights?: ReadonlyMap<string, number>;
}

interface Scored {
  members: [Prepared, Prepared, Prepared];
  /** Indexes into members: lead, switch, closer. */
  order: [number, number, number];
  strength: number;
  coverage: number;
  consistency: number;
  safety: number;
  key: string;
}

export function generateColdStartTeams(
  pool: readonly Candidate[],
  view: MatrixView,
  types: { types(id: string): [PokemonType, PokemonType | 'none'] },
  opts: GenerateOptions,
): GeneratedTeam[] {
  const ctx = strengthContext(view, opts.weights);
  const prepared: Prepared[] = prepare([...pool], view, types);
  const n = prepared.length;
  const all: Scored[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const members: [Prepared, Prepared, Prepared] = [
          prepared[i] as Prepared,
          prepared[j] as Prepared,
          prepared[k] as Prepared,
        ];
        const ids = members.map((m) => m.c.build.speciesId);
        // One species per team, even across specimens, the same rule generateTrios keeps.
        if (new Set(ids).size < 3) {
          continue;
        }
        const rows: [number, number, number] = [
          members[0].c.matrixRow,
          members[1].c.matrixRow,
          members[2].c.matrixRow,
        ];
        const s = bestStrength(ctx, rows);
        // rows holds three distinct matrix rows (one species per team), so indexOf is unambiguous.
        const order = [
          rows.indexOf(s.order[0]),
          rows.indexOf(s.order[1]),
          rows.indexOf(s.order[2]),
        ] as [number, number, number];
        all.push({
          members,
          order,
          strength: s.value,
          coverage: s.coverage,
          consistency: s.consistency,
          safety: s.safety,
          key: [...ids].sort().join('+'),
        });
      }
    }
  }

  // Strongest first; the sorted species key breaks a tie, so the same pool always gives the same
  // board however the pool happened to be ordered.
  all.sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key));

  const picked: Scored[] = [];
  const speciesOf = (item: Scored): string[] => item.members.map((m) => m.c.build.speciesId);
  for (const item of all) {
    if (picked.length >= opts.results) {
      break;
    }
    // Keep the board varied: a team may share at most one species with any team already picked,
    // the same rule recommend.ts's diversify keeps. Without it the top of the board is one strong
    // pair with a rotating third.
    const mine = speciesOf(item);
    const clash = picked.some((p) => speciesOf(p).filter((id) => mine.includes(id)).length >= 2);
    if (!clash) {
      picked.push(item);
    }
  }
  for (const item of all) {
    if (picked.length >= opts.results) {
      break;
    }
    if (!picked.includes(item)) {
      picked.push(item);
    }
  }

  return picked.map((item) => {
    // The engine's own draft, evaluated for exactly the order the strength was computed for, so
    // the card's "ABB line" describes the team as it is presented.
    const draft = evaluateTrio(item.members, view, DEFAULT_TRIO_OPTIONS, [item.order]);
    const species = item.order.map((idx) => item.members[idx]!.c.build.speciesId) as [
      string,
      string,
      string,
    ];
    return {
      species,
      strength: item.strength,
      coverage: item.coverage,
      consistency: item.consistency,
      safety: item.safety,
      structure: draft.structure,
      exposure: draft.exposure.slice(0, EXPOSURE_SHOWN),
    };
  });
}
