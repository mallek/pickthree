# Our own battle engine, part 1: game data and battle rules

Date: 2026-10-27. Status: approved by Travis 2026-10-27.
Origin: the cup ranking backtest handoff (Mega Halloween Cup went live 10-27 and pick3 did not have
it, because PvPoke published it only on 10-26). The brainstorm widened the goal from "rank cups the
way PvPoke does" to "own the whole engine, so we never need PvPoke to move first". This document
is the first of five specs; the other four are sketched at the end so this one does not box them in.

```
repos:
  pickthree: [packages/battle (new), packages/data (datamine fetch + lock)]
```

## Intent

Today every number in pick3 starts at PvPoke: their game master, their battle code (vendored byte
for byte, ADR 001), their movesets, their meta group, their rankings. That has two costs.

1. **We can never be first.** When a cup, a rebalance, or a new mechanic drops, pick3 waits for
   PvPoke. Minior's in-battle form change dropped mid-season and people were trying it on day one;
   pick3 needs to know the same day.
2. **PvPoke models one kind of player.** Its simulator plays near-perfectly, one Pokemon against
   one, with fixed shields and no switching. Travis's real question is "how do my exact three do
   against the teams people actually bring, played the way people at my rating actually play".
   Answering it needs an engine whose player behaviour is a dial, which means owning the battle
   logic, not just the data around it.

So the goal of the program is a battle engine that runs with PvPoke switched off: our own game
data from the datamine, our own battle rules, our own player models, our own rankings. PvPoke's
published numbers stay useful in exactly one role, as an exam: we may grade our output against
theirs, but nothing of theirs is ever an input.

This first spec builds the floor everything else stands on: game data we extract ourselves, and a
1v1 battle rules engine proven correct.

## Goals

- **Game data from the datamine.** A new package reads the datamined game master (PokeMiners
  `game_masters`, `latest/latest.json`) and produces everything a battle needs: species stats and
  types, fast and charged move pools (including elite and legacy moves as far as the data shows
  them), PvP move stats (power, energy, turns, buffs and buff chance), the type chart, the CP
  multiplier table, and the PvP leagues and cups (`combatLeague` templates carry CP cap, type
  lists, bans, unique-Pokemon rule, Mega allowance).
- **Pinned like PvPoke is today.** The datamine is fetched at a pinned commit through a lock file,
  the same pattern as `pvpoke.lock.json`, so a build is reproducible.
