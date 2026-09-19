/**
 * Meta epochs: when the game changed enough that what came before stops describing what players
 * face now. Hand-kept in apps/meta/epochs.json, the same pattern packages/data/seasons.json
 * already follows, and validated by the bake.
 *
 * Resetting the meta is one line and a deploy, and it DELETES NOTHING. A reset moves the default
 * window; it does not purge the Durable Object. The 30 and 7 day views keep working and a reset
 * made in error is one edit from undone. A destructive purge is the only version that cannot be
 * taken back, and it is never needed: the cure for stale data is to stop counting it, not to burn
 * it.
 *
 * Not derived from the PvPoke bump. data-refresh.yml moves that commit weekly and almost none of
 * those bumps are a meta reset; deriving it would reset the site most weeks for nothing. An epoch
 * can NAME the commit it expects instead, and the site says so plainly when the two disagree,
 * because that is the case where the projection scores the old movesets while the measured side
 * already reflects the new ones.
 */
export interface Epoch {
  at: string;
  note: string;
  /** Absent means every league. */
  leagues?: string[];
  pvpokeCommit?: string;
}

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

export function epochFor(epochs: readonly Epoch[], league: string, at: Date): Epoch | null {
  let best: Epoch | null = null;
  let bestAt = -Infinity;
  for (const e of epochs) {
    const started = Date.parse(e.at);
    if (!Number.isFinite(started) || started > at.getTime()) {
      continue;
    }
    if (e.leagues && !e.leagues.includes(league)) {
      continue;
    }
    if (started > bestAt) {
      best = e;
      bestAt = started;
    }
  }
  return best;
}

export function commitMismatch(epoch: Epoch | null, bakedCommit: string): boolean {
  if (!epoch || epoch.pvpokeCommit === undefined) {
    return false;
  }
  return epoch.pvpokeCommit !== bakedCommit;
}
