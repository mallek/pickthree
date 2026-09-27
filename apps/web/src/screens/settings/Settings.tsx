import { useEffect, useState } from 'react';
import { Button, ConfirmSheet, Sheet, type SheetNav } from '@pickthree/ui';
import { recordError } from '../../diag.ts';
import { num } from '../../format.ts';
import { shareEnabled } from '../../metaShare.ts';
import { useActions, useAppState } from '../../state/store.tsx';
import { storage } from '../../storage/db.ts';
import { About } from './About.tsx';
import { Appearance, THEME_WORDS } from './Appearance.tsx';
import { Community } from './Community.tsx';
import { AboutGlyph, AppearanceGlyph, CommunityGlyph, DataGlyph } from './glyphs.tsx';
import { ImportCard } from './ImportCard.tsx';
import { SettingsRow } from './SettingsRow.tsx';
import { YourData } from './YourData.tsx';

/** "2026-09-10" -> "Sep 10": a calendar date read in local time, as dateLabel reads it. */
function monthDay(iso: string): string {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Battles logged in every league, read again whenever this league's sets change (a save, an
 * import or a share stamp all land there), as Your Meta's contribution line reads them. Null
 * until the first read lands. */
function useAllBattles(): number | null {
  const s = useAppState();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void storage
      .loadAllSets()
      .then((all) => {
        if (live) {
          setCount(all.reduce((n, set) => n + set.battles.length, 0));
        }
      })
      .catch((e: unknown) => recordError('settings-count', e));
    return () => {
      live = false;
    };
  }, [s.sets]);
  return count;
}

/**
 * The hub: Import first, four rows with live summaries that push their pages, Forget (only with
 * a collection) behind a danger confirm, and the privacy line. Each pushed page is a component
 * that reads the store itself, never JSX holding values from the moment it was pushed.
 */
function Hub({ nav }: { nav: SheetNav }) {
  const s = useAppState();
  const { forget } = useActions();
  const battles = useAllBattles();
  const [confirmForget, setConfirmForget] = useState(false);
  const c = s.collection;
  const held = c ? `${num(c.specimens.length)} Pokémon` : 'No collection yet';
  const logged =
    battles === null ? '' : ` · ${num(battles)} ${battles === 1 ? 'battle' : 'battles'}`;
  const pictures = s.settings.sprites !== false ? 'on' : 'off';
  const pvpoke = s.data ? monthDay(s.data.pvpokeDate) : '...';
  return (
    <>
      <ImportCard />
      <div className="settings-rows">
        <SettingsRow
          icon={<DataGlyph />}
          title="Your data"
          summary={`${held}${logged}`}
          onClick={() => nav.push({ id: 'data', title: 'Your data', render: () => <YourData /> })}
        />
        <SettingsRow
          icon={<CommunityGlyph />}
          title="Community"
          summary={shareEnabled(s.settings) ? 'Sharing on' : 'Sharing off'}
          onClick={() =>
            nav.push({ id: 'community', title: 'Community', render: () => <Community /> })
          }
        />
        <SettingsRow
          icon={<AppearanceGlyph />}
          title="Appearance"
          summary={`${THEME_WORDS[s.settings.theme]} theme · pictures ${pictures}`}
          onClick={() =>
            nav.push({ id: 'appearance', title: 'Appearance', render: () => <Appearance /> })
          }
        />
        <SettingsRow
          icon={<AboutGlyph />}
          title="About"
          summary={`PvPoke data ${pvpoke} · build ${__PICK3_BUILD__.slice(0, 7)}`}
          onClick={() => nav.push({ id: 'about', title: 'About', render: () => <About /> })}
        />
      </div>
      {c ? (
        <Button variant="danger" onClick={() => setConfirmForget(true)}>
          Forget my collection and log
        </Button>
      ) : null}
      <p className="settings-foot">Your collection stays on this phone.</p>
      {confirmForget ? (
        <ConfirmSheet
          title="Forget your collection and log?"
          line="Your collection, battle log and settings on this phone are deleted. This cannot be undone."
          confirmLabel="Forget"
          cancelLabel="Keep them"
          tone="danger"
          onConfirm={() => {
            setConfirmForget(false);
            void forget();
          }}
          onCancel={() => setConfirmForget(false)}
        />
      ) : null}
    </>
  );
}

/** Settings: the ui Sheet with the hub as its root page. Done, Escape and the overlay close it
 * from any depth. Rendered while the store's sheetOpen is set. */
export function Settings() {
  const { closeSheet } = useActions();
  return (
    <Sheet
      onClose={closeSheet}
      root={{ id: 'settings', title: 'Settings', render: (nav) => <Hub nav={nav} /> }}
    />
  );
}
