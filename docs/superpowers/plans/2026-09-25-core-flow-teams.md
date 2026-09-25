# Core Flow: Your Teams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Your Teams screen on the design foundation: teams sorted by battle strength,
every team an expandable row with the first one open, one Filters button, a summary line, the
personal progress card, shared states, and an audit record Travis signs.

**Architecture:** The engine gains one comparator and sorts by battle strength. Two app-level
team components (`TeamRowSummary`, `TeamCardBody`) are built from `@pickthree/ui` parts in
`apps/web/src/components/team/` so Team Analysis can reuse `TeamCardBody` later. `screens/Teams.tsx`
is rewritten around `ExpandRow`, `FilterButton`, `ProgressCard`, `Header`, `IconButton` and the
shared states. Build and Team Analysis get their own plans after Travis signs off this page.

**Tech Stack:** React 19, TypeScript 5.9 strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), vitest 4 + jsdom + Testing Library, puppeteer-core audit scripts.

**Spec:** `docs/superpowers/specs/2026-09-25-design-core-flow-design.md` (sections "Decisions",
"Shared team components", "Your Teams", "Engine", "Testing", "Done for piece 2"). Foundation:
`docs/superpowers/specs/2026-09-24-design-foundation-design.md`.

## Global Constraints

- Exact pinned versions in every package.json. No `^` or `~`.
- Braces on all control flow, even one-line bodies (eslint `curly: all`).
- No em dashes anywhere: code, CSS comments, docs, commits, UI copy.
- "Pokémon" with the accent in all UI copy.
- New CSS uses tokens only; `npm run check-colors` must pass, and the color-literal baseline may
  only shrink.
- New class names start with `ui-` in packages/ui; app-level classes follow the app's own names.
- Touch targets at least 44px.
- Every result carries its assumptions: the footer counts stay.
- Stage explicit paths when committing, never `git add -A`. Commit messages end with a
  `Co-Authored-By: <the model that wrote the commit> <noreply@anthropic.com>` trailer.
- Work on `main` in D:\Skunkworks\pickthree unless the executor sets up a worktree. Run commands
  from the repo root. Windows, Git Bash.

## Review Focus

1. **Two teams with equal battle strength.** The cheaper one (higher `score.total`) must come
   first, and the order must be stable. Pinned in Task 1.
2. **A recommendation with one team, or none.** One team: its row is open and there is no
   progress card crash; none: the empty state with a Filters action. Pinned in Task 4.
3. **The log at 15 or more.** The progress card disappears; under 15 it shows, and its
   contribution line appears only when battle sharing is on. Pinned in Task 4.
4. **Tapping Edit team or View analysis inside an open row.** Each action does only its own job
   and never toggles the row. Pinned in Task 4.
5. **A long team (three long names such as "Galarian Stunfisk") at 390px.** The collapsed row
   wraps or ellipsizes inside the row, never pushing the page sideways. Pinned by the audit's
   overflow and clipping checks in Task 5.

---

### Task 1: Engine sorts teams by battle strength

**Files:**
- Modify: `packages/engine/src/recommend.ts` (the sort at about line 250, and a new export)
- Create: `packages/engine/test/compareTeamScores.test.ts`
- Modify: `packages/engine/test/recommend.e2e.test.ts` (the order assertion at about lines 61-62)

**Interfaces:**
- Produces: `compareTeamScores(a: Pick<TeamScore, 'battle' | 'total'>, b: Pick<TeamScore, 'battle' | 'total'>): number`
  exported from `packages/engine/src/recommend.ts` (and so from `@pickthree/engine`), negative when
  `a` ranks first.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/test/compareTeamScores.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compareTeamScores } from '../src/recommend.js';

describe('compareTeamScores', () => {
  it('ranks the stronger team first even when it scores lower overall', () => {
    const strong = { battle: 88, total: 70 };
    const cheapWeak = { battle: 80, total: 85 };
    expect([cheapWeak, strong].sort(compareTeamScores)).toEqual([strong, cheapWeak]);
  });

  it('breaks a battle tie with the total, higher first', () => {
    const cheaper = { battle: 85, total: 82 };
    const dearer = { battle: 85, total: 74 };
    expect([dearer, cheaper].sort(compareTeamScores)).toEqual([cheaper, dearer]);
  });

  it('treats identical scores as equal', () => {
    expect(compareTeamScores({ battle: 80, total: 80 }, { battle: 80, total: 80 })).toBe(0);
  });
});
```

If the engine's tests import with `.ts` extensions rather than `.js`, match the neighbouring test
files' import style.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --project engine compareTeamScores`
Expected: FAIL, `compareTeamScores` is not exported.

- [ ] **Step 3: Implement**

In `packages/engine/src/recommend.ts`, add above the `recommend` function:

```ts
/**
 * The order recommended teams are listed in: battle strength first (what a player wants out of
 * the list), then the total score, so of two equally strong teams the cheaper, easier one leads.
 */
export function compareTeamScores(
  a: Pick<TeamScore, 'battle' | 'total'>,
  b: Pick<TeamScore, 'battle' | 'total'>,
): number {
  return b.battle - a.battle || b.total - a.total;
}
```

