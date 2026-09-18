# A shared UI package for pick3.gg and meta.pick3.gg

Date: 2026-09-18. Status: approved in chat (Travis).

## Problem

`apps/web` and `apps/meta` are two apps in one monorepo that look like the same product and
share none of the code that makes them look that way. The meta site was built by hand-porting
pick3's design language, and its own comments say so: `TypeChip` is "pick3's own chip shape and
colour rule ported byte-for-byte", `Sprite` is "matching pick3's own token", and all 18 type ink
tokens are "byte-identical to pick3's own dark-theme ink tokens". Every pick3 UI fix now has to
be re-derived in meta by hand, which is the cost Travis raised.

Measured on the tree at `742b233`:

- **72 duplicated type tokens.** 18 fills plus 54 inks, repeated across three theme blocks in
  both `tokens.css` files.
- **39 of meta's 64 CSS class names are pick3 class names, re-implemented.** `.card`, `.btn`,
  `.row`, `.tchip`, `.term`, `.hdr`, `.token`, `.team-card`, `.slots3`, and the rest. 34 are the
  same rule written twice. Five are the same name over a different rule, which is worse; section
  3 resolves those one at a time.
- **Two `components.tsx` files** (699 lines web, 652 meta) both defining `TypeChip`,
  `TypeChips`, `Term`, `Header` and `LeagueSwitcher`.
- **`Term` is character-for-character identical** in both files.
- **Four byte-identical files** in both trees: `lockup.svg`, `lockup-light.svg`, `favicon.svg`,
  `test/setup.ts`.
- **Theme logic written twice**, cleanly in `apps/meta/src/theme.ts` and inline at
  `apps/web/src/state/store.tsx:627`.

Two findings show the duplication is already failing rather than merely costing time.

**The "different palette" is not real.** meta's `tokens.css` opens with "pick3's own tokens.css
is a different palette for a different app and is not shared". Comparing the dark blocks,
`--accent` (`#9184d9`), `--bg` (`#161826`) and `--surface` (`#232532`) are byte-identical. Of the
seven tokens sharing a name only four differ, and one of those is `--surface2`: `#2c2e3d` in web
against `#2c2e3e` in meta. One hex digit. That is drift no one can see and no one can catch.

**A cross-reference has already gone stale.** meta's `SitePill` doc comment cites
"apps/web/src/components.tsx's `SitePill`". There is no `SitePill` in `apps/web`; it was renamed
to `MetaButton` in `4ea3a2f`.

`format.ts` is not part of the problem. The two files share only `shortName`, with different
signatures. The duplication is concentrated in tokens, CSS classes and about a dozen components.

## What we are not changing

The separation between the two sites is deliberate and stays. It is an information-architecture
boundary: building a team from Pokemon you own is one front door, finding suggested teams is
another, and merging them would crowd pick3's bottom tab bar. Two apps, two deploys, two
routers, cross-links where they make sense. What changes is that the boundary stops living in
the stylesheet.

The two headers also stay visibly different, by decision. See section 4.

Rejected alternatives:

- **meta imports from `apps/web` directly.** Free upfront, but `apps/web/src/components.tsx`
  imports `@pickthree/engine`, the app state store and the search index. meta would drag the
  engine and `idb` into what is today a lean read-only site. It also inverts the dependency,
  turning a leaf app into a library.
- **One app, two builds.** Zero duplication by construction, but meta inherits the engine, the
  simulator, `idb` and the workbox PWA machinery it has no use for, the deploys genuinely differ
  (Pages for pick3, wrangler `[assets]` for meta), and the IA boundary would be enforced by a
  build flag instead of by structure.

## Section 1: the package

`packages/ui`, a fourth workspace package beside `engine`, `data` and `sim-pvpoke`. It follows
`packages/engine` exactly: `"main": "./src/index.ts"`, `"types": "./src/index.ts"`, raw
TypeScript with no build step, resolved through the existing npm workspace link. `react` and
`react-dom` are peer dependencies so neither app gets a second copy. No new tooling.

```
packages/ui/
  package.json
  tsconfig.json
  tokens.css            all three theme blocks, including the 72 type tokens
  base.css              the shared class blocks
  brand/                lockup.svg, lockup-light.svg, mark.svg, Inter-600.ttf, Inter-700.ttf
  src/index.ts          barrel
  src/components/*.tsx
  src/theme.ts
  src/test-setup.ts
```

