import type { GameDataIndex } from '../gamedata/index.js';
import type { MetaEntry } from '../gamedata/types.js';
import type { BattleSimulator, SimOptions, SimPokemonSpec } from '../sim/BattleSimulator.js';
import type { Candidate, Role } from './candidates.js';
import type { TrioDraft } from './trios.js';

export interface SlotResult {
  opponent: string;
  rating: number;
  win: boolean;
}

export interface SlotSim {
  candidate: Candidate;
  role: Role;
  results: SlotResult[];
  wins: number;
}

export interface TeamSim {
  draft: TrioDraft;
  slots: [SlotSim, SlotSim, SlotSim];
  /** Human-readable scenario summary per role. */
  scenario: { lead: string; switch: string; closer: string };
}

/** PvPoke ranking scenarios: leads 1-1, switches 1-1 with 4 turns of energy, closers 0-0. */
export const ROLE_SCENARIO: Record<
  Role,
  { shields: number; oppShields: number; energyTurns: number }
> = {
  lead: { shields: 1, oppShields: 1, energyTurns: 0 },
  switch: { shields: 1, oppShields: 1, energyTurns: 4 },
  closer: { shields: 0, oppShields: 0, energyTurns: 0 },
};

export function candidateSpec(c: Candidate, role: Role): SimPokemonSpec {
  const sc = ROLE_SCENARIO[role];
  return {
    speciesId: c.build.speciesId,
    fastMove: c.moveset.fast.moveId,
    chargedMoves: c.moveset.charged.map((m) => m.moveId),
    ivs: c.build.ivs,
    level: c.build.level,
    shields: sc.shields,
    startEnergyTurns: sc.energyTurns,
  };
}

export function opponentSpec(m: MetaEntry, role: Role): SimPokemonSpec {
  return {
    speciesId: m.speciesId,
    fastMove: m.fastMove,
    chargedMoves: m.chargedMoves.slice(0, 2),
    shields: ROLE_SCENARIO[role].oppShields,
  };
}

const memo = new Map<string, SlotResult[]>();

function slotKey(c: Candidate, role: Role): string {
  return `${c.build.specimenId}|${c.build.speciesId}|${c.build.level}|${c.moveset.fast.moveId}|${c.moveset.charged.map((m) => m.moveId).join('+')}|${role}`;
}

export function simulateSlot(
  c: Candidate,
  role: Role,
  sim: BattleSimulator,
  meta: MetaEntry[],
  opts: SimOptions,
): SlotSim {
  const key = slotKey(c, role);
  let results = memo.get(key);
  if (!results) {
    const me = candidateSpec(c, role);
    results = meta.map((m) => {
      const r = sim.simulate(me, opponentSpec(m, role), opts);
      return { opponent: m.speciesId, rating: r.rating, win: r.rating > 500 };
    });
    memo.set(key, results);
  }
  return { candidate: c, role, results, wins: results.filter((r) => r.win).length };
}

export function simulateFinalists(
  drafts: TrioDraft[],
  sim: BattleSimulator,
  meta: MetaEntry[],
  index: GameDataIndex,
  opts: SimOptions,
  onProgress?: (done: number, total: number) => void,
): TeamSim[] {
  void index;
  const out: TeamSim[] = [];
  drafts.forEach((d, i) => {
    const slots = d.slots.map((c, s) => simulateSlot(c, d.roles[s] as Role, sim, meta, opts)) as [
      SlotSim,
      SlotSim,
      SlotSim,
    ];
    out.push({
      draft: d,
      slots,
      scenario: {
        lead: '1 shield each',
        switch: '1 shield each, switching in with energy',
        closer: 'no shields',
      },
    });
    if (onProgress) {
      onProgress(i + 1, drafts.length);
    }
  });
  return out;
}

export function clearSimMemo(): void {
  memo.clear();
}
