import { useSyncExternalStore } from 'react';
import { dateLabel } from '../format.ts';
import { applyUpdateNow, checkForUpdate, getUpdateState, subscribeUpdate } from '../update.ts';

function useUpdate() {
  return useSyncExternalStore(subscribeUpdate, getUpdateState, getUpdateState);
}

/** Floating "new version ready" pill. Reload happens only when tapped. */
export function UpdateToast() {
  const u = useUpdate();
  if (!u.ready) {
    return null;
  }
  return (
    <div className="update-toast" role="status">
      <span>New version ready</span>
      <button type="button" onClick={() => void applyUpdateNow()}>
        Reload
      </button>
    </div>
  );
}

/** Build line plus a manual check, for the Filters sheet. */
export function UpdateStatus() {
  const u = useUpdate();
  return (
    <span className="update-status">
      <span>
        pick3 build {__PICK3_BUILD__}, {dateLabel(__PICK3_BUILT_AT__)}.
      </span>
      {u.ready ? (
        <button type="button" className="btn-ghost" onClick={() => void applyUpdateNow()}>
          Reload to update &rsaquo;
        </button>
      ) : (
        <button
          type="button"
          className="btn-ghost"
          disabled={u.checking}
          onClick={() => void checkForUpdate()}
        >
          {u.checking ? 'Checking...' : 'Check for updates'}
        </button>
      )}
      {u.note ? <span className="faint">{u.note}</span> : null}
    </span>
  );
}
