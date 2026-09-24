import { useLayoutEffect, useRef, useState } from 'react';
import type { ChoiceOption } from './Select.tsx';

export const LEAGUE_COLORS: Record<string, string> = {
  great: '#3F7DE8',
  ultra: '#F2B01E',
  master: '#B03DBE',
};

export function LeagueShield({ id, size = 16 }: { id: string; size?: number }) {
  const color = LEAGUE_COLORS[id] ?? '#8E9AAF';
  return (
    <svg
      className="league-shield"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" fill={color} />
      <path d="M12 6.2l4.4 1.9v3.4c0 3-1.9 5.5-4.4 6.9V6.2z" fill="rgba(255,255,255,0.28)" />
    </svg>
  );
}

interface LeagueChoiceOption<T extends string> {
  value: T;
  /** The visible text on the button. */
  label: string;
  /** The accessible name, when it differs from the visible text: pick3 shows "Great" and
   * announces "Great League". Omit it and the visible text is the accessible name, which is
   * what meta wants. */
  srLabel?: string;
}

/** The league toggle: a full-width radiogroup with the game's own shield colors, plus an
 * optional overflow segment ("...") outside the radio group for more leagues and cups.
 * `dataLeague` is a pass-through `data-league` attribute on the wrapper (apps/web's screenshot
 * automation reads it to confirm the active league before capturing); omit it and no attribute
 * renders. The radiogroup holds only the open leagues; a cup lives behind the overflow. When the
 * current league is a cup, `more.current` swaps the "..." for that cup's shield and short name,
 * styled selected, so the row still names what is in play; tapping it still opens the sheet. If
 * the cup's name would not fit next to the open leagues' names, the open leagues' names hide
 * (shields only, kept in the accessibility tree) to give the cup slot the room; only if that is
 * still not enough does the cup name ellipsize in its own slot. No caret on the overflow button:
 * it costs width the name needs. */
export function LeagueSwitcher<T extends string>({
  options,
  value,
  onChange,
  label,
  compact,
  dataLeague,
  more,
}: {
  options: LeagueChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  compact?: boolean;
  dataLeague?: string;
  /** An overflow segment after the leagues ("..."), for more leagues and cups. The app decides
   * what it opens. It sits outside the radio group: it is an action, not a choice. `current`
   * shows the current cup in the slot instead of "...", still opening the same sheet. */
  more?:
    | {
        label: string;
        onClick: () => void;
        current?: { id: string; label: string; srLabel?: string };
      }
    | undefined;
}) {
  const groupRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const cupLabelRef = useRef<HTMLSpanElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const current = more?.current;
  // Whether the cup's name fits next to the open leagues' full names decides whether those names
  // hide. Measured, not guessed: a layout effect runs before paint, so there is no visible flash.
  useLayoutEffect(() => {
    if (!current) {
      setCollapsed(false);
      return undefined;
    }
    const cupLabel = cupLabelRef.current;
    const group = groupRef.current;
    if (!cupLabel || !group) {
      return undefined;
    }
    const isClipped = (el: Element) => el.scrollWidth > el.clientWidth;
    const measure = () => {
      // Read the fit as it would be with the open leagues' names showing, whatever the current
      // collapsed state is, so the decision never feeds on its own effect (which would let the
      // row flip back and forth between the two layouts). The equal-width league buttons only
      // ever divide the room the radiogroup as a whole is given, so a name too tight to sit next
      // to the cup shows up as one of the open leagues clipping, not only the cup itself: either
      // one means the row as shown does not fit and the names should hide. Queried fresh each
      // time (not a per-button ref array) so a change in `options` never leaves a stale list.
      const labels = [...group.querySelectorAll<HTMLElement>('.ui-league-label')];
      const hadVh = labels.map((el) => el.classList.contains('vh'));
      labels.forEach((el) => el.classList.remove('vh'));
      const clipped = isClipped(cupLabel) || labels.some((el) => isClipped(el));
      labels.forEach((el, i) => {
        if (hadVh[i] === true) {
          el.classList.add('vh');
        }
      });
      setCollapsed(clipped);
    };
    measure();
    let disposed = false;
    const safeMeasure = () => {
      if (!disposed) {
        measure();
      }
    };
    // The row itself does not resize when only its content does (a font swap widening a label,
    // the group or the cup slot changing what they need); observing those two directly, not the
    // row, is what catches that. ResizeObserver is missing in some test environments (jsdom).
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(safeMeasure);
      ro.observe(group);
      if (moreRef.current) {
        ro.observe(moreRef.current);
      }
    }
    // The web font arriving after the first paint is the other way a measurement goes stale
    // (the fallback font's metrics decided "fits", the real font's do not): re-read once more
    // fonts finish loading, and once `ready` settles, whichever fires. document.fonts does not
    // exist in every test environment either.
    const fonts = document.fonts as FontFaceSet | undefined;
    fonts?.addEventListener('loadingdone', safeMeasure);
    if (fonts) {
      void fonts.ready.then(safeMeasure);
    }
    return () => {
      disposed = true;
      ro?.disconnect();
      fonts?.removeEventListener('loadingdone', safeMeasure);
    };
  }, [current?.id, current?.label, current?.srLabel]);

  const group = (
    <div
      ref={groupRef}
      className={`league-switcher${compact ? ' compact' : ''}`}
      role="radiogroup"
      aria-label={label}
      {...(dataLeague === undefined ? {} : { 'data-league': dataLeague })}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.srLabel}
          className={o.value === value ? 'on' : undefined}
          onClick={() => onChange(o.value)}
        >
          <LeagueShield id={o.value} />
          <span className={collapsed ? 'ui-league-label vh' : 'ui-league-label'}>{o.label}</span>
        </button>
      ))}
    </div>
  );
  if (!more) {
    return group;
  }
  return (
    <div className={`league-row${collapsed ? ' collapsed' : ''}`}>
      {group}
      {current ? (
        <button
          ref={moreRef}
          type="button"
          className="league-more on"
          title={current.label}
          aria-label={`${current.srLabel ?? current.label} League, ${more.label}`}
          aria-haspopup="dialog"
          onClick={more.onClick}
        >
          <LeagueShield id={current.id} />
          <span ref={cupLabelRef} className="ui-league-label">
            {current.label}
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="league-more"
          aria-label={more.label}
          aria-haspopup="dialog"
          onClick={more.onClick}
        >
          <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
            <circle cx="5" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="19" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** A full page of leagues and cups for a `Sheet`: one radiogroup, one row per option, each a
 * 44px-or-taller full-width button with the shield and the full title. `LeagueSwitcher` holds the
 * open leagues and a peek at the current cup; this is the whole list, for choosing among all of
 * them (`apps/web`'s "Leagues" sheet page). */
export function LeagueList<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="ui-league-list" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled ?? false}
          className={`ui-league-row${o.value === value ? ' on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          <LeagueShield id={o.value} />
          <span className="ui-league-row-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
