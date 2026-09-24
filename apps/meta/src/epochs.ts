import { epochFor, type Epoch } from '@pickthree/engine/meta';
export { epochFor, type Epoch };

let cached: Promise<Epoch[]> | null = null;

export function loadEpochs(fetcher: typeof fetch = fetch): Promise<Epoch[]> {
  if (!cached) {
    cached = (async () => {
      const res = await fetcher('/epochs.json');
      if (!res.ok) {
        throw new Error(`Could not load /epochs.json (${res.status})`);
      }
      return (await res.json()) as Epoch[];
    })().catch((err: unknown) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

/** Tests only: forget the memoised load so the next call uses a fresh stub. */
export function resetEpochs(): void {
  cached = null;
}

export function commitMismatch(epoch: Epoch | null, bakedCommit: string): boolean {
  if (!epoch || epoch.pvpokeCommit === undefined) {
    return false;
  }
  return epoch.pvpokeCommit !== bakedCommit;
}
