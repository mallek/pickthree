/** Shared between the service worker and the app: where a shared CSV waits to be imported. */
export const SHARE_PATH = '/share';
export const SHARE_CACHE = 'pick3-share';
export const SHARE_KEY = '/share/pending';
export const SHARE_PARAM = 'share';
/** No screen in the fragment on purpose: a redirect drops it. The app reads SHARE_PARAM and
 * routes to the import screen itself. */
export const SHARE_LANDING = `/?${SHARE_PARAM}=1#/`;
