# Team deep links

Date: 2026-09-17. Status: approved in chat (Travis), built the same day.

## Problem

A team built or recommended in pick3 could not be shown to anyone. Players trade teams on
Reddit and in chats as three names and a moveset; a link should open the same breakdown.

## Decisions

- **The link carries the league, the three species in lineup order, and each one's moves.**
  Nothing about IVs or the sender's collection. A member with no moves runs the recommended
  set. Shadows are their own species ids already.

  ```
  https://pick3.gg/#/t/great/azumarill.BUBBLE.ICE_BEAM.PLAY_ROUGH+tinkaton.FAIRY_WIND.GIGATON_HAMMER.BULLDOZE+clodsire
  ```

- **Opening the link** switches to that league if needed, fills Build's three slots as species
  picks in the given order, runs the analysis, and lands on the team overview, the same
  breakdown as a hand-built team, with Take to battle. It replaces whatever was in Build
  without asking: opening a link is a clear intent and the old picks are one search away.
- **The breakdown says it was shared**: IVs are assumed at a top-10 percent spread since the
  sender's are not in the link, and Build is where to swap in your own.
- **Share lives on Team detail** (recommended and hand-built) and on Your meta's current team
  card. It uses the phone's share sheet when there is one and copies the link otherwise, with
  a short notice.
- **A bad link** (unknown league, unknown species, a move the species cannot learn) shows the
  reason and a way into Build; it never crashes the app.

## Out of scope

- Rich link previews. The site is static, so chats show the generic pick3 card. Per-team
  previews need a server and can ride along with the community meta work.
- Sender IVs in the link. Cheap, but it turns a team link into a partial collection export.