and replace

```ts
  scored2.sort((a, b) => b.score.total - a.score.total);
```

with

```ts
  scored2.sort((a, b) => compareTeamScores(a.score, b.score));
```

Import `TeamScore` from the score module if `recommend.ts` does not already.

In `packages/engine/test/recommend.e2e.test.ts`, replace

```ts
    const sorted = [...rec.teams].sort((a, b) => b.score.total - a.score.total);
```

with

```ts
    const sorted = [...rec.teams].sort((a, b) => compareTeamScores(a.score, b.score));
```

and add `compareTeamScores` to that file's import from the recommend module.

- [ ] **Step 4: Run the engine tests**

Run: `npx vitest run --project engine`
Expected: PASS. If another engine test pins the old total-first order, update its expectation to
the battle-first order and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/recommend.ts packages/engine/test/compareTeamScores.test.ts packages/engine/test/recommend.e2e.test.ts
git commit -m "Engine: recommended teams sort by battle strength, total breaks ties"
```

---

### Task 2: Team fixture, glossary terms, TeamRowSummary and TeamCardBody

**Files:**
- Create: `apps/web/test/teamFixture.ts`
- Create: `apps/web/src/components/team/TeamRowSummary.tsx`
- Create: `apps/web/src/components/team/TeamCardBody.tsx`
- Create: `apps/web/test/teamComponents.test.tsx`
- Modify: `apps/web/src/components.tsx` (`GLOSSARY` gains two keys)
- Modify: `apps/web/src/app.css` (row summary styles)

**Interfaces:**
- Produces: `makeTeam(over?: Partial<TeamFixtureInput>): TeamRecommendation` from
  `apps/web/test/teamFixture.ts`, where `TeamFixtureInput` is
  `{ id: string; species: [string, string, string]; battle: number; total: number; fit: 'Strong' | 'Solid' | 'Situational' | 'Weak'; difficulty: 'Easy' | 'Moderate' | 'Demanding'; stardust: number; structure: 'ABB' | 'ABC' }`.
- Produces: `TeamRowSummary({ team }: { team: TeamRecommendation })` and
  `TeamCardBody({ team, legend }: { team: TeamRecommendation; legend?: boolean })`.
- Consumes: `PokemonToken`, `useName`, `FitTag`, `RoleLabel`, `GLOSSARY` from
  `apps/web/src/components.tsx`; `costLine`, `num` from `apps/web/src/format.ts`; `Term` from
  `@pickthree/ui`.

- [ ] **Step 1: Write the fixture**

Create `apps/web/test/teamFixture.ts`:

```ts
import type { TeamRecommendation } from '@pickthree/engine';

export interface TeamFixtureInput {
  id: string;
  species: [string, string, string];
  battle: number;
  total: number;
  fit: 'Strong' | 'Solid' | 'Situational' | 'Weak';
  difficulty: 'Easy' | 'Moderate' | 'Demanding';
  stardust: number;
  structure: 'ABB' | 'ABC';
}

const DEFAULTS: TeamFixtureInput = {
  id: 't1',
  species: ['morpeko_full_belly', 'snorlax', 'tinkaton'],
  battle: 88,
  total: 84,
  fit: 'Strong',
  difficulty: 'Moderate',
  stardust: 263900,
  structure: 'ABC',
};

const ROLES = ['lead', 'switch', 'closer'] as const;

/**
 * A TeamRecommendation with only the fields the Teams screen and its components read. The engine
 * type is much larger; the cast keeps the fixture honest about what the UI depends on.
 */
export function makeTeam(over: Partial<TeamFixtureInput> = {}): TeamRecommendation {
  const t = { ...DEFAULTS, ...over };
  return {
    id: t.id,
    structure: t.structure,
    slots: t.species.map((speciesId, i) => ({
      role: ROLES[i],
      roleWhy: `${speciesId} role`,
      candidate: { build: { speciesId, specimenId: `${t.id}-${speciesId}` } },
      sim: { results: [], wins: 0 },
    })),
    score: {
      battle: t.battle,
      total: t.total,
      fit: t.fit,
      difficulty: t.difficulty,
      difficultyWhy: 'Snorlax needs to bait one shield.',
      factors: { coverage: 0, consistency: 0, safety: 0, cost: 0, accessibility: 0 },
      topUncovered: 0,
      coveredOpponents: [],
      uncoveredOpponents: [],
    },
    explanation: { why: `${t.species[0]} leads and handles the top threats.` },
    cost: { stardust: t.stardust, candy: 255, xlCandy: 0, eliteTm: 1 },
    hasShadow: false,
    needsXl: false,
    eliteTms: 1,
    leadCounters: [],
  } as unknown as TeamRecommendation;
}
```

- [ ] **Step 2: Write the failing component tests**

Create `apps/web/test/teamComponents.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeamCardBody } from '../src/components/team/TeamCardBody.tsx';
import { TeamRowSummary } from '../src/components/team/TeamRowSummary.tsx';
import { makeTeam } from './teamFixture.ts';