Both apps add `"@pickthree/ui": "0.0.0"` to `dependencies` and import `tokens.css` then
`base.css` before their own `app.css`.

## Section 2: the token contract

`packages/ui/tokens.css` becomes the single definition of all three theme blocks: the dark
`:root`, the explicit `[data-theme=light]` block, and the `prefers-color-scheme: light`
fallback. It carries all 72 type tokens. Both apps delete their own `tokens.css`.

Four roles have two names today. The shared file picks one name and the other is deleted, not
aliased, so there is never a second way to say the same thing.

| Role | web name | meta name | Shared name |
|---|---|---|---|
| hairline rule | `--divider` | `--border` | `--divider` |
| good result | `--win` | `--up` | `--win` |
| bad result | `--loss` | `--down` | `--loss` |
| text on solid accent | none | `--on-accent` | `--on-accent` |

`--accent-text` (web) and `--accent-hi` (meta) are different roles, not two names for one role.
Both are kept.

Where the four shared-name tokens drifted, pick3's value wins, since it is the older and more
reviewed surface. The exception is `--warn`, which is taken from meta, with a correction.

### The warn correction

meta's warn is the brighter, better-reading value, but meta has no `--warn-tint`: its warn sits
on `--bg` as a small icon. pick3's warn is text on `--warn-tint`, in four rules including
`.error`. The two tokens were tuned against different backgrounds, so taking one without the
other regresses contrast.

| Pairing | Ratio |
|---|---|
| light, web warn `#8a6a2c` on `--warn-tint` | 4.21:1 |
| light, meta warn `#b5842a` on `--warn-tint` | 2.79:1 |
| dark, web warn `#d9b384` on `--warn-tint` | 6.46:1 |
| dark, meta warn `#f2c46b` on `--warn-tint` | 7.75:1 |

Resolution:

- **Dark takes meta's `#f2c46b` unchanged.** It improves on pick3's current 6.46:1.
- **Light takes meta's hue scaled to `#886320`**, which measures 4.57:1 on the existing
  `--warn-tint` and clears the 4.5:1 threshold that pick3's own `#8a6a2c` does not.

`--warn-tint` keeps its current values in both themes.

### Radii

pick3 defines `--r-sm` through `--r-sheet`; meta defines none and hardcodes 17 `border-radius`
values. The shared tokens carry the scale, and **only the class blocks that move into
`base.css` are converted to it**. pick3's 37 other hardcoded radii stay exactly where they are.
This is deliberately not a CSS audit.

### Per-site divergence

Each app may load a short override file after the shared tokens, redefining whatever it wants.
Given the measurements above, both ship with zero overrides. The seam exists for the day one
site should genuinely look different.

## Section 3: base.css

### The rule

**One class name, one meaning, across the whole repo.** A name that means one thing in pick3 and
another in meta is worse than plain duplication: it is a false friend. Move a component between
the apps and it renders wrong, silently. Every name is either shared with one definition, or
renamed so it is not shared at all.

The first version of this spec listed 39 shared class names. That audit compared names only, not
rule bodies. A body diff found five names that pick3 and meta define differently, so the real
shared count is 37 and the five are resolved individually below.

### What moves

These 37 move out of both stylesheets into `packages/ui/base.css`. They are the shape language,
not page layout:

`.back` `.back-spacer` `.brand` `.btn` `.btn-pair` `.btn-secondary` `.card` `.cost-line`
`.field` `.hdr` `.hdr-actions` `.hdr-sub` `.hdr-title` `.head-cog` `.hero-lockup` `.league-shield`
`.league-switcher` `.only-dark` `.only-light` `.pick-move` `.pick-move-k` `.pick-move-name`
`.pick-moves` `.row` `.slot` `.slot-name` `.slots3` `.tabs` `.tchip` `.tchips` `.tchip-sm`
`.team-card` `.team-details` `.term` `.term-tip` `.term-wrap` `.token`

Where a shared class needs a local layout tweak, base owns the shared properties and the app
overrides the rest in its own `app.css`. The known case is `.hdr`: base owns the three-column
grid, the sticky positioning and the bottom border; meta re-adds `margin: 0 -16px`, `gap: 8px`
and its 10px bottom padding, because meta's page has 16px gutters and pick3's does not.

