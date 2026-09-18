import { useEffect, useState } from 'react';
import { fetchCount } from '../counter.ts';

/** Fetches the anonymous trainer count once per mount; null while loading or unavailable. */
export function useTrainerCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void fetchCount().then((c) => {
      if (live) {
        setCount(c);
      }
    });
    return () => {
      live = false;
    };
  }, []);
  return count;
}

/**
 * The Geocities counter: one box per digit, the way a hit counter looked, with what it counts
 * underneath. Renders nothing until the count arrives.
 */
export function TrainerCounter({ count }: { count: number | null }) {
  if (count === null) {
    return null;
  }
  const digits = String(Math.max(0, Math.floor(count)))
    .padStart(4, '0')
    .split('');
  return (
    <div className="counter odometer" aria-live="polite">
      <span className="odo-digits" aria-label={`${count} trainers`}>
        {digits.map((d, i) => (
          <span className="odo-digit" key={i} aria-hidden="true">
            {d}
          </span>
        ))}
      </span>
      <span className="odo-label">{count === 1 ? 'trainer has' : 'trainers have'} pick3ed</span>
    </div>
  );
}
