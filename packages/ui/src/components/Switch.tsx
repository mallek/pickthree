import { useId } from 'react';

/** A labeled on/off row: the label (and an optional one-line explanation) on the left, the
 * track on the right, the whole row one 44px+ button. Controlled: a tap asks `onChange` for the
 * opposite state and the parent decides, so a confirm can stand between the tap and the change.
 * The accessible name is the label alone (aria-labelledby); the line, when given, is the
 * description (aria-describedby), not folded into the name. */
export function Switch({
  label,
  line,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  line?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  const lineId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={line ? lineId : undefined}
      className="ui-switch-row"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-switch-text">
        <span id={labelId} className="ui-switch-label">
          {label}
        </span>
        {line ? (
          <span id={lineId} className="ui-switch-line">
            {line}
          </span>
        ) : null}
      </span>
      <span className={`ui-switch${checked ? ' on' : ''}`} aria-hidden="true" />
    </button>
  );
}
