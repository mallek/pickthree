import type { MoveChoice, MoveIds, MovePool } from '@pickthree/engine';
import { countsText, EffectIcons, TmBadge, TypeChip } from '../components.tsx';

function sameIds(a: MoveIds, b: MoveIds): boolean {
  return (
    a.fast === b.fast &&
    a.charged.length === b.charged.length &&
    a.charged.every((id, i) => id === b.charged[i])
  );
}

function Option({
  move,
  role,
  checked,
  fastName,
  onClick,
}: {
  move: MoveChoice;
  role: 'radio' | 'checkbox';
  checked: boolean;
  fastName: string | null;
  onClick: () => void;
}) {
  const count = fastName ? countsText(fastName, move.counts) : null;
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      className={`move-opt${checked ? ' on' : ''}`}
      onClick={onClick}
    >
      <span className="move-opt-mark" aria-hidden="true" />
      <span className="move-main">
        <span className="move-line">
          <span className="move-name">{move.name}</span>
          <span className="move-tags">
            <TypeChip type={move.type} small />
            {move.altType ? <TypeChip type={move.altType} small /> : null}
            <EffectIcons effects={move.effects} />
          </span>
          <TmBadge tm={move.tm} />
        </span>
        {count ? <span className="move-sub">{count}</span> : null}
      </span>
    </button>
  );
}

/**
 * Pick the moves one team member runs: one fast move, one or two charged. A third charged move
 * bumps the one picked first; the last charged move cannot be unticked.
 */
export function MovePicker({
  pool,
  value,
  onChange,
}: {
  pool: MovePool;
  value: MoveIds;
  onChange: (next: MoveIds) => void;
}) {
  const fastName = pool.fast.find((m) => m.moveId === value.fast)?.name ?? null;
  const toggleCharged = (id: string): void => {
    if (value.charged.includes(id)) {
      if (value.charged.length > 1) {
        onChange({ ...value, charged: value.charged.filter((x) => x !== id) });
      }
      return;
    }
    const kept = value.charged.length >= 2 ? value.charged.slice(1) : value.charged;
    onChange({ ...value, charged: [...kept, id] });
  };
  return (
    <div className="move-picker">
      <span className="move-picker-kind">Fast move</span>
      <div className="move-opts">
        {pool.fast.map((m) => (
          <Option
            key={m.moveId}
            move={m}
            role="radio"
            checked={m.moveId === value.fast}
            fastName={null}
            onClick={() => onChange({ ...value, fast: m.moveId })}
          />
        ))}
      </div>
      <span className="move-picker-kind">Charged moves, pick one or two</span>
      <div className="move-opts">
        {pool.charged.map((m) => (
          <Option
            key={m.moveId}
            move={m}
            role="checkbox"
            checked={value.charged.includes(m.moveId)}
            fastName={fastName}
            onClick={() => toggleCharged(m.moveId)}
          />
        ))}
      </div>
      <button
        type="button"
        className="btn btn-ghost move-picker-reset"
        disabled={sameIds(value, pool.recommended)}
        onClick={() =>
          onChange({ fast: pool.recommended.fast, charged: [...pool.recommended.charged] })
        }
      >
        Reset to recommended
      </button>
    </div>
  );
}
