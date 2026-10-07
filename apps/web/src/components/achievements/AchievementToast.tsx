import { useEffect, useLayoutEffect, useState } from 'react';
import { useAchievements } from '../../achievements/AchievementsProvider.tsx';
import { useName } from '../../components.tsx';
import { useActions, useAppState } from '../../state/store.tsx';
import { footClearance } from '../NoticeToast.tsx';
import { RewardToken } from './tokens.tsx';

const EARNED_MS = 8000;
const NUDGE_MS = 3000;

/**
 * An achievement just earned, or the nudge after a set closes. Uses NoticeToast's info markup and
 * waits while the app's own notice, the achievements reveal or an app sheet is up, so nothing
 * stacks and its timer does not run out behind them.
 */
export function AchievementToast() {
  const s = useAppState();
  const { navigate } = useActions();
  const a = useAchievements();
  const speciesName = useName();
  const waiting = s.notice !== null || a.reveal !== null || s.sheetOpen;
  const t = waiting ? null : a.toast;
  const [bottom, setBottom] = useState(12);
  useLayoutEffect(() => {
    if (t) {
      setBottom(footClearance());
    }
  }, [t, s.route]);
  useEffect(() => {
    if (!t) {
      return undefined;
    }
    const id = window.setTimeout(a.dismissToast, t.kind === 'earned' ? EARNED_MS : NUDGE_MS);
    return () => window.clearTimeout(id);
  }, [t, a.dismissToast]);
  if (!t) {
    return null;
  }
  if (t.kind === 'nudge') {
    return (
      <div
        className="update-toast notice-toast notice-info notice-foot"
        role="status"
        style={{ bottom }}
      >
        <button type="button" className="notice-tap" onClick={a.dismissToast}>
          {t.line}
        </button>
      </div>
    );
  }
  const name = speciesName(t.earned.species);
  return (
    <div
      className="update-toast notice-toast notice-info notice-foot"
      role="status"
      style={{ bottom }}
    >
      <span className="ach-toast-token">
        <RewardToken species={t.earned.species} shiny={t.earned.shiny} size={32} />
      </span>
      <span className="notice-msg">
        {t.name}. You got {t.earned.shiny ? 'a shiny ' : ''}
        {name}.
      </span>
      <button
        type="button"
        onClick={() => {
          navigate({ screen: 'achievements', row: t.earned.id });
          a.dismissToast();
        }}
      >
        See it
      </button>
      <button type="button" className="notice-quiet" onClick={a.dismissToast}>
        Not now
      </button>
    </div>
  );
}
