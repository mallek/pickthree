import { useState } from 'react';
import {
  LeagueShield,
  LeagueSwitcher as GenericLeagueSwitcher,
  LeagueList,
  Sheet,
  LEAGUE_COLORS,
} from '@pickthree/ui';
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
 * The open leagues (Great, Ultra, Master) in the row, always with shields; the shipped tournament
 * cups (League.kind 'cup') sit behind the "..." overflow, which opens a sheet listing every league
 * and cup. When the current league is a cup, the overflow slot shows that cup instead of "..." so
 * the row still names what is in play. The PICKTHREE_SPECIAL_CUPS formats stay out entirely: their
 * rules work, but the app does not yet know enough about them (megas in the Mega cups, for one) to
 * recommend with a straight face.
 */
export function LeagueSwitcher({ compact }: { compact?: boolean }) {
  const s = useAppState();
  const { setLeague } = useActions();
  const [sheetOpen, setSheetOpen] = useState(false);
  const leagues = (s.data?.leagues ?? []).filter((l) => l.kind !== 'special');
  const openLeagues = leagues.filter((l) => l.kind === 'standard');
  const cups = leagues.filter((l) => l.kind === 'cup');
  const currentLeague = leagues.find((l) => l.id === (s.settings.league ?? 'great'));
  const more =
    cups.length === 0
      ? undefined
      : {
          label: 'More leagues and cups',
          onClick: () => setSheetOpen(true),
          ...(currentLeague?.kind === 'cup'
            ? { current: { id: currentLeague.id, label: currentLeague.short, srLabel: currentLeague.title } }
            : {}),
        };
  return (
    <>
      <GenericLeagueSwitcher
        compact={compact ?? false}
        value={s.settings.league ?? 'great'}
        onChange={setLeague}
        label="League"
        dataLeague={s.leagueInfo?.id ?? ''}
        options={openLeagues.map((l) => ({ value: l.id, label: l.short, srLabel: l.title }))}
        more={more}
      />
      {sheetOpen ? (
        <Sheet
          onClose={() => setSheetOpen(false)}
          root={{
            id: 'leagues',
            title: 'Leagues',
            render: (nav) => (
              <LeagueList
                label="Leagues"
                value={s.settings.league ?? 'great'}
                onChange={(id) => {
                  setLeague(id);
                  nav.close();
                }}
                options={leagues.map((l) => ({ value: l.id, label: l.title }))}
              />
            ),
          }}
        />
      ) : null}
    </>
  );
}