describe('TeamRowSummary', () => {
  it('names the three Pokémon and says fit, difficulty and Stardust in one line', () => {
    render(<TeamRowSummary team={makeTeam()} />);
    expect(screen.getByText('Strong fit · Moderate · 263,900 Stardust')).toBeInTheDocument();
    expect(screen.getByTestId('team-row-names').textContent).toMatch(/Snorlax/);
  });

  it('holds no buttons or links, so it can sit inside the row toggle', () => {
    const { container } = render(<TeamRowSummary team={makeTeam()} />);
    expect(container.querySelector('button, a')).toBeNull();
  });
});

describe('TeamCardBody', () => {
  it('shows fit, structure as a tap-to-define term, difficulty and its reason, and the cost', () => {
    render(<TeamCardBody team={makeTeam({ structure: 'ABC' })} />);
    expect(screen.getByText('Strong fit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Balanced ABC' })).toHaveAttribute(
      'data-inline-control',
    );
    expect(screen.getByText('Moderate to play')).toBeInTheDocument();
    expect(screen.getByText('Snorlax needs to bait one shield.')).toBeInTheDocument();
    expect(screen.getByText(/263,900 Stardust · 255 Candy · 1 Elite TM/)).toBeInTheDocument();
  });

  it('names the ABB line structure the same way', () => {
    render(<TeamCardBody team={makeTeam({ structure: 'ABB' })} />);
    expect(screen.getByRole('button', { name: 'ABB line' })).toBeInTheDocument();
  });

  it('shows the role legend only when asked', () => {
    const { rerender } = render(<TeamCardBody team={makeTeam()} />);
    expect(screen.queryByText(/Lead opens the battle/)).toBeNull();
    rerender(<TeamCardBody team={makeTeam()} legend />);
    expect(screen.getByText(/Lead opens the battle/)).toBeInTheDocument();
  });

  it('lists the three roles in battle order', () => {
    render(<TeamCardBody team={makeTeam()} />);
    const roles = screen.getAllByText(/^(Lead|Safe Switch|Closer)$/).map((e) => e.textContent);
    expect(roles).toEqual(['Lead', 'Safe Switch', 'Closer']);
  });
});
```

`TeamRowSummary` and `TeamCardBody` call `useName()` and `PokemonToken`, which read the app store.
If they cannot render outside `AppProvider`, wrap each `render` in the same provider pattern
`apps/web/test/teamsHeader.test.tsx` uses (`<AppProvider host={fakeHost()}>`) and wait for boot,
and note it in the report. The fixture's species ids fall back to their id as the display name
when game data is absent, so match names case-insensitively (`/snorlax/i`) if needed.

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run --project web teamComponents`
Expected: FAIL, the component modules do not exist.

- [ ] **Step 4: Add the glossary terms**

In `apps/web/src/components.tsx`, add to `GLOSSARY` (after the `line` entry):

```ts
  'ABB line': 'A team built so the back line beats whatever counters the lead.',
  'Balanced ABC':
    'Three Pokémon that each cover different threats, so no single opponent beats the whole team.',
```

- [ ] **Step 5: Implement TeamRowSummary**

Create `apps/web/src/components/team/TeamRowSummary.tsx`:

```tsx
import type { TeamRecommendation } from '@pickthree/engine';
import { PokemonToken, useName } from '../../components.tsx';
import { num } from '../../format.ts';

/**
 * A collapsed team: three overlapping sprites, the three names, and one line of fit, difficulty
 * and Stardust. It sits inside ExpandRow's toggle button, so it holds no buttons or links.
 */
export function TeamRowSummary({ team }: { team: TeamRecommendation }) {
  const name = useName();
  const ids = team.slots.map((s) => s.candidate.build.speciesId);
  return (
    <span className="team-row">
      <span className="team-row-sprites" aria-hidden="true">
        {ids.map((id, i) => (
          <PokemonToken key={`${id}-${i}`} speciesId={id} size={36} showInitial={false} />
        ))}
      </span>
      <span className="team-row-text">
        <span className="team-row-names" data-testid="team-row-names">
          {ids.map(name).join(' · ')}
        </span>
        <span className="team-row-line">
          {`${team.score.fit} fit · ${team.score.difficulty} · ${num(team.cost.stardust)} Stardust`}
        </span>
      </span>
    </span>
  );
}
```

- [ ] **Step 6: Implement TeamCardBody**

Create `apps/web/src/components/team/TeamCardBody.tsx`:

