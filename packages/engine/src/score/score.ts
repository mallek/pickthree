import type { Candidate } from '../search/candidates.js';
import type { TeamSim } from '../search/finalists.js';
import type { MatrixView } from '../search/matrixView.js';

export type Fit = 'Strong' | 'Solid' | 'Situational' | 'Weak';
export type Difficulty = 'Easy' | 'Moderate' | 'Demanding';

export interface TeamScore {
  factors: {
    coverage: number;
    consistency: number;
    safety: number;
    cost: number;
    accessibility: number;
  };
  total: number;
  /**
   * Battle strength alone, 0 to 100: coverage, consistency and safety, no cost or accessibility.
   * This is what the fit label reads from, so a hand-built team cannot look good just because it
   * is cheap.
   */
  battle: number;
  /** How many of the ten most common opponents nobody on the team beats. */
  topUncovered: number;
  fit: Fit;
  difficulty: Difficulty;
  difficultyWhy: string;
  /** Meta opponents beaten by at least one member in the simulated role scenarios. */
  coveredOpponents: string[];
  uncoveredOpponents: string[];
}

export const WEIGHTS = {
  coverage: 0.35,
  consistency: 0.2,
  safety: 0.2,
  cost: 0.15,
  accessibility: 0.1,
};

/** A moveset that relies on baiting: a cheap charged move alongside an expensive one. */
export function isBaitDependent(c: Candidate): boolean {
  const energies = c.moveset.charged.map((m) => m.energy);
  if (energies.length < 2) {
    return false;
  }
  return Math.min(...energies) <= 40 && Math.max(...energies) >= 55;
}

export function battleScore(coverage: number, consistency: number, safety: number): number {
  return 0.5 * coverage + 0.25 * consistency + 0.25 * safety;
}

/** Label for a battle score. Weak exists so a bad hand-built team is told so. */
export function fitFor(battle: number): Fit {
  if (battle >= 72) {
    return 'Strong';
  }
  if (battle >= 58) {
    return 'Solid';
  }
  if (battle >= 45) {
    return 'Situational';
  }
  return 'Weak';
}

/** One sentence a player can act on. */
export function fitWhy(fit: Fit, covered: number, n: number, topUncovered: number): string {
  const cover = `beats ${covered} of ${n} meta Pokémon`;
  const top =
    topUncovered === 0
      ? 'every one of the top ten has an answer'
      : `${topUncovered} of the top ten ${topUncovered === 1 ? 'has' : 'have'} no answer`;
  switch (fit) {
    case 'Strong':
      return `Ready to run: ${cover} and ${top}.`;
    case 'Solid':
      return `Playable: ${cover}, ${top}. Expect to lose some leads.`;
    case 'Situational':
      return `Thin: ${cover} and ${top}. It wins when the matchups fall right.`;
    default:
      return `Not competitive: ${cover} and ${top}. Swap at least one member.`;
  }
}

export function difficultyFor(t: TeamSim): { difficulty: Difficulty; why: string } {
  const [lead, sw, closer] = t.slots;
  const baitSlots = t.slots.filter((s) => isBaitDependent(s.candidate)).length;
  const lowXl = t.slots.some(
    (s) => s.candidate.build.needsXl && s.candidate.build.specimen.level.max < 30,
  );
  if (t.draft.structure === 'ABB') {
    if (isBaitDependent(sw.candidate)) {
      return {
        difficulty: 'Moderate',
        why: `ABB line, but ${nameOf(sw.candidate)} needs to bait a shield`,
      };
    }
    return { difficulty: 'Easy', why: 'ABB line: switch either way, no baiting needed' };
  }
  if (baitSlots >= 2 || lowXl) {
    const reason = lowXl
      ? 'a long XL build and shield baiting'
      : `${nameOf(lead.candidate)} and ${nameOf(closer.candidate)} both need to bait`;
    return { difficulty: 'Demanding', why: `Balanced team; ${reason}` };
  }
  const baiter = t.slots.find((s) => isBaitDependent(s.candidate));
  return {
    difficulty: 'Moderate',
    why: baiter
      ? `Balanced team; ${nameOf(baiter.candidate)} needs to bait one shield`
      : 'Balanced team; pick the right switch',
  };
}

