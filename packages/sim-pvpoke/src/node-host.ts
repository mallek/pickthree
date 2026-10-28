import vm from 'node:vm';
import { buildBundleSource } from './bundle.js';
import type { PvPokeBattle, PvPokeGameMaster, PvPokePokemon, PvPokeRuntime } from './types.js';

let cachedSource: string | null = null;

interface Exported {
  GameMaster: { getInstance(): PvPokeGameMaster };
  Battle: new () => PvPokeBattle;
  Pokemon: new (id: string, index: number, battle: PvPokeBattle) => PvPokePokemon;
  flushAjax: () => void;
}

/** A loaded PvPoke bundle plus a way to read anything in its vm context. */
export interface PvPokeContext {
  runtime: PvPokeRuntime;
  /**
   * Runs `expression` as a script in the bundle's context and returns its value. Reaches top-level
   * `class` bindings (TimelineAction, DamageMultiplier, DamageCalculator), which are not properties
   * of the global object.
   */
  evaluate<T>(expression: string): T;
}

export function createPvPokeContext(gamemaster: unknown): PvPokeContext {
  if (cachedSource === null) {
    cachedSource = buildBundleSource();
  }
  // A fresh vm context has its own copy of every standard built-in. Do not pass Array, Map, Math
  // and friends from this realm: cross-realm instanceof checks would break inside the bundle.
  const sandbox: Record<string, unknown> = {
    console: { log: () => {}, error: console.error, warn: console.warn },
    __PICKTHREE_GAMEMASTER__: structuredClone(gamemaster),
  };
  const context = vm.createContext(sandbox);
  new vm.Script(cachedSource, { filename: 'pvpoke-bundle.js' }).runInContext(context);
  const exported = (context as { __pvpoke?: Exported }).__pvpoke;
  if (!exported) {
    throw new Error('PvPoke bundle did not export __pvpoke');
  }
  const gm = exported.GameMaster.getInstance();
  // GameMaster's constructor issued its game master "request"; deliver it now that the instance
  // has all of its methods defined (see globals-shim.js).
  exported.flushAjax();
  if (!gm.data.pokemon || gm.data.pokemon.length === 0) {
    throw new Error('PvPoke GameMaster did not load the injected game master');
  }
  return {
    runtime: {
      GameMaster: exported.GameMaster,
      Battle: exported.Battle,
      Pokemon: exported.Pokemon,
      gm,
    },
    evaluate<T>(expression: string): T {
      return new vm.Script(expression, { filename: 'pvpoke-evaluate.js' }).runInContext(
        context,
      ) as T;
    },
  };
}

export function loadPvPokeInNode(gamemaster: unknown): PvPokeRuntime {
  return createPvPokeContext(gamemaster).runtime;
}
