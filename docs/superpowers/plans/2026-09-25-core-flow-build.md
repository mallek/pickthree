# Core Flow: Build Your Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Build Your Team on the design foundation: back to where you came from, "Your
lineup" with Find best order at the top, a "Choosing" line, teammate suggestions that run on their
own and never fill slots, a total team cost, one primary Analyze button, and a move picker sheet
without bumping; then an audit record Travis signs.

**Architecture:** Two store changes land first: `back(fallback)` learns whether pick3 has a screen
behind it (a depth kept on each history entry), and `suggestTeammates` stops writing picks and
drops results for a board that has since changed. `MovePicker` and `TeammateSuggestions` are
rewritten as props-driven components with their own tests. `screens/Build.tsx` is then rebuilt
around them with `@pickthree/ui` (`Header`, `Button`, `IconButton`, `Tag`, `Term`, `Sheet`,
`ErrorState`). No engine changes.

**Tech Stack:** React 19, TypeScript 5.9 strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), vitest 4 + jsdom + Testing Library, puppeteer-core audit scripts.

**Spec:** `docs/superpowers/specs/2026-09-25-design-core-flow-design.md` (sections "Decisions",
"Build Your Team", "Navigation", "Testing", "Done for piece 2"). Foundation:
`docs/superpowers/specs/2026-09-24-design-foundation-design.md`. Record model:
`docs/design/audits/teams.md` (signed 2026-09-25).

## Global Constraints

- Exact pinned versions in every package.json. No `^` or `~`.
- Braces on all control flow, even one-line bodies (eslint `curly: all`).
- No em dashes anywhere: code, CSS comments, docs, commits, UI copy.
- "Pokémon" with the accent in all UI copy.
- New CSS uses tokens only; `npm run check-colors` must pass, and the color-literal baseline may
  only shrink.
- New class names start with `ui-` in packages/ui; app-level classes follow the app's own names,
  and must not reuse a class name another screen already styles (grep `apps/web/src/app.css`
  first: the Teams branch shipped a `.team-row` collision that broke Your Meta).
- Touch targets at least 44px.
- Pink is only for measured data; the "Changed" and "yours" tags are neutral `Tag`s.
- The community board read inside `suggestTeammates` keeps the sharing-switch gate and fails
  silent (CLAUDE.md, "The collection never leaves the device").
- Stage explicit paths when committing, never `git add -A`. Commit messages end with a
  `Co-Authored-By: <the model that wrote the commit> <noreply@anthropic.com>` trailer.
- Run commands from the repo root (or the worktree root). Windows, Git Bash. Never kill a process
  you did not start.

## Rulings made while writing this plan

Each is the controller's reading where the spec is silent or two rules meet. Cost if wrong in
brackets.

1. **Suggestions list = each offer's first fill.** An offer's second fill has a reason framed
   against the first fill ("that Tinkaton and Azumarill lose to"), which is wrong once listed on
   its own. So the list shows every offer's first fill (framed against the pins alone), one row
   per species, none already on the board. After + Add the board changes and suggestions run
   again, so the next list is framed against the new board. The offer labels, the chase note and
   the "N shared battles ran this trio" line leave Build (they describe trios, not teammates).
   [Show second fills with a rewritten line: an engine change.]
2. **Heading:** "Best with your first pick" with one slot filled, "Best with your first two" with
   two. [One string.]
3. **Suggestions hide while a slot's search is open**, per CLAUDE.md's input rule (shortcuts last,
   hidden while searching or picking; the keyboard covers everything below the input). + Add fills
   the first empty slot and does not open a search. [Show them under an open search: one
   condition.]
4. **Total cost counts your own Pokémon only.** A species pick is not yours, so it has no build
   cost; the line under the total says how many are not counted. [A stand-in cost estimate: an
   engine call.]
5. **Back is labeled "Back"** (the origin varies) and the settings cog stays on the right as an
   `IconButton`, as on Teams. [One label.]
6. **The only ticked charged move stays enabled and ignores the tap** (as today); the "Pick one or
   two" label says why. Disabling it would grey out a ticked row. [A disabled style instead.]

## Review Focus

1. **Opening Build first (a shared link, a home-screen shortcut, a reload) then pressing Back.**
   Back must stay in pick3 and land on Teams, never leave the site. Test in Task 1.
2. **Changing the board while suggestions are still running.** A result for the old board must
   never show under the new one. Test in Task 1.
3. **A suggested species already on the board, or two offers suggesting the same species.** One
   row per species, never one already picked. Test in Task 3.
4. **A move pool with only one or two charged moves.** No disabled rows and no "Untick one" hint
   when there is nothing else to pick; the last ticked move still cannot be unticked. Test in
   Task 2.
5. **A lineup with Pokémon you have not caught.** The total counts only yours and says how many
   it left out; with none of yours it says so instead of printing zeros. Test in Task 4.

---

### Task 1: Store: back with a fallback, suggestions that never write picks

**Files:**
- Create: `apps/web/src/state/history.ts`
- Modify: `apps/web/src/state/store.tsx` (the `Actions` interface near line 581, the hashchange
  effect near line 726, `back` near line 794, `suggestTeammates` near line 1107, `takeSuggestion`
  near line 1172, and the actions objects near lines 1536 and 1569)
- Test: `apps/web/test/history.test.ts` (create), `apps/web/test/build.test.tsx` (the existing
  "offers teammates" test)

**Interfaces:**
- Produces: `markEntry(): void`, `canGoBack(): boolean`, `resetHistoryForTests(): void` in
  `state/history.ts`; `back(fallback?: Route): void` on `Actions` (default fallback
  `{ screen: 'teams' }`); `suggestKey(picks: AppState['picks'], league: string): string` exported
  from `store.tsx`; `suggestTeammates()` no longer dispatches `picks`; `takeSuggestion` is removed
  from `Actions`.

