import { useEffect } from 'react';
import { useActions, useAppState } from '../state/store.tsx';

/** Floating one-line notice, such as a battle that failed to save. Clears itself or on tap. */
export function NoticeToast() {
  const s = useAppState();
  const { notify } = useActions();
  const message = s.notice;
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
    <div className="update-toast notice-toast" role="alert">
      <span>{message}</span>
      <button type="button" onClick={() => notify(null)} aria-label="Dismiss">
        OK
      </button>
    </div>
  );
}
