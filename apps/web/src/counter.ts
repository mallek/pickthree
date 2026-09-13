/**
 * The Geocities counter. One anonymous POST per device the first time teams are built; a GET to
 * show the total on the welcome screen. Nothing about the collection is ever sent.
 */
export const COUNTER_ORIGIN = 'https://pickthree-counter.travis-c82.workers.dev';
const KEY = 'pickthree.pick3ed';

export async function fetchCount(): Promise<number | null> {
  try {
    const res = await fetch(`${COUNTER_ORIGIN}/count`, { cache: 'no-store' });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { count?: number };
    return typeof body.count === 'number' ? body.count : null;
  } catch {
    return null;
  }
}

/** Counts this device once. Safe to call after every recommendation run. */
export async function recordPick3(): Promise<void> {
  // Screenshot and share-test runs drive the app with automation; they are not trainers.
  if (navigator.webdriver) {
    return;
  }
  try {
    if (localStorage.getItem(KEY)) {
      return;
    }
  } catch {
    // Storage unavailable (private mode, blocked): still count, may double count on reload.
  }
  try {
    const res = await fetch(`${COUNTER_ORIGIN}/hit`, { method: 'POST', keepalive: true });
    if (res.ok) {
      try {
        localStorage.setItem(KEY, new Date().toISOString());
      } catch {
        // ignore
      }
    }
  } catch {
    // Offline or blocked: the counter is decoration, never an error.
  }
}
