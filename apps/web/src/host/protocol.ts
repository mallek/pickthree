export interface SpeciesLite {
  name: string;
  types: [PokemonType, PokemonType | 'none'];
}

import type {
  BuildOptions,
  CounterEntry,
  CountersOptions,
  PokemonType,
  ImportReport,
  MetaRank,
  Recommendation,
  RecommendOptions,
  ScanList,
  ScanListOptions,
  Specimen,
  Verdict,
} from '@pickthree/engine';

export type WorkerRequest =
  | { id: number; kind: 'ready' }
  | { id: number; kind: 'import'; text: string }
  | { id: number; kind: 'recommend'; specimens: Specimen[]; options: Partial<RecommendOptions> }
  | { id: number; kind: 'verdicts'; specimens: Specimen[]; options: Partial<BuildOptions> }
  | { id: number; kind: 'counters'; specimens: Specimen[]; options: Partial<CountersOptions> }
  | { id: number; kind: 'scanlist'; options: Partial<ScanListOptions> };

export type WorkerResponse =
  | { id: number; kind: 'progress'; stage: string; done: number; total: number }
  | { id: number; kind: 'result'; result: WorkerResult }
  | { id: number; kind: 'error'; message: string; header?: unknown };

export type WorkerResult =
  | {
      kind: 'ready';
      manifest: { pvpokeCommit: string; pvpokeDate: string; builtAt: string; metaSize: number };
      species: Record<string, SpeciesLite>;
      meta: string[];
      /** Overall and best-role meta rank per species, ignoring IVs. */
      metaRanks: Record<string, MetaRank>;
    }
  | { kind: 'import'; specimens: Specimen[]; report: ImportReport }
  | { kind: 'recommend'; recommendation: Recommendation }
  | { kind: 'verdicts'; verdicts: Record<string, Verdict> }
  | { kind: 'counters'; counters: CounterEntry[] }
  | { kind: 'scanlist'; scanList: ScanList };
