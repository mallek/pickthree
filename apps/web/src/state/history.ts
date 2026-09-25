/**
 * How many pick3 screens sit behind the current one in this tab, kept on each history entry's
 * state so the browser's own back and forward carry it. `window.history.length` cannot answer
 * this: it counts the pages before pick3 too, so a first screen opened from a link would "go
 * back" off the site.
 */
let depth = -1;

/** Call once on load and on every hash change. */
export function markEntry(): void {
  // jsdom (and some browsers before any state is pushed) give undefined here, not null.
  const st = window.history.state as { pick3Depth?: unknown } | null | undefined;
  if (st !== null && st !== undefined && typeof st.pick3Depth === 'number') {
    depth = st.pick3Depth;
    return;
  }
  depth += 1;
  window.history.replaceState({ ...(st ?? {}), pick3Depth: depth }, '');
}

/**
 * Swap the current entry's address for `hash` without adding a screen: a landing that hands off
 * (a team link's, once its analysis is ready) leaves nothing behind to go back to. The entry keeps
 * its pick3 depth; `location.replace` would give it null state, and the next `markEntry` would
 * then count it as one more screen. replaceState fires no hashchange, so the caller routes.
 */
export function replaceEntry(hash: string): void {
  window.history.replaceState(window.history.state, '', hash);
}

export function canGoBack(): boolean {
  return depth > 0;
}

export function resetHistoryForTests(): void {
  depth = -1;
}
