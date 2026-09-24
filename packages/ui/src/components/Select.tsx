import { useId } from 'react';
import { Chevron } from './Chevron.tsx';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** A labelled native select. The label is visible by default, so a reader knows what the field
 * is a choice of before opening it. `hideLabel` keeps the label for a screen reader and takes it
 * off the screen, for a field whose current value already says what it is (the team board's two
 * filters: "This meta" and "All ranks" need no caption above them, and the caption cost the row
 * above the fold). It never removes the name, only the ink. */
export function Select<T extends string>({
  options,
  value,
  onChange,
  label,
  hideLabel = false,
  disabled = false,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className={hideLabel ? 'field-l vh' : 'field-l'}>{label}</span>
      <span className="select-wrap">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const next = options.find((o) => o.value === e.target.value);
            if (next) {
              onChange(next.value);
            }
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled ?? false}>
              {o.label}
            </option>
          ))}
        </select>
        <Chevron dir="down" />
      </span>
    </label>
  );
}
