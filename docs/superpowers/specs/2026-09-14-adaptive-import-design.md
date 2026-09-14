# Adaptive import: read any collection file

Date: 2026-09-14. Status: approved in chat, building.

## Why

The importer requires Poke Genie's exact header names. A Reddit tester's export named the dex
column "Pokemon" instead of "Pokemon Number" and the file was refused before a single row was
read. Poke Genie will keep renaming columns, Calcy IV exports a different file, and some players
keep a hand-made sheet. Travis does not want a list of aliases that works once; he wants the app
to detect what it needs from whatever it is given.

## What changes

The import layer stops matching header strings and starts matching meaning. A file is evidence:
each column is scored against every concept the engine understands, using the header as a hint
and the values as the proof. Only the concepts the engine truly needs are required. Everything
else degrades with a sentence in the import summary. Layouts the app has not seen are reported
anonymously so the matchers improve from the field instead of from guesses.

Out of scope: Excel files (detect the signature, tell the user to export as CSV), a manual
column picker (hold until a field report shows a layout the resolver cannot handle), and
changing what a Specimen is.

## Concepts

The engine needs these per row. Required: `name`, `cp`, `atk`, `def`, `sta`. Level is required
in spirit: if no level column resolves, it is derived from CP and IVs with the existing
`levelForCp`. HP is derived from base stats, IVs and level when absent.

