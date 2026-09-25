import type { MoveChoice, MoveIds, MovePool } from '@pickthree/engine';
import { Button, Tag, Term } from '@pickthree/ui';
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
  changed,
  disabled,
  fastName,
  onClick,
}: {
  move: MoveChoice;
  role: 'radio' | 'checkbox';
  checked: boolean;
  changed: boolean;
  disabled: boolean;
  fastName: string | null;
  onClick: () => void;
}) {
  const count = fastName ? countsText(fastName, move.counts) : null;
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      disabled={disabled}
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
            {changed ? <Tag>Changed</Tag> : null}
          </span>
          <TmBadge tm={move.tm} />
        </span>
        {count ? <span className="move-sub">{count}</span> : null}
      </span>
    </button>
  );
}

/**
 * Pick the moves one team member runs: one fast move, one or two charged. Nothing is bumped: with
 * two charged moves ticked the others wait until one is unticked, and the last one stays ticked.
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
  const all = [...pool.fast, ...pool.charged];
  const nameOf = (id: string): string => all.find((m) => m.moveId === id)?.name ?? id;
  const fastName = pool.fast.find((m) => m.moveId === value.fast)?.name ?? null;
  const full = value.charged.length >= 2;
  const waiting = full && pool.charged.length > 2;
  const toggleCharged = (id: string): void => {
    if (value.charged.includes(id)) {
      if (value.charged.length > 1) {
        onChange({ ...value, charged: value.charged.filter((x) => x !== id) });
      }
      return;
    }
    if (!full) {
      onChange({ ...value, charged: [...value.charged, id] });
    }
  };
  const recommended = [pool.recommended.fast, ...pool.recommended.charged].map(nameOf).join(', ');
  return (
    <div className="move-picker">
      <p className="meta move-picker-rec">Recommended: {recommended}</p>
      <span className="move-picker-kind">Fast move</span>
      <div className="move-opts">
        {pool.fast.map((m) => (
          <Option
            key={m.moveId}
            move={m}
            role="radio"
            checked={m.moveId === value.fast}
            changed={m.moveId === value.fast && m.moveId !== pool.recommended.fast}
            disabled={false}
            fastName={null}
            onClick={() => onChange({ ...value, fast: m.moveId })}
          />
        ))}
      </div>
      <span className="move-picker-kind">Charged moves: pick one or two</span>
      <Term term="How move counts work">
        The numbers after a charged move, like 4-4-3, are how many fast moves it takes to reach
        that charged move the first, second and third time. Leftover energy carries over, so the
        counts can step down.
      </Term>
      {waiting ? <p className="meta">Untick one to pick another</p> : null}
      <div className="move-opts">
        {pool.charged.map((m) => {
          const checked = value.charged.includes(m.moveId);
          return (
            <Option
              key={m.moveId}
              move={m}
              role="checkbox"
              checked={checked}
              changed={checked && !pool.recommended.charged.includes(m.moveId)}
              disabled={full && !checked && pool.charged.length > 2}
              fastName={fastName}
              onClick={() => toggleCharged(m.moveId)}
            />
          );
        })}
      </div>
      <Button
        variant="text"
        disabled={sameIds(value, pool.recommended)}
        onClick={() =>
          onChange({ fast: pool.recommended.fast, charged: [...pool.recommended.charged] })
        }
      >
        Reset to recommended
      </Button>
    </div>
  );
}
