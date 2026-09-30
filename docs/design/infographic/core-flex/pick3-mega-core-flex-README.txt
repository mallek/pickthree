pick3.gg - Mega core + flex board

One 1080 x 1350 HTML/CSS page, with embedded Google Fonts and mascot art.
No JavaScript or canvas. Sprites use pick3.gg/data/sprites/<speciesId>.webp.
Screenshot a 1080 x 1350 viewport at device scale factor 1 after image/font
loads. The PNG shows the supplied sample order and strengths.

CLASSES AND ROW TYPES
.core-board.mega-core-board: shared core + flex layout.
.long-title: compact two-line cup title style.
.team.mega-in-core: one of the two core members is a Mega; all flex picks
are regular Pokemon. Label CHOOSE 1 OF N, where N is the option count.
.team.mega-in-flex: both core members are regular; every flex pick is a
Mega. Label PICK A MEGA. Choosing any tile produces exactly one Mega.
.mega-core: highlights a core member's portrait with a violet ring/glow.
.mega-marker: original inline SVG spark + Mega below the core portrait.
.mega-choice: highlights a Mega flex tile's portrait.
.mega-tag-marker: Mega tag with the same original spark; supports Mega X/Y.
.best-flex: highlighted choice whose strength/caution the row displays.
.winner: emphasized first row. Rank chips identify the numbered core.
.shadow-member / .shadow-choice: base sprite with purple shadow treatment.
.tag.shadow / .tag.region / .tag.elite / .tag.mega: 11 px minimum tags.

The SVG spark is a simple original four-point shape, color #a282ff.
It is not game artwork. Labels are in separate flow boxes, never over a
sprite. Three-tag variants wrap and reduce miniature portrait size when
needed. Core sprites, names and full moves remain visible.

FLEX COUNTS
.flex-grid always has four equal tracks. Render only qualifying options,
from one to four. Tiles keep their width and align left; no empty tile or
stretching. Row 5 demonstrates three options. No positions or badges
suggesting battle order are displayed.

ENGINE-SUPPLIED VALUES
- Cup title, subtitle, reading line, final source lines and sample label.
- Five cores and final order. Sample ordering follows the brief, not a
  descending score sort. Engine selects the production order/rank.
- Both core Pokemon: name, sprite speciesId, exact tags, fast move and two
  charged moves. Regional forms keep their own sprite IDs.
- Qualifying flex options: name, sprite speciesId, tags, completed-team
  strength with one decimal, and selected best-flex index (resolve ties).
- Row strength from that best completed trio. Synchronize the big number,
  --strength percentage, candidate number and article aria-label.
- Caution for the same trio: zero to three species names. Clear sentence
  when empty; otherwise Watch for: followed by the names.
- Validate exactly one Mega for every possible trio, not just best flex.

Sample strengths and forms come from the brief. Core moves and caution
lines are layout placeholders; replace them with engine output. Flex
moves and optimized battle order belong in the linked analysis. Tags in
the sample reflect only the supplied Mega, Shadow and Alolan forms.
Checked at full size and 400 px wide, with three tags, two-line title,
both row types, and equal tile widths in the three-option row.
