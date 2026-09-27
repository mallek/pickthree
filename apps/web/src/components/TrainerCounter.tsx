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
 * The trainer counter: the landing page's cut of the number, on the landing page and at the foot
 * of Settings' About page. The leading zeros stay, because the padding is the joke, and run on one
 * line next to the label. Renders nothing until the count arrives.
 */
export function TrainerCounter({ count }: { count: number | null }) {
  if (count === null) {
    return null;
  }
  const digits = String(Math.max(0, Math.floor(count))).padStart(4, '0');
  const label = `${count === 1 ? 'trainer has' : 'trainers have'} pick3ed`;
  return (
    <p className="counter-inline" aria-live="polite">
      <PeopleGlyph />
      <b aria-label={`${count} trainers`}>{digits}</b> {label}
    </p>
  );
}
