import type { ScanList } from '@pickthree/engine';
import { useRef, useState } from 'react';
import { num } from '../format.ts';

/**
 * A Pokémon GO search string that narrows storage to what is worth scanning, with a copy button.
 * Lives inside a details block on the import screen.
 */
export function ScanListPanel({ list, ready }: { list: ScanList | null; ready: boolean }) {
  const [copied, setCopied] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const copy = async (): Promise<void> => {
    if (!list) {
      return;
    }
    try {
      await navigator.clipboard.writeText(list.search);
    } catch {
      const el = areaRef.current;
      if (el) {
        el.focus();
        el.select();
        document.execCommand('copy');
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="stack" style={{ gap: 10, marginTop: 8 }}>
      <p className="small muted" style={{ margin: 0 }}>
        You do not need to scan everything. Paste this into the search box in Pokémon GO. It shows
        only your Pokémon that fit the league and are a top pick, a counter to the current meta, or
        evolve into one. Open each one with the appraisal screen up and record the three IVs as you
        swipe.
      </p>
      {list ? (
        <>
          <textarea
            ref={areaRef}
            className="scan-string"
            readOnly
            value={list.search}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Pokémon GO search string"
          />
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy search string'}
            </button>
            <span className="small muted">
              {num(list.dexCount)} dex numbers, {num(list.speciesCount)} species including
              pre-evolutions.
            </span>
          </div>
          <p className="small faint" style={{ margin: 0 }}>
            Built from PvPoke&rsquo;s top {list.sources.overall} overall plus{' '}
            {list.sources.counters} meta counters. Dex numbers cover regional forms and shadows too.
          </p>
        </>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {ready ? 'Working it out...' : 'Loading game data...'}
        </p>
      )}
    </div>
  );
}