### The five collisions

meta is the side that changes. It is not released yet, so it is the cheaper surface to move, and
pick3's rules are the more reviewed ones.

**`.btn` and `.btn-secondary`: meta converts to pick3's.** pick3's `.btn` is a full-width block
(`width: 100%`, `min-height: 52px`, `--r-lg`, accent border on `--accent-tint`) and is itself the
primary style. meta's is an inline pill (`999px`, 40px, weight 700) that needs `.btn-primary` or
`.btn-secondary` layered on to mean anything. Both move to `base.css` as pick3's rules. meta has
six call sites across three files: the two `btn btn-primary` become `btn`, the four
`btn btn-secondary` stay as they are, and meta's `.btn-primary` rule is deleted. **This is a
visible change to meta**: those six buttons become full-width blocks. Accepted deliberately, on
the grounds that a button is the most visible piece of a design system and two sites that claim
to be one product should not have two of them. `.btn-pair` is already byte-identical in both and
needs nothing.

**`.stat`: dead in meta, delete it.** meta's `StatCard` has had no caller since `742b233` dropped
the stat tiles, and `.stat`, `.stat .stat-n` and `.stat .stat-l` are dead with it. The live rule
is `section > .stat-n, .card > .stat-n`, which Species.tsx uses standalone and which stays. So
this was never a collision, just leftovers. Delete `StatCard` and the three dead rules; `.stat`
stays pick3-only and does not go into `base.css`.

**`.row`: rename meta's to `.rank-row`.** This one cannot be converted. pick3's `.row` is a
generic flex utility across 16 files; meta's two uses are the ranked-list item, which needs
`display: grid` with a four-column template. Giving it pick3's `display: flex` would collapse the
ranked list. Renaming reaches the same destination: `.row` then means exactly one thing in the
repo, and pick3's rule moves to `base.css` unchanged. The rename covers seven rules in meta's
`app.css` (`.row`, `.row:last-child`, `.row .name`, `.row > .fine`, `a.row`, and the two
tap-highlight and focus-visible selector lists) and two call sites in `Overview.tsx`.

**`.app`: rename meta's to `.page`.** Both are root containers with a fixed bottom tab bar, but
they solve vertical rhythm differently: meta puts the gap in the container (`gap: 18px`, with a
comment explaining why), pick3 puts it per-screen. Converting meta would mean rebuilding its page
rhythm to adopt the weaker of the two patterns, and `.app` is a root container that no component
ever references, so the false-friend hazard does not apply to it. Rename meta's, one rule plus
its media query and one call site. Neither goes into `base.css`; they are genuinely different
containers and now have different names.

Everything else in both `app.css` files stays where it is.

## Section 4: components

**The rule that makes the package work: nothing in `packages/ui` imports `@pickthree/engine` or
an app state store.** Props only. Two consequences:

- `ui` declares its own `PokemonType` union rather than borrowing the engine's. `apps/web`
  passes engine values through; they are the same string literals.
- `SpeciesToken` takes `{ name, types, src }`, so `apps/web` can point at a local sprite and
  `apps/meta` can keep hotlinking `pick3.gg/data/sprites/`. The package never decides where art
  comes from.

### Moving to `packages/ui`

| Item | Today | Note |
|---|---|---|
| `Term` | both `components.tsx` | Character-for-character identical. Pure deletion. |
| `TypeChip`, `TypeChips` | both | meta's version, which has the unknown-type fallback. |
| `typeColor`, `typeInk` | both | meta's, same reason. |
| `LEAGUE_COLORS` | both | Already declared byte-identical in meta's comment. |
| `LeagueShield` | `apps/web/src/components/LeagueSwitcher.tsx`, meta | Pure, moves as-is. |
| `LeagueSwitcher` | both | Splits. See below: pick3's is store-coupled. |
| `SpeciesToken` | web `PokemonToken`, meta `Sprite` | New props contract, see above and below. |
| `Chevron` | meta | web uses a left-angle-quote character; it adopts the component. |
| `Chip` | web | Moves so meta can use it later. |
| `Seg` | web | Moves so meta can use it later. |
| `Select` | meta | Moves so web can use it later. |
| `theme.ts` and `ThemeChoice` | meta, plus web inline | meta's module is the shared one. |
| brand `Mark` and lockups | web `Mark`, meta inline | |
| `test/setup.ts` | both, byte-identical | Becomes `src/test-setup.ts`. |