- [ ] **Step 1: Write the failing history test**

```ts
// apps/web/test/history.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { canGoBack, markEntry, resetHistoryForTests } from '../src/state/history.ts';

describe('pick3 history depth', () => {
  beforeEach(() => {
    resetHistoryForTests();
    window.history.replaceState(null, '', '#/');
  });

  it('has nothing behind the first screen', () => {
    markEntry();
    expect(canGoBack()).toBe(false);
  });

  it('counts a screen pushed after the first', () => {
    markEntry();
    window.history.pushState(null, '', '#/build');
    markEntry();
    expect(canGoBack()).toBe(true);
  });

  it('reads the depth back from an entry it already marked', () => {
    markEntry();
    window.history.pushState(null, '', '#/build');
    markEntry();
    const marked = window.history.state as { pick3Depth: number };
    expect(marked.pick3Depth).toBe(1);
    resetHistoryForTests();
    markEntry();
    expect(canGoBack()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --project web history`
Expected: FAIL, cannot resolve `../src/state/history.ts`.

- [ ] **Step 3: Write `history.ts`**

```ts
// apps/web/src/state/history.ts
/**
 * How many pick3 screens sit behind the current one in this tab, kept on each history entry's
 * state so the browser's own back and forward carry it. `window.history.length` cannot answer
 * this: it counts the pages before pick3 too, so a first screen opened from a link would "go
 * back" off the site.
 */
let depth = -1;

/** Call once on load and on every hash change. */
export function markEntry(): void {
  const st = window.history.state as { pick3Depth?: unknown } | null;
  if (st !== null && typeof st.pick3Depth === 'number') {
    depth = st.pick3Depth;
    return;
  }
  depth += 1;
  window.history.replaceState({ ...(st ?? {}), pick3Depth: depth }, '');
}

export function canGoBack(): boolean {
  return depth > 0;
}

export function resetHistoryForTests(): void {
  depth = -1;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run --project web history`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it into the store**

In `store.tsx`, import `canGoBack, markEntry` from `./history.ts`. In the boot effect, call
`markEntry()` once before `window.addEventListener('hashchange', onHash)`, and make `onHash`:

```ts
    const onHash = (): void => {
      markEntry();
      dispatch({ type: 'route', route: parseHash(window.location.hash) });
    };
```

Change the `Actions` entry to `back(fallback?: Route): void;` and `back` to:

```ts
  /** Back to the screen before this one; the fallback when pick3 has nothing behind it. */
  const back = useCallback(
    (fallback: Route = { screen: 'teams' }) => {
      if (canGoBack()) {
        window.history.back();
      } else {
        navigate(fallback);
      }
    },
    [navigate],
  );
```

`back` has no callers yet (grep `back()` in `apps/web/src`), so nothing else changes.

- [ ] **Step 6: Write the failing suggestion tests**

Replace the existing "offers teammates once something is pinned, and drops them into the empty
slots" test in `apps/web/test/build.test.tsx` with two store-level tests. They drive the store
through `Build` because that is where the picks live; keep the existing `suggestTeammates` mock
body (the Safest offer with Azumarill and Clodsire) as `offer`.

```tsx
  it('offers teammates without writing any pick', async () => {
    const suggestTeammates = vi.fn(async () => offer);
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await waitFor(() => expect(suggestTeammates).toHaveBeenCalledTimes(1));
    await screen.findByRole('button', { name: 'Add Azumarill' });
    expect(screen.getByRole('button', { name: 'Safe Switch, empty' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Closer, empty' })).toBeInTheDocument();
  });

  it('drops a suggestion for a board that changed while it ran', async () => {
    let release: (v: typeof offer) => void = () => {};
    const suggestTeammates = vi
      .fn()
      .mockImplementationOnce(() => new Promise<typeof offer>((r) => (release = r)))
      .mockImplementation(async () => ({ ...offer, suggestions: [] }));
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await waitFor(() => expect(suggestTeammates).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tinkaton' }));
    await pickFirst('azu', 'Azumarill');
    // An answer for the old board (Tinkaton) whose first teammate, Medicham, is not on the new
    // board either, so only the stale-board check can keep it off the screen.
    const first = offer.suggestions[0]!;
    const medicham = { ...first.fills[0]!, pick: { kind: 'species' as const, id: 'medicham' }, speciesId: 'medicham' };
    release({ ...offer, suggestions: [{ ...first, fills: [medicham] }] });
    await waitFor(() => expect(suggestTeammates).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'Add Medicham' })).not.toBeInTheDocument();
  });
```

Add the helper at the top of the `describe` block (it opens the Lead slot, searches and picks):

```tsx
  async function pickFirst(query: string, label: string): Promise<void> {
    const empty = await screen.findByRole('button', { name: /, empty$/ });
    fireEvent.click(empty);
    fireEvent.change(await screen.findByPlaceholderText(/Search any Pokémon for/), {
      target: { value: query },
    });
    fireEvent.click(await screen.findByRole('button', { name: label }));
  }
```

Check how `fakeHost` accepts overrides (`apps/web/test/fakeHost.ts`) and match it; if it takes a
different shape, adapt the call, not the helper's behavior. These tests fail until Task 3 and
Task 4 exist (the "Add Azumarill" button, the automatic run, the "Pokémon" placeholder). Mark
them `it.todo` in this task's commit if they cannot pass yet, and turn them back on in Task 4;
say so in the report.

- [ ] **Step 7: Change `suggestTeammates`**

Add, near `withFills`:

```ts
/** Which board a suggestion was asked for: the league and the picks, order ignored. */
export function suggestKey(picks: AppState['picks'], league: string): string {
  const ids = picks
    .filter((p): p is TeamPick => p !== null)
    .map((p) => `${p.kind}:${p.id}`)
    .sort();
  return `${league}|${ids.join(',')}`;
}
```

