# Battle engine part 1: follow-ups

Known gaps and deferred minors from the part 1 build. None block ship.

## Known gaps (accepted rulings)

- The exam judge's `unexecuted` status means the two runners' executed sets differ. If both
  engines skip the same move, neither checks the other.
- Every exam script ends in a knockout, so the exam never tests a timeout clock.
- Round length: datamine 540 turns vs PvPoke 480. See `round-length` in
  `packages/data/battle/differences.yaml`. Settle by timing one GBL match to timeout.
- Form re-level on Aegislash and Minior: PvPoke re-levels atk/def on form change, ours keeps the
  level. Recorded as a divergence, evidence wanted: screenshot an Aegislash's stats before and after
  a shield-forced form change.
- A plain-Meteor Minior stays Meteor all battle (`notStartForm`). Accepted.
- The Minior timing and CMP-tie differences entries rest on design decisions, not recorded battles.
- An explained script is checked only up to its first difference (the `first` in its
  `differences.yaml` listing). Past that the traces differ everywhere, so a second bug after a known
  divergence is not caught by the judge; only the targeted tests in `rules-exam.test.ts` pin more.
- Every exam CMP tie goes to side 0 (`ScriptedPlayer.cmpTieWinner`). A tie won by side 1 is never
  graded against PvPoke. Add a per-script tie winner to `ScriptEntry` and a mirrored script.

## Deferred minors

- An in-flight fast move changes on `replaceMove`, because `QueuedAction` does not record the move.
- The `faint` event kind is never emitted.
- `resolveCharged` has an unguarded energy subtraction.
- `BattleView.data` exposes mutable data.
- The eslint boundary rule misses relative imports.
- `maxTurns` of NaN turns the timeout off.
- Mechanics/overrides loader hardening: unknown override keys, empty bodies, `__proto__`.
- blocksDamage ordering inconsistency, and the charged.ts / mechanics.ts circular import.
- Float32 noise in the data-exam settings lines is not separated from real diffs.
- The CLAUDE.md "Deploy and CI" paragraph does not mention the datamine fetch.

## Data questions

- 97 shadow-flag mismatches between datamine and PvPoke in the data exam (freshness or unreleased
  shadow data).
- Real data has `*_copy_2019` species (venusaur, charizard, blastoise, pikachu) not flagged
  `isCostume`. Kept per the brief.

## Flaky test (root-cause fix owed, not from this work)

- apps/web: "Clear Tinkaton" waitFor in a `#/meta/new?team=...` test timed out once under load and
  passed on rerun. Likely a real-timer wait or the default 5s timeout on a heavy render.

## Not in this work

- Prettier in CI is a separate roadmap item.