```tsx
import type { TeamRecommendation } from '@pickthree/engine';
import { Term } from '@pickthree/ui';
import { FitTag, GLOSSARY, PokemonToken, RoleLabel, useName } from '../../components.tsx';
import { costLine } from '../../format.ts';

/**
 * Today's team card content, without its own click handling: fit, structure (tap to define),
 * difficulty and why, the three Pokémon with roles in battle order, the specific explanation, and
 * the full cost. `legend` adds the one-time line that teaches the three roles.
 */
export function TeamCardBody({ team, legend = false }: { team: TeamRecommendation; legend?: boolean }) {
  const name = useName();
  const structure = team.structure === 'ABB' ? 'ABB line' : 'Balanced ABC';
  return (
    <div className="team-body">
      <div className="between">
        <span className="row">
          <FitTag fit={team.score.fit} />
          <Term term={structure}>{GLOSSARY[structure]}</Term>
        </span>
        <span className="diff">
          <span className="small">{team.score.difficulty} to play</span>
          <span className="diff-why">{team.score.difficultyWhy}</span>
        </span>
      </div>
      <div className="slots3">
        {team.slots.map((s) => (
          <div className="slot" key={s.candidate.build.specimenId}>
            <PokemonToken speciesId={s.candidate.build.speciesId} size={52} />
            <span className="slot-name">{name(s.candidate.build.speciesId)}</span>
            <RoleLabel role={s.role} />
          </div>
        ))}
      </div>
      {legend ? (
        <p className="meta" style={{ textAlign: 'center' }}>
          Lead opens the battle. Safe Switch answers a bad start. Closer finishes once shields are
          gone.
        </p>
      ) : null}
      <p className="team-why">{team.explanation.why}</p>
      <div className="cost-line">
        <span>{costLine(team.cost)}</span>
      </div>
    </div>
  );
}
```

Append to `apps/web/src/app.css` (tokens only):

```css
/* Teams: the collapsed row summary and the open card body (design core flow, piece 2). */
.team-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.team-row-sprites {
  display: flex;
  flex: none;
}
.team-row-sprites > * + * {
  margin-left: -10px;
}
.team-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.team-row-names {
  font-weight: 600;
  font-size: var(--fs-body);
  overflow-wrap: anywhere;
}
.team-row-line {
  font-size: var(--fs-support);
  color: var(--muted);
}
.team-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
}
.team-why {
  margin: 0;
  font-size: var(--fs-body);
}
```

- [ ] **Step 7: Run the tests, typecheck and color check**

Run: `npx vitest run --project web teamComponents && npm run typecheck && npm run check-colors && npm run check-tokens`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/test/teamFixture.ts apps/web/test/teamComponents.test.tsx apps/web/src/components/team/TeamRowSummary.tsx apps/web/src/components/team/TeamCardBody.tsx apps/web/src/components.tsx apps/web/src/app.css
git commit -m "Web: team row summary and card body components, ABB and ABC defined in place"
```

---

### Task 3: Shared glyphs, Progress on Loading, NoCollection on Button

**Files:**
- Modify: `apps/web/src/components.tsx` (`MetaGlyph` and a cog glyph exported; `Progress`;
  `NoCollection`)
- Modify: `apps/web/test/components.test.tsx`

**Interfaces:**
- Produces: `export function MetaGlyph()`, `export function CogGlyph()` (the SVG bodies the head
  buttons use today), `export const META_URL = 'https://meta.pick3.gg'` from
  `apps/web/src/components.tsx`. `Progress({ stage, done, total })` keeps its signature and stage
  labels but renders `@pickthree/ui`'s `Loading`. `NoCollection` keeps its props and copy and
  renders its three actions as `Button`s (the Import action `variant="primary"`, the other two
  `variant="secondary"`).

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/test/components.test.tsx` (reuse that file's existing render helpers and
imports; add `Progress`, `NoCollection`, `CogGlyph`, `MetaGlyph` to its import from
`../src/components.tsx`):

```tsx
describe('Progress', () => {
  it('announces the stage label through the shared Loading state', () => {
    render(<Progress stage="simulate" done={1} total={4} />);
    expect(screen.getByRole('status')).toHaveTextContent('Simulating battles with your exact Pokémon');
    expect(document.querySelector('.ui-loading-bar')).not.toBeNull();
  });
});

describe('NoCollection', () => {
  it('offers the three ways in as buttons, import as the main one', async () => {
    const calls: string[] = [];
    render(<NoCollection navigate={(r) => calls.push(r.screen)} />);
    const importBtn = screen.getByRole('button', { name: 'Import a CSV' });
    expect(importBtn).toHaveClass('ui-btn-primary');
    fireEvent.click(screen.getByRole('button', { name: 'Add a Pokémon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build a team' }));
    fireEvent.click(importBtn);
    expect(calls).toEqual(['add', 'build', 'import']);
  });
});

describe('glyphs', () => {
  it('render as hidden decorative SVGs', () => {
    const { container } = render(
      <>
        <MetaGlyph />
        <CogGlyph />
      </>,
    );
    const svgs = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(svgs.length).toBe(2);
  });
});
```

