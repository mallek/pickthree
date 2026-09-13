/** An anonymous error report as the app sends it. Kept apart from the worker entry for tests. */
export interface ErrorReport {
  at: string;
  build: string;
  stage: string;
  message: string;
  ua: string;
}

const FIELD = 200;

function clip(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, FIELD) : '';
}

/** Shape and size check on a report; anything odd is dropped rather than stored. */
export function parseReport(body: unknown): ErrorReport | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const b = body as Record<string, unknown>;
  const build = clip(b.build);
  const stage = clip(b.stage);
  const message = clip(b.message);
  if (!/^[0-9a-f]{7}$|^dev$|^upd-\w+$/.test(build) || !/^[a-z-]{2,32}$/.test(stage) || !message) {
    return null;
  }
  return { at: new Date().toISOString(), build, stage, message, ua: clip(b.ua) || 'unknown' };
}
