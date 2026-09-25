# Core Flow: Team Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Team Analysis on the design foundation: a score card with battle strength as
the headline and Take to battle as its one primary action, jump buttons, a battle plan written
only from engine data, matchups to remember, one expandable row per Pokémon, and an audit record
Travis signs. This is the last page of piece 2.

**Architecture:** The engine's custom analysis orders its tried orders by battle strength, like
the Teams list. Five app-level components in `apps/web/src/components/team/` (`ScoreCard`,
`BattlePlan`, `Matchups`, `PokemonDetails`, `WhyThisTeam`) each take a `TeamRecommendation` and
plain props, with their own tests. `screens/TeamDetail.tsx` is then rewritten to compose them with
`@pickthree/ui` (`Header`, `IconButton`, `Button`, `ConfirmSheet`, `Empty`, `ExpandRow`, `Term`).

**Tech Stack:** React 19, TypeScript 5.9 strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), vitest 4 + jsdom + Testing Library, puppeteer-core audit scripts.

**Spec:** `docs/superpowers/specs/2026-09-25-design-core-flow-design.md` (sections "Decisions",
"Shared team components", "Team Analysis", "Navigation", "Testing", "Done for piece 2").
Foundation: `docs/superpowers/specs/2026-09-24-design-foundation-design.md`. Record models:
`docs/design/audits/teams.md` and `docs/design/audits/build.md` (both signed 2026-09-25).

## Global Constraints

- Exact pinned versions in every package.json. No `^` or `~`.
- Braces on all control flow, even one-line bodies (eslint `curly: all`).
- No em dashes anywhere: code, CSS comments, docs, commits, UI copy.
- "Pokémon" with the accent in all UI copy.
- New CSS uses tokens only; `npm run check-colors` must pass, and the baseline may only shrink.
- App-level classes must not reuse a class name another screen already styles: grep
  `apps/web/src/app.css` before adding one (Teams once shipped a `.team-row` collision).
- Touch targets at least 44px.
- Pink only for measured data; tags are neutral `Tag`s; red only for destroying data.
- Separators: a "·" stays with the word before it (`SEP` from `apps/web/src/format.ts`).
- The battle plan and matchups print only strings the engine produces; no invented copy about a
  specific matchup.
- The collection never leaves the device; Share sends species and moves only (today's
  `teamLink`). Keep the CSP untouched.
- Stage explicit paths when committing, never `git add -A`. Commit messages end with a
  `Co-Authored-By: <the model that wrote the commit> <noreply@anthropic.com>` trailer.
- Run commands from the repo (or worktree) root. Windows, Git Bash. Never kill a process you did
  not start.

## Rulings made while writing this plan

Cost if wrong in brackets.

1. **Tried orders sort by battle strength**, ties by total (`compareTeamScores`), so "pick3 tried
   all six orders. Best: ..." and Build's Find best order pick the strongest order, matching the
   Teams list and the battle headline. `OrderTried` gains `battle`. [One sort line and a field.]
