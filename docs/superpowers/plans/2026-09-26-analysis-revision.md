# Team Analysis Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the shipped Team Analysis page the way Travis drew it: a hero card (the number,
structure, fit, Edit pencil, the team, the difficulty line, factor bars), Take to battle under it,
then Threats and When to switch; the battle plan, jump buttons and written breakdown go. Teams
rows gain the number.

**Architecture:** `ScoreCard` becomes the hero card and takes over the strip and the Edit action;
`Matchups` splits into `Threats`, `SwitchList` and `KeyWins`; `BattlePlan` is deleted. The engine
is untouched. `TeamRowSummary` adds the number. Captures and the two records follow.

**Tech Stack:** React 19, TypeScript 5.9 strict, vitest 4 + jsdom + Testing Library, puppeteer-core.

**Spec:** `docs/superpowers/specs/2026-09-25-design-core-flow-design.md`, "Team Analysis" (revised
2026-09-26) and the `TeamRowSummary` and `ScoreCard` rows of "Shared team components". Records:
`docs/design/audits/analysis.md` (unsigned) and `docs/design/audits/teams.md` (signed; add a row).
Reference renders (DOM surgery on the live page, not code): the controller's
`hero-top.png` and `hero-threats.png` in the session scratchpad; the brief paths are given by the
controller.

## Global Constraints

- Exact pinned versions; braces on all control flow; no em dashes anywhere (code, docs, commit
  messages); "Pokémon" with the accent.
- Tokens only (`npm run check-colors`); no new class that another screen already styles (grep
  `apps/web/src/app.css` first).
- 44px touch targets; pink only for measured data; the factor bars are read-only (no hover or
  pointer affordance).
- Engine strings only in Threats and When to switch; no invented matchup copy.
- Stage explicit paths; commit messages: subject alone on line 1, a blank line, body, trailers;
  write the message to a file and `git commit -F`.
- Never kill a process you did not start.

## Rulings made while writing this plan

1. **Bar labels:** Coverage, Consistency, Safety, Affordable (the cost factor; full means cheap),
   Accessibility (the factor counts power-ups left; full means fewer). No numbers on the bars.
   Each bar has an accessible name with its value ("Coverage 99 of 100") for screen readers.
   [Labels.]
2. **"and N more beat this team":** N is `score.uncoveredOpponents.length` minus the listed
   threats that are in `uncoveredOpponents`; shown only when N > 0. [One count.]
3. **When to switch** drops opponents already listed under Threats, shows five, "Show all" up to
   eight. [Numbers.]
4. **Strip names wrap** to two lines (no ellipsis) inside the card. [CSS.]
5. **`.custom-note`** moves to the notes block under Take to battle (the capture script reads
   it). [Selector.]

## Review Focus

1. A custom team: three bars and "To build all three: ...", never an Affordable bar.
2. A team with no threats: Threats shows today's "Nothing in the meta group beats all three"
   sentence and no count; When to switch still renders.
3. A threat that is also first in the switch plan: listed once, under Threats.
4. Long names (Shadow Greninja, Galarian Corsola) in the card strip at 390px: two lines, no
   ellipsis, no overflow.
