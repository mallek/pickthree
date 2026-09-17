/// <reference lib="webworker" />
import {
  analyzeTeam,
  buildOptionsFor,
  displayName,
  GameDataIndex,
  manualSpecimen,
  metaCounters,
  metaRanks,
  movePool,
  parseCollectionCsv,
  rankingsById,
  recommend,
  scanList,
  toSpecimens,
  verdictsFor,
  ImportError,
  type StaticData,
  type BattleSimulator,
  type Verdict,
  type DataManifest,
  type League,
  type MatchupMatrix,
  type MetaEntry,
  type Move,
  type RankingEntry,
  type Season,
  type Species,
} from '@pickthree/engine';
import { PvPokeSimulator, type PvPokeRuntime } from '@pickthree/sim-pvpoke/browser';
import type { LeagueInfo, WorkerRequest, WorkerResponse } from '../host/protocol.ts';

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

interface Env {
  species: Species[];
  moves: Move[];
  manifest: DataManifest;
  leagues: League[];
  sim: BattleSimulator;
  index: GameDataIndex;
  seasons: Season[];
}

interface LeagueBundle {
  league: League;
  rankings: StaticData['rankings'];
  meta: MetaEntry[];
  matrix: MatchupMatrix;
}

let ready: Promise<Env> | null = null;
const bundles = new Map<string, Promise<LeagueBundle>>();

async function json<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'force-cache' });
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return (await res.json()) as T;
}

type BootStep = (step: string, done: number) => void;