2. **Back:** custom team falls back to Build, a recommended team to Teams; a shared link opened
   fresh falls back to Teams. **Edit team** is a separate labeled text action under the strip
   (today's `editInBuild`). [Fallback routes.]
3. **"Run it in this order: A, B, C."** shows on every score card; custom teams add today's
   orders-tried line under it. [One line.]
4. **The strip keeps one supporting line**: structure as a `Term` and "Demanding to play: why",
   as on Teams' open row. [One line.]
5. **Jump buttons are text `Button`s** in one row (Battle plan, Matchups, Pokémon, Details); each
   scrolls its section into view. "Details" is the Why this team section, followed by
   Alternatives and Assumptions. [A different control.]
6. **The score breakdown line** reads: "Battle strength N is coverage, consistency and safety.
   The total, T, also counts cost (C) and accessibility (A)." with the factor numbers. [Copy.]
7. **`StructureTag` and `GLOSSARY['line']` are removed** once TeamDetail stops using them; the
   structure is a `Term` like Teams. [None.]
8. **Take to battle stays on shared teams** (today's behavior) and asks through `ConfirmSheet`
   only when a different set is running. [None.]

## Review Focus

1. **A team whose lead has no switch plan, no key threats, no form note and no keep-shield
   advice.** The battle plan must render only what exists (no empty step, no placeholder text).
   Test in Task 2.
2. **Opening an analysis link fresh (shared link, reload on `#/team/custom` with no analysis in
   state).** The not-found state shows `Empty` with a Button to Build or Teams, and Back stays in
   pick3. Test in Task 4.
3. **Take to battle while another team's set is running.** The confirm sheet names the running
   team and its logged count; Cancel leaves the set alone; Confirm starts the new set and opens
   Log a battle. Test in Task 4.
4. **A Pokémon with more than six safe types.** "+N more" expands and collapses per row, and
   opening one row's list does not open another's. Test in Task 3.
5. **Tapping a strip Pokémon whose details row is closed.** Its row opens and scrolls into view;
   the other rows keep their state. Test in Task 4.

---

### Task 1: Engine: tried orders sort by battle strength

**Files:**
- Modify: `packages/engine/src/analyze.ts` (the `scored.sort` near line 302, the `orders` map
  near line 311, `OrderTried` near line 73)
- Test: `packages/engine/test/analyze.test.ts` (the case "tries all six orders and keeps the
  best", lines 66-83, which pins the old total-first order)

**Interfaces:**
- Consumes: `compareTeamScores(a, b)` from `packages/engine/src/recommend.ts`.
- Produces: `OrderTried.battle: number` (the order's `score.battle`, rounded to a whole number),
  and `TeamAnalysis.orders` sorted by `compareTeamScores`.

- [ ] **Step 1: Write the failing test**

In `packages/engine/test/analyze.test.ts`, change the case "tries all six orders and keeps the
best" (it runs `analyzeTeam(picks, specimens, {}, deps)` at line 72). Replace its ordering loop
and its `orders[0]` assertion with:

```ts
    expect(r.orders).toHaveLength(6);
    for (let i = 1; i < r.orders.length; i++) {
      expect(r.orders[i]!.battle).toBeLessThanOrEqual(r.orders[i - 1]!.battle);
    }
    expect(r.orders[0]!.battle).toBe(Math.round(r.team.score.battle));
    expect(r.orders[0]!.slots).toEqual(r.team.slots.map((s) => s.candidate.build.speciesId));
```

Keep the case's other assertions. The last line pins that the team returned is the first order.
`battle` is rounded, so the loop checks only that it never goes up; the tie-break by total is
`compareTeamScores`' own, already tested in the engine.

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --project engine analyze`
Expected: FAIL (`battle` is undefined on `OrderTried`, or the order is by total).

- [ ] **Step 3: Implement**

```ts
export interface OrderTried {
  /** Species ids as lead, safe switch, closer. */
  slots: [string, string, string];
  names: [string, string, string];
  /** Battle strength, the headline number, rounded. Orders are sorted by it. */
  battle: number;
  total: number;
  fit: Fit;
}
```

Replace `scored.sort((a, b) => b.score.total - a.score.total);` with
`scored.sort((a, b) => compareTeamScores(a.score, b.score));` (import it from `./recommend.js`;
if that import would be circular, move `compareTeamScores` to `score/score.ts` and re-export it
from `recommend.ts` so existing imports keep working). In the `orders` map add
`battle: Math.round(score.battle),`.

- [ ] **Step 4: Run the engine project**

Run: `npx vitest run --project engine`
Expected: PASS. A snapshot that pins the old best order changes only if a different order now
wins; if one does, keep the new snapshot and say which in the report.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/analyze.ts packages/engine/test/<the analyze test file>
git commit -m "Engine: a custom analysis tries orders strongest in battle first"
```

---

### Task 2: ScoreCard and BattlePlan

**Files:**
- Create: `apps/web/src/components/team/ScoreCard.tsx`, `apps/web/src/components/team/BattlePlan.tsx`
- Modify: `apps/web/src/app.css` (new `.score-*` and `.plan-*` rules; grep first)
- Test: `apps/web/test/analysisComponents.test.tsx` (create)

**Interfaces:**
- Consumes: `TeamRecommendation`, `TeamAnalysis` from `@pickthree/engine`; `Button` from
  `@pickthree/ui`; `FitTag`, `useName` from `../../components.tsx`; `fitWhy`, `SEP` from
  `../../format.ts`; `makeTeam` from `apps/web/test/teamFixture.ts` (tests).
- Produces:
  - `interface CustomNotes { analysis: TeamAnalysis; best: TeamRecommendation | null; shared: boolean; leagueTitle: string }`
  - `ScoreCard({ team, custom, onTakeToBattle }: { team: TeamRecommendation; custom: CustomNotes | null; onTakeToBattle: () => void })`
  - `BattlePlan({ team }: { team: TeamRecommendation })`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/test/analysisComponents.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BattlePlan } from '../src/components/team/BattlePlan.tsx';
import { ScoreCard } from '../src/components/team/ScoreCard.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { fakeHost } from './fakeHost.ts';
import { makeTeam } from './teamFixture.ts';

const wrap = (ui: React.ReactNode) => render(<AppProvider host={fakeHost()}>{ui}</AppProvider>);

describe('ScoreCard', () => {
  it('headlines battle strength, not the total, with one primary action', () => {
    const team = makeTeam({ battle: 81.6, total: 64 });
    const take = vi.fn();
    wrap(<ScoreCard team={team} custom={null} onTakeToBattle={take} />);
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.queryByText('64')).not.toBeInTheDocument();
    expect(screen.getByText(/^Run it in this order:/)).toBeInTheDocument();
    screen.getByRole('button', { name: 'Take to battle' }).click();
    expect(take).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('.ui-btn-primary')).toHaveLength(1);
  });

  it('adds the custom notes: best recommended, assumed IVs, chosen moves, unranked, orders', () => {
    const team = makeTeam({ battle: 70, total: 60 });
    const best = makeTeam({ battle: 88, total: 70 });
    const analysis = {
      team,
      orders: [
        { slots: ['a', 'b', 'c'], names: ['A', 'B', 'C'], battle: 70, total: 60, fit: 'Solid' },
        { slots: ['c', 'b', 'a'], names: ['C', 'B', 'A'], battle: 55, total: 50, fit: 'Weak' },
      ],
      hypothetical: ['azumarill'],
      chosenMoves: ['tinkaton'],
      unranked: ['clodsire'],
      assumptions: team.assumptions,
      ms: 0,
    } as unknown as import('@pickthree/engine').TeamAnalysis;
    wrap(
      <ScoreCard
        team={team}
        custom={{ analysis, best, shared: false, leagueTitle: 'Great League' }}
        onTakeToBattle={() => undefined}
      />,
    );
    expect(screen.getByText(/Your best recommended team rates/)).toHaveTextContent('88');
    expect(screen.getByText(/not in your collection/)).toBeInTheDocument();
    expect(screen.getByText(/ran the moves you chose/)).toBeInTheDocument();
    expect(screen.getByText(/PvPoke does not rank/)).toBeInTheDocument();
    expect(screen.getByText(/tried all six orders/)).toHaveTextContent('70');
  });
});

describe('BattlePlan', () => {
  it('writes the three steps from engine strings only', () => {
    const team = makeTeam();
    team.explanation.roleWhy = { lead: 'Lead why.', switch: 'Switch why.', closer: 'Closer why.' };
    team.explanation.slotDetail[0]!.formNote = 'Form note.';
    team.explanation.slotDetail[2]!.keepShield = { delta: 3, line: 'Keep a shield.' };
    team.explanation.switchPlan = [
      { ...team.explanation.switchPlan[0]!, line: 'First switch.' },
      { ...team.explanation.switchPlan[0]!, opponent: 'x2', line: 'Second switch.' },
      { ...team.explanation.switchPlan[0]!, opponent: 'x3', line: 'Third switch.' },
    ];
    wrap(<BattlePlan team={team} />);
    for (const t of ['Lead why.', 'Form note.', 'First switch.', 'Second switch.', 'Closer why.', 'Keep a shield.']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.queryByText('Third switch.')).not.toBeInTheDocument();
  });

  it('leaves out what the engine did not write', () => {
    const team = makeTeam();
    team.explanation.slotDetail[0]!.formNote = null;
    team.explanation.slotDetail[2]!.keepShield = null;
    team.explanation.switchPlan = [];
    wrap(<BattlePlan team={team} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
```

`makeTeam` is Teams' fixture (`apps/web/test/teamFixture.ts`). Check its options (it may take
`battle`, `total` or a score override) and its explanation defaults (`switchPlan` needs at least
one entry for the spread above; add one to the fixture's default if it has none). Adapt the calls,
not the assertions.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project web analysisComponents`
Expected: FAIL, the components do not exist.

- [ ] **Step 3: Write ScoreCard**

```tsx
import type { TeamAnalysis, TeamRecommendation } from '@pickthree/engine';
import { Button } from '@pickthree/ui';
import { FitTag, useName } from '../../components.tsx';
import { fitWhy } from '../../format.ts';

export interface CustomNotes {
  analysis: TeamAnalysis;
  best: TeamRecommendation | null;
  shared: boolean;
  leagueTitle: string;
}

/**
 * The headline: battle strength (coverage, consistency, safety), the fit and what it answers, and
 * Take to battle, the page's one primary action, in the same place for every team.
 */
export function ScoreCard({
  team,
  custom,
  onTakeToBattle,
}: {
  team: TeamRecommendation;
  custom: CustomNotes | null;
  onTakeToBattle: () => void;
}) {
  const name = useName();
  const list = (ids: string[]): string => ids.map(name).join(', ');
  const covered = team.score.coveredOpponents.length;
  const all = covered + team.score.uncoveredOpponents.length;
  const order = list(team.slots.map((x) => x.candidate.build.speciesId));
  const tried = custom?.analysis.orders ?? [];
  const hypothetical = custom?.analysis.hypothetical ?? [];
  const chosen = custom?.analysis.chosenMoves ?? [];
  const unranked = custom?.analysis.unranked ?? [];
  const first = tried[0];
  const last = tried.length > 1 ? tried[tried.length - 1] : undefined;
  return (
    <section className="score-card" aria-label="Battle score">
      <div className="score-head">
        <span className="score-num">{Math.round(team.score.battle)}</span>
        <span className="score-of">/ 100 in battle</span>
        <FitTag fit={team.score.fit} />
      </div>
      <p className="score-line">{fitWhy(team.score.fit, covered, all, team.score.topUncovered)}</p>
      {custom?.shared ? (
        <p className="meta">
          Shared team link.{' '}
          {hypothetical.length > 0
            ? `IVs assumed for ${list(hypothetical)}; the rest are yours.`
            : 'All three are yours, so the numbers are exact.'}
        </p>
      ) : hypothetical.length > 0 ? (
        <p className="meta">
          {list(hypothetical)} {hypothetical.length === 1 ? 'is' : 'are'} not in your collection, so
          the numbers assume a top-10% IV spread rather than a perfect one.
        </p>
      ) : null}
      {custom?.best ? (
        <p className="meta">
          Your best recommended team rates {custom.best.score.fit.toLowerCase()} at{' '}
          {Math.round(custom.best.score.battle)}:{' '}
          {list(custom.best.slots.map((x) => x.candidate.build.speciesId))}.
        </p>
      ) : null}
      {chosen.length > 0 ? (
        <p className="meta">{list(chosen)} ran the moves you chose, not the recommended set.</p>
      ) : null}
      {unranked.length > 0 ? (
        <p className="meta">
          PvPoke does not rank {list(unranked)} in {custom?.leagueTitle ?? 'this league'}, so pick3
          simulated {unranked.length === 1 ? 'it' : 'them'} against the meta on this phone. No rank
          badges; where it plays comes from those battles alone.
        </p>
      ) : null}
      <p className="score-order">Run it in this order: {order}.</p>
      {custom && first && last ? (
        <p className="meta">
          pick3 tried all six orders. Best: {first.names.join(', ')} at {first.battle}. Weakest:{' '}
          {last.names.join(', ')} at {last.battle}.
        </p>
      ) : custom ? (
        <p className="meta">Run in the order you picked.</p>
      ) : null}
      <Button variant="primary" onClick={onTakeToBattle}>
        Take to battle
      </Button>
    </section>
  );
}
```

Keep the existing `.custom-note` class on the section as well (`className="score-card
custom-note"` when `custom` is set): `apps/web/scripts/screens.mjs` waits on `.custom-note` and
reads its text for "ran the moves you chose" and the unranked line.

- [ ] **Step 4: Write BattlePlan**

```tsx
import type { TeamRecommendation } from '@pickthree/engine';

/**
 * Three steps written only from what the engine produced: the lead's job (and its form change),
 * the top two switches, the closer's job (and the keep-a-shield advice). A step with nothing to
 * say is left out rather than filled in.
 */
export function BattlePlan({ team }: { team: TeamRecommendation }) {
  const e = team.explanation;
  const lead = [e.roleWhy.lead, e.slotDetail[0].formNote].filter((x): x is string => !!x);
  const switches = e.switchPlan.slice(0, 2).map((s) => s.line);
  const closer = [e.roleWhy.closer, e.slotDetail[2].keepShield?.line].filter(
    (x): x is string => !!x,
  );
  const steps = [
    { title: 'Lead', lines: lead },
    { title: 'Switch', lines: switches },
    { title: 'Closer', lines: closer },
  ].filter((st) => st.lines.length > 0);
  return (
    <ol className="plan">
      {steps.map((st) => (
        <li className="plan-step" key={st.title}>
          <span className="plan-title">{st.title}</span>
          {st.lines.map((l) => (
            <span className="plan-line" key={l}>
              {l}
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}
```

CSS, tokens only: `.score-card` a card (surface, 1px `--divider`, `--r-card`, 16px padding,
column, 8px gap); `.score-head` row, baseline-aligned, 8px gap; `.score-num` 40px/700 in
`--text`; `.score-of` `--muted`; `.score-order` `--fs-body`; the `Button` full width. `.plan` no
list style, column, 12px gap, no padding; `.plan-step` column with a 2px `--accent` left rule and
12px left padding; `.plan-title` the 11px label style the app uses for role labels; `.plan-line`
`--fs-body`.

- [ ] **Step 5: Run them and see them pass**

Run: `npx vitest run --project web analysisComponents`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/team/ScoreCard.tsx apps/web/src/components/team/BattlePlan.tsx apps/web/src/app.css apps/web/test/analysisComponents.test.tsx apps/web/test/teamFixture.ts
git commit -m "Web: ScoreCard with battle strength and one action; BattlePlan from engine strings"
```

---

### Task 3: Matchups, PokemonDetails, WhyThisTeam

**Files:**
- Create: `apps/web/src/components/team/Matchups.tsx`, `apps/web/src/components/team/PokemonDetails.tsx`, `apps/web/src/components/team/WhyThisTeam.tsx`
- Modify: `apps/web/src/app.css`
- Test: `apps/web/test/analysisComponents.test.tsx`

**Interfaces:**
- Consumes: `ExpandRow`, `Tag`, `Term`, `Button` from `@pickthree/ui`; from `../../components.tsx`:
  `PokemonToken`, `TypeChip`, `TypeChips`, `RankTag`, `MetaTags`, `MoveRows`, `ROLE_TEXT`,
  `GLOSSARY`, `useName`; `costLine`, `ivLine`, `topPct`, `SEP` from `../../format.ts`.
- Produces:
  - `Matchups({ team, leadName }: { team: TeamRecommendation; leadName: string })`
  - `PokemonDetails({ team, hypothetical, open, onToggle }: { team: TeamRecommendation; hypothetical: string[]; open: boolean[]; onToggle: (i: number) => void })`, rows carry `id="pokemon-<i>"` for scrolling
  - `WhyThisTeam({ team }: { team: TeamRecommendation })`

- [ ] **Step 1: Write the failing tests**

```tsx
describe('Matchups', () => {
  it('shows one key win and one key threat, then everything behind Show all', () => {
    const team = makeTeam(); // needs >= 2 keyWins, >= 2 keyThreats, >= 1 switchPlan entry
    wrap(<Matchups team={team} leadName="Tinkaton" />);
    expect(screen.getAllByTestId('key-win')).toHaveLength(1);
    expect(screen.getAllByTestId('key-threat')).toHaveLength(1);
    screen.getByRole('button', { name: 'Show all' }).click();
    expect(screen.getAllByTestId('key-win')).toHaveLength(team.explanation.keyWins.length);
    expect(screen.getByText('When to switch')).toBeInTheDocument();
  });
});

describe('PokemonDetails', () => {
  it('one expandable row per Pokémon; safe types past six open per row', () => {
    const team = makeTeam();
    team.explanation.slotDetail[0]!.resistances = ['fire', 'water', 'grass', 'ice', 'bug', 'steel', 'fairy', 'dark'];
    team.explanation.slotDetail[1]!.resistances = ['fire', 'water', 'grass', 'ice', 'bug', 'steel', 'fairy', 'dark'];
    wrap(<PokemonDetails team={team} hypothetical={[]} open={[true, true, false]} onToggle={() => undefined} />);
    const more = screen.getAllByRole('button', { name: '+2 more' });
    more[0]!.click();
    expect(screen.getAllByRole('button', { name: 'fewer' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '+2 more' })).toHaveLength(1);
  });
});

describe('WhyThisTeam', () => {
  it('says the headline is battle strength and lists the factors', () => {
    const team = makeTeam({ battle: 80, total: 66 });
    wrap(<WhyThisTeam team={team} />);
    expect(screen.getByText(/Battle strength 80 is coverage, consistency and safety/)).toBeInTheDocument();
    expect(screen.getByText(/The total, 66, also counts cost/)).toBeInTheDocument();
  });
});
```

Extend `makeTeam`'s defaults if it lacks two key wins, two key threats or a switch plan entry.
Wrap the clicks in `act` or use `fireEvent.click` as the file's other tests do.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project web analysisComponents`
Expected: FAIL, the components do not exist.

- [ ] **Step 3: Write Matchups**

Move today's markup from `TeamDetail.tsx` (the "When to switch" block at lines 477-505 and the
"Key wins"/"Key threats" blocks at 507-539) into `Matchups`, with these changes:

- Collapsed (default): a two-column grid, the first `keyWins` entry (`data-testid="key-win"`,
  heading "Wins") beside the first `keyThreats` entry (`data-testid="key-threat"`, heading
  "Threat"). No threats: the right column shows today's "Nothing in the meta group beats all
  three..." sentence.
- A text `Button` "Show all" / "Show less" (`aria-expanded`) below. Expanded: every key win,
  every key threat (same card markup, `data-testid` kept), then "When to switch" with today's
  intro line (using `leadName`), today's empty sentence and up to eight rows, today's copy.
- The card markup keeps `PokemonToken` (32, `showInitial={false}`), the name, `TypeChips`,
  `RankTag` and the engine's `line`. The `.hscroll` side-scrolling rows go (they were the
  "side scrolling pills" Travis asked to remove on Teams); use a wrapping grid.

- [ ] **Step 4: Write PokemonDetails**

One `ExpandRow` per slot. Summary: `PokemonToken` (40), "First · Lead" style role line, the name.
Body: today's slot card (TeamDetail lines 259-390) unchanged in content: types as `TypeChips`,
`MetaTags`, the role's job (`slot.roleWhy`), the form note, `MoveRows` with the move reads, the
move-count explanation beside the first move count (today's "A move count like 4-4-3..."
paragraph becomes one `Term term="Move counts"` next to the first row's count; the Elite TM, XL
Candy and IV rank terms move to the Yours line where those words appear), the shield and safe
type rows with "+N more"/"fewer" per row (the per-row open set lives inside PokemonDetails in
`useState<Set<number>>`), the keep-shield line, and the Yours / To build lines. Shadow and Lucky
become `Tag`s (neutral, "Shadow" / "Lucky"), not the `--warn` colored text. Join with `SEP`.
Each `ExpandRow` sits in a wrapper with `id={`pokemon-${i}`}` so the screen can scroll to it.

- [ ] **Step 5: Write WhyThisTeam**

`explanation.why` as a paragraph; "Team structure" with a `Term` for the structure
(`GLOSSARY['ABB line']` or `GLOSSARY['Balanced ABC']`) and today's ABB block or three "beats N of
M" tiles (TeamDetail lines 401-475, `StructureTag` replaced by the `Term`); then the breakdown:

```tsx
<p className="meta">
  Battle strength {Math.round(team.score.battle)} is coverage, consistency and safety (
  {team.score.factors.coverage}, {team.score.factors.consistency}, {team.score.factors.safety}).
  The total, {team.score.total}, also counts cost ({team.score.factors.cost}) and accessibility (
  {team.score.factors.accessibility}).
</p>
```

Check `team.score.factors` field names in `packages/engine/src/score/score.ts` before writing.

- [ ] **Step 6: CSS, run, commit**

Tokens only; card borders and radii as on Teams (`--divider`, `--r-card`). Grep every new class.
Run: `npx vitest run --project web analysisComponents`, then `npm test`, lint, typecheck,
check-colors.

```bash
git add apps/web/src/components/team/Matchups.tsx apps/web/src/components/team/PokemonDetails.tsx apps/web/src/components/team/WhyThisTeam.tsx apps/web/src/app.css apps/web/test/analysisComponents.test.tsx apps/web/test/teamFixture.ts
git commit -m "Web: Matchups, PokemonDetails and WhyThisTeam for Team Analysis"
```

---

### Task 4: The Team Analysis screen

**Files:**
- Modify: `apps/web/src/screens/TeamDetail.tsx` (rewrite), `apps/web/src/components.tsx`
  (delete `StructureTag` and `GLOSSARY['line']` if nothing else uses them; grep first),
  `apps/web/src/app.css` (drop rules only TeamDetail used; grep each)
- Test: `apps/web/test/teamDetail.test.tsx` (create)

**Interfaces:**
- Consumes: Tasks 2 and 3's components; `back(fallback)` from the store; `Header`, `IconButton`,
  `Button`, `ConfirmSheet`, `Empty`, `Term` from `@pickthree/ui`; `CogGlyph`, `ShareGlyph` (see
  Step 3) from `../components.tsx`.
- Produces: the rebuilt screen. Classes Task 5's capture script relies on: `.custom-note` (on the
  score card for custom teams), `.ui-btn-primary` (Take to battle), `.team-strip`, and the
  `pokemon-<i>` ids.

- [ ] **Step 1: Write the failing screen tests**

```tsx
// apps/web/test/teamDetail.test.tsx
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TeamDetail } from '../src/screens/TeamDetail.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { resetHistoryForTests } from '../src/state/history.ts';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';
import { makeTeam } from './teamFixture.ts';

describe('Team Analysis', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetHistoryForTests();
    window.location.hash = '';
  });

  it('with no analysis, shows Empty with a way to Build, and Back stays in pick3', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <TeamDetail id="custom" />
      </AppProvider>,
    );
    expect(await screen.findByText('No hand-built team yet. Pick three and analyze them.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Build a team' }));
    await waitFor(() => expect(window.location.hash).toBe('#/build'));
  });
});
```

Add these cases, each seeding a recommendation through `fakeHost`'s `recommend` override (Teams'
`hostWith(teams)` pattern in `teamsList.test.tsx`) and rendering `TeamDetail id={team.id}` after
the store has the recommendation (render a `Teams` first, or dispatch through a `Probe` as
`teamsList.test.tsx` does; pick the one that file uses):

- the headline is `Math.round(score.battle)` and the total is not shown as the headline;
- jump buttons "Battle plan", "Matchups", "Pokémon", "Details" call `scrollIntoView` on their
  sections (stub `Element.prototype.scrollIntoView` with `vi.fn()` and assert the target ids);
- tapping the second strip Pokémon opens its details row (`aria-expanded="true"` on its
  `.ui-expand-head`) and leaves the first row open;
- Take to battle with no running set calls `startSet` (the host's) and lands on `#/meta/log`
  (check `hashFor({ screen: 'meta-log' })`);
- Take to battle with another team's set running opens a dialog naming that team and its logged
  count; Cancel keeps the set; Confirm starts the new one (seed `sets` through the host or the
  store as the Your Meta tests do; read `apps/web/test` for the pattern);
- Edit team loads the three into Build and lands on `#/build`;
- Back with nothing behind it lands on `#/teams` for a recommended team and `#/build` for custom.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project web teamDetail`
Expected: FAIL on every case but the first, which may already pass.

- [ ] **Step 3: Rebuild the screen**

Keep today's data logic (`team`, `a`, `best`, `editInBuild`, `share`, `takeToBattle`) and change
the rest:

1. **Header:** `Header variant="sub" title="Team Analysis" back={{ label: 'Back', onClick: () =>
   back(custom ? { screen: 'build' } : { screen: 'teams' }) }}` with actions: an `IconButton`
   "Share this team" (move the share glyph out of `ShareButton` into an exported `ShareGlyph` in
   `components.tsx` and use it in both) and the settings `IconButton` with `CogGlyph`, as Build.
2. **Not found:** `Empty` with today's two lines and a `Button` ("Build a team" to Build, "Back to
   teams" to Teams), under the same header.
3. **Team strip** (`.team-strip`): three buttons, each `PokemonToken` 48, the name, the short
   role; tapping one opens its details row (set its `open` entry true) and calls
   `document.getElementById(`pokemon-${i}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })`.
   Under the strip: one line with the structure `Term` and "{difficulty} to play: {why}", then a
   text `Button` "Edit team" (`editInBuild`).
4. **ScoreCard** with `custom` notes built from `s.analysis` when `custom`, and
   `onTakeToBattle={() => void takeToBattle()}`.
5. **Jump buttons:** a row of four text `Button`s scrolling to `#plan`, `#matchups`,
   `#pokemon`, `#details`.
6. Sections in order, each an `h3` with its id: "Battle plan" (`BattlePlan`), "Matchups to
   remember" (`Matchups`), "Your Pokémon" (`PokemonDetails`, open state
   `useState<boolean[]>([true, false, false])`), "Why this team" (`WhyThisTeam`, id `details`),
   "Alternatives you own" (today's rows), then today's "Assumptions and detail" block unchanged
   (its matchup grid and the Total build line; the Total build line uses `costLine`).
7. **takeToBattle:** replace `window.confirm` with state `confirming: { running: string; played:
   number } | null`; render `<ConfirmSheet title="Switch teams?" line={`You are running
   ${running} (${played} logged). Switch to this team?`} confirmLabel="Switch" cancelLabel="Keep
   it" onConfirm={...start the set...} onCancel={() => setConfirming(null)} />`.
8. Delete `StructureTag` and `GLOSSARY['line']` if the grep finds no other user; delete CSS rules
   only TeamDetail used (`.team-strip-card`, `.strip-member`, `.rating-row`, `.hscroll`, `.mini`,
   `.slot-card-head` and others; grep each before deleting, some are shared).

- [ ] **Step 4: Run the web project and the full checks**

Run: `npx vitest run --project web`, then `npm test && npm run lint && npm run typecheck && npm run check-colors`
Expected: all pass. `sharedTeam.test.tsx` must still pass (a shared link renders this screen).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/TeamDetail.tsx apps/web/src/components.tsx apps/web/src/app.css apps/web/test/teamDetail.test.tsx
git commit -m "Web: Team Analysis on the foundation: score card, battle plan, matchups, Pokémon rows"
```

---

### Task 5: Captures, the enforced audit, fixes

**Files:**
- Modify: `apps/web/scripts/screens.mjs` (the `03-team-detail` step near line 425, the custom
  team steps near 818-874, `AUDIT_ENFORCED`)
- Modify: whatever the audit and the captures point at

**Interfaces:**
- Consumes: Task 4's classes and ids.
- Produces: enforced captures `03-team-detail`, `14-custom-team`, `14b-custom-unranked`,
  `14c-shared-team`, `analysis-confirm` (the switch-teams sheet open), `analysis-not-found`, in
  both themes; Task 6 uses these names.

- [ ] **Step 1: Update the capture flow**

- Keep every existing wait and text check (`.custom-note`, "ran the moves you chose", the
  unranked line, the shared note), adjusting selectors Task 4 changed (for example
  `.scroll .error` to `.ui-error`).
- `03-team-detail`, `14-custom-team`, `14b-custom-unranked`, `14c-shared-team`: full page with
  `captureBeyondViewport: false`, like Teams' shots.
- `analysis-confirm`: with a set running for a different team (the Your Meta steps create one;
  reuse it, or start one through Take to battle on another team first), tap Take to battle and
  shoot the open `ConfirmSheet`, then Cancel. Throw if no dialog opens.
- `analysis-not-found`: open `#/team/does-not-exist` and shoot the Empty state.
- Add the six names to `AUDIT_ENFORCED`.

- [ ] **Step 2: Audit, look, fix, repeat**

Run: `npm run web:audit`. Fix every finding at its source. Then open every capture for the six
names in both themes and look for what the audit cannot see: stray boxes or double borders,
content off the 20px gutter, a header title off centre, text under the tab bar, a "·" starting a
line, uneven spacing, anything unlike the signed Teams and Build pages
(`docs/design/audits/img/02-teams-dark.webp`, `13-build-dark.webp`). Fix those too, and list
them in the report.

Carry-forwards to handle here: TeamDetail's own " · " joins around `costLine` use plain spaces
(use `SEP`); the Shadow glow is not visible (pre-existing, leave it, note it).

- [ ] **Step 3: Full checks and commit**

Run: `npm run web:audit` (exit 0), `npm run ui:audit`, `npm run meta:screens`, `npm test`, lint,
typecheck, check-colors. Stage the script and each fixed file by path.

```bash
git commit -m "Web: Team Analysis screens join the enforced audit, clean in dark and light"
```

---

### Task 6: The Team Analysis audit record

**Files:**
- Create: `docs/design/audits/analysis.md` (from `docs/design/audits/_template.md`, modeled on
  `teams.md` and `build.md`)
- Create: `docs/design/audits/img/<name>-dark.webp` and `-light.webp` for the six enforced names

- [ ] **Step 1: Convert and look**

Run `npm run web:audit` for fresh captures, convert the six names in both themes to WebP with
sharp at the repo root (as `build.md`'s images were), and open each before describing it.

- [ ] **Step 2: Write the record**

Sections as in `build.md`: screenshots table, automated checks (date, counts), the aesthetics and
functionality checklists ticked only where a capture or a test backs the tick (otherwise
unticked with a one-line reason), findings and fixes with commits, this plan's rulings with their
costs, "Visible changes outside Team Analysis" (the engine's order sort reaching Build's Find
best order; `ShareGlyph`; anything shared that moved), and open items. The sign-off line stays
unticked.

- [ ] **Step 3: Commit**

```bash
git add docs/design/audits/analysis.md docs/design/audits/img/03-team-detail-*.webp docs/design/audits/img/14-custom-team-*.webp docs/design/audits/img/14b-custom-unranked-*.webp docs/design/audits/img/14c-shared-team-*.webp docs/design/audits/img/analysis-*.webp
git commit -m "Design: Team Analysis audit record"
```

Report the record's path. Travis signs it; piece 2 is done when he does.
