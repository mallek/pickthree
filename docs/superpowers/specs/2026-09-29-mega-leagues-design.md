# Mega leagues: mega builds from the collection, one Mega per team

Date: 2026-09-29. Status: design approved in chat 2026-09-29, spec awaiting review.

Follows `2026-09-29-gbl-rotation-sync-design.md`, which made pick3's cups follow the GBL schedule
and left out every format with Mega in it. About half of the Twilight Trails rotation is Mega
formats, and Mega Color Cup (Great League edition) is live until 2026-10-06 20:00 UTC. This spec
makes those formats buildable from the player's own collection.

## Summary of decisions

1. **A Mega is another candidate build of a Pokemon the player owns.** Next to each evolution
   stage a specimen can reach, the build step adds that stage's Megas (`charizard_mega_y`, same
   IVs). The matchup matrix, scoring and explanations already work in battling-species terms, so
   they need no change.
2. **Every mega-capable line is offered; the ones already mega-evolved are ready.** Poke Genie's
   Form column (`Mega`, `Mega X`, `Mega Y`) marks the specimens the player has mega-evolved; the
   importer keeps that mark instead of folding it away. A marked specimen's matching Mega build is
   `ready`; every other Mega build costs Mega Energy.
3. **One Mega per team, at most.** Team search and teammate suggestions never propose two; a
   hand-built team with two gets a warning. Teams with no Mega stay legal.
4. **Shadow Pokemon cannot Mega Evolve; purified can.** One constant holds the rule.
5. **The cap applies to the Mega form; the player powers up the base form.** A Mega build's level
   keeps the Mega at or under the cap, and pick3 always states the base-form CP to power up to,
   with the Mega CP beside it: "Power up to CP 1118 (1475 as Mega)".
6. **Mega formats are rotation leagues like any cup.** The feed parser stops skipping them; aliases
   map them to PvPoke cups; they build, show, nudge and fall back exactly as the rotation spec
   says.
7. **Add Pokemon gets a Mega mark**, so a hand-added Pokemon can count as ready.
8. **Mega Level 4 is set per Pokemon.** Only Megas PvPoke tags `supermega` can reach it (16 at
   the pin). A Level 4 Mega battles 2 levels above the stored base Pokemon (level cap 52), so its
   base CP target is lower. Poke Genie does not export Mega Level; the player sets it.

## Game rules this rests on

- One Mega per team of three in GBL Mega formats; the Pokemon is Mega Evolved on the party screen
  before the match (Pokemon GO Hub, Dexerto guides for the Twilight Trails season, 2026).
- Mega Color Cup: Great League Edition: 1,500 CP cap, Mega Evolved Pokemon allowed, only Fire,
  Water, Grass and Electric types (LeekDuck event page; PvPoke `cups/colormega.json`).
- The CP cap applies to the Pokemon as it battles, the Mega form. The stored Pokemon is the base
  form, so the player powers the base form to the level at which its Mega is under the cap.
  Checked on Travis's collection: Sableye 10/15/14 builds at level 27.5, base CP 1118, Mega CP
  1475.
- Shadow Pokemon cannot Mega Evolve. Purified Pokemon can (confirmed by Travis 2026-09-29).
- Mega Energy costs are not in PvPoke's data. pick3 states that energy is needed, never an amount.
- Mega Level 4 (Super Max): the Mega battles 2 levels above the base Pokemon, level cap 52
  (PvPoke commit 82a974f, "Mega Level 4 CP Boost", 2026-09-02). Only species tagged `supermega`
  can reach it: at the pin Beedrill, Raichu X/Y, Victreebel, Starmie, Dragonite, Mewtwo X/Y,
  Skarmory, Houndoom, Staraptor, Chesnaught, Delphox, Greninja, Malamar, Falinks. Mega Levels are
  tracked per Pokemon and, since 2026-05-18, per Mega form. Super Max Megas also gain an extra
  charged attack in GBL; that is out of scope here (see Out of scope).

## Engine

### Species

- `Species.megaOf?: string`: for a Mega or Primal entry, the species it evolves from. Baked by the
  data build from the PvPoke id: strip a trailing `_mega`, `_mega_x`, `_mega_y` or `_primal`. The
  build fails if the stripped id is not a species in the game master.
