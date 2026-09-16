/**
 * Stand-in for the `virtual:pwa-register` module vite-plugin-pwa injects at build time. Vitest
 * runs `apps/web/vite.config.ts` without that plugin, so any file that reaches `update.ts`
 * (Sheet, App) needs this to resolve. registerSW is only called from installUpdater, which tests
 * never invoke.
 */
export function registerSW(): (reload?: boolean) => Promise<void> {
  return async () => {
    // Not called in tests.
  };
}
