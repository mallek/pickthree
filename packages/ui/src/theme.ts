/**
 * Appearance. The default follows the system; a manual choice is remembered on this device only.
 * Storage can throw in a private window, so every access is guarded and the page still renders.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'pickthree.theme';

const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export function storedTheme(store?: Pick<Storage, 'getItem'>): ThemeChoice {
  const from = store ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!from) {
    return 'system';
  }
  try {
    const raw = from.getItem(THEME_KEY);
    return CHOICES.includes(raw as ThemeChoice) ? (raw as ThemeChoice) : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice, root?: HTMLElement, store?: Storage): void {
  const el = root ?? (typeof document === 'undefined' ? null : document.documentElement);
  if (el) {
    if (choice === 'system') {
      el.removeAttribute('data-theme');
    } else {
      el.setAttribute('data-theme', choice);
    }
  }
  const to = store ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  try {
    to?.setItem(THEME_KEY, choice);
  } catch {
    // A device that will not remember the choice still gets the choice for this page load.
  }
}

export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return choice === 'system' ? 'dark' : choice === 'dark' ? 'light' : 'system';
}