- `GameDataIndex.megasOf(speciesId): Species[]`: every species whose `megaOf` is that id.

### Specimens

- `Specimen.megaForm: 'mega' | 'mega_x' | 'mega_y' | null`. The importer maps Form `Mega`,
  `Mega X`, `Mega Y` (and the folded `Name (Mega)` spellings it already splits) to the base species
  as today, and records the form here. Absent in collections saved before this change: read as
  `null`.
- `Specimen.megaLevel4?: boolean`: set by the player (never by import), meaningful only with a
  `megaForm` whose Mega species is tagged `supermega`. Absent means false.
- Level derivation is unchanged: Poke Genie's CP for a Mega-marked row is the base form's CP.

### Builds

`buildsFor` adds, for each evolution stage the specimen can reach, one build per Mega of that
stage (`index.megasOf(stage.speciesId)`), under the same rules as any stage:

- the league must allow the Mega species (`allowedInLeague`; leagues that ban Megas never yield
  one, since their cup rules exclude the `mega` tag);
- the Mega's CP at the specimen's current level must be at or under the cap (no powering down);
- the level is the highest that keeps the Mega's CP at or under the cap (and within the level cap);
- the Mega's CP at that level must clear the competitive floor;
- `MEGA_BARRED_FOR = ['shadow']`: a shadow specimen gets no Mega build.

The Build gains:

- `mega: { ready: boolean } | null`: `ready` when the specimen's `megaForm` matches this Mega
  (`mewtwo` marked `mega_y` is ready as `mewtwo_mega_y`, not as `mewtwo_mega_x`);
- `baseCp: number`: the base form's CP at the level the player powers the base to (equal to `cp`
  for non-Mega builds);
- `baseLevel: number`: that level. For a Level 4 Mega (ready, `megaLevel4`, species tagged
  `supermega`) the Mega battles at `baseLevel + 2`, the build's `level` is the battle level, the
  level cap is 52, and the cap and floor checks use the battle level; otherwise
  `baseLevel === level`.

### Cost

`buildCost` adds `megaEnergy: 'needed' | 'ready' | null` to `Cost`. The cost weight adds a fixed
penalty for `needed` (a named constant, tuned so a ready Mega outranks an otherwise equal one that
needs energy). No amount is ever shown.

### One Mega per team

- Team search (`search/trios.ts` and the finalists step): a trio with two Mega builds is never
  scored.
- Teammate suggestions (`teammates/suggest.ts`): with a Mega pinned, no Mega is suggested; with no
  Mega pinned, at most one fill is a Mega.
- Team Analysis of a hand-built team with two Megas still runs; the result carries a flag
  (`twoMegas: true`) the app turns into a warning.

## Data and feed

### Parser and aliases

- `parseFeed` stops skipping formats containing `Mega`. Mega formats resolve through
  `cup-aliases.json` like any cup. Two title shapes:
  - Mega Editions of the open leagues, keyed by the full format text:
    `"Great League: Mega Edition": { "cup": "mega", "cp": 1500, "id": "mega-great" }`,
    `"Ultra League: Mega Edition": { "cup": "mega", "cp": 2500, "id": "mega-ultra" }`,
    `"Master League: Mega Edition": { "cup": "mega", "cp": 10000, "id": "mega-master" }`.
  - Mega cups, keyed by the cup title with the edition suffix setting the cap:
    `"Mega Color Cup": { "cup": "colormega" }`.
- `CupAlias` gains an optional `id` (the league id), needed because one PvPoke cup (`mega`) runs at
  three caps. Without `id` the existing rule applies.
- Mega Halloween Cup and Mega Catch Cup have no PvPoke cup yet; they stay unmapped and raise the
  existing "Map GBL cup" issue until PvPoke publishes them and an alias line is added. No alias is
  guessed ahead of PvPoke.

### Leagues built

- Mega rotation leagues build like any rotation league (rankings, meta, matrix, freshness).
- `metaGroupFor` matches PvPoke's formats by cup AND cap (today it matches by cup only, which would
  give all three `mega` caps `megagreat`): 1500 `megagreat`, 2500 `megaultra`, 10000 `mega`,
  `colormega` 1500 `colormega`.
