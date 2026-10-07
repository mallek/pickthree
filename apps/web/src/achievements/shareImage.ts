import { KANTO, type AchievementsRecord } from '@pickthree/engine';

export interface DexLayout {
  width: number;
  height: number;
  cols: number;
  cell: number;
  gap: number;
  left: number;
  top: number;
  slot(i: number): { x: number; y: number };
}

export interface DexInput {
  record: AchievementsRecord;
  types: (id: string) => string[];
  spritesOn: boolean;
}

const WIDTH = 1080;
const COLS = 11;
const CELL = 88;
const GAP = 6;
const TOP = 250;
const FOOT = 150;
const FONT = 'Inter, system-ui, sans-serif';
const SPARKLE =
  'M10 1.5 C10.9 7 13 9.1 18.5 10 C13 10.9 10.9 13 10 18.5 C9.1 13 7 10.9 1.5 10 C7 9.1 9.1 7 10 1.5 Z';

/** Where everything sits on the 1080 wide image: 11 columns of 88 px discs, centered. */
export function dexLayout(): DexLayout {
  const left = (WIDTH - (COLS * CELL + (COLS - 1) * GAP)) / 2;
  const rows = Math.ceil(KANTO.length / COLS);
  return {
    width: WIDTH,
    height: TOP + rows * (CELL + GAP) + FOOT,
    cols: COLS,
    cell: CELL,
    gap: GAP,
    left,
    top: TOP,
    slot: (i) => ({
      x: left + (i % COLS) * (CELL + GAP),
      y: TOP + Math.floor(i / COLS) * (CELL + GAP),
    }),
  };
}

/** The Kanto Pokemon this record lights, one record per species, a shiny one preferred. */
function litSpecies(record: AchievementsRecord): Map<string, { shiny: boolean }> {
  const lit = new Map<string, { shiny: boolean }>();
  const kanto = new Set(KANTO.map((k) => k.id));
  for (const e of record.earned) {
    if (kanto.has(e.species) && !lit.get(e.species)?.shiny) {
      lit.set(e.species, { shiny: e.shiny });
    }
  }
  return lit;
}

