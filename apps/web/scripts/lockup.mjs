/**
 * Generates the pick3 lockups as font-independent SVG: "pick" is outlined from Inter, and the
 * mark (the 3) is placed against the real right edge of the k, so every renderer agrees.
 *
 *   node apps/web/scripts/lockup.mjs
 *
 * Writes apps/web/public/lockup.svg (dark), lockup-light.svg, and banner-dark.svg / banner-light.svg
 * (1200 x 360, for social and README headers).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const brand = path.resolve(here, '..', 'brand');
const out = path.resolve(here, '..', 'public');

const WEIGHT = process.env.PICK3_WEIGHT ?? '700';
const fontBytes = fs.readFileSync(path.join(brand, `Inter-${WEIGHT}.ttf`));
const font = opentype.parse(
  fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength),
);

// The mark in its own 256-space (same geometry as favicon.svg): x 77..188, y 63..221.
const MARK = {
  paths: [
    { d: 'M92 78 H156 a32 32 0 0 1 0 64 H136', stroke: '#D685AD' },
    { d: 'M136 142 H156 a32 32 0 0 1 0 64 H92', stroke: '#6F35FC' },
  ],
  dots: [
    { cx: 92, cy: 78 },
    { cx: 92, cy: 206 },
  ],
  box: { x: 77, y: 63, w: 111, h: 158 },
};

function markSvg(scale, tx, ty) {
  const p = MARK.paths
    .map(
      (m) =>
        `<path d="${m.d}" fill="none" stroke="${m.stroke}" stroke-width="30" stroke-linecap="round"/>`,
    )
    .join('');
  const c = MARK.dots
    .map((d) => `<circle cx="${d.cx}" cy="${d.cy}" r="15" fill="#C22E28"/>`)
    .join('');
  return `<g transform="translate(${r(tx)} ${r(ty)}) scale(${r(scale)})">${p}${c}</g>`;
}

const r = (n) => Math.round(n * 100) / 100;

/**
 * Lay out "pick" + mark at a given font size. Returns path data, mark placement and total bounds.
 * Letter spacing is a fraction of em (negative tightens). The mark's height equals the cap height
 * and its left edge sits one k-sidebearing plus `gapEm` after the k.
 */
function layout(fontSize, { trackingEm = -0.035, gapEm = 0.06 } = {}) {
  const scale = fontSize / font.unitsPerEm;
  // charToGlyph avoids opentype's GSUB shaping, which does not support one of Inter's lookups.
  const glyphs = [...'pick'].map((ch) => font.charToGlyph(ch));
  let x = 0;
  const pieces = [];
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const p = g.getPath(x, 0, fontSize);
    pieces.push(p.toPathData(2));
    let adv = g.advanceWidth * scale;
    if (i < glyphs.length - 1) {
      adv += font.getKerningValue(g, glyphs[i + 1]) * scale + trackingEm * fontSize;
    }
    x += adv;
  }
  const k = glyphs[glyphs.length - 1];
  const kBox = k.getBoundingBox();
  const kRight = x - k.advanceWidth * scale + kBox.x2 * scale; // real ink edge of the k
  const capHeight = (font.tables.os2?.sCapHeight ?? 0.727 * font.unitsPerEm) * scale;
  const markScale = capHeight / MARK.box.h;
  const markLeft = kRight + gapEm * fontSize;
  const tx = markLeft - MARK.box.x * markScale;
  const ty = -capHeight - MARK.box.y * markScale; // baseline at y=0, so cap top is at -capHeight
  const width = markLeft + MARK.box.w * markScale;
  return {
    text: pieces.join(' '),
    mark: markSvg(markScale, tx, ty),
    width,
    capHeight,
    descent: font.descender * scale * -1,
  };
}

function lockup({ fontSize, textColor, bg, pad, rx }) {
  const l = layout(fontSize);
  const w = l.width + pad * 2;
  const h = l.capHeight + l.descent + pad * 2;
  const baseline = pad + l.capHeight;
  const bgRect = bg ? `<rect width="${r(w)}" height="${r(h)}" rx="${rx}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" role="img" aria-label="pick3">${bgRect}<g transform="translate(${pad} ${r(baseline)})"><path d="${l.text}" fill="${textColor}"/>${l.mark}</g></svg>\n`;
}

function banner({ textColor, bg }) {
  const W = 1200;
  const H = 360;
  const l = layout(132);
  const x = (W - l.width) / 2;
  const baseline = H / 2 + l.capHeight / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="pick3"><rect width="${W}" height="${H}" fill="${bg}"/><g transform="translate(${r(x)} ${r(baseline)})"><path d="${l.text}" fill="${textColor}"/>${l.mark}</g></svg>\n`;
}

fs.writeFileSync(
  path.join(out, 'lockup.svg'),
  lockup({ fontSize: 72, textColor: '#E9E9ED', bg: null, pad: 6, rx: 0 }),
);
fs.writeFileSync(
  path.join(out, 'lockup-light.svg'),
  lockup({ fontSize: 72, textColor: '#292B31', bg: null, pad: 6, rx: 0 }),
);
fs.writeFileSync(
  path.join(out, 'banner-dark.svg'),
  banner({ textColor: '#E9E9ED', bg: '#161826' }),
);
fs.writeFileSync(
  path.join(out, 'banner-light.svg'),
  banner({ textColor: '#292B31', bg: '#F3F5FE' }),
);
console.log(
  `wrote lockup.svg, lockup-light.svg, banner-dark.svg, banner-light.svg (Inter ${WEIGHT})`,
);
