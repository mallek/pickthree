# Collection model: identity, re-import merge and pins

Date: 2026-10-01. Status: approved in chat by Travis (sections 1 to 3), written up for review.

This is piece 1 of three. Piece 2 turns the species page into the collection manager (mocks on
branch `mock/species-manager`). Piece 3 puts the moves a Pokemon knows into the sims. Each piece
has its own spec, plan and build.

## Why

The species page is becoming the place a player manages their Pokemon: pin the one that
represents a species, edit it, evolve it, remove it. None of that survives today's data model:

- A Pokemon's id is a hash of species, IVs and level (`specimenId`). Powering up or evolving
  changes the id, so anything pointing at it (a pin, a saved team, a battle log entry) breaks.
- An import replaces the whole collection. Edits made in pick3 are lost on the next import, and
  a Pokemon the player removed comes straight back.
- The engine fields "the best copy" of a species by its own rule in four places, and the rules
  differ (stat product in the team search, stage then IV rank in Counters, IV rank in Analyze).

## What changes

### 1. A permanent id

A Pokemon gets its id once and keeps it. Existing saves keep the ids they have. `specimenId`
still mints the id of a new Pokemon (from its values at that moment), but nothing recomputes an
id afterwards: not an edit, not an evolution, not a newer scan.

### 2. Re-import merges

`mergeScan(existing, removed, scanned, index, now)` in `packages/engine/src/collection/merge.ts`
takes the stored collection and the freshly parsed scan and returns the new collection plus a
breakdown. An import no longer replaces anything.

**Matching.** A scan row and a stored Pokemon are the same Pokemon when all of these hold:

- Same Shadow flag.
- Same IVs. With no IVs on either side: same species, CP and HP, as today.
- Same evolution line: the same species, or one can evolve into the other (`stagesFrom`). So an
  Eevee evolved since the last scan still matches when it comes back as an Umbreon, and a
  Galarian Stunfisk never matches a Kantonian one.

When several candidates share those values, pairs are taken best first: same species before a
different stage, then the closest level, then the closest CP, then by id so the result never
depends on file order. Each stored Pokemon and each scan row pairs at most once.

A stored Pokemon with no IVs also pairs with an unpaired scan row of the same species, CP and HP
that now has IVs. That is the rescan pick3 asks for under "Needs rescan".

Purifying changes the IVs, so a purified Pokemon arrives as a new one and the stored Shadow is
reported as not in the scan.

**The newest information wins.** Every scan row carries a scan date. Every edit in pick3 stamps
`editedAt` on the Pokemon. Both are phone-local wall-clock strings (`YYYY-MM-DD HH:MM[:SS]`), the
frame Poke Genie writes, so they compare as text.

- The scan is newer than both the stored scan date and `editedAt`: the scan's species, CP, HP,
  level, IVs, Lucky, Purified, moves and Mega mark replace the stored values. The id, the Level 4
  Mega mark and `evolvedFrom` stay. A Pokemon typed in by hand becomes a scanned one.
- Otherwise nothing changes. Re-importing the same file is a no-op.
- A scan row with no usable date (a hand-made sheet) is dated at the import itself, so the sheet
  wins. That is what the player expects of a sheet they maintain.

**Removed stays removed.** Removing a Pokemon leaves a `RemovedMark` holding its match values. A
scan row that pairs with no stored Pokemon and matches a mark is skipped. Marks are checked after
stored Pokemon, so with two identical Eevees, one kept and one removed, a scan with both pairs
one and skips one. Adding a matching Pokemon by hand clears the mark.

**Not in the scan.** A stored Pokemon no scan row matched is kept. Scanned ones are counted and
listed on the Report with a button that removes them (leaving marks). Hand-added ones are never
counted: they were never in a scan.

**The Report** gains a merge breakdown on every import after the first:

- New: added by this import.
- Merged: matched a Pokemon you already had, with how many a newer scan updated.
- Skipped (deleted): matched a Pokemon you removed.
- Not in this scan: kept, with "Remove them".

Today's "Duplicates merged" (two scans of one Pokemon inside one file) is renamed "Duplicate
scans" so the two do not read alike.

### 3. Pins

