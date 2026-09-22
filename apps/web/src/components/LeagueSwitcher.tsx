import { LeagueShield, LeagueSwitcher as GenericLeagueSwitcher, LEAGUE_COLORS } from '@pickthree/ui';
import type { League } from '@pickthree/engine';
import { useActions, useAppState } from '../state/store.tsx';

export { LEAGUE_COLORS, LeagueShield };

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
 * Open leagues and the shipped tournament cups (League.kind 'standard' and 'cup'). The
 * PICKTHREE_SPECIAL_CUPS formats stay out: their rules work, but the app does not yet know
 * enough about them (megas in the Mega cups, for one) to recommend with a straight face.
 */
export function LeagueSwitcher({ compact }: { compact?: boolean }) {
  const s = useAppState();
  const { setLeague } = useActions();
  const leagues = (s.data?.leagues ?? []).filter((l) => l.kind !== 'special');
  return (
    <GenericLeagueSwitcher
      compact={compact ?? false}
      value={s.settings.league ?? 'great'}
      onChange={setLeague}
      label="League"
      dataLeague={s.leagueInfo?.id ?? ''}
      options={leagues.map((l) => ({ value: l.id, label: l.short, srLabel: l.title }))}
    />
  );
}
