import type { BuildOptions } from '../builds/eligibility.js';
import type { ImportReport, Specimen } from '../collection/specimen.js';
import type { Recommendation, RecommendOptions } from '../recommend.js';
import type { Verdict } from '../verdicts/worth.js';
import type { CounterEntry, CountersOptions } from '../counters/counters.js';
import type { ScanList, ScanListOptions } from '../scan/scanList.js';
import type { AnalyzeOptions, TeamAnalysis, TeamPick } from '../analyze.js';
import type { ManualInput, ManualResult } from '../collection/manual.js';

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
  counters(specimens: Specimen[], options: Partial<CountersOptions>): Promise<CounterEntry[]>;
  scanList(options: Partial<ScanListOptions>): Promise<ScanList>;
  analyze(
    picks: [TeamPick, TeamPick, TeamPick],
    specimens: Specimen[],
    options: Partial<AnalyzeOptions>,
    onProgress?: (e: ProgressEvent) => void,
  ): Promise<TeamAnalysis>;
  manual(input: ManualInput): Promise<ManualResult>;
}