In `suggestTeammates`: record `const key = suggestKey(picks, s.settings.league ?? 'great');`
after the early return. After each `await`, drop the result when the board moved on, the same way
the scope check does:

```ts
      const now = stateRef.current;
      if (!scope.current() || suggestKey(now.picks, now.settings.league ?? 'great') !== key) {
        dispatch({ type: 'drop', what: 'suggest' });
        return;
      }
```

Delete the auto-fill (the `const first = suggestion.suggestions[0]; if (first) { dispatch({ type:
'picks', ... }) }` block and its comment). Delete `takeSuggestion` (the callback, the `Actions`
entry, and both actions objects). Update the doc comment above `suggestTeammates`: it runs on its
own from Build when the board has one or two picks, reads only the matrix, and never writes a
pick. `withFills` loses its last caller: delete it.

- [ ] **Step 8: Run the web project**

Run: `npx vitest run --project web`
Expected: PASS (with the two new tests as `todo` if Step 6 said so). Any other test that used
`takeSuggestion` or relied on the auto-fill is updated to the new behavior, not deleted.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/state/history.ts apps/web/src/state/store.tsx apps/web/test/history.test.ts apps/web/test/build.test.tsx
git commit -m "Web: back knows when pick3 has nothing behind it; suggestions never write picks"
```

---

### Task 2: MovePicker: no bumping, a Changed tag, the recommended set on top

**Files:**
- Modify: `apps/web/src/components/MovePicker.tsx`
- Modify: `apps/web/src/app.css` (the `.move-*` rules; grep first)
- Test: `apps/web/test/MovePicker.test.tsx`

**Interfaces:**
- Consumes: `MovePool`, `MoveIds`, `MoveChoice` from `@pickthree/engine`; `Tag`, `Term`, `Button`
  from `@pickthree/ui`; `countsText`, `EffectIcons`, `TmBadge`, `TypeChip` from `../components.tsx`.
- Produces: `MovePicker({ pool, value, onChange })`, same props as today. Task 4 renders it inside
  a `Sheet`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/test/MovePicker.test.tsx` (reuse the file's existing pool fixture; it needs at
least three charged moves. If it has fewer, extend the fixture with a third charged move):

```tsx
  it('never bumps: with two picked, the other charged rows are disabled with a hint', () => {
    const onChange = vi.fn();
    render(<MovePicker pool={pool} value={{ fast: f1, charged: [c1, c2] }} onChange={onChange} />);
    const third = screen.getByRole('checkbox', { name: new RegExp(nameOf(c3)) });
    expect(third).toBeDisabled();
    expect(screen.getByText('Untick one to pick another')).toBeInTheDocument();
    fireEvent.click(third);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the last charged move ticked', () => {
    const onChange = vi.fn();
    render(<MovePicker pool={pool} value={{ fast: f1, charged: [c1] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(nameOf(c1)) }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Untick one to pick another')).not.toBeInTheDocument();
  });

  it('has no hint and no disabled row when the pool has only two charged moves', () => {
    const small = { ...pool, charged: pool.charged.slice(0, 2) };
    render(<MovePicker pool={small} value={{ fast: f1, charged: [c1, c2] }} onChange={vi.fn()} />);
    expect(screen.queryByText('Untick one to pick another')).not.toBeInTheDocument();
    for (const row of screen.getAllByRole('checkbox')) {
      expect(row).not.toBeDisabled();
    }
  });

  it('shows the recommended set and tags what differs from it', () => {
    render(
      <MovePicker
        pool={pool}
        value={{ fast: pool.recommended.fast, charged: [c3] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/^Recommended:/)).toBeInTheDocument();
    const changed = screen.getByRole('checkbox', { name: new RegExp(nameOf(c3)) });
    expect(within(changed).getByText('Changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How move counts work' })).toBeInTheDocument();
  });
```

`f1`, `c1`, `c2`, `c3` and `nameOf` are the fixture's move ids and a lookup of their display
names; define them next to the fixture if the file does not already have them. `c3` must not be
in `pool.recommended.charged`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project web MovePicker`
Expected: FAIL (the third row is enabled and bumps; no "Recommended:" line, no "Changed" tag).

- [ ] **Step 3: Rewrite the picker**

```tsx
import type { MoveChoice, MoveIds, MovePool } from '@pickthree/engine';
import { Button, Tag, Term } from '@pickthree/ui';
import { countsText, EffectIcons, TmBadge, TypeChip } from '../components.tsx';

function sameIds(a: MoveIds, b: MoveIds): boolean {
  return (
    a.fast === b.fast &&
    a.charged.length === b.charged.length &&
    a.charged.every((id, i) => id === b.charged[i])
  );
}

function Option({
  move,
  role,
  checked,
  changed,
  disabled,
  fastName,
  onClick,
}: {
  move: MoveChoice;
  role: 'radio' | 'checkbox';
  checked: boolean;
  changed: boolean;
  disabled: boolean;
  fastName: string | null;
  onClick: () => void;
}) {
  const count = fastName ? countsText(fastName, move.counts) : null;
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      disabled={disabled}
      className={`move-opt${checked ? ' on' : ''}`}
      onClick={onClick}
    >
      <span className="move-opt-mark" aria-hidden="true" />
      <span className="move-main">
        <span className="move-line">
          <span className="move-name">{move.name}</span>
          <span className="move-tags">
            <TypeChip type={move.type} small />
            {move.altType ? <TypeChip type={move.altType} small /> : null}
            <EffectIcons effects={move.effects} />
            {changed ? <Tag>Changed</Tag> : null}
          </span>
          <TmBadge tm={move.tm} />
        </span>
        {count ? <span className="move-sub">{count}</span> : null}
      </span>
    </button>
  );
}

/**
 * Pick the moves one team member runs: one fast move, one or two charged. Nothing is bumped: with
 * two charged moves ticked the others wait until one is unticked, and the last one stays ticked.
 */