Import `fireEvent` if the file does not already.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --project web components`
Expected: FAIL (`CogGlyph` not exported; `Progress` has no `ui-loading-bar`; the import button
lacks `ui-btn-primary`).

- [ ] **Step 3: Implement**

In `apps/web/src/components.tsx`:

1. Export the meta link and its glyph: change `const META = 'https://meta.pick3.gg';` to
   `export const META_URL = 'https://meta.pick3.gg';` and replace every `META` use in the file with
   `META_URL`; change `function MetaGlyph()` to `export function MetaGlyph()`. Make sure its root
   `<svg>` has `aria-hidden="true"`.
2. Add, next to `HeadCog`:

```tsx
/** The settings gear, as a bare decorative glyph for an IconButton. */
export function CogGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d={COG_PATH} />
    </svg>
  );
}
```

   (Match the stroke attributes `HeadCog`'s own `<svg>` uses so the two render the same.)
3. Replace the body of `Progress` so it keeps the `labels` map and renders the shared state:

```tsx
export function Progress({ stage, done, total }: { stage: string; done: number; total: number }) {
  const labels: Record<string, string> = {
    // keep today's map exactly as it is
  };
  return <Loading label={labels[stage] ?? stage} done={done} total={total} />;
}
```

   Keep the existing `labels` entries verbatim (do not retype them from memory: move the existing
   object literal). Import `Loading` and `Button` from `@pickthree/ui`.
4. In `NoCollection`, replace the three `<button className="btn ...">` elements with
   `<Button variant="secondary" onClick={...}>Add a Pokémon</Button>`,
   `<Button variant="secondary" onClick={...}>Build a team</Button>` and
   `<Button variant="primary" onClick={...}>Import a CSV</Button>`, same handlers, same copy.

- [ ] **Step 4: Run the web tests**

Run: `npx vitest run --project web`
Expected: PASS. If a test elsewhere looked for `.progress` or `.progress-bar` classes, update it to
`role="status"` or `.ui-loading-bar` and name the file in the report.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components.tsx apps/web/test/components.test.tsx
git commit -m "Web: head glyphs exported, Progress on the shared Loading, NoCollection on Button"
```

---

### Task 4: The Your Teams screen

**Files:**
- Modify: `apps/web/src/screens/Teams.tsx` (header, controls, summary line, list, progress card,
  states; the old `TeamCard` export is removed)
- Create: `apps/web/test/teamsList.test.tsx`
- Modify: `apps/web/test/teamsHeader.test.tsx` (the Filters control is now a `FilterButton`)
- Modify: `apps/web/src/app.css` (Teams list spacing only, tokens only)

**Interfaces:**
- Consumes: `compareTeamScores` (Task 1) only through the engine's sorted output;
  `TeamRowSummary`, `TeamCardBody` (Task 2); `MetaGlyph`, `CogGlyph`, `META_URL`, `Progress`,
  `NoCollection` (Task 3); from `@pickthree/ui`: `Header`, `IconButton`, `FilterButton`,
  `ExpandRow`, `ProgressCard`, `Button`, `Empty`, `ErrorState`, `Select`; from the app:
  `filterCount`, `SOURCE_LABELS` (stay in Teams.tsx), `facingSettings`, `isCommunity`,
  `communityLeague`, `WINDOW_LABELS`, `useLogCount`, `shareEnabled` (`apps/web/src/metaShare.ts`).
- Produces: `export function facingSummary(choice: FacingChoice, logCount: number, fellBack: boolean): string`
  in `apps/web/src/screens/Teams.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/teamsList.test.tsx`. Reuse the harness pattern from
`apps/web/test/teamsHeader.test.tsx`: fake-indexeddb, `resetDbForTests()`, a saved collection
(copy its `saveEmptyCollection` helper), `<AppProvider host={host}><Probe /><Teams /></AppProvider>`,
and a `fakeHost` whose `recommend` returns chosen teams:

