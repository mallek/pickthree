# In-battle card on Log a battle

Date: 2026-09-17. Status: approved in chat (Travis), built the same day.

## Problem

Log a battle already lists the opponents you meet most, one tap each. During a battle, with
pick3 open on a desktop or a second screen, the same tap could answer the questions a trainer
has in the first seconds: what does this thing throw, does any of it hurt my active Pokemon,
should I shield, and which of my three should be in front.

## Decisions

- **One card under the three opponent slots**, for the selected opponent. Adding an opponent
  selects it, tapping a filled slot selects it, and an x badge on the slot removes it (same as
  Build). Not three stacked cards: Win and Loss must stay reachable on a phone.
- **No rank pills, no meta tags, no prose.** This is a glance during a battle.
- **Content, top to bottom:**
  1. Opponent name and types.
  2. A table. Columns: their likely moves (PvPoke's fast move and up to three charged moves,
     the recommended two first, then the next most used), each with its move count (fast moves
     to reach it). Rows: the three members of the set's team. Each cell is a type-effectiveness
     badge for that move against that member: super effective, neutral, or resisted, double
     marked when both types stack. That is the "should I shield" cue.
  3. At the end of each row: a one-word verdict read from the equal-shield fights (0-0, 1-1,
     2-2, the head-to-head PvPoke rates): Wins when all three are won, Loses when none, Mixed
     otherwise. Under it a labelled 3 by 3 grid (your shields down, theirs across) with a W or
     L per cell, colour depth by margin, so "would one shield flip this" is readable. The best
     answer among your three is highlighted.
- **Simulated on the device** through the engine's BattleSimulator: three members times nine
  shield combinations, 27 battles, well under a tenth of a second. When the set's team came
  from the collection, your members run their real IVs and level; otherwise PvPoke defaults.
  The opponent runs PvPoke default IVs and its ranking moveset (stat fallback when unranked).
- **Results cache per opponent** for the life of the screen, so switching between the three
  slots is instant.

## Out of scope

- Energy or HP tracking through the battle.
- Opponent IV guesses.
