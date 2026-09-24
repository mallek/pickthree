import { useEffect, useRef } from 'react';

/**
 * One line of feedback with an optional action ("Win logged" / Undo). It dismisses itself after
 * `duration` ms (0 keeps it up). The action runs at most once. Render a new toast with a new
 * `key` so its timer and its once-only action start fresh.
 */
export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  duration = 8000,
}: {
  message: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  onDismiss: () => void;
  duration?: number;
}) {
  const acted = useRef(false);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    if (duration <= 0) {
      return undefined;
    }
    const t = window.setTimeout(() => dismiss.current(), duration);
    return () => window.clearTimeout(t);
  }, [duration]);
  return (
    <div className="ui-toast" role="status" aria-live="polite">
      <span className="ui-toast-msg">{message}</span>
      {actionLabel !== undefined && onAction !== undefined ? (
        <button
          type="button"
          className="ui-toast-action"
          onClick={() => {
            if (acted.current) {
              return;
            }
            acted.current = true;
            onAction();
            dismiss.current();
          }}
        >
          {actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        className="ui-toast-x"
        aria-label="Dismiss"
        onClick={() => dismiss.current()}
      >
        &times;
      </button>
    </div>
  );
}
