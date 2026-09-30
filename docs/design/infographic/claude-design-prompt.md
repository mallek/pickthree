# Claude Design prompt: pick3 team infographic

Attach with the prompt: mock-1-top.png, mock-2-budget.png, mock-3-mega.png (layout and content
reference, not the look), mascot-pointing.png, mascot-thinking.png, mascot-fingerguns.png, and
ref-oak-coliseum-closers.jpg (the format we are answering).

--- copy from here ---

Design a set of three social infographics for pick3.gg, a free Pokemon GO PvP team builder. They get
posted to Reddit (r/TheSilphArena, r/PokemonGOBattleLeague) and Discord when a new Go Battle League
cup goes live, answering the question every thread asks: "what team should I run?"

The attached ref-oak-coliseum-closers.jpg is what other sites post today: top-10 lists of single
Pokemon by role. Our answer is complete teams of three, ranked by how well they do against the cup's
meta, each one linked in the post body to a full analysis on pick3.gg. The images must make "these
are whole teams, not a list of Pokemon" obvious at a glance.

## The three images (one template, three variants)

1. TOP TEAMS - the 5 strongest teams for the cup.
2. BUDGET BUILDS - the 5 strongest teams that need no Elite TM.
3. BEST TEAM FOR EACH MEGA - only for Mega cups: one row per Mega, the best team built around it,
   ranked by that team's strength. The Mega in each row is the hero of that row and should be
   visually called out.

The attached mock-*.png files show the content and structure. They are a developer's placeholder:
keep the information, redesign everything about how it looks.

## Canvas

- 1080 x 1350 px (4:5 portrait). Must read on a phone at full width and stay legible as a Reddit
  feed thumbnail (about 400 px wide): cup name, the three sprites of each team, and the rank-1 row
  must survive that shrink.
- Dark theme first. It posts into dark-mode feeds.

## Header

- Cup name as the title (e.g. "Great League", "Mega Color Cup", "Great League Mega Edition").
  Plan for long names up to about 28 characters.
- Subtitle naming the board: "Top 5 Teams" / "Budget Builds - No Elite TM" / "Best Team for Each Mega".
- pick3.gg wordmark. The logo mark is three overlapping circles (red, violet, blue) with a "3",
  as on the mascot's cap and jacket.
- The mascot (see below).

## One team row (x5)

- Rank number. Rank 1 gets emphasis.
- Three members in battle order, each labeled with its role: LEAD, SWITCH, CLOSER.
- Per member:
  - Sprite: PokeAPI HOME renders, transparent PNG/WebP, roughly square, varied silhouettes.
    Give them a container (disc, card, plinth) that keeps a tall Pokemon and a wide one looking even.
  - Name: plain names, up to about 12 characters ("Corviknight", "Annihilape").
  - Tags, zero to two per member: "Shadow", "Mega", "Galarian" / "Alolan" / "Hisuian" / "Paldean",
    "Elite TM". A Shadow member shows the base sprite plus a shadow treatment (the game uses a purple
    flame aura), since there is no separate shadow sprite.
  - Moveset: one fast move and two charged moves. Move names can run to 18 characters
    ("Weather Ball (Ice)", "Double Iron Bash"). This is the densest text; it may be small but must
    stay readable on a phone.
- Strength: a number from 0 to 100 with one decimal ("87.9"), labeled "strength". It is the
  team's projected performance against the cup's meta. The biggest number in the row.
- "Watch for" line: up to three meta Pokemon that no member of the team beats
  ("Watch for: Corviknight, Melmetal"). When there are none it reads
  "Nothing in the meta beats all three".
- A small "#1".."#5" or similar cue is welcome so a reader can match the row to the numbered link
  in the post.

## Footer

- Source line, always present, stating what the number is made of. Exact wording changes per post;
  design for two or three short lines like:
  "Strength: pick3 sims vs the Great League meta"
  "PvPoke meta + 1,240 shared battles - Sept 29, 2026"
  "Full analysis of every team: links in the post"
- pick3.gg URL.

## Mascot

The attached mascot-*.png images are my trainer likeness, pick3's mascot: navy track jacket with
crimson and violet stripes, pick3 logo on cap, jacket and crossbody bag, three Poke Balls on the
belt, phone in hand. Use him to give the images character without competing with the data.

- One pose per image: pointing (Top Teams, "here's the one"), thinking with hand on chin
  (Budget Builds, "the smart pick"), finger guns (Mega, "got a Mega? this one's yours").
- He sits in the header zone or breaks out of a corner of the frame; he never covers a team row,
  a sprite, or a number. Cropping him at the waist or chest is fine.
- The art has a light background; treat it as a cutout (I will supply transparent versions).
- Pull the palette from him: navy, crimson, violet, blue. That palette already matches pick3's
  violet-first UI, so the images and the site feel like one brand.

## Color rules from the pick3 design system

- Violet is the interaction/brand color. Type colors can tint sprite containers.
- In the app, pink is reserved for measured data (real battle results). The strength number is a
  projection, not a measurement, so do not color it pink. Keep pink/crimson to brand accents
  and the mascot.
- Red only for danger. "Watch for" is a caution, not an error: use a warning tone, not red.

## Hard constraints

- All text is plain 7-bit ASCII: no em dashes, no smart quotes, no special symbols in copy.
  Use a plain hyphen.
- The strength number, source line and "Watch for" line are always shown; never hide them to make
  the layout cleaner.
- No Pokemon artwork except the sprites. No official Pokemon logos, Poke Ball as a brand mark,
  or Niantic/Pokemon Company branding.
- Fonts from Google Fonts only.

## Deliverable

A single self-contained HTML + CSS page at exactly 1080 x 1350 that renders one board, with the
content in plain markup (no canvas, no JS needed to lay out), so a script can fill in the cup name,
five rows and footer text and screenshot it with headless Chrome. Show all three variants.
Use sprite URLs of the form https://pick3.gg/data/sprites/<speciesId>.webp (for example
cradily, kingdra, charizard_mega_x) and the placeholder data from the attached mockups.

--- end ---
