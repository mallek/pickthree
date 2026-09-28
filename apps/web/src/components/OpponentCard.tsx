import type { Faceoff, FaceoffCell, FaceoffMember } from '@pickthree/engine';
import type { CSSProperties } from 'react';
import { PokemonToken, TypeChips, useName, useShortName, useSpecies } from '../components.tsx';
import { Loading, typeColor } from '@pickthree/ui';
import { ShieldGrid } from './ShieldGrid.tsx';

/** One word each, read from the equal-shield pairs; "Mixed" means look at the grid. */
const VERDICT: Record<FaceoffMember['verdict'], string> = {
  wins: 'Wins',
  loses: 'Loses',
  shields: 'Mixed',
};

/** The type-effectiveness badge: 4x, 2x, 1x for neutral, 1/2, 1/4. Plain ASCII on purpose. */
function Eff({ cell }: { cell: FaceoffCell }) {
  const m = cell.multiplier;
  const label =
    cell.efficacy === 'super'
      ? m > 2
        ? '4x'
        : '2x'
      : cell.efficacy === 'resisted'
        ? m < 0.5
          ? '1/4'
          : '1/2'
        : '1x';
  const strong = cell.efficacy !== 'neutral' && (m > 2 || m < 0.5);
  return (
    <span
      className={`fo-eff ${cell.efficacy}${strong ? ' strong' : ''}`}
      aria-label={
        cell.efficacy === 'super'
          ? 'super effective'
          : cell.efficacy === 'resisted'
            ? 'not very effective'
            : 'neutral'
      }
    >
      {label}
    </span>
  );
}

/** A word longer than this does not fit a move column at 390px ("Astonish" broke mid-word), so
 * its name takes the smaller size. */
const LONG_WORD = 7;

function longestWord(name: string): number {
  return Math.max(...name.split(' ').map((w) => w.length));
}

/**
 * The in-battle card: what the selected opponent throws, how each move lands on each of your
 * three by type, and a simulated shield grid with a one-word verdict per member.
 */
export function OpponentCard({ opponent, data }: { opponent: string; data: Faceoff | null }) {
  const name = useName();
  const short = useShortName();
  const species = useSpecies();
  const anyReal = data?.members.some((m) => m.realIvs) ?? false;
  return (
    <div className="faceoff" aria-label={`${name(opponent)} in battle`}>
      <div className="row" style={{ gap: 8 }}>
        <PokemonToken speciesId={opponent} size={32} />
        <b>{name(opponent)}</b>
        <TypeChips types={species(opponent)?.types ?? []} small />
      </div>
      {data ? (
        <table className="fo-table">
          <thead>
            <tr>
              <th scope="col" />
              {data.moves.map((m) => (
                <th scope="col" key={m.moveId} className="fo-move">
                  <span
                    className={`fo-move-name${longestWord(m.name) > LONG_WORD ? ' long' : ''}`}
                    style={
                      {
                        '--c': typeColor(m.type),
                        '--t': `var(--type-${m.type}-ink)`,
                      } as CSSProperties
                    }
                  >
                    {m.name}
                  </span>
                  <span className="fo-count">
                    {m.countFromFast === null ? 'fast' : `in ${m.countFromFast}`}
                  </span>
                </th>
              ))}
              <th scope="col" className="fo-shields-head">
                shields
                <span className="fo-count">you down, them across</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((mem, i) => (
              <tr key={`${mem.speciesId}-${i}`} className={data.best === i ? 'best' : ''}>
                <th scope="row" className="fo-member">
                  <PokemonToken speciesId={mem.speciesId} size={34} showInitial={false} />
                  <span>{short(mem.speciesId)}</span>
                </th>
                {mem.cells.map((c, j) => (
                  <td key={j}>
                    <Eff cell={c} />
                  </td>
                ))}
                <td className="fo-shields">
                  <span className={`fo-verdict ${mem.verdict}`}>{VERDICT[mem.verdict]}</span>
                  <ShieldGrid grid={mem.grid} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Loading label="Simulating..." />
      )}
      {data ? (
        <span className="meta">
          Their likely moves, with fast moves to reach each. Wins and Loses need all three
          equal-shield fights; Mixed means read the grid. {anyReal ? 'Your IVs' : 'PvPoke IVs'}
          {data.ranked ? '' : '; PvPoke does not rank it, so its moves are a guess'}.
        </span>
      ) : null}
    </div>
  );
}