```tsx
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recommendation, TeamRecommendation } from '@pickthree/engine';
import { facingSummary, Teams } from '../src/screens/Teams.tsx';
import { AppProvider, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { emptyLayoutValue } from '../src/format.ts';
import { resetCommunityMetaCache } from '../src/communityMeta.ts';
import { fakeHost } from './fakeHost.ts';
import { makeTeam } from './teamFixture.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

async function saveEmptyCollection(): Promise<void> {
  await storage.saveCollection({
    specimens: [],
    report: {
      scansRead: 0,
      recognized: 0,
      duplicatesMerged: 0,
      missingIvs: { count: 0, names: [] },
      unrecognized: [],
      rowProblems: [],
      layout: emptyLayoutValue(),
      newestScan: null,
    },
    importedAt: '2026-09-16T00:00:00Z',
    fileName: null,
  });
}

function hostWith(teams: TeamRecommendation[]) {
  const host = fakeHost();
  const base = host.recommend as unknown as () => Promise<Recommendation>;
  host.recommend = vi.fn(async () => ({ ...(await base()), teams })) as typeof host.recommend;
  return host;
}

async function mount(host: ReturnType<typeof fakeHost>) {
  render(
    <AppProvider host={host}>
      <Probe />
      <Teams />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
    expect(latest?.state.collection).not.toBeNull();
  });
}

describe('Teams list', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetCommunityMetaCache();
    latest = null;
    await saveEmptyCollection();
  });

  it('shows every team as a row, the first one open, in the order the engine sent', async () => {
    await mount(
      hostWith([
        makeTeam({ id: 'a', species: ['medicham', 'azumarill', 'galvantula'] }),
        makeTeam({ id: 'b', species: ['mimikyu', 'melmetal', 'greninja'] }),
      ]),
    );
    await screen.findAllByText(/Stardust/);
    const toggles = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens and closes a row on tap', async () => {
    await mount(hostWith([makeTeam({ id: 'a' }), makeTeam({ id: 'b', species: ['mimikyu', 'melmetal', 'greninja'] })]));
    await screen.findAllByText(/Stardust/);
    const second = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'))[1]!;
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'false');
  });

  it('View analysis and Edit team go to their places without toggling the row', async () => {
    await mount(hostWith([makeTeam({ id: 'a' })]));
    const view = await screen.findByRole('link', { name: 'View analysis' });
    expect(view).toHaveAttribute('href', '#/team/a');
    const toggle = screen.getAllByRole('button').find((b) => b.hasAttribute('aria-expanded'))!;
    fireEvent.click(screen.getByRole('button', { name: 'Edit team' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(latest?.state.route.screen).toBe('build'));
  });

  it('shows the progress card under 15 logged battles', async () => {
    await mount(hostWith([makeTeam({ id: 'a' })]));
    expect(await screen.findByRole('progressbar', { name: 'Make these teams personal' })).toBeInTheDocument();
  });

  it('shows the empty state with a Filters action when no team fits', async () => {
    await mount(hostWith([]));
    expect(await screen.findByText(/No team fits these filters/)).toBeInTheDocument();
    const empty = screen.getByText(/No team fits these filters/).closest('.ui-empty') as HTMLElement;
    expect(within(empty).getByRole('button', { name: /^Filters/ })).toBeInTheDocument();
  });

  it('keeps the footer counts', async () => {
    await mount(hostWith([makeTeam({ id: 'a' })]));
    expect(await screen.findByText(/combinations scored/)).toBeInTheDocument();
  });

  it('has one page title and no Pokémon count in the header', async () => {
    await mount(hostWith([makeTeam({ id: 'a' })]));
    expect(screen.getByRole('heading', { level: 2, name: 'Your Teams' })).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ Pokémon$/)).toBeNull();
  });
});

describe('facingSummary', () => {
  it('describes what the list is weighted by', () => {
    expect(facingSummary({ source: 'prior', window: 'meta' }, 0, false)).toBe('PvPoke weighting');
    expect(facingSummary({ source: 'log', window: 'meta' }, 20, false)).toBe('Your log weighting');
    expect(facingSummary({ source: 'log', window: 'meta' }, 9, false)).toBe(
      'PvPoke weighting until your log reaches 15 battles',
    );
    expect(facingSummary({ source: 'ladder', window: '7' }, 0, false)).toBe(
      '7 days · GBL weighting',
    );
    expect(facingSummary({ source: 'all', window: 'meta' }, 0, true)).toBe(
      'PvPoke weighting (community data unavailable)',
    );
  });
});
```

