import { useState, useSyncExternalStore } from 'react';
import {
  clearDiagnostics,
  diagnosticsText,
  getDiagnostics,
  subscribeDiagnostics,
  type DiagEntry,
} from '../diag.ts';

let cache: DiagEntry[] = getDiagnostics();
let cacheKey = '';
function snapshot(): DiagEntry[] {
  const raw = JSON.stringify(getDiagnostics());
  if (raw !== cacheKey) {
    cacheKey = raw;
    cache = JSON.parse(raw) as DiagEntry[];
  }
  return cache;
}

/** Error reports toggle plus the on-device log with a copy button, for the Filters sheet. */
export function Diagnostics({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  const entries = useSyncExternalStore(subscribeDiagnostics, snapshot, snapshot);
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(diagnosticsText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this', diagnosticsText());
    }
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button type="button" className="toggle" onClick={onToggle} aria-pressed={enabled}>
        <span>
          <span style={{ display: 'block', fontSize: 15 }}>Send anonymous error reports</span>
          <span className="meta">Build id, what failed, and the message. Never your Pokémon.</span>
        </span>
        <span className={`switch${enabled ? ' on' : ''}`} />
      </button>
      <div className="between" style={{ alignItems: 'center' }}>
        <span>Diagnostics on this device</span>
        <span className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn-ghost"
            style={{ minHeight: 28, fontSize: 12 }}
            onClick={() => void copy()}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          {entries.length > 0 ? (
            <button
              type="button"
              className="btn-ghost"
              style={{ minHeight: 28, fontSize: 12 }}
              onClick={clearDiagnostics}
            >
              Clear
            </button>
          ) : null}
        </span>
      </div>
      {entries.length === 0 ? (
        <span className="meta">
          No errors recorded. If something breaks, this is where it shows up.
        </span>
      ) : (
        <div className="diag-list">
          {entries.slice(0, 5).map((d) => (
            <span key={d.at + d.stage}>
              {d.at.slice(5, 16).replace('T', ' ')} [{d.build}] {d.stage}: {d.message}
            </span>
          ))}
          {entries.length > 5 ? <span>and {entries.length - 5} more in the copy</span> : null}
        </div>
      )}
    </div>
  );
}
