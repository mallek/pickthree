import { useState } from 'react';
import { Button, ConfirmSheet, ExpandRow, Switch } from '@pickthree/ui';
import { shareEnabled } from '../../metaShare.ts';
import { useActions, useAppState } from '../../state/store.tsx';

const STOP_LINE =
  'Battles this phone sent are deleted from the community meta. Your log on this phone stays.';

/**
 * Community: the share switch (turning it off goes through a danger confirm; turning it back on
 * needs none), what a battle record does and does not carry, and the link to meta.pick3.gg.
 */
export function Community() {
  const s = useAppState();
  const { setShareEnabled } = useActions();
  const [confirmStop, setConfirmStop] = useState(false);
  const [whatsSent, setWhatsSent] = useState(false);
  const on = shareEnabled(s.settings);
  return (
    <div className="settings-page">
      <section className="settings-block">
        <Switch
          label="Share your battles"
          line="Anonymous battle records build the community meta."
          checked={on}
          onChange={(next) => {
            if (next) {
              void setShareEnabled(true);
              return;
            }
            setConfirmStop(true);
          }}
        />
        <p className="settings-line">Turning this off also deletes what this phone sent.</p>
      </section>
      <ExpandRow summary="What's sent?" open={whatsSent} onToggle={() => setWhatsSent((v) => !v)}>
        <p className="settings-line">
          Sent: league, season, time, your three Pokémon and their moves when known, the
          opponents you saw, win, loss or tanked, a random device id and the app version.
        </p>
        <p className="settings-line">
          Never sent: your collection, IVs, names, or the opponents&apos; moves.
        </p>
      </ExpandRow>
      <Button variant="secondary" href="https://meta.pick3.gg">
        Open meta.pick3.gg
      </Button>
      {confirmStop ? (
        <ConfirmSheet
          title="Stop sharing?"
          line={STOP_LINE}
          confirmLabel="Stop and delete"
          cancelLabel="Keep sharing"
          tone="danger"
          onConfirm={() => {
            setConfirmStop(false);
            void setShareEnabled(false);
          }}
          onCancel={() => setConfirmStop(false)}
        />
      ) : null}
    </div>
  );
}
