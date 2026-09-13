/// <reference lib="webworker" />
import {
  GameDataIndex,
  metaCounters,
  parsePokeGenieCsv,
  metaRanks,
  recommend,
  scanList,
  toSpecimens,
  verdictsFor,
  ImportError,
  type StaticData,
  type BattleSimulator,
  type DataManifest,
  type MatchupMatrix,
  type MetaEntry,
  type Move,
  type RankingEntry,
  type Species,
} from '@pickthree/engine';
import { PvPokeSimulator, type PvPokeRuntime } from '@pickthree/sim-pvpoke/browser';
import type { WorkerRequest, WorkerResponse } from '../host/protocol.ts';

declare const self: DedicatedWorkerGlobalScope & {
  __pvpoke?: {
    GameMaster: PvPokeRuntime['GameMaster'];
    Battle: PvPokeRuntime['Battle'];
    Pokemon: PvPokeRuntime['Pokemon'];
    flushAjax: () => void;
  };
  __PICKTHREE_GAMEMASTER__?: unknown;
};

const post = (m: WorkerResponse): void => self.postMessage(m);

let ready: Promise<{ data: StaticData; sim: BattleSimulator; index: GameDataIndex }> | null = null;

async function json<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'force-cache' });
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return (await res.json()) as T;
}

type BootStep = (step: string, done: number) => void;

async function boot(
  step: BootStep,
): Promise<{ data: StaticData; sim: BattleSimulator; index: GameDataIndex }> {
  step('fetching game data', 0);
  const [
    species,
    moves,
    overall,
    leads,
    switches,
    closers,
    chargers,
    meta,
    matrix,
    manifest,
    gamemaster,
  ] = await Promise.all([
    json<Species[]>('/data/pokemon.json'),
    json<Move[]>('/data/moves.json'),
    json<RankingEntry[]>('/data/rankings/great/overall.json'),
    json<RankingEntry[]>('/data/rankings/great/leads.json'),
    json<RankingEntry[]>('/data/rankings/great/switches.json'),
    json<RankingEntry[]>('/data/rankings/great/closers.json'),
    json<RankingEntry[]>('/data/rankings/great/chargers.json'),
    json<MetaEntry[]>('/data/meta/great.json'),
    json<MatchupMatrix>('/data/matrix/great.json'),
    json<DataManifest>('/data/data-manifest.json'),
    json<unknown>('/data/gamemaster.json'),
  ]);
  // The vendored PvPoke bundle reads the game master from this global when its shimmed ajax
  // callback is flushed (see packages/sim-pvpoke/src/globals-shim.js).
  step('loading simulator', 1);
  self.__PICKTHREE_GAMEMASTER__ = gamemaster;
  self.importScripts('/data/vendor/pvpoke-sim.js');
  step('starting simulator', 2);
  const exported = self.__pvpoke;
  if (!exported) {
    throw new Error('PvPoke bundle did not initialize');
  }
  const gm = exported.GameMaster.getInstance();
  exported.flushAjax();
  step('indexing', 3);
  const runtime: PvPokeRuntime = {
    GameMaster: exported.GameMaster,
    Battle: exported.Battle,
    Pokemon: exported.Pokemon,
    gm,
  };
  const sim = new PvPokeSimulator(runtime);
  const data: StaticData = {
    species,
    moves,
    rankings: { overall, leads, switches, closers, chargers },
    meta,
    matrix,
    manifest,
  };
  const index = new GameDataIndex(species, moves);
  step('ready', 4);
  return { data, sim, index };
}

function ensureReady(
  step: BootStep,
): Promise<{ data: StaticData; sim: BattleSimulator; index: GameDataIndex }> {
  if (!ready) {
    ready = boot(step);
  }
  return ready;
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    const env = await ensureReady((stage, done) =>
      post({ id: msg.id, kind: 'progress', stage: `boot: ${stage}`, done, total: 4 }),
    );
    if (msg.kind === 'ready') {
      const m = env.data.manifest;
      post({
        id: msg.id,
        kind: 'result',
        result: {
          kind: 'ready',
          manifest: {
            pvpokeCommit: m.pvpokeCommit,
            pvpokeDate: m.pvpokeDate,
            builtAt: m.builtAt,
            metaSize: m.metaSize,
          },
          species: Object.fromEntries(
            env.data.species.map((sp) => [sp.speciesId, { name: sp.speciesName, types: sp.types }]),
          ),
          meta: env.data.meta.map((x) => x.speciesId),
          metaRanks: Object.fromEntries(metaRanks(env.data.rankings)),
        },
      });
      return;
    }
    if (msg.kind === 'import') {
      const parsed = parsePokeGenieCsv(msg.text);
      const { specimens, report } = toSpecimens(parsed, env.index);
      post({ id: msg.id, kind: 'result', result: { kind: 'import', specimens, report } });
      return;
    }
    if (msg.kind === 'recommend') {
      const recommendation = recommend(
        msg.specimens,
        msg.options,
        { data: env.data, sim: env.sim },
        (stage, done, total) => post({ id: msg.id, kind: 'progress', stage, done, total }),
      );
      post({ id: msg.id, kind: 'result', result: { kind: 'recommend', recommendation } });
      return;
    }
    if (msg.kind === 'verdicts') {
      const verdicts = verdictsFor(
        msg.specimens,
        msg.options,
        { data: env.data, sim: env.sim },
        (stage, done, total) => post({ id: msg.id, kind: 'progress', stage, done, total }),
      );
      post({ id: msg.id, kind: 'result', result: { kind: 'verdicts', verdicts } });
      return;
    }
    if (msg.kind === 'counters') {
      const counters = metaCounters(
        { matrix: env.data.matrix, rankings: env.data.rankings },
        msg.specimens,
        env.index,
        msg.options,
      );
      post({ id: msg.id, kind: 'result', result: { kind: 'counters', counters } });
      return;
    }
    if (msg.kind === 'scanlist') {
      const list = scanList(
        { matrix: env.data.matrix, rankings: env.data.rankings },
        env.index,
        msg.options,
      );
      post({ id: msg.id, kind: 'result', result: { kind: 'scanlist', scanList: list } });
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const header = err instanceof ImportError ? err.header : undefined;
    post({ id: msg.id, kind: 'error', message, header });
  }
};
