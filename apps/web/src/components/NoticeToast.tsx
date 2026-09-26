import { useEffect } from 'react';
import { useActions, useAppState } from '../state/store.tsx';

/**
 * Floating one-line notice. A warning (a battle that failed to save) is amber and announced at
 * once; a confirmation (a battle logged, a link copied) is neutral and announced politely.
 * Clears itself or on tap.
 */
export function NoticeToast() {
  const s = useAppState();
  const { notify } = useActions();
  const message = s.notice;
  const info = s.noticeTone === 'info';
  useEffect(() => {
    if (!message) {
      return undefined;
    }
    const t = window.setTimeout(() => notify(null), 8000);
    return () => window.clearTimeout(t);
  }, [message, notify]);
  if (!message) {
    return null;
  }
  return (
    <div
      className={`update-toast notice-toast ${info ? 'notice-info' : 'notice-warn'}`}
      role={info ? 'status' : 'alert'}
    >
      <span>{message}</span>
      <button type="button" onClick={() => notify(null)} aria-label="Dismiss">
        OK
      </button>
    </div>
  );
}
