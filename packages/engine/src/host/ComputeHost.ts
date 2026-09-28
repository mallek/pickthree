import type { BuildOptions } from '../builds/eligibility.js';
import type { MovePool } from '../builds/moves.js';
import type { ImportReport, Specimen } from '../collection/specimen.js';
import type { Recommendation, RecommendOptions } from '../recommend.js';
import type { Verdict } from '../verdicts/worth.js';
import type { CountersOptions, CountersResult } from '../counters/counters.js';
import type { ScanList, ScanListOptions } from '../scan/scanList.js';
import type { AnalyzeOptions, TeamAnalysis, TeamPick } from '../analyze.js';
import type { SuggestOptions, SuggestResult } from '../teammates/suggest.js';
import type { ManualInput, ManualResult } from '../collection/manual.js';
import type { Faceoff } from '../yourmeta/faceoff.js';
import type { TeamRef } from '../yourmeta/types.js';

export interface ProgressEvent {
  stage: string;
  done: number;
  total: number;
}

/**
 * Where the engine runs. The web app implements this with a Web Worker; tests implement it
 * in-process; a fetch-backed host could implement it against a server later without touching
 * the engine or the UI.
 */
export interface ComputeHost {
  importCsv(text: string): Promise<{ specimens: Specimen[]; report: ImportReport }>;
  recommend(
    specimens: Specimen[],
    options: Partial<RecommendOptions>,
    onProgress?: (e: ProgressEvent) => void,
  ): Promise<Recommendation>;
  verdicts(
    specimens: Specimen[],
    options: Partial<BuildOptions>,
    onProgress?: (e: ProgressEvent) => void,
  ): Promise<Record<string, Verdict>>;
  /**
   * Progress arrives when an outsider is simulated (options.vs outside the meta group) and while
   * the shield grids fill against one opponent. With options.vs and at least one row, `onPartial`
   * gets the rows first with every grid null, then the rows again after each batch of grids but
   * the last; the promise resolves with the rows re-sorted by the grid and `gridMs` set. An
   * opponent PvPoke does not rank (no rows) and the whole meta get no partials, only the result.
   * `league` defaults to the host's own.
   */
  counters(
    specimens: Specimen[],
    options: Partial<CountersOptions>,
    onProgress?: (e: ProgressEvent) => void,
    league?: string,
    onPartial?: (r: CountersResult) => void,
  ): Promise<CountersResult>;
  scanList(options: Partial<ScanListOptions>): Promise<ScanList>;
  analyze(
    picks: [TeamPick, TeamPick, TeamPick],
    specimens: Specimen[],
    options: Partial<AnalyzeOptions>,
    onProgress?: (e: ProgressEvent) => void,
  ): Promise<TeamAnalysis>;
  /**
   * Teammates for one or two pinned favorites. Matrix only, so it answers fast enough to be a
   * button; Analyze runs the real simulation on what it fills in.
   */
  suggestTeammates(
    board: [TeamPick | null, TeamPick | null, TeamPick | null],
    specimens: Specimen[],
    options: Partial<SuggestOptions>,
  ): Promise<SuggestResult>;
  manual(input: ManualInput): Promise<ManualResult>;
  /** The in-battle card: one opponent against the set's team, simulated on the device. */
  faceoff(
    team: TeamRef,
    specimens: Specimen[],
    opponent: string,
    options: Partial<BuildOptions>,
  ): Promise<Faceoff>;
  /** Every move a species can run, for the hand-built team's move picker. */
  movePool(
    speciesId: string,
    fastId: string | null,
    current: { fast: string | null; charged: string[] },
  ): Promise<MovePool>;
}
