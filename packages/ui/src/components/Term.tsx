import { useState, type ReactNode } from 'react';

/** A tap-to-reveal note: `term` is the short label always on screen, `children` the fuller
 * explanation shown only once tapped. */
export function Term({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="term-wrap">
      <button
        type="button"
        className="term"
        data-inline-control=""
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {term}
      </button>
      {open ? <span className="term-tip">{children}</span> : null}
    </span>
  );
}
