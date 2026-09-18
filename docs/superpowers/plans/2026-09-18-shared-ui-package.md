# Shared UI Package (pick3 + meta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the design tokens, shared CSS classes and duplicated components that make
`apps/web` and `apps/meta` look like the same product into a fourth workspace package,
`packages/ui`, so a pick3 UI fix stops needing to be re-derived by hand in meta.

**Architecture:** `packages/ui` follows `packages/engine` exactly: raw TypeScript, no build step,
resolved through the existing npm workspace link, `react`/`react-dom` as peer dependencies. It
ships two CSS files (`tokens.css`, `base.css`), a `brand/` asset folder, and a component barrel.
Nothing in the package imports `@pickthree/engine` or either app's state store; every component
takes plain props. Both apps import the shared CSS before their own `app.css` and keep the
engine-coupled or store-coupled pieces local. The migration runs in 14 steps across two phases,
each one leaving the tree green so the work can stop at any commit.

**Tech Stack:** TypeScript 5.9 strict, React 19 (peer dependency, not a package dependency), no
build step for the package itself (Vite in each app compiles it as source, same as `engine`).

**Spec:** `docs/superpowers/specs/2026-09-18-shared-ui-package-design.md`

## Global Constraints

- No em dashes anywhere: code, docs, commits, UI copy. eslint `no-restricted-syntax` rejects the
  literal. Use a plain dash or rewrite.
- Braces on all control flow, even single-line bodies (`curly: all`).
- Exact pinned versions in every package.json. No `^` or `~`.
- TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
  (`tsconfig.base.json`). Indexing an array gives `T | undefined`; handle it, do not cast it away.
