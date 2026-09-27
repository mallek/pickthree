import { shareEnabled } from '../../metaShare.ts';
import { useActions, useAppState } from '../../state/store.tsx';

/** The old sheet's Community Meta block, moved as it was (Task 4 of the Settings plan rebuilds
 * it on Switch, ExpandRow and ConfirmSheet). */
export function Community() {
  const s = useAppState();
  const { setShareEnabled } = useActions();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span>Community Meta</span>
      <button
        type="button"
        className="toggle"
        onClick={() => void setShareEnabled(!shareEnabled(s.settings))}
        aria-pressed={shareEnabled(s.settings)}
      >
        <span>
          <span style={{ display: 'block', fontSize: 15 }}>Share your battles</span>
          <span className="meta">
            Builds a measured meta from real ladders. Sends: league, season, time, your three
            species and moves when known, opponents seen, win, loss or tanked, device id and app
            version. Never your collection, IVs, names, or opponents&apos; moves. Off also deletes
            what this phone sent.
          </span>
        </span>
        <span className={`switch${shareEnabled(s.settings) ? ' on' : ''}`} />
      </button>
      <a className="btn btn-secondary" href="https://meta.pick3.gg" style={{ textAlign: 'center' }}>
        Open meta.pick3.gg
      </a>
      <span className="meta">
        See the community's most-faced Pokémon and teams, built from shared battle logs like yours.
      </span>
    </div>
  );
}
