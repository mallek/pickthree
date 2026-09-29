/**
 * The time the app decides live and upcoming cups by. A person always gets the real clock. The
 * screenshot run (navigator.webdriver) may pin it with localStorage 'pick3.now', so its captures
 * show a live and an upcoming cup whatever day it runs.
 */
export function appNow(): Date {
  try {
    if (navigator.webdriver) {
      const pinned = localStorage.getItem('pick3.now');
      if (pinned && !Number.isNaN(Date.parse(pinned))) {
        return new Date(pinned);
      }
    }
  } catch {
    // Storage blocked: the real clock.
  }
  return new Date();
}