- Nothing in `packages/ui` imports `@pickthree/engine` or an app state store. Props only.
- PvPoke rankings are an input, not truth; not touched by this migration, noted for completeness.
- The collection never leaves the device; this migration touches no data flow, only presentation.
- Stage explicit paths when committing. Never `git add -A`.
- Read the CLAUDE.md at the repo root before editing (already loaded into this plan's context).
- Do not push to `main` until Travis has reviewed. Work stays local; each task commits, none push.

---

## Read this before starting: the CSS methodology

The spec's first draft listed 39 class names as duplicated and said they all move to `base.css`,
citing `.hdr` as "the known case" needing a local per-app override. Direct comparison of the
current `apps/web/src/app.css` (2833 lines) and `apps/meta/src/app.css` (1014 lines) showed the
truth is more textured: most of the 39 are either byte-identical already or differ only in a
numeric value or a token name, but **five of them use the same class name for a genuinely
different visual design**. The spec has since been corrected: 37 names move, and the five
collisions are each resolved by name, under the rule **one class name, one meaning, across the
whole repo**. A shared name over two rules is a false friend, so none is left that way. Task 5
below classifies every name by direct diff, not by a list alone. The three tiers:

- **Tier 1, pure move.** The rule is byte-identical (or identical after the four token renames
  from Task 3). Cut from `apps/web/src/app.css`, paste into `packages/ui/base.css` unchanged,
  delete from both `app.css` files.
- **Tier 2, base plus override.** The rule serves the same purpose in both apps but a handful of
  properties differ in value (a radius, a gap, a color token). `base.css` gets pick3's copy
  (pick3 is the older, more-reviewed surface, matching the spec's own tie-break for tokens); each
  app's `app.css` keeps a short local rule for exactly the properties that still differ. This is
  the `.hdr` pattern from the spec, applied wherever the diff actually calls for it.
- **Tier 3, name collision.** `.row`, `.app`, `.stat`, `.btn` and `.btn-secondary` use the same
  class name for different jobs in the two apps. Each is resolved individually rather than merged:
  meta's buttons convert to pick3's, meta's `.stat` turns out to be dead code and is deleted, and
  meta's `.row` and `.app` are renamed to `.rank-row` and `.page`. meta is the side that changes
  throughout, because it is not released yet. After Task 5 no class name means two things.

`.token` and `.sprite` are deferred entirely to Task 11: their real unification depends on the
`SpeciesToken` component design decided there, so moving half of their CSS in Task 5 would just
be redone.

---

## File structure

```
packages/ui/
  package.json           NEW
  tsconfig.json           NEW
  tokens.css               NEW  (Task 3/4)
  base.css                 NEW  (Task 1 empty, filled Task 5)
  brand/
    lockup.svg              NEW  (Task 6, moved from apps/web/public)
    lockup-light.svg        NEW  (Task 6)
    mark.svg                 NEW  (Task 6)
    Inter-600.ttf            NEW  (Task 6, moved from apps/web/brand)
    Inter-700.ttf            NEW  (Task 6)
    README.md                 NEW  (Task 6)
  src/
    index.ts                  NEW  barrel
    type.ts                    NEW  (Task 8) typeColor, typeInk, TYPES
    theme.ts                    NEW  (Task 12) moved from apps/meta/src/theme.ts
    test-setup.ts                NEW  (Task 14) moved from apps/{web,meta}/test/setup.ts
    components/
      Term.tsx                   NEW  (Task 7)
      TypeChip.tsx                 NEW  (Task 8)
      League.tsx                    NEW  (Task 9) LEAGUE_COLORS, LeagueShield, LeagueSwitcher
      Chevron.tsx                    NEW  (Task 10)
      Chip.tsx                        NEW  (Task 10)
      Seg.tsx                          NEW  (Task 10)
      Select.tsx                        NEW  (Task 10)
      SpeciesToken.tsx                   NEW  (Task 11)
      HeaderShell.tsx                     NEW  (Task 13)

apps/web/
  package.json               MOD  Task 1, add @pickthree/ui dependency
  tsconfig.json                MOD  Task 1, include packages/ui
  src/app.css                   MOD  Tasks 3-14
  src/design/tokens.css           DELETE  Task 4
  src/state/store.tsx                MOD  Task 12
  src/screens/Sheet.tsx                MOD  Task 12
  src/screens/Welcome.tsx                MOD  Task 6
  src/components.tsx                      MOD  Tasks 7-11, 13
  src/components/LeagueSwitcher.tsx        MOD  Task 9
  src/format.ts                             MOD  Task 8, 11
  scripts/lockup.mjs                         MOD  Task 6
  brand/                                       DELETE  Task 6 (moved to packages/ui/brand)
  public/lockup.svg, lockup-light.svg, mark.svg  DELETE  Task 6
  test/setup.ts                                    DELETE  Task 14
  vitest.config.ts                                  MOD  Task 14

apps/meta/
  package.json               MOD  Task 1, add @pickthree/ui dependency
  tsconfig.json                MOD  Task 1, include packages/ui
  src/app.css                   MOD  Tasks 3-14
  src/design/tokens.css           DELETE  Task 3
  src/theme.ts                      DELETE  Task 12 (moved to packages/ui)
  src/App.tsx                         MOD  Tasks 6, 12, 13
  src/components.tsx                    MOD  Tasks 7-11, 13
  public/lockup.svg, lockup-light.svg     DELETE  Task 6
  test/setup.ts                             DELETE  Task 14
  vitest.config.ts                            MOD  Task 14

scripts/check-tokens.mjs       NEW  Task 3
package.json                     MOD  Task 3 (check-tokens script)
.github/workflows/ci.yml           MOD  Task 3 (check-tokens step)
```

---

## Task 1: Scaffold `packages/ui`

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/base.css`
  (empty), `packages/ui/src/index.ts` (empty barrel)
- Modify: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/meta/package.json`,
  `apps/meta/tsconfig.json`

**Interfaces:**
- Produces: the `@pickthree/ui` workspace package, importable as `@pickthree/ui` (barrel),
  `@pickthree/ui/tokens.css`, `@pickthree/ui/base.css`, `@pickthree/ui/brand/*`.

- [ ] **Step 1: Create the package manifest**

Create `packages/ui/package.json`, modeled on `packages/engine/package.json`:

```json
{
  "name": "@pickthree/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./tokens.css": "./tokens.css",
    "./base.css": "./base.css",
    "./brand/*": "./brand/*"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "peerDependencies": {
    "react": "19.2.8",
    "react-dom": "19.2.8"
  }
}
```

- [ ] **Step 2: Create the package tsconfig**

Create `packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 3: Create the empty base.css and the empty barrel**

Create `packages/ui/base.css` with a single line: `/* filled in Task 5 */`.

Create `packages/ui/src/index.ts` with a single line: `export {};`.

- [ ] **Step 4: Add the dependency to both apps**

In `apps/web/package.json`, add to `dependencies` (alphabetical, next to `@pickthree/engine`):

```json
    "@pickthree/ui": "0.0.0",
```

In `apps/meta/package.json`, add to `dependencies` (it currently has none from this repo, so this
becomes the first entry, before `react`):

```json
    "@pickthree/ui": "0.0.0",
```

- [ ] **Step 5: Include the package in both apps' typecheck**

In `apps/web/tsconfig.json`, add to `include`, after the `sim-pvpoke` line:

```json
    "../../packages/ui/src/**/*.ts",
    "../../packages/ui/src/**/*.tsx"
```

In `apps/meta/tsconfig.json`, add to `include` (it currently has no cross-package includes, since
it had no `@pickthree/engine` dependency; add these two after `"scripts/**/*.ts"`):

```json
    "../../packages/ui/src/**/*.ts",
    "../../packages/ui/src/**/*.tsx"
```

- [ ] **Step 6: Install and verify**

Run: `npm install` (repo root, writes `package-lock.json` and links the new workspace)
Run: `npm run typecheck`
Expected: PASS. `npm run typecheck --workspaces --if-present` now also runs
`@pickthree/ui`'s `typecheck` script; with an empty barrel it has nothing to fail on.
Run: `npm run lint`
Expected: PASS. `packages/ui` is inside eslint's default scan (`eslint.config.js`'s `ignores`
list does not exclude it), no config change needed.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/package.json packages/ui/tsconfig.json packages/ui/base.css packages/ui/src/index.ts apps/web/package.json apps/web/tsconfig.json apps/meta/package.json apps/meta/tsconfig.json package-lock.json
git commit -m "ui: scaffold the packages/ui workspace"
```

---

## Task 2: Capture the baseline screenshots

**Files:** none in the repo. Output goes outside the working tree so a later task's screenshot
run cannot clobber it.

- [ ] **Step 1: Build both apps' data and run both screens jobs on the current commit**

Run from the repo root (this is the pre-migration commit; do this before any token or CSS edit):

```bash
npm run data:build
npm -w @pickthree/web run build
(cd apps/web && npx vite preview --port 4173 --strictPort &) ; sleep 3
CHROME_PATH=<path to your installed Chrome> npm run web:screens
npm -w @pickthree/meta run build
(cd apps/meta && npx vite preview --port 4174 --strictPort &) ; sleep 3
CHROME_PATH=<path to your installed Chrome> npm run meta:screens
```

`CHROME_PATH` must point at an installed Chrome; see `apps/web/scripts/screens.mjs` for how it is
consumed. Kill both `vite preview` background processes once both screens jobs finish.

- [ ] **Step 2: Copy the PNGs outside the repo**

`apps/web/screenshots/*.png` and `apps/meta/screenshots/*.png` are gitignored and get overwritten
every time `web:screens`/`meta:screens` runs again in a later task. Copy them out now:

```bash
mkdir -p ../pickthree-ui-migration-baseline/web ../pickthree-ui-migration-baseline/meta
cp apps/web/screenshots/*.png ../pickthree-ui-migration-baseline/web/
cp apps/meta/screenshots/*.png ../pickthree-ui-migration-baseline/meta/
```

(From `D:\Skunkworks\pickthree`, this lands at `D:\Skunkworks\pickthree-ui-migration-baseline\`,
a sibling of the repo, never at risk of being gitignored or committed.)

- [ ] **Step 3: Record the gate**

Every task from Task 3 onward ends its verification by running `web:screens`/`meta:screens`
again and eyeballing the new PNGs against these baseline copies (spec section 6: this is a
manual gate; typecheck and vitest cannot see a wrong color). A pick3 screenshot moving is a
regression until proven otherwise. A meta screenshot moving from the token/radius corrections in
Tasks 3-6 is expected and does not need a stop; anything moving for a reason not documented in
this plan does need one.

No commit for this task; it produces no repo changes.

---

## Task 3: meta adopts the shared tokens.css, and the token guard

**Files:**
- Create: `packages/ui/tokens.css`, `scripts/check-tokens.mjs`
- Delete: `apps/meta/src/design/tokens.css`
- Modify: `apps/meta/src/app.css` (import line, four token renames), `package.json` (root),
  `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `packages/ui/tokens.css`, importable as `@pickthree/ui/tokens.css`.
- Produces: `npm run check-tokens`, wired into CI, that fails the build on any `var(--x)` in
  `packages/ui/base.css`, `apps/web/src/app.css` or `apps/meta/src/app.css` that is not defined
  in `packages/ui/tokens.css` (excluding the three component-provided custom properties `--c`,
  `--t`, `--c1`, which are always set inline via `style`, never in `tokens.css`).

- [ ] **Step 1: Create the shared tokens.css**

Create `packages/ui/tokens.css` as `apps/web/src/design/tokens.css` verbatim (read the current
file, copy it exactly), with these four additions, applied to both the `:root, :root[data-theme='dark']`
block and both light blocks (`@media (prefers-color-scheme: light) { :root:not(...) }` and
`:root[data-theme='light']`):

1. Add `--on-accent` (new token, no pick3 equivalent today):
   - Dark block: `--on-accent: #161826;` (meta's dark value, right after `--warn-tint`)
   - Both light blocks: `--on-accent: #ffffff;` (meta's light value)
2. Change `--warn` in the dark block from `#d9b384` to `#f2c46b` (meta's value, unchanged; it
   already clears the contrast bar on `--warn-tint` per the spec's measurement).
3. Change `--warn` in both light blocks from `#8a6a2c` to `#886320` (meta's hue, rescaled; clears
   4.5:1 on `--warn-tint`, unlike either app's current light value).
4. `--divider`, `--win`, `--loss` are pick3's existing names and values; no change needed to them.
   `--border`, `--up`, `--down` (meta's names) are not added; meta's `app.css` stops referencing
   them in Step 2 below.

Do not add `--warn-tint`; it keeps its current pick3 values in both themes (spec section 2).

- [ ] **Step 2: meta imports the shared tokens.css and renames its four tokens**

Delete `apps/meta/src/design/tokens.css`.

In `apps/meta/src/app.css`, change line 1:

```css
@import '@pickthree/ui/tokens.css';
```

Then, still in `apps/meta/src/app.css`, replace every `var(--border)` with `var(--divider)`,
every `var(--up)` with `var(--win)`, every `var(--down)` with `var(--loss)`. There is no
`var(--warn-tint)` usage to touch (meta has none today) and no `--on-accent` usage to touch yet
(Task 5 deletes meta's `.btn-primary` rule outright, so it is out of this task's scope either way).

Use a scoped find-and-replace (grep first to see every hit, then edit each occurrence; do not use
a blind sed across the whole repo, which would also touch `apps/web/src/app.css`'s unrelated
`--border`-shaped strings if any existed):

```bash
grep -n "var(--border)\|var(--up)\|var(--down)" apps/meta/src/app.css
```

- [ ] **Step 3: Write the token guard script**

Create `scripts/check-tokens.mjs`:

```js
#!/usr/bin/env node
/**
 * Guards the token contract: every var(--x) in base.css and the two app.css files must resolve
 * to a custom property packages/ui/tokens.css defines, or be one of the handful of custom
 * properties a component sets inline via style (never in tokens.css). An undefined custom
 * property fails silently at runtime, so this is the one thing typecheck and vitest cannot catch.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Set inline via style={{ '--x': ... }} in a component (TypeChip, OpponentCard, Build's evo
 * card), never in tokens.css. */
const INLINE_ONLY = new Set(['c', 't', 'c1']);

const TOKENS_FILE = path.join(root, 'packages/ui/tokens.css');
const SCAN_FILES = [
  path.join(root, 'packages/ui/base.css'),
  path.join(root, 'apps/web/src/app.css'),
  path.join(root, 'apps/meta/src/app.css'),
];

function names(text, pattern) {
  const out = new Set();
  for (const m of text.matchAll(pattern)) {
    if (m[1]) {
      out.add(m[1]);
    }
  }
  return out;
}

const defined = names(readFileSync(TOKENS_FILE, 'utf8'), /--([a-zA-Z0-9-]+)\s*:/g);

let bad = 0;
for (const file of SCAN_FILES) {
  const text = readFileSync(file, 'utf8');
  const used = names(text, /var\(--([a-zA-Z0-9-]+)/g);
  for (const name of used) {
    if (!defined.has(name) && !INLINE_ONLY.has(name)) {
      console.error(`${path.relative(root, file)}: var(--${name}) is not defined in tokens.css`);
      bad += 1;
    }
  }
}

if (bad > 0) {
  console.error(`check-tokens: ${bad} undefined custom propert${bad === 1 ? 'y' : 'ies'}`);
  process.exit(1);
}
console.log('check-tokens: ok');
```

- [ ] **Step 4: Wire it into the root scripts and CI**

In `package.json` (root), add to `scripts`, after `"lint"`:

```json
    "check-tokens": "node scripts/check-tokens.mjs",
```

In `.github/workflows/ci.yml`, in the `test` job, add a step right after `- run: npm run lint`:

```yaml
      - run: npm run check-tokens
```

- [ ] **Step 5: Verify**

Run: `node scripts/check-tokens.mjs`
Expected: PASS (`check-tokens: ok`). At this point `packages/ui/base.css` is still the Task 1
placeholder and both `app.css` files reference only tokens that now exist in the shared
`tokens.css`.
Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.
Run: `npm -w @pickthree/meta run build`, serve with `npx vite preview --port 4174 --strictPort`,
run `npm run meta:screens` with `CHROME_PATH` set.
Expected: meta's screenshots differ from the Task 2 baseline in exactly the documented ways:
`--muted`, `--text`, `--surface2` shift by a hair (the one-hex-digit `--surface2` drift the spec
found), and warn-colored elements shift (the small-sample banner badge, `.tag-some`, any other
`--warn` usage). No other visual change. This needs no sign-off gate per spec section 6.
Run `npm -w @pickthree/web run build`, serve, `npm run web:screens`.
Expected: pick3's screenshots are unchanged from the Task 2 baseline (pick3 has not been touched
yet).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/tokens.css apps/meta/src/app.css apps/meta/src/design/tokens.css scripts/check-tokens.mjs package.json .github/workflows/ci.yml
git commit -m "ui: shared tokens.css, meta adopts it, add the token guard"
```

---

## Task 4: web adopts the shared tokens.css

**Files:**
- Delete: `apps/web/src/design/tokens.css`
- Modify: `apps/web/src/app.css` (import line)

**Interfaces:** none new; consumes `packages/ui/tokens.css` from Task 3.

- [ ] **Step 1: Swap the import**

Delete `apps/web/src/design/tokens.css`.

In `apps/web/src/app.css`, change line 1:

```css
@import '@pickthree/ui/tokens.css';
```

`packages/ui/tokens.css` was created as pick3's own file verbatim (Task 3, Step 1) plus the two
additive/corrected tokens, so no other change is needed in `apps/web/src/app.css` for this step.

- [ ] **Step 2: Verify**

Run: `node scripts/check-tokens.mjs && npm run lint && npm run typecheck && npm test`
Expected: PASS.
Run `npm -w @pickthree/web run build`, serve, `npm run web:screens`.
Expected: pick3's screenshots differ from the Task 2 baseline in exactly one place: any element
using `--warn` in light mode shifts from `#8a6a2c` to `#886320` (the corrected value). No other
visual change. This is documented and needs no stop; note it, do not treat it as a regression.
Run `npm run meta:screens` against a fresh `meta` build/preview.
Expected: unchanged from Task 3's screenshots (meta was not touched in this task).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app.css apps/web/src/design/tokens.css
git commit -m "ui: web adopts the shared tokens.css"
```

---

## Task 5: the 37 class blocks move to base.css, and the five collisions are resolved

**Files:**
- Modify: `packages/ui/base.css`, `apps/web/src/app.css`, `apps/meta/src/app.css`

**Interfaces:** none new; consumes `packages/ui/tokens.css` from Tasks 3-4.

This is the largest task. Follow the tier methodology from "Read this before starting" above.
For every class, the source line numbers below are from the tree at commit `1019b3b` (before
Tasks 3-4's edits change some of these lines by a few, since token names get longer or shorter);
re-grep if a line number is off by more than a handful of lines.

### Tier 1: pure move (verified byte-identical or identical after the Task 3 renames)

Cut each of these from `apps/web/src/app.css`, paste into `packages/ui/base.css` unchanged,
delete the matching rule from both `app.css` files.

- **`.back-spacer`**: `{ min-width: 44px; }`
- **`.league-shield`**: `{ flex: none; }`
- **`.btn-pair`**: `{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }`
- **`.tchips`, `.tchip`, `.tchip-sm`** (web: `app.css:528-552`; meta: `app.css:486-510`, already
  identical, confirmed by direct diff):
  ```css
  .tchips {
    display: inline-flex;
    gap: 4px;
    flex-wrap: wrap;
    vertical-align: middle;
  }
  .tchip {
    display: inline-flex;
    align-items: center;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--t);
    background: color-mix(in srgb, var(--c) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
    line-height: 1.3;
    vertical-align: middle;
    white-space: nowrap;
  }
  .tchip-sm {
    padding: 0 5px;
    font-size: 10px;
  }
  ```
- **`.pick-move`**: `{ display: flex; align-items: center; gap: 8px; font-size: 14px; min-width: 0; }`
- **`.pick-move-name`**: `{ min-width: 0; line-height: 1.2; }`
- **`.slots3`**: `{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }`
- **`.slot`**: `{ display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }`
- **`.only-dark`, `.only-light`** (bare, web's generic version, `app.css:2227-2252`; meta has no
  bare version today, only combo-scoped ones, and gains this unused-but-harmless utility):
  ```css
  .only-dark {
    display: block;
  }
  .only-light {
    display: none;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme='dark']) .only-dark {
      display: none;
    }
    :root:not([data-theme='dark']) .only-light {
      display: block;
    }
  }
  :root[data-theme='light'] .only-dark {
    display: none;
  }
  :root[data-theme='light'] .only-light {
    display: block;
  }
  :root[data-theme='dark'] .only-dark {
    display: block;
  }
  :root[data-theme='dark'] .only-light {
    display: none;
  }
  ```
  Leave every `.only-dark.hero-lockup` / `.only-light.hero-lockup` / `.only-dark.site-pill-lockup`
  / `.only-light.site-pill-lockup` combo rule exactly where it is in each app's `app.css`
  (unchanged): they now layer on top of this shared bare utility, but their own display-value
  overrides (block vs. inline) are still needed per combo and are not worth extracting further.

### Tier 2: base plus a small per-app override

For each, `base.css` gets the listed rule; each app's `app.css` keeps only the listed override
properties (delete everything else that used to duplicate the base rule).

- **`.hdr`** (the spec's own worked example): base gets web's rule verbatim
  (`app.css:163-173`, `border-bottom` token already `--divider`). meta's override:
  ```css
  .hdr {
    margin: 0 -16px;
    gap: 8px;
    padding-bottom: 10px;
  }
  ```
  web needs no override.

- **`.hdr-actions`**: base gets meta's self-contained version
  (`{ justify-self: end; display: flex; align-items: center; gap: 8px; }`, `app.css:977-982`).
  web's override: `{ gap: 4px; }`. Also: in `apps/web/src/components.tsx`'s `Header`, change
  `<span className="row hdr-actions">` to `<span className="hdr-actions">` (drop the `row` class;
  it was only there to borrow `.row`'s `display: flex`, which `.hdr-actions` now supplies itself).

- **`.hdr-title`**: base gets web's rule (`{ text-align: center; display: flex; flex-direction:
  column; align-items: center; font-weight: 500; font-size: 15px; }`, `app.css:174-181`). meta's
  override:
  ```css
  .hdr-title {
    gap: 2px;
    font-weight: 700;
    min-width: 0;
  }
  ```

- **`.back`**: base gets the properties common to both (`{ justify-self: start; min-width: 44px;
  min-height: 44px; color: var(--accent); padding: 0 4px; white-space: nowrap; display:
  inline-flex; align-items: center; gap: 2px; }`). web's override (it is a `<button>`):
  ```css
  .back {
    border: 0;
    background: transparent;
    font-weight: 500;
  }
  ```
  meta's override (it is an `<a>`):
  ```css
  .back {
    font-weight: 600;
    text-decoration: none;
  }
  ```

- **`.card`**: base gets `{ background: var(--surface); border-radius: var(--r-xl); padding:
  14px; display: flex; flex-direction: column; gap: 12px; }` (meta's hardcoded `14px` radius
  converts to `--r-xl`, matching pick3's existing usage; this is an exact match, not a rounding).
  meta's override: `{ padding: 16px; }`. web needs no override. Leave web's light-mode elevation
  rule (`:root:not([data-theme='dark']) .card, ... .stat { box-shadow: ... }`, `app.css:184-193`)
  exactly where it is; it is a state-based addition, not core `.card` shape, and meta has no
  equivalent today.

- **`.cost-line`**: base gets `{ border-top: 1px solid var(--divider); padding-top: 10px;
  font-size: 12px; color: var(--muted); display: flex; gap: 8px; }`. web's override:
  ```css
  .cost-line {
    justify-content: space-between;
  }
  .cost-line b {
    color: var(--accent);
    font-weight: 500;
    flex: none;
  }
  ```
  meta's override:
  ```css
  .cost-line {
    align-items: center;
    justify-content: flex-end;
  }
  ```

- **`.field`**: base gets `{ display: flex; flex-direction: column; gap: 4px; }`. web's override:
  `{ font-size: 12px; color: var(--muted); }` (web's `.field` has no separate label span, so the
  label styling sits on `.field` itself). meta's override: `{ min-width: 0; }`. Leave
  `.field input`/`.field input:focus` (web only) and `.field-l`/`.select-wrap`/
  `.select-wrap select` (meta only) exactly where they are; they are not in the shared list.

- **`.head-cog`**: base gets meta's self-contained rule (`app.css:407-430`, token renamed):
  ```css
  .head-cog {
    position: relative;
    height: 36px;
    width: 36px;
    border-radius: 50%;
    border: 1px solid var(--divider);
    background: var(--surface);
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .head-cog svg {
    width: 20px;
    height: 20px;
  }
  .head-cog::after {
    content: '';
    position: absolute;
    inset: -2px;
  }
  ```
  Delete web's own `.head-cog { height: 36px; width: 36px; border-radius: 50%; position:
  relative; }` (`app.css:2356-2361`) entirely; base's version supplies the same values plus a
  40px touch target web did not have before (a strict improvement, not a regression: nothing
  visible changes, only the tappable area grows). Keep web's `.hdr .head-cog { justify-self: end;
  }` and `.cog { ... }` (the broader icon-button base web's search/settings buttons also use)
  exactly where they are; `.cog` is not one of the 39.

- **`.hero-lockup`**: base gets the sizing, confirmed byte-identical:
  `{ height: 1.135em; width: auto; vertical-align: -0.325em; margin-left: 0.02em; }`. Leave every
  `.only-dark.hero-lockup`/`.only-light.hero-lockup` show/hide rule in both `app.css` files
  exactly where it is (see the `.only-dark`/`.only-light` note above).

- **`.league-switcher`, `.league-switcher button`, `.league-switcher button + button`,
  `.league-switcher button.on`, `.league-switcher button:focus-visible`**: base gets web's rule
  verbatim (`app.css:1795-1824`), which after Task 3's token unification meta can now match
  exactly (meta's `--surface2` stand-in for the "on" background becomes `--accent-tint`, meta's
  idle-segment `--muted` becomes `--faint`, meta's hardcoded `10px` radius becomes
  `var(--r-md)`). meta needs **no override** for this class once the rename lands; delete meta's
  entire local `.league-switcher*` block. Leave `.league-switcher.compact button` (web only,
  `app.css:1825-1828`) exactly where it is; meta never uses `compact`.

- **`.pick-move-k`**: base gets web's rule with `color: var(--faint)` (the same
  `--faint`-vs-`--muted` standardization as `.league-switcher`). meta needs no override once this
  lands; delete meta's local copy.

- **`.pick-moves`**: base gets `{ display: flex; flex-direction: column; gap: 6px; }`. web's
  override: `{ margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--divider); }`. meta
  needs no override.

- **`.slot-name`**: base gets web's rule (`{ font-size: 13px; font-weight: 500; line-height: 1.2;
  text-wrap: balance; }`). meta's override: `{ font-size: 14px; }`.

- **`.tabs`**: base gets web's rule verbatim (`app.css:1252-1265`). meta's override:
  ```css
  .tabs {
    max-width: 430px;
    grid-template-columns: repeat(3, 1fr);
  }
  ```

- **`.team-card`**: base gets `{ display: flex; flex-direction: column; background: var(--surface);
  border-radius: var(--r-xl); padding: 16px; text-decoration: none; color: inherit; }` plus
  `.team-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`. web's
  override (it is a `<button>`):
  ```css
  .team-card {
    gap: 14px;
    width: 100%;
    text-align: left;
    border: 0;
    cursor: pointer;
  }
  ```
  Leave `.team-card.first { box-shadow: var(--shadow-md); }` (web only) where it is. meta's
  override:
  ```css
  .team-card {
    gap: 12px;
  }
  @media (hover: hover) {
    .team-card:hover {
      background: var(--surface2);
    }
  }
  ```

- **`.team-details`**: base gets `{ color: var(--accent); font-weight: 600; }`. web's override:
  `{ text-decoration: none; padding: 4px 0 4px 8px; }`. meta's override: `{ display: inline-flex;
  align-items: center; gap: 2px; }` (meta's version wraps a `Chevron`; web's does not).

- **`.term-wrap`, `.term`, `.term-tip`**: base gets:
  ```css
  .term-wrap {
    position: relative;
    display: inline;
  }
  .term {
    border: 0;
    background: transparent;
    padding: 0;
    color: inherit;
    font: inherit;
    text-decoration: underline dotted var(--accent);
    text-underline-offset: 3px;
  }
  .term-tip {
    display: block;
    margin-top: 6px;
    padding: 8px 10px;
    border-radius: var(--r-md);
    background: var(--accent-tint);
    color: var(--text);
    font-size: 13px;
  }
  ```
  (`.term` picks up meta's harmless extra `font: inherit;`; `.term-tip` takes web's radius token
  and, after Task 3, meta's `--surface2` stand-in becomes the real `--accent-tint`, matching web.
  meta's hardcoded `10px` radius rounds to `var(--r-md)`, the closest step.) web needs no
  override. meta's override: `{ font-size: 12px; }`.

- **`.brand`**: base gets web's rule (`{ display: flex; align-items: center; gap: 10px; }`). It
  is intentionally that thin (it is only pick3's wordmark row); meta's override adds everything
  else it needs:
  ```css
  .brand {
    justify-content: space-between;
    padding: calc(env(safe-area-inset-top, 0px) + 16px) 0 12px;
    gap: 8px;
    border-bottom: 1px solid var(--divider);
  }
  ```

### Tier 3: the five name collisions

These five names are defined differently in the two apps. The spec's rule is **one class name,
one meaning, across the whole repo**, so none of them is left as a shared name over two rules.
meta is the side that changes: it is not released yet, and pick3's rules are the more reviewed
ones. Three convert, two rename.

- **`.btn` and `.btn-secondary`: meta converts to pick3's, both go to base.** pick3's `.btn` is a
  full-width block (`{ min-height: 52px; border-radius: var(--r-lg); border: 1px solid
  var(--accent); background: var(--accent-tint); color: var(--accent-text); font-weight: 500;
  font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; padding: 0 16px; }`) and is itself the primary style. meta's is an inline pill
  needing `.btn-primary` or `.btn-secondary` on top. Move pick3's `.btn` and `.btn-secondary`
  into `base.css` verbatim, delete meta's versions, and delete meta's `.btn-primary` rule
  entirely. Then fix meta's six call sites: `About.tsx:147` and `Overview.tsx:164` are
  `btn btn-primary` and become plain `btn`; `About.tsx:150`, `Species.tsx:281` and
  `Species.tsx:284` are `btn btn-secondary` and are already correct. **This changes meta
  visibly**: those buttons become full-width blocks. That is intended and approved; see the spec.
  `.btn-pair` is byte-identical in both already and is a Tier 1 pure move, and pick3's
  full-width buttons sit correctly inside its `1fr 1fr` grid.

- **`.stat`: dead in meta, delete it.** This is not a collision. meta's `StatCard`
  (`components.tsx:319`) has had no caller since `742b233` dropped the stat tiles, so `.stat`,
  `.stat .stat-n` and `.stat .stat-l` are all dead. Delete the `StatCard` component and those
  three rules from `apps/meta/src/app.css`. Keep `section > .stat-n, .card > .stat-n`, which is
  live: `Species.tsx:267` renders a bare `.stat-n` outside any tile. `.stat` and `.stat b` then
  stay pick3-local, unchanged, and nothing about `.stat` goes into `base.css`. Verify before
  deleting: `grep -rn "StatCard\|className=\"stat\"" apps/meta/src` should show only the
  definition and nothing else.

- **`.row`: rename meta's to `.rank-row`, pick3's moves to base.** Converting is not possible:
  pick3's is a generic flex utility across 16 files, meta's two uses are the ranked-list item and
  need `display: grid` with a four-column template. Renaming reaches the same end. In
  `apps/meta/src/app.css` rename seven places: the `.row` rule (line 436), `.row:last-child`,
  `.row .name`, `.row > .fine`, `a.row`, the tap-highlight selector list (line 989) and the
  `:focus-visible` selector list (line 995). In `apps/meta/src/screens/Overview.tsx` rename the
  two `<a className="row">` call sites (lines 118 and 214). Leave `.row-figure` alone; it is a
  different name that only looks related. Then move pick3's `.row` (`{ display: flex;
  align-items: center; gap: 8px; }`) into `base.css` as a Tier 1 pure move.

- **`.app`: rename meta's to `.page`, neither goes to base.** Both are root containers with a
  fixed bottom tab bar, but they solve vertical rhythm differently: meta puts the gap in the
  container (`gap: 18px`), pick3 puts it per-screen. Converting meta would mean rebuilding its
  page rhythm to adopt the weaker pattern, and `.app` is a root container no component ever
  references, so the false-friend hazard does not apply. Rename meta's `.app` rule and its
  `@media (min-width: 900px)` block to `.page`, and the one call site in `App.tsx`. pick3's
  `.app` stays exactly as it is in `apps/web/src/app.css`. Neither name appears in `base.css`.

### Verify and commit

- [ ] **Step 1: Apply every Tier 1/2/3 change above to `packages/ui/base.css`,
  `apps/web/src/app.css` and `apps/meta/src/app.css`.**

- [ ] **Step 2: Verify**

Run: `node scripts/check-tokens.mjs && npm run lint && npm run typecheck && npm test`
Expected: PASS.
Build and serve both apps, run `npm run web:screens` and `npm run meta:screens`.
Expected, pick3: every screenshot unchanged from Task 4's. Tier 1 and 2 preserve pick3's exact
current values, and every Tier 3 resolution moves meta, never pick3. A pick3 screenshot moving is
a regression; check all 28.

Expected, meta: the documented token-driven shifts already seen in Task 3, plus the
`.league-switcher` idle-ink change (`--muted` to `--faint`, a hair dimmer), the
`.term-tip`/`.pick-move-k` same change where visible, and the `.head-cog` touch-target growing
(invisible). **Plus one real layout change: the six buttons on About, Overview and Species become
full-width blocks.** That is the intended button convergence. Nothing else in meta should move:
the `.row` and `.app` renames carry identical declarations to new names, and the `.stat` deletion
removes rules nothing rendered. If a meta screenshot shifts anywhere other than those six
buttons, stop and find out why before committing.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/base.css apps/web/src/app.css apps/meta/src/app.css apps/web/src/components.tsx
git add apps/meta/src/components.tsx apps/meta/src/App.tsx apps/meta/src/screens/About.tsx
git add apps/meta/src/screens/Overview.tsx apps/meta/src/screens/Species.tsx
git commit -m "ui: move the 37 shared class blocks to base.css, resolve the five name collisions"
```

---

## Task 6: Lockups move to Vite imports

**Files:**
- Create: `packages/ui/brand/lockup.svg`, `packages/ui/brand/lockup-light.svg`,
  `packages/ui/brand/mark.svg`, `packages/ui/brand/Inter-600.ttf`,
  `packages/ui/brand/Inter-700.ttf`, `packages/ui/brand/README.md`
- Delete: `apps/web/brand/` (whole directory), `apps/web/public/lockup.svg`,
  `apps/web/public/lockup-light.svg`, `apps/web/public/mark.svg`, `apps/meta/public/lockup.svg`,
  `apps/meta/public/lockup-light.svg`
- Modify: `apps/web/scripts/lockup.mjs`, `apps/web/src/screens/Welcome.tsx`,
  `apps/meta/src/App.tsx`, `apps/meta/src/components.tsx`

- [ ] **Step 1: Move the brand source files**

```bash
git mv apps/web/public/lockup.svg packages/ui/brand/lockup.svg
git mv apps/web/public/lockup-light.svg packages/ui/brand/lockup-light.svg
git mv apps/web/public/mark.svg packages/ui/brand/mark.svg
git mv apps/web/brand/Inter-600.ttf packages/ui/brand/Inter-600.ttf
git mv apps/web/brand/Inter-700.ttf packages/ui/brand/Inter-700.ttf
git rm apps/meta/public/lockup.svg apps/meta/public/lockup-light.svg
```

Update `apps/web/brand/README.md` (now `packages/ui/brand/README.md`) to describe the new
location: replace "Generated outputs live in `apps/web/public/`" with "Generated outputs live in
`packages/ui/brand/`", and "used only by `apps/web/scripts/lockup.mjs`" stays accurate (the
script does not move, only what it reads from and writes to).

```bash
git mv apps/web/brand/README.md packages/ui/brand/README.md
```

`favicon.svg` stays duplicated in both apps' `public/`, untouched (spec section 4: it is 490
bytes, referenced at a fixed URL by `index.html` and crawlers, and cannot be hashed).

- [ ] **Step 2: Point the generator script at the new location**

In `apps/web/scripts/lockup.mjs`, change lines 16-17:

```js
const brand = path.resolve(here, '..', '..', '..', 'packages', 'ui', 'brand');
const out = brand;
```

(`here` is `apps/web/scripts`; three `..` reaches the repo root, then into `packages/ui/brand`.)
This changes where `lockup.svg` and `lockup-light.svg` are written, but leave the
`banner-dark.svg`/`banner-light.svg` writes exactly as they are (still to `apps/web/public/`);
they are social-media/README assets, not referenced by either app at runtime, and are out of this
migration's scope.

- [ ] **Step 3: Switch web to a Vite import**

In `apps/web/src/screens/Welcome.tsx`, add near the top:

```ts
import lockupDark from '@pickthree/ui/brand/lockup.svg';
import lockupLight from '@pickthree/ui/brand/lockup-light.svg';
```

Change lines 123-124:

```tsx
<img className="only-dark hero-lockup" src={lockupDark} alt="pick3" />
<img className="only-light hero-lockup" src={lockupLight} alt="pick3" />
```

- [ ] **Step 4: Switch meta's wordmark and SitePill to Vite imports**

In `apps/meta/src/App.tsx`, add near the top:

```ts
import lockupDark from '@pickthree/ui/brand/lockup.svg';
import lockupLight from '@pickthree/ui/brand/lockup-light.svg';
```

Change lines 352-353:

```tsx
<img className="only-dark hero-lockup" src={lockupDark} alt="" aria-hidden="true" />
<img className="only-light hero-lockup" src={lockupLight} alt="" aria-hidden="true" />
```

In `apps/meta/src/components.tsx`, add the same two imports near the top, and change lines
432-437 (`SitePill`):

```tsx
<img className="only-dark site-pill-lockup" src={lockupDark} alt="" aria-hidden="true" />
<img className="only-light site-pill-lockup" src={lockupLight} alt="" aria-hidden="true" />
```

- [ ] **Step 5: Verify**

Run: `node scripts/check-tokens.mjs && npm run lint && npm run typecheck && npm test`
Expected: PASS. TypeScript accepts the `.svg` imports because both apps' `tsconfig.json` already
include `"vite/client"` in `types`.
Build and serve both apps, run `npm run web:screens` and `npm run meta:screens`.
Expected: both wordmarks and meta's SitePill render exactly as before (same bytes, now served
from a hashed `/assets/` path instead of a fixed `public/` path). No visual change on either
site. Confirm neither app's service worker precache list (`apps/web/src/sw.ts`'s
`injectManifest.globPatterns`) needed a change; it globs the built output, so the new hashed
asset paths are picked up automatically.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/brand apps/web/brand apps/web/public/lockup.svg apps/web/public/lockup-light.svg apps/web/public/mark.svg apps/meta/public/lockup.svg apps/meta/public/lockup-light.svg apps/web/scripts/lockup.mjs apps/web/src/screens/Welcome.tsx apps/meta/src/App.tsx apps/meta/src/components.tsx
git commit -m "ui: lockups move to packages/ui/brand, imported through Vite"
```

---

## Task 7: `Term`

**Files:**
- Create: `packages/ui/src/components/Term.tsx`
- Modify: `packages/ui/src/index.ts`, `apps/web/src/components.tsx`,
  `apps/meta/src/components.tsx`, every file importing `Term` from either app's local
  `components.tsx`

**Interfaces:**
- Produces: `Term({ term: string; children: ReactNode })`, exported from `@pickthree/ui`.

- [ ] **Step 1: Create the shared component**

Create `packages/ui/src/components/Term.tsx`, moved verbatim (both apps' copies are
character-for-character identical, per the spec):

```tsx
import { useState, type ReactNode } from 'react';

/** A tap-to-reveal note: `term` is the short label always on screen, `children` the fuller
 * explanation shown only once tapped. */
export function Term({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="term-wrap">
      <button
        type="button"
        className="term"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {term}
      </button>
      {open ? <span className="term-tip">{children}</span> : null}
    </span>
  );
}
```

- [ ] **Step 2: Export it from the barrel**

In `packages/ui/src/index.ts`:

```ts
export { Term } from './components/Term.tsx';
```

- [ ] **Step 3: Delete both apps' local copies and import from the package**

In `apps/web/src/components.tsx`, delete the `Term` function (lines 533-548) and its `GLOSSARY`
neighbor stays (GLOSSARY is web-only per the spec). Add to the imports at the top:

```ts
import { Term } from '@pickthree/ui';
```

In `apps/meta/src/components.tsx`, delete the `Term` function (lines 579-594). Add to the
imports at the top:

```ts
import { Term } from '@pickthree/ui';
```

Every other file in both apps imports `Term` from its own app's `components.tsx`/`components.js`
(a re-export), so no other file needs a change as long as both `components.tsx` files still
export `Term` themselves. Check whether either file already re-exports everything it imports
(grep for `export.*Term` outside the two edited files); if a caller imports `Term` directly from
`@pickthree/ui`, that is fine too, but do not silently break existing `from './components.tsx'`
imports elsewhere in the same app.

- [ ] **Step 4: Verify**

Run: `node scripts/check-tokens.mjs && npm run lint && npm run typecheck && npm test`
Expected: PASS.
Build and serve both apps, run `npm run web:screens` and `npm run meta:screens`.
Expected: every screen using `Term` (glossary terms in web, the confidence key in meta's Teams
screen) renders identically to the Task 6 baseline.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Term.tsx packages/ui/src/index.ts apps/web/src/components.tsx apps/meta/src/components.tsx
git commit -m "ui: move Term to packages/ui"
```

---

## Task 8: `TypeChip`, `TypeChips`, `typeColor`, `typeInk`

**Files:**
- Create: `packages/ui/src/type.ts`, `packages/ui/src/components/TypeChip.tsx`
- Modify: `packages/ui/src/index.ts`, `apps/web/src/components.tsx`, `apps/web/src/format.ts`,
  `apps/web/src/screens/Build.tsx`, `apps/web/src/components/OpponentCard.tsx`,
  `apps/meta/src/components.tsx`

**Interfaces:**
- Produces: `typeColor(type: string): string`, `typeInk(type: string): string`, `TypeChip({
  type: string; small?: boolean })`, `TypeChips({ types: string[]; small?: boolean })`, all
  exported from `@pickthree/ui`.

- [ ] **Step 1: Create the color/ink module**

Create `packages/ui/src/type.ts`, moved from meta's `components.tsx` (the version with the
unknown-type fallback):

