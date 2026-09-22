/**
 * A synthetic tournament event: one regional's worth of broadcast battles and RK9 roster entries,
 * in exactly the shapes workers/counter accepts. Deterministic, so the committed JSON only moves
 * when this file does.
 *
 * Every screen name here is invented. A real payload (and the real handles on it) never enters
 * this repo; the extraction pipeline talks to the deployed worker, not to git. Species ids are
 * real Great League ids so a page rendering this fixture resolves real sprites.
 *
 * Usage: npm run fixtures:tournament
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'tournament-sample.json');

/** Invented handles, 8 of them, in the shape a broadcast HUD prints: caps, no spaces. */
const PLAYERS = [
  'ARCWARDEN',
  'BLUEKITE',
  'CINDERVANE',
  'DUSKHOLLOW',
  'EMBERFALL',
  'FROSTQUILL',
  'GLASSREEF',
  'HOLLOWPINE',
];

/** Real Great League species ids, so sprites and matrix rows resolve. `mimikyu` is deliberately
 *  absent: the cup bans it, and a fixture that picked it would be describing an illegal team. */
const POOL = [
  'altaria',
  'clodsire',
  'melmetal',
  'corviknight',
  'dunsparce',
  'azumarill',
  'medicham',
  'lanturn',
  'registeel',
  'annihilape_shadow',
  'jumpluff_shadow',
  'corsola_galarian',
];

const MOVES = {
  altaria: { fast: 'DRAGON_BREATH', charged: ['MOONBLAST', 'FLAMETHROWER'] },
  clodsire: { fast: 'POISON_STING', charged: ['EARTHQUAKE', 'STONE_EDGE'] },
  melmetal: { fast: 'THUNDER_SHOCK', charged: ['SUPER_POWER', 'ROCK_SLIDE'] },
  corviknight: { fast: 'SAND_ATTACK', charged: ['SKY_ATTACK', 'IRON_HEAD'] },
  dunsparce: { fast: 'ROLLOUT', charged: ['DRILL_RUN', 'ROCK_SLIDE'] },
  azumarill: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
  medicham: { fast: 'COUNTER', charged: ['ICE_PUNCH', 'PSYCHIC'] },
  lanturn: { fast: 'WATER_GUN', charged: ['SURF', 'THUNDERBOLT'] },
  registeel: { fast: 'LOCK_ON', charged: ['FOCUS_BLAST', 'FLASH_CANNON'] },
  annihilape_shadow: { fast: 'COUNTER', charged: ['RAGE_FIST', 'ICE_PUNCH'] },
  jumpluff_shadow: { fast: 'FAIRY_WIND', charged: ['AERIAL_ACE', 'ACROBATICS'] },
  corsola_galarian: { fast: 'ASTONISH', charged: ['NIGHT_SHADE', 'POWER_GEM'] },
};

/** A 32-bit LCG. Not cryptography: a fixture that is the same on every machine. */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const rand = rng(20270918);

function pick(xs) {
  return xs[Math.floor(rand() * xs.length)];
}

/** Six distinct species per player, in a stable order. */
function rosterFor(seedIndex) {
  const six = [];
  let i = seedIndex;
  while (six.length < 6) {
    const species = POOL[i % POOL.length];
    if (!six.includes(species)) {
      six.push(species);
    }
    i += 2;
  }
  return six;
}

const ROSTERS = new Map(PLAYERS.map((p, i) => [p, rosterFor(i)]));

const EVENT_ID = '2027-crown-city-regional';
const EVENT = {
  name: '2027 Crown City Regional Championships',
  startDate: '2026-09-18',
  endDate: '2026-09-20',
  league: 'great',
  cup: 'championshipseries',
  vods: ['vod-day-one', 'vod-day-two'],
  notes: 'Synthetic fixture. Invented screen names, real species ids.',
};

/** Three of the player's six, with one pick in twelve left form-unresolved so the read model's
 *  "form not confirmed" path has data. */
function sideFor(player) {
  const six = ROSTERS.get(player);
  const team = [];
  while (team.length < 3) {
    const species = pick(six);
    if (!team.includes(species)) {
      team.push(species);
    }
  }
  return { player, team, forms: team.map(() => (rand() < 1 / 12 ? 'unresolved' : 'rk9')) };
}

const battles = [];
let clock = Date.parse('2026-09-18T15:00:00Z');
let n = 0;

/** Twelve matches: eight group best-of-three on day one, four top-cut best-of-five on day two. */
const MATCHES = [
  ...Array.from({ length: 8 }, (_, i) => ({
    day: 1,
    stage: 'groups',
    group: String.fromCharCode(65 + (i % 4)),
    roundLabel: `ROUND ${Math.floor(i / 4) + 1}`,
    matchFormat: 'bo3',
    bracket: 'winners',
    bracketDepth: 1 + (i % 3),
    games: 2 + (i % 2),
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    day: 2,
    stage: 'top_cut',
    group: null,
    roundLabel: ['TOP 8', 'TOP 4', 'WINNERS FINAL', 'GRAND FINAL'][i],
    matchFormat: 'bo5',
    bracket: i === 3 ? 'grand' : i === 2 ? 'losers' : 'winners',
    bracketDepth: 6 + i,
    games: 3 + (i % 2),
  })),
];

MATCHES.forEach((m, mi) => {
  const left = PLAYERS[mi % PLAYERS.length];
  const right = PLAYERS[(mi * 3 + 1) % PLAYERS.length];
  const player2 = right === left ? PLAYERS[(mi + 1) % PLAYERS.length] : right;
  let score = [0, 0];
  for (let g = 1; g <= m.games; g++) {
    n += 1;
    clock += 11 * 60_000;
    // One battle in seven has no winner: the broadcast cut away before the banner. 15 of
    // Baltimore's 105 are like this and the read model has to count the sighting anyway.
    const undecided = n % 7 === 0;
    const winnerSide = undecided ? null : rand() < 0.5 ? 'left' : 'right';
    battles.push({
      id: `${EVENT_ID}-${String(n).padStart(3, '0')}`,
      at: new Date(clock).toISOString(),
      day: m.day,
      stage: m.stage,
      group: m.group,
      roundLabel: m.roundLabel,
      match: `day${m.day}-${mi + 1}`,
      game: g,
      matchFormat: m.matchFormat,
      bracket: m.bracket,
      bracketDepth: m.bracketDepth,
      left: sideFor(left),
      right: sideFor(player2),
      winnerSide,
      resultSource: undecided ? null : g === m.games ? 'banner' : 'score',
      scoreAtStart: [score[0], score[1]],
      evidence: [`${EVENT_ID}_g${n}_score_${score[0]}-${score[1]}.jpg`],
      notes: null,
    });
    if (winnerSide === 'left') {
      score = [score[0] + 1, score[1]];
    } else if (winnerSide === 'right') {
      score = [score[0], score[1] + 1];
    }
  }
});

/** Every player's six. One roster entry in four carries no moveset, so "movesets known out of
 *  brought by" is a real fraction rather than always 100 percent. */
const entries = PLAYERS.flatMap((player) =>
  ROSTERS.get(player).map((species, slot) => ({
    player,
    slot: slot + 1,
    species,
    moves: (slot + player.length) % 4 === 0 ? null : (MOVES[species] ?? null),
  })),
);

const file = {
  id: EVENT_ID,
  event: EVENT,
  battles: { extractor: 'fixtures/make-tournament 1', battles },
  roster: { entries },
};

fs.writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(
  `wrote ${path.relative(process.cwd(), out)}: ${battles.length} battles, ${entries.length} roster entries\n`,
);
