import { useState, useSyncExternalStore } from 'react';
import { Button, Switch } from '@pickthree/ui';
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

/** Error reports switch plus the on-device log with a copy button, for the About page. */
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
    <section className="settings-block">
      <Switch label="Send anonymous error reports" checked={enabled} onChange={() => onToggle()} />
      <div className="settings-pair">
        <Button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
        {entries.length > 0 ? <Button onClick={clearDiagnostics}>Clear</Button> : null}
      </div>
      {entries.length === 0 ? (
        <p className="settings-line">
          No errors recorded. If something breaks, this is where it shows up.
        </p>
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
    </section>
  );
}