export function MovePicker({
  pool,
  value,
  onChange,
}: {
  pool: MovePool;
  value: MoveIds;
  onChange: (next: MoveIds) => void;
}) {
  const all = [...pool.fast, ...pool.charged];
  const nameOf = (id: string): string => all.find((m) => m.moveId === id)?.name ?? id;
  const fastName = pool.fast.find((m) => m.moveId === value.fast)?.name ?? null;
  const full = value.charged.length >= 2;
  const waiting = full && pool.charged.length > 2;
  const toggleCharged = (id: string): void => {
    if (value.charged.includes(id)) {
      if (value.charged.length > 1) {
        onChange({ ...value, charged: value.charged.filter((x) => x !== id) });
      }
      return;
    }
    if (!full) {
      onChange({ ...value, charged: [...value.charged, id] });
    }
  };
  const recommended = [pool.recommended.fast, ...pool.recommended.charged].map(nameOf).join(', ');
  return (
    <div className="move-picker">
      <p className="meta move-picker-rec">Recommended: {recommended}</p>
      <span className="move-picker-kind">Fast move</span>
      <div className="move-opts">
        {pool.fast.map((m) => (
          <Option
            key={m.moveId}
            move={m}
            role="radio"
            checked={m.moveId === value.fast}
            changed={m.moveId === value.fast && m.moveId !== pool.recommended.fast}
            disabled={false}
            fastName={null}
            onClick={() => onChange({ ...value, fast: m.moveId })}
          />
        ))}
      </div>
      <span className="move-picker-kind">Charged moves: pick one or two</span>
      <Term term="How move counts work">
        The numbers after a charged move, like 4-4-3, are how many fast moves it takes to reach
        that charged move the first, second and third time. Leftover energy carries over, so the
        counts can step down.
      </Term>
      {waiting ? <p className="meta">Untick one to pick another</p> : null}
      <div className="move-opts">
        {pool.charged.map((m) => {
          const checked = value.charged.includes(m.moveId);
          return (
            <Option
              key={m.moveId}
              move={m}
              role="checkbox"
              checked={checked}
              changed={checked && !pool.recommended.charged.includes(m.moveId)}
              disabled={full && !checked}
              fastName={fastName}
              onClick={() => toggleCharged(m.moveId)}
            />
          );
        })}
      </div>
      <Button
        variant="text"
        disabled={sameIds(value, pool.recommended)}
        onClick={() =>
          onChange({ fast: pool.recommended.fast, charged: [...pool.recommended.charged] })
        }
      >
        Reset to recommended
      </Button>
    </div>
  );
}
```

Check `Button`'s props in `packages/ui/src/components/Button.tsx` (variant names, `disabled`,
`onClick`) and match them. In `app.css`, give `.move-opt:disabled` a muted look from tokens
(`color: var(--faint)`, the mark at `--divider`), no opacity that would drop contrast below the
audit bar, and drop the old `.move-picker-reset` rule if nothing uses it.

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run --project web MovePicker`
Expected: PASS. Existing tests that asserted bumping are changed to the new rule.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/MovePicker.tsx apps/web/src/app.css apps/web/test/MovePicker.test.tsx
git commit -m "Web: the move picker never bumps, tags changed moves, shows the recommended set"
```

---

### Task 3: TeammateSuggestions: a list of teammates with + Add

**Files:**
- Modify: `apps/web/src/components/TeammateSuggestions.tsx`
- Modify: `apps/web/src/app.css` (new `.mate-*` rules; grep that the prefix is unused first)
- Test: `apps/web/test/teammateSuggestions.test.tsx` (create)

**Interfaces:**
- Consumes: `SuggestResult`, `TeamPick` from `@pickthree/engine`; `s.suggestion`,
  `s.suggestError`, `s.suggesting` from the store; `Tag`, `ErrorState` from `@pickthree/ui`;
  `PokemonToken`, `useName` from `../components.tsx`.
- Produces: `teammateOffers(result: SuggestResult, onBoard: string[]): TeammateOffer[]`,
  `interface TeammateOffer { speciesId: string; pick: TeamPick; standIn: boolean; line: string }`,
  and `TeammateSuggestions({ filled, onBoard, onAdd }: { filled: 1 | 2; onBoard: string[];
  onAdd(pick: TeamPick): void })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/test/teammateSuggestions.test.tsx
import { describe, expect, it } from 'vitest';
import type { SuggestResult } from '@pickthree/engine';
import { teammateOffers } from '../src/components/TeammateSuggestions.tsx';

const fill = (slot: 1 | 2, id: string, line: string, standIn = true) => ({
  slot,
  pick: standIn ? { kind: 'species' as const, id } : { kind: 'specimen' as const, id: `s-${id}` },
  speciesId: id,
  standIn,
  covers: [],
  line,
});

const result = (fills: ReturnType<typeof fill>[][]): SuggestResult =>
  ({
    pinLine: null,
    suggestions: fills.map((f, i) => ({
      character: 'safest',
      label: `Offer ${i}`,
      fills: f,
      chase: false,
      coverage: 0,
      cost: 0,
      sightings: null,
    })),
    assumptions: {},
    stats: { standIns: 0, poolSize: 0, cores: 0, simulatedRows: 0 },
    ms: 0,
  }) as unknown as SuggestResult;

