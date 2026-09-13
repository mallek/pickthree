import { useEffect, useRef, useState } from 'react';
import { Progress } from '../components.tsx';
import { ScanListPanel } from '../components/ScanListPanel.tsx';
import { fetchCount } from '../counter.ts';
import { num } from '../format.ts';
import { arrivedFromShare, clearShareMarker, takeSharedCsv } from '../share.ts';
import { useActions, useAppState } from '../state/store.tsx';

export function Welcome() {
  const { importing, importError, boot, bootError, collection, scanList } = useAppState();
  const { importCsv, navigate, loadScanList } = useActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [count, setCount] = useState<number | null>(null);

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

  const loadSample = async (): Promise<void> => {
    const res = await fetch('/fixtures/pokegenie-sample.csv');
    const content = await res.text();
    await importCsv(content, 'sample collection');
  };

  useEffect(() => {
    // #/?sample=1 imports the synthetic sample straight away (used for demos and screenshots).
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? window.location.search);
    if (q.get('sample') === '1' && boot === 'ready' && !importing) {
      void loadSample();
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
              <b>Export from Poke Genie</b>
              <span className="small muted">
                Scan your Pokémon, then Export to CSV and save it to Files.
              </span>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <b>Upload it here</b>
              <span className="small muted">
                On Android you can share it from Poke Genie straight to pick3 once the app is
                installed. It stays on your phone.
              </span>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <b>Get your teams</b>
              <span className="small muted">Three Pokémon, in order, with moves and cost.</span>
            </div>
          </li>
        </ol>
        <details>
          <summary className="small" style={{ color: 'var(--accent-text)', cursor: 'pointer' }}>
            How to export from Poke Genie
          </summary>
          <p className="small muted" style={{ marginTop: 8 }}>
            In Poke Genie open the scan history (the list icon), tap the share or export button,
            choose CSV, then Save to Files. Come back here and pick that file. Scans made with the
            IV appraisal screen open carry the IVs PickThree needs; bulk scans without it will be
            listed as needing a rescan.
          </p>
        </details>
        <details onToggle={(e) => (e.currentTarget.open ? void loadScanList() : undefined)}>
          <summary className="small" style={{ color: 'var(--accent-text)', cursor: 'pointer' }}>
            3,000 Pokémon? What to scan first
          </summary>
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
            onClick={() => void loadSample()}
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
          accept=".csv,text/csv,text/comma-separated-values,text/plain"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          className="btn"
          disabled={importing || boot === 'error'}
          onClick={() => fileRef.current?.click()}
        >
          <i />
          Upload Poke Genie CSV
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setPaste((p) => !p)}>
          Paste CSV text
        </button>
        <div className="no-export">
          <span className="small muted">
            No export? Poke Genie charges for it. You do not need it.
          </span>
          <button
            type="button"
            className="btn-ghost"
            disabled={boot !== 'ready'}
            onClick={() => navigate({ screen: 'build' })}
          >
            Build a team from any Pokémon &rsaquo;
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={boot !== 'ready'}
            onClick={() => navigate({ screen: 'add' })}
          >
            Add your Pokémon by hand for team picks &rsaquo;
          </button>
        </div>
        <p className="meta faint" style={{ textAlign: 'center' }}>
          Your file is processed on your phone and never uploaded anywhere. The only thing sent is
          an anonymous tick to the counter when you build teams.
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
