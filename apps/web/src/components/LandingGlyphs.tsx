/**
 * The landing page's small glyphs. They are flat geometry in `currentColor` (the pokeball keeps
 * its own two colours), drawn at 20px on a 24 grid like the rest of the app's icons, so the
 * landing gains no artwork it does not already have a right to.
 */

/** Three ascending filled bars: what "recently logged" counts. */
export function BarsGlyph() {
  return (
    <svg className="lg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="13" width="5" height="8" rx="1.5" fill="currentColor" />
      <rect x="9.5" y="7" width="5" height="14" rx="1.5" fill="currentColor" />
      <rect x="16" y="10" width="5" height="11" rx="1.5" fill="currentColor" />
    </svg>
  );
}

/** Two figures: a collection belongs to a person, and the counter counts people. */
export function PeopleGlyph() {
  return (
    <svg className="lg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="9" cy="8" r="3.6" fill="currentColor" />
      <path d="M2.6 20c0-3.4 2.9-5.6 6.4-5.6s6.4 2.2 6.4 5.6z" fill="currentColor" />
      <circle cx="17.4" cy="8.8" r="2.8" fill="currentColor" opacity="0.6" />
      <path d="M15 14.9c.8-.3 1.6-.4 2.4-.4 3 0 4.6 1.9 4.6 5.1h-4.7c0-1.9-.8-3.5-2.3-4.7z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

/** A closed padlock: the promise the line next to it makes. */
export function LockGlyph() {
  return (
    <svg className="lg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M8 10V7.5a4 4 0 0 1 8 0V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" fill="currentColor" />
    </svg>
  );
}

/** The arrow on the landing's two calls to action. */
export function ArrowGlyph() {
  return (
    <svg className="lg-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 12h15m0 0l-6-6m6 6l-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
