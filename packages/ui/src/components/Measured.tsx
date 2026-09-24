import type { ReactNode } from 'react';

/** The bar mark that says "measured": three bars in the measured pink. */
function Bars() {
  return (
    <svg className="ui-measured-bars" width={11} height={11} viewBox="0 0 11 11" aria-hidden="true">
      <rect x="0" y="6" width="3" height="5" rx="1" />
      <rect x="4" y="0" width="3" height="11" rx="1" />
      <rect x="8" y="3" width="3" height="8" rx="1" />
    </svg>
  );
}

/** A measured community number: pink text led by the bar mark, never a pill, so it cannot be
 * mistaken for a Psychic or Fairy type chip. */
export function MeasuredValue({ value, unit }: { value: string; unit?: string | undefined }) {
  return (
    <span className="ui-measured">
      <span className="ui-measured-num">
        <Bars />
        <b>{value}</b>
      </span>
      {unit ? <small>{unit}</small> : null}
    </span>
  );
}

/** A sentence about measured data, led by the pink dot. */
export function MeasuredLine({ children }: { children: ReactNode }) {
  return (
    <p className="ui-measured-line">
      <span className="ui-measured-dot" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
