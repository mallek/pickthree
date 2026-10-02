import type { MovePool } from '@pickthree/engine';
import { Term } from '@pickthree/ui';
import type { ReactNode } from 'react';
import { StarGlyph } from '../../components.tsx';
import { MoveOption } from '../MovePicker.tsx';

/** The moves a Pokémon knows: one fast (null: not known), and its charged moves. */
export interface KnownMoves {
  fast: string | null;
  charged: string[];
}

/** Whether any move was entered for a copy. */
export function movesEntered(m: KnownMoves): boolean {
  return m.fast !== null || m.charged.length > 0;
}

/**
 * The one moves card: every move the species can know, as the team move picker's rows. The moves
 * this copy knows are ticked and PvPoke's set is starred; with no moves entered the starred set
 * is ticked in their place. Read only on a species page; with `onChange` (Edit) the rows take
 * taps: one fast move, one or two charged, the last charged move staying ticked.
 */
export function MovesCard({
  pool,
  known,
  onChange,
  leagueTitle,
  note,
}: {
  pool: MovePool;
  /** Null while the moves are not entered. */
  known: KnownMoves | null;
  onChange?: ((next: KnownMoves) => void) | undefined;
  leagueTitle: string;
  /** The line under the legend: what the ticks mean here. */
  note?: ReactNode;
}) {
  const edit = onChange !== undefined;
  const fast = known ? known.fast : pool.recommended.fast;
  const charged = known ? known.charged : pool.recommended.charged;
  const fastName = pool.fast.find((m) => m.moveId === fast)?.name ?? null;
  const full = charged.length >= 2;
  const waiting = edit && full && pool.charged.length > 2;
  const toggle = (id: string): void => {
    if (charged.includes(id)) {
      if (charged.length > 1) {
        onChange?.({ fast, charged: charged.filter((x) => x !== id) });
      }
      return;
    }
    if (!full) {
      onChange?.({ fast, charged: [...charged, id] });
    }
  };
  return (
    <>
      <div className="card" style={{ padding: '4px 14px' }}>
        <div className={`move-picker${edit ? '' : ' read-only'}`}>
          <span className="move-picker-kind">Fast move</span>
          <div className="move-opts" role={edit ? 'radiogroup' : undefined} aria-label="Fast move">
            {pool.fast.map((m) => (
              <MoveOption
                key={m.moveId}
                move={m}
                role="radio"
                checked={m.moveId === fast}
                recommended={m.moveId === pool.recommended.fast}
                eliteOnly
                disabled={!edit}
                fastName={null}
                onClick={
                  edit ? () => onChange({ fast: m.moveId, charged: [...charged] }) : undefined
                }
              />
            ))}
          </div>
          <span className="move-picker-kind">
            {edit ? 'Charged moves: one, or two if unlocked' : 'Charged moves'}
          </span>
          <Term term="How move counts work">
            The numbers after a charged move, like 4-4-3, are how many fast moves it takes to reach
            that charged move the first, second and third time. Leftover energy carries over, so the
            counts can step down.
          </Term>
          {waiting ? <p className="meta">Untick one to pick another</p> : null}
          <div className="move-opts">
            {pool.charged.map((m) => {
              const checked = charged.includes(m.moveId);
              return (
                <MoveOption
                  key={m.moveId}
                  move={m}
                  role="checkbox"
                  checked={checked}
                  recommended={pool.recommended.charged.includes(m.moveId)}
                  eliteOnly
                  disabled={!edit || (full && !checked && pool.charged.length > 2)}
                  fastName={fastName}
                  onClick={edit ? () => toggle(m.moveId) : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>
      <p className="small muted move-legend">
        <StarGlyph label={false} />
        {pool.source === 'fallback'
          ? `Picked by move stats: PvPoke has no set for it in ${leagueTitle}`
          : `Recommended by PvPoke for ${leagueTitle}`}
      </p>
      {note ? (
        <p className="small muted" style={{ margin: 0 }}>
          {note}
        </p>
      ) : null}
    </>
  );
}