`apps/web/src/state/store.tsx:627` stops setting `data-theme` itself and calls the package's
`applyTheme`. The `'system' | 'dark' | 'light'` union is currently declared twice, as
`ThemeChoice` in meta and inline at `apps/web/src/screens/Sheet.tsx:83`; both start importing
`ThemeChoice` from the package.

### Staying put

Engine-coupled or store-coupled, stays in `apps/web`: `MovePicker`, `ScanListPanel`,
`TrainerCounter`, `Diagnostics`, `MoveRows`, `EffectIcons`, `VerdictChip`, `FitTag`,
`StructureTag`, `HundoTag`, `RankTag`, `MetaTags`, `NoCollection`, `GLOSSARY`, `ShareButton`,
`UpdateToast`, `NoticeToast`, `OpponentCard`, `Progress`, `HeadCog`, `MetaButton`.

Data-shaped or site-specific, stays in `apps/meta`: `Bar`, `Sparkline`, `StatCard`, `Note`,
`ConfidenceTag`, `TrendTag`, `SitePill`, `ThemeIcon`. `ThemeIcon` draws meta's icon-only theme
toggle; pick3 uses a labelled `Seg` in its Settings sheet, so the control differs even though
the underlying `theme.ts` is shared.

`GLOSSARY` stays web-only because meta writes its own prose in `About.tsx`.

### Four details the first version of this spec left open

**`LeagueSwitcher` splits; it cannot move whole.** `apps/web/src/components/LeagueSwitcher.tsx`
imports `League` from the engine on line 1 and `useActions, useAppState` on line 2, so it fails
the props-only rule. The package gets a generic `LeagueSwitcher<T>` taking
`{ options, value, onChange, label, compact?, dataLeague? }`. pick3 keeps a thin local wrapper
that reads the store and renders it. `dataLeague` is a pass-through for the `data-league`
attribute pick3's screenshot automation reads.

**`LeagueSwitcher` keeps its accessible name.** pick3 shows the short league name ("Great") and
announces the full title ("Great League") through a per-option `aria-label`. A single `label`
field per option cannot carry both, and dropping one would be a regression this migration was
never asked to make. So `ChoiceOption` gets an optional `srLabel`, rendered as
`aria-label={o.srLabel}`. pick3 passes `{ value: l.id, label: l.short, srLabel: l.title }`; meta
passes no `srLabel` and gets no `aria-label`, exactly its behaviour today. Visible text is
unchanged in both apps.

**`SpeciesToken` needs a no-image fallback.** The `{ name, types, src }` contract does not say
what happens when the art fails to load. pick3 falls back to the species' initial letter at
roughly 20 call sites; meta renders the bare coloured disc. A fourth prop, `showInitial`,
defaulting to `false`, keeps both behaviours. The sprite's own sizing and clipping differ between
the apps (pick3 clips at 86%, meta overflows a fixed 46px on purpose), and that is not unified:
the component moves, the sprite CSS stays local to each app.

**`theme.ts` renames its storage key.** meta's `THEME_KEY` is `meta.pick3.theme`. Moving it
unchanged would have pick3 writing a key named after the other site. It becomes
`pickthree.theme`. Anyone who had set a theme on meta before this lands falls back to `system`
once, which is the documented behaviour when the key is absent.

### The header split

What was copied is the shell, not the content: the three-column grid, the sticky, and the
`back-spacer` trick that keeps the title centred when a slot is empty. The two headers should
stay visibly different, so the package ships the shell only.

`packages/ui` exports `HeaderShell` with `back`, `title`, `sub`, `actions` and `extra` as plain
`ReactNode` slots. It owns the layout and nothing else. Each app keeps its own `Header` on top:

- **pick3** fills `back` with a router button, and `actions` with `HeadCog` and `MetaButton`.
- **meta** fills `back` with an anchor plus `Chevron`, and `actions` with `SitePill` and the
  theme toggle.

### Brand assets

The lockups move to `packages/ui/brand/` and are referenced through Vite imports
(`import lockup from '@pickthree/ui/brand/lockup.svg'`), so Vite copies and hashes them and
neither app keeps its own copy.