export function nameOf(c: Candidate): string {
  return c.build.speciesId
    .replace(/_shadow$/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function scoreTeam(
  t: TeamSim,
  all: TeamSim[],
  view: MatrixView,
  /** Per-opponent weight, how often you meet it. Unweighted when absent. */
  facing?: Map<string, number>,
  /** Opponents simulated on top of the matrix columns (your most-faced outsiders). */
  extraOpponents: string[] = [],
): TeamScore {
  const covered = new Set<string>();
  for (const s of t.slots) {
    for (const r of s.results) {
      if (r.win) {
        covered.add(r.opponent);
      }
    }
  }
  const opponentIds = [...view.opponents, ...extraOpponents];
  const weightOf = (id: string): number => facing?.get(id) ?? 1;
  let got = 0;
  let facingTotal = 0;
  for (const id of opponentIds) {
    facingTotal += weightOf(id);
    if (covered.has(id)) {
      got += weightOf(id);
    }
  }
  const coverage = facingTotal === 0 ? 0 : (got / facingTotal) * 100;

  // Consistency: simulated wins that also hold in the 0-0 and 2-2 matrix cells for that species.
  const s00 = view.scenarioIndex([0, 0]);
  const s22 = view.scenarioIndex([2, 2]);
  let held = 0;
  let wins = 0;
  for (const s of t.slots) {
    s.results.forEach((r, o) => {
      if (o >= view.opponents.length) {
        return;
      }
      if (r.win) {
        wins += 1;
        const row = s.candidate.matrixRow;
        if (view.rating(row, o, s00) > 500 && view.rating(row, o, s22) > 500) {
          held += 1;
        }
      }
    });
  }
  const consistency = wins === 0 ? 0 : (held / wins) * 100;

  // Safety: the switch should not have hard losses; nobody should be exposed to the top of the meta.
  const sw = t.slots[1];
  const hardLosses = sw.results.filter((r) => r.rating < 300).length;
  const topUncovered = view.opponents.slice(0, 10).filter((id) => !covered.has(id)).length;
  const safety = Math.max(0, 100 - hardLosses * 20 - topUncovered * 10);

  // Cost normalized against the finalist set.
  const weights = all.map((x) => x.slots.reduce((acc, s) => acc + s.candidate.cost.weight, 0));
  const mine = t.slots.reduce((acc, s) => acc + s.candidate.cost.weight, 0);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const cost = maxW === minW ? 100 : (1 - (mine - minW) / (maxW - minW)) * 100;

  // Accessibility: how far each specimen is from done.
  const accessibility =
    (t.slots.reduce((acc, s) => acc + (1 - Math.min(98, s.candidate.cost.powerUpSteps) / 98), 0) /
      3) *
    100;

  const total =
    WEIGHTS.coverage * coverage +
    WEIGHTS.consistency * consistency +
    WEIGHTS.safety * safety +
    WEIGHTS.cost * cost +
    WEIGHTS.accessibility * accessibility;
  const d = difficultyFor(t);
  return {
    factors: {
      coverage: round1(coverage),
      consistency: round1(consistency),
      safety: round1(safety),
      cost: round1(cost),
      accessibility: round1(accessibility),
    },
    total: round1(total),
    battle: round1(battleScore(coverage, consistency, safety)),
    topUncovered,
    fit: fitFor(battleScore(coverage, consistency, safety)),
    difficulty: d.difficulty,
    difficultyWhy: d.why,
    coveredOpponents: opponentIds.filter((id) => covered.has(id)),
    uncoveredOpponents: opponentIds.filter((id) => !covered.has(id)),
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