async function boot(step: BootStep): Promise<Env> {
  step('fetching game data', 0);
  const [species, moves, manifest, leagues, gamemaster, seasons] = await Promise.all([
    json<Species[]>('/data/pokemon.json'),
    json<Move[]>('/data/moves.json'),
    json<DataManifest>('/data/data-manifest.json'),
    json<League[]>('/data/leagues.json'),
    json<unknown>('/data/gamemaster.json'),
    json<Season[]>('/data/seasons.json').catch(() => [] as Season[]),
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
  const index = new GameDataIndex(species, moves);
  step('ready', 4);
  return { species, moves, manifest, leagues, sim, index, seasons };
}

function ensureReady(step: BootStep): Promise<Env> {
  if (!ready) {
    ready = boot(step);
  }
  return ready;
}

/** Rankings, meta group and matrix for one league, fetched once and kept. */
function bundleFor(env: Env, id: string): Promise<LeagueBundle> {
  let p = bundles.get(id);
  if (!p) {
    const league = env.leagues.find((l) => l.id === id);
    if (!league) {
      return Promise.reject(new Error(`Unknown league ${id}`));
    }
    p = (async () => {
      const [overall, leads, switches, closers, chargers, meta, matrix] = await Promise.all([
        json<RankingEntry[]>(`/data/rankings/${id}/overall.json`),
        json<RankingEntry[]>(`/data/rankings/${id}/leads.json`),
        json<RankingEntry[]>(`/data/rankings/${id}/switches.json`),
        json<RankingEntry[]>(`/data/rankings/${id}/closers.json`),
        json<RankingEntry[]>(`/data/rankings/${id}/chargers.json`),
        json<MetaEntry[]>(`/data/meta/${id}.json`),
        json<MatchupMatrix>(`/data/matrix/${id}.json`),
      ]);
      return { league, rankings: { overall, leads, switches, closers, chargers }, meta, matrix };
    })();
    bundles.set(id, p);
    p.catch(() => bundles.delete(id));
  }
  return p;
}

async function dataFor(env: Env, id: string): Promise<StaticData> {
  const b = await bundleFor(env, id);
  return {
    species: env.species,
    moves: env.moves,
    league: b.league,
    rankings: b.rankings,
    meta: b.meta,
    matrix: b.matrix,
    manifest: env.manifest,
  };
}

function leagueInfo(env: Env, data: StaticData): LeagueInfo {
  return {
    id: data.league.id,
    meta: data.meta.map((x) => x.speciesId),
    metaSize: data.meta.length,
    metaRanks: Object.fromEntries(metaRanks(data.rankings)),
    analyzable: data.matrix.candidates.filter((id) => {
      const sp = env.index.species(id);
      return Boolean(sp && sp.released);
    }),
  };
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    const env = await ensureReady((stage, done) =>
      post({ id: msg.id, kind: 'progress', stage: `boot: ${stage}`, done, total: 4 }),
    );
    if (msg.kind === 'ready') {
      const m = env.manifest;
      post({
        id: msg.id,
        kind: 'result',
        result: {
          kind: 'ready',
          manifest: { pvpokeCommit: m.pvpokeCommit, pvpokeDate: m.pvpokeDate, builtAt: m.builtAt },
          species: Object.fromEntries(
            env.species.map((sp) => [
              sp.speciesId,
              {
                name: displayName(sp.speciesId, env.index),
                types: sp.types,
                familyId: sp.familyId,
                dex: sp.dex,
              },
            ]),
          ),
          leagues: env.leagues,
          allSpecies: env.species
            .filter((sp) => sp.released && !sp.tags.includes('mega'))
            .map((sp) => sp.speciesId),
          seasons: env.seasons,
          moves: Object.fromEntries(
            env.moves.map((m) => [m.moveId, { name: m.name, type: m.type }]),
          ),
        },
      });
      return;
    }
    if (msg.kind === 'league') {
      const data = await dataFor(env, msg.league);
      post({ id: msg.id, kind: 'result', result: { kind: 'league', info: leagueInfo(env, data) } });
      return;
    }
    if (msg.kind === 'import') {
      const parsed = parseCollectionCsv(msg.text, env.index);
      const { specimens, report } = toSpecimens(parsed, env.index);
      post({ id: msg.id, kind: 'result', result: { kind: 'import', specimens, report } });
      return;
    }
    if (msg.kind === 'manual') {
      const result = manualSpecimen(msg.input, env.index);
      post({ id: msg.id, kind: 'result', result: { kind: 'manual', result } });
      return;
    }
    const data = await dataFor(env, msg.league);
    const deps = { data, sim: env.sim };
    const progress = (stage: string, done: number, total: number): void =>
      post({ id: msg.id, kind: 'progress', stage, done, total });
    if (msg.kind === 'recommend') {
      const recommendation = recommend(msg.specimens, msg.options, deps, progress);
      post({ id: msg.id, kind: 'result', result: { kind: 'recommend', recommendation } });
      return;
    }
    if (msg.kind === 'verdicts') {
      // Chunked so the Collection fills in as it goes; a 3k-scan bag takes a while.
      const CHUNK = 25;
      const verdicts: Record<string, Verdict> = {};
      const total = msg.specimens.length;
      for (let i = 0; i < total; i += CHUNK) {
        const slice = verdictsFor(msg.specimens.slice(i, i + CHUNK), msg.options, deps);
        Object.assign(verdicts, slice);
        post({ id: msg.id, kind: 'partial', verdicts: slice });
        progress('verdicts', Math.min(total, i + CHUNK), total);
      }
      post({ id: msg.id, kind: 'result', result: { kind: 'verdicts', verdicts } });
      return;
    }
    if (msg.kind === 'counters') {
      const counters = metaCounters(
        { matrix: data.matrix, rankings: data.rankings },
        msg.specimens,
        env.index,
        { buildOptions: buildOptionsFor(data.league), ...msg.options },
      );
      post({ id: msg.id, kind: 'result', result: { kind: 'counters', counters } });
      return;
    }
    if (msg.kind === 'scanlist') {
      const list = scanList({ matrix: data.matrix, rankings: data.rankings }, env.index, {
        cpCap: data.league.cp,
        buildOptions: buildOptionsFor(data.league),
        ...msg.options,
      });
      post({ id: msg.id, kind: 'result', result: { kind: 'scanlist', scanList: list } });
      return;
    }
    if (msg.kind === 'movepool') {
      const pool = movePool(
        msg.speciesId,
        msg.fastId,
        rankingsById(data.rankings.overall),
        msg.current,
        { allowEliteTm: msg.options.allowEliteTm ?? true },
        env.index,
      );
      post({ id: msg.id, kind: 'result', result: { kind: 'movepool', pool } });
      return;
    }
    if (msg.kind === 'analyze') {
      const analysis = analyzeTeam(msg.picks, msg.specimens, msg.options, deps, progress);
      post({ id: msg.id, kind: 'result', result: { kind: 'analyze', analysis } });
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const layout = err instanceof ImportError ? err.layout : undefined;
    post({ id: msg.id, kind: 'error', message, layout });
  }
};
