import { useId } from 'react';
import { Chevron } from './Chevron.tsx';
import type { ChoiceOption } from './Select.tsx';

/** A compact choice that reads as text ("Sort: Verdict"), for a line that has room for a word, not
 * a field. A native select lies over it so the phone opens its own picker; the label names it. */
export function InlineSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <span className="ui-inline-select">
      <span className="ui-inline-select-text" aria-hidden="true">
        {label}: {current}
        <Chevron dir="down" />
      </span>
      <select
        id={id}
        aria-label={label}
        value={value}
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
    </span>
  );
}