| Concept | Required | Header hints (normalized) | Content shape |
| --- | --- | --- | --- |
| name | yes | name, pokemon, species, mon | most values map through `mapSpecies` (with the row's form and shadow when those resolve, else bare) |
| form | no | form, variant | mostly blank, plus words the form tables know (Alolan, Galarian, Hisuian, Origin, Altered, Mega, ...) |
| cp | yes | cp, combatpower | integers 10..6000 |
| hp | no | hp, stamina (not "sta iv"), hpstat | integers 10..600 |
| atk | yes | atk, attack, atkiv, attiv, ivatk | integers 0..15 |
| def | yes | def, defense, defence, defiv | integers 0..15 |
| sta | yes | sta, stamina, hpiv, staiv, ivsta, ivhp | integers 0..15 |
| levelMin | no | levelmin, level, lvl, lv, pokemonlevel | 1..51 in half steps |
| levelMax | no | levelmax | 1..51 in half steps, >= levelMin |
| shadow | no | shadow, shadowpurified, shapur | 0/1/2, or the words shadow, purified, yes, no, true, false, blank |
| purified | no | purified | yes/no/true/false/1/0/blank (only when shadow is not the combined code) |
| lucky | no | lucky | yes/no/true/false/1/0/blank |
| fastMove | no | quickmove, fastmove, fastattack, move1 | most non-blank values are known fast moves |
| chargedMove1 | no | chargemove, chargedmove, specialmove, move2 | most non-blank values are known charged moves |
| chargedMove2 | no | chargemove2, chargedmove2, specialmove2, move3 | same |
| scanDate | no | scandate, date, scanned, lastscan | ISO or locale dates |
| originalScanDate | no | originalscandate, firstscan | dates |
| dex | no | pokemonnumber, number, dex, dexno, no, id | integers 1..1100 |
| pgRankPctG etc. | no | rank%(g), rank#(g), dustcost(g), candycost(g), name(g), form(g), shapur(g) | as today |

Three IV columns with no usable headers are assigned in the order they appear (attack, defense,
stamina), which is the order every known tool uses. The summary says so.

## Resolution

1. **Read the table.** Strip a BOM. Sniff the delimiter from the first 20 lines (comma, tab,
   semicolon, pipe: the one that yields the most consistent field count wins). Detect the xlsx
   signature (`PK\x03\x04`) and fail with "Export this as CSV first". Papa Parse does the rest.
2. **Decide whether row one is a header.** A header row has zero numeric cells and at least one
   cell that hits a header hint. Otherwise the file has no header and every column is scored on
   content alone.
3. **Score.** For each column and each concept: header score (0, 0.5 for a partial hit, 1 for an
   exact normalized hit) plus content score (fraction of non-blank sampled values that fit the
   shape, over up to 200 sampled rows). A concept needs a content score of at least 0.8 to be
   assigned on content alone, or 0.5 with an exact header hit. Header normalization lowercases,
   strips everything but letters, digits, `%`, `#` and parentheses, and pulls a trailing league
   marker `(G)`, `(U)`, `(L)`, `(M)` out as a separate tag.
4. **Assign greedily by score,** one column per concept and one concept per column, ties broken
   by column order. Then apply the IV order rule and the shadow/purified code rule.
5. **Fail only when a required concept is missing,** with a message naming what could not be
   found in plain words: "Could not find the attack IV column. pick3 needs a name, CP and the
   three IVs." That message names concepts, never Poke Genie.
6. **Produce a `Layout`** and hand it to row parsing.

```ts
export interface LayoutColumn {
  concept: Concept;
  index: number;
  header: string | null;
  via: 'header' | 'content' | 'order';
  confidence: number; // 0..1
}
export interface Layout {
  format: 'poke-genie' | 'calcy-iv' | 'sheet';
  delimiter: string;
  hasHeader: boolean;
  columnCount: number;
  columns: LayoutColumn[];
  unused: string[]; // headers of columns nothing claimed
  missing: Concept[]; // optional concepts not found
  ivOrderAssumed: boolean;
  confidence: number; // min over required concepts
}
```

`format` is a label for the summary and the field report, decided after resolution: Poke Genie
when the `Sha/Pur (G)` style columns resolve, Calcy IV when a `Unique IV combos` or
`Overall appraisal` style column is present, else sheet. The label changes nothing downstream.

## Row parsing

Unchanged in spirit: one `RawScan` per row, problems collected per line, IVs must be all three
or none. New: level falls back to `levelForCp` when unresolved (needs the species, so rows are
mapped to species during parsing rather than after; unmapped rows still go to the unrecognized
list); HP falls back to the stat formula; shadow accepts words as well as codes; `dex` is the
column when present, else the species' dex. `RawScan.pokeGenie` stays for the oracle test and
the Report screen; it is all null for other formats.

## Import summary

`ImportReport.header: HeaderReport` becomes `ImportReport.layout: Layout`. The Report screen
adds one line at the top: "Read as a Poke Genie export, 50 columns, 17 used" and, when
anything degraded, one sentence per consequence from this table:

| Missing | Sentence |
| --- | --- |
| levelMin | Level was worked out from CP and IVs. |
| scanDate | No scan dates, so the Scanned recently filter is off. |
| fastMove or chargedMove1 | No moves, so second-move costs assume nothing is unlocked. |
| shadow | No shadow column, so every Pokémon is treated as normal. |
| ivOrderAssumed | The three IV columns had no labels; pick3 read them as attack, defense, stamina in that order. |

## Field reports

When resolution fails, or succeeds with `confidence < 0.9`, or with any column assigned `via:
'content'` while a header row exists, the app records a diagnostic with stage `import-layout`
and a message of the form `format=sheet cols=12 header=1 conf=0.85 name=Name<h> cp=CP<h>
atk=col3<c> ... unused=Notes|Nickname`. Header names only, never values; the existing sanitizer
runs over it. The counter worker's per-field cap rises from 200 to 600 characters for this to
fit. The on-device log shows the same entry, so a user can copy it into a bug report.

## Files

- `packages/engine/src/csv/concepts.ts` (new): concept table, header normalization, shape
  matchers. Pure functions, no game data except what is passed in (species mapper, move
  lookup, form vocabulary).
- `packages/engine/src/csv/layout.ts` (new): delimiter sniff, header detection, scoring,
  assignment, `Layout`, `resolveLayout(rows, deps)`.
- `packages/engine/src/csv/parse.ts`: `parseCollectionCsv(text, index)` replaces
  `parsePokeGenieCsv(text)`; keeps `RawScan`, `RowProblem`, `ImportError` (now carrying a
  `Layout | null`).
- `packages/engine/src/csv/schema.ts`: deleted; `REQUIRED_COLUMNS` lives on as the required
  concept list in `concepts.ts`.
- `packages/engine/src/collection/specimen.ts`: `toSpecimens` takes the parsed result whose rows
  already carry `speciesId`; `ImportReport.layout`.
- `packages/engine/src/collection/manual.ts`, `apps/web/src/state/store.tsx`: empty layout.
- `apps/web/src/worker/engine.worker.ts`: call the new parser, pass `layout` on error.
- `apps/web/src/state/store.tsx`: record the `import-layout` diagnostic from the report.
- `apps/web/src/screens/Report.tsx`: format line, degradation sentences, replace the
  "optional columns missing" paragraph.
- `apps/web/src/screens/Welcome.tsx`: accept `.tsv,.txt` too; copy says "your export or a
  sheet of your own".
- `workers/counter/src/report.ts`: field cap 600.
- Fixtures in `fixtures/`: `pokegenie-sample.csv` (current), `pokegenie-2025.csv` (the Reddit
  layout: "Pokemon", "Stat Product (G)", no Original Scan Date), `calcy-iv-sample.csv`
  (approximate Calcy IV headers, marked as such), `sheet-headers.csv` (Name, CP, Atk, Def, Sta,
  Level), `sheet-noheader.tsv` (six columns, tab separated, no header),
  `sheet-semicolon.csv`. `make-fixtures.ts` derives all of them from the sample so values stay
  in sync.
- Tests: `test/csv/concepts.test.ts`, `test/csv/layout.test.ts`, `test/csv/parse.test.ts`
  (every fixture resolves to the same specimens as the Poke Genie sample for the shared rows;
  the missing-CP case fails naming CP; xlsx signature message), `workers/counter/test`.

## Build order

1. Concepts and matchers with tests.
2. Layout resolution with tests over synthetic tables.
3. New parser over the fixtures; specimen conversion; engine tests green.
4. Fixtures generator and the six fixtures.
5. Worker, store, Report and Welcome copy; counter cap.
6. Screens run, ship, reply on the thread.
