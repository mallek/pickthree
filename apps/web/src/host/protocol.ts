export interface SpeciesLite {
  name: string;
  types: [PokemonType, PokemonType | 'none'];
}

import type {
  AnalyzeOptions,
  BuildOptions,
  CounterEntry,
  CountersOptions,
  PokemonType,
  ImportReport,
  ManualInput,
  ManualResult,
  MetaRank,
  Recommendation,
  RecommendOptions,
  ScanList,
  ScanListOptions,
  Specimen,
  TeamAnalysis,
  TeamPick,
  Verdict,
} from '@pickthree/engine';

export type WorkerRequest =
  | { id: number; kind: 'ready' }
  | { id: number; kind: 'import'; text: string }
  | { id: number; kind: 'recommend'; specimens: Specimen[]; options: Partial<RecommendOptions> }
  | { id: number; kind: 'verdicts'; specimens: Specimen[]; options: Partial<BuildOptions> }
  | { id: number; kind: 'counters'; specimens: Specimen[]; options: Partial<CountersOptions> }
  | { id: number; kind: 'scanlist'; options: Partial<ScanListOptions> }
  | {
      id: number;
      kind: 'analyze';
      picks: [TeamPick, TeamPick, TeamPick];
      specimens: Specimen[];
      options: Partial<AnalyzeOptions>;
    }
  | { id: number; kind: 'manual'; input: ManualInput };

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
      /** Species with a matchup matrix row, so they can be hand-picked for a team. */
      analyzable: string[];
    }
  | { kind: 'import'; specimens: Specimen[]; report: ImportReport }
  | { kind: 'recommend'; recommendation: Recommendation }
  | { kind: 'verdicts'; verdicts: Record<string, Verdict> }
  | { kind: 'counters'; counters: CounterEntry[] }
  | { kind: 'scanlist'; scanList: ScanList }
  | { kind: 'analyze'; analysis: TeamAnalysis }
  | { kind: 'manual'; result: ManualResult };
