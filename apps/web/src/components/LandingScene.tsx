/**
 * The landing page's backdrop: a night forest under a purple sky, with a pokeball the size of a
 * moon sitting off the top right corner.
 *
 * It is drawn rather than shipped as an image so it costs no request, scales to any phone, and
 * takes its colours from the theme: the same shapes render as a pale dawn in light mode. Purely
 * decorative, so it is hidden from screen readers and sits behind everything at `z-index: 0`.
 *
 * The trees are generated from a fixed table rather than hand-written path data, so the treeline
 * stays readable as code and a tree can be nudged by changing one number.
 */

/** One conifer as a single polygon: `tiers` stepped branch rows above a short trunk. */
function conifer(x: number, base: number, w: number, h: number, tiers = 4): string {
  const pts: string[] = [`${x},${base - h}`];
  for (let t = 1; t <= tiers; t++) {
    const y = base - h + (h * t) / tiers;
    const half = (w / 2) * (t / tiers);
    pts.push(`${x + half},${y}`, `${x + half * 0.58},${y}`);
  }
  pts.push(`${x + w * 0.05},${base}`, `${x - w * 0.05},${base}`);
  for (let t = tiers; t >= 1; t--) {
    const y = base - h + (h * t) / tiers;
    const half = (w / 2) * (t / tiers);
    pts.push(`${x - half * 0.58},${y}`, `${x - half},${y}`);
  }
  return pts.join(' ');
}

/** x, width and height of every tree, in the treeline's 400 x 300 viewBox. Baseline is 300. */
const FAR: readonly (readonly [number, number, number])[] = [
  [18, 54, 128],
  [62, 44, 96],
  [104, 62, 150],
  [152, 40, 88],
  [196, 56, 118],
  [246, 46, 104],
  [292, 66, 158],
  [344, 48, 110],
  [386, 58, 132],
];
const NEAR: readonly (readonly [number, number, number])[] = [
  [-6, 76, 196],
  [44, 58, 150],
  [126, 70, 176],
  [178, 52, 124],
  [232, 80, 206],
  [300, 56, 140],
  [364, 74, 188],
];

export function LandingScene() {
  return (
    <div className="landing-scene" aria-hidden="true">
      <svg
        className="ls-trees"
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <g className="ls-far">
          {FAR.map(([x, w, h]) => (
            <polygon key={`f${x}`} points={conifer(x, 300, w, h)} />
          ))}
        </g>
        <g className="ls-near">
          {NEAR.map(([x, w, h]) => (
            <polygon key={`n${x}`} points={conifer(x, 302, w, h, 5)} />
          ))}
        </g>
      </svg>
      <svg className="ls-ball" viewBox="0 0 100 100" focusable="false">
        <defs>
          <clipPath id="ls-ball-clip">
            <circle cx="50" cy="50" r="48" />
          </clipPath>
        </defs>
        <g clipPath="url(#ls-ball-clip)">
          <rect className="ls-ball-top" x="0" y="0" width="100" height="50" />
          <rect className="ls-ball-bottom" x="0" y="50" width="100" height="50" />
          <rect className="ls-ball-band" x="0" y="45.5" width="100" height="9" />
        </g>
        <circle className="ls-ball-ring" cx="50" cy="50" r="48" />
        <circle className="ls-ball-ring" cx="50" cy="50" r="17" />
        <circle className="ls-ball-ring" cx="50" cy="50" r="8" />
      </svg>
    </div>
  );
}

/**
 * The Your Pokémon card's illustration: a phone holding a collection, a ball arriving into it,
 * and a ball in front at the size the page's other discs are. Flat geometry in theme colours, not
 * a picture, and it carries no Pokémon: the four slots are empty rounded squares, because the
 * sprites are the only Pokémon artwork this app draws.
 *
 * It sits behind the card's text and buttons and is hidden from screen readers.
 */
export function CollectionArt() {
  return (
    <svg className="you-art" viewBox="0 0 120 160" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="ya-ball-clip" clipPathUnits="userSpaceOnUse">
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>
      <g className="ya-phone">
        <rect x="36" y="10" width="74" height="136" rx="13" />
        <rect className="ya-notch" x="60" y="17" width="26" height="4" rx="2" />
        {[0, 1].map((col) =>
          [0, 1].map((row) => (
            <rect
              className="ya-slot"
              key={`${col}${row}`}
              x={46 + col * 31}
              y={52 + row * 33}
              width="25"
              height="26"
              rx="7"
            />
          )),
        )}
      </g>
      {/* The ball on its way in, arriving from off the card. */}
      <path
        className="ya-arrow"
        d="M16 78c8-12 20-16 30-12"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path className="ya-arrow-head" d="M51 62l-9-2 4 9z" />
      <g className="ya-ball ya-ball-small" transform="translate(84 28) scale(0.2)">
        <Pokeball />
      </g>
      <g className="ya-ball" transform="translate(40 106) scale(0.4)">
        <Pokeball />
      </g>
    </svg>
  );
}

/** A pokeball on a 100 x 100 box, centred on its own origin. */
function Pokeball() {
  return (
    <g transform="translate(-50 -50)">
      <g clipPath="url(#ya-ball-clip)">
        <rect className="ya-ball-top" x="0" y="0" width="100" height="50" />
        <rect className="ya-ball-bottom" x="0" y="50" width="100" height="50" />
        <rect className="ya-ball-band" x="0" y="44" width="100" height="12" />
      </g>
      <circle className="ya-ball-ring" cx="50" cy="50" r="48" />
      <circle className="ya-ball-btn" cx="50" cy="50" r="15" />
      <circle className="ya-ball-ring" cx="50" cy="50" r="15" />
    </g>
  );
}
