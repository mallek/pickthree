import { useId, type ReactNode } from 'react';
import { Chevron } from './Chevron.tsx';

/** A row that opens in place. `summary` sits inside the toggle button, so it must hold no
 * buttons or links of its own; put actions in `children`, which render only while open. */
export function ExpandRow({
  summary,
  children,
  open,
  onToggle,
}: {
  summary: ReactNode;
  children: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  return (
    <div className={`ui-expand${open ? ' open' : ''}`}>
      <button
        type="button"
        className="ui-expand-head"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span className="ui-expand-summary">{summary}</span>
        <Chevron dir={open ? 'up' : 'down'} />
      </button>
      <div id={id} className="ui-expand-body" hidden={!open}>
        {open ? children : null}
      </div>
    </div>
  );
}
