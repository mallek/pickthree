import { useEffect, useLayoutEffect, useState } from 'react';
import { useActions, useAppState } from '../state/store.tsx';

/** How long each tone stays up. A warning waits to be read; a confirmation only says it worked. */
const WARN_MS = 8000;
const INFO_MS = 3000;
/** The fixed bars at a page's foot (the tab bar, Log a Battle's result bar, New Set's start). */
const FOOT_BARS = '.tabs, .result-bar, .new-set-foot';
/** The gap between a confirmation and the bar under it. */
const FOOT_GAP = 12;

/** Distance from the viewport's bottom to the top of the highest bar at the page's foot. */
function footClearance(): number {
  let top = window.innerHeight;
  for (const el of document.querySelectorAll(FOOT_BARS)) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) {
      top = Math.min(top, r.top);
    }
  }
  return window.innerHeight - top + FOOT_GAP;
}

/**
 * Floating one-line notice. A warning (a battle that failed to save) is amber, at the top,
 * announced at once, with an OK. A confirmation (a battle logged, a link copied) is neutral and
 * polite: it sits at the foot, just above the page's own bottom bar, so it never covers the
 * header, clears itself after about three seconds and goes on a tap.
 */
export function NoticeToast() {
  const s = useAppState();
  const { notify } = useActions();
  const message = s.notice;
  const info = s.noticeTone === 'info';
  const [bottom, setBottom] = useState(FOOT_GAP);
  useEffect(() => {
    if (!message) {
      return undefined;
    }
    const t = window.setTimeout(() => notify(null), info ? INFO_MS : WARN_MS);
    return () => window.clearTimeout(t);
  }, [message, info, notify]);
  useLayoutEffect(() => {
    if (message && info) {
      setBottom(footClearance());
    }
  }, [message, info]);
  if (!message) {
    return null;
  }
  if (info) {
    return (
      <div
        className="update-toast notice-toast notice-info notice-foot"
        role="status"
        style={{ bottom }}
      >
        <button type="button" className="notice-tap" onClick={() => notify(null)}>
          {message}
        </button>
      </div>
    );
  }
  return (
    <div className="update-toast notice-toast notice-warn" role="alert">
      <span>{message}</span>
      <button type="button" onClick={() => notify(null)} aria-label="Dismiss">
        OK
      </button>
    </div>
  );
}