5. The pencil opens Build with the team loaded (today's `editInBuild`), for recommended and
   custom teams.

---

### Task 1: The hero card

**Files:**
- Modify: `apps/web/src/components/team/ScoreCard.tsx`, `apps/web/src/app.css`
- Test: `apps/web/test/analysisComponents.test.tsx`

**Interfaces:**
- Produces: `ScoreCard({ team, custom, onTakeToBattle, onEdit, onShowMember })` where
  `onEdit: () => void` and `onShowMember: (i: number) => void`. It renders the card, then the
  Take to battle `Button`, then the custom notes block (`className="score-notes custom-note"`,
  only when `custom`).

- [ ] **Step 1: Failing tests** (replace the old ScoreCard tests)

```tsx
describe('ScoreCard, the hero card', () => {
  it('shows the number alone, the structure, the fit and five bars', () => {
    const team = makeTeam({ battle: 81.6, total: 64 });
    wrap(<ScoreCard team={team} custom={null} onTakeToBattle={() => undefined} onEdit={() => undefined} onShowMember={() => undefined} />);
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.queryByText(/\/ 100/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Balanced ABC|ABB line/ })).toBeInTheDocument();
    for (const label of ['Coverage', 'Consistency', 'Safety', 'Affordable', 'Accessibility']) {
      expect(screen.getByRole('meter', { name: new RegExp(`^${label} \\d+ of 100$`) })).toBeInTheDocument();
    }
    expect(screen.queryByText(/Run it in this order/)).not.toBeInTheDocument();
  });

  it('a custom team shows three bars and what it costs to build', () => {
    const team = makeTeam({ battle: 70, total: 60 });
    const analysis = { team, orders: [], hypothetical: [], chosenMoves: [], unranked: [], assumptions: {} as never, ms: 0 } as unknown as import('@pickthree/engine').TeamAnalysis;
    wrap(<ScoreCard team={team} custom={{ analysis, best: null, shared: false, leagueTitle: 'Great League' }} onTakeToBattle={() => undefined} onEdit={() => undefined} onShowMember={() => undefined} />);
    expect(screen.getAllByRole('meter')).toHaveLength(3);
    expect(screen.queryByRole('meter', { name: /Affordable/ })).not.toBeInTheDocument();
    expect(screen.getByText(/^To build all three:/)).toBeInTheDocument();
  });

  it('the pencil edits and a strip tap shows that Pokémon', () => {
    const onEdit = vi.fn();
    const onShowMember = vi.fn();
    const team = makeTeam();
    wrap(<ScoreCard team={team} custom={null} onTakeToBattle={() => undefined} onEdit={onEdit} onShowMember={onShowMember} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit team' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: /Lead|Switch|Closer/ })[1]!);
    expect(onShowMember).toHaveBeenCalledWith(1);
  });
});
```

Keep the existing custom-notes test (best recommended team, assumed IVs, chosen moves,
unranked, orders) adapted to the new props, and assert the notes sit in `.custom-note`. Adjust
the strip button names to however the strip labels its buttons (read today's TeamDetail strip).

- [ ] **Step 2: Run them and see them fail** (`npx vitest run --project web analysisComponents`).

- [ ] **Step 3: Implement**

Card markup, in order:
1. Top row (`.hero-top`, flex, space-between, align start): left `.hero-id` = the number
   (`.hero-num`, 56px/700, `--text`) and a column with the structure `Term` (GLOSSARY entry) and
   the fit `FitTag`; right an `IconButton` labeled "Edit team" with a pencil glyph (add
   `PencilGlyph` beside `CogGlyph` in `components.tsx`: a 20px stroke pencil, `currentColor`).
2. A 1px `--divider` rule.
3. The strip (move today's TeamDetail strip markup here, class `.analysis-strip`, buttons call
   `onShowMember(i)`); names wrap to two lines (`overflow-wrap: anywhere; text-align: center`, no
   ellipsis).
4. The difficulty line, `.meta`, centered: "{difficulty} to play: {difficultyWhy}".
5. A 1px rule.
6. Bars (`.hero-bars`, a two-column grid: label, track). Each bar is
   `<div role="meter" aria-label="Coverage 99 of 100" aria-valuemin={0} aria-valuemax={100}
   aria-valuenow={99}>` with a track (`--surface2`, 10px, radius 999) and a fill (`--accent`,
   `width: N%`). Values are the `team.score.factors` fields rounded (check the names in
   `packages/engine/src/score/score.ts`). Custom teams: Coverage, Consistency, Safety only, then a
   `.meta` line "To build all three: {costLine(team.cost)}".

After the card: the Take to battle `Button variant="primary"` (full width), then, for custom
teams, the notes block with today's lines, minus "Run it in this order" and minus "Run in the
order you picked"; keep the tried-orders line when more than one order was tried.

Remove the old `.score-head`, `.score-line`, `.score-order` rules if nothing else uses them.

- [ ] **Step 4: Run, then commit** (`Web: the Team Analysis hero card: the number, structure, fit, Edit, the team, factor bars`).

---

### Task 2: Threats, When to switch, Key wins

**Files:**
- Create: `apps/web/src/components/team/Threats.tsx` (exports `Threats`, `SwitchList`, `KeyWins`)
- Delete: `apps/web/src/components/team/Matchups.tsx` and its tests (move what still applies)
- Test: `apps/web/test/analysisComponents.test.tsx`

**Interfaces:**
- Produces: `Threats({ team })`, `SwitchList({ team, leadName })`, `KeyWins({ team })`.

- [ ] **Step 1: Failing tests**

```tsx
describe('Threats', () => {
  it('lists the engine threats as rows and counts the rest that beat the team', () => {
    const team = makeTeam();
    team.explanation.keyThreats = [threat('a', 'A line.'), threat('b', 'B line.')];
    team.score.uncoveredOpponents = ['a', 'b', 'c', 'd', 'e'];
    wrap(<Threats team={team} />);
    expect(screen.getAllByTestId('threat-row')).toHaveLength(2);
    expect(screen.getByText('and 3 more beat this team')).toBeInTheDocument();
  });

  it('says so when nothing beats all three', () => {
    const team = makeTeam();
    team.explanation.keyThreats = [];
    team.score.uncoveredOpponents = [];
    wrap(<Threats team={team} />);
    expect(screen.getByText(/Nothing in the meta group beats all three/)).toBeInTheDocument();
    expect(screen.queryByText(/more beat this team/)).not.toBeInTheDocument();
  });
});

describe('SwitchList', () => {
  it('skips opponents already under Threats, shows five, Show all up to eight', () => {
    const team = makeTeam();
    team.explanation.keyThreats = [threat('o1', 'x')];
    team.explanation.switchPlan = Array.from({ length: 10 }, (_, i) => switchRow(`o${i + 1}`));
    wrap(<SwitchList team={team} leadName="Tinkaton" />);
    expect(screen.queryByTestId('switch-o1')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^switch-/)).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getAllByTestId(/^switch-/)).toHaveLength(8);
  });
});
```

`threat(id, line)` and `switchRow(id)` are small helpers in the test file building a
`KeyMatchup` / `SwitchAdvice` from `makeTeam`'s defaults (spread an existing entry, set
`opponent`, `opponentName`, `line`).

- [ ] **Step 2: Implement**

- `Threats`: `h3.analysis-section` "Threats" (id `threats`), rows in today's `.switch-row`
  shape (token 32, name, `TypeChips`, `RankTag`, the engine `line` in `.meta`), each
  `data-testid="threat-row"`; the count line per Ruling 2; the empty sentence as today.
- `SwitchList`: `h3` "When to switch" (id `switch`), today's intro line with `leadName`, today's
  empty sentence, rows as today (`data-testid={`switch-${opponent}`}`) minus Threats' opponents,
  five then a text `Button` "Show all"/"Show less" (`ariaExpanded`) up to eight.
- `KeyWins`: `h3` "Key wins", the `keyWins` as the same compact rows.
- Delete `Matchups.tsx` and the `.matchup-*` CSS nothing else uses.

- [ ] **Step 3: Run, then commit** (`Web: Threats first, then When to switch without repeats, Key wins as rows`).

---

### Task 3: The screen, and the number on Teams

**Files:**
- Modify: `apps/web/src/screens/TeamDetail.tsx`, `apps/web/src/components/team/WhyThisTeam.tsx`,
  `apps/web/src/components/team/TeamRowSummary.tsx`, `apps/web/src/app.css`
- Delete: `apps/web/src/components/team/BattlePlan.tsx` and its tests
- Test: `apps/web/test/teamDetail.test.tsx`, `apps/web/test/teamComponents.test.tsx`,
  `apps/web/test/analysisComponents.test.tsx`

- [ ] **Step 1: Failing tests**
  - Team Analysis: no "Battle plan" heading and no jump buttons; "Threats" comes before "When to
    switch", which comes before "Your Pokémon"; the pencil loads the team into Build and lands on
    `#/build`; the strip tap still opens its row.
  - WhyThisTeam: no breakdown sentence ("Battle strength ... is coverage" gone).
  - TeamRowSummary: the line reads `88 · Strong fit · Demanding · 805,320 Stardust` for a team
    with those values (use `SEP`; match the text with a regex that allows the non-breaking space).

- [ ] **Step 2: Implement**
  - TeamDetail order: header; `ScoreCard` (with `onEdit={editInBuild}`,
    `onShowMember={showMember}`); `Threats`; `SwitchList`; "Your Pokémon" (`PokemonDetails`);
    `KeyWins`; "Why this team"; "Alternatives you own"; "Assumptions and detail". Remove the
    strip, the strip line, `.analysis-edit`, the jump nav and the Battle plan section. Keep the
    Loading, error and not-found states and `back(fallback)` as they are.
  - WhyThisTeam: drop the breakdown `<p>`.
  - TeamRowSummary: prefix the number (`Math.round(team.score.battle)`).
  - Delete `BattlePlan.tsx`, its tests and `.plan-*` CSS; `.analysis-jumps` and `.analysis-edit`
    CSS; keep `scroll-margin-top` on `.pd-row` (the strip tap still scrolls).

- [ ] **Step 3: Full checks, commit** (`Web: Team Analysis leads with threats; Teams rows show the number`).

---

### Task 4: Captures, audit, records

**Files:** `apps/web/scripts/screens.mjs`, the captures, `docs/design/audits/analysis.md`,
`docs/design/audits/teams.md`, `docs/design/audits/img/`.

- [ ] Update screens.mjs for the moved selectors (the jump check goes; the strip-tap check stays
  and now taps inside the card; `.custom-note` is the notes block). Run `npm run web:audit` (exit
  0 on every enforced name, Teams included, since its rows changed).
- [ ] Look at every Analysis capture and the Teams captures in both themes: names on two lines,
  bars aligned, nothing clipped, the page reads like the renders. Fix what you see.
- [ ] Re-convert the changed WebPs (the six Analysis names; the Teams names whose rows show the
  number). Update `analysis.md` (screenshots, checklists, a findings row for the revision with
  Travis's words from the spec, the removed sections) and add an "After sign-off" row to
  `teams.md` for the number on the rows with the re-converted images. Sign-off lines unchanged
  (analysis unticked; teams stays signed with the new row).
- [ ] Commit (`Design: records for the Team Analysis revision and the number on Teams rows`).
