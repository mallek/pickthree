# Simulated matrix gaps: any Pokemon in Build, any opponent in Counters

Date: 2026-09-17. Status: approved in chat (Travis), built the same day.

## Problem

The matchup matrix (ADR 002) covers every species PvPoke ranks (1146 in Great League) against
PvPoke's meta group (48). Two things fall outside it:

1. **Opponents outside the meta group.** Your meta counts them, and once the log is engaged the
   Teams search simulates them, but "Who beats X" from a most-faced row had nothing to show.
2. **Species PvPoke does not rank.** About 600 released species have no matrix row, so Build
   stopped at "Magikarp is not in the matchup matrix."

The simulator that built the matrix is already loaded in the worker, so both gaps can be filled
on the device at the moment they are needed.

## Decisions

- **In-meta and ranked stay on the matrix.** Simulation only fills what the matrix lacks.
- **Who beats an outsider:** simulate the top 300 ranked species against it (its PvPoke ranking
  moveset, PvPoke default IVs) in the matrix's three shield scenarios. 300 because nobody builds
  the Magikarp that beats Snorlax. About 900 battles: under a second in a browser worker.
  A species with no ranking entry has no moveset to simulate with and says so.
- **Build with an unranked species:** simulate that pick against every meta opponent in the
  three scenarios (about 150 battles) and append the result to the matrix as a row, so the trio
  scoring, safety and coverage run unchanged. The finalist sims already use the real simulator.
- **Moveset for an unranked species:** the moves the trainer chose in the moves sheet win. With
  none chosen, a scanned specimen runs its current moves; a species pick runs the strongest legal
  pair by move stats (fast: damage plus energy per turn; charged: damage per energy; same-type
  bonus applied). This replaces the old "first move in the pool" fallback.
- **Role scores** (lead, safe switch, closer) come from PvPoke's rankings and are zero for an
  unranked species. The screen shows no rank badges for it rather than pretending.
- **Every result says what was simulated.** Counters' assumptions line names the count; Build's
  breakdown note lists the species that were simulated on the device.
- **Progress:** both paths stream a progress stage so the screen shows a bar, not a spinner.

## Out of scope

- Simulating IV-specific opponents (the matrix keeps PvPoke default IVs on the opponent side).
- Ranking outsiders in the whole-meta Counters list (they are counted, not simulated, in v1 of
  Your meta; unchanged).
