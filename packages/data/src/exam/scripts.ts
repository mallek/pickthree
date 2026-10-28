import type { PolicyScript } from './expand.js';
import type { ExamSide } from './run-ours.js';

// The rules exam's scripts. Each names PvPoke species and moves (names, not pinned values) and picks
// its own levels and IVs. A script is a policy: expandScript turns it into the exact turns each side
// throws, so no turn number is written here. Every script ends in a knockout well inside both
// engines' clocks (the two timeout clocks differ; see rules-exam.test.ts).
//
// rules-exam.test.ts checks every tag below against the converted data at runtime: a tag is only
// covered when the script's moves and species really have that property.

export const COVERAGE: string[] = [
  'fast-trade',
  'charged-timing',
  'cmp-higher-atk',
  'cmp-tie',
  'shield',
  'buff-self-atk',
  'buff-self-def',
  'debuff-opponent-atk',
  'debuff-opponent-def',
  'buff-chance-proc',
  'buff-chance-miss',
  'shadow-attacker',
  'shadow-defender',
  'form-mimikyu',
  'form-aegislash',
  'form-cramorant-gulping',
  'form-cramorant-gorging',
  'form-morpeko',
  'form-minior',
];

function side(
  speciesId: string,
  level: number,
  ivs: [number, number, number],
  fastMove: string,
  chargedMoves: [string] | [string, string],
  shields: number,
  shadow = false,
): ExamSide {
  const s: ExamSide = {
    speciesId,
    level,
    ivs: { atk: ivs[0], def: ivs[1], hp: ivs[2] },
    fastMove,
    chargedMoves,
    shields,
  };
  if (shadow) {
    s.shadow = true;
  }
  return s;
}

const MEDICHAM = (shields: number): ExamSide =>
  side('medicham', 25, [4, 14, 12], 'COUNTER', ['ICE_PUNCH', 'PSYCHIC'], shields);
const AZUMARILL = (shields: number): ExamSide =>
  side('azumarill', 30, [10, 6, 15], 'BUBBLE', ['ICE_BEAM', 'PLAY_ROUGH'], shields);

