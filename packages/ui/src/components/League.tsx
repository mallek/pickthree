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

interface ChoiceOption<T extends string> {
  value: T;
  /** The visible text on the button. */
  label: string;
  /** The accessible name, when it differs from the visible text: pick3 shows "Great" and
   * announces "Great League". Omit it and the visible text is the accessible name, which is
   * what meta wants. */
  srLabel?: string;
}

/** The league toggle: a full-width radiogroup with the game's own shield colors. `dataLeague` is
 * a pass-through `data-league` attribute on the wrapper (apps/web's screenshot automation reads it
 * to confirm the active league before capturing); omit it and no attribute renders. `more` adds
 * an optional overflow segment ("...") after the leagues, outside the radiogroup, for more
 * leagues and cups. With four or more leagues in a narrow row the shields step aside first so
 * every name stays whole; a name ellipsizes only when even that is not enough. */
export function LeagueSwitcher<T extends string>({
  options,
  value,
  onChange,
  label,
  compact,
  dataLeague,
  more,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  compact?: boolean;
  dataLeague?: string;
  /** An overflow segment after the leagues ("..."), for more leagues and cups. The app decides
   * what it opens. It sits outside the radio group: it is an action, not a choice. */
  more?: { label: string; onClick: () => void } | undefined;
}) {
  const group = (
    <div
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
          <span className="ui-league-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
  if (!more) {
    return group;
  }
  return (
    <div className="league-row">
      {group}
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
    </div>
  );
}