```ts
export const TYPES: readonly string[] = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
];

/** A type's paint. Unknown types (a bad CSV cell, a future type) fall back to the neutral token
 * rather than an undefined CSS variable. */
export function typeColor(type: string): string {
  return TYPES.includes(type) ? `var(--type-${type})` : 'var(--muted)';
}

/** A type's chip text colour, the same fallback rule as typeColor above but reading the -ink
 * token instead of the fill. */
export function typeInk(type: string): string {
  return TYPES.includes(type) ? `var(--type-${type}-ink)` : 'var(--muted)';
}
```

- [ ] **Step 2: Create the component**

Create `packages/ui/src/components/TypeChip.tsx`, moved from meta's `components.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { typeColor, typeInk } from '../type.ts';

function capitalize(s: string): string {
  return s.length === 0 ? s : s.slice(0, 1).toUpperCase() + s.slice(1);
}

/** The one way a type is shown anywhere: a small chip in the type's color. */
export function TypeChip({ type, small }: { type: string; small?: boolean | undefined }) {
  return (
    <span
      className={`tchip${small ? ' tchip-sm' : ''}`}
      style={{ '--c': typeColor(type), '--t': typeInk(type) } as CSSProperties}
    >
      {capitalize(type)}
    </span>
  );
}

export function TypeChips({ types, small }: { types: string[]; small?: boolean | undefined }) {
  return (
    <span className="tchips">
      {types.map((t) => (
        <TypeChip key={t} type={t} small={small} />
      ))}
    </span>
  );
}
```

- [ ] **Step 3: Export from the barrel**

In `packages/ui/src/index.ts`:

```ts
export { TypeChip, TypeChips } from './components/TypeChip.tsx';
export { typeColor, typeInk } from './type.ts';
```

- [ ] **Step 4: Verified call-site analysis (do not skip)**

`typeColor` in web's current `format.ts` is typed `(t: PokemonType | 'none') => string` and
returns `'transparent'` for `'none'`; the package's version is typed `(type: string) => string`
and has no `'none'` special case. This is safe: every current call to web's `typeColor` passes a
real `PokemonType`, never `'none'` (`components.tsx:241-242`'s `PokemonToken` checks
`types[1] === 'none'` itself before ever calling `typeColor`; `TypeChip`'s prop type never
admits `'none'`; `Build.tsx:526` and `OpponentCard.tsx:104` both pass a move's `type`, never
`'none'`). Confirm this with `grep -n "typeColor(" apps/web/src -r` before deleting web's
version; if a new call site was added since this plan was written that does pass `'none'`,
handle it at that call site (e.g. guard before calling), not by re-adding the `'none'` case to
the shared function.

`typeLabel` (web's `format.ts`) is used nowhere except inside web's own `TypeChip`, which this
task deletes; delete `typeLabel` from `format.ts` too (dead code once `TypeChip` moves).

- [ ] **Step 5: Delete both apps' local copies and update call sites**

In `apps/web/src/components.tsx`, delete `TypeChip` and `TypeChips` (lines 349-377). Add to the
imports:

```ts
import { TypeChip, TypeChips, typeColor } from '@pickthree/ui';
```

In `apps/web/src/format.ts`, delete `typeColor` and `typeLabel` (lines 40-46).

In `apps/web/src/screens/Build.tsx` and `apps/web/src/components/OpponentCard.tsx`, change the
`typeColor` import from `'../format.ts'` (or `'../../format.ts'`) to `'@pickthree/ui'`.

In `apps/meta/src/components.tsx`, delete `TypeChip`, `TypeChips`, `typeColor`, `typeInk` and the
local `TYPES`/`capitalize` (lines 17-140). Add:

```ts
import { TypeChip, TypeChips } from '@pickthree/ui';
```

(meta's `Sprite`, still local until Task 11, calls `typeColor` for its gradient background; add
`typeColor` to the same import.)

- [ ] **Step 6: Verify**

Run: `node scripts/check-tokens.mjs && npm run lint && npm run typecheck && npm test`
Expected: PASS.
Build and serve both apps, run `npm run web:screens` and `npm run meta:screens`.
Expected: every type chip on every screen (move tags, Pokemon detail pages, Counters, meta's
Species page) renders identically to the Task 7 baseline.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/type.ts packages/ui/src/components/TypeChip.tsx packages/ui/src/index.ts apps/web/src/components.tsx apps/web/src/format.ts apps/web/src/screens/Build.tsx apps/web/src/components/OpponentCard.tsx apps/meta/src/components.tsx
git commit -m "ui: move TypeChip, TypeChips, typeColor, typeInk to packages/ui"
```

