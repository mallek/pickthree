/** "Filters" with a count of the filters that are on. It opens the screen's own filter sheet,
 * which the app renders; the button only reports and requests. */
export function FilterButton({
  count,
  onClick,
  label = 'Filters',
}: {
  count: number;
  onClick: () => void;
  label?: string;
}) {
  const on = count > 0;
  return (
    <button
      type="button"
      className={`ui-filter-btn${on ? ' on' : ''}`}
      aria-haspopup="dialog"
      aria-label={on ? `${label}, ${count} on` : label}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        width={18}
        height={18}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
        <circle cx="15" cy="6" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
      <span>{label}</span>
      {on ? (
        <span className="ui-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  );
}