`favicon.svg`, `og.png`, `apple-touch-icon.png`, `icon-192.png` and `icon-512.png` stay as
per-app `public/` files. They are referenced from `index.html` and by crawlers at fixed URLs, so
they cannot be hashed. `favicon.svg` therefore stays duplicated across the two apps. It is 490
bytes and costs nothing; forcing it through a copy script would buy less than it costs.

## Section 5: migration order

Every step leaves the tree green and shippable, so the work can stop at any commit.

Phase 1:

1. Scaffold `packages/ui` with `package.json`, `tsconfig.json` and an empty `base.css`. Add the
   dependency to both apps.
2. **Capture the baseline.** Run `npm run web:screens` and `npm run meta:screens` on the current
   commit and copy the PNGs aside. They are gitignored, so they must be copied out of the tree.
3. meta adopts the shared `tokens.css` and deletes its own. Rename `--border` to `--divider` and
   `--up`/`--down` to `--win`/`--loss` throughout `apps/meta/src/app.css`.
4. web adopts the shared `tokens.css` and deletes its own.
5. The 37 class blocks move to `base.css` and out of both `app.css` files, with radii inside
   them converted to `--r-*`. meta re-adds its `.hdr` overrides. The five collisions are
   resolved in the same step: meta's buttons convert to pick3's and `.btn-primary` goes, meta's
   dead `.stat` rules and `StatCard` are deleted, meta's `.row` becomes `.rank-row` and its
   `.app` becomes `.page`.
6. Lockups move to Vite imports from `@pickthree/ui/brand`.

Phase 2, one commit per group, with both screens jobs re-run after each:

7. `Term`.
8. `TypeChip`, `TypeChips`, `typeColor`, `typeInk`.
9. `LEAGUE_COLORS`, `LeagueShield`, `LeagueSwitcher`.
10. `Chevron`, `Chip`, `Seg`, `Select`.
11. `SpeciesToken`.
12. `theme.ts`, including the `store.tsx:627` change.
13. `HeaderShell` and both apps' `Header`.
14. `test/setup.ts`, with both vitest configs pointed at the package.

## Section 6: verification and risk

Per step: `npm run lint`, `npm run typecheck`, `npm test`, then `npm run web:screens` and
`npm run meta:screens` against `npx vite preview` for each app.

**The real risk is that none of that catches a CSS regression.** `typecheck` and vitest cannot
see a wrong colour, and CI's screens jobs only fail on console errors; the PNGs are artifacts,
not assertions. What covers it is the existing harness: 28 web screenshots and 10 meta
screenshots, both themes included (`07-teams-light`). The gate is a before-and-after eyeball of
the baseline pairs after each step, and it is a manual gate. Automating it with `pixelmatch` as
a pinned devDependency and a threshold is a reasonable follow-up and is out of scope here.

**Expected changes that are not bugs.** When meta adopts pick3's values, `--muted`, `--text` and
`--surface2` shift by a hair, and the light and dark warn both change. The meta screenshots will
differ. That is the drift being corrected. meta's six buttons also become full-width blocks in
step 5, which is a larger and fully intended change.

**Travis approved meta's visual change up front and reviews it at deploy, not mid-migration**, so
steps 3 through 6 need no sign-off gate for the meta screenshots moving. A pick3 screenshot
moving is still a regression until proven otherwise.

**One guard is in scope.** The token renames in step 3 are a find-and-replace with no type
safety behind them, and an undefined CSS custom property fails silently at runtime. A small node
script (`scripts/check-tokens.mjs`, roughly 20 lines, no new dependency) scans every `var(--x)`
reference in `base.css` and both `app.css` files and exits non-zero if the name is not defined in
`tokens.css`. It runs in `ci.yml` beside lint. It catches exactly the failure this migration can
introduce, and keeps paying afterward.

## Definition of done

- `packages/ui` exists and both apps depend on it.
- Neither app defines a type token, and `tokens.css` exists once.
- The 37 shared class blocks exist once, in `base.css`.
- No class name means two different things across the two apps.
- The components in the section 4 table exist once, in `packages/ui`.
- `check-tokens.mjs` passes and runs in CI.
- Both apps' screenshots match their baselines except for the documented token shifts.
- The two headers still look different from each other.