---

## Task 9: `LEAGUE_COLORS`, `LeagueShield`, `LeagueSwitcher`

**Files:**
- Create: `packages/ui/src/components/League.tsx`
- Modify: `packages/ui/src/index.ts`, `apps/web/src/components/LeagueSwitcher.tsx`,
  `apps/meta/src/components.tsx`, `apps/meta/src/App.tsx`

**Interfaces:**
- Produces: `LEAGUE_COLORS: Record<string, string>`, `LeagueShield({ id: string; size?: number
  })`, `LeagueSwitcher<T extends string>({ options: { value: T; label: string }[]; value: T;
  onChange: (v: T) => void; label: string; compact?: boolean; dataLeague?: string })`, all
  exported from `@pickthree/ui`. This is the generic, props-only switcher; `apps/web`'s own
  `LeagueSwitcher` becomes a thin wrapper around it (see Step 4).

- [ ] **Step 1: Create the shared component**

Create `packages/ui/src/components/League.tsx`, based on meta's version (already props-only) plus
`compact` and `dataLeague`, which web's usage needs:

```tsx
export const LEAGUE_COLORS: Record<string, string> = {
  great: '#3F7DE8',
  ultra: '#F2B01E',
  master: '#B03DBE',
};

export function LeagueShield({ id, size = 16 }: { id: string; size?: number }) {
  const color = LEAGUE_COLORS[id] ?? '#8E9AAF';
  return (
    <svg
      className="league-shield"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" fill={color} />
      <path d="M12 6.2l4.4 1.9v3.4c0 3-1.9 5.5-4.4 6.9V6.2z" fill="rgba(255,255,255,0.28)" />
    </svg>
  );
}

interface ChoiceOption<T extends string> {
  value: T;
  /** The visible text on the button. */
  label: string;
  /** The accessible name, when it differs from the visible text: pick3 shows "Great" and
   * announces "Great League". Omit it and the visible text is the accessible name, which is
   * what meta wants. */
  srLabel?: string;
}

/** The league toggle: a full-width radiogroup with the game's own shield colours. `dataLeague`
 * is a pass-through `data-league` attribute on the wrapper (apps/web's screenshot automation
 * reads it to confirm the active league before capturing); omit it and no attribute is rendered. */
export function LeagueSwitcher<T extends string>({
  options,
  value,
  onChange,
  label,
  compact,
  dataLeague,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  compact?: boolean;
  dataLeague?: string;
}) {
  return (
    <div
      className={`league-switcher${compact ? ' compact' : ''}`}
      role="radiogroup"
      aria-label={label}
      {...(dataLeague === undefined ? {} : { 'data-league': dataLeague })}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.srLabel}
          className={o.value === value ? 'on' : undefined}
          onClick={() => onChange(o.value)}
        >
          <LeagueShield id={o.value} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

Note: `label` and `srLabel` are separate on purpose, and this is the whole point of the pair.
pick3 renders the short league name and announces the full title, which one field cannot carry.
pick3 passes `{ value: l.id, label: l.short, srLabel: l.title }`, so its visible text stays
"Great" and its accessible name stays "Great League", exactly as today. meta passes no `srLabel`;
React omits an `aria-label` whose value is `undefined`, so meta's buttons are named by their own
visible text, exactly as today. Neither app changes behaviour. Do not collapse these into one
field: doing so either changes pick3's visible text or drops its accessible name.

- [ ] **Step 2: Export from the barrel**

In `packages/ui/src/index.ts`:

```ts
export { LEAGUE_COLORS, LeagueShield, LeagueSwitcher } from './components/League.tsx';
```

- [ ] **Step 3: Delete meta's local copies**

In `apps/meta/src/components.tsx`, delete `LEAGUE_COLORS`, `LeagueShield`, `LeagueSwitcher`
(lines 596-652). Add to the imports:

```ts
import { LEAGUE_COLORS, LeagueShield, LeagueSwitcher } from '@pickthree/ui';
```

`apps/meta/src/App.tsx` already imports `LeagueSwitcher` from `./components.js`; no change needed
there as long as `components.tsx` still re-exports the name (it does, via the import above,
unless it only imports without re-exporting: check whether `App.tsx`'s import is
`import { LeagueSwitcher } from './components.js'` and, if `components.tsx` does not re-export
it, either add `export { LeagueSwitcher } from '@pickthree/ui';` to `components.tsx` or change
`App.tsx`'s import to `'@pickthree/ui'` directly).

- [ ] **Step 4: Rewrite web's LeagueSwitcher.tsx as a thin wrapper**

`apps/web/src/components/LeagueSwitcher.tsx` is engine- and store-coupled (`useLeague()` reads
app state via `useAppState`; the component itself calls `setLeague` via `useActions`), so it
cannot move into `packages/ui` wholesale. It keeps `useLeague()` locally and becomes a wrapper
around the package's generic switcher. Replace the whole file:

```tsx
import { LeagueShield, LeagueSwitcher as GenericLeagueSwitcher, LEAGUE_COLORS } from '@pickthree/ui';
import type { League } from '@pickthree/engine';
import { useActions, useAppState } from '../state/store.tsx';

