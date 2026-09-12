import type { BattleSimulator, SimOptions, SimPokemonSpec, SimResult } from '@pickthree/engine';
import type { PvPokeBattle, PvPokePokemon, PvPokeRuntime } from './types.js';

/**
 * BattleSimulator backed by the vendored PvPoke simulator. The call order mirrors PvPoke's
 * Ranker.rank exactly: setNewPokemon(false), reset, setShields, startEnergy, simulate.
 */
export class PvPokeSimulator implements BattleSimulator {
  private readonly rt: PvPokeRuntime;

  constructor(runtime: PvPokeRuntime) {
    this.rt = runtime;
  }

  simulate(a: SimPokemonSpec, b: SimPokemonSpec, opts: SimOptions): SimResult {
    const battle = new this.rt.Battle();
    battle.setCP(opts.cp);
    battle.setLevelCap(opts.levelCap);
    battle.setCup('all');

    const p0 = this.buildPokemon(a, 0, battle, opts);
    const p1 = this.buildPokemon(b, 1, battle, opts);

    battle.setNewPokemon(p0, 0, false);
    battle.setNewPokemon(p1, 1, false);
    p0.reset();
    p1.reset();
    p0.setShields(a.shields);
    p1.setShields(b.shields);
    p0.startEnergy = startEnergyFor(p0, a.startEnergyTurns ?? 0);
    p1.startEnergy = startEnergyFor(p1, b.startEnergyTurns ?? 0);

    battle.simulate();

    const rating = p0.getBattleRating();
    const opRating = p1.getBattleRating();
    let winner: 0 | 1 | null = null;
    if (rating > opRating) {
      winner = 0;
    } else if (opRating > rating) {
      winner = 1;
    }
    return { rating, opRating, winner, turnsToWin: battle.getTurnsToWin() };
  }

  private buildPokemon(
    spec: SimPokemonSpec,
    index: 0 | 1,
    battle: PvPokeBattle,
    opts: SimOptions,
  ): PvPokePokemon {
    if (!this.rt.gm.getPokemonById(spec.speciesId)) {
      throw new Error(`Unknown speciesId: ${spec.speciesId}`);
    }
    const p = new this.rt.Pokemon(spec.speciesId, index, battle);
    if (spec.ivs) {
      if (spec.level === undefined) {
        throw new Error(`level is required when ivs are given (${spec.speciesId})`);
      }
      p.setIV('atk', spec.ivs.atk);
      p.setIV('def', spec.ivs.def);
      p.setIV('hp', spec.ivs.sta);
      p.setLevel(spec.level, true);
    } else {
      p.initialize(opts.cp);
    }
    this.selectMoves(p, spec);
    return p;
  }

  private selectMoves(p: PvPokePokemon, spec: SimPokemonSpec): void {
    assertMove(this.rt, spec.fastMove);
    p.selectMove('fast', spec.fastMove);
    const charged = spec.chargedMoves;
    if (charged.length === 0 || charged.length > 2) {
      throw new Error(`chargedMoves must have 1 or 2 entries (${spec.speciesId})`);
    }
    charged.forEach((id, i) => {
      assertMove(this.rt, id);
      p.selectMove('charged', id, i);
    });
    if (charged.length === 1) {
      p.selectMove('charged', 'none', 1);
    }
  }
}

function assertMove(rt: PvPokeRuntime, id: string): void {
  if (!rt.gm.data.moves.some((m) => m.moveId === id)) {
    throw new Error(`Unknown moveId: ${id}`);
  }
}

/** PvPoke Ranker: energy advantage expressed as turns; converted to fast-move count then energy. */
function startEnergyFor(p: PvPokePokemon, turns: number): number {
  if (turns === 0) {
    return 0;
  }
  let fastMoveCount = Math.floor((turns * 500) / p.fastMove.cooldown);
  if (fastMoveCount === 0) {
    fastMoveCount = 1;
  }
  return Math.min(p.fastMove.energyGain * fastMoveCount, 100);
}
