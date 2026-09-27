import { useRef, useState } from 'react';
import { Button, ConfirmSheet } from '@pickthree/ui';
import { ExcludedList } from '../../components/ExcludedList.tsx';
import { useLeague } from '../../components/LeagueSwitcher.tsx';
import { dateLabel, num } from '../../format.ts';
import { useActions, useAppState } from '../../state/store.tsx';
import { ImportCard } from './ImportCard.tsx';

const FRESH_LINE = 'Battles before now move to Earlier seasons. Nothing is deleted.';

/** Specimens counted the way Collection's grouped list counts kinds: species, shadow apart. */
export function kindsOf(specimens: readonly { speciesId: string; shadow: boolean }[]): number {
  return new Set(specimens.map((sp) => `${sp.speciesId}|${sp.shadow ? 1 : 0}`)).size;
}

/**
 * Your data: the collection on this phone, the battle log and the Pokémon left out of teams.
 * Start fresh moves battles and deletes nothing, so its confirm keeps the default tone. Export
 * and import of the log are the old sheet's, unchanged: the share sheet first, then a download.
 */
export function YourData() {
  const s = useAppState();
  const { startFresh, exportLog, importLog } = useActions();
  const league = useLeague();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logNote, setLogNote] = useState<string | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);

  const doExport = async (): Promise<void> => {
    const text = await exportLog();
    const name = `pick3-battle-log-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([text], name, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'pick3 battle log' });
        return;
      } catch {
        // The share sheet was dismissed or refused; fall through to a download.
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setLogNote(`Saved ${name}.`);
  };

  const doImport = async (file: File | null): Promise<void> => {
    if (!file) {
      return;
    }
    try {
      const r = await importLog(await file.text());
      setLogNote(
        `Added ${r.added} ${r.added === 1 ? 'set' : 'sets'}, skipped ${r.skipped} already here.`,
      );
    } catch (e) {
      setLogNote(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  };

  const c = s.collection;
  return (
    <div className="settings-page">
      <section className="settings-block">
        <h4 className="settings-head">Collection</h4>
        {c ? (
          <>
            <p>
              {num(c.specimens.length)} Pokémon · {num(kindsOf(c.specimens))} kinds
            </p>
            <p className="settings-line">Last import {dateLabel(c.importedAt)}</p>
          </>
        ) : (
          <>
            <p>No collection yet</p>
            <ImportCard />
          </>
        )}
      </section>
      <section className="settings-block">
        <h4 className="settings-head">Your log</h4>
        <Button onClick={() => setConfirmFresh(true)}>Start fresh in {league.title}</Button>
        <p className="settings-line">{FRESH_LINE}</p>
        <div className="settings-pair">
          <Button onClick={() => void doExport()}>Export log</Button>
          {/* A real button that opens the hidden file input, so the keyboard reaches it too. */}
          <Button onClick={() => fileRef.current?.click()}>Import log</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void doImport(e.target.files?.[0] ?? null)}
          />
        </div>
        {logNote ? (
          <p className="settings-line" role="status">
            {logNote}
          </p>
        ) : null}
        <p className="settings-line">Files stay under your control.</p>
      </section>
      <section className="settings-block">
        <h4 className="settings-head">Excluded from teams</h4>
        <ExcludedList lineClassName="settings-line" />
      </section>
      {confirmFresh ? (
        <ConfirmSheet
          title={`Start fresh in ${league.title}?`}
          line={FRESH_LINE}
          confirmLabel="Start fresh"
          cancelLabel="Keep this season"
          onConfirm={() => {
            setConfirmFresh(false);
            startFresh();
          }}
          onCancel={() => setConfirmFresh(false)}
        />
      ) : null}
    </div>
  );
}
