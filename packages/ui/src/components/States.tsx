import type { ReactNode } from 'react';

/** Work in progress: the stage in words and a bar. No total means the length is unknown. */
export function Loading({
  label,
  done = 0,
  total = 0,
}: {
  label: string;
  done?: number;
  total?: number;
}) {
  const known = total > 0;
  const pct = known ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;
  return (
    <div className="ui-loading" role="status">
      <div className="ui-loading-label">{label}</div>
      <div className={`ui-loading-bar${known ? '' : ' indeterminate'}`}>
        <span style={known ? { width: `${pct}%` } : undefined} />
      </div>
    </div>
  );
}

/** Nothing to show: one line on why and what to do, and an optional action. */
export function Empty({ line, action }: { line: string; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      <p>{line}</p>
      {action ?? null}
    </div>
  );
}

/** Something failed: what went wrong and how to fix it, and an optional action. */
export function ErrorState({ line, action }: { line: string; action?: ReactNode }) {
  return (
    <div className="ui-error" role="alert">
      <p>{line}</p>
      {action ?? null}
    </div>
  );
}
