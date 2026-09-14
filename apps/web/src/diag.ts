import { COUNTER_ORIGIN } from './counter.ts';

/**
 * Diagnostics. Every caught failure is kept on the device (last 20, local storage) so a tester
 * can copy them into a bug report, and, unless turned off in settings, posted anonymously to the
 * counter worker: build id, stage, message, browser family. Never the collection.
 */
export interface DiagEntry {
  at: string;
  build: string;
  stage: string;
  message: string;
}

const KEY = 'pickthree.diag';
const MAX = 20;
const listeners = new Set<() => void>();
let reportsEnabled = true;

export function setErrorReportsEnabled(on: boolean): void {
  reportsEnabled = on;
}

export function getDiagnostics(): DiagEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DiagEntry[]) : [];
  } catch {
    return [];
  }
}

export function subscribeDiagnostics(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function clearDiagnostics(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  for (const l of listeners) {
    l();
  }
}

/** Strip anything that could be personal: file names, long numbers, long tails. */
export function sanitize(message: string): string {
  return message
    .replace(/[\w-]+\.(csv|txt)/gi, '[file]')
    .replace(/\d{5,}/g, '[n]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

/** Browser and OS family only, e.g. "iOS Safari" or "Android Chrome". */
export function uaFamily(ua = navigator.userAgent): string {
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : 'other';
  const browser = /CriOS|Chrome/.test(ua)
    ? 'Chrome'
    : /Safari/.test(ua)
      ? 'Safari'
      : /Firefox/.test(ua)
        ? 'Firefox'
        : 'other';
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return `${os} ${browser}${standalone ? ' installed' : ''}`;
}

/** Record a failure locally and, when allowed, send the anonymous report. */
export function recordError(stage: string, err: unknown): void {
  const message = sanitize(err instanceof Error ? err.message : String(err));
  const entry: DiagEntry = {
    at: new Date().toISOString(),
    build: __PICK3_BUILD__,
    stage,
    message,
  };
  try {
    const next = [entry, ...getDiagnostics()].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: still report
  }
  for (const l of listeners) {
    l();
  }
  if (reportsEnabled && !navigator.webdriver) {
    void fetch(`${COUNTER_ORIGIN}/error`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ build: entry.build, stage, message, ua: uaFamily() }),
    }).catch(() => {
      // reporting is best effort
    });
  }
}

/** Plain text a tester can paste into a comment. */
export function diagnosticsText(): string {
  const lines = [`pick3 build ${__PICK3_BUILD__} · ${uaFamily()}`];
  for (const d of getDiagnostics()) {
    lines.push(`${d.at.slice(0, 19).replace('T', ' ')} [${d.build}] ${d.stage}: ${d.message}`);
  }
  if (lines.length === 1) {
    lines.push('no errors recorded');
  }
  return lines.join('\n');
}
