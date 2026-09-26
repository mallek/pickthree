import type { GameDataIndex } from '../gamedata/index.js';
import { classify, effectiveness, resistances, weaknesses } from '../gamedata/typeChart.js';
import type { PokemonType } from '../gamedata/types.js';
import type { MetaRank } from '../gamedata/metaRank.js';
import { formNote, isDefaultToggleForm } from '../gamedata/forms.js';
import type { Candidate, Role } from '../search/candidates.js';
import type { SlotSim, TeamSim } from '../search/finalists.js';
import type { MatrixView } from '../search/matrixView.js';
import { nameOf, type TeamScore } from '../score/score.js';

export interface KeyMatchup {
  opponent: string;
  opponentName: string;
  opponentTypes: [PokemonType, PokemonType | 'none'];
  /** Overall meta rank of the opponent, how likely you are to run into it. */
  opponentRank: number | null;
  line: string;
}

export interface Alternative {
  slot: 0 | 1 | 2;
  role: Role;
  candidate: Candidate;
  line: string;
}

export interface MoveRead {
  moveId: string;
  /** Meta opponents this move hits for extra damage. */
  superCount: number;
  /** Meta opponents that resist it. */
  resistedCount: number;
  line: string;
}

export interface SlotDetail {
  types: [PokemonType, PokemonType | 'none'];
  /** Attack types that hit this Pokemon for extra damage: shield those charged moves. */
  weaknesses: PokemonType[];
  /** Attack types it resists: those charged moves can usually be taken. */
  resistances: PokemonType[];
  shieldLine: string;
  /** Closer only: how many more meta matchups it wins with one shield kept for it. */
  keepShield: { delta: number; line: string } | null;
  moveReads: MoveRead[];
  /** What its battle form change does, or null. */
  formNote: string | null;
}

export interface SwitchAdvice {
  opponent: string;
  opponentName: string;
  opponentTypes: [PokemonType, PokemonType | 'none'];
  /** Overall meta rank of the opponent, how likely you are to run into it. */
  opponentRank: number | null;
  /** Slot to switch to, or null when nobody on the team beats it. */
  to: 1 | 2 | null;
  toName: string | null;
  rating: number;
  line: string;
}

export interface Explanation {
  why: string;
  structureLine: string;
  keyWins: KeyMatchup[];
  keyThreats: KeyMatchup[];
  roleWhy: Record<Role, string>;
  alternatives: Alternative[];
  slotDetail: [SlotDetail, SlotDetail, SlotDetail];
  /** What beats the lead and who to switch to, worst threats first. */
  switchPlan: SwitchAdvice[];
}

/**
 * A matchup nobody on the team wins is still close from this rating up: shields decide it. Under
 * it, nobody on the team beats it. One meaning for the key threats and the switch plan alike.
 */
const CLOSE_RATING = 450;

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
  // The form you bring in is just the Pokemon: "Morpeko (Full Belly)" is Morpeko.
  if (m && m[1] && isDefaultToggleForm(s)) {
    return m[1];
  }
  return name;
}

export function fullName(speciesId: string, index: GameDataIndex): string {
  const base = displayName(speciesId, index);
  return speciesId.endsWith('_shadow') ? `Shadow ${base}` : base;
}

