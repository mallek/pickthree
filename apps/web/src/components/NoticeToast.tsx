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
export function footClearance(): number {
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
 * header, clears itself after about three seconds and goes on a tap. A notice with a list of
 * choices (the live cups) stays until one is tapped or Not now.
 */
export function NoticeToast() {
  const s = useAppState();
  const { notify } = useActions();
  const message = s.notice;
  const info = s.noticeTone === 'info';
  const action = s.noticeAction;
  const choices = s.noticeChoices;
  const asks = choices.length > 0;
  const [bottom, setBottom] = useState(FOOT_GAP);
  useEffect(() => {
    if (!message || asks) {
      return undefined;
    }
    const t = window.setTimeout(() => notify(null), info && !action ? INFO_MS : WARN_MS);
    return () => window.clearTimeout(t);
  }, [message, info, action, asks, notify]);
  // Measured again when the page changes under a confirmation, since the new page's foot bar
  // (the tab bar, or Log a Battle's taller result bar) sets where it must sit.
  const route = s.route;
  useLayoutEffect(() => {
    if (message && info) {
      setBottom(footClearance());
    }
  }, [message, info, route]);
  if (!message) {
    return null;
  }
  if (info && asks) {
    return (
      <div
        className="update-toast notice-toast notice-info notice-foot notice-choices"
        role="status"
        style={{ bottom }}
      >
        <span className="notice-msg">{message}</span>
        <div className="notice-choice-row">
          {choices.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => {
                c.run();
                notify(null);
              }}
            >
              {c.label}
            </button>
          ))}
          <button type="button" className="notice-quiet" onClick={() => notify(null)}>
            Not now
          </button>
        </div>
      </div>
    );
  }
  if (info && action) {
    return (
      <div
        className="update-toast notice-toast notice-info notice-foot"
        role="status"
        style={{ bottom }}
      >
        <span className="notice-msg">{message}</span>
        <button
          type="button"
          onClick={() => {
            action.run();
            notify(null);
          }}
        >
          {action.label}
        </button>
        <button type="button" className="notice-quiet" onClick={() => notify(null)}>
          Not now
        </button>
      </div>
    );
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
