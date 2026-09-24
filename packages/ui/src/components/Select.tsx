import { useId } from 'react';
import { Chevron } from './Chevron.tsx';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** A labelled native select. The label is always visible, so a reader knows what the field is a
 * choice of before opening it ("Window", "Source"). */
export function Select<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className="field-l">{label}</span>
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
