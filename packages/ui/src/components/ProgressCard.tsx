import type { ReactNode } from 'react';
import { MeasuredLine } from './Measured.tsx';

/** Percent of the way to a goal, 0 to 100: a zero goal counts as reached, and anything outside
 * the range (past the goal, negative, NaN) is clamped so the bar never breaks. */
export function progressPercent(done: number, goal: number): number {
  if (!Number.isFinite(done) || done <= 0) {
    return goal <= 0 ? 100 : 0;
  }
  if (goal <= 0) {
    return 100;
  }
  return Math.min(100, Math.round((done / goal) * 100));
}

/** Personal progress toward a goal (the 15 battles before your log weights your teams), with an
 * optional measured line for the community contribution, kept visually separate. */
export function ProgressCard({
  title,
  done,
  goal,
  line,
  contribution,
}: {
  title: string;
  done: number;
  goal: number;
  line: string;
  contribution?: ReactNode;
}) {
  const pct = progressPercent(done, goal);
  return (
    <section className="ui-progress-card">
      <div className="ui-progress-head">
        <b>{title}</b>
        <span className="ui-progress-count">{`${Math.max(0, Math.trunc(done) || 0)} / ${goal}`}</span>
      </div>
      <div
        className="ui-progress-bar"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="ui-progress-line">{line}</p>
      {contribution !== undefined ? <MeasuredLine>{contribution}</MeasuredLine> : null}
    </section>
  );
}
