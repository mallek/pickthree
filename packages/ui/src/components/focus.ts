import { useEffect, type KeyboardEvent } from 'react';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** For a modal layer: remembers what had focus when it opened and gives focus back when it
 * closes, if that element is still on the page. */
export function useReturnFocus(): void {
  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, []);
}

/** Keeps Tab and Shift+Tab cycling inside `root`. Call from the layer's onKeyDown. */
export function trapTab(e: KeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== 'Tab' || root === null) {
    return;
  }
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) {
    e.preventDefault();
    return;
  }
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