- `PICKTHREE_SPECIAL_CUPS` stays off; its loop already skips ids a rotation league built.

### Species lists

- `allSpecies` (the app's search universe) includes Megas. The league-legal filter keeps them out
  of leagues that ban them; Add Pokemon keeps excluding them (the player adds the base form and
  marks it).
- Sprites: the sprite build already maps every PvPoke id; the plan's first task confirms Mega
  renders exist and falls back to the base species' picture where one does not.

## App

- **Tokens:** a Mega build shows the Mega sprite and name ("Mega Sableye") with a small "Mega"
  pill, the way shadows carry their flame aura.
- **Build line and verdict sentence:** lead with the base CP: "Power up to CP 1118 (1475 as
  Mega)". A marked specimen already at that base CP reads as built.
- **Cost tiles:** a "Mega Energy" tile, or "Mega Energy (mega-evolved before)" when ready.
- **Team Analysis:** with `twoMegas`, the line "Only one Mega per team in GBL. Swap one out." above
  the results.
- **Collection:** Mega-marked specimens show the pill on their row; the Pokemon page lists the
  Mega build per league next to the base build.
- **Add Pokemon:** a "Mega-evolved before" checkbox under the IV fields. For species with two
  Megas it is a choice: Mega X or Mega Y. It sets `megaForm`. When the chosen Mega can reach Level
  4, a "Mega Level 4" checkbox follows; it sets `megaLevel4`.
- **Pokemon page:** for a Mega-marked specimen whose Mega can reach Level 4, the same "Mega Level
  4" toggle, saved on the specimen (collection specimens come from the CSV, so this is the way to
  set it for them).
- **Level 4 wording:** "Power up to CP <base> (<mega> as Mega, Level 4)".
- **Search:** Megas are findable for logging opponents in Mega leagues (via `allSpecies` and the
  legal list).

## Testing

Synthetic data for logic; live PvPoke data only for invariants.

- Level 4: a synthetic `supermega` Mega marked Level 4 battles at base level + 2; its base CP is
  computed at the base level; the cap check uses the battle level; the level cap is 52 (a Master
  League Level 4 Mega battles at 52 from a level 50 base); an unmarked or non-`supermega` Mega
  never gets the boost; Add Pokemon and the Pokemon page only offer the toggle for `supermega`
  Megas.
- Mega build level and both CPs under a cap; the Sableye case from Travis's data as a fixed
  example (base stats and IVs 10/15/14 from the game master: level 27.5, base CP 1118, Mega CP
  1475).
- A specimen whose Mega CP at its current level is over the cap gets no Mega build.
- `ready` only for the marked form (Mega Y vs X).
- Shadow gets no Mega build; purified does.
- Team search never returns two Megas; suggestions respect the pin; Team Analysis flags two.
- Importer keeps `megaForm` from both the Form column and folded names; old saves read `null`.
- `megaOf` derivation, including `_primal`, and the build failing on an unknown base.
- Parser: real Mega Edition and Mega Color feed names map; the three `mega` caps map to three ids
  and three meta groups; Mega Halloween is unmapped.
- Live invariant: every Mega PvPoke ranks in Mega Color Cup has a `megaOf` that exists; every
  built Mega league has rankings, a meta and a matrix covering it.
- App: token pill, base-CP build line, cost tile, two-Mega warning, Add Pokemon box (X/Y choice),
  Mega opponent searchable in Mega Color Cup and not in Great League.
- Captures through `web:audit`: a Mega Color Cup team with a Mega, the two-Mega warning, Add
  Pokemon with the box; both themes.

## Rollout

Mega Color Cup is live until 2026-10-06 20:00 UTC and the three Mega Editions start then, so ship
as early as the plan allows. Done when pick3.gg lists Mega Color Cup, recommends a team for
Travis's collection with at most one Mega, and states Sableye's build as base CP 1118 (1475 as
Mega) wherever it is suggested.

## Out of scope

- Mega Energy amounts, and Mega Levels 1 to 3 (they do not change stats).
- The extra charged attack Super Max Megas gain in GBL, until PvPoke's simulator models it.
- Primal and Mega Rayquaza rules beyond what PvPoke's cup filters already encode.
- Mega Halloween and Mega Catch cups until PvPoke publishes them.