describe('teammateOffers', () => {
  it("lists each offer's first fill, framed against the pins alone", () => {
    const r = result([
      [fill(1, 'azumarill', 'Beats Clodsire.'), fill(2, 'clodsire', 'With Azumarill...')],
      [fill(1, 'lickitung', 'Beats Medicham.'), fill(2, 'azumarill', 'With Lickitung...')],
    ]);
    expect(teammateOffers(r, ['tinkaton']).map((o) => o.speciesId)).toEqual([
      'azumarill',
      'lickitung',
    ]);
  });

  it('shows a species once and never one already on the board', () => {
    const r = result([
      [fill(1, 'azumarill', 'a')],
      [fill(1, 'azumarill', 'b')],
      [fill(1, 'tinkaton', 'c')],
      [fill(1, 'clodsire', 'd')],
    ]);
    expect(teammateOffers(r, ['tinkaton']).map((o) => o.speciesId)).toEqual([
      'azumarill',
      'clodsire',
    ]);
  });

  it('marks your own Pokémon', () => {
    const r = result([[fill(1, 'azumarill', 'a', false)]]);
    expect(teammateOffers(r, [])[0]).toMatchObject({ standIn: false, pick: { kind: 'specimen' } });
  });
});
```

Add a render test in the same file for the component: under `AppProvider` with a store holding a
suggestion is awkward, so render it through `Build` in Task 4 instead, and keep this file to the
pure function.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project web teammateSuggestions`
Expected: FAIL, `teammateOffers` is not exported.

- [ ] **Step 3: Rewrite the component**

```tsx
import type { SuggestResult, TeamPick } from '@pickthree/engine';
import { ErrorState, Tag } from '@pickthree/ui';
import { PokemonToken, useName } from '../components.tsx';
import { useAppState } from '../state/store.tsx';

export interface TeammateOffer {
  speciesId: string;
  pick: TeamPick;
  standIn: boolean;
  line: string;
}

/**
 * Each offer's first fill, one per species, none already on the board. Only the first fill's
 * reason is framed against the pins alone; a second fill's reason names the first, so it is left
 * for the next run, once the player has added a teammate.
 */
export function teammateOffers(result: SuggestResult, onBoard: string[]): TeammateOffer[] {
  const seen = new Set(onBoard);
  const out: TeammateOffer[] = [];
  for (const sug of result.suggestions) {
    const f = sug.fills[0];
    if (!f || seen.has(f.speciesId)) {
      continue;
    }
    seen.add(f.speciesId);
    out.push({ speciesId: f.speciesId, pick: f.pick, standIn: f.standIn, line: f.line });
  }
  return out;
}

/**
 * Teammates for the one or two Pokémon on the board, found on their own from the matchup matrix.
 * Nothing here fills a slot until the player taps a row; the verdict is Analyze's job.
 *
 * Spec: docs/superpowers/specs/2026-09-25-design-core-flow-design.md, "Build Your Team".
 */
export function TeammateSuggestions({
  filled,
  onBoard,
  onAdd,
}: {
  filled: 1 | 2;
  onBoard: string[];
  onAdd(pick: TeamPick): void;
}) {
  const s = useAppState();
  const name = useName();
  if (s.suggestError) {
    return <ErrorState line={s.suggestError} />;
  }
  const offers = s.suggestion ? teammateOffers(s.suggestion, onBoard) : [];
  if (offers.length === 0) {
    return s.suggesting ? <p className="meta">Finding teammates...</p> : null;
  }
  return (
    <section className="mate-list" aria-label="Suggested teammates">
      <h3 className="mate-head">
        {filled === 1 ? 'Best with your first pick' : 'Best with your first two'}
      </h3>
      {s.suggestion?.pinLine ? <p className="meta">{s.suggestion.pinLine}</p> : null}
      {offers.map((o) => (
        <button
          type="button"
          key={o.speciesId}
          className="mate-row"
          aria-label={`Add ${name(o.speciesId)}`}
          onClick={() => onAdd(o.pick)}
        >
          <PokemonToken speciesId={o.speciesId} size={40} />
          <span className="mate-text">
            <span className="mate-name">
              {name(o.speciesId)}
              {o.standIn ? null : <Tag>yours</Tag>}
            </span>
            <span className="meta">{o.line}</span>
          </span>
          <span className="mate-add" aria-hidden="true">
            + Add
          </span>
        </button>
      ))}
    </section>
  );
}
```

CSS in `app.css`, tokens only: `.mate-list` a column with 8px gap; `.mate-row` a full-width row
(min-height 44px, the card surface and divider border, `--r-card` radius, 12px padding, text
aligned left, `color: var(--text)`), `.mate-text` a column that can shrink (`min-width: 0`),
`.mate-name` a row with the tag, `.mate-add` in `--accent-text`, weight 600, `flex: none`;
`.mate-head` at the section-title size the app already uses for h3.

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run --project web teammateSuggestions`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/TeammateSuggestions.tsx apps/web/src/app.css apps/web/test/teammateSuggestions.test.tsx
git commit -m "Web: teammate suggestions are a list of teammates with + Add"
```

---

### Task 4: The Build screen

**Files:**
- Create: `apps/web/src/components/lineupCost.ts`
- Modify: `apps/web/src/screens/Build.tsx`
- Modify: `apps/web/src/app.css` (Build rules; grep every class you add or drop)
- Test: `apps/web/test/build.test.tsx`, `apps/web/test/lineupCost.test.ts` (create)

**Interfaces:**
- Consumes: `back(fallback?: Route)`, `suggestKey`, `suggestTeammates` (Task 1);
  `MovePicker` (Task 2); `TeammateSuggestions` (Task 3); `Header`, `Button`, `IconButton`, `Tag`,
  `Sheet`, `ErrorState` from `@pickthree/ui`; `CogGlyph` from `../components.tsx` (Teams uses it);
  `sumCosts`, `Cost`, `TeamPick` from `@pickthree/engine`; `costLine` from `../format.ts`.
- Produces: `lineupCost(picks, costOf): LineupCost` in `components/lineupCost.ts`.
- Produces: the rebuilt screen. Class names Task 5's capture script relies on: `.pick-card`,
  `.pick-card.empty`, `.pick-card.filled`, `.pick-x`, `.drag-grip`, `.search`, `.recent-token`,
  `.mate-row`, `.build-cost`, `.build-lineup`; the move sheet is the ui `Sheet`.

