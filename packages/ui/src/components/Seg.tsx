import type { CSSProperties, ReactNode } from 'react';

/** Segmented control: real buttons, so Enter and Space activate them like a tap. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  style,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  style?: CSSProperties;
}) {
  return (
    <span className="seg" role="group" style={style}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={o.value === value ? 'on' : ''}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
