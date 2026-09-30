pick3.gg - Social cup boards

OPEN AND SCREENSHOT
pick3-cup-boards.html is one fixed 1080 x 1350 HTML/CSS document.
No JavaScript, canvas, build step, or local asset folder is required.
Open the file with one of these fragments:
  pick3-cup-boards.html#top      Top 5 Teams (also the default)
  pick3-cup-boards.html#budget   Budget Builds - No Elite TM
  pick3-cup-boards.html#mega     Best Team for Each Mega

Use a 1080 x 1350 browser viewport at device scale factor 1. Wait for
fonts and images to load before capturing the viewport. Google Fonts
(Barlow Condensed and Barlow Semi Condensed) and mascot JPEGs are embedded.
Sprites use https://pick3.gg/data/sprites/<speciesId>.webp and require
network access. The supplied PNG previews are ready to inspect offline.

EDITING
Each section.board holds a header, five article.team rows, and footer.
Change the h1, subtitle, members, score, caution, and source in plain markup.
Each member has a role, portrait img, name, zero to two tags, and three
separate move lines (fast first, then charged). Change both the visible
strength number and --strength:87.9% on its article for the mini bar.
Keep .winner on rank 1. Keep .shadow-member for Shadow members, using the
base sprite. Keep .mega-hero on the Mega member, in any battle slot.
Regional tags use .region, Elite TM tags use .elite, Mega tags use .mega.
The .long-title class uses a compact title style with room for two lines.
Keep all copy 7-bit ASCII. Cautions, sources, and strength are never hidden.
Rank badges match numbered analysis links in the post body.

MASCOT
The supplied JPEG art is embedded and clipped by SVG paths in the header.
These are temporary silhouette masks, not final transparent exports.
To use your transparent exports, replace the inner SVG in div.mascot with:
  <img src="data:image/png;base64,..." alt="pick3 trainer"
       style="width:100%;height:100%;object-fit:contain">
Use a torso crop for the same footprint. No mascot overlaps a team panel.

DATA PROVENANCE
Top and Mega data were transcribed from IMG_3326.png and IMG_3327.png.
These remain sample data, including the original moves, tags and scores.
No Budget mockup or competitor reference was supplied in the attachments.
The Budget variant demonstrates the same layout with clearly labeled
illustrative content. Its scores and cautions, apart from the copied
Mandibuzz/Mimikyu/Shadow Dragonair example, are placeholders. Replace all
Budget rows and footer with computed results before posting. No validation
of move legality or battle performance is implied by this design.

FILES
pick3-cup-boards.html   Shared template and all three sample variants
pick3-top.png          Top Teams, 1080 x 1350
pick3-budget.png       Illustrative Budget Builds, 1080 x 1350
pick3-mega.png         Best Team for Each Mega, 1080 x 1350
pick3-variants.png     All three at 400 px wide for feed comparison
