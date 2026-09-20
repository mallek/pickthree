# apps/web/src/assets

`collection.webp` and `collection-light.webp` are the phone-and-ball illustration on the landing
page's Your Pokémon card, the night cut and the daylight cut, lifted from the reference renders:

| asset                   | source                                            | crop box                   |
| ----------------------- | ------------------------------------------------- | -------------------------- |
| `collection.webp`       | `docs/design/2026-09-19-landing-reference.png`       | `(516, 1172, 806, 1656)` |
| `collection-light.webp` | `docs/design/2026-09-19-landing-reference-light.png` | `(516, 1240, 806, 1674)` |

A colour key cannot cut either of them out: the renders carry texture at the same scale
everywhere, so the card they were drawn on is not separable from the art's own soft halo, and every
threshold either keeps the whole rectangle or eats the glow. Instead the card surface under the art
is fitted as a bilinear plane per channel from strips the art never reaches, subtracted, and
pick3's own card colour added back, so each image's backdrop is already the colour it gets pasted
onto and neither needs a blend mode. Left and top edges fade out over 30px; right and bottom bleed
off the card, which clips them.

The card colour is `--surface` graded 82% toward `--bg`, which is what the card's gradient is worth
where the art sits: `rgb(33, 35, 48)` dark, `rgb(250, 250, 254)` light.

The two cuts are not the same height, because the art sits differently in its card in each render.
`app.css` gives `.you-art` a width and leaves the height to the image.
