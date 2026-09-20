# apps/web/src/assets

`collection.webp` is the phone-and-ball illustration on the landing page's Your Pokémon card,
lifted from `docs/design/2026-09-19-landing-reference.png` at crop box `(516, 1172, 806, 1656)`.

A colour key cannot cut it out: the render carries texture at the same scale everywhere, so the
card it was drawn on is not separable from the art's own soft halo. Instead the card surface under
it was fitted as a bilinear plane per channel and subtracted, and pick3's card colour (`--surface`
graded 82% toward `--bg`, where the art sits) added back, so the image's own backdrop is already
the colour it gets pasted onto and it needs no blend mode. Its left and top edges fade out over
30px; the right and bottom bleed off the card, which clips them.

It is a night render and there is no daylight cut, so `app.css` hides it in light mode and gives
the buttons the width back.
