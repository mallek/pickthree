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