/** "9 of 151 · 1 shiny · earned by playing GBL"; the shiny part only when there is one. */
export function shareHeadline(record: AchievementsRecord): string {
  const lit = litSpecies(record);
  const shiny = [...lit.values()].filter((e) => e.shiny).length;
  return [
    `${lit.size} of ${KANTO.length}`,
    shiny > 0 ? `${shiny} shiny` : null,
    'earned by playing GBL',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Resolves the image, or null when it cannot be loaded. Never rejects. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** A shiny's own sprite, falling back to the normal one when it is missing. */
async function loadSprite(id: string, shiny: boolean): Promise<HTMLImageElement | null> {
  if (shiny) {
    const s = await loadImage(`/data/sprites/shiny/${id}.webp`);
    if (s) {
      return s;
    }
  }
  return loadImage(`/data/sprites/${id}.webp`);
}

type Ctx = CanvasRenderingContext2D;

/** An earned disc, split between its types as the app's tokens are. */
function drawTypeDisc(
  g: Ctx,
  v: (n: string) => string,
  x: number,
  y: number,
  cell: number,
  types: string[],
): void {
  g.save();
  g.beginPath();
  g.arc(x + cell / 2, y + cell / 2, cell / 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = v(`--type-${types[0] ?? 'normal'}`);
  g.fillRect(x, y, cell, cell);
  if (types[1]) {
    g.beginPath();
    g.moveTo(x + cell, y);
    g.lineTo(x + cell, y + cell);
    g.lineTo(x, y + cell);
    g.closePath();
    g.fillStyle = v(`--type-${types[1]}`);
    g.fill();
  }
  g.restore();
}

function drawSparkle(g: Ctx, v: (n: string) => string, x: number, y: number, cell: number): void {
  const s = 34;
  const p = new Path2D(SPARKLE);
  g.save();
  g.translate(x + cell - s + 2, y - 2);
  g.scale(s / 20, s / 20);
  g.fillStyle = v('--type-electric');
  g.strokeStyle = v('--bg');
  g.lineWidth = 1.4;
  g.fill(p);
  g.stroke(p);
  g.restore();
}

function drawLabel(g: Ctx, color: string, text: string, x: number, y: number, cell: number): void {
  g.save();
  g.fillStyle = color;
  g.font = `700 ${Math.round(cell * 0.4)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x + cell / 2, y + cell / 2);
  g.restore();
}

/** Draws the Kanto dex onto `canvas`, in the page's own token colors read at draw time. */
export async function drawDex(canvas: HTMLCanvasElement, input: DexInput): Promise<void> {
  const L = dexLayout();
  const css = getComputedStyle(document.documentElement);
  const v = (n: string): string => css.getPropertyValue(n).trim();
  canvas.width = L.width;
  canvas.height = L.height;
  const g = canvas.getContext('2d');
  if (!g) {
    throw new Error('No 2d canvas');
  }
  g.fillStyle = v('--bg');
  g.fillRect(0, 0, L.width, L.height);
  g.fillStyle = v('--text');
  g.font = `700 64px ${FONT}`;
  g.fillText('My Kanto dex', L.left, 120);
  g.fillStyle = v('--muted');
  g.font = `500 36px ${FONT}`;
  g.fillText(shareHeadline(input.record), L.left, 182);

  const lit = litSpecies(input.record);
  const silOpacity = Number(v('--silhouette-opacity')) || 0.3;
  await Promise.all(
    KANTO.map(async (k, i) => {
      const { x, y } = L.slot(i);
      const e = lit.get(k.id);
      const sprite = input.spritesOn ? await loadSprite(k.id, e?.shiny === true) : null;
      if (e) {
        drawTypeDisc(g, v, x, y, L.cell, input.types(k.id));
        if (sprite) {
          g.drawImage(sprite, x + 4, y + 4, L.cell - 8, L.cell - 8);
          if (e.shiny) {
            drawSparkle(g, v, x, y, L.cell);
          }
        } else {
          drawLabel(g, v('--text'), k.id.charAt(0).toUpperCase(), x, y, L.cell);
        }
        return;
      }
      if (sprite) {
        // The sprite's shape only: source-in keeps the sprite's alpha and takes the fill.
        const off = document.createElement('canvas');
        off.width = L.cell;
        off.height = L.cell;
        const o = off.getContext('2d');
        if (o) {
          o.drawImage(sprite, 4, 4, L.cell - 8, L.cell - 8);
          o.globalCompositeOperation = 'source-in';
          o.fillStyle = v('--silhouette');
          o.fillRect(0, 0, L.cell, L.cell);
          g.save();
          g.globalAlpha = silOpacity;
          g.drawImage(off, x, y);
          g.restore();
          return;
        }
      }
      g.fillStyle = v('--bar');
      g.beginPath();
      g.arc(x + L.cell / 2, y + L.cell / 2, L.cell / 2, 0, Math.PI * 2);
      g.fill();
      drawLabel(g, v('--faint'), String(k.dex), x, y, L.cell);
    }),
  );

  g.fillStyle = v('--accent-text');
  g.font = `700 40px ${FONT}`;
  g.fillText('pick3.gg', L.left, L.height - 60);
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/** Draws the dex off screen and hands it to the share sheet, or saves it as a download. */
export async function shareDex(input: DexInput): Promise<ShareOutcome> {
  try {
    const canvas = document.createElement('canvas');
    await drawDex(canvas, input);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      return 'failed';
    }
    const name = 'pick3-kanto-dex.png';
    const file = new File([blob], name, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'My Kanto dex' });
        return 'shared';
      } catch (e) {
        if ((e as { name?: string } | null)?.name === 'AbortError') {
          // The player dismissed the share sheet: they chose not to share, so do nothing more.
          return 'cancelled';
        }
        // The share sheet refused for another reason; fall through to a download.
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
