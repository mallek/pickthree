/**
 * A rating this close to 500 is a near coin flip: its cell is outlined, not filled. The band is
 * wider on purpose than the engine's "Close; shields decide it" (`CLOSE_RATING` 450 in
 * `explain.ts`, a 50 margin): the grid is a visual two-step, solid for a clear result, outlined for
 * anything that could turn on a switch or a bait. Whether the two should share one number is an
 * open item for Travis in the Log a Battle record.
 */
export const CLOSE_MARGIN = 100;

/**
 * Nine cells with a W or L each: your shields 0, 1, 2 down the side, theirs across the top.
 * A decisive result is a filled cell and a near coin flip an outlined one, so a close call looks
 * paler than a blowout while its letter keeps full contrast. The letters are one character each,
 * which axe cannot judge, so test/contrast.test.ts checks the fills (data-audit-contrast).
 *
 * A null cell (a row still filling) or a null grid (nothing scored yet) renders an empty
 * placeholder cell instead of a letter. Shared by the in-battle card (`size="card"`, the default)
 * and Counters' one-opponent rows (`size="row"`, about 20px cells).
 */
export function ShieldGrid({
  grid,
  size = 'card',
}: {
  grid: (number | null)[] | null;
  size?: 'card' | 'row';
}) {
  const cells = grid ?? new Array<number | null>(9).fill(null);
  const wins = cells.filter((r) => r !== null && r > 500).length;
  const played = cells.filter((r) => r !== null).length;
  // A grid still filling says so: a count out of nine would read its empty cells as losses.
  const label =
    played === 0
      ? 'Shield pairings still being played'
      : played < 9
        ? `Wins ${wins} of ${played} so far`
        : `Wins ${wins} of 9 shield pairings`;
  return (
    <span
      className={`fo-grid${size === 'row' ? ' fo-grid-lg' : ''}`}
      role="img"
      aria-label={label}
      data-audit-contrast="static"
    >
      <i className="fo-ax corner" />
      {[0, 1, 2].map((n) => (
        <i className="fo-ax" key={`t${n}`}>
          {n}
        </i>
      ))}
      {[0, 1, 2].map((mine) => (
        <span className="fo-grid-row" key={mine}>
          <i className="fo-ax">{mine}</i>
          {[0, 1, 2].map((theirs) => {
            const r = cells[mine * 3 + theirs] ?? null;
            if (r === null) {
              return <i key={theirs} className="empty" />;
            }
            const close = Math.abs(r - 500) < CLOSE_MARGIN;
            return (
              <i key={theirs} className={`${r > 500 ? 'w' : 'l'}${close ? ' close' : ''}`}>
                {r > 500 ? 'W' : 'L'}
              </i>
            );
          })}
        </span>
      ))}
    </span>
  );
}