One pin per battling species per league. `PinMap = Record<speciesId, string | null>` for one
league, keyed by the species as it battles (`build.speciesId`), so the Umbreon pin can point at
an Eevee and Shadow Swampert has its own.

- No entry: the default pick.
- A Pokemon id: the player's override.
- `null`: unpinned. None of the player's copies is fielded and the species is treated exactly as
  one they have not collected: absent from recommended teams, a top 10% stand-in to get wherever
  the app already offers Pokemon the player does not own (Build, Suggest teammates, Counters).

**The default pick** is one function, `comparePicks`, in
`packages/engine/src/collection/pins.ts`:

1. A copy that is already built and in the top 25% of IVs for the league.
2. Best IV rank for the league.
3. Fewest evolutions to go, then fewest levels to go.
4. The id, so the order is total.

This is "best verdict, then IV rank" without a simulation: the verdict labels order copies of one
species by exactly these two facts. The team search used stat product then cost and ignored
whether a copy was built; Counters put stage first. Both now use this.

**Where it applies.** `candidatePool` already keeps one copy per species; that step now honors
the pin. Recommended teams, Analyze's alternatives and Suggest teammates draw from it.
`fieldedBuilds` gives the same answer to Counters' owned marks and to Analyze's "run my copy of
this species". A pick that names a specific Pokemon (a saved team, a battle log entry) is still
honored as given.

Filters and pins: the default pick is chosen among copies that pass the filters, so a cheaper
copy can stand in when the best one is over budget. An override is the player's word: if the
pinned copy fails a filter the species sits out, it is not swapped.

**A stale pin** (the Pokemon is gone, or has no build of that species in the league any more)
falls back to the default pick. Removing a Pokemon also deletes the pins that named it.

**The shared Eevee** needs nothing new: Umbreon and Vaporeon may both resolve to the same Eevee
and `teamRules` already keeps one Pokemon out of two slots.

### 4. Evolve

`evolveSpecimen(s, toSpeciesId, index, now)` in `collection/evolve.ts`: same id, level and IVs;
the new species; CP and HP recomputed; moves cleared (they change on evolving); `evolvedFrom`
set; `editedAt` stamped. It refuses a species the Pokemon cannot evolve into and a Pokemon with
no IVs. No button in this piece.

## Storage

No database version bump. Every field is optional with a documented default, as `Settings` does.

On `Specimen`:

- `editedAt?: string` - last edit in pick3. Absent means never edited.
- `evolvedFrom?: string` - the species it was before an in-app evolution.

On `StoredCollection`:

- `removed?: RemovedMark[]` - absent means none.
- `pins?: Record<leagueId, PinMap>` - absent means every species uses the default pick.

On `ImportReport`:

- `merge?: MergeBreakdown` - absent on a first import and on older saves.

Old saves are not converted. The first import after the update merges.

## Out of this piece

- The species page, Edit form, pin and evolve buttons (piece 2). The store gets `setPin` so the
  wiring is testable; nothing calls it from a screen yet.
- Known moves in the sims, including whether a Shadow with no moves saved should be run with
  Frustration (piece 3).
- Best Buddy. The official page says a Best Buddy gets "a small CP boost when that Pokemon is
  your buddy"; I did not find a first-party statement that it applies in GO Battle League, and
  nothing in this piece reads it. The field waits for piece 2 and a proper source.
- Mega level beyond today's Level 4 mark.

## Privacy

Nothing new leaves the device. Pins, marks and edit stamps live in IndexedDB with the collection.

## Tests

Synthetic data for logic (no pinned PvPoke values); invariants only on live data.

- Merge: new, merged and unchanged, updated by a newer scan, kept because the edit is newer,
  skipped by a mark, not in scan, two with the same IVs, no IVs then IVs, evolved since the last
  scan, a regional form never matched, a dateless sheet.
- Pins: the default order, an override, a stale pin, unpinned, a filter failing the pinned copy,
  a shared Eevee reaching two species.
- Evolve: id, level and IVs kept; CP recomputed; moves cleared; bad targets refused.
- Storage: an old save without the new fields loads and round-trips.
- Fixture: `fixtures/pokegenie-rescan.csv`, derived from the sample by `fixtures:derive`: the
  same collection a week later with some rows powered up, some dropped and some added.
