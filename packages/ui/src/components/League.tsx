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

/** The league toggle: a full-width radiogroup with the game's own shield colours. `dataLeague`
 * is a pass-through `data-league` attribute on the wrapper (apps/web's screenshot automation
 * reads it to confirm the active league before capturing); omit it and no attribute is rendered. */
export function LeagueSwitcher<T extends string>({
  options,
  value,
  onChange,
  label,
  compact,
  dataLeague,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  compact?: boolean;
  dataLeague?: string;
}) {
  return (
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
          {o.label}
        </button>
      ))}
    </div>
  );
}