- [ ] **Step 1: Write the failing screen tests**

Add to `apps/web/test/build.test.tsx` (turn Task 1's two `todo` tests back on first). The
`pickFirst` helper is Task 1's.

```tsx
  it('puts Your lineup and Find best order above the cards, with the hint', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    const title = await screen.findByRole('heading', { name: 'Your lineup' });
    const find = screen.getByRole('button', { name: 'Find best order' });
    const firstCard = screen.getByRole('button', { name: 'Lead, empty' });
    expect(title.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(find.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(find).toBeDisabled();
    expect(screen.getByText('Tap a card to change its moves')).toBeInTheDocument();
    expect(screen.queryByText(/The cards run in the order shown/)).not.toBeInTheDocument();
  });

  it('names the slot being chosen and what that role does', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Safe Switch, empty' }));
    expect(screen.getByText('Choosing Safe Switch')).toBeInTheDocument();
    expect(screen.getByText('Comes in when the lead matchup goes badly')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search any Pokémon for Safe Switch')).toBeInTheDocument();
  });

  it('+ Add fills the first empty slot and the list goes once all three are in', async () => {
    const suggestTeammates = vi.fn(async () => offer);
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    fireEvent.click(await screen.findByRole('button', { name: 'Add Azumarill' }));
    await screen.findByRole('button', { name: 'Remove Azumarill' });
    expect(screen.getByRole('button', { name: 'Closer, empty' })).toBeInTheDocument();
    await pickFirst('clod', 'Clodsire');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Suggested teammates' })).not.toBeInTheDocument(),
    );
  });

  it('with none of yours, says there is nothing to price', async () => {
    // fakeHost has no collection, so every search pick is a species pick, not yours.
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await pickFirst('azu', 'Azumarill');
    await pickFirst('clod', 'Clodsire');
    expect(await screen.findByTestId('build-cost')).toHaveTextContent(
      'None of these are yours yet, so there is nothing to price.',
    );
  });

  it('Back returns to Teams when Build was the first screen', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(window.location.hash).toBe('#/teams'));
  });

  it('opens the move sheet from a card, with Analyze as the one primary button', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    fireEvent.click(await screen.findByRole('button', { name: 'Tinkaton moves' }));
    expect(await screen.findByRole('dialog', { name: /Tinkaton/ })).toBeInTheDocument();
    expect(document.querySelectorAll('.ui-btn-primary')).toHaveLength(1);
  });
```

Call `resetHistoryForTests()` in the `beforeEach` alongside the hash reset, so every test starts
with nothing behind it.

The owned-cost cases need a collection with verdicts, which `fakeHost` does not carry, so they
test the pure function instead. Create `apps/web/test/lineupCost.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Cost, TeamPick } from '@pickthree/engine';
import { lineupCost } from '../src/components/lineupCost.ts';

const cost = (stardust: number, xlCandy = 0): Cost => ({
  stardust,
  candy: 10,
  xlCandy,
  eliteTm: 0,
  evolutionCandy: 0,
  secondMoveUnlock: false,
  powerUpSteps: 0,
  estimated: false,
  weight: stardust,
});
const mine = (id: string): TeamPick => ({ kind: 'specimen', id });
const theirs = (id: string): TeamPick => ({ kind: 'species', id });

describe('lineupCost', () => {
  it('sums your own Pokémon and counts the ones not caught', () => {
    const r = lineupCost([mine('a'), mine('b'), theirs('clodsire')], (id) =>
      id === 'a' ? cost(100_000) : cost(50_000, 20),
    );
    expect(r.total?.stardust).toBe(150_000);
    expect(r.total?.xlCandy).toBe(20);
    expect(r.notCaught).toBe(1);
    expect(r.unpriced).toBe(0);
  });

  it('has no total when none are yours', () => {
    const r = lineupCost([theirs('a'), theirs('b'), theirs('c')], () => null);
    expect(r).toEqual({ total: null, notCaught: 3, unpriced: 0 });
  });

  it('counts a Pokémon of yours whose cost is not known yet', () => {
    const r = lineupCost([mine('a'), mine('b'), mine('c')], (id) => (id === 'a' ? cost(1) : null));
    expect(r.total?.stardust).toBe(1);
    expect(r.unpriced).toBe(2);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project web build`
Expected: FAIL on every new test (no heading, old placeholder, old footer, no cost, no Back
label, hand-rolled sheet).

- [ ] **Step 3: Rebuild the screen**

Changes to `Build.tsx`, top to bottom:

1. Imports: drop `Header` from `../components.tsx` (keep `Progress`: the verdict and move
   loading still use it); import `Header, Button, IconButton, Tag, Sheet, ErrorState` from
   `@pickthree/ui`, `CogGlyph` from `../components.tsx`, `lineupCost` from
   `../components/lineupCost.ts`, `costLine` from `../format.ts`, `suggestKey` from
   `../state/store.tsx`.
2. Role jobs next to `SLOT_LABELS`:

```ts
/** Each slot's job in one line, shortened from GLOSSARY in components.tsx. */
const ROLE_JOBS = [
  'Opens the battle and usually decides the first shield exchange',
  'Comes in when the lead matchup goes badly',
  'Finishes the battle after shields are gone',
] as const;
```

3. Actions: take `back`, `openSheet` and drop `takeSuggestion`; remove the `taken` state,
   `askForTeammates`, `swapSuggestion` and `canSuggest`.
4. Automatic suggestions, after `pinned` is computed:

```ts
  const league = s.settings.league ?? 'great';
  const boardKey = suggestKey(s.picks, league);
  const lastAsked = useRef<string | null>(null);
  // Runs on its own whenever the board has one or two picks and has changed since the last ask.
  // A run in flight finishes (and is dropped if the board moved on); this effect then asks again.
  useEffect(() => {
    if (
      pinned === 0 ||
      pinned === 3 ||
      s.boot !== 'ready' ||
      !s.leagueInfo ||
      s.analyzing ||
      s.suggesting ||
      lastAsked.current === boardKey
    ) {
      return;
    }
    lastAsked.current = boardKey;
    void suggestTeammates();
  }, [boardKey, pinned, s.boot, s.leagueInfo, s.analyzing, s.suggesting, suggestTeammates]);
```

   (`league` is already declared further down for `poolKey`; declare it once, above both.)
5. + Add:

```ts
  const addTeammate = (pick: TeamPick): void => {
    const slot = s.picks.findIndex((p) => p === null);
    if (slot < 0) {
      return;
    }
    setPick(slot, pick);
    setOrderedByPick3(false);
  };
  const onBoard = s.picks.map((p) => pickInfo(p)?.speciesId).filter((id): id is string => !!id);
```

6. Total cost. Create `apps/web/src/components/lineupCost.ts`:

```ts
import { sumCosts, type Cost, type TeamPick } from '@pickthree/engine';

export interface LineupCost {
  /** Your own Pokémon's build cost summed, or null when none has a known cost. */
  total: Cost | null;
  /** Species picks: not yours, so there is nothing of yours to power up. */
  notCaught: number;
  /** Your own Pokémon whose cost is not known yet (its verdict has not arrived). */
  unpriced: number;
}

export function lineupCost(
  picks: readonly (TeamPick | null)[],
  costOf: (specimenId: string) => Cost | null,
): LineupCost {
  const priced: Cost[] = [];
  let notCaught = 0;
  let unpriced = 0;
  for (const p of picks) {
    if (!p) {
      continue;
    }
    if (p.kind === 'species') {
      notCaught += 1;
      continue;
    }
    const c = costOf(p.id);
    if (c) {
      priced.push(c);
    } else {
      unpriced += 1;
    }
  }
  return { total: priced.length > 0 ? sumCosts(priced) : null, notCaught, unpriced };
}
```

   In `Build.tsx`:

```ts
  const allIn = s.picks.every(Boolean);
  const cost = lineupCost(s.picks, (id) => s.verdicts[id]?.cost ?? null);
```

7. The JSX, replacing everything inside `<div className="screen">`:

```tsx
    <div className="screen">
      <Header
        variant="sub"
        title="Build Your Team"
        back={{ label: 'Back', onClick: () => back({ screen: 'teams' }) }}
        actions={
          <IconButton label="Settings" onClick={openSheet}>
            <CogGlyph />
          </IconButton>
        }
      />
      <div className="scroll build-scroll">
        <LeagueSwitcher compact />
        {target !== null ? (
          <div className="build-choose">
            <p className="build-choosing">
              <b>Choosing {SLOT_LABELS[target]}</b>
              <span className="meta">{ROLE_JOBS[target]}</span>
            </p>
            <input
              ref={searchRef}
              className="search"
              placeholder={`Search any Pokémon for ${SLOT_LABELS[target]}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => setTarget(null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setTarget(null);
                }
              }}
              inputMode="search"
            />
            {/* the existing "Matches"/"Suggested" label, grid, "Nothing matches.", the
                no-collection line (with "Pokémon") and the verdicts Progress, unchanged */}
          </div>
        ) : null}

        <div className="build-lineup">
          <div className="build-lineup-head">
            <h3>Your lineup</h3>
            <Button variant="text" disabled={!ready} onClick={() => void findBest()}>
              {finding ? 'Finding...' : 'Find best order'}
            </Button>
          </div>
          <p className="meta">
            {orderedByPick3 ? 'Ordered by pick3. Drag a card to change it.' : 'Tap a card to change its moves'}
          </p>
        </div>

        {/* the existing .pick-cards block, unchanged except: the empty card's line reads
            "Tap to pick a Pokémon.", and the filled card's "moves changed" tag becomes
            <Tag>Moves changed</Tag> inside moveLines */}

        {allIn ? (
          <div className="build-cost" data-testid="build-cost">
            {cost.total ? (
              <>
                <span className="meta">Total to build</span>
                <span>{costLine(cost.total)}</span>
              </>
            ) : cost.notCaught === 3 ? (
              <span className="meta">None of these are yours yet, so there is nothing to price.</span>
            ) : null}
            {cost.notCaught > 0 && cost.notCaught < 3 ? (
              <span className="meta">Not counting {cost.notCaught} you have not caught</span>
            ) : null}
            {cost.unpriced > 0 ? (
              <span className="meta">Not counting {cost.unpriced} not priced yet</span>
            ) : null}
          </div>
        ) : null}

        {target === null && (pinned === 1 || pinned === 2) ? (
          <TeammateSuggestions filled={pinned} onBoard={onBoard} onAdd={addTeammate} />
        ) : null}

        {s.analyzeError ? <ErrorState line={s.analyzeError} /> : null}
        {s.analyzing && s.progress ? (
          <Progress stage={s.progress.stage} done={s.progress.done} total={s.progress.total} />
        ) : null}
        <Button variant="primary" disabled={!ready} onClick={() => void analyze()}>
          {s.analyzing && !finding ? 'Analyzing...' : 'Analyze this team'}
        </Button>
      </div>
      {movesSlot !== null && sheetPick && sheetInfo ? (
        <Sheet
          onClose={closeMoves}
          root={{
            id: 'moves',
            title: sheetInfo.title,
            render: () =>
              sheetPool ? (
                <MovePicker
                  pool={sheetPool}
                  value={sheetPick.moves ?? sheetPool.recommended}
                  onChange={(next) => setMoves(movesSlot, sheetPick, next)}
                />
              ) : (
                <Progress stage="moves" done={0} total={0} />
              ),
          }}
        />
      ) : null}
    </div>
