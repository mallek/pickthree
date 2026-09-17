import type { Layout } from '@pickthree/engine';
export interface SpeciesLite {
  name: string;
  types: [PokemonType, PokemonType | 'none'];
  familyId: string | null;
  /** Pokedex number. */
  dex: number;
}

/** What the UI needs about the league in play, computed in the worker. */
export interface LeagueInfo {
  id: string;
  /** Meta group species ids, in PvPoke order. */
  meta: string[];
  metaSize: number;
  /** Overall and best-role meta rank per species, ignoring IVs. */
  metaRanks: Record<string, MetaRank>;
  /** Species with a matchup matrix row in this league, so they can be hand-picked for a team. */
  analyzable: string[];
}

import type {
  TeamRef,
  Faceoff,
  AnalyzeOptions,
  BuildOptions,
  CountersOptions,
  CountersResult,
  ImportReport,
  League,
  ManualInput,
  ManualResult,
  MetaRank,
  MovePool,
  PokemonType,
  Recommendation,
  RecommendOptions,
  ScanList,
  ScanListOptions,
  Season,
  Specimen,
  TeamAnalysis,
  TeamPick,
  Verdict,
} from '@pickthree/engine';

export type WorkerRequest =
  | { id: number; kind: 'ready' }
  | { id: number; kind: 'league'; league: string }
  | { id: number; kind: 'import'; text: string }
  | { id: number; kind: 'manual'; input: ManualInput }
  | {
      id: number;
      kind: 'recommend';
      league: string;
      specimens: Specimen[];
      options: Partial<RecommendOptions>;
    }
  | {
      id: number;
      kind: 'verdicts';
      league: string;
      specimens: Specimen[];
      options: Partial<BuildOptions>;
    }
  | {
      id: number;
      kind: 'counters';
      league: string;
      specimens: Specimen[];
      options: Partial<CountersOptions>;
    }
  | { id: number; kind: 'scanlist'; league: string; options: Partial<ScanListOptions> }
  | {
      id: number;
      kind: 'movepool';
      league: string;
      speciesId: string;
      fastId: string | null;
      current: { fast: string | null; charged: string[] };
      options: { allowEliteTm?: boolean | undefined };
    }
  | {
      id: number;
      kind: 'analyze';
      league: string;
      picks: [TeamPick, TeamPick, TeamPick];
      specimens: Specimen[];
      options: Partial<AnalyzeOptions>;
    }
  | {
      id: number;
      kind: 'faceoff';
      league: string;
      team: TeamRef;
      specimens: Specimen[];
      opponent: string;
      options: Partial<BuildOptions>;
    };

export type WorkerResponse =
  | { id: number; kind: 'progress'; stage: string; done: number; total: number }
  /** A slice of the final result, so the UI can fill in while the rest computes. */
  | { id: number; kind: 'partial'; verdicts: Record<string, Verdict> }
  | { id: number; kind: 'result'; result: WorkerResult }
  | { id: number; kind: 'error'; message: string; layout?: Layout | undefined };

export type WorkerResult =
  | {
      kind: 'ready';
      manifest: { pvpokeCommit: string; pvpokeDate: string; builtAt: string };
      species: Record<string, SpeciesLite>;
      leagues: League[];
      /** Released, non-mega species ids for adding a Pokémon by hand. */
      allSpecies: string[];
      /** Go Battle League seasons, oldest first. Empty when the data build predates the list. */
      seasons: Season[];
      /** Move id to display name and type, for the `@word` search term. */
      moves: Record<string, { name: string; type: PokemonType }>;
    }
  | { kind: 'league'; info: LeagueInfo }
  | { kind: 'import'; specimens: Specimen[]; report: ImportReport }
  | { kind: 'recommend'; recommendation: Recommendation }
  | { kind: 'verdicts'; verdicts: Record<string, Verdict> }
  | { kind: 'counters'; counters: CountersResult }
  | { kind: 'scanlist'; scanList: ScanList }
  | { kind: 'movepool'; pool: MovePool }
  | { kind: 'analyze'; analysis: TeamAnalysis }
  | { kind: 'manual'; result: ManualResult }
  | { kind: 'faceoff'; faceoff: Faceoff };
