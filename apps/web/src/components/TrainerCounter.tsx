import { useEffect, useState } from 'react';
import { fetchCount } from '../counter.ts';
import { PeopleGlyph } from './LandingGlyphs.tsx';

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
 *
 * `inline` is the landing page's cut of the same number: the leading zeros stay, because the
 * padding is the joke, but they run on one line next to the label instead of in boxes. The boxed
 * version is still what the settings sheet shows.
 */
export function TrainerCounter({ count, inline }: { count: number | null; inline?: boolean }) {
  if (count === null) {
    return null;
  }
  const digits = String(Math.max(0, Math.floor(count)))
    .padStart(4, '0')
    .split('');
  const label = `${count === 1 ? 'trainer has' : 'trainers have'} pick3ed`;
  if (inline === true) {
    return (
      <p className="counter-inline" aria-live="polite">
        <PeopleGlyph />
        <b aria-label={`${count} trainers`}>{digits.join('')}</b> {label}
      </p>
    );
  }
  return (
    <div className="counter odometer" aria-live="polite">
      <span className="odo-digits" aria-label={`${count} trainers`}>
        {digits.map((d, i) => (
          <span className="odo-digit" key={i} aria-hidden="true">
            {d}
          </span>
        ))}
      </span>
      <span className="odo-label">{label}</span>
    </div>
  );
}
