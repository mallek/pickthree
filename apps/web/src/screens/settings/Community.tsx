import { useState } from 'react';
import { Button, ConfirmSheet, ExpandRow, Switch, type SheetNav } from '@pickthree/ui';
import { shareEnabled } from '../../metaShare.ts';
import { useActions, useAppState } from '../../state/store.tsx';
import { RankGlyph } from './glyphs.tsx';
import { MetaRanked } from './MetaRanked.tsx';
import { SettingsRow } from './SettingsRow.tsx';

/** What stopping sharing does, said wherever the share switch is turned off. */
export const STOP_LINE =
  'Battles this phone sent are deleted from the community meta. Your log on this phone stays.';

/**
 * Community: the share switch (turning it off goes through a danger confirm; turning it back on
 * needs none), what a battle record does and does not carry, and the way to the live meta and
 * to how it is ranked.
 */
export function Community({ nav }: { nav: SheetNav }) {
  const s = useAppState();
  const { setShareEnabled, navigate } = useActions();
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
      <section className="settings-block">
        <ExpandRow summary="What's sent?" open={whatsSent} onToggle={() => setWhatsSent((v) => !v)}>
          <div className="settings-facts">
            <p className="settings-line">
              Sent: league, season, time, your three Pokémon and their moves when known, the
              opponents you saw, win, loss or tanked, a random device id and the app version.
            </p>
            <p className="settings-line">
              Never sent: your collection, IVs, names, or the opponents&apos; moves.
            </p>
          </div>
        </ExpandRow>
        <Button variant="secondary" onClick={() => navigate({ screen: 'meta' })}>
          See the live meta
        </Button>
        <div className="settings-rows">
          <SettingsRow
            icon={<RankGlyph />}
            title="How the meta is ranked"
            summary="Three sources, one number"
            onClick={() =>
              nav.push({
                id: 'meta-ranked',
                title: 'How the meta is ranked',
                render: () => <MetaRanked />,
              })
            }
          />
        </div>
      </section>
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