export const EXAM_SCRIPTS: PolicyScript[] = [
  {
    id: 'fast-trade',
    covers: ['fast-trade'],
    sides: [MEDICHAM(0), AZUMARILL(0)],
    policy: [
      { slot: 0, times: 0 },
      { slot: 0, times: 0 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    id: 'charged-trade',
    covers: ['charged-timing'],
    sides: [MEDICHAM(0), AZUMARILL(0)],
    policy: [
      { slot: 0, times: 5 },
      { slot: 0, times: 5 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    id: 'shields',
    covers: ['shield', 'charged-timing'],
    sides: [MEDICHAM(2), AZUMARILL(2)],
    policy: [
      { slot: 0, times: 6 },
      { slot: 0, times: 6 },
    ],
    shields: [
      [true, false, true],
      [false, true, true],
    ],
    buffs: [],
  },
  {
    id: 'cmp-higher-atk',
    covers: ['cmp-higher-atk'],
    sides: [
      side('medicham', 25, [0, 15, 15], 'COUNTER', ['ICE_PUNCH'], 1),
      side('medicham', 25, [15, 0, 0], 'COUNTER', ['ICE_PUNCH'], 1),
    ],
    policy: [
      { slot: 0, times: 6 },
      { slot: 0, times: 6 },
    ],
    shields: [[true], [true]],
    buffs: [],
  },
  {
    // A mirror: equal Attack, both throw on the same turn and the tie winner's move knocks out the
    // other, which PvPoke still lets throw (no priority with equal Attack). See differences.yaml.
    id: 'cmp-tie-ko',
    covers: ['cmp-tie'],
    sides: [
      side('gengar', 18, [5, 12, 10], 'SHADOW_CLAW', ['SHADOW_BALL'], 0),
      side('gengar', 18, [5, 12, 10], 'SHADOW_CLAW', ['SHADOW_BALL'], 0),
    ],
    policy: [
      { slot: 0, times: 3 },
      { slot: 0, times: 3 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    // A Cramorant mirror forces charged move priority in PvPoke even at equal Attack (Battle.js:263),
    // so there the knocked-out side's move is skipped, as ours always does.
    id: 'cmp-tie-ko-cramorant',
    covers: ['cmp-tie'],
    sides: [
      side('cramorant', 12, [6, 12, 12], 'PECK', ['FLY'], 0),
      side('cramorant', 12, [6, 12, 12], 'PECK', ['FLY'], 0),
    ],
    policy: [
      { slot: 0, times: 4 },
      { slot: 0, times: 4 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    // A mirror tie with no knockout on the tie turns: both shield their first two.
    id: 'cmp-tie-shielded',
    covers: ['cmp-tie', 'shield'],
    sides: [MEDICHAM(2), MEDICHAM(2)],
    policy: [
      { slot: 0, times: 2 },
      { slot: 0, times: 2 },
    ],
    shields: [
      [true, true],
      [true, true],
    ],
    buffs: [],
  },
  {
    // Shadow against plain with the same IVs and level: equal raw Attack, so neither engine uses
    // charged move priority (both compare form Attack without the shadow multiplier).
    id: 'cmp-tie-shadow',
    covers: ['cmp-tie', 'shadow-attacker'],
    sides: [
      side('medicham', 25, [4, 14, 12], 'COUNTER', ['ICE_PUNCH'], 0, true),
      side('medicham', 25, [4, 14, 12], 'COUNTER', ['ICE_PUNCH'], 0),
    ],
    policy: [
      { slot: 0, times: 4 },
      { slot: 0, times: 4 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    id: 'buff-self-atk',
    covers: ['buff-self-atk'],
    sides: [side('medicham', 25, [4, 14, 12], 'COUNTER', ['POWER_UP_PUNCH'], 0), AZUMARILL(0)],
    policy: [
      { slot: 0, times: 8 },
      { slot: 0, times: 0 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    id: 'buff-self-def',
    covers: ['buff-self-def'],
    sides: [side('quagsire', 24, [6, 12, 10], 'MUD_SHOT', ['DRAIN_PUNCH'], 0), MEDICHAM(0)],
    policy: [
      { slot: 0, times: 8 },
      { slot: 0, times: 0 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    id: 'debuff-opponent-atk',
    covers: ['debuff-opponent-atk'],
    sides: [side('abomasnow', 20, [8, 9, 10], 'POWDER_SNOW', ['ICY_WIND'], 0), AZUMARILL(0)],
    policy: [
      { slot: 0, times: 8 },
      { slot: 0, times: 0 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    id: 'debuff-opponent-def',
    covers: ['debuff-opponent-def'],
    sides: [side('scrafty', 26, [3, 13, 11], 'COUNTER', ['ACID_SPRAY'], 0), AZUMARILL(0)],
    policy: [
      { slot: 0, times: 8 },
      { slot: 0, times: 0 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    id: 'buff-chance-proc',
    covers: ['buff-chance-proc'],
    sides: [side('medicham', 25, [4, 14, 12], 'COUNTER', ['PSYCHIC'], 0), AZUMARILL(0)],
    policy: [
      { slot: 0, times: 4 },
      { slot: 0, times: 0 },
    ],
    shields: [[], []],
    buffs: [true, true, false, true],
  },
  {
    id: 'buff-chance-miss',
    covers: ['buff-chance-miss'],
    sides: [side('medicham', 25, [4, 14, 12], 'COUNTER', ['PSYCHIC'], 0), AZUMARILL(0)],
    policy: [
      { slot: 0, times: 4 },
      { slot: 0, times: 0 },
    ],
    shields: [[], []],
    buffs: [false, false, false, false],
  },
  {
    id: 'shadow-attacker',
    covers: ['shadow-attacker'],
    sides: [
      side('swampert', 20, [5, 10, 12], 'MUD_SHOT', ['HYDRO_CANNON'], 1, true),
      side('registeel', 24, [2, 14, 15], 'LOCK_ON', ['FOCUS_BLAST'], 1),
    ],
    policy: [
      { slot: 0, times: 4 },
      { slot: 0, times: 4 },
    ],
    shields: [[false], [true]],
    buffs: [],
  },
  {
    id: 'shadow-defender',
    covers: ['shadow-defender'],
    sides: [
      side('registeel', 24, [2, 14, 15], 'LOCK_ON', ['FOCUS_BLAST'], 1),
      side('swampert', 20, [5, 10, 12], 'MUD_SHOT', ['EARTHQUAKE'], 1, true),
    ],
    policy: [
      { slot: 0, times: 4 },
      { slot: 0, times: 4 },
    ],
    shields: [[true], [false]],
    buffs: [],
  },
  {
    id: 'mimikyu',
    covers: ['form-mimikyu'],
    sides: [side('mimikyu', 25, [5, 12, 13], 'SHADOW_CLAW', ['PLAY_ROUGH'], 1), AZUMARILL(1)],
    policy: [
      { slot: 0, times: 6 },
      { slot: 0, times: 6 },
    ],
    // Azumarill's first hit is shielded (Disguise stays up), its second busts the disguise
    shields: [[true], [false]],
    buffs: [],
  },
  {
    id: 'aegislash',
    covers: ['form-aegislash'],
    sides: [
      side('aegislash_shield', 30, [3, 14, 13], 'AEGISLASH_CHARGE_PSYCHO_CUT', ['SHADOW_BALL'], 2),
      AZUMARILL(1),
    ],
    policy: [
      { slot: 0, times: 6 },
      { slot: 0, times: 6 },
    ],
    // Aegislash shields Azumarill's first move (back to Shield form) after its own move turned it Blade
    shields: [[true, true], [false]],
    buffs: [],
  },
  {
    // Dive above half HP: Gulping; Medicham's next unshielded charged move fires Gulp Missile.
    id: 'cramorant-gulping',
    covers: ['form-cramorant-gulping'],
    sides: [side('cramorant', 22, [6, 12, 12], 'WATER_GUN', ['DIVE'], 0), MEDICHAM(0)],
    policy: [
      { slot: 0, times: 3 },
      { slot: 0, times: 4 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    // A Cramorant mirror where both Surf on the same turns: each Surf turns its thrower Gulping and
    // the other side's Surf, resolved next in the same turn, fires that Gulp Missile.
    id: 'cramorant-mirror-surf',
    covers: ['form-cramorant-gulping', 'cmp-tie'],
    sides: [
      side('cramorant', 20, [6, 12, 12], 'PECK', ['SURF'], 0),
      side('cramorant', 20, [6, 12, 12], 'PECK', ['SURF'], 0),
    ],
    policy: [
      { slot: 0, times: 4 },
      { slot: 0, times: 4 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    // Lanturn's Spark takes Cramorant below half before its Dive: Gorging. Lanturn's Thunderbolt then
    // knocks Cramorant out, and Gulp Missile still fires from the fainted Cramorant (ignoresFaint).
    id: 'cramorant-gorging',
    covers: ['form-cramorant-gorging'],
    sides: [
      side('cramorant', 20, [6, 12, 12], 'WATER_GUN', ['DIVE'], 0),
      side('lanturn', 20, [8, 8, 8], 'SPARK', ['THUNDERBOLT'], 0),
    ],
    policy: [
      { slot: 0, times: 3 },
      { slot: 0, times: 4 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    id: 'morpeko',
    covers: ['form-morpeko'],
    sides: [
      side(
        'morpeko_full_belly',
        20,
        [7, 10, 12],
        'THUNDER_SHOCK',
        ['AURA_WHEEL_ELECTRIC', 'PSYCHIC_FANGS'],
        0,
      ),
      side('registeel', 24, [2, 14, 15], 'LOCK_ON', ['FOCUS_BLAST'], 0),
    ],
    policy: [
      { slot: 0, times: 4 },
      { slot: 0, times: 0 },
    ],
    shields: [[], []],
    buffs: [],
  },
  {
    // Minior turns Core below half HP and keeps battling as Core.
    id: 'minior-core',
    covers: ['form-minior'],
    sides: [
      side('minior_core', 20, [5, 10, 13], 'TAKE_DOWN', ['POWER_GEM'], 0),
      side('registeel', 18, [2, 14, 15], 'LOCK_ON', ['FOCUS_BLAST'], 0),
    ],
    policy: [
      { slot: 0, times: 4 },
      { slot: 0, times: 0 },
    ],
    shields: [[], []],
    buffs: [],
  },
];
