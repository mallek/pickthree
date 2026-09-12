import type { GameDataIndex } from '../gamedata/index.js';
import type { Candidate, Role } from '../search/candidates.js';
import type { SlotSim, TeamSim } from '../search/finalists.js';
import type { MatrixView } from '../search/matrixView.js';
import { nameOf, type TeamScore } from '../score/score.js';

export interface KeyMatchup {
  opponent: string;
  opponentName: string;
  line: string;
}

export interface Alternative {
  slot: 0 | 1 | 2;
  role: Role;
  candidate: Candidate;
  line: string;
}

export interface Explanation {
  why: string;
  structureLine: string;
  keyWins: KeyMatchup[];
  keyThreats: KeyMatchup[];
  roleWhy: Record<Role, string>;
  alternatives: Alternative[];
}

export const ROLE_LABEL: Record<Role, string> = {
  lead: 'Lead',
  switch: 'Safe Switch',
  closer: 'Closer',
};

const REGIONAL_PREFIX: Record<string, string> = {
  Alolan: 'Alolan',
  Galarian: 'Galarian',
  Hisuian: 'Hisuian',
  Paldean: 'Paldean',
};

/** PvPoke "Raichu (Alolan)" -> "Alolan Raichu"; other parentheticals stay as they are. */
export function displayName(speciesId: string, index: GameDataIndex): string {
  const s = index.species(speciesId);
  if (!s) {
    return speciesId;
  }
  const name = s.speciesName.replace(' (Shadow)', '');
  const m = /^(.*) \(([^)]+)\)$/.exec(name);
  if (m && m[2] && REGIONAL_PREFIX[m[2]]) {
    return `${REGIONAL_PREFIX[m[2]]} ${m[1]}`;
  }
  return name;
}

export function fullName(speciesId: string, index: GameDataIndex): string {
  const base = displayName(speciesId, index);
  return speciesId.endsWith('_shadow') ? `Shadow ${base}` : base;
}

function bestSlotFor(t: TeamSim, opponent: string): { slot: SlotSim; rating: number } | null {
  let best: { slot: SlotSim; rating: number } | null = null;
  for (const s of t.slots) {
    const r = s.results.find((x) => x.opponent === opponent);
    if (r && (!best || r.rating > best.rating)) {
      best = { slot: s, rating: r.rating };
    }
  }
  return best;
}

export function explainTeam(
  t: TeamSim,
  score: TeamScore,
  pool: Candidate[],
  view: MatrixView,
  index: GameDataIndex,
): Explanation {
  const [lead, sw, closer] = t.slots;
  const name = (c: Candidate): string => fullName(c.build.speciesId, index);

  // Key wins: top meta opponents (matrix order is PvPoke meta order) that the team beats,
  // ranked by how decisively the best slot wins.
  const wins: KeyMatchup[] = [];
  const threats: KeyMatchup[] = [];
  for (const opponent of view.opponents) {
    const best = bestSlotFor(t, opponent);
    if (!best) {
      continue;
    }
    const oppName = fullName(opponent, index);
    if (best.rating > 500) {
      const verb = best.rating >= 650 ? 'wins comfortably' : 'wins';
      wins.push({
        opponent,
        opponentName: oppName,
        line: `${name(best.slot.candidate)} ${verb} as ${ROLE_LABEL[best.slot.role]}`,
      });
    } else {
      const closest =
        best.rating >= 450 ? 'Close; shields decide it' : 'Nobody on the team beats it';
      threats.push({
        opponent,
        opponentName: oppName,
        line: `${closest}. Best try: ${name(best.slot.candidate)}`,
      });
    }
  }
  const keyWins = wins.slice(0, 4);
  const keyThreats = threats.slice(0, 3);

  const topWinNames = keyWins.slice(0, 2).map((w) => w.opponentName);
  const threatName = keyThreats[0]?.opponentName;
  const whyParts = [
    `${name(lead.candidate)} leads and handles ${topWinNames.length > 0 ? topWinNames.join(' and ') : 'the common openers'}.`,
    `${name(sw.candidate)} comes in when the lead is in trouble and covers what beats it.`,
    `${name(closer.candidate)} finishes once shields are gone.`,
  ];
  if (threatName) {
    whyParts.push(`Biggest risk: ${threatName}.`);
  }
  const why = whyParts.join(' ');

  const structureLine =
    t.draft.structure === 'ABB'
      ? `Anything that beats your ${name(lead.candidate)} lead loses to both your back-line Pokémon, so you win the back line either way.`
      : 'Each Pokémon covers a different slice of the meta, so no single opponent breaks the team.';

  const roleWhy: Record<Role, string> = {
    lead: `Your opener. Wins the first shield exchange against ${lead.wins} of ${view.opponents.length} meta Pokémon.`,
    switch: `Comes in when your lead loses. Beats ${sw.wins} of ${view.opponents.length} with a shield each, so switching is rarely a gamble.`,
    closer: `Finishes the battle once shields are gone. Wins ${closer.wins} of ${view.opponents.length} with no shields.`,
  };

  const alternatives = alternativesFor(t, pool, view, index);
  void score;
  return { why, structureLine, keyWins, keyThreats, roleWhy, alternatives };
}

function roleScore(c: Candidate, role: Role): number {
  return role === 'lead'
    ? c.roleScores.leads
    : role === 'switch'
      ? c.roleScores.switches
      : c.roleScores.closers;
}

export function alternativesFor(
  t: TeamSim,
  pool: Candidate[],
  view: MatrixView,
  index: GameDataIndex,
): Alternative[] {
  const inTeam = new Set(t.slots.map((s) => s.candidate.build.speciesId));
  const s11 = view.scenarioIndex([1, 1]);
  const out: Alternative[] = [];
  t.slots.forEach((slot, i) => {
    const role = slot.role;
    const current = slot.candidate;
    const others = pool
      .filter(
        (c) =>
          !inTeam.has(c.build.speciesId) &&
          index.baseOf(c.build.speciesId) !== index.baseOf(current.build.speciesId),
      )
      .sort((a, b) => roleScore(b, role) - roleScore(a, role));
    const alt = others[0];
    if (!alt) {
      return;
    }
    const deltas: string[] = [];
    if (alt.cost.weight < current.cost.weight * 0.8) {
      deltas.push('Cheaper');
    }
    if (current.moveset.eliteTmCount > 0 && alt.moveset.eliteTmCount === 0) {
      deltas.push('No Elite TM');
    }
    if (current.build.shadow && !alt.build.shadow) {
      deltas.push('No shadow');
    }
    if (current.build.needsXl && !alt.build.needsXl) {
      deltas.push('No XL');
    }
    if (deltas.length === 0) {
      deltas.push(
        roleScore(alt, role) > roleScore(current, role) ? 'Stronger on paper' : 'Similar',
      );
    }
    // First meta opponent where the swap flips a win into a loss.
    const curWins = view.wins(current.matrixRow, s11);
    const altWins = view.wins(alt.matrixRow, s11);
    let loses: string | null = null;
    for (let o = 0; o < view.opponents.length; o++) {
      if (curWins[o] && !altWins[o]) {
        loses = fullName(view.opponents[o] as string, index);
        break;
      }
    }
    const tail = loses ? `, loses the ${loses} matchup` : ', similar coverage';
    out.push({
      slot: i as 0 | 1 | 2,
      role,
      candidate: alt,
      line: `${deltas.join(', ')}: your ${fullName(alt.build.speciesId, index)}${tail}`,
    });
  });
  return out;
}

export { nameOf };
