import type {
  AnalyzeOptions,
  BuildOptions,
  ComputeHost,
  CounterEntry,
  CountersOptions,
  ImportReport,
  ManualInput,
  ManualResult,
  ProgressEvent,
  Recommendation,
  RecommendOptions,
  ScanList,
  ScanListOptions,
  Specimen,
  TeamAnalysis,
  TeamPick,
  Verdict,
} from '@pickthree/engine';
import type { LeagueInfo, WorkerRequest, WorkerResponse, WorkerResult } from './protocol.ts';

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type RequestBody = DistributiveOmit<WorkerRequest, 'id'>;

interface Pending {
  resolve: (r: WorkerResult) => void;
  reject: (e: Error) => void;
  onProgress?: (e: ProgressEvent) => void;
  onPartial?: (verdicts: Record<string, Verdict>) => void;
}

export class ImportFailed extends Error {
  readonly header: unknown;

  constructor(message: string, header: unknown) {
    super(message);
    this.name = 'ImportFailed';
    this.header = header;
  }
}

/**
 * ComputeHost backed by the engine Web Worker. One request at a time per id, progress streamed.
 * League-specific calls name the league; the worker fetches that league's bundle on first use.
 */
export class WorkerHost implements ComputeHost {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  /** League the ComputeHost-shaped calls (no league argument) run in. */
  league = 'great';

  constructor(worker?: Worker) {
    this.worker =
      worker ??
      new Worker(new URL('../worker/engine.worker.ts', import.meta.url), { type: 'classic' });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => this.handle(ev.data);
    this.worker.onerror = (ev) => {
      for (const p of this.pending.values()) {
        p.reject(new Error(ev.message || 'Worker crashed'));
      }
      this.pending.clear();
    };
  }

  private handle(msg: WorkerResponse): void {
    const p = this.pending.get(msg.id);
    if (!p) {
      return;
    }
    if (msg.kind === 'progress') {
      p.onProgress?.({ stage: msg.stage, done: msg.done, total: msg.total });
      return;
    }
    if (msg.kind === 'partial') {
      p.onPartial?.(msg.verdicts);
      return;
    }
    this.pending.delete(msg.id);
    if (msg.kind === 'error') {
      p.reject(msg.header ? new ImportFailed(msg.message, msg.header) : new Error(msg.message));
      return;
    }
    p.resolve(msg.result);
  }

  private send(
    req: RequestBody,
    onProgress?: (e: ProgressEvent) => void,
    onPartial?: (verdicts: Record<string, Verdict>) => void,
  ): Promise<WorkerResult> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const pending: Pending = { resolve, reject };
      if (onProgress) {
        pending.onProgress = onProgress;
      }
      if (onPartial) {
        pending.onPartial = onPartial;
      }
      this.pending.set(id, pending);
      this.worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  async ready(): Promise<Extract<WorkerResult, { kind: 'ready' }>> {
    const r = await this.send({ kind: 'ready' });
    if (r.kind !== 'ready') {
      throw new Error('unexpected reply');
    }
    return r;
  }

  async leagueInfo(league: string): Promise<LeagueInfo> {
    const r = await this.send({ kind: 'league', league });
    if (r.kind !== 'league') {
      throw new Error('unexpected reply');
    }
    return r.info;
  }

  async importCsv(text: string): Promise<{ specimens: Specimen[]; report: ImportReport }> {
    const r = await this.send({ kind: 'import', text });
    if (r.kind !== 'import') {
      throw new Error('unexpected reply');
    }
    return { specimens: r.specimens, report: r.report };
  }

  async recommend(
    specimens: Specimen[],
    options: Partial<RecommendOptions>,
    onProgress?: (e: ProgressEvent) => void,
    league = this.league,
  ): Promise<Recommendation> {
    const r = await this.send({ kind: 'recommend', league, specimens, options }, onProgress);
    if (r.kind !== 'recommend') {
      throw new Error('unexpected reply');
    }
    return r.recommendation;
  }

  async verdicts(
    specimens: Specimen[],
    options: Partial<BuildOptions>,
    onProgress?: (e: ProgressEvent) => void,
    league = this.league,
    onPartial?: (verdicts: Record<string, Verdict>) => void,
  ): Promise<Record<string, Verdict>> {
    const r = await this.send(
      { kind: 'verdicts', league, specimens, options },
      onProgress,
      onPartial,
    );
    if (r.kind !== 'verdicts') {
      throw new Error('unexpected reply');
    }
    return r.verdicts;
  }

  async counters(
    specimens: Specimen[],
    options: Partial<CountersOptions>,
    league = this.league,
  ): Promise<CounterEntry[]> {
    const r = await this.send({ kind: 'counters', league, specimens, options });
    if (r.kind !== 'counters') {
      throw new Error('unexpected reply');
    }
    return r.counters;
  }

  async scanList(options: Partial<ScanListOptions>, league = this.league): Promise<ScanList> {
    const r = await this.send({ kind: 'scanlist', league, options });
    if (r.kind !== 'scanlist') {
      throw new Error('unexpected reply');
    }
    return r.scanList;
  }

  async analyze(
    picks: [TeamPick, TeamPick, TeamPick],
    specimens: Specimen[],
    options: Partial<AnalyzeOptions>,
    onProgress?: (e: ProgressEvent) => void,
    league = this.league,
  ): Promise<TeamAnalysis> {
    const r = await this.send({ kind: 'analyze', league, picks, specimens, options }, onProgress);
    if (r.kind !== 'analyze') {
      throw new Error('unexpected reply');
    }
    return r.analysis;
  }

  async manual(input: ManualInput): Promise<ManualResult> {
    const r = await this.send({ kind: 'manual', input });
    if (r.kind !== 'manual') {
      throw new Error('unexpected reply');
    }
    return r.result;
  }
}
