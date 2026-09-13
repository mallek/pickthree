import { registerSW } from 'virtual:pwa-register';

/**
 * App update plumbing. The service worker is registered in prompt mode: a new version installs
 * and waits, we show a toast, and the reload happens only when the user taps it. Update checks
 * run on launch, whenever the app returns to the foreground (the case that matters for a home
 * screen app on iOS, which can sit suspended for days), and hourly while open.
 */
export interface UpdateState {
  /** A new version is installed and waiting. */
  ready: boolean;
  /** A manual check is in flight. */
  checking: boolean;
  /** Result line for the manual check, cleared on the next check. */
  note: string | null;
}

type Listener = () => void;

let state: UpdateState = { ready: false, checking: false, note: null };
const listeners = new Set<Listener>();
let registration: ServiceWorkerRegistration | undefined;
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) {
    l();
  }
}

export function subscribeUpdate(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getUpdateState(): UpdateState {
  return state;
}

/** Ask the browser to look for a new service worker now. Resolves once the check finished. */
export async function checkForUpdate(): Promise<void> {
  if (!registration || state.checking) {
    return;
  }
  set({ checking: true, note: null });
  try {
    await registration.update();
    // onNeedRefresh fires asynchronously if something new installed; give it a beat.
    await new Promise((r) => window.setTimeout(r, 1500));
    set({ checking: false, note: state.ready ? null : 'You are on the latest version.' });
  } catch {
    set({ checking: false, note: 'Could not check right now.' });
  }
}

/**
 * Activate the waiting worker and reload onto the new version. The reload is wired here rather
 * than left to the register helper: that helper only reloads when it saw a controller at page
 * load, which misses a first-ever install followed by an update in the same session.
 */
export async function applyUpdateNow(): Promise<void> {
  const reload = (): void => window.location.reload();
  navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
  const waiting = registration?.waiting;
  if (waiting) {
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } else if (applyUpdate) {
    await applyUpdate(true);
  } else {
    reload();
    return;
  }
  // If the worker never takes control, reload anyway rather than leave a dead button.
  window.setTimeout(reload, 4000);
}

export function installUpdater(): void {
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      set({ ready: true, checking: false, note: null });
    },
    onRegisteredSW(_url, r) {
      registration = r;
      if (!r) {
        return;
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void r.update();
        }
      });
      window.setInterval(() => void r.update(), 60 * 60 * 1000);
    },
  });
}
