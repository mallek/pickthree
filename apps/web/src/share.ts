import { SHARE_CACHE, SHARE_KEY, SHARE_PARAM } from './share-protocol.ts';

/** True when this page load came from the share target redirect. */
export function arrivedFromShare(): boolean {
  return new URLSearchParams(window.location.search).get(SHARE_PARAM) === '1';
}

/** The CSV the service worker parked for us, if any. Cleared once read. */
export async function takeSharedCsv(): Promise<{ text: string; name: string | null } | null> {
  if (!('caches' in window)) {
    return null;
  }
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match(SHARE_KEY);
    if (!res) {
      return null;
    }
    const text = await res.text();
    const rawName = res.headers.get('x-file-name');
    await cache.delete(SHARE_KEY);
    return { text, name: rawName ? decodeURIComponent(rawName) : null };
  } catch {
    return null;
  }
}

/**
 * Hands a link to the phone's share sheet when there is one, else copies it. Resolves to what
 * happened so the caller can say so; 'cancelled' when the sheet was dismissed.
 */
export async function shareLink(
  url: string,
  title: string,
): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const nav = navigator as Navigator & {
    share?: (d: { url: string; title: string }) => Promise<void>;
  };
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ url, title });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Drop the share marker from the address bar so a reload does not look like a new share. */
export function clearShareMarker(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(SHARE_PARAM);
  // Keep this entry's existing state (history.ts's markEntry stamps pick3Depth on it); passing
  // null here would wipe that stamp out from under it.
  window.history.replaceState(window.history.state, '', url.toString());
}
