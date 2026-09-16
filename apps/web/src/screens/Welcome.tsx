import { useEffect, useRef, useState } from 'react';
import { Progress } from '../components.tsx';
import { ScanListPanel } from '../components/ScanListPanel.tsx';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { fetchCount } from '../counter.ts';
import { num } from '../format.ts';
import { arrivedFromShare, clearShareMarker, takeSharedCsv } from '../share.ts';
import { useActions, useAppState } from '../state/store.tsx';

export function Welcome() {
  const { importing, importError, boot, bootError, collection, scanList, leagueInfo } =
    useAppState();
  const { importCsv, importLog, navigate, loadScanList } = useActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    if (scanOpen && boot === 'ready' && leagueInfo && !scanList) {
      void loadScanList();
    }
  }, [scanOpen, boot, leagueInfo, scanList, loadScanList]);

  useEffect(() => {
    let alive = true;
    void fetchCount().then((c) => {
      if (alive) {
        setCount(c);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

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
    // #/?sample=1 imports the synthetic sample straight away (used for demos and screenshots).
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
      <div
        className="scroll"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)', gap: 28 }}
      >
        <div className="stack">
          <h1 className="hero">
            Find your best battle team with{' '}
            <img className="only-dark hero-lockup" src="/lockup.svg" alt="pick3" />
            <img className="only-light hero-lockup" src="/lockup-light.svg" alt="pick3" />
          </h1>
          <p className="muted">
            Which Pokémon to use, in what order, with which moves, and what it costs.
          </p>
        </div>
        <ol className="steps">
          <li>
            <span>1</span>
            <div>
              <b>Get your Pokémon in</b>
              <span className="small muted">
                Upload an export or a sheet of your own, add them by hand, or skip it and build from
                any Pokémon.
              </span>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <b>Get your teams</b>
              <span className="small muted">
                Three Pokémon, in order, with moves, what to shield, and what it costs.
              </span>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <b>Check any team</b>
              <span className="small muted">
                Build your own three and see how it holds up against the meta.
              </span>
            </div>
          </li>
        </ol>
        <details>
          <summary className="small" style={{ color: 'var(--accent-text)', cursor: 'pointer' }}>
            How to export from Poke Genie
          </summary>
          <p className="small muted" style={{ marginTop: 8 }}>
            In Poke Genie open the scan history (the list icon), tap the share or export button,
            choose CSV, then Save to Files. Come back here and pick that file. On Android with pick3
            installed you can share the CSV straight to it. Scans made with the IV appraisal screen
            open carry the IVs pick3 needs; bulk scans without it will be listed as needing a
            rescan. Poke Genie charges for the export; the other two ways in are free.
          </p>
          <p className="small muted">
            Calcy IV exports and sheets of your own work too. pick3 looks for a name, CP and the
            three IVs and works out the rest from the values, whatever the columns are called.
          </p>
        </details>
        <details onToggle={(e) => setScanOpen(e.currentTarget.open)}>
          <summary className="small" style={{ color: 'var(--accent-text)', cursor: 'pointer' }}>
            3,000 Pokémon? What to scan first
          </summary>
          <LeagueSwitcher compact />
          <ScanListPanel list={scanList} ready={boot === 'ready'} />
        </details>
        {importError ? <div className="error">{importError}</div> : null}
        {shareMiss ? (
          <div className="error">
            The share did not include a CSV file. In Poke Genie choose Export to CSV, then share the
            file to pick3.
          </div>
        ) : null}
        {bootError ? (
          <div className="error">Game data failed to load: {bootError}. Reload to try again.</div>
        ) : null}
        {importing ? <Progress stage="import" done={0} total={0} /> : null}
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
      <div className="bottom-actions">
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
        <span className="small muted" style={{ textAlign: 'center' }}>
          No Poke Genie export? You do not need one.
        </span>
        <div className="btn-pair">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={boot !== 'ready'}
            onClick={() => navigate({ screen: 'build' })}
          >
            Build a team
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={boot !== 'ready'}
            onClick={() => navigate({ screen: 'add' })}
          >
            Add by hand
          </button>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setPaste((p) => !p)}>
          {paste ? 'Hide the paste box' : 'Paste CSV text instead'}
        </button>
        <p className="meta faint" style={{ textAlign: 'center' }}>
          Your file is processed on your phone and never uploaded anywhere. The only things sent are
          an anonymous tick to the counter and anonymous error reports without your Pokémon.
        </p>
        {count !== null ? (
          <p className="counter" aria-live="polite">
            <span className="counter-digits">{num(count)}</span>{' '}
            {count === 1 ? 'trainer has' : 'trainers have'} pick3ed
          </p>
        ) : null}
      </div>
    </div>
  );
}