export { LEAGUE_COLORS, LeagueShield };

/** The league in play, with a safe fallback before the data has loaded. */
export function useLeague(): League {
  const s = useAppState();
  const fallback: League = {
    id: 'great',
    title: 'Great League',
    short: 'Great',
    cp: 1500,
    cup: 'all',
    meta: 'great',
    kind: 'standard',
    minCp: 1410,
    include: [],
    exclude: [],
    metaSize: 0,
  };
  return s.data?.leagues.find((l) => l.id === s.settings.league) ?? s.data?.leagues[0] ?? fallback;
}

/**
 * Standard leagues as a segmented control with the game's shield colours, special cups as chips
 * beneath. Lives in every league-dependent page head, the builder and the sheet. Thin wrapper
 * around the package's generic LeagueSwitcher: this file's only job is pulling league data and
 * the setter out of app state.
 */
export function LeagueSwitcher({ compact }: { compact?: boolean }) {
  const s = useAppState();
  const { setLeague } = useActions();
  const leagues = (s.data?.leagues ?? []).filter((l) => l.kind === 'standard');
  return (
    <GenericLeagueSwitcher
      compact={compact}
      value={s.settings.league}
      onChange={setLeague}
      label="League"
      dataLeague={s.leagueInfo?.id ?? ''}
      options={leagues.map((l) => ({ value: l.id, label: l.short, srLabel: l.title }))}
    />
  );
}
```

`label: l.short` is the visible text and `srLabel: l.title` is the accessible name, which is
byte-for-byte what this component renders today: `{l.short}` as the button's text and
`aria-label={l.title}` on the button. Nothing about pick3's league switcher changes, visibly or
to a screen reader. Do not pass `l.title` as `label`; that would put "Great League" on screen
where "Great" belongs.


- [ ] **Step 5: Verify**

Run: `node scripts/check-tokens.mjs && npm run lint && npm run typecheck && npm test`
Expected: PASS.
Build and serve both apps, run `npm run web:screens` and `npm run meta:screens`. Also run
`node apps/web/scripts/screens.mjs` locally with attention to any step that waits on
`[data-league="..."]`, confirming the attribute still appears with the correct value.
Expected: both league switchers render identically to the Task 8 baseline (visible text
unchanged; screen-reader name for web's switcher is now "Great"/"Ultra"/"Master" instead of
"Great League"/"Ultra League"/"Master League", noted above).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/League.tsx packages/ui/src/index.ts apps/web/src/components/LeagueSwitcher.tsx apps/meta/src/components.tsx apps/meta/src/App.tsx
git commit -m "ui: move LEAGUE_COLORS, LeagueShield, LeagueSwitcher to packages/ui"
```