```

   `pinned` is typed `number`; narrow it for the `filled` prop (`pinned as 1 | 2` inside the
   guarded branch is fine). Delete `movesLine` (the picker shows the recommended set now) and the
   footer paragraph. Keep the drag, pools and verdict effects as they are. Check the `Sheet`
   props (`root`, `onClose`, `doneLabel`) and the `ErrorState` and `Header` props against
   `packages/ui/src/components/` before writing them.
8. CSS in `app.css`: `.build-scroll` (the old inline `gap: 16`), `.build-choose`,
   `.build-choosing` (column, 2px gap), `.build-lineup-head` (row, space-between, baseline),
   `.build-cost` (column, 4px gap, the card surface). Remove rules for classes that no longer
   exist (`.order-row` and any others; grep each before deleting). Tokens only.

- [ ] **Step 4: Run the web project**

Run: `npx vitest run --project web`
Expected: PASS. Older Build tests that clicked "Suggest teammates", the chips, "Find the best
order" or the hand-rolled sheet are updated to the new controls.

- [ ] **Step 5: Full checks**

Run: `npm test && npm run lint && npm run typecheck && npm run check-colors`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/screens/Build.tsx apps/web/src/components/lineupCost.ts apps/web/src/app.css apps/web/test/build.test.tsx apps/web/test/lineupCost.test.ts
git commit -m "Web: Build Your Team on the foundation: lineup, choosing line, suggestions, cost, one primary action"
```

