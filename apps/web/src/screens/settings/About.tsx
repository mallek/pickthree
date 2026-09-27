import { TrainerCounter, useTrainerCount } from '../../components/TrainerCounter.tsx';
import { UpdateStatus } from '../../components/UpdateToast.tsx';
import { Diagnostics } from '../../components/Diagnostics.tsx';
import { dateLabel } from '../../format.ts';
import { useActions, useAppState } from '../../state/store.tsx';

/** The old sheet's About block, moved as it was (Task 4 of the Settings plan rebuilds it on
 * Switch and ExpandRow). */
export function About() {
  const s = useAppState();
  const { updateSettings } = useActions();
  const trainers = useTrainerCount();
  return (
    <div className="meta stack" style={{ gap: 4 }}>
      <span>
        Game data from PvPoke, updated {s.data ? dateLabel(s.data.pvpokeDate) : '...'}
        {s.data ? ` (${s.data.pvpokeCommit.slice(0, 7)})` : ''}. Opponent meta:{' '}
        {s.leagueInfo?.metaSize ?? '...'} Pokémon.
      </span>
      <span>
        Your collection stays on this phone. What leaves it: an anonymous tick to the trainer
        counter when you build teams, anonymous battle records for the community meta unless you
        switch that off above, and, unless you turn it off below, anonymous error reports. None of
        it includes your Pokémon.
        {s.collection ? ` Last import: ${dateLabel(s.collection.importedAt)}.` : ''}
      </span>
      <UpdateStatus />
      <Diagnostics
        enabled={s.settings.errorReports !== false}
        onToggle={() =>
          updateSettings((cur) => ({ ...cur, errorReports: !(cur.errorReports !== false) }))
        }
      />
      <span>
        Built on <a href="https://github.com/pvpoke/pvpoke">PvPoke</a> (MIT). Not affiliated with
        Niantic, Nintendo, The Pokémon Company, Poke Genie, or PvPoke.{' '}
        <a href="https://github.com/mallek/pickthree">Source</a>.
      </span>
      <TrainerCounter count={trainers} />
    </div>
  );
}
