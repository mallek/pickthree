/**
 * Fills a LOCAL counter worker with synthetic shared battles so the meta site can be judged at a
 * realistic volume before it is live. Synthetic only, the same rule as the CSV fixtures: this
 * never reads a real export and never points at production.
 *
 *   npx wrangler dev --port 8787            # in workers/counter, in another terminal
 *   node workers/counter/scripts/seed-battles.mjs --battles 500 --devices 5
 *
 * Flags: --url (default http://127.0.0.1:8787), --league great, --battles 500, --devices 5,
 *        --days 30, --seed 1, --partial 35,40,25 (the share of 1, 2 and 3 opponents seen),
 *        --tanked 3 (percent), --clear (delete each device's rows first).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '..', '..', '..', 'apps', 'web', 'public', 'data');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const url = new URL(arg('url', 'http://127.0.0.1:8787'));
// The one hard guard. Production holds real players' battles; a seeding run must never reach it.
if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
  console.error(`Refusing to seed ${url.hostname}. This tool only ever talks to localhost.`);
  process.exit(1);
}

const league = arg('league', 'great');
const wanted = Number(arg('battles', '500'));
const deviceCount = Number(arg('devices', '5'));
const days = Number(arg('days', '30'));
const tankedPct = Number(arg('tanked', '3'));
const partial = String(arg('partial', '35,40,25')).split(',').map(Number);

/** mulberry32: a seeded PRNG, so the same flags give the same data every run. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(Number(arg('seed', '1')));

function pick(items, weights) {
  let total = 0;
  for (const w of weights) {
    total += w;
  }
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}

const read = (...p) => JSON.parse(fs.readFileSync(path.join(DATA, ...p), 'utf8'));
let meta;
let overall;
try {
  meta = read('meta', `${league}.json`);
  overall = read('rankings', league, 'overall.json');
} catch {
  console.error(`No game data at ${DATA}. Run "npm run data:build" at the repo root first.`);
  process.exit(1);
}

// Who gets faced: PvPoke's meta group, weighted the way pick3 weights it, 1 / sqrt(rank).
const rankOf = new Map(overall.map((e, i) => [e.speciesId, i + 1]));
const faceable = meta.map((m) => m.speciesId);
const faceWeights = faceable.map((id) => 1 / Math.sqrt(rankOf.get(id) ?? 64));

// Who gets run: the top 60 of the overall ranking, so reporters' own teams look like real teams.
const runnable = overall.slice(0, 60).map((e) => e.speciesId);
const runWeights = runnable.map((_, i) => 1 / Math.sqrt(i + 1));

/**
 * A latent per-species strength so results are not coin flips: a seeded board that ranks by win
 * rate must be able to separate a good team from a bad one, or there is nothing to look at.
 */
const strength = new Map(overall.map((e, i) => [e.speciesId, 0.5 + 0.4 / Math.sqrt(i + 1)]));

const BANDS = ['below', 'ace', 'veteran', 'expert', 'legend'];
const BAND_WEIGHTS = [20, 30, 25, 15, 10];

function uuid() {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += hex[Math.floor(rand() * 16)];
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

const devices = [];
for (let i = 0; i < deviceCount; i++) {
  devices.push({ id: uuid(), band: pick(BANDS, BAND_WEIGHTS) });
}

function three(items, weights) {
  const out = [];
  while (out.length < 3) {
    const x = pick(items, weights);
    if (!out.includes(x)) {
      out.push(x);
    }
  }
  return out;
}

function battleAt() {
  const spanMs = days * 86400000;
  // Newer battles are more common, the way a real log fills up.
  const back = Math.pow(rand(), 1.6) * spanMs;
  return new Date(Date.now() - back).toISOString();
}

const batches = new Map();
for (let i = 0; i < wanted; i++) {
  const device = devices[Math.floor(rand() * devices.length)];
  const team = three(runnable, runWeights);
  const seenCount = pick([1, 2, 3], partial);
  const opponents = three(faceable, faceWeights).slice(0, seenCount);
  const tanked = rand() * 100 < tankedPct;
  const mine = team.reduce((a, id) => a + (strength.get(id) ?? 0.5), 0) / 3;
  const theirs = opponents.reduce((a, id) => a + (strength.get(id) ?? 0.5), 0) / opponents.length;
  const pWin = Math.max(0.1, Math.min(0.9, 0.5 + (mine - theirs) * 1.2));
  const battle = {
    id: `seed-${i}`,
    league,
    season: 28,
    at: battleAt(),
    team,
    moves: null,
    opponents,
    result: tanked ? null : rand() < pWin ? 'win' : 'loss',
    tanked,
    band: device.band,
  };
  const list = batches.get(device.id) ?? [];
  list.push(battle);
  batches.set(device.id, list);
}

async function post(body) {
  const res = await fetch(new URL('/battles', url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  return res.json();
}

let stored = 0;
for (const [device, all] of batches) {
  if (flag('clear')) {
    await fetch(new URL('/battles', url), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ device }),
    });
  }
  for (let i = 0; i < all.length; i += 200) {
    const r = await post({ device, client: 'seed 0000000', battles: all.slice(i, i + 200) });
    stored += r.stored;
  }
}
console.log(`seeded ${stored} battles for ${league} across ${devices.length} devices at ${url}`);
