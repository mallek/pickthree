import { useState } from 'react';
import { ExpandRow } from '@pickthree/ui';
import { Diagnostics } from '../../components/Diagnostics.tsx';
import { TrainerCounter, useTrainerCount } from '../../components/TrainerCounter.tsx';
import { UpdateStatus } from '../../components/UpdateToast.tsx';
import { dateLabel } from '../../format.ts';
import { useActions, useAppState } from '../../state/store.tsx';

/**
 * About: game data and its opponent meta size, the build and Check for updates, what leaves the
 * device (a collapsed list of facts), the error reports switch and diagnostics log, credits, and
 * the trainer counter last.
 */
export function About() {
  const s = useAppState();
  const { updateSettings } = useActions();
  const trainers = useTrainerCount();
  const [leaves, setLeaves] = useState(false);
  const pvpokeCommit = s.data ? s.data.pvpokeCommit.slice(0, 7) : '';
  return (
    <div className="settings-page">
      <section className="settings-block">
        <h4 className="settings-head">Game data</h4>
        <p>
          PvPoke, {s.data ? dateLabel(s.data.pvpokeDate) : '...'}
          {pvpokeCommit ? ` (${pvpokeCommit})` : ''}
        </p>
        <p className="settings-line">Opponent meta: {s.leagueInfo?.metaSize ?? '...'} Pokémon.</p>
      </section>
      <section className="settings-block">
        <h4 className="settings-head">App</h4>
        {/* UpdateStatus names the build and its date; a separate "Build" line said it twice. */}
        <UpdateStatus />
      </section>
      <section className="settings-block">
        <h4 className="settings-head">Privacy</h4>
        <p>Your collection stays on this phone.</p>
        <ExpandRow summary="What leaves it?" open={leaves} onToggle={() => setLeaves((v) => !v)}>
          <div className="settings-facts">
            <p className="settings-line">
              An anonymous tick to the trainer counter when you build teams.
            </p>
            <p className="settings-line">Anonymous battle records unless sharing is off.</p>
            <p className="settings-line">Anonymous error reports unless turned off below.</p>
            <p className="settings-line">None of it includes your Pokémon.</p>
          </div>
        </ExpandRow>
      </section>
      <Diagnostics
        enabled={s.settings.errorReports !== false}
        onToggle={() =>
          updateSettings((cur) => ({ ...cur, errorReports: !(cur.errorReports !== false) }))
        }
      />
      <section className="settings-block">
        <h4 className="settings-head">Credits</h4>
        <p className="settings-line">
          Built on <a href="https://github.com/pvpoke/pvpoke">PvPoke</a> (MIT). Not affiliated with
          Niantic, Nintendo, The Pokémon Company, Poke Genie, or PvPoke.
        </p>
        <a className="settings-link" href="https://github.com/mallek/pickthree">
          Source
        </a>
      </section>
      <TrainerCounter count={trainers} />
    </div>
  );
}