---

### Task 5: Captures, the enforced audit, fixes

**Files:**
- Modify: `apps/web/scripts/screens.mjs` (the "suggest teammates around one pin" block near line
  604, the "build a team" block near line 629, the move sheet step near line 697,
  `AUDIT_ENFORCED`)
- Modify: whatever the audit findings point at (Build.tsx, app.css, packages/ui)

**Interfaces:**
- Consumes: Task 4's class names; `scripts/audit.mjs` (`auditPage`, `forEachTheme`); the shot
  helper's `mustShow` option.
- Produces: enforced captures `build-empty`, `build-choosing`, `build-suggestions`, `13-build`,
  `13b-build-moves`, in both themes; Task 6 uses these names.

- [ ] **Step 1: Update the capture flow**

- "suggest teammates around one pin": no button any more. After picking Skarmory, wait for
  `.mate-row` (30 s), assert the board still has exactly one `.pick-card.filled` (suggestions must
  not fill slots; throw otherwise), then `shot('build-suggestions', false)`. Remove the old
  `12c-suggest-teammates` shot.
- Before it, on the empty board: `shot('build-empty', false)`; then open the Lead slot, wait for
  `.recent-token`, `shot('build-choosing', false)`, press Escape.
- "build a team": unchanged picking, then scroll `.build-cost` into view before `13-build` so the
  total shows; assert `.build-cost` exists.
- Move sheet: with two charged moves ticked the others are disabled now. Untick one ticked
  charged move first (`.move-opt[role="checkbox"].on`), then tick the first enabled unticked one,
  then `shot('13b-build-moves', false)`. Wait on the ui `Sheet`'s dialog, not the old `.sheet`.
- Add the five names to `AUDIT_ENFORCED`.

- [ ] **Step 2: Run the audit and fix what it finds**

Run: `npm run web:audit`
Expected at first: findings on the new Build screens. Fix each at its source (component or
tokens), never by un-enforcing a screen. Look at every capture in `apps/web/screenshots/` for the
five names in both themes before calling a finding fixed: the audit does not see stray boxes,
double borders, misalignment with the gutter or text over the tab bar.

Carry-forward from the Teams branch: a single-type **Shadow** token with a letter (sprites off)
stays "unverified" in the audit because of `.token-shadow-wrap::before`. Build shows Shadow picks,
so this may surface here. Resolve it the way split discs were: mark the case static
(`data-audit-contrast="static"`) with a unit test in `packages/ui/test/contrast.test.ts` that
composites the letter over its halo over the shadow backdrop for every type in both themes, or
teach `measureBelowOpaque` in `scripts/audit.mjs` to handle it. Do not remove the Shadow marker.

- [ ] **Step 3: Re-run until clean**

Run: `npm run web:audit` (exit 0, zero findings on every enforced screen, no console errors),
`npm run ui:audit`, `npm run meta:screens`, `npm test`, `npm run lint`, `npm run typecheck`,
`npm run check-colors`.

- [ ] **Step 4: Commit**

Stage the script and each fixed file by path.

```bash
git commit -m "Web: Build screens join the enforced audit, clean in dark and light"
```

---

### Task 6: The Build audit record

**Files:**
- Create: `docs/design/audits/build.md` (from `docs/design/audits/_template.md`, modeled on
  `docs/design/audits/teams.md`)
- Create: `docs/design/audits/img/build-*.webp` and `img/13-build-*.webp`,
  `img/13b-build-moves-*.webp` (from `apps/web/screenshots/<name>-dark.png` and `-light.png`,
  converted with sharp at the repo root the same way the Teams images were)

- [ ] **Step 1: Convert and look**

Convert every enforced Build capture in both themes to WebP. Open each before describing it.

- [ ] **Step 2: Write the record**

Sections as in `teams.md`: screenshots table (all five names, both themes), automated checks
(run date and counts), the aesthetics and functionality checklists ticked only where a capture or
a test supports the tick (otherwise unticked with a one-line reason), findings and fixes with
commits, the rulings from this plan's "Rulings" section with their costs, and "Visible changes
outside Build" (anything in packages/ui or shared CSS that moved). The sign-off line stays
unticked.

- [ ] **Step 3: Commit**

```bash
git add docs/design/audits/build.md docs/design/audits/img/build-*.webp docs/design/audits/img/13-build-*.webp docs/design/audits/img/13b-build-moves-*.webp
git commit -m "Design: Build Your Team audit record"
```

Report the record's path. Travis signs it; the Analysis plan starts after he does.
