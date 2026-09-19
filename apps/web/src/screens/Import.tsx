import { useEffect, useRef, useState } from 'react';
import { Header, Progress } from '../components.tsx';
import { ScanListPanel } from '../components/ScanListPanel.tsx';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { arrivedFromShare, clearShareMarker, takeSharedCsv } from '../share.ts';
import { useActions, useAppState } from '../state/store.tsx';

/**
 * Everything about getting a collection in: the file picker, the paste box, what a file needs to
 * carry, the blank template, and per-app export steps. This used to share the Welcome screen,
 * which left the landing doing two jobs at once and pushed the help behind disclosures. On its
 * own screen the help can simply be text.
 */
export function Import() {
  const { importing, importError, boot, bootError, collection, scanList, leagueInfo } =
    useAppState();
  const { importCsv, importLog, navigate, loadScanList } = useActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    if (scanOpen && boot === 'ready' && leagueInfo && !scanList) {
      void loadScanList();
    }
  }, [scanOpen, boot, leagueInfo, scanList, loadScanList]);

  // Moves every battle `at` and set `startedAt` forward so the newest battle lands a minute ago,
  // keeping the sample inside whatever season is current instead of expiring against the calendar.
  const shiftLogToNow = (text: string): string => {
    try {
      const data = JSON.parse(text) as {
        sets?: Array<{ startedAt?: string; battles?: Array<{ at?: string }> }>;
      };
      const sets = Array.isArray(data.sets) ? data.sets : [];
      let newest = -Infinity;
      for (const set of sets) {
        for (const battle of set.battles ?? []) {
          const t = typeof battle.at === 'string' ? Date.parse(battle.at) : NaN;
          if (!Number.isNaN(t) && t > newest) {
            newest = t;
          }
        }
      }
      if (newest === -Infinity) {
        return text;
      }
      const shift = Date.now() - 60_000 - newest;
      for (const set of sets) {
        if (typeof set.startedAt === 'string') {
          const t = Date.parse(set.startedAt);
          if (!Number.isNaN(t)) {
            set.startedAt = new Date(t + shift).toISOString();
          }
        }
        for (const battle of set.battles ?? []) {
          if (typeof battle.at === 'string') {
            const t = Date.parse(battle.at);
            if (!Number.isNaN(t)) {
              battle.at = new Date(t + shift).toISOString();
            }
          }
        }
      }
      return JSON.stringify(data);
    } catch {
      return text;
    }
  };

  const loadSample = async (withLog: boolean): Promise<void> => {
    const res = await fetch('/fixtures/pokegenie-sample.csv');
    const content = await res.text();
    if (withLog) {
      const log = await fetch('/fixtures/battle-log-sample.json')
        .then((r) => r.text())
        .catch(() => null);
      if (log) {
        await importLog(shiftLogToNow(log)).catch(() => undefined);
      }
    }
    await importCsv(content, 'sample collection');
  };

  useEffect(() => {
    // #/import?sample=1 imports the synthetic sample straight away (demos and screenshots).
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? window.location.search);
    if (q.get('sample') === '1' && boot === 'ready' && !importing) {
      void loadSample(true);
    }
  }, [boot]);

  const [shareMiss, setShareMiss] = useState(false);
  useEffect(() => {
    // Arrived from the share sheet: the service worker parked the CSV for us.
    if (!arrivedFromShare() || boot !== 'ready' || importing) {
      return;
    }
    clearShareMarker();
    void takeSharedCsv().then((shared) => {
      if (shared) {
        void importCsv(shared.text, shared.name);
      } else {
        setShareMiss(true);
      }
    });
  }, [boot]);

  const onFile = async (f: File | undefined): Promise<void> => {
    if (!f) {
      return;
    }
    const content = await f.text();
    await importCsv(content, f.name);
  };

  return (
    <div className="screen">
      <Header
        title="Import your Pokémon"
        sub="Any CSV with a name, CP and the three IVs."
        onBack={() => navigate(collection ? { screen: 'collection' } : { screen: 'welcome' })}
        backLabel={collection ? 'Collection' : 'Start'}
      />
      <div className="scroll" style={{ gap: 20 }}>
        <input
          ref={fileRef}
          className="file-input"
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/comma-separated-values,text/plain"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          className="btn"
          disabled={importing || boot === 'error'}
          onClick={() => fileRef.current?.click()}
        >
          <i />
          Upload a CSV
        </button>
        <button type="button" className="btn-ghost" onClick={() => setPaste((p) => !p)}>
          {paste ? 'Hide the paste box' : 'Paste CSV text instead'}
        </button>
        {/* The paste box and the button that acts on it stay together and stay above everything
         * else, because the phone keyboard covers whatever sits under an open input. */}
        {paste ? (
          <div className="stack">
            <textarea
              className="paste"
              placeholder="Paste the CSV text here"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={text.trim().length === 0 || importing}
              onClick={() => void importCsv(text, null)}
            >
              Import pasted text
            </button>
          </div>
        ) : null}
        {importError ? <div className="error">{importError}</div> : null}
        {shareMiss ? (
          <div className="error">
            The share did not include a CSV file. Export your scans to CSV first, then share that
            file to pick3.
          </div>
        ) : null}
        {bootError ? (
          <div className="error">Game data failed to load: {bootError}. Reload to try again.</div>
        ) : null}
        {importing ? <Progress stage="import" done={0} total={0} /> : null}
        <div className="stack" style={{ gap: 8 }}>
          <b>What file does pick3 need?</b>
          <p className="small muted" style={{ margin: 0 }}>
            pick3 reads the columns by what is in them, not by what they are called, so an export
            from whatever IV checker you use works, and so does a sheet you typed yourself. Save it
            to Files, come back here and pick it. On Android with pick3 installed you can share the
            file straight to it.
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            Scans taken with the IV appraisal screen open carry the IVs pick3 needs. Anything
            without them comes in listed as needing a rescan. No file at all? Add your Pokémon by
            hand, or build a team from any Pokémon. Everything in pick3 is free.
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            Template:{' '}
            <a href="/pick3-template.csv" download="pick3-template.csv">
              download a blank CSV
            </a>
            . It has the column headers and one example row. Replace the Magikarp with your own
            Pokémon, one row each. Form and Shadow are optional. Leave Form blank unless it matters,
            like Alolan or Origin.
          </p>
        </div>
        <details>
          <summary className="small" style={{ color: 'var(--accent-text)', cursor: 'pointer' }}>
            Export steps for common IV checkers
          </summary>
          <p className="small muted" style={{ marginTop: 8 }}>
            Most IV checkers can save their scan history as a CSV. Look for export, share, or
            backup, and choose CSV.
          </p>
          <ul className="small muted">
            <li>
              Poke Genie: open the scan history (the list icon), tap share or export, choose CSV,
              then Save to Files.
            </li>
            <li>
              Calcy IV: it can export its scan history to CSV. Look for the export option on the
              history screen.
            </li>
            <li>
              A sheet of your own: use the template above, or any sheet with the name, the CP and
              the three IVs in their own columns. The column names do not matter.
            </li>
          </ul>
        </details>
        <details onToggle={(e) => setScanOpen(e.currentTarget.open)}>
          <summary className="small" style={{ color: 'var(--accent-text)', cursor: 'pointer' }}>
            3,000 Pokémon? What to scan first
          </summary>
          <LeagueSwitcher compact />
          <ScanListPanel list={scanList} ready={boot === 'ready'} />
        </details>
        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
          <button
            type="button"
            className="btn-ghost"
            disabled={importing || boot !== 'ready'}
            onClick={() => void loadSample(false)}
          >
            No export handy? Try a sample collection &rsaquo;
          </button>
          {collection ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => navigate({ screen: 'teams' })}
            >
              Keep the collection you imported earlier &rsaquo;
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
