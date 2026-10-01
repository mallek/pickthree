import type { ReactNode } from 'react';

/**
 * The Settings hub's row icons: 20px line drawings on a 24 grid in `currentColor`, stroked like
 * the app's other IconButton glyphs (ShareGlyph, PencilGlyph), decorative only.
 */

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** A stack of three discs: the collection and the log stored on this phone. */
export function DataGlyph() {
  return (
    <Glyph>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.5" />
      <path d="M4.5 12v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V12" />
    </Glyph>
  );
}

/** Two figures: battles shared with other players. */
export function CommunityGlyph() {
  return (
    <Glyph>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2" />
      <path d="M17.5 14.8c2.1.6 3.5 2.5 3.5 5.2" />
    </Glyph>
  );
}

/** A circle half filled: the light and dark themes. */
export function AppearanceGlyph() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
    </Glyph>
  );
}

/** An i in a circle: the build, the data and the credits. */
export function AboutGlyph() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6v.2" />
    </Glyph>
  );
}

/** Three bars of different heights: a ranking. */
export function RankGlyph() {
  return (
    <Glyph>
      <path d="M5 20v-6" />
      <path d="M12 20V5" />
      <path d="M19 20v-10" />
    </Glyph>
  );
}