export function typeName(t: PokemonType): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function listTypes(types: PokemonType[]): string {
  const names = types.map(typeName);
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function typesOf(id: string, index: GameDataIndex): [PokemonType, PokemonType | 'none'] {
  return index.species(id)?.types ?? ['normal', 'none'];
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

export function slotDetailFor(slot: SlotSim, view: MatrixView, index: GameDataIndex): SlotDetail {
  const c = slot.candidate;
  const types = typesOf(c.build.speciesId, index);
  const weak = weaknesses(types);
  const resist = resistances(types);
  const shieldLine =
    weak.length > 0
      ? `Shield ${listTypes(weak)} charged moves.${resist.length > 0 ? ` ${listTypes(resist)} moves can usually be taken.` : ''}`
      : 'No type hits it for extra damage; shield the biggest charged move you see.';
  let keepShield: SlotDetail['keepShield'] = null;
  if (slot.role === 'closer' && slot.winsWithShield !== null) {
    const delta = slot.winsWithShield - slot.wins;
    if (delta >= 3) {
      keepShield = {
        delta,
        line: `Keep a shield for ${fullName(c.build.speciesId, index)}: it wins ${delta} more of ${slot.results.length} matchups with one.`,
      };
    } else {
      keepShield = {
        delta,
        line: `${fullName(c.build.speciesId, index)} does about as well without shields; spend them earlier.`,
      };
    }
  }
  const n = view.opponents.length;
  const moveReads: MoveRead[] = c.moveset.charged.map((m) => {
    let superCount = 0;
    let resistedCount = 0;
    for (const op of view.opponents) {
      const e = classify(effectiveness(m.type, typesOf(op, index)));
      if (e === 'super') {
        superCount += 1;
      } else if (e === 'resisted') {
        resistedCount += 1;
      }
    }
    const line =
      superCount >= n / 3
        ? `extra damage on ${superCount} of ${n}`
        : resistedCount >= n / 3
          ? `resisted by ${resistedCount} of ${n}`
          : `extra damage on ${superCount}, resisted by ${resistedCount}`;
    return { moveId: m.moveId, superCount, resistedCount, line };
  });
  return {
    types,
    weaknesses: weak,
    resistances: resist,
    shieldLine,
    keepShield,
    moveReads,
    formNote: formNote(c.build.speciesId, index),
  };
}

export function switchPlanFor(
  t: TeamSim,
  view: MatrixView,
  index: GameDataIndex,
  ranks: Map<string, MetaRank> = new Map(),
): SwitchAdvice[] {
  void view;
  const rankOf = (id: string): number => ranks.get(id)?.overall ?? 9999;
  const [lead, sw, closer] = t.slots;
  const out: SwitchAdvice[] = [];
  const unanswered = new Set<string>();
  for (const r of lead.results) {
    if (r.win) {
      continue;
    }
    const opponent = r.opponent;
    const swR = sw.results.find((x) => x.opponent === opponent);
    const clR = closer.results.find((x) => x.opponent === opponent);
    const candidates: { to: 1 | 2; rating: number; slot: SlotSim }[] = [];
    if (swR && swR.win) {
      candidates.push({ to: 1, rating: swR.rating, slot: sw });
    }
    if (clR && clR.win) {
      candidates.push({ to: 2, rating: clR.rating, slot: closer });
    }
    candidates.sort((a, b) => b.rating - a.rating);
    const best = candidates[0];
    const oppName = fullName(opponent, index);
    if (best) {
      const toName = fullName(best.slot.candidate.build.speciesId, index);
      const how =
        best.rating >= 650 ? 'wins comfortably' : best.rating >= 550 ? 'wins' : 'edges it';
      out.push({
        opponent,
        opponentName: oppName,
        opponentTypes: typesOf(opponent, index),
        opponentRank: ranks.get(opponent)?.overall ?? null,
        to: best.to,
        toName,
        rating: best.rating,
        line: `Switch to ${toName}, ${how}.`,
      });
    } else {
      // Nobody wins it. Read it the way the key threats do: the best slot on the whole team, the
      // lead included, decides whether it is close or unanswered.
      const closest = bestSlotFor(t, opponent);
      const close = closest !== null && closest.rating >= CLOSE_RATING;
      const line = close
        ? `Close; shields decide it. Best try: ${fullName(closest.slot.candidate.build.speciesId, index)}.`
        : `Nobody on the team beats it. Shield, farm energy, and switch on your terms.`;
      if (!close) {
        unanswered.add(opponent);
      }
      out.push({
        opponent,
        opponentName: oppName,
        opponentTypes: typesOf(opponent, index),
        opponentRank: ranks.get(opponent)?.overall ?? null,
        to: null,
        toName: null,
        rating: Math.max(swR?.rating ?? 0, clR?.rating ?? 0),
        line,
      });
    }
  }
  // The unanswered first, then the close ones nobody wins, then the ones with a switch; within
  // each, the opponents you are most likely to meet.
  const tier = (x: SwitchAdvice): number =>
    unanswered.has(x.opponent) ? 0 : x.to === null ? 1 : 2;
  const leadRating = new Map(lead.results.map((x) => [x.opponent, x.rating]));
  out.sort(
    (a, b) =>
      tier(a) - tier(b) ||
      rankOf(a.opponent) - rankOf(b.opponent) ||
      (leadRating.get(a.opponent) ?? 0) - (leadRating.get(b.opponent) ?? 0),
  );
  // A species listed twice in the meta group keeps its worse entry.
  return uniqueByOpponent(out);
}

export function explainTeam(
  t: TeamSim,
  score: TeamScore,
  pool: Candidate[],
  view: MatrixView,
  index: GameDataIndex,
  ranks: Map<string, MetaRank> = new Map(),
): Explanation {
  const [lead, sw, closer] = t.slots;
  const name = (c: Candidate): string => fullName(c.build.speciesId, index);
  const rankOf = (id: string): number => ranks.get(id)?.overall ?? 9999;

  const wins: KeyMatchup[] = [];
  const threats: KeyMatchup[] = [];
  /** Opponents nobody on the team beats, not even closely (best rating under CLOSE_RATING). */
  const unanswered = new Set<string>();
  for (const opponent of view.opponents) {
    const best = bestSlotFor(t, opponent);
    if (!best) {
      continue;
    }
    const oppName = fullName(opponent, index);
    const oppTypes = typesOf(opponent, index);
    if (best.rating > 500) {
      const verb = best.rating >= 650 ? 'wins comfortably' : 'wins';
      wins.push({
        opponent,
        opponentName: oppName,
        opponentTypes: oppTypes,
        opponentRank: ranks.get(opponent)?.overall ?? null,
        line: `${name(best.slot.candidate)} ${verb} as ${ROLE_LABEL[best.slot.role]}`,
      });
    } else {
      const closest =
        best.rating >= CLOSE_RATING ? 'Close; shields decide it' : 'Nobody on the team beats it';
      if (best.rating < CLOSE_RATING) {
        unanswered.add(opponent);
      }
      threats.push({
        opponent,
        opponentName: oppName,
        opponentTypes: oppTypes,
        opponentRank: ranks.get(opponent)?.overall ?? null,
        line: `${closest}. Best try: ${name(best.slot.candidate)}`,
      });
    }
  }
  // Most common opponents first: beating the #2 Pokemon matters more than beating the #40.
  // Threats nobody on the team beats come before the close ones, which shields can still decide,
  // so the three kept are the unanswered ones first, most common first within each group.
  // The meta group lists some species twice with different movesets; show each once, and a
  // species that threatens with either moveset is a threat, not a win.
  wins.sort((a, b) => rankOf(a.opponent) - rankOf(b.opponent));
  threats.sort(
    (a, b) =>
      Number(!unanswered.has(a.opponent)) - Number(!unanswered.has(b.opponent)) ||
      rankOf(a.opponent) - rankOf(b.opponent),
  );
  const threatIds = new Set(threats.map((x) => x.opponent));
  const keyWins = uniqueByOpponent(wins.filter((w) => !threatIds.has(w.opponent))).slice(0, 4);
  const keyThreats = uniqueByOpponent(threats).slice(0, 3);

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
    lead: `Your opener. Wins the first shield exchange against ${lead.wins} of ${lead.results.length} meta Pokémon.`,
    switch: `Comes in when your lead loses. Beats ${sw.wins} of ${sw.results.length} with a shield each, so switching is rarely a gamble.`,
    closer: `Finishes the battle once shields are gone. Wins ${closer.wins} of ${closer.results.length} with no shields.`,
  };

  const alternatives = alternativesFor(t, pool, view, index);
  const slotDetail: [SlotDetail, SlotDetail, SlotDetail] = [
    slotDetailFor(lead, view, index),
    slotDetailFor(sw, view, index),
    slotDetailFor(closer, view, index),
  ];
  const switchPlan = switchPlanFor(t, view, index, ranks);
  void score;
  return {
    why,
    structureLine,
    keyWins,
    keyThreats,
    roleWhy,
    alternatives,
    slotDetail,
    switchPlan,
  };
}

function uniqueByOpponent<T extends { opponent: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    if (seen.has(x.opponent)) {
      return false;
    }
    seen.add(x.opponent);
    return true;
  });
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