The row toggles are found by their `aria-expanded` attribute (ExpandRow's head button). Add one
more test for the Review Focus item "log at
15 or more": seed 15 counted battles through the store the way `apps/web/test/yourMetaScreen.test.tsx`
seeds a log (or stub `useLogCount` if that file shows a cleaner pattern), then assert no
`progressbar` named "Make these teams personal".

In `apps/web/test/teamsHeader.test.tsx`, update the Filters expectation: the control is
`FilterButton` (accessible name "Filters", or "Filters, N on"), still matched by
`getByRole('button', { name: /^Filters/ })`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run --project web teamsList teamsHeader`
Expected: FAIL (no `facingSummary`; no expandable rows; the header still has the count).

- [ ] **Step 3: Implement the screen**

Rewrite the render of `Teams` in `apps/web/src/screens/Teams.tsx`. Keep: the recommend effect,
`editInBuild`, `filterCount`, `SOURCE_LABELS`, the `sourceOptions`, `hasCommunity` and `fellBack`
logic. Remove the old `TeamCard` export (check with a search that nothing else imports it; if
something does, switch it to `TeamCardBody`).

Add, above `Teams`:

```tsx
/** One supporting line under the controls: what the team list is weighted by. */
export function facingSummary(choice: FacingChoice, logCount: number, fellBack: boolean): string {
  if (fellBack) {
    return 'PvPoke weighting (community data unavailable)';
  }
  if (choice.source === 'prior') {
    return 'PvPoke weighting';
  }
  if (choice.source === 'log') {
    return logCount >= 15 ? 'Your log weighting' : 'PvPoke weighting until your log reaches 15 battles';
  }
  return `${WINDOW_LABELS[choice.window]} · ${SOURCE_LABELS[choice.source]} weighting`;
}
```

(`FacingChoice` is exported from `apps/web/src/state/facing.ts`.)

The new render, in this order:

```tsx
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string, i: number): boolean => open[id] ?? i === 0;
  const toggle = (id: string, i: number): void =>
    setOpen((cur) => ({ ...cur, [id]: !(cur[id] ?? i === 0) }));
  const sharing = shareEnabled(s.settings);

  return (
    <div className="screen">
      <div className="page-head">
        <Header
          variant="top"
          title="Your Teams"
          actions={
            <>
              <IconButton label="meta.pick3.gg, the community meta" href={META_URL}>
                <MetaGlyph />
              </IconButton>
              <IconButton label="Settings" onClick={openSheet}>
                <CogGlyph />
              </IconButton>
            </>
          }
        />
        <LeagueSwitcher />
        <div className="row teams-controls">
          {/* the existing Source and Window Selects, unchanged */}
          <FilterButton count={filters} onClick={openFilters} />
        </div>
        {!hasCommunity ? <span className="meta">No community data for this league</span> : null}
        <p className="meta teams-summary">{facingSummary(choice, logCount, Boolean(fellBack))}</p>
      </div>
      <div className="scroll teams-list">
        <button type="button" className="action-row" onClick={() => navigate({ screen: 'build' })}>
          {/* unchanged Build your own team row */}
        </button>
        {s.boot === 'loading' ? <Progress stage="boot" done={0} total={0} /> : null}
        {s.recommending && s.progress ? <Progress {...s.progress} /> : null}
        {s.recommending && !s.progress ? <Progress stage="eligibility" done={0} total={0} /> : null}
        {s.recommendError ? <ErrorState line={s.recommendError} /> : null}
        {!s.recommending && s.recommendation && teams.length === 0 ? (
          <Empty
            line="No team fits these filters. Loosen one to see recommendations again."
            action={<FilterButton count={filters} onClick={openFilters} />}
          />
        ) : null}
        {teams.map((t, i) => (
          <div className="teams-item" key={t.id}>
            <ExpandRow
              summary={<TeamRowSummary team={t} />}
              open={isOpen(t.id, i)}
              onToggle={() => toggle(t.id, i)}
            >
              <TeamCardBody team={t} legend={i === 0} />
              <div className="teams-actions">
                <Button variant="text" href={hashFor({ screen: 'team', id: t.id })}>
                  View analysis
                </Button>
                <Button variant="text" onClick={() => editInBuild(t)}>
                  Edit team
                </Button>
              </div>
            </ExpandRow>
            {i === 0 && logCount < 15 ? (
              <ProgressCard
                title="Make these teams personal"
                done={logCount}
                goal={15}
                line={`Log ${15 - logCount} more ${15 - logCount === 1 ? 'battle' : 'battles'} to weight teams by what you actually face.`}
                {...(sharing ? { contribution: 'Anonymous logs also improve the live meta.' } : {})}
              />
            ) : null}
          </div>
        ))}
        {s.recommendation ? (
          <p className="meta teams-footer">
            {`${s.recommendation.stats.triosScored.toLocaleString('en-US')} combinations scored · ${s.recommendation.stats.finalists} simulated with your exact Pokémon`}
          </p>
        ) : null}
      </div>
    </div>
  );
```

Notes:
- `openSheet` comes from `useActions()` (add it to the destructure); the no-collection branch
  keeps returning `<NoCollection navigate={navigate} />`.
- `ExpandRow`'s body renders only while open, so the actions never exist in a closed row; the
  actions are outside the toggle button, so tapping them never toggles the row.
- `Button` with `href` renders a link (Task 3 of the foundation), so "View analysis" is a link,
  as the test expects.
- Remove imports that are no longer used (`Chip`, `FitTag`, `StructureTag`, `RoleLabel`,
  `PokemonToken` if only the old card used them, `MetaButton`, `HeadCog`).

Append to `apps/web/src/app.css` (tokens only):

```css
.teams-controls {
  gap: var(--space);
  align-items: flex-end;
  flex-wrap: wrap;
}
.teams-summary {
  margin: 0;
}
.teams-list {
  gap: 12px;
}
.teams-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.teams-actions {
  display: flex;
  justify-content: space-between;
  gap: var(--space);
  padding-top: 8px;
}
.teams-footer {
  text-align: center;
}
```

- [ ] **Step 4: Run the web tests, typecheck and lint**

Run: `npx vitest run --project web && npm run typecheck && npm run lint && npm run check-colors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/Teams.tsx apps/web/test/teamsList.test.tsx apps/web/test/teamsHeader.test.tsx apps/web/src/app.css
git commit -m "Web: Your Teams on the foundation, expandable team rows, one Filters button, progress card"
```

---

### Task 5: Teams in the audit, clean in both themes

**Files:**
- Modify: `apps/web/scripts/screens.mjs` (Teams captures and `AUDIT_ENFORCED`)
- Modify: whatever styles the audit flags on the Teams screenshots (`apps/web/src/app.css`,
  `packages/ui/base.css`), tokens only
- Modify: `scripts/color-literal-baseline.json` only if a literal is removed (it may only shrink)

**Interfaces:**
- Consumes: the audit mode from the foundation (`--audit`, `forEachTheme`, `auditPage`,
  `AUDIT_ENFORCED`).
- Produces: Teams screen names in `AUDIT_ENFORCED`, so any later regression on Teams fails
  `web:audit`.

- [ ] **Step 1: Add the Teams states to the capture script**

In `apps/web/scripts/screens.mjs`, around the existing Teams captures (`02-teams`,
`teams-community`, `19-teams-ultra`), make sure these states are captured (add steps where
missing; reuse the script's existing waits and selectors; name each shot as listed):

- `02-teams`: the populated list, first row open (existing).
- `teams-second-open`: after tapping the second row's toggle (`.ui-expand-head` second match).
- `teams-community`: a community source picked (existing).
- `19-teams-ultra`: the Ultra league (existing).
- `teams-cup`: the Tournament cup picked through the league overflow sheet (open "More leagues
  and cups", tap the Tournament row, wait for the list).
- `teams-filters-sheet`: the Filters sheet open from the Filters button.
- `teams-no-collection`: Teams before any import (the script's early visit before the sample
  import; if none exists, add one at the start: `#/teams` with no collection saved).

