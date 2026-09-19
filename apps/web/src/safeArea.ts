/**
 * Mitigates a WebKit quirk seen when this installed PWA is left (a link to meta.pick3.gg, a
 * different origin, drops the page out of standalone display) and returned to with the browser's
 * own back button rather than an in-app link. The restored page can come back with
 * env(safe-area-inset-top) resolved as if there were no notch, so the sticky header loses its top
 * padding and sits under the status bar. `pageshow` fires on a real load and on a
 * back/forward-cache restore alike (unlike `load`, which never refires on a bfcache restore), so
 * it is the one hook that can catch this. Nudging the viewport meta tag's own content forces
 * WebKit to redo the layout pass that computes env() values, without any visible flash.
 */
export function installSafeAreaFix(): void {
  window.addEventListener('pageshow', () => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!(viewport instanceof HTMLMetaElement)) {
      return;
    }
    const content = viewport.content;
    viewport.content = `${content},`;
    viewport.content = content;
  });
}
