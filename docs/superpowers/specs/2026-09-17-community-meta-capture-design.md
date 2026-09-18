# Community meta: capturing battles

Date: 2026-09-17. Status: approved in chat (Travis), built the same day.

## Problem

PvPoke's meta group is a hand-kept list. pick3 already has the only measured signal, the
battle log on each phone, and it stays there. To build a real meta we need those records in
one place. This spec covers capture only: the meta site (meta.pick3.gg) and the API for other
apps come after there is data to show.

## Decisions

- **Opt-out, on by default.** Sharing is the cost of the free app. A switch in Settings turns
  it off; turning it off also deletes what this device sent.
- **Nothing identifiable.** Per battle: league, season, time, your three species, the
  opponents you saw, win or loss or tanked, your rank band, and a random device id made on the
  phone. Never the collection, IVs, moves, specimen ids or names. No accounts yet; the device id
  is the only handle, and it is only for deleting or de-duplicating.
- **Everything already on the phone goes too.** The first sync sends the whole log, later syncs
  send what is new. A battle remembers when it was sent (`sharedAt`) so nothing is sent twice;
  the server ignores a repeat by id anyway.
- **Rank band is self-reported**, changeable in Settings: below Ace, Ace, Veteran, Expert,
  Legend, or not set. It stamps records sent from then on.
- **Storage is a Durable Object with SQLite** in the existing counter worker, not D1, so no
  dashboard step is needed and the deploy stays a push to main. At this volume a single object
  holds years of records; D1 is the move if that changes.
- **Only the live site contributes.** Local dev and automation never send, so the dataset is not
  polluted by screenshots and test runs.
- **A first read endpoint** returns a per-league summary (species sightings with the reporter's
  record against each, team usage, battle and device counts) so the data is inspectable before
  the site exists.

## Endpoints (counter worker)

- `POST /battles` `{ device, client, battles: [...] }`, at most 200 per call, origin-checked.
  Repeats by (device, id) are ignored. Returns `{ stored, skipped }`.
- `DELETE /battles` `{ device }` removes everything that device sent. Returns `{ deleted }`.
- `GET /meta?league=great&days=90` returns the summary.

## Privacy copy

The collection line is unchanged. The battle-log line becomes: battles are shared as anonymous
records for the community meta unless you switch it off in Settings, and the switch lists the
exact fields. CLAUDE.md's rule changes to match.

## Out of scope

- Accounts and passkeys (planned for when the site goes public).
- The meta site and its rankings, and API keys for other apps.
- Feeding the shared meta back into pick3's data build.
