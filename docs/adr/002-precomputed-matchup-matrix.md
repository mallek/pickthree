# ADR 002: Precompute a candidates-vs-meta matchup matrix at data build time

Status: accepted, 2026-09-11

## Context
PvPoke ships only each species' five best and five worst matchups. Team search needs every candidate's
result against the whole meta, and a phone cannot simulate 1146 x 48 x 3 battles on import.

## Decision
The data build runs the vendored simulator in Node once per refresh and stores integer ratings for
every ranked Great League species versus PvPoke's meta group in three shield scenarios, at PvPoke's
default IVs and effective movesets. The app uses the matrix to prune candidates and rank trios; only
finalists are simulated on device with the player's actual IVs.

## Consequences
Matrix is opinionated by PvPoke's meta group and default IVs; results carry those assumptions.
Size at the pinned commit: 735 KB raw, 274 KB gzipped, built in about a minute on a laptop. Follow-up if it grows past 1 MB gzipped: Int16 typed array encoding.