- **Overrides for the days the datamine lags.** A hand-kept overrides file, in our repo, patches the
  datamine: a move's new numbers from Niantic's announcement, a new species' stats. Every entry
  carries its source (announcement URL or note) and the date entered. Overrides can add whole
  forms and moves, not only patch fields (builder's call): Minior's Core form and a named Gulp
  Missile are both missing or unnamed in the 08-29 datamine. When the datamine catches up
  and agrees, the build reports the entry as redundant so it can be deleted.
- **Special forms from a menu, not code.** A hand-kept mechanics file describes each species whose
  form changes in battle, using a fixed vocabulary of triggers and effects. Starting set (from what
  the datamine flags and PvPoke models today): Mimikyu (Disguise), Aegislash (Shield/Blade),
  Cramorant (Gulp Missile, Gulping/Gorging), Morpeko (Full Belly/Hangry), Minior (Meteor/Core).
  Triggers include: battle start, HP below a fraction, charged move used (any or specific),
  shield used, hit by a charged move. Effects include: switch to form X (with its own stats,
  types, moves), block the damage of one charged move, replace move A with move B, reset on
  switch out. Entering a new species that fits the vocabulary is a data entry Travis can do from
  the announcement and the game. A species that needs a trigger or effect the vocabulary lacks is
  a code change, and the build says so plainly.
- **An alarm for unmodelled forms.** The datamine marks combat form changes (`pokemonSettings.ibfc`
  with `combatEnable: true`). If any species is marked and has no entry in the mechanics file, the
  build warns loudly. A new Mimikyu-style species never slips in silently.
- **A 1v1 battle rules engine.** Turns, fast move timing, energy, damage (STAB, type effectiveness,
  shadow, stat stages), charged moves, charged move priority (CMP) ties, shields, buffs and debuffs,
  form changes from the mechanics file. Deterministic: given the same inputs and the same random
  outcomes, the same battle. Random outcomes are supplied by the caller: buff procs, and CMP ties
  when attack stats are equal (builder's call: treated as random like a buff proc, not as a rule
  or a player decision).
- **Rules and decisions kept strictly apart.** The rules engine never decides anything. Every choice
  (which move this turn, fire or wait, which charged move, shield or not) is asked of a player
  object through a narrow interface. PvPoke mixes these (shield logic for Aegislash and Cramorant
  lives inside its `Battle.js`); we must not. This split is what lets spec 2 tune players by rating.
- **One default player** so a battle runs end to end. It should be sensible (it fires charged moves,
  shields threatening hits, uses form mechanics), but it is not tuned here and is not graded here.
- **Built so 3v3 slots in.** The battle state, the player interface and the turn loop must be shaped
  so spec 2 can add a team of three, switching, the switch timer and team-wide shield counts
  without a rewrite. This spec does not implement any of that.
- **Battle state cheap to copy and compare.** A full battle state (HP, energy, shields, stat stages,
  forms, timers, whose turn and what is queued) can be snapshotted, restored and hashed cheaply, and
  two equal states hash equal. A 3v3 game tree with every shield and switch choice is roughly 10^12
  to 10^16 lines per team pair, far too many to enumerate, but many lines reach the same state. Later
  specs (perfect-play search, measuring how forgiving a team is) depend on searching states instead
  of lines, which is impossible if state cannot be copied and compared.

## The exam

Two exams, both using PvPoke only as a grade.

1. **Rules exam (must match exactly).** Our engine and the vendored PvPoke simulator play the same
   scripted battles: the same two Pokemon, IVs, levels and moves, and the same fixed sequence of
   actions (which turn each side throws which charged move, whether each charged move is shielded,
   whether each buff procs). PvPoke's `Battle.js` supports this through its sandbox mode
   (`setActions`, sandbox flag). Compare HP and energy for both sides turn by turn. Any difference
   is a bug in one engine and gets investigated, not tolerated. The script set must cover: plain
   fast move trades, charged move timing and CMP ties, shields, every buff kind, shadow, and each
   species in the mechanics file.
   - The game wins (Travis, 2026-10-27). Where PvPoke and the real game disagree, our engine
     follows the game. The repo keeps a written list of known differences from PvPoke; each entry
     names the behaviour, what each engine does, and the evidence for the game's side (a recorded
     battle, Niantic's notes, or the datamine, for example `ibfc.animationDurationTurns: 5` on
     Mimikyu, Aegislash and Morpeko where PvPoke applies a delay only to Minior). The exam passes
     when every mismatch is explained by an entry on that list. A mismatch not on the list fails.
     The mechanics vocabulary therefore needs an animation-turns effect.
   - Same numbers on both sides (builder's call, made in review): for this exam the harness
     converts PvPoke's game master into our compact format and runs both engines on it, so a
     data difference can never pose as a rules bug. The converter lives in the exam harness, not
     in `packages/battle`, which still never reads PvPoke. The data exam (below) covers the data.
   - Runtime patching (builder's call): where PvPoke's sandbox mode cannot follow a script (it
     skips `battle_start` form changes, and only `forceBuff` scripts a buff proc), the harness may
     patch behaviour inside the vm context at runtime, the same way the shim already supplies
     globals. The vendored files stay byte for byte. If something still cannot be scripted, run it
     in `simulate` mode with a stub AI and say so in the exam output.
   - CI gate (builder's call): the rules exam runs in CI next to the golden test, using the cached
     data build plus a cached datamine fetch.
2. **Data exam (report, not gate).** Compare our extracted species, moves and cup rules against
   PvPoke's game master at the pinned commit and list every difference. Most should be explained by
   freshness (one side newer) or naming. This is how we find extraction bugs early.

Rule from earlier pick3 work still holds: no PvPoke values pinned in tests. Logic tests use
synthetic data; the exams run against live data and assert invariants (they agree), not numbers.

## Non-goals

- No change to the app (`apps/web`) or to what the app ships. The vendored PvPoke simulator keeps
  doing its current job until a later spec says otherwise.
- No 3v3, switching, or player models by rating (spec 2).
- No rankings, team vs field, or meta group (specs 3 and 4).
- No change to the blended meta (spec 5).
- No grading of decisions. Our default player is expected to choose differently from PvPoke's.
- Not a reverse-engineering project on the game client. The datamine plus our overrides is the
  source.

## Anti-goals (would be a failure even if it works)

- Reading any PvPoke file as an input to our engine or our data. The exam harness may load PvPoke;
  `packages/battle` itself must not import or read anything from `sim-pvpoke` or `.pvpoke`.
- Decision logic leaking into the rules engine, even one special case "for now".
- A special form handled by an `if (speciesId == ...)` in the rules engine instead of the mechanics
  vocabulary. If the vocabulary cannot express it, extend the vocabulary.
- A datamine gap filled silently. Every override is visible, sourced and dated.

## Constraints

- pick3's repo rules apply (CLAUDE.md): exact pinned versions, braces on all control flow, no em
  dashes, warnings as errors, explicit staging, solo commits to main.
- `packages/battle` is pure TypeScript with no DOM, so it can run in Node at build time and later in
  the browser worker. Dependency direction stays clean: `engine` must not import it in this spec.
- The datamine is about 19 MB of JSON. Extraction runs at build time; what the engine loads is a
  compact derived file, not the raw dump.
- Compute stays small. The engine only needs to re-run when its inputs change (datamine bump,
  override, mechanics entry, new cup).

## Findings from recon (2026-10-27)

- PokeMiners `game_masters` was last updated 2026-08-29, two months stale at the time of writing.
  Minior's form change is absent from it, and Cramorant's Gulp Missile appears only as an unnamed
  move number (593). Freshness is the program's main risk, which is why overrides exist.
- The datamine carries cup rules in `combatLeague` templates (for example
  `COMBAT_LEAGUE_VS_SEEKER_GREAT_HALLOWEEN`: CP 1500, types Bug/Poison/Dark/Fairy/Ghost, bans,
  unique Pokemon). A cup appears there only once it ships in the client, which can be later than
  the season announcement.
- `ibfc` in `pokemonSettings` names the default and alternate form and the animation length in
  turns, but not the trigger or effect. Those come from our mechanics file.
- PvPoke's equivalent table is 10 `formChange` entries in its `pokemon.json` plus special cases in
  `Battle.js` and `ActionLogic.js`. Its vocabulary (trigger: battle_start, hp, charged_move,
  activate_charged, activate_shield, charged_move_damage; effect: protect; type: set or toggle) is
  a good starting point to design ours against, as prior art, not as data.

## Left to the builder

- Package name and file layout (`packages/battle` is a placeholder).
- Format of the overrides and mechanics files (YAML or JSON), as long as Travis can edit them by
  hand and the build validates them with clear errors.
- How the datamine is fetched and locked, mirroring `fetch-pvpoke.ts` and `lock.ts`.
- How species and form ids are named. A mapping to PvPoke's ids is needed for the exams; whether
  our own ids follow PvPoke's convention is the builder's call.
- The exact script set for the rules exam, as long as it covers the list above.
- Whether the engine also implements the engine's `BattleSimulator` interface now. Cheap and useful
  later; not required.

## The program (sketch only, each gets its own brainstorm)

2. **3v3 and players by rating.** Full 3v3 with switching, the switch timer, shields as a team
   resource, and banked energy. A player model is a set of habits at each decision point (when to
   shield, when to swap, how to bait, whether to count fast moves) plus what that player believes
   the opponent is carrying. Travis's own play is the reference: shield Mimikyu's first hit to keep
   the Disguise, swap after the opponent's first charged move, expect the counter-swap, shield on
   Melmetal only when the opponent has a super-effective charged move, bring Mimikyu back last with
   its Disguise and banked energy. A lower-rated player model gets these wrong in measurable ways.
3. **Your three vs the field.** The opponent pool comes from pick3's own measured data (the
   community team board and tournament rosters), weighted by how often each team shows up, with
   standard movesets (almost everyone runs them; off-meta sets are ignored at first). Output: your
   team's win rate against the field at your rating, and the matchups that sink it. This is the
   question Travis actually asks; single Pokemon ranked on their own are what everyone already has.
   Also surface how forgiving a team is: play the same team with a strong player model and with
   a mistake-prone one. A team whose win rate barely drops is easy to pilot; one that collapses
   needs perfect play. Players at every rating want to know which they are picking.
4. **Cup readiness.** Cup rules from the datamine (or hand-entered from the announcement when the
   client has not shipped them), a re-run on any change to moves, bans or releases, and the original
   backtest as the final exam: our ranking per cup against PvPoke's published one.
5. **Into the blended meta.** Our ranking becomes a second prior beside PvPoke's:
   `prior = w * PvPoke + (1 - w) * ours`, `w` starting high because PvPoke is where most players go
   and so predicts what you will face, shown on screen like the other blend weights. When PvPoke has
   no ranking for a cup, the prior is ours alone. Tournament and ladder terms blend on top,
   unchanged. If pick3 gains traction, `w` can be lowered or PvPoke removed.
