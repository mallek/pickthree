# Setup

Requirements: Node 24.15 (fnm reads `.node-version`), npm 11, git.

    fnm use
    npm install
    npm run data:fetch       # clones PvPoke at the pinned commit into packages/data/.pvpoke
    npm test                 # engine, data, sim-pvpoke projects (golden test needs the checkout)
    npm run data:build       # writes apps/web/public/data (matrix build time: see below)

Set `PICKTHREE_SKIP_MATRIX=1` to skip the matrix for a quick build.
Set `PICKTHREE_REQUIRE_PVPOKE=1` to fail instead of skip tests that need the checkout (CI does).

Note on install speed: a user-level `min-release-age` npm setting makes the first dependency
resolution slow (npm fetches full metadata for every package to check publish dates). Once
`package-lock.json` exists, `npm ci` skips resolution and is fast.

## Web app

    npm -w @pickthree/web run dev          # http://localhost:5173
    npm -w @pickthree/web run build        # apps/web/dist
    npm -w @pickthree/web run preview      # serves dist on :4173
    npm run web:screens                    # puppeteer (uses installed Chrome) -> apps/web/screenshots/

The app loads `/data/*` at runtime, so run `npm run data:build` before `dev`. `#/?sample=1` (or the
"Try a sample collection" link) imports `apps/web/public/fixtures/pokegenie-sample.csv`.

Deploy: pushing to `main` runs `.github/workflows/pages.yml`, which builds the data and the app and
publishes to GitHub Pages at pick3.gg (DNS at Dynadot: apex A/AAAA to GitHub Pages, www CNAME to mallek.github.io). The old pick3.demome.com is a redirect site in mallek/pick3-redirect.

## PWA

`vite-plugin-pwa` (generateSW) emits `manifest.webmanifest` and `sw.js` at build. The app shell is
precached; `/data/*` and Google Fonts are cached stale-while-revalidate on first use, so the app
works offline after one visit. Registration lives in `src/main.tsx` (no inline script, so the CSP
stays strict). Updates apply on the next launch. Icons: `icon-192.png`, `icon-512.png` (also used as
maskable), `apple-touch-icon.png`.

## Counter worker

`workers/counter` is a Cloudflare Worker (Durable Object) with `POST /hit` and `GET /count`, live at
https://pickthree-counter.travis-c82.workers.dev. The site sends one anonymous tick per device
when teams are built and shows the total on the welcome screen. Deploys on push via
`.github/workflows/counter.yml` using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo
secrets (account-owned token, "Edit Cloudflare Workers" template). Local deploy:
`CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run counter:deploy`.

## Refreshing PvPoke

    npm run data:refresh                      # bumps pvpoke.lock.json to upstream HEAD
    npm run data:fetch
    npm -w @pickthree/sim-pvpoke run vendor:sync
    npm test                                  # golden test is the gate
    npm run data:build

The weekly `data-refresh` workflow does the same and opens a PR.

## Measured numbers

Filled in after the first full build on bogdog2 (2026-09-12):

- full `npm run data:build` including the matrix: 67 s (1146 candidates x 48 meta x 3 shield scenarios = 165,024 battles)
- matrix/great.json: 735 KB raw, 274 KB gzipped
- total apps/web/public/data: 6.8 MB raw (pokemon.json 1.0 MB, vendored simulator bundle 240 KB)
