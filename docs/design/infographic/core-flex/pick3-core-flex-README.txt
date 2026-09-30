pick3.gg - Core + flex design exploration

One 1080 x 1350 HTML/CSS board. No JavaScript or canvas.
Fonts and the supplied pointing mascot are embedded. Pokemon sprites use
https://pick3.gg/data/sprites/<speciesId>.webp and require network access.
The supplied PNG is a rendered offline preview.

CONTENT MODEL
Five unique two-Pokemon cores. Four flex options per core.
Keep both core members and choose exactly one flex to make a team of three.
The highlighted BEST FLEX completes the original ranked team. Its strength
and Watch for line are copied from the previous Top Teams sample data.
Do not apply those results to the other flex choices.

The other three flex picks in each row are illustrative layout examples.
They have not been simulated or checked for competitive suitability.
Replace them with computed candidates before publishing.

POSITIONS
There are no lead, switch or closer labels on this board. Core/flex grouping
is a construction choice, not a battle-order recommendation. The flex can
occupy any battle position. Show optimized order in each linked analysis.

MOVES
Both core members retain their full move sets. Flex move sets are deferred
to the linked analysis to keep six Pokemon readable in each panel.
Elite TM and Shadow tags remain visible. Shadow choices use base sprites.

EDITING
Each article.team contains a core-block, flex-block, score, and caution.
core-members holds two member elements. flex-grid holds four flex-choice
items; best-flex marks the one whose complete-team score is shown.
Keep ranks, cores, highlighted choice, score and caution synchronized.
Keep .winner on row 1 and --strength on each article synchronized with its
visible strength number. Text is entirely 7-bit ASCII.

DIVERSITY
For the production board, group candidates by unordered two-member pair,
rank each pair by its strongest completed trio, and show each pair once.
Deduplicate completed teams across chosen pairs as well. If overlapping
cores still look repetitive, reserve later rows for pairs that introduce
more species, with the ranking rule explained in the source copy.

Mascot art uses the earlier temporary SVG silhouette mask. Replace its SVG
with your transparent crop when supplied.
