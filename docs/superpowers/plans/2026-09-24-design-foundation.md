# Design Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `packages/ui` the tokens, shared components, component gallery and audit tooling
that every later page redesign in pick3 and meta.pick3.gg is built from and checked against.

**Architecture:** Everything new lives in `packages/ui` (props only, no engine, no app store),
styled in `packages/ui/base.css` under `ui-` class names so nothing collides with the apps'
existing classes. A dev-only Vite page (`packages/ui/gallery`) renders every component in every
state; a shared puppeteer helper (`scripts/audit.mjs`) checks overflow, tap targets, contrast and
copy on the gallery and, in audit mode, on the two apps' existing capture scripts. No page is
redesigned in this piece.

**Tech Stack:** React 19, TypeScript 5.9 strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), Vite 8, vitest 4 + jsdom + Testing Library, puppeteer-core,
axe-core (new, dev only).

**Spec:** `docs/superpowers/specs/2026-09-24-design-foundation-design.md`. Per-page decisions:
`docs/design/inventory/2026-09-23-design-intake.md`.

## Global Constraints

- Exact pinned versions in every package.json. No `^` or `~` (`npm i -D -E`).
- Braces on all control flow, even one-line bodies (eslint `curly: all`).
- No em dashes anywhere: code, CSS comments, docs, commits, UI copy.
- "Pokémon" with the accent in all UI copy on both sites.
- Nothing in `packages/ui` imports `@pickthree/engine` or an app store. Props only.
- Every new CSS rule in `packages/ui/base.css` uses tokens only: no hex, `rgb()`, `hsl()`.
- Every color token has a dark value and a light value (both light blocks).
- New class names start with `ui-`. Existing class names (`.chip`, `.btn`, `.league-switcher`,
  `.back`, `.back-spacer`, `.term`, `.tchip`) keep their meaning.
- Touch targets at least 44px (`var(--tap)`).
- Stage explicit paths when committing, never `git add -A`. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Run from the repo root unless a step says otherwise. Windows, Git Bash.

## Review Focus

1. **Closing a sheet from a pushed page.** Escape, the overlay or Done at depth 2 must close the
   whole sheet once and return focus to the control that opened it. Pinned in Task 8.
2. **A double tap on Undo.** A toast action tapped twice (or tapped as the timer fires) must run
   its action once. Pinned in Task 9.
3. **An accidental Enter on a destructive confirm.** The confirm sheet must open with focus on
   Cancel, so Enter never destroys data. Pinned in Task 9.
4. **Progress past the goal, or a zero goal.** 27 of 15, 0 of 0 and a negative count must give a
   bar between 0 and 100, never NaN. Pinned in Task 6.
5. **Long labels at 390px.** Long chip, tag, button and league labels ("Build from your
   Rookidee", four leagues plus the overflow) must wrap or fit, never push the page sideways.
   Pinned by the gallery's long-text states (Task 11) and the overflow check (Task 12).

---

### Task 1: Test harness and tokens

**Files:**
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/ui/test/tokens.test.ts`
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/tokens.css`
- Modify: `apps/web/src/app.css` (the landing's `--tally` definitions, around lines 615, 704, 723)

**Interfaces:**
- Produces (tokens, all in `packages/ui/tokens.css`): theme-dependent `--measured`, `--tanked`,
  `--danger`, `--danger-tint`, `--canvas-atmos`; theme-constant `--r-control`, `--r-card`,
  `--fs-page`, `--fs-section`, `--fs-body`, `--fs-support`, `--fs-label`, `--gutter`,
  `--gutter-dense`, `--space`, `--tap`. A `ui` vitest project that later tasks add tests to.

- [ ] **Step 1: Add the test harness**

Add devDependencies to `packages/ui/package.json` (same versions the apps pin), plus a test
script:

```json
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.1",
    "@vitejs/plugin-react": "6.1.1",
    "jsdom": "27.4.0",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "vite": "8.2.2"
  },
```

Keep the existing `peerDependencies` block. Then run `npm install` from the repo root.

Create `packages/ui/vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'ui',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

- [ ] **Step 2: Write the failing token test**

Create `packages/ui/test/tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Normalised: a Windows checkout may have CRLF line endings.
const css = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8').replace(/
/g, '
');

/** The body of the rule block whose selector text starts at `selector`, braces matched. */
function block(selector: string): string {
  const at = css.indexOf(selector);
  if (at === -1) {
    throw new Error(`no block ${selector}`);
  }
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') {
      depth += 1;
    } else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, i);
      }
    }
  }
  throw new Error(`unclosed block ${selector}`);
}

function names(body: string): Set<string> {
  return new Set([...body.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1] ?? ''));
}

const dark = names(block(":root,\n:root[data-theme='dark'] {"));
const lightMedia = names(block(":root:not([data-theme='dark']) {"));
const lightAttr = names(block(":root[data-theme='light'] {"));
const all = names(css);