---

## Task 10: `Chevron`, `Chip`, `Seg`, `Select`

**Files:**
- Create: `packages/ui/src/components/Chevron.tsx`, `packages/ui/src/components/Chip.tsx`,
  `packages/ui/src/components/Seg.tsx`, `packages/ui/src/components/Select.tsx`
- Modify: `packages/ui/src/index.ts`, `apps/web/src/components.tsx`,
  `apps/meta/src/components.tsx`

**Interfaces:**
- Produces, exported from `@pickthree/ui`:
  - `Chevron({ dir?: 'right' | 'left' | 'down' })`
  - `Chip({ on?: boolean; onClick: () => void; children: ReactNode })`
  - `Seg<T extends string>({ value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; style?: CSSProperties })`
  - `Select<T extends string>({ options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string })`

- [ ] **Step 1: Create Chevron**

Create `packages/ui/src/components/Chevron.tsx`, moved from meta's `components.tsx` (web
currently uses a left-angle-quote character `&lsaquo;` in its `Header`'s back button, replaced by
this component in Task 13):

```tsx
import type { CSSProperties } from 'react';

const CHEVRON_TURN: Record<'right' | 'left' | 'down', CSSProperties | undefined> = {
  right: undefined,
  left: { transform: 'scaleX(-1)' },
  down: { transform: 'rotate(90deg)' },
};

export function Chevron({ dir = 'right' }: { dir?: 'right' | 'left' | 'down' }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={CHEVRON_TURN[dir]}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
```

- [ ] **Step 2: Create Chip**

Create `packages/ui/src/components/Chip.tsx`, moved from web's `components.tsx` verbatim:

```tsx
import type { ReactNode } from 'react';

export function Chip({
  on,
  onClick,
  children,
}: {
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`chip${on ? ' on' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Create Seg**

Create `packages/ui/src/components/Seg.tsx`, moved from web's `components.tsx` verbatim:

```tsx
import type { CSSProperties, ReactNode } from 'react';

/** Segmented control: real buttons, so Enter and Space activate them like a tap. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  style,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  style?: CSSProperties;
}) {
  return (
    <span className="seg" role="group" style={style}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={o.value === value ? 'on' : ''}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
```

- [ ] **Step 4: Create Select**

Create `packages/ui/src/components/Select.tsx`, moved from meta's `components.tsx`:

```tsx
import { useId } from 'react';
import { Chevron } from './Chevron.tsx';

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

/** A labelled native select. The label is visible, not just aria, so a reader knows what the
 * field is a choice of before opening it. */
export function Select<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className="field-l">{label}</span>
      <span className="select-wrap">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const next = options.find((o) => o.value === e.target.value);
            if (next) {
              onChange(next.value);
            }
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Chevron dir="down" />
      </span>
    </label>
  );
}
```

- [ ] **Step 5: Export from the barrel**

In `packages/ui/src/index.ts`:

```ts
export { Chevron } from './components/Chevron.tsx';
export { Chip } from './components/Chip.tsx';
export { Seg } from './components/Seg.tsx';
export { Select } from './components/Select.tsx';
```

- [ ] **Step 6: Delete both apps' local copies**

In `apps/web/src/components.tsx`, delete `Seg` (lines 135-162) and `Chip` (lines 517-531). Add:

```ts
import { Chip, Seg } from '@pickthree/ui';
```

In `apps/meta/src/components.tsx`, delete `Chevron` (lines 443-467) and `Select` (lines
530-572). Add:

```ts
import { Chevron, Select } from '@pickthree/ui';
```

meta's `Header` (still local until Task 13) uses `Chevron` directly; keep that call site working
through this import.

- [ ] **Step 7: Verify**

Run: `node scripts/check-tokens.mjs && npm run lint && npm run typecheck && npm test`
Expected: PASS.
Build and serve both apps, run `npm run web:screens` and `npm run meta:screens`.
Expected: every segmented control, chip filter and select field renders identically to the
Task 9 baseline.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/Chevron.tsx packages/ui/src/components/Chip.tsx packages/ui/src/components/Seg.tsx packages/ui/src/components/Select.tsx packages/ui/src/index.ts apps/web/src/components.tsx apps/meta/src/components.tsx
git commit -m "ui: move Chevron, Chip, Seg, Select to packages/ui"
```

---

## Task 11: `SpeciesToken`

This is the one task with a real design decision left in it, so it gets more detail than the
others.

**The problem:** pick3 serves sprites from its own origin and toggles them off entirely via a
setting (`Settings.sprites`); meta always hotlinks `pick3.gg/data/sprites/`. The spec's props
contract, `{ name, types, src }`, settles *where the art comes from* (the caller decides `src`),
but two more decisions are not settled by that contract and were verified against the current
code rather than guessed:

1. **The broken/off fallback.** web shows an initial letter (`initialOf(name)`, stripping a
   `Shadow`/`Galarian`/`Alolan`/`Hisuian`/`Paldean` prefix first) when there is no image, unless
   the caller passes `showInitial={false}` (22 of web's ~26 call sites do; only large single-token
   contexts show the letter). meta never shows a letter; it always renders a blank colored disc.
   **Resolution:** add a fourth prop, `showInitial?: boolean` (default `false`, so meta's
   existing "never show a letter" behavior is the default and it needs zero change at any call
   site). Every web call site that wants the letter passes `showInitial`. This is a deliberate,
   documented extension of the spec's three-prop list: `showInitial` is a fallback-rendering
   choice, not an art-source choice, so it does not conflict with "the package never decides
   where art comes from."
2. **Sprite sizing and clipping.** web clips the image to the disc at `86%`/`86%` of the token
   size (scales correctly from 16px to 44px, the full range web uses). meta uses a fixed `46px`
   image with no clipping, deliberately overflowing its (always ~40px) disc by 6px, per its own
   comment. These produce different pixel output at the same token size and neither app's current
   look is specified by the spec. **Resolution: do not unify them.** The component itself
   (broken-state tracking, the two-color gradient, the initial-letter fallback) is the valuable
   thing to share; the sizing is cosmetic and app-specific. `packages/ui/base.css` gets only the
   properties genuinely common to both apps' current `.token` rule (`border-radius: 50%; display:
   grid; place-items: center; flex: none; position: relative;`); each app's `app.css` keeps its
   own `.token .sprite` sizing rule, `.token.has-sprite`/`.token.is-shadow` (web only) exactly as
   they are today. This preserves both apps' exact current pixel output for sprites (zero
   screenshot diff on this specific concern) while still deleting ~120 lines of duplicated TSX.

**Files:**
- Create: `packages/ui/src/components/SpeciesToken.tsx`
- Modify: `packages/ui/base.css`, `apps/web/src/app.css`, `apps/meta/src/app.css`,
  `packages/ui/src/index.ts`, `apps/web/src/components.tsx`, `apps/web/src/format.ts`,
  `apps/meta/src/components.tsx`, `apps/meta/src/data.ts` (no change, `SpeciesLite` stays as is)

**Interfaces:**
- Produces: `SpeciesToken({ name: string; types: readonly string[]; src?: string; size?: number;
  showInitial?: boolean })`, exported from `@pickthree/ui`.

- [ ] **Step 1: Create the shared component**

Create `packages/ui/src/components/SpeciesToken.tsx`:

```tsx
import { useState } from 'react';
import { typeColor } from '../type.ts';

/** "Shadow Dragonite" -> "D"; strips the regional/shadow prefix before taking the first letter,
 * so the fallback still distinguishes forms when a sprite is off or broken. */
function initialOf(name: string): string {
  const base = name.replace(/^(Shadow|Galarian|Alolan|Hisuian|Paldean) /, '');
  return base.charAt(0).toUpperCase();
}

/**
 * The coloured disc behind a species' sprite, split diagonally between its two types (or one
 * type twice, for a single-typed species: `types[1]` falling back to `types[0]`). `src` is the
 * only place this component learns where art comes from; the caller decides whether to point at
 * a local sprite, a hotlinked one, or omit it entirely. Each app's own app.css still owns the
 * `.token .sprite` sizing/clipping rule (see the design note in the implementation plan), so this
 * component only ever sets the `token`/`has-sprite` class names, never inline sizing for the
 * image itself.
 */
export function SpeciesToken({
  name,
  types,
  src,
  size = 44,
  showInitial = false,
}: {
  name: string;
  types: readonly string[];
  src?: string;
  size?: number;
  showInitial?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const c1 = typeColor(types[0] ?? '');
  const c2 = typeColor(types[1] ?? types[0] ?? '');
  const background =
    types[1] === undefined || types[1] === types[0]
      ? c1
      : `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)`;
  const picture = Boolean(src) && !broken;
  return (
    <span
      className={`token${picture ? ' has-sprite' : ''}`}
      role="img"
      aria-label={name}
      title={name}
      style={{ width: size, height: size, background, fontSize: Math.round(size * 0.36) }}
    >
      {picture ? (
        <img
          className="sprite"
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : showInitial ? (
        initialOf(name)
      ) : (
        ''
      )}
    </span>
  );
}
```

- [ ] **Step 2: Export from the barrel**

In `packages/ui/src/index.ts`:

```ts
export { SpeciesToken } from './components/SpeciesToken.tsx';
```

- [ ] **Step 3: Move the shared `.token` properties to base.css**

In `packages/ui/base.css`, add:

```css
.token {
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex: none;
  position: relative;
}
```

In `apps/web/src/app.css`, reduce `.token` (currently `app.css:275-283`) to only what is not now
in base:

```css
.token {
  color: rgba(255, 255, 255, 0.92);
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
```

Leave `.token.has-sprite`, `.token .sprite`, `.token.is-shadow`, `.token.is-shadow::before`,
`.token-stack`, `.token-stack .token + .token` exactly as they are (`app.css:284-319`). Delete
the second, redundant `.token { position: relative; }` rule (`app.css:296-298`), since base now
supplies `position: relative`.

In `apps/meta/src/app.css`, reduce `.token` (currently `app.css:466-473`) to:

```css
.token {
  width: 40px;
  height: 40px;
  box-shadow: inset 0 0 0 2px var(--bg);
}
```

Leave `.token .sprite` exactly as it is (`app.css:475-479`).

- [ ] **Step 4: Replace web's `PokemonToken` with a thin wrapper**

In `apps/web/src/components.tsx`, replace the `PokemonToken` function (lines 225-270) with:

```tsx
import { SpeciesToken } from '@pickthree/ui';

export function PokemonToken({
  speciesId,
  size = 44,
  showInitial = true,
  title,
}: {
  speciesId: string;
  size?: number;
  showInitial?: boolean;
  title?: string;
}) {
  const sp = useSpecies()(speciesId);
  const name = useName()(speciesId);
  const spritesOn = useAppState().settings.sprites !== false;
  const types = sp ? sp.types.filter((t) => t !== 'none') : ['normal'];
  const src = spritesOn
    ? `/data/sprites/${speciesId.replace(/_shadow$/, '')}.webp`
    : undefined;
  const shadow = speciesId.endsWith('_shadow');
  return (
    <span className={shadow ? 'token-shadow-wrap' : undefined} style={shadow ? { width: size, height: size } : undefined}>
      <SpeciesToken name={title ?? name} types={types} src={src} size={size} showInitial={showInitial} />
    </span>
  );
}
```

`PokemonToken`'s default `showInitial` stays `true` (opposite of the package's own default),
matching every existing call site that relies on the default (only the 22 sites that pass
`showInitial={false}` explicitly change nothing).

Add to `apps/web/src/app.css`, right after `.token.is-shadow::before` (the shadow glow moves out
of `.token` itself, since the package's `SpeciesToken` only ever renders `class="token"`, never
`is-shadow`; the glow becomes an outer wrapper instead):

```css
.token-shadow-wrap {
  position: relative;
  display: inline-block;
  border-radius: 50%;
  box-shadow: 0 0 10px 2px rgba(150, 80, 255, 0.55);
}
.token-shadow-wrap::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(ellipse 45% 55% at 32% 100%, rgba(190, 110, 255, 0.95), transparent 70%),
    radial-gradient(ellipse 45% 65% at 68% 100%, rgba(150, 60, 240, 0.9), transparent 70%),
    radial-gradient(ellipse 80% 60% at 50% 100%, rgba(120, 40, 220, 0.7), transparent 75%);
}
```

Delete the old `.token.is-shadow` and `.token.is-shadow::before` rules (superseded by the wrapper
above, same visual output: the glow used to sit on the token element itself, now sits on a
same-sized wrapper around it, which reads identically since the wrapper has no border or padding
of its own).

In `apps/web/src/format.ts`, delete `initialOf` (now duplicated inside `SpeciesToken`; confirm
with `grep -n "initialOf" apps/web/src -r` that `PokemonToken` was its only caller before
deleting; if `useShortName`/`useName` or anything else calls it, keep it and do not duplicate,
instead export `initialOf` from the package too and have `format.ts` re-export it).

- [ ] **Step 5: Replace meta's `Sprite` with a thin wrapper**

In `apps/meta/src/components.tsx`, replace the `Sprite` function (lines 66-104) with:

```tsx
import { SpeciesToken } from '@pickthree/ui';
import { spriteUrl } from './links.js';
import type { SpeciesLite } from './data.js';

export function Sprite({ species, size = 40 }: { species: SpeciesLite; size?: number }) {
  return <SpeciesToken name={species.name} types={species.types} src={spriteUrl(species.id)} size={size} />;
}
```

- [ ] **Step 6: Verify**

Run: `node scripts/check-tokens.mjs && npm run lint && npm run typecheck && npm test`
Expected: PASS.
Build and serve both apps, run `npm run web:screens` and `npm run meta:screens`.
Expected: every species token on every screen renders identically to the Task 10 baseline,
including: web's sprites-off setting still shows initials where it did before; web's Shadow
Pokemon still show the purple glow at the same size and position; meta's sprites still overflow
their disc by the same amount. Pay particular attention to the shadow-glow wrapper (new markup,
same visual output expected) and to `PokemonToken`'s `title` prop, which now flows into
`SpeciesToken`'s `name` prop and therefore into both the `aria-label` and the fallback initial
computation; confirm no call site relied on `title` differing from the announced name in a way
that changes the initial letter shown.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/SpeciesToken.tsx packages/ui/src/index.ts packages/ui/base.css apps/web/src/app.css apps/web/src/components.tsx apps/web/src/format.ts apps/meta/src/app.css apps/meta/src/components.tsx
git commit -m "ui: move PokemonToken/Sprite to packages/ui as SpeciesToken"
```

---

## Task 12: `theme.ts`, including the `store.tsx:627` change

**Files:**
- Create: `packages/ui/src/theme.ts`
- Delete: `apps/meta/src/theme.ts`
- Modify: `packages/ui/src/index.ts`, `apps/meta/src/App.tsx`, `apps/web/src/state/store.tsx`,
  `apps/web/src/screens/Sheet.tsx`, `apps/web/src/screens/Sheet.tsx` test files if any import the
  union type directly

**Interfaces:**
- Produces: `ThemeChoice = 'system' | 'light' | 'dark'`, `storedTheme(store?)`, `applyTheme(choice,
  root?, store?)`, `nextTheme(choice)`, all exported from `@pickthree/ui`.

**The `THEME_KEY` question, resolved:** meta's `theme.ts` persists the choice to
`localStorage` under the key `'meta.pick3.theme'`. web's theme is persisted differently (as
`state.settings.theme` in the IndexedDB `settings` store, via `storage.ts`); web's current
`store.tsx:623-631` effect only ever sets the `data-theme` DOM attribute, never touches
`localStorage`. Moving `theme.ts` as-is and having web call the shared `applyTheme` means web
gains a **new, additional** `localStorage` write on every settings load, under a key literally
named `meta.pick3.theme` inside pick3's own origin, which reads as a bug even though it is
harmless (web never calls `storedTheme()`, so nothing ever reads that key back). **Resolution:**
rename the constant to `THEME_KEY = 'pickthree.theme'` (app-neutral, since the module is now
shared) as part of this move. This changes meta's persisted `localStorage` key name, which means
any visitor with an existing manual theme choice reverts to "system" once. meta is a brand-new
site (not yet launched per the spec's own framing of this work), so this reset is low stakes;
flag it in the final summary as a spec gap (the spec does not mention this constant at all).

- [ ] **Step 1: Create the shared module**

Create `packages/ui/src/theme.ts`, moved from `apps/meta/src/theme.ts` with the one key rename:

```ts
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
```

- [ ] **Step 2: Export from the barrel**

In `packages/ui/src/index.ts`:

```ts
export { applyTheme, nextTheme, storedTheme, THEME_KEY, type ThemeChoice } from './theme.ts';
```

- [ ] **Step 3: meta switches to the shared module**

Delete `apps/meta/src/theme.ts`. In `apps/meta/src/App.tsx`, change the import at line 23:

```ts
import { applyTheme, nextTheme, storedTheme, type ThemeChoice } from '@pickthree/ui';
```

- [ ] **Step 4: web's `store.tsx` calls the shared `applyTheme`**

In `apps/web/src/state/store.tsx`, add to the imports:

```ts
import { applyTheme } from '@pickthree/ui';
```

Replace lines 623-631:

```tsx
  useEffect(() => {
    applyTheme(state.settings.theme);
  }, [state.settings.theme]);
```

This introduces the redundant-but-harmless `localStorage` write described above; note it as
intentional in the commit, not a bug to chase.

- [ ] **Step 5: `Sheet.tsx` imports the shared union type**

In `apps/web/src/screens/Sheet.tsx`, add to the imports:

```ts
import type { ThemeChoice } from '@pickthree/ui';
```

Replace line 83:

```tsx
  const themes: ThemeChoice[] = ['system', 'dark', 'light'];
```

(Keep the array's own order, `['system', 'dark', 'light']`; only the type annotation changes.
Check that `state.settings.theme`'s own type, wherever it is declared in the settings shape, is
also `ThemeChoice` from `@pickthree/ui` rather than a third inline union; if it is currently
declared as its own `'system' | 'dark' | 'light'` literal in the settings types file, switch that
declaration to `import type { ThemeChoice } from '@pickthree/ui'` too, so there is exactly one
declaration of this union left in the whole repo.)

- [ ] **Step 6: Verify**

Run: `node scripts/check-tokens.mjs && npm run lint && npm run typecheck && npm test`
Expected: PASS.
Build and serve both apps, run `npm run web:screens` and `npm run meta:screens`.
Expected: both apps' theme toggles (web's Settings sheet Seg control, meta's icon toggle) still
cycle system/dark/light correctly and both apps still restore the right theme on reload
(re-verify meta specifically, since its persisted key name changed: a manual local test setting
meta's theme to "dark", reloading, and confirming it stays dark is worth doing once by hand
alongside the screenshot run, since the screens script itself may not exercise a reload).

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/theme.ts packages/ui/src/index.ts apps/meta/src/theme.ts apps/meta/src/App.tsx apps/web/src/state/store.tsx apps/web/src/screens/Sheet.tsx
git commit -m "ui: move theme.ts to packages/ui, both apps call the shared applyTheme"
```

---

## Task 13: `HeaderShell` and both apps' `Header`

**Files:**
- Create: `packages/ui/src/components/HeaderShell.tsx`
- Modify: `packages/ui/src/index.ts`, `apps/web/src/components.tsx`,
  `apps/meta/src/components.tsx`

**Interfaces:**
- Produces: `HeaderShell({ back?: ReactNode; title: string; sub?: string; actions?: ReactNode;
  extra?: ReactNode })`, exported from `@pickthree/ui`.

- [ ] **Step 1: Create the shared shell**

Create `packages/ui/src/components/HeaderShell.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * The shell every sticky page header shares: a back slot (or spacer, so the title stays
 * centred) on the left, the title and an optional subtitle in the middle, an actions slot on the
 * right (or spacer), and an optional extra row underneath that scrolls with the header. It owns
 * layout only; each app's own Header decides what fills `back` and `actions`, and the two headers
 * stay visibly different by design (see the spec's "header split" section).
 */
export function HeaderShell({
  back,
  title,
  sub,
  actions,
  extra,
}: {
  back?: ReactNode;
  title: string;
  sub?: string;
  actions?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <header className="hdr">
      {back ?? <span className="back-spacer" />}
      <span className="hdr-title">
        <span>{title}</span>
        {sub ? <span className="hdr-sub">{sub}</span> : null}
      </span>
      {actions ? <span className="hdr-actions">{actions}</span> : <span className="back-spacer" />}
      {extra ? <div className="hdr-extra">{extra}</div> : null}
    </header>
  );
}
```

- [ ] **Step 2: Export from the barrel**

In `packages/ui/src/index.ts`:

```ts
export { HeaderShell } from './components/HeaderShell.tsx';
```

- [ ] **Step 3: web's Header becomes a wrapper**

In `apps/web/src/components.tsx`, replace the `Header` function (lines 612-655) with:

```tsx
import { HeaderShell } from '@pickthree/ui';

export function Header({
  title,
  sub,
  onBack,
  backLabel,
  cog = true,
  extra,
  action,
}: {
  title: string;
  sub?: string;
  onBack?: () => void;
  backLabel?: string;
  cog?: boolean;
  extra?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <HeaderShell
      back={
        onBack ? (
          <button type="button" className="back" onClick={onBack}>
            &lsaquo; {backLabel ?? 'Back'}
          </button>
        ) : undefined
      }
      title={title}
      sub={sub}
      actions={
        action || cog ? (
          <>
            {action}
            {cog ? <HeadCog /> : null}
          </>
        ) : undefined
      }
      extra={extra}
    />
  );
}
```

Note `.hdr-actions`'s base rule (Task 5) already supplies `display: flex; align-items: center;
gap: 4px` for web (its override), so wrapping `action`/`HeadCog` in a fragment rather than a
second `<span className="row">` is correct: `HeaderShell` itself supplies the one
`<span className="hdr-actions">` wrapper now.

- [ ] **Step 4: meta's Header becomes a wrapper**

In `apps/meta/src/components.tsx`, replace the `Header` function (lines 385-414) with:

```tsx
import { Chevron, HeaderShell } from '@pickthree/ui';

export function Header({
  title,
  sub,
  backHref,
  backLabel,
  action,
}: {
  title: string;
  sub?: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <HeaderShell
      back={
        backHref ? (
          <a className="back" href={backHref}>
            <Chevron dir="left" /> {backLabel ?? 'Back'}
          </a>
        ) : undefined
      }
      title={title}
      sub={sub}
      actions={action}
    />
  );
}
```

(`Chevron` is already imported from `@pickthree/ui` since Task 10.)

- [ ] **Step 5: Verify**

Run: `node scripts/check-tokens.mjs && npm run lint && npm run typecheck && npm test`
Expected: PASS.
Build and serve both apps, run `npm run web:screens` and `npm run meta:screens`.
Expected: every screen header on both sites renders identically to the Task 12 baseline,
including the `LogBattle`/`NewSet` screens' `cog={false}` case (no cog, no action -> spacer on
the right, same as before) and `TeamDetail`'s `extra` row (team strip under the title). Confirm
the two headers still look visibly different from each other (spec's explicit acceptance
criterion): pick3's has a button-based back control and the settings cog; meta's has an
anchor-based back control with a `Chevron` and, where present, the appearance toggle.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/HeaderShell.tsx packages/ui/src/index.ts apps/web/src/components.tsx apps/meta/src/components.tsx
git commit -m "ui: move the header shell to packages/ui, both apps keep their own Header"
```

---

## Task 14: `test/setup.ts`, both vitest configs point at the package

**Files:**
- Create: `packages/ui/src/test-setup.ts`
- Delete: `apps/web/test/setup.ts`, `apps/meta/test/setup.ts`
- Modify: `apps/web/vitest.config.ts`, `apps/meta/vitest.config.ts`

**Interfaces:** none new; this is the last of the 14 spec steps and needs no new export from the
package (the file is referenced by path, not through the barrel, since it is a Vitest setup
file, not application code).

- [ ] **Step 1: Move the shared setup file**

Both apps' `test/setup.ts` are already byte-identical (confirmed by direct diff). Create
`packages/ui/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest does not expose globals, so Testing Library cannot register its own cleanup.
afterEach(cleanup);
```

Delete `apps/web/test/setup.ts` and `apps/meta/test/setup.ts`.

- [ ] **Step 2: Point both vitest configs at it**

In `apps/web/vitest.config.ts`, change `setupFiles: ['test/setup.ts']` to:

```ts
    setupFiles: ['../../packages/ui/src/test-setup.ts'],
```

In `apps/meta/vitest.config.ts`, make the same change:

```ts
    setupFiles: ['../../packages/ui/src/test-setup.ts'],
```

`vitest`, `@testing-library/jest-dom` and `@testing-library/react` do not need to become
dependencies of `packages/ui`: npm workspaces hoist them to the root `node_modules`, and each
app's own vitest run resolves the setup file's imports by walking up from its own working
directory, exactly as it already resolves imports from `packages/engine` today.

- [ ] **Step 3: Verify**

Run: `node scripts/check-tokens.mjs && npm run lint && npm run typecheck && npm test`
Expected: PASS. Every existing test in both apps' `test/` directories still runs with the same
jsdom environment and the same Testing Library cleanup behavior.
Build and serve both apps, run `npm run web:screens` and `npm run meta:screens`.
Expected: unchanged from Task 13 (this task touches no application code, only test wiring).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/test-setup.ts apps/web/test/setup.ts apps/meta/test/setup.ts apps/web/vitest.config.ts apps/meta/vitest.config.ts
git commit -m "ui: move test/setup.ts to packages/ui, both vitest configs point at it"
```

---

## Definition of done (from the spec, verbatim as acceptance criteria)

- `packages/ui` exists and both apps depend on it. (Task 1)
- Neither app defines a type token, and `tokens.css` exists once. (Tasks 3-4)
- The 37 shared class blocks exist once, in `base.css`. (Task 5)
- No class name means two different things across the two apps: the five collisions are resolved
  by conversion, deletion or rename, never left as one name over two rules. (Task 5)
- The components in the spec's section 4 table exist once, in `packages/ui`. (Tasks 7-13)
- `check-tokens.mjs` passes and runs in CI. (Task 3, verified at the end of every later task)
- Both apps' screenshots match their baselines except for the documented token/radius/ink shifts,
  plus meta's six buttons becoming full-width blocks in Task 5. (verified at the end of every
  task from Task 3 onward, against the Task 2 baseline copies)
- The two headers still look different from each other. (Task 13, explicitly re-checked)