Then set, at the top of the script:

```js
const AUDIT_ENFORCED = new Set([
  '02-teams',
  'teams-second-open',
  'teams-community',
  '19-teams-ultra',
  'teams-cup',
  'teams-filters-sheet',
  'teams-no-collection',
]);
```

- [ ] **Step 2: Run the audit and read the Teams findings**

Run: `npm run web:audit`
Expected at first: findings on the enforced Teams screens (the run exits 1). Everything on those
screenshots counts, including shared chrome such as the tab bar and the league row.

- [ ] **Step 3: Fix every Teams finding**

Fix each finding at its source, tokens only: contrast (a text token on the wrong ground),
tap targets under 44px (a missing `min-height: var(--tap)`), clipping or overflow, copy (an
unaccented "Pokemon", an em dash). Never exempt a real control, and never remove a screen from
`AUDIT_ENFORCED` to pass. A fix that changes something outside Teams (for example the tab bar)
is expected; list it in the report as a visible change. If a finding cannot be fixed without a
product decision, stop and report it as a concern with the screenshot path.

Re-run `npm run web:audit` until it exits 0, then run `npm run web:screens` and
`npm run meta:screens` (both must pass) and `npm test`.

Before any capture, check ports 4173 and 4174; never kill a process you did not start.

- [ ] **Step 4: Commit**

```bash
git add apps/web/scripts/screens.mjs apps/web/src/app.css packages/ui/base.css
git commit -m "Web: Teams screens join the enforced audit, clean in dark and light"
```

(Add `scripts/color-literal-baseline.json` to the `git add` only if it changed.)

---

### Task 6: The Teams audit record

**Files:**
- Create: `docs/design/audits/teams.md`
- Create: `docs/design/audits/img/teams-*.webp` (one per captured state and theme)

**Interfaces:**
- Consumes: `docs/design/audits/_template.md`, the Task 5 captures in `apps/web/screenshots/`.

- [ ] **Step 1: Convert the captures**

For each Teams capture from Task 5 (`<name>-dark.png`, `<name>-light.png` in
`apps/web/screenshots/`), write a WebP next to the record:

```bash
node -e "const s=require('sharp'),fs=require('fs');for(const f of fs.readdirSync('apps/web/screenshots')){if(/^(02-teams|teams-|19-teams-ultra).*-(dark|light)\.png$/.test(f)){s('apps/web/screenshots/'+f).resize({width:600}).webp({quality:72}).toFile('docs/design/audits/img/'+f.replace(/\.png$/,'.webp'))}}"
```

- [ ] **Step 2: Write the record**

Create `docs/design/audits/teams.md` from `docs/design/audits/_template.md`:

- Piece 2; inventory entry page 1; intake entries "Page 1: Your Teams, first pass", "second
  pass" and "direction".
- The screenshots table, one row per state, dark and light.
- Automated checks ticked with the date and the `web:audit` result for the enforced Teams
  screens.
- Aesthetics, ticked item by item against the screenshots (one page title; one filled primary: on
  Teams there is none, which is correct since the page's actions are per team; tags read, chips
  tapped; the top-level header; rows aligned; sprites unchanged; one supporting line before the
  first result; light as readable as dark).
- Functionality: every "must keep" from inventory page 1, item by item (recommendations on
  device with staged progress; each card's fit, structure, difficulty and why, three Pokémon with
  roles, explanation, cost; edit and analysis as separate actions; the footer counts; sprites
  only), plus the new behaviors (battle-strength order, first row open, Filters count, progress
  card rules).
- Findings and fixes from Task 5, with commits, and the list of visible changes outside Teams.
- The sign-off line, unticked.

- [ ] **Step 3: Commit and hand off**

```bash
git add docs/design/audits/teams.md docs/design/audits/img/
git commit -m "Design: Your Teams audit record"
```

Report the record's path. Travis signs it; Build's plan starts after he does.