describe('tokens.css', () => {
  it('gives every dark token a light value in both light blocks', () => {
    const missing = [...dark].filter((n) => !lightMedia.has(n) || !lightAttr.has(n));
    expect(missing).toEqual([]);
  });

  it('keeps the two light blocks identical in what they define', () => {
    expect([...lightMedia].sort()).toEqual([...lightAttr].sort());
  });

  it('defines the foundation tokens', () => {
    const wanted = [
      'measured',
      'tanked',
      'danger',
      'danger-tint',
      'canvas-atmos',
      'r-control',
      'r-card',
      'fs-page',
      'fs-section',
      'fs-body',
      'fs-support',
      'fs-label',
      'gutter',
      'gutter-dense',
      'space',
      'tap',
    ];
    expect(wanted.filter((n) => !all.has(n))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run --project ui`
Expected: FAIL. The first test lists `font`, `r-sm`, `r-md`, `r-lg`, `r-xl`, `r-sheet` (theme
constants that sit in the dark block without light values); the third lists every new token.

- [ ] **Step 4: Move the theme constants and add the tokens**

In `packages/ui/tokens.css`:

1. Delete these lines from the first block (`:root, :root[data-theme='dark']`):
   ```css
   --font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
   --r-sm: 6px;
   --r-md: 8px;
   --r-lg: 12px;
   --r-xl: 14px;
   --r-sheet: 20px;
   ```
2. Add to the end of the first block (before its closing `}`):
   ```css
   --measured: #f9598c;
   --tanked: #a3a7bb;
   --danger: #f07178;
   --danger-tint: rgba(240, 113, 120, 0.16);
   --canvas-atmos: radial-gradient(120% 60% at 50% 0%, rgba(124, 94, 219, 0.22), transparent 70%);
   ```
3. Add to the end of BOTH light blocks (`:root:not([data-theme='dark'])` inside the media query,
   and `:root[data-theme='light']`):
   ```css
   --measured: #c81f5f;
   --tanked: #5f6374;
   --danger: #c8323b;
   --danger-tint: rgba(200, 50, 59, 0.12);
   --canvas-atmos: radial-gradient(120% 60% at 50% 0%, rgba(121, 108, 191, 0.16), transparent 70%);
   ```
4. Add to the start of the last `:root { ... }` block (the one headed "Type colors are constant
   across themes."), above `--type-normal`:
   ```css
   /* Theme constants: shape, type scale, spacing. */
   --font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
   --r-sm: 6px;
   --r-md: 8px;
   --r-lg: 12px;
   --r-xl: 14px;
   --r-sheet: 20px;
   --r-control: 12px;
   --r-card: 16px;
   --fs-page: 24px;
   --fs-section: 17px;
   --fs-body: 15px;
   --fs-support: 13px;
   --fs-label: 11px;
   --gutter: 20px;
   --gutter-dense: 16px;
   --space: 8px;
   --tap: 44px;
   ```

If the first test still lists other names after this, they are further theme constants in the
dark block: move each to the constant block the same way.

- [ ] **Step 5: Point the landing's pink at the token**

In `apps/web/src/app.css`, the `.landing` rule defines `--tally: #f9598c;` (about line 615) and
two light overrides define `--tally: #c81f5f;` (about lines 704 and 723). Replace the first with
`--tally: var(--measured);` and delete the two light `--tally` lines (the token now carries the
light value). Leave every `color: var(--tally)` use as it is.

- [ ] **Step 6: Run the checks**

Run: `npx vitest run --project ui && npm run check-tokens`
Expected: PASS, and check-tokens prints nothing.

- [ ] **Step 7: Commit**

```bash
git add package-lock.json packages/ui/package.json packages/ui/vitest.config.ts packages/ui/test/tokens.test.ts packages/ui/tokens.css apps/web/src/app.css
git commit -m "UI: foundation tokens (measured, outcome, danger, type scale, spacing) and a ui test project"
```

---

### Task 2: Color-literal check

**Files:**
- Create: `scripts/color-literals.mjs`
- Create: `scripts/color-literal-baseline.json` (generated)
- Create: `packages/ui/test/colorLiterals.test.ts`
- Modify: `package.json` (root, a `check-colors` script)

**Interfaces:**
- Produces: `collectLiterals(): Record<string, Record<string, number>>` exported from
  `scripts/color-literals.mjs`, keyed by repo-relative file then literal. Later pieces delete
  entries from the baseline as they clean pages up.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/test/colorLiterals.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectLiterals } from '../../../scripts/color-literals.mjs';

const baseline = JSON.parse(
  readFileSync(new URL('../../../scripts/color-literal-baseline.json', import.meta.url), 'utf8'),
) as Record<string, Record<string, number>>;

describe('color literals outside tokens.css', () => {
  it('match the baseline exactly (the baseline may only shrink)', () => {
    expect(collectLiterals()).toEqual(baseline);
  });

  it('never appear in packages/ui/base.css', () => {
    expect(collectLiterals()['packages/ui/base.css'] ?? {}).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --project ui colorLiterals`
Expected: FAIL, cannot resolve `scripts/color-literals.mjs`.

- [ ] **Step 3: Write the script**

Create `scripts/color-literals.mjs`:

```js
#!/usr/bin/env node
/**
 * Counts color literals (hex, rgb(), rgba(), hsl(), hsla()) in the stylesheets outside
 * packages/ui/tokens.css. New CSS must use tokens; the baseline lists the literals that predate
 * the design foundation, and each page redesign deletes the ones it removes. The baseline may
 * only shrink.
 *
 *   node scripts/color-literals.mjs          compare with the baseline, exit 1 on a difference
 *   node scripts/color-literals.mjs --write  rewrite the baseline from the current files
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['apps/web/src/app.css', 'apps/meta/src/app.css', 'packages/ui/base.css'];
const BASELINE = path.join(root, 'scripts', 'color-literal-baseline.json');
const LITERAL = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)/g;

export function collectLiterals() {
  const out = {};
  for (const rel of FILES) {
    const text = readFileSync(path.join(root, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const counts = {};
    for (const m of text.matchAll(LITERAL)) {
      counts[m[0]] = (counts[m[0]] ?? 0) + 1;
    }
    if (Object.keys(counts).length > 0) {
      out[rel] = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const now = collectLiterals();
  if (process.argv.includes('--write')) {
    writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
    console.log(`wrote ${path.relative(root, BASELINE)}`);
  } else {
    const was = JSON.parse(readFileSync(BASELINE, 'utf8'));
    if (JSON.stringify(now) !== JSON.stringify(was)) {
      console.error('color literals changed; use tokens, or rewrite the baseline if one was removed');
      process.exit(1);
    }
  }
}
```

Add to the root `package.json` scripts, after `check-tokens`:

```json
    "check-colors": "node scripts/color-literals.mjs",
```

- [ ] **Step 4: Generate the baseline and run the test**

Run: `node scripts/color-literals.mjs --write && npx vitest run --project ui colorLiterals`
Expected: the baseline lists `apps/web/src/app.css` and `apps/meta/src/app.css` entries and no
`packages/ui/base.css` key; the test PASSES.

- [ ] **Step 5: Commit**

```bash
git add scripts/color-literals.mjs scripts/color-literal-baseline.json packages/ui/test/colorLiterals.test.ts package.json
git commit -m "Tooling: color-literal check with a shrink-only baseline"
```

---

### Task 3: Button and IconButton

**Files:**
- Create: `packages/ui/src/components/Button.tsx`
- Create: `packages/ui/src/components/IconButton.tsx`
- Create: `packages/ui/test/Button.test.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/base.css` (append a "Foundation" section)

**Interfaces:**
- Produces: `Button({ variant?: 'primary' | 'secondary' | 'text' | 'danger'; children; onClick?; href?; type?: 'button' | 'submit'; disabled? })`, `ButtonVariant`;
  `IconButton({ label: string; children; onClick?; href?; active? })`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/Button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from '../src/index.ts';

describe('Button', () => {
  it('renders each variant as a button with its class', () => {
    for (const variant of ['primary', 'secondary', 'text', 'danger'] as const) {
      const { unmount } = render(<Button variant={variant}>Go</Button>);
      expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(`ui-btn-${variant}`);
      unmount();
    }
  });

  it('calls onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Log a battle</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Log a battle' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a link when given an href', () => {
    render(<Button href="https://meta.pick3.gg">Open meta</Button>);
    expect(screen.getByRole('link', { name: 'Open meta' })).toHaveAttribute(
      'href',
      'https://meta.pick3.gg',
    );
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Analyze
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('takes its accessible name from label', () => {
    render(
      <IconButton label="Settings" onClick={() => undefined}>
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveClass('ui-icon-btn');
  });

  it('marks the active state', () => {
    render(
      <IconButton label="Filters" onClick={() => undefined} active>
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveClass('active');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --project ui Button`
Expected: FAIL, `Button` is not exported.

- [ ] **Step 3: Implement**

Create `packages/ui/src/components/Button.tsx`:

```tsx
import type { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

/**
 * The action hierarchy: primary (filled, at most one per screen), secondary (outlined), text (a
 * plain violet link style) and danger (only for actions that destroy data). An `href` renders a
 * link with the same look, for actions that leave the app.
 */
export function Button({
  variant = 'secondary',
  children,
  onClick,
  href,
  type = 'button',
  disabled,
}: {
  variant?: ButtonVariant;
  children: ReactNode;
  onClick?: (() => void) | undefined;
  href?: string | undefined;
  type?: 'button' | 'submit';
  disabled?: boolean | undefined;
}) {
  const className = `ui-btn ui-btn-${variant}`;
  if (href !== undefined) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
```

Create `packages/ui/src/components/IconButton.tsx`:

```tsx
import type { ReactNode } from 'react';

/** The one shape for header and toolbar icons (settings, share, the meta link, filters). The
 * label is required: it is the accessible name and the tooltip. `active` shows a dot, for a
 * control whose state is on (filters applied). */
export function IconButton({
  label,
  children,
  onClick,
  href,
  active,
}: {
  label: string;
  children: ReactNode;
  onClick?: (() => void) | undefined;
  href?: string | undefined;
  active?: boolean | undefined;
}) {
  const className = `ui-icon-btn${active ? ' active' : ''}`;
  if (href !== undefined) {
    return (
      <a className={className} href={href} aria-label={label} title={label}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={className} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}
```

Add to `packages/ui/src/index.ts`:

```ts
export { Button, type ButtonVariant } from './components/Button.tsx';
export { IconButton } from './components/IconButton.tsx';
```

Append to `packages/ui/base.css`:

```css

/* Foundation (docs/superpowers/specs/2026-09-24-design-foundation-design.md). Every rule below
   uses tokens only, and every class starts with ui- so nothing collides with the apps' own. */

/* Buttons: primary, secondary, text, danger. */
.ui-btn {
  min-height: var(--tap);
  padding: 0 18px;
  border-radius: var(--r-control);
  border: 1px solid transparent;
  font: inherit;
  font-size: var(--fs-body);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space);
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  max-width: 100%;
}
.ui-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.ui-btn:focus-visible,
.ui-icon-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.ui-btn-primary {
  background: linear-gradient(135deg, var(--accent-hi), var(--accent));
  color: var(--on-accent);
}
.ui-btn-secondary {
  background: var(--accent-tint);
  border-color: var(--accent);
  color: var(--accent-text);
}
.ui-btn-text {
  background: transparent;
  color: var(--accent-text);
  padding: 0 8px;
}
.ui-btn-danger {
  background: var(--danger-tint);
  border-color: var(--danger);
  color: var(--danger);
}

/* Icon buttons: one shape everywhere. */
.ui-icon-btn {
  position: relative;
  width: var(--tap);
  height: var(--tap);
  flex: none;
  border-radius: var(--r-control);
  border: 1px solid var(--divider);
  background: var(--surface);
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.ui-icon-btn svg {
  width: 20px;
  height: 20px;
}
.ui-icon-btn.active::after {
  content: '';
  position: absolute;
  top: 7px;
  right: 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run --project ui && npm run check-colors && npm run check-tokens`
Expected: PASS, no output from the two checks.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Button.tsx packages/ui/src/components/IconButton.tsx packages/ui/test/Button.test.tsx packages/ui/src/index.ts packages/ui/base.css
git commit -m "UI: Button hierarchy and one IconButton shape"
```

---

### Task 4: Chip at 44px, Tag, and Term as an inline control

**Files:**
- Modify: `packages/ui/src/components/Chip.tsx`
- Modify: `packages/ui/src/components/Term.tsx`
- Create: `packages/ui/src/components/Tag.tsx`
- Create: `packages/ui/test/ChipTag.test.tsx`
- Modify: `packages/ui/src/index.ts`, `packages/ui/base.css`
- Modify: `apps/web/src/app.css` (delete `.chip` and `.chip.on`, about lines 339 to 354)
- Modify: `apps/meta/src/app.css` (delete `.chip` and `.chip.on`, about lines 649 to 668)

**Interfaces:**
- Produces: `Chip({ on?, onClick, children })` now sets `aria-pressed` when `on` is given;
  `Tag({ tone?: TagTone; children })`, `TagTone = 'neutral' | 'accent' | 'win' | 'loss' | 'tanked' | 'warn'`.
  `TypeChip` is unchanged and remains the type tag. `Term`'s button carries
  `data-inline-control`, which the audit (Task 12) exempts from the 44px rule.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/ChipTag.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip, Tag, Term } from '../src/index.ts';

describe('Chip', () => {
  it('reports its pressed state when it has one', () => {
    render(
      <Chip on onClick={() => undefined}>
        You own
      </Chip>,
    );
    expect(screen.getByRole('button', { name: 'You own' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no pressed state when used as a plain action', () => {
    render(<Chip onClick={() => undefined}>Exclude</Chip>);
    expect(screen.getByRole('button', { name: 'Exclude' })).not.toHaveAttribute('aria-pressed');
  });
});

describe('Tag', () => {
  it('is read-only text: no button, not focusable', () => {
    render(<Tag tone="win">Worth building</Tag>);
    const tag = screen.getByText('Worth building');
    expect(tag.tagName).toBe('SPAN');
    expect(tag).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('button')).toBeNull();
    expect(tag).toHaveClass('ui-tag', 'ui-tag-win');
  });

  it('defaults to neutral', () => {
    render(<Tag>Shadow</Tag>);
    expect(screen.getByText('Shadow')).toHaveClass('ui-tag-neutral');
  });
});

describe('Term', () => {
  it('marks itself as an inline text control', () => {
    render(<Term term="ABB line">A team built so the back line beats the lead's counters.</Term>);
    expect(screen.getByRole('button', { name: 'ABB line' })).toHaveAttribute('data-inline-control');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --project ui ChipTag`
Expected: FAIL (`Tag` not exported; Chip has no `aria-pressed`; Term has no marker).

- [ ] **Step 3: Implement**

Replace `packages/ui/src/components/Chip.tsx`:

```tsx
import type { ReactNode } from 'react';

/** A tappable filter pill, 44px tall. `on` makes it a toggle and reports aria-pressed; leave it
 * out for a chip that is a plain action. Chips are tapped; for read-only labels use Tag. */
export function Chip({
  on,
  onClick,
  children,
}: {
  on?: boolean | undefined;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`chip${on ? ' on' : ''}`}
      aria-pressed={on === undefined ? undefined : on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
```

Create `packages/ui/src/components/Tag.tsx`:

```tsx
import type { ReactNode } from 'react';

export type TagTone = 'neutral' | 'accent' | 'win' | 'loss' | 'tanked' | 'warn';

/** A read-only label: fit, verdict, rank, outcome, "yours", "few", "Shadow". Never tappable and
 * never styled like a button. Types use TypeChip, which is the type tag. Pink is never a tag
 * color: measured numbers use MeasuredValue. */
export function Tag({ tone = 'neutral', children }: { tone?: TagTone; children: ReactNode }) {
  return <span className={`ui-tag ui-tag-${tone}`}>{children}</span>;
}
```

In `packages/ui/src/components/Term.tsx`, add `data-inline-control=""` to the `<button>`:

```tsx
      <button
        type="button"
        className="term"
        data-inline-control=""
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
```

Add to `packages/ui/src/index.ts`:

```ts
export { Tag, type TagTone } from './components/Tag.tsx';
```

Delete the `.chip { ... }` and `.chip.on { ... }` rules from `apps/web/src/app.css` and from
`apps/meta/src/app.css` (keep `.chips` and `.chips.tight` in web). Append to
`packages/ui/base.css`:

```css

/* Chips: tappable filter pills (Tier 1 now; were two copies in the apps). */
.chip {
  flex: none;
  min-height: var(--tap);
  min-width: var(--tap);
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--divider);
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 500;
  font-size: var(--fs-support);
  white-space: nowrap;
}
.chip.on {
  border-color: var(--accent);
  background: var(--accent-tint);
  color: var(--accent-text);
}
.chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Tags: read-only labels, compact, never button-like. */
.ui-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: var(--fs-label);
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.3;
  white-space: nowrap;
  vertical-align: middle;
  background: var(--surface2);
  color: var(--muted);
}
.ui-tag-accent {
  background: var(--accent-tint);
  color: var(--accent-text);
}
.ui-tag-win {
  background: color-mix(in srgb, var(--win) 16%, transparent);
  color: var(--win);
}
.ui-tag-loss {
  background: color-mix(in srgb, var(--loss) 16%, transparent);
  color: var(--loss);
}
.ui-tag-tanked {
  background: var(--surface2);
  color: var(--tanked);
}
.ui-tag-warn {
  background: var(--warn-tint);
  color: var(--warn);
}
```

`.chips.tight .chip { padding: 0 11px; }` in web's app.css keeps working. The chip row
itself is removed page by page in later pieces.

- [ ] **Step 4: Run the whole suite**

Run: `npm test && npm run check-colors && npm run check-tokens`
Expected: PASS. The color check fails only if the deleted chip rules held literals, in which case
run `node scripts/color-literals.mjs --write` (the baseline shrinks) and re-run.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Chip.tsx packages/ui/src/components/Tag.tsx packages/ui/src/components/Term.tsx packages/ui/test/ChipTag.test.tsx packages/ui/src/index.ts packages/ui/base.css apps/web/src/app.css apps/meta/src/app.css scripts/color-literal-baseline.json
git commit -m "UI: chips at 44px in one shared rule, read-only Tag, Term marked as inline"
```

---

### Task 5: Labeled Select, LeagueSwitcher at 44px with overflow, FilterButton

**Files:**
- Modify: `packages/ui/src/components/Select.tsx`
- Modify: `packages/ui/src/components/League.tsx`
- Create: `packages/ui/src/components/FilterButton.tsx`
- Create: `packages/ui/test/Controls.test.tsx`
- Modify: `packages/ui/src/index.ts`, `packages/ui/base.css`
- Modify: `apps/meta/src/App.tsx` (lines 518 to 530, drop `hideLabel`)
- Modify: `apps/meta/test/app.test.tsx` (the "keeps the filter label ... off the screen" test)

**Interfaces:**
- Produces: `Select({ options, value, onChange, label })` (no `hideLabel`);
  `LeagueSwitcher({ ..., more?: { label: string; onClick: () => void } })`;
  `FilterButton({ count: number; onClick: () => void; label?: string })`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/Controls.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterButton, LeagueSwitcher, Select } from '../src/index.ts';

describe('Select', () => {
  it('always prints its label', () => {
    render(
      <Select
        label="Window"
        value="meta"
        onChange={() => undefined}
        options={[
          { value: 'meta', label: 'This meta' },
          { value: '7', label: '7 days' },
        ]}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Window' });
    const caption = select.closest('.field')?.querySelector('.field-l');
    expect(caption?.textContent).toBe('Window');
    expect(caption).not.toHaveClass('vh');
  });
});

describe('LeagueSwitcher', () => {
  const options = [
    { value: 'great', label: 'Great' },
    { value: 'ultra', label: 'Ultra' },
    { value: 'master', label: 'Master' },
  ];

  it('renders no overflow control unless asked', () => {
    render(<LeagueSwitcher label="League" value="great" onChange={() => undefined} options={options} />);
    expect(screen.queryByRole('button', { name: 'More leagues and cups' })).toBeNull();
  });

  it('adds an overflow control outside the radio group', async () => {
    const onMore = vi.fn();
    render(
      <LeagueSwitcher
        label="League"
        value="great"
        onChange={() => undefined}
        options={options}
        more={{ label: 'More leagues and cups', onClick: onMore }}
      />,
    );
    const more = screen.getByRole('button', { name: 'More leagues and cups' });
    expect(screen.getByRole('radiogroup', { name: 'League' })).not.toContainElement(more);
    await userEvent.click(more);
    expect(onMore).toHaveBeenCalledTimes(1);
  });
});

describe('FilterButton', () => {
  it('names the count for a screen reader', () => {
    render(<FilterButton count={2} onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Filters, 2 on' })).toHaveClass('on');
  });

  it('says only Filters when none are on', () => {
    render(<FilterButton count={0} onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Filters' })).not.toHaveClass('on');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --project ui Controls`
Expected: FAIL (`FilterButton` not exported; `more` not a prop).

- [ ] **Step 3: Implement**

In `packages/ui/src/components/Select.tsx`: delete the `hideLabel` prop, its default and its
type, render the caption as `<span className="field-l">{label}</span>`, and replace the doc
comment with:

```tsx
/** A labelled native select. The label is always visible, so a reader knows what the field is a
 * choice of before opening it ("Window", "Source"). */
```

In `packages/ui/src/components/League.tsx`, add the `more` prop to `LeagueSwitcher` and wrap the
radiogroup only when it is present, so today's DOM is unchanged without it:

```tsx
export function LeagueSwitcher<T extends string>({
  options,
  value,
  onChange,
  label,
  compact,
  dataLeague,
  more,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  compact?: boolean;
  dataLeague?: string;
  /** An overflow segment after the leagues ("..."), for more leagues and cups. The app decides
   * what it opens. It sits outside the radio group: it is an action, not a choice. */
  more?: { label: string; onClick: () => void } | undefined;
}) {
  const group = (
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
  if (!more) {
    return group;
  }
  return (
    <div className="league-row">
      {group}
      <button
        type="button"
        className="league-more"
        aria-label={more.label}
        aria-haspopup="dialog"
        onClick={more.onClick}
      >
        <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
```

Create `packages/ui/src/components/FilterButton.tsx`:

```tsx
/** "Filters" with a count of the filters that are on. It opens the screen's own filter sheet,
 * which the app renders; the button only reports and requests. */
export function FilterButton({
  count,
  onClick,
  label = 'Filters',
}: {
  count: number;
  onClick: () => void;
  label?: string;
}) {
  const on = count > 0;
  return (
    <button
      type="button"
      className={`ui-filter-btn${on ? ' on' : ''}`}
      aria-haspopup="dialog"
      aria-label={on ? `${label}, ${count} on` : label}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        width={18}
        height={18}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
        <circle cx="15" cy="6" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
      <span>{label}</span>
      {on ? (
        <span className="ui-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  );
}
```

Add to `packages/ui/src/index.ts`:

```ts
export { FilterButton } from './components/FilterButton.tsx';
```

Append to `packages/ui/base.css`:

```css

/* League switcher: 44px segments, and the optional overflow segment. */
.league-switcher button {
  min-height: var(--tap);
}
/* Selects: a 44px target wherever they sit; each app still styles the rest. */
.field select {
  min-height: var(--tap);
}
.league-row {
  display: flex;
  min-width: 0;
}
.league-row .league-switcher {
  flex: 1;
  min-width: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.league-more {
  flex: none;
  width: var(--tap);
  min-height: var(--tap);
  border: 1px solid var(--divider);
  border-left: 0;
  border-radius: 0 var(--r-md) var(--r-md) 0;
  background: transparent;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.league-more:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* Filter button. */
.ui-filter-btn {
  min-height: var(--tap);
  padding: 0 14px;
  border-radius: var(--r-control);
  border: 1px solid var(--divider);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: var(--fs-support);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: var(--space);
  flex: none;
  cursor: pointer;
}
.ui-filter-btn.on {
  border-color: var(--accent);
  color: var(--accent-text);
}
.ui-filter-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.ui-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--accent-tint2);
  color: var(--accent-text);
  font-size: var(--fs-label);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

In `apps/meta/src/App.tsx`, delete both `hideLabel` lines (the Window and Source selects, lines
520 and 527). In `apps/meta/test/app.test.tsx`, replace the test titled "keeps the filter label
for a screen reader and off the screen" (and the comment above it) with:

```tsx
  // The filter captions are printed: "This meta" and "All" alone did not say they choose a
  // window and a source (design foundation, 2026-09-24).
  it('prints the filter label above the select', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    const select = await screen.findByRole('combobox', { name: 'Window' });
    const caption = select.closest('.field')?.querySelector('.field-l');
    expect(caption?.textContent).toBe('Window');
    expect(caption?.classList.contains('vh')).toBe(false);
  });
```

- [ ] **Step 4: Run the suite and typecheck**

Run: `npm test && npm run typecheck && npm run check-colors`
Expected: PASS. If typecheck reports another `hideLabel` caller, delete the prop there too.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Select.tsx packages/ui/src/components/League.tsx packages/ui/src/components/FilterButton.tsx packages/ui/test/Controls.test.tsx packages/ui/src/index.ts packages/ui/base.css apps/meta/src/App.tsx apps/meta/test/app.test.tsx
git commit -m "UI: selects always labeled, 44px league segments with an overflow, FilterButton"
```

---

### Task 6: MeasuredValue, MeasuredLine and ProgressCard

**Files:**
- Create: `packages/ui/src/components/Measured.tsx`
- Create: `packages/ui/src/components/ProgressCard.tsx`
- Create: `packages/ui/test/Measured.test.tsx`
- Modify: `packages/ui/src/index.ts`, `packages/ui/base.css`

**Interfaces:**
- Produces: `MeasuredValue({ value: string; unit?: string })`, `MeasuredLine({ children })`,
  `ProgressCard({ title: string; done: number; goal: number; line: string; contribution?: ReactNode })`,
  and `progressPercent(done: number, goal: number): number` (0 to 100, exported for tests).

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/Measured.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MeasuredLine, MeasuredValue, ProgressCard, progressPercent } from '../src/index.ts';

describe('MeasuredValue', () => {
  it('prints the number beside the bar mark', () => {
    const { container } = render(<MeasuredValue value="13%" unit="of battles" />);
    expect(screen.getByText('13%')).toBeInTheDocument();
    expect(screen.getByText('of battles')).toBeInTheDocument();
    expect(container.querySelector('.ui-measured-bars')).not.toBeNull();
  });
});

describe('MeasuredLine', () => {
  it('leads its sentence with the dot mark', () => {
    const { container } = render(<MeasuredLine>27 anonymous battles also counted</MeasuredLine>);
    expect(container.querySelector('.ui-measured-dot')).not.toBeNull();
    expect(screen.getByText('27 anonymous battles also counted')).toBeInTheDocument();
  });
});

describe('progressPercent', () => {
  it('clamps past the goal, a zero goal and a negative count', () => {
    expect(progressPercent(12, 15)).toBe(80);
    expect(progressPercent(27, 15)).toBe(100);
    expect(progressPercent(0, 0)).toBe(100);
    expect(progressPercent(-3, 15)).toBe(0);
    expect(progressPercent(Number.NaN, 15)).toBe(0);
  });
});

describe('ProgressCard', () => {
  it('shows progress and keeps the contribution line apart', () => {
    render(
      <ProgressCard
        title="Make these teams personal"
        done={12}
        goal={15}
        line="Log 3 more battles to weight teams by what you actually face."
        contribution="Anonymous logs also improve the live meta."
      />,
    );
    expect(screen.getByRole('progressbar', { name: 'Make these teams personal' })).toHaveAttribute(
      'aria-valuenow',
      '80',
    );
    expect(screen.getByText('12 / 15')).toBeInTheDocument();
    expect(screen.getByText('Anonymous logs also improve the live meta.')).toBeInTheDocument();
  });

  it('renders no contribution line when none is given', () => {
    const { container } = render(<ProgressCard title="t" done={1} goal={15} line="l" />);
    expect(container.querySelector('.ui-measured-line')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --project ui Measured`
Expected: FAIL, exports missing.

- [ ] **Step 3: Implement**

Create `packages/ui/src/components/Measured.tsx`:

```tsx
import type { ReactNode } from 'react';

/** The bar mark that says "measured": three bars in the measured pink. */
function Bars() {
  return (
    <svg className="ui-measured-bars" width={11} height={11} viewBox="0 0 11 11" aria-hidden="true">
      <rect x="0" y="6" width="3" height="5" rx="1" />
      <rect x="4" y="0" width="3" height="11" rx="1" />
      <rect x="8" y="3" width="3" height="8" rx="1" />
    </svg>
  );
}

/** A measured community number: pink text led by the bar mark, never a pill, so it cannot be
 * mistaken for a Psychic or Fairy type chip. */
export function MeasuredValue({ value, unit }: { value: string; unit?: string | undefined }) {
  return (
    <span className="ui-measured">
      <span className="ui-measured-num">
        <Bars />
        <b>{value}</b>
      </span>
      {unit ? <small>{unit}</small> : null}
    </span>
  );
}

/** A sentence about measured data, led by the pink dot. */
export function MeasuredLine({ children }: { children: ReactNode }) {
  return (
    <p className="ui-measured-line">
      <span className="ui-measured-dot" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
```

Create `packages/ui/src/components/ProgressCard.tsx`:

```tsx
import type { ReactNode } from 'react';
import { MeasuredLine } from './Measured.tsx';

/** Percent of the way to a goal, 0 to 100: a zero goal counts as reached, and anything outside
 * the range (past the goal, negative, NaN) is clamped so the bar never breaks. */
export function progressPercent(done: number, goal: number): number {
  if (!Number.isFinite(done) || done <= 0) {
    return goal <= 0 ? 100 : 0;
  }
  if (goal <= 0) {
    return 100;
  }
  return Math.min(100, Math.round((done / goal) * 100));
}

/** Personal progress toward a goal (the 15 battles before your log weights your teams), with an
 * optional measured line for the community contribution, kept visually separate. */
export function ProgressCard({
  title,
  done,
  goal,
  line,
  contribution,
}: {
  title: string;
  done: number;
  goal: number;
  line: string;
  contribution?: ReactNode;
}) {
  const pct = progressPercent(done, goal);
  return (
    <section className="ui-progress-card">
      <div className="ui-progress-head">
        <b>{title}</b>
        <span className="ui-progress-count">{`${Math.max(0, Math.trunc(done) || 0)} / ${goal}`}</span>
      </div>
      <div
        className="ui-progress-bar"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="ui-progress-line">{line}</p>
      {contribution !== undefined ? <MeasuredLine>{contribution}</MeasuredLine> : null}
    </section>
  );
}
```

Note `progressPercent(-3, 15)` returns 0 and `progressPercent(0, 0)` returns 100, as the test
expects.

Add to `packages/ui/src/index.ts`:

```ts
export { MeasuredLine, MeasuredValue } from './components/Measured.tsx';
export { ProgressCard, progressPercent } from './components/ProgressCard.tsx';
```

Append to `packages/ui/base.css`:

```css

/* Measured community data: pink text with a mark, never a pill. */
.ui-measured {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  font-variant-numeric: tabular-nums;
}
.ui-measured-num {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--measured);
}
.ui-measured-num b {
  font-size: 20px;
  line-height: 1.1;
}
.ui-measured small {
  font-size: var(--fs-label);
  color: var(--muted);
}
.ui-measured-bars {
  fill: var(--measured);
  flex: none;
}
.ui-measured-line {
  display: flex;
  align-items: baseline;
  gap: var(--space);
  margin: 0;
  font-size: var(--fs-support);
  color: var(--measured);
}
.ui-measured-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--measured);
  flex: none;
  transform: translateY(-1px);
}

/* Progress card: personal progress, violet; the contribution line stays pink and apart. */
.ui-progress-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: var(--r-card);
  border: 1px solid var(--divider);
  background: var(--surface);
}
.ui-progress-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space);
  font-size: var(--fs-body);
}
.ui-progress-count {
  font-weight: 700;
  color: var(--accent-text);
  font-variant-numeric: tabular-nums;
}
.ui-progress-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--bar);
  overflow: hidden;
}
.ui-progress-bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.ui-progress-line {
  margin: 0;
  font-size: var(--fs-support);
  color: var(--muted);
}
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run --project ui && npm run check-colors && npm run check-tokens`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Measured.tsx packages/ui/src/components/ProgressCard.tsx packages/ui/test/Measured.test.tsx packages/ui/src/index.ts packages/ui/base.css
git commit -m "UI: measured values with the pink mark, and a progress card that keeps contribution apart"
```

---

### Task 7: Header (top and sub) and ExpandRow

**Files:**
- Create: `packages/ui/src/components/Header.tsx`
- Create: `packages/ui/src/components/ExpandRow.tsx`
- Create: `packages/ui/test/HeaderExpand.test.tsx`
- Modify: `packages/ui/src/components/HeaderShell.tsx` (doc comment only)
- Modify: `packages/ui/src/index.ts`, `packages/ui/base.css`

**Interfaces:**
- Consumes: `HeaderShell`, `Chevron`.
- Produces: `Header({ variant: 'top' | 'sub'; title: string; back?: HeaderBack; actions?: ReactNode; mark?: ReactNode; sub?: string })`,
  `HeaderBack = { label: string; onClick?: () => void; href?: string }`;
  `ExpandRow({ summary: ReactNode; children: ReactNode; open: boolean; onToggle: () => void })`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/HeaderExpand.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ExpandRow, Header } from '../src/index.ts';

describe('Header', () => {
  it('top: a page title as a level-2 heading, with its actions', () => {
    render(<Header variant="top" title="Your Teams" actions={<button type="button">Settings</button>} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Your Teams' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('top: shows the site mark beside the title', () => {
    render(<Header variant="top" title="Teams" mark={<span>meta</span>} />);
    expect(screen.getByText('meta')).toBeInTheDocument();
  });

  it('sub: a back button that calls back', async () => {
    const onBack = vi.fn();
    render(<Header variant="sub" title="Team Analysis" back={{ label: 'Teams', onClick: onBack }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Teams' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Team Analysis')).toBeInTheDocument();
  });

  it('sub: a back link when given an href', () => {
    render(<Header variant="sub" title="Melmetal" back={{ label: 'Great', href: '#/pokemon' }} />);
    expect(screen.getByRole('link', { name: 'Great' })).toHaveAttribute('href', '#/pokemon');
  });
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <ExpandRow summary="Araquanid, Melmetal" open={open} onToggle={() => setOpen((o) => !o)}>
      <p>Seen with Mimikyu</p>
    </ExpandRow>
  );
}

describe('ExpandRow', () => {
  it('opens and closes, and says so', async () => {
    render(<Harness />);
    const head = screen.getByRole('button', { name: /Araquanid, Melmetal/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Seen with Mimikyu')).toBeNull();
    await userEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Seen with Mimikyu')).toBeVisible();
    await userEvent.click(head);
    expect(screen.queryByText('Seen with Mimikyu')).toBeNull();
  });

  it('points the button at the region it controls', async () => {
    render(<Harness />);
    const head = screen.getByRole('button', { name: /Araquanid/ });
    await userEvent.click(head);
    const id = head.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? '')).toContainElement(screen.getByText('Seen with Mimikyu'));
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --project ui HeaderExpand`
Expected: FAIL, exports missing.

- [ ] **Step 3: Implement**

Create `packages/ui/src/components/Header.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Chevron } from './Chevron.tsx';
import { HeaderShell } from './HeaderShell.tsx';

export interface HeaderBack {
  label: string;
  onClick?: (() => void) | undefined;
  href?: string | undefined;
}

/**
 * The two headers both sites use. `top`: a tab's own page, a page title and icon buttons, no back.
 * `sub`: a page reached from another, back on the left, the title centered, icon buttons on the
 * right. `mark` is meta.pick3.gg's small site mark beside a top title; pick3 leaves it out.
 * Back should return to where the reader came from (the app decides how); a jump somewhere else
 * is a labeled action, not the back control.
 */
export function Header({
  variant,
  title,
  back,
  actions,
  mark,
  sub,
}: {
  variant: 'top' | 'sub';
  title: string;
  back?: HeaderBack | undefined;
  actions?: ReactNode;
  mark?: ReactNode;
  sub?: string | undefined;
}) {
  if (variant === 'top') {
    return (
      <header className="ui-top">
        <div className="ui-top-row">
          <div className="ui-top-title">
            <h2>{title}</h2>
            {mark ?? null}
          </div>
          {actions ? <div className="ui-top-actions">{actions}</div> : null}
        </div>
        {sub ? <p className="ui-top-sub">{sub}</p> : null}
      </header>
    );
  }
  const backNode =
    back === undefined ? undefined : back.href !== undefined ? (
      <a className="back" href={back.href}>
        <Chevron dir="left" />
        {back.label}
      </a>
    ) : (
      <button type="button" className="back" onClick={back.onClick}>
        <Chevron dir="left" />
        {back.label}
      </button>
    );
  return <HeaderShell back={backNode} title={title} sub={sub} actions={actions} />;
}
```

Create `packages/ui/src/components/ExpandRow.tsx`:

```tsx
import { useId, type ReactNode } from 'react';
import { Chevron } from './Chevron.tsx';

/** A row that opens in place. `summary` sits inside the toggle button, so it must hold no
 * buttons or links of its own; put actions in `children`, which render only while open. */
export function ExpandRow({
  summary,
  children,
  open,
  onToggle,
}: {
  summary: ReactNode;
  children: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  return (
    <div className={`ui-expand${open ? ' open' : ''}`}>
      <button
        type="button"
        className="ui-expand-head"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span className="ui-expand-summary">{summary}</span>
        <Chevron dir={open ? 'up' : 'down'} />
      </button>
      <div id={id} className="ui-expand-body" hidden={!open}>
        {open ? children : null}
      </div>
    </div>
  );
}
```

In `packages/ui/src/components/HeaderShell.tsx`, replace the end of the doc comment sentence
"and the two headers stay visibly different by design (see the spec's "header split" section)."
with "and `Header` (top and sub) is what both sites now render on top of it (design
foundation, 2026-09-24)."

Add to `packages/ui/src/index.ts`:

```ts
export { Header, type HeaderBack } from './components/Header.tsx';
export { ExpandRow } from './components/ExpandRow.tsx';
```

Append to `packages/ui/base.css`:

```css

/* Top-level header: page title left, icon buttons right. */
.ui-top {
  padding: calc(env(safe-area-inset-top, 0px) + 20px) var(--gutter) 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ui-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space);
}
.ui-top-title {
  display: flex;
  align-items: baseline;
  gap: var(--space);
  min-width: 0;
}
.ui-top-title h2 {
  margin: 0;
  font-size: var(--fs-page);
  font-weight: 600;
  letter-spacing: -0.015em;
  text-wrap: balance;
}
.ui-top-actions {
  display: flex;
  gap: var(--space);
  flex: none;
}
.ui-top-sub {
  margin: 0;
  font-size: var(--fs-support);
  color: var(--muted);
}

/* Expand row. */
.ui-expand {
  border: 1px solid var(--divider);
  border-radius: var(--r-card);
  background: var(--surface);
}
.ui-expand-head {
  width: 100%;
  min-height: var(--tap);
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: var(--space);
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ui-expand-head:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: var(--r-card);
}
.ui-expand-summary {
  flex: 1;
  min-width: 0;
}
.ui-expand-body {
  padding: 0 14px 14px;
  border-top: 1px solid var(--divider);
}
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run --project ui && npm run typecheck && npm run check-colors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Header.tsx packages/ui/src/components/ExpandRow.tsx packages/ui/src/components/HeaderShell.tsx packages/ui/test/HeaderExpand.test.tsx packages/ui/src/index.ts packages/ui/base.css
git commit -m "UI: one header system (top and sub) and ExpandRow"
```

---

### Task 8: Sheet with pages

**Files:**
- Create: `packages/ui/src/components/focus.ts`
- Create: `packages/ui/src/components/Sheet.tsx`
- Create: `packages/ui/test/Sheet.test.tsx`
- Modify: `packages/ui/src/index.ts`, `packages/ui/base.css`

**Interfaces:**
- Produces: `useReturnFocus(): void` (captures the focused element on mount, restores it on
  unmount if still in the document), `trapTab(e: KeyboardEvent, root: HTMLElement | null): void`;
  `Sheet({ root: SheetPage; onClose: () => void; doneLabel?: string })`,
  `SheetPage = { id: string; title: string; render: (nav: SheetNav) => ReactNode }`,
  `SheetNav = { push(page: SheetPage): void; pop(): void; close(): void; depth: number }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/Sheet.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet, type SheetPage } from '../src/index.ts';

const about: SheetPage = { id: 'about', title: 'About', render: () => <p>Game data</p> };
const settings: SheetPage = {
  id: 'settings',
  title: 'Settings',
  render: (nav) => (
    <button type="button" onClick={() => nav.push(about)}>
      About
    </button>
  ),
};

function Opener({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open settings
      </button>
      {open ? (
        <Sheet
          root={settings}
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

describe('Sheet', () => {
  it('pushes a page with a back control named for the page below', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(screen.getByRole('dialog', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByText('Game data')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });

  it('Done closes the whole sheet from a pushed page, once', async () => {
    const onClose = vi.fn();
    render(<Opener onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'About' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape closes from a pushed page and focus returns to the opener', async () => {
    const onClose = vi.fn();
    render(<Opener onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open settings' });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('button', { name: 'About' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('keeps Tab inside the sheet', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    const done = screen.getByRole('button', { name: 'Done' });
    done.focus();
    await userEvent.tab();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --project ui Sheet`
Expected: FAIL, `Sheet` not exported.

- [ ] **Step 3: Implement**

Create `packages/ui/src/components/focus.ts`:

```ts
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
```

Create `packages/ui/src/components/Sheet.tsx`:

```tsx
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Chevron } from './Chevron.tsx';
import { trapTab, useReturnFocus } from './focus.ts';

export interface SheetNav {
  push: (page: SheetPage) => void;
  pop: () => void;
  close: () => void;
  depth: number;
}

export interface SheetPage {
  id: string;
  title: string;
  render: (nav: SheetNav) => ReactNode;
}

/**
 * A bottom sheet with pages: grabber, back (named for the page below, only once a page is
 * pushed), title, Done. Done, Escape and the overlay close the whole sheet from any depth; focus
 * stays inside while it is open and returns to the opener when it closes.
 */
export function Sheet({
  root,
  onClose,
  doneLabel = 'Done',
}: {
  root: SheetPage;
  onClose: () => void;
  doneLabel?: string;
}) {
  const [stack, setStack] = useState<SheetPage[]>([root]);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useReturnFocus();
  const top = stack[stack.length - 1] ?? root;
  // Focus the sheet on open and again on every page change: the control that pushed or popped
  // the page is gone, and focus left on the body would take Escape and Tab out of the sheet.
  useEffect(() => {
    dialog.current?.focus();
  }, [top.id]);
  const below = stack.length > 1 ? stack[stack.length - 2] : undefined;
  const nav: SheetNav = {
    push: (page) => setStack((s) => [...s, page]),
    pop: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    close: onClose,
    depth: stack.length - 1,
  };
  return (
    <>
      <div className="ui-overlay" onClick={onClose} aria-hidden="true" />
      <div
        className="ui-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
          }
          trapTab(e, dialog.current);
        }}
      >
        <div className="ui-grabber">
          <span />
        </div>
        <div className="ui-sheet-head">
          {below ? (
            <button type="button" className="back" onClick={nav.pop}>
              <Chevron dir="left" />
              {below.title}
            </button>
          ) : (
            <span className="back-spacer" />
          )}
          <h3 id={titleId} className="ui-sheet-title">
            {top.title}
          </h3>
          <button type="button" className="ui-sheet-done" onClick={onClose}>
            {doneLabel}
          </button>
        </div>
        <div className="ui-sheet-body" key={top.id}>
          {top.render(nav)}
        </div>
      </div>
    </>
  );
}
```

Add to `packages/ui/src/index.ts`:

```ts
export { Sheet, type SheetNav, type SheetPage } from './components/Sheet.tsx';
export { trapTab, useReturnFocus } from './components/focus.ts';
```

Append to `packages/ui/base.css`:

```css

/* Sheets: overlay, a bottom sheet with pages, and the confirm variant (Task 9). */
.ui-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  z-index: 10;
}
.ui-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0 auto;
  max-width: 560px;
  max-height: 82dvh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  color: var(--text);
  border-radius: var(--r-sheet) var(--r-sheet) 0 0;
  box-shadow: var(--shadow-lg);
  z-index: 11;
  outline: none;
  animation: ui-sheet-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes ui-sheet-in {
  from {
    transform: translateY(100%);
  }
  to {
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-sheet {
    animation: none;
  }
}
.ui-grabber {
  display: flex;
  justify-content: center;
  padding: 10px 0 4px;
}
.ui-grabber span {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--faint);
  display: block;
}
.ui-sheet-head {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) minmax(0, auto) minmax(72px, 1fr);
  align-items: center;
  padding: 0 12px 8px;
  border-bottom: 1px solid var(--divider);
}
.ui-sheet-title {
  margin: 0;
  font-size: var(--fs-section);
  font-weight: 600;
  text-align: center;
}
.ui-sheet-done {
  justify-self: end;
  min-height: var(--tap);
  min-width: var(--tap);
  border: 0;
  background: transparent;
  color: var(--accent-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.ui-sheet-body {
  overflow-y: auto;
  padding: 16px var(--gutter) calc(env(safe-area-inset-bottom, 0px) + 32px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run --project ui && npm run typecheck && npm run check-colors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/focus.ts packages/ui/src/components/Sheet.tsx packages/ui/test/Sheet.test.tsx packages/ui/src/index.ts packages/ui/base.css
git commit -m "UI: bottom Sheet with pages, focus kept inside and returned on close"
```

---

### Task 9: ConfirmSheet and Toast

**Files:**
- Create: `packages/ui/src/components/ConfirmSheet.tsx`
- Create: `packages/ui/src/components/Toast.tsx`
- Create: `packages/ui/test/ConfirmToast.test.tsx`
- Modify: `packages/ui/src/index.ts`, `packages/ui/base.css`

**Interfaces:**
- Consumes: `useReturnFocus`, `trapTab` (Task 8); `.ui-overlay`, `.ui-sheet`, `.ui-grabber`,
  `.ui-btn-*` (Tasks 3, 8).
- Produces: `ConfirmSheet({ title: string; line: string; confirmLabel: string; cancelLabel: string; tone?: 'default' | 'danger'; onConfirm: () => void; onCancel: () => void })`;
  `Toast({ message: string; actionLabel?: string; onAction?: () => void; onDismiss: () => void; duration?: number })`.
  A caller shows a new toast by rendering `Toast` with a new `key`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/ConfirmToast.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmSheet, Toast } from '../src/index.ts';

describe('ConfirmSheet', () => {
  it('opens with focus on Cancel, so Enter never confirms by accident', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmSheet
        title="Forget my collection and log?"
        line="This removes your collection, battle log and settings from this device."
        confirmLabel="Forget"
        cancelLabel="Keep everything"
        tone="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('button', { name: 'Keep everything' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is an alert dialog named by its question and described by its line', () => {
    render(
      <ConfirmSheet
        title="Start fresh in Great League?"
        line="Your current battles move to Earlier seasons."
        confirmLabel="Start fresh"
        cancelLabel="Keep this season"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Start fresh in Great League?' });
    expect(dialog).toHaveAccessibleDescription('Your current battles move to Earlier seasons.');
  });

  it('uses the danger style only when asked', () => {
    const { rerender } = render(
      <ConfirmSheet
        title="t"
        line="l"
        confirmLabel="Start fresh"
        cancelLabel="Cancel"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Start fresh' })).toHaveClass('ui-btn-primary');
    rerender(
      <ConfirmSheet
        title="t"
        line="l"
        confirmLabel="Forget"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Forget' })).toHaveClass('ui-btn-danger');
  });

  it('Escape cancels', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmSheet
        title="t"
        line="l"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dismisses itself after its duration', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Win logged" onDismiss={onDismiss} duration={5000} />);
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('runs its action once even when tapped twice', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toast message="Win logged" actionLabel="Undo" onAction={onAction} onDismiss={onDismiss} />,
    );
    const undo = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(undo);
    fireEvent.click(undo);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('is announced politely', () => {
    render(<Toast message="Link copied" onDismiss={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --project ui ConfirmToast`
Expected: FAIL, exports missing.

- [ ] **Step 3: Implement**

Create `packages/ui/src/components/ConfirmSheet.tsx`:

```tsx
import { useEffect, useId, useRef } from 'react';
import { trapTab, useReturnFocus } from './focus.ts';

/**
 * The in-app confirm, in place of window.confirm: the question as the title, one line on what
 * happens, two buttons that say what they do. Focus starts on Cancel so Enter never confirms by
 * accident. `danger` is only for actions that destroy data (Forget, sharing off, Remove); Start
 * fresh moves battles and deletes nothing, so it keeps the default tone.
 */
export function ConfirmSheet({
  title,
  line,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  title: string;
  line: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const lineId = useId();
  useReturnFocus();
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  return (
    <>
      <div className="ui-overlay" onClick={onCancel} aria-hidden="true" />
      <div
        className="ui-sheet ui-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={lineId}
        ref={box}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
            return;
          }
          trapTab(e, box.current);
        }}
      >
        <div className="ui-grabber">
          <span />
        </div>
        <h3 id={titleId} className="ui-confirm-title">
          {title}
        </h3>
        <p id={lineId} className="ui-confirm-line">
          {line}
        </p>
        <div className="ui-confirm-actions">
          <button ref={cancel} type="button" className="ui-btn ui-btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`ui-btn ${tone === 'danger' ? 'ui-btn-danger' : 'ui-btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
```

Create `packages/ui/src/components/Toast.tsx`:

```tsx
import { useEffect, useRef } from 'react';

/**
 * One line of feedback with an optional action ("Win logged" / Undo). It dismisses itself after
 * `duration` ms (0 keeps it up). The action runs at most once. Render a new toast with a new
 * `key` so its timer and its once-only action start fresh.
 */
export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  duration = 8000,
}: {
  message: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  onDismiss: () => void;
  duration?: number;
}) {
  const acted = useRef(false);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    if (duration <= 0) {
      return undefined;
    }
    const t = window.setTimeout(() => dismiss.current(), duration);
    return () => window.clearTimeout(t);
  }, [duration]);
  return (
    <div className="ui-toast" role="status" aria-live="polite">
      <span className="ui-toast-msg">{message}</span>
      {actionLabel !== undefined && onAction !== undefined ? (
        <button
          type="button"
          className="ui-toast-action"
          onClick={() => {
            if (acted.current) {
              return;
            }
            acted.current = true;
            onAction();
            dismiss.current();
          }}
        >
          {actionLabel}
        </button>
      ) : null}
      <button type="button" className="ui-toast-x" aria-label="Dismiss" onClick={() => dismiss.current()}>
        ×
      </button>
    </div>
  );
}
```

(The `×` is the multiplication sign, U+00D7, as today's close buttons use `&times;`; it is not an
em dash.)

Add to `packages/ui/src/index.ts`:

```ts
export { ConfirmSheet } from './components/ConfirmSheet.tsx';
export { Toast } from './components/Toast.tsx';
```

Append to `packages/ui/base.css`:

```css
.ui-confirm {
  padding: 0 var(--gutter) calc(env(safe-area-inset-bottom, 0px) + 20px);
  gap: 10px;
  text-align: center;
}
.ui-confirm-title {
  margin: 4px 0 0;
  font-size: var(--fs-section);
  font-weight: 600;
  text-wrap: balance;
}
.ui-confirm-line {
  margin: 0;
  font-size: var(--fs-support);
  color: var(--muted);
}
.ui-confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 8px;
}

/* Toast: one line, an optional action. */
.ui-toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
  z-index: 12;
  display: flex;
  align-items: center;
  gap: var(--space);
  padding: 4px 4px 4px 16px;
  max-width: calc(100vw - 2 * var(--gutter));
  border-radius: var(--r-control);
  background: var(--surface2);
  color: var(--text);
  box-shadow: var(--shadow-lg);
  font-size: var(--fs-support);
}
.ui-toast-msg {
  min-width: 0;
  flex: 1;
}
.ui-toast-action,
.ui-toast-x {
  min-height: var(--tap);
  min-width: var(--tap);
  border: 0;
  background: transparent;
  color: var(--accent-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.ui-toast-x {
  color: var(--muted);
  font-size: 18px;
}
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run --project ui && npm run typecheck && npm run lint && npm run check-colors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/ConfirmSheet.tsx packages/ui/src/components/Toast.tsx packages/ui/test/ConfirmToast.test.tsx packages/ui/src/index.ts packages/ui/base.css
git commit -m "UI: in-app ConfirmSheet (Cancel focused first) and Toast with a once-only action"
```

---

### Task 10: Loading, Empty and ErrorState

**Files:**
- Create: `packages/ui/src/components/States.tsx`
- Create: `packages/ui/test/States.test.tsx`
- Modify: `packages/ui/src/index.ts`, `packages/ui/base.css`

**Interfaces:**
- Produces: `Loading({ label: string; done?: number; total?: number })`,
  `Empty({ line: string; action?: ReactNode })`, `ErrorState({ line: string; action?: ReactNode })`.
  Apps keep their own stage-to-label maps (web's `Progress` labels) and pass the label in.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/States.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Empty, ErrorState, Loading } from '../src/index.ts';

describe('Loading', () => {
  it('announces its stage and fills to the share done', () => {
    const { container } = render(
      <Loading label="Simulating battles with your exact Pokémon" done={3} total={4} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Simulating battles with your exact Pokémon');
    expect(container.querySelector<HTMLElement>('.ui-loading-bar span')?.style.width).toBe('75%');
  });

  it('shows an indeterminate bar when the total is unknown', () => {
    const { container } = render(<Loading label="Checking which Pokémon fit the league" />);
    expect(container.querySelector('.ui-loading-bar')).toHaveClass('indeterminate');
  });
});

describe('Empty and ErrorState', () => {
  it('Empty says what to do and can offer an action', () => {
    render(
      <Empty
        line="No team fits these filters. Loosen one to see recommendations again."
        action={<button type="button">Filters</button>}
      />,
    );
    expect(screen.getByText(/No team fits these filters/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  it('ErrorState is an alert', () => {
    render(<ErrorState line="Could not load the shared teams. Try again in a moment." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the shared teams.');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --project ui States`
Expected: FAIL, exports missing.

- [ ] **Step 3: Implement**

Create `packages/ui/src/components/States.tsx`:

```tsx
import type { ReactNode } from 'react';

/** Work in progress: the stage in words and a bar. No total means the length is unknown. */
export function Loading({
  label,
  done = 0,
  total = 0,
}: {
  label: string;
  done?: number;
  total?: number;
}) {
  const known = total > 0;
  const pct = known ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;
  return (
    <div className="ui-loading" role="status">
      <div className="ui-loading-label">{label}</div>
      <div className={`ui-loading-bar${known ? '' : ' indeterminate'}`}>
        <span style={known ? { width: `${pct}%` } : undefined} />
      </div>
    </div>
  );
}

/** Nothing to show: one line on why and what to do, and an optional action. */
export function Empty({ line, action }: { line: string; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      <p>{line}</p>
      {action ?? null}
    </div>
  );
}

/** Something failed: what went wrong and how to fix it, and an optional action. */
export function ErrorState({ line, action }: { line: string; action?: ReactNode }) {
  return (
    <div className="ui-error" role="alert">
      <p>{line}</p>
      {action ?? null}
    </div>
  );
}
```

Add to `packages/ui/src/index.ts`:

```ts
export { Empty, ErrorState, Loading } from './components/States.tsx';
```

Append to `packages/ui/base.css`:

```css

/* States: loading, empty, error. */
.ui-loading {
  display: flex;
  flex-direction: column;
  gap: var(--space);
  padding: 24px 0;
}
.ui-loading-label {
  font-size: var(--fs-support);
  color: var(--muted);
}
.ui-loading-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--bar);
  overflow: hidden;
}
.ui-loading-bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
.ui-loading-bar.indeterminate span {
  width: 35%;
  animation: ui-sweep 1.2s ease-in-out infinite;
}
@keyframes ui-sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-loading-bar.indeterminate span {
    animation: none;
  }
}
.ui-empty,
.ui-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 12px;
  text-align: center;
  font-size: var(--fs-body);
  color: var(--muted);
}
.ui-empty p,
.ui-error p {
  margin: 0;
}
.ui-error {
  padding: 12px 14px;
  border-radius: var(--r-control);
  background: var(--warn-tint);
  color: var(--warn);
  text-align: left;
  align-items: flex-start;
}
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run --project ui && npm run check-colors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/States.tsx packages/ui/test/States.test.tsx packages/ui/src/index.ts packages/ui/base.css
git commit -m "UI: one look for loading, empty and error"
```

---

### Task 11: The component gallery

**Files:**
- Create: `packages/ui/vite.gallery.config.ts`
- Create: `packages/ui/gallery/index.html`
- Create: `packages/ui/gallery/main.tsx`
- Create: `packages/ui/gallery/Gallery.tsx`
- Create: `packages/ui/gallery/gallery.css`
- Create: `packages/ui/test/Gallery.test.tsx`
- Modify: `packages/ui/package.json` (scripts), `packages/ui/tsconfig.json` (include gallery),
  root `.gitignore` (the gallery build and capture folders)

**Interfaces:**
- Consumes: every component from Tasks 3 to 10, plus the existing `Term`, `TypeChip(s)`,
  `SpeciesToken`, `Chevron`, `applyTheme`.
- Produces: a page served by `npm -w @pickthree/ui run gallery` (port 5175), built by
  `npm -w @pickthree/ui run gallery:build` into `packages/ui/gallery-dist`. `?theme=dark` or
  `?theme=light` picks the theme. Every section is a `<section data-gallery="<Name>">`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/test/Gallery.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Gallery } from '../gallery/Gallery.tsx';

const SECTIONS = [
  'Tokens',
  'Button',
  'IconButton',
  'Chip',
  'Tag',
  'TypeChip',
  'LeagueSwitcher',
  'Select',
  'FilterButton',
  'Measured',
  'ProgressCard',
  'ExpandRow',
  'Term',
  'Header',
  'Sheet',
  'ConfirmSheet',
  'Toast',
  'States',
];

describe('Gallery', () => {
  it('shows a section for every foundation component', () => {
    const { container } = render(<Gallery />);
    const shown = [...container.querySelectorAll('section[data-gallery]')].map((s) =>
      s.getAttribute('data-gallery'),
    );
    expect(shown).toEqual(SECTIONS);
  });

  it('includes the long-text states', () => {
    render(<Gallery />);
    expect(screen.getAllByText(/Build from your Rookidee/).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run --project ui Gallery`
Expected: FAIL, cannot resolve `../gallery/Gallery.tsx`.

- [ ] **Step 3: Implement the gallery**

Create `packages/ui/vite.gallery.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The component gallery: a dev-only page, never part of either app's build. */
export default defineConfig({
  root: fileURLToPath(new URL('./gallery', import.meta.url)),
  base: './',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./gallery-dist', import.meta.url)),
    emptyOutDir: true,
  },
  server: { port: 5175, strictPort: true },
  preview: { port: 4175, strictPort: true },
});
```

Add scripts to `packages/ui/package.json`:

```json
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "gallery": "vite --config vite.gallery.config.ts",
    "gallery:build": "vite build --config vite.gallery.config.ts"
```

In `packages/ui/tsconfig.json`, change `include` to
`["src/**/*.ts", "src/**/*.tsx", "gallery/**/*.ts", "gallery/**/*.tsx"]`.

Append to the root `.gitignore`:

```
packages/ui/gallery-dist/
packages/ui/screenshots/
```

In `eslint.config.js`, add `'packages/ui/gallery-dist/**',` to the `ignores` list (after
`'**/dist/**',`); the built gallery is not `dist`, so the existing ignore does not cover it.

Create `packages/ui/gallery/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>pick3 components</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

Create `packages/ui/gallery/gallery.css`:

```css
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: var(--fs-body);
}
.g-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px var(--gutter) 160px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.g-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.g-section > h2 {
  margin: 0;
  font-size: var(--fs-label);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.g-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.g-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}
.g-swatch {
  border-radius: var(--r-control);
  border: 1px solid var(--divider);
  padding: 36px 8px 8px;
  font-size: var(--fs-label);
  color: var(--text);
  background: var(--surface);
}
.g-note {
  margin: 0;
  font-size: var(--fs-support);
  color: var(--muted);
}
.g-frame {
  position: relative;
  min-height: 300px;
  border: 1px dashed var(--divider);
  border-radius: var(--r-card);
  overflow: hidden;
  transform: translateZ(0);
}
.g-frame .ui-overlay,
.g-frame .ui-sheet,
.g-frame .ui-toast {
  position: absolute;
}
```

(`.g-frame` uses `transform` so the fixed-position sheet, overlay and toast render inside the
frame instead of over the whole page. `gallery.css` is not a scanned stylesheet, but it still uses
tokens only.)

Create `packages/ui/gallery/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../tokens.css';
import '../base.css';
import './gallery.css';
import { applyTheme } from '../src/index.ts';
import { Gallery } from './Gallery.tsx';

const theme = new URLSearchParams(window.location.search).get('theme');
applyTheme(theme === 'light' || theme === 'dark' ? theme : 'system');

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <Gallery />
    </StrictMode>,
  );
}
```

Create `packages/ui/gallery/Gallery.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import {
  Button,
  Chip,
  ConfirmSheet,
  Empty,
  ErrorState,
  ExpandRow,
  FilterButton,
  Header,
  IconButton,
  LeagueSwitcher,
  Loading,
  MeasuredLine,
  MeasuredValue,
  ProgressCard,
  Select,
  Sheet,
  Tag,
  Term,
  Toast,
  TypeChips,
  type SheetPage,
} from '../src/index.ts';

function Section({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="g-section" data-gallery={name}>
      <h2>{name}</h2>
      {children}
    </section>
  );
}

const COG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
  </svg>
);

const TOKENS = [
  'bg',
  'surface',
  'surface2',
  'accent',
  'measured',
  'win',
  'loss',
  'tanked',
  'warn',
  'danger',
];

const LEAGUES = [
  { value: 'great', label: 'Great' },
  { value: 'ultra', label: 'Ultra' },
  { value: 'master', label: 'Master' },
];

const LEAGUES_FOUR = [...LEAGUES, { value: 'championshipseries', label: 'Tournament' }];

const ABOUT: SheetPage = {
  id: 'about',
  title: 'About',
  render: () => <p className="g-note">PvPoke data, updated Sep 10, 2026.</p>,
};
const SETTINGS: SheetPage = {
  id: 'settings',
  title: 'Settings',
  render: (nav) => (
    <Button variant="secondary" onClick={() => nav.push(ABOUT)}>
      About
    </Button>
  ),
};

export function Gallery() {
  const [chips, setChips] = useState({ all: true, own: false, radar: false });
  const [league, setLeague] = useState('great');
  const [windowPick, setWindowPick] = useState('meta');
  const [openRow, setOpenRow] = useState(true);
  return (
    <main className="g-page">
      <Section name="Tokens">
        <div className="g-swatches">
          {TOKENS.map((t) => (
            <div
              key={t}
              className="g-swatch"
              style={{ boxShadow: `inset 0 28px 0 var(--${t})` }}
            >
              --{t}
            </div>
          ))}
        </div>
      </Section>

      <Section name="Button">
        <Button variant="primary">Analyze this team</Button>
        <Button variant="secondary">Change team</Button>
        <Button variant="text">View analysis</Button>
        <Button variant="danger">Forget my collection and log</Button>
        <Button variant="primary" disabled>
          Analyze when complete
        </Button>
        <Button variant="secondary">
          Build from your Rookidee and see what it beats in Great League
        </Button>
      </Section>

      <Section name="IconButton">
        <div className="g-row">
          <IconButton label="Settings" onClick={() => undefined}>
            {COG}
          </IconButton>
          <IconButton label="Filters on" onClick={() => undefined} active>
            {COG}
          </IconButton>
          <IconButton label="Open meta.pick3.gg" href="#meta">
            {COG}
          </IconButton>
        </div>
      </Section>

      <Section name="Chip">
        <div className="g-row">
          <Chip on={chips.all} onClick={() => setChips((c) => ({ ...c, all: !c.all }))}>
            All
          </Chip>
          <Chip on={chips.own} onClick={() => setChips((c) => ({ ...c, own: !c.own }))}>
            You own
          </Chip>
          <Chip on={chips.radar} onClick={() => setChips((c) => ({ ...c, radar: !c.radar }))}>
            Under the radar
          </Chip>
          <Chip onClick={() => undefined}>Build from your Rookidee</Chip>
        </div>
      </Section>

      <Section name="Tag">
        <div className="g-row">
          <Tag tone="accent">Strong fit</Tag>
          <Tag>Balanced ABC</Tag>
          <Tag tone="win">Worth building</Tag>
          <Tag tone="warn">Wait for better IVs</Tag>
          <Tag tone="loss">Not eligible</Tag>
          <Tag tone="tanked">Tanked</Tag>
          <Tag>yours</Tag>
          <Tag>Outside PvPoke&apos;s 48</Tag>
        </div>
      </Section>

      <Section name="TypeChip">
        <TypeChips types={['fairy', 'steel', 'psychic', 'ice', 'ghost', 'dragon']} />
        <TypeChips types={['fighting', 'water']} small />
      </Section>

      <Section name="LeagueSwitcher">
        <LeagueSwitcher label="League" value={league} onChange={setLeague} options={LEAGUES} />
        <LeagueSwitcher
          label="League, with more"
          value={league}
          onChange={setLeague}
          options={LEAGUES}
          more={{ label: 'More leagues and cups', onClick: () => undefined }}
        />
        <LeagueSwitcher
          label="League, four and more"
          value={league}
          onChange={setLeague}
          options={LEAGUES_FOUR}
          more={{ label: 'More leagues and cups', onClick: () => undefined }}
        />
        <LeagueSwitcher label="League, compact" value={league} onChange={setLeague} options={LEAGUES} compact />
      </Section>

      <Section name="Select">
        <div className="g-row">
          <Select
            label="Window"
            value={windowPick}
            onChange={setWindowPick}
            options={[
              { value: 'meta', label: 'This meta' },
              { value: '30', label: '30 days' },
              { value: '7', label: '7 days' },
            ]}
          />
          <Select
            label="Source"
            value="all"
            onChange={() => undefined}
            options={[
              { value: 'all', label: 'All' },
              { value: 'prior', label: 'PvPoke' },
              { value: 'ladder', label: 'GBL' },
              { value: 'tournament', label: 'Tournaments' },
            ]}
          />
        </div>
      </Section>

      <Section name="FilterButton">
        <div className="g-row">
          <FilterButton count={0} onClick={() => undefined} />
          <FilterButton count={3} onClick={() => undefined} />
        </div>
      </Section>

      <Section name="Measured">
        <div className="g-row">
          <MeasuredValue value="13%" unit="of battles" />
          <MeasuredValue value="4%" />
        </div>
        <MeasuredLine>27 anonymous battles you shared also counted</MeasuredLine>
      </Section>

      <Section name="ProgressCard">
        <ProgressCard
          title="Make these teams personal"
          done={12}
          goal={15}
          line="Log 3 more battles to weight teams by what you actually face."
          contribution="Anonymous logs also improve the live meta."
        />
        <ProgressCard title="Your log is active" done={27} goal={15} line="Recommendations reflect what you face." />
      </Section>

      <Section name="ExpandRow">
        <ExpandRow summary="Araquanid, Melmetal" open={openRow} onToggle={() => setOpenRow((o) => !o)}>
          <p className="g-note">Seen with Mimikyu, Dunsparce and Thievul.</p>
          <Button variant="text">Open in pick3</Button>
        </ExpandRow>
        <ExpandRow summary="Clodsire, Sableye with a much longer name line" open={false} onToggle={() => undefined}>
          <p className="g-note">Closed.</p>
        </ExpandRow>
      </Section>

      <Section name="Term">
        <p className="g-note">
          A balanced team, or an <Term term="ABB line">A team built so the back line beats what counters the lead.</Term>.
        </p>
      </Section>

      <Section name="Header">
        <Header
          variant="top"
          title="Your Teams"
          actions={
            <IconButton label="Settings" onClick={() => undefined}>
              {COG}
            </IconButton>
          }
        />
        <Header variant="top" title="Teams" mark={<Tag tone="accent">meta</Tag>} />
        <Header
          variant="sub"
          title="Team Analysis"
          back={{ label: 'Teams', onClick: () => undefined }}
          actions={
            <IconButton label="Share this team" onClick={() => undefined}>
              {COG}
            </IconButton>
          }
        />
      </Section>

      <Section name="Sheet">
        <div className="g-frame">
          <Sheet root={SETTINGS} onClose={() => undefined} />
        </div>
      </Section>

      <Section name="ConfirmSheet">
        <div className="g-frame">
          <ConfirmSheet
            title="Start fresh in Great League?"
            line="Your current battles move to Earlier seasons. Nothing is deleted."
            confirmLabel="Start fresh"
            cancelLabel="Keep this season"
            onConfirm={() => undefined}
            onCancel={() => undefined}
          />
        </div>
        <div className="g-frame">
          <ConfirmSheet
            title="Forget my collection and log?"
            line="This removes your collection, battle log and settings from this device."
            confirmLabel="Forget"
            cancelLabel="Keep everything"
            tone="danger"
            onConfirm={() => undefined}
            onCancel={() => undefined}
          />
        </div>
      </Section>

      <Section name="Toast">
        <div className="g-frame" style={{ minHeight: 120 }}>
          <Toast
            message="Win logged. 13 with this team."
            actionLabel="Undo"
            onAction={() => undefined}
            onDismiss={() => undefined}
            duration={0}
          />
        </div>
      </Section>

      <Section name="States">
        <Loading label="Simulating battles with your exact Pokémon" done={3} total={4} />
        <Loading label="Checking which Pokémon fit the league" />
        <Empty
          line="No team fits these filters. Loosen one to see recommendations again."
          action={<FilterButton count={3} onClick={() => undefined} />}
        />
        <ErrorState line="Could not load the shared teams. Try again in a moment." />
      </Section>
    </main>
  );
}
```

- [ ] **Step 4: Run the test, typecheck, lint, and build the gallery**

Run: `npx vitest run --project ui && npm run typecheck && npm run lint && npm -w @pickthree/ui run gallery:build`
Expected: PASS, and `packages/ui/gallery-dist/index.html` exists. The two focus-taking
components (Sheet, ConfirmSheet) both render in the gallery; the last one to mount holds focus,
which is expected on a gallery page.

- [ ] **Step 5: Look at it once**

Run: `npm -w @pickthree/ui run gallery`, open `http://localhost:5175/?theme=dark` and
`http://localhost:5175/?theme=light` at a 390px-wide window. Every section renders; nothing
pushes the page sideways. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/vite.gallery.config.ts packages/ui/gallery/index.html packages/ui/gallery/main.tsx packages/ui/gallery/Gallery.tsx packages/ui/gallery/gallery.css packages/ui/test/Gallery.test.tsx packages/ui/package.json packages/ui/tsconfig.json .gitignore eslint.config.js
git commit -m "UI: component gallery, every foundation component in every state"
```

---

### Task 12: Audit tooling (ui:audit, and audit mode for the two sites)

**Files:**
- Create: `scripts/audit.mjs`
- Create: `scripts/ui-audit.mjs`
- Modify: `apps/web/scripts/screens.mjs` (the `shot` helper and the end-of-run report)
- Modify: `apps/meta/scripts/screens.mjs` (the capture loop and the end-of-run report)
- Modify: root `package.json` (scripts, `axe-core` devDependency)

**Interfaces:**
- Produces, from `scripts/audit.mjs`:
  `prepareAudit(page): Promise<void>` (bypasses the CSP so axe can be injected),
  `auditPage(page): Promise<string[]>` (one line per finding, empty when clean),
  `forEachTheme(page, fn: (theme: 'dark' | 'light') => Promise<void>): Promise<void>` (sets
  `data-theme` on `<html>` in place, runs `fn`, restores the old attribute).
- Produces npm scripts: `ui:audit`, `web:audit`, `meta:audit`.
- Audit mode in the site scripts reports findings for every screen but fails only for screens
  listed in that script's `AUDIT_ENFORCED` set, which starts empty. Pieces 2 to 5 add their
  screens as each passes.

- [ ] **Step 1: Add axe-core**

Run: `npm i -D -E axe-core@4.13.0` (root). Confirm the root `package.json` shows
`"axe-core": "4.13.0"` with no caret.

- [ ] **Step 2: Write the audit helper**

Create `scripts/audit.mjs`:

```js
/**
 * The automated half of the page audit (docs/superpowers/specs/2026-09-24-design-foundation-design.md,
 * section 5): sideways overflow, touch targets under 44px, text contrast (axe-core), em dashes
 * and an unaccented "Pokemon". Drives a puppeteer page that is already on the screen to check.
 * axe-core is injected into the page for the check only; it never ships in either app.
 */
/* global document, window, getComputedStyle */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

/** Call once per page, before the first goto: the apps' CSP would block the injected axe. */
export async function prepareAudit(page) {
  await page.setBypassCSP(true);
}

/** Runs `fn` with the page in dark, then light, by setting data-theme in place (no reload, so an
 * open sheet or an expanded row stays as it is), then restores the page's own attribute. */
export async function forEachTheme(page, fn) {
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await new Promise((r) => setTimeout(r, 150));
    await fn(theme);
  }
  await page.evaluate((b) => {
    if (b === null) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', b);
    }
  }, before);
}

export async function auditPage(page) {
  const findings = [];

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 1) {
    findings.push(`overflow: page is ${overflow}px wider than the viewport`);
  }

  const small = await page.evaluate(() => {
    const out = [];
    const sel =
      'button, a[href], select, input:not([type="hidden"]), textarea, [role="button"], [role="radio"], [role="tab"]';
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[data-inline-control], [data-audit-exempt]') || el.hasAttribute('data-inline-control')) {
        continue;
      }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.display === 'inline') {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        continue;
      }
      if (r.width < 44 || r.height < 44) {
        const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40);
        out.push(`tap target: "${name}" is ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });
  findings.push(...small);

  const text = await page.evaluate(() => document.body.innerText);
  if (text.includes('\u2014')) {
    findings.push('copy: an em dash is on screen');
  }
  if (/\bPokemon\b/.test(text)) {
    findings.push('copy: "Pokemon" without the accent is on screen');
  }

  if (!(await page.evaluate(() => 'axe' in window))) {
    await page.addScriptTag({ path: AXE });
  }
  const contrast = await page.evaluate(async () => {
    const res = await window.axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
    });
    return res.violations.flatMap((v) =>
      v.nodes.map((n) => `contrast: ${n.target.join(' ')} ${(n.any[0] && n.any[0].message) || ''}`),
    );
  });
  findings.push(...contrast);

  return findings;
}
```

- [ ] **Step 3: Write ui:audit**

Create `scripts/ui-audit.mjs`:

```js
#!/usr/bin/env node
/**
 * Builds the component gallery, serves it, and audits it in dark and light at 390px. Writes
 * packages/ui/screenshots/gallery-<theme>.png (gitignored) and exits 1 on any finding or console
 * error.
 *
 *   npm run ui:audit
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { build, preview } from 'vite';
import { auditPage, prepareAudit } from './audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiDir = path.join(root, 'packages', 'ui');
const configFile = path.join(uiDir, 'vite.gallery.config.ts');
const outDir = path.join(uiDir, 'screenshots');
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

fs.mkdirSync(outDir, { recursive: true });
await build({ configFile, logLevel: 'warn' });
const server = await preview({ configFile });
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:4175/';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-first-run', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox'] : [])],
});
const failures = [];
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    page.on('console', (m) => {
      if (m.type() === 'error') {
        failures.push(`[${theme} console.error] ${m.text()}`);
      }
    });
    page.on('pageerror', (e) => failures.push(`[${theme} pageerror] ${e.message}`));
    await prepareAudit(page);
    await page.goto(`${base}?theme=${theme}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(outDir, `gallery-${theme}.png`), fullPage: true });
    for (const f of await auditPage(page)) {
      failures.push(`[${theme}] ${f}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(`screenshots in ${path.relative(root, outDir)}`);
if (failures.length > 0) {
  console.log('\nAudit findings:');
  for (const f of failures) {
    console.log(`  ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log('gallery audit: clean in dark and light');
}
```

Add to the root `package.json` scripts:

```json
    "ui:audit": "node scripts/ui-audit.mjs",
    "web:audit": "node scripts/with-preview.mjs web 4173 -- node apps/web/scripts/screens.mjs --audit",
    "meta:audit": "node scripts/with-preview.mjs meta 4174 -- node apps/meta/scripts/screens.mjs --audit",
```

- [ ] **Step 4: Run ui:audit and fix what it finds**

Run: `npm run ui:audit`
Expected: `gallery audit: clean in dark and light`. If it reports findings, fix them in the
component CSS in `packages/ui/base.css` (a contrast finding usually means a text token on the
wrong ground; a tap-target finding means a missing `min-height: var(--tap)`), re-run the ui
tests, and re-run the audit until it is clean. Do not exempt a real control to make it pass.

- [ ] **Step 5: Add audit mode to the web capture script**

In `apps/web/scripts/screens.mjs`:

1. Add after the existing imports:
   ```js
   import { auditPage, forEachTheme, prepareAudit } from '../../../scripts/audit.mjs';

   const AUDIT = process.argv.includes('--audit');
   /** Screens held to the audit: a finding here fails the run. Each page redesign adds its own
    * screen names as it passes (design foundation, section 5). */
   const AUDIT_ENFORCED = new Set([]);
   const auditFindings = [];
   ```
2. `base` is read from `process.argv[2]`; with `--audit` as the first argument that would be
   `--audit`. Change the `base` line to:
   ```js
   const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
   ```
3. After `const page = await browser.newPage();` add:
   ```js
   if (AUDIT) {
     await prepareAudit(page);
   }
   ```
4. Replace the `shot` function with:
   ```js
   async function shot(name, fullPage = true) {
     await new Promise((r) => setTimeout(r, 350));
     if (!AUDIT) {
       const file = path.join(outDir, `${name}.png`);
       await page.screenshot({ path: file, fullPage });
       console.log(`  ${name}.png`);
       return;
     }
     await forEachTheme(page, async (theme) => {
       const file = path.join(outDir, `${name}-${theme}.png`);
       await page.screenshot({ path: file, fullPage });
       console.log(`  ${name}-${theme}.png`);
       for (const f of await auditPage(page)) {
         auditFindings.push({ name, line: `[${name} ${theme}] ${f}` });
       }
     });
   }
   ```
5. Before the final `if (errors.length > 0) {` block, add:
   ```js
   if (AUDIT) {
     const enforced = auditFindings.filter((f) => AUDIT_ENFORCED.has(f.name));
     const reported = auditFindings.filter((f) => !AUDIT_ENFORCED.has(f.name));
     if (reported.length > 0) {
       console.log(`\nAudit findings on screens not yet redesigned (${reported.length}, not failing):`);
       for (const f of reported) {
         console.log(`  ${f.line}`);
       }
     }
     if (enforced.length > 0) {
       console.log('\nAudit findings on audited screens:');
       for (const f of enforced) {
         console.log(`  ${f.line}`);
       }
       process.exitCode = 1;
     }
   }
   ```

- [ ] **Step 6: Add audit mode to the meta capture script**

In `apps/meta/scripts/screens.mjs`:

1. Add after the existing imports the same `import`, `AUDIT`, `AUDIT_ENFORCED` and
   `auditFindings` lines as step 5.1 (with the import path `'../../../scripts/audit.mjs'`).
2. Change its `base` line the same way as step 5.2 (default `'http://localhost:4174'`).
3. After `const page = await browser.newPage();` inside the `for (const run of RUNS)` loop, add
   the same `if (AUDIT) { await prepareAudit(page); }`.
4. In the `for (const [name, urlPath] of PAGES)` loop, directly after the two existing
   `page.screenshot` calls, add:
   ```js
       if (AUDIT) {
         await forEachTheme(page, async (theme) => {
           await page.screenshot({
             path: path.join(outDir, `${run.name}-${name}-audit-${theme}.png`),
             fullPage: true,
           });
           for (const f of await auditPage(page)) {
             auditFindings.push({ name, line: `[${run.name} ${name} ${theme}] ${f}` });
           }
         });
       }
   ```
5. Add the same end-of-run report block as step 5.5 before the script's final error check
   (the block that sets `process.exitCode = 1` for `errors`).

meta's existing `assertAscii` still fails the run on any non-ASCII character, including the é in
"Pokémon"; piece 5 changes it when meta adopts the accent. Leave it alone here.

- [ ] **Step 7: Run both site audits (report only)**

Run: `npm run web:audit` then `npm run meta:audit`
Expected: both exit 0 (nothing is enforced yet), each printing a "not yet redesigned" findings
list. Save both outputs to `docs/design/audits/baseline-2026-09-24.txt` (web first, then meta):
this is the starting point pieces 2 to 5 work down from. Also run `npm run web:screens` and
`npm run meta:screens` to confirm the non-audit path is unchanged and still passes.

- [ ] **Step 8: Commit**

```bash
git add scripts/audit.mjs scripts/ui-audit.mjs apps/web/scripts/screens.mjs apps/meta/scripts/screens.mjs package.json package-lock.json docs/design/audits/baseline-2026-09-24.txt packages/ui/base.css
git commit -m "Tooling: page audit (overflow, 44px targets, contrast, copy), ui:audit, audit mode for both sites"
```

---

### Task 13: Audit record, docs and sign-off

**Files:**
- Create: `docs/design/audits/_template.md`
- Create: `docs/design/audits/gallery.md`
- Create: `docs/design/audits/img/gallery-dark.webp`, `docs/design/audits/img/gallery-light.webp`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-24-design-foundation-design.md` (three corrections)

- [ ] **Step 1: Write the audit template**

Create `docs/design/audits/_template.md`:

```markdown
# Audit: <page>

Piece: <n>. Inventory entry: `docs/design/inventory/2026-09-22-inventory.md`, page <n>.
Intake entry: `docs/design/inventory/2026-09-23-design-intake.md`, <heading>.

## Screenshots

Dark and light at 390px, one pair per state.

| State | Dark | Light |
| --- | --- | --- |
| <state> | ![](img/<page>-<state>-dark.webp) | ![](img/<page>-<state>-light.webp) |

## Automated checks

- [ ] `npm run <web|meta>:audit` clean for this page's screens (listed in `AUDIT_ENFORCED`)
- [ ] no console errors
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run check-colors`, `npm run check-tokens`

## Aesthetics

- [ ] colors from tokens, in their roles (violet interaction, pink measured with its mark,
      outcome colors, red only for destroying data)
- [ ] at most four text levels, one page title
- [ ] one filled primary button
- [ ] chips tapped, tags read
- [ ] the right header variant
- [ ] rows align; gutters and the 8px base hold
- [ ] sprites unchanged
- [ ] at most one line of text before the first result
- [ ] light as readable as dark

## Functionality

- [ ] every "must keep" from the inventory entry, item by item: <list>
- [ ] every control does what its label says
- [ ] back returns to the origin with filters and scroll
- [ ] input layout rule (input screens only)
- [ ] icon buttons named; focus visible
- [ ] product rules: assumptions shown, collection stays on the device, `connect-src` unchanged,
      sharing copy accurate
- [ ] tests cover the new behavior

## Findings and fixes

| Finding | Fix | Commit |
| --- | --- | --- |

## Sign-off

- [ ] Travis, <date>
```

- [ ] **Step 2: Record the gallery audit**

Run `npm run ui:audit` again. Convert the two captures to WebP next to the record:

```bash
mkdir -p docs/design/audits/img
node -e "const s=require('sharp');for(const t of ['dark','light']){s('packages/ui/screenshots/gallery-'+t+'.png').resize({width:600}).webp({quality:72}).toFile('docs/design/audits/img/gallery-'+t+'.webp')}"
```

Create `docs/design/audits/gallery.md` from the template: title "Audit: component gallery",
piece 1, no inventory entry (write "none: the gallery is the foundation's own page"), the two
screenshots in one row, the automated checks ticked with the date and the `ui:audit` result,
the aesthetics list ticked item by item against the screenshots, the functionality list reduced
to what applies (every component in every state, tests cover each component), any finding fixed
in Task 12 step 4 listed in the findings table, and the sign-off line left unticked.

- [ ] **Step 3: Correct the spec where the build settled a detail**

In `docs/superpowers/specs/2026-09-24-design-foundation-design.md`:

1. Component 4 (`Tag`): replace "`kind: 'type' | 'fit' | 'verdict' | 'outcome' | 'neutral'`.
   `TypeChip` becomes `Tag kind="type"` and keeps its export name as an alias." with
   "`tone: 'neutral' | 'accent' | 'win' | 'loss' | 'tanked' | 'warn'`. `TypeChip` stays the type
   tag."
2. Section 4: replace "in both themes, side by side." with "in one theme at a time
   (`?theme=dark` or `?theme=light`); the audit captures both."
3. Section 5, static checks: replace "apps/web has 35 today; they are listed in a baseline
   allowlist that may only shrink" with "they are listed in `scripts/color-literal-baseline.json`,
   which may only shrink".

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`:

1. In the Layout block, change the `packages/` lines to include ui:
   ```
   packages/ui/          shared tokens, components (props only), component gallery; both apps import it
   ```
2. In the Commands block, add:
   ```
   npm -w @pickthree/ui run gallery   # component gallery on :5175 (?theme=dark|light)
   npm run ui:audit                   # audit the gallery in dark and light at 390px
   npm run web:audit                  # web captures in both themes plus the audit (enforced screens fail)
   npm run meta:audit                 # same for meta.pick3.gg
   npm run check-colors               # color literals outside tokens.css match the shrink-only baseline
   ```
3. In the Rules list, add:
   ```
   - UI is built from `packages/ui` and its tokens: violet for interaction, pink only for measured data
     (text with its mark, never a pill), outcome colors for results, red only for destroying data.
     No new color literals outside `tokens.css`. Spec: `docs/superpowers/specs/2026-09-24-design-foundation-design.md`.
   - A redesigned page is done only when it passes the audit (automated checks, the aesthetics and
     functionality checklists) and Travis signs its record in `docs/design/audits/`.
   ```

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run check-tokens && npm run check-colors && npm run ui:audit && npm run web:screens && npm run meta:screens`
Expected: every command passes.

- [ ] **Step 6: Commit and ask for sign-off**

```bash
git add docs/design/audits/_template.md docs/design/audits/gallery.md docs/design/audits/img/gallery-dark.webp docs/design/audits/img/gallery-light.webp CLAUDE.md docs/superpowers/specs/2026-09-24-design-foundation-design.md
git commit -m "Design: audit template, the gallery's audit record, CLAUDE.md rules for the foundation"
```

Send Travis the two gallery screenshots and the record. Piece 1 is done when he ticks the
sign-off line; commit that tick.
