import type { League } from '@pickthree/engine';
import { useActions, useAppState } from '../state/store.tsx';

/** Game colours for the three open leagues; cups get a neutral shield. */
export const LEAGUE_COLORS: Record<string, string> = {
  great: '#3F7DE8',
  ultra: '#F2B01E',
  master: '#B03DBE',
};

export function LeagueShield({ id, size = 16 }: { id: string; size?: number }) {
  const color = LEAGUE_COLORS[id] ?? '#8E9AAF';
  return (
    <svg
      className="league-shield"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" fill={color} />
      <path d="M12 6.2l4.4 1.9v3.4c0 3-1.9 5.5-4.4 6.9V6.2z" fill="rgba(255,255,255,0.28)" />
    </svg>
  );
}

/** The league in play, with a safe fallback before the data has loaded. */
export function useLeague(): League {
  const s = useAppState();
  const fallback: League = {
    id: 'great',
    title: 'Great League',
    short: 'Great',
    cp: 1500,
    cup: 'all',
    meta: 'great',
    kind: 'standard',
    minCp: 1410,
    include: [],
    exclude: [],
    metaSize: 0,
  };
  return s.data?.leagues.find((l) => l.id === s.settings.league) ?? s.data?.leagues[0] ?? fallback;
}

/**
 * Standard leagues as a segmented control with the game's shield colours, special cups as chips
 * beneath. Lives in every league-dependent page head, the builder and the sheet.
 */
export function LeagueSwitcher({ compact }: { compact?: boolean }) {
  const s = useAppState();
  const { setLeague } = useActions();
  const leagues = (s.data?.leagues ?? []).filter((l) => l.kind === 'standard');
  const current = s.settings.league;
  return (
    <div
      className={`league-switcher${compact ? ' compact' : ''}`}
      data-league={s.leagueInfo?.id ?? ''}
      role="radiogroup"
      aria-label="League"
    >
      {leagues.map((l) => (
        <button
          type="button"
          key={l.id}
          role="radio"
          aria-checked={current === l.id}
          aria-label={l.title}
          className={current === l.id ? 'on' : ''}
          onClick={() => setLeague(l.id)}
        >
          <LeagueShield id={l.id} />
          {l.short}
        </button>
      ))}
    </div>
  );
}
