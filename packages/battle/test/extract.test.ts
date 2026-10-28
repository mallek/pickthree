import { describe, expect, it } from 'vitest';
import { extractBattleData } from '../src/extract/index.js';
import {
  ENUM_TYPES,
  minimalTemplates,
  tCombatMove,
  tCombatSettings,
  tForms,
  tLeague,
  tPlayerLevel,
  tPokemon,
  tStageSettings,
  tType,
  typeTemplates,
  type Template,
} from './fixtures/templates.js';

const SRC = { commit: 'abc123', date: '2026-10-27' };

function run(extra: Template[] = [], base: Template[] = minimalTemplates()) {
  return extractBattleData([...base, ...extra], SRC);
}

const ZAP = tCombatMove('COMBAT_V0900_MOVE_ZAP_FAST', {
  uniqueId: 'ZAP_FAST',
  type: 'POKEMON_TYPE_ELECTRIC',
  power: 4,
  energyDelta: 7,
  durationTurns: 2,
});
const BOLT = tCombatMove('COMBAT_V0901_MOVE_BOLT', {
  uniqueId: 'BOLT',
  type: 'POKEMON_TYPE_ELECTRIC',
  power: 90,
  energyDelta: -55,
});

function fakemon(over: Record<string, unknown> = {}, id = 'V0900_POKEMON_FAKEMON'): Template {
  return tPokemon(id, {
    pokemonId: 'FAKEMON',
    type: 'POKEMON_TYPE_ELECTRIC',
    stats: { baseAttack: 150, baseDefense: 120, baseStamina: 130 },
    quickMoves: ['ZAP_FAST'],
    cinematicMoves: ['BOLT'],
    ...over,
  });
}

describe('extractBattleData: envelope', () => {
  it('stamps version, source and empty mechanics', () => {
    const { data, warnings } = run();
    expect(data.version).toBe(1);
    expect(data.source).toEqual({ kind: 'datamine', commit: 'abc123', date: '2026-10-27' });
    expect(data.mechanics).toEqual({});
    expect(warnings).toEqual([]);
  });
  it('ignores unknown template kinds', () => {
    const { data } = run([
      { templateId: 'WEATHER_X', data: { templateId: 'WEATHER_X', weather: {} } },
    ]);
    expect(data.version).toBe(1);
  });
  it('throws with the templateId when a needed template is malformed', () => {
    expect(() => run([tType('POKEMON_TYPE_BROKEN', [1])])).toThrow(/POKEMON_TYPE_BROKEN/);
    expect(() => run([tCombatMove('COMBAT_V0902_MOVE_BAD', { uniqueId: 'BAD' })])).toThrow(
      /COMBAT_V0902_MOVE_BAD/,
    );
    expect(() => run([tPokemon('V0903_POKEMON_BAD', { pokemonId: 'BAD' })])).toThrow(
      /V0903_POKEMON_BAD/,
    );
  });
});

describe('extractBattleData: types', () => {
  it('orders types by the datamine enum and rows by attackType', () => {
    const scalars = ENUM_TYPES.map((_, i) => 1 + i / 100);
    const base = [
      ...typeTemplates().filter((t) => t.templateId !== 'POKEMON_TYPE_FIRE'),
      tType('POKEMON_TYPE_FIRE', scalars),
      tCombatSettings(),
      tStageSettings(),
      tPlayerLevel([0.1, 0.2]),
    ];
    const { data } = run([], base);
    expect(data.types).toEqual(ENUM_TYPES);
    const fire = data.types.indexOf('fire');
    expect(fire).toBe(9);
    expect(data.effectiveness[fire]).toEqual(scalars.map((v) => Math.fround(v)));
    expect(data.effectiveness[0]?.[0]).toBe(1);
  });
});

describe('extractBattleData: settings', () => {
  it('froundes multipliers and derives roundTurns', () => {
    const { data } = run(
      [],
      [
        ...typeTemplates(),
        tCombatSettings({ roundDurationSeconds: 270, turnDurationSeconds: 0.5 }),
        tStageSettings(),
        tPlayerLevel([0.1]),
      ],
    );
    const s = data.settings;
    expect(s.fastBonus).toBe(Math.fround(1.3));
    expect(s.chargedBonus).toBe(Math.fround(1.3));
    expect(s.stab).toBe(Math.fround(1.2));
    expect(s.shadowAtk).toBe(Math.fround(1.2));
    expect(s.shadowDef).toBe(Math.fround(0.8333333));
    expect(s.maxEnergy).toBe(100);
    expect(s.roundTurns).toBe(540);
    expect(s.stages).toEqual({
      min: -1,
      max: 1,
      atk: [Math.fround(0.8), 1, Math.fround(1.25)],
      def: [Math.fround(0.8), 1, Math.fround(1.25)],
    });
  });
});

describe('extractBattleData: cpm', () => {
  it('interleaves half levels as the root mean square of the fround neighbours', () => {
    const { data } = run(
      [],
      [
        ...typeTemplates(),
        tCombatSettings(),
        tStageSettings(),
        tPlayerLevel([0.094, 0.1351374, 0.16639787]),
      ],
    );
    const a = Math.fround(0.094);
    const b = Math.fround(0.1351374);
    const c = Math.fround(0.16639787);
    expect(data.cpm).toHaveLength(5);
    expect(data.cpm[0]).toBe(a);
    expect(data.cpm[1]).toBe(Math.sqrt((a * a + b * b) / 2));
    expect(data.cpm[2]).toBe(b);
    expect(data.cpm[3]).toBe(Math.sqrt((b * b + c * c) / 2));
    expect(data.cpm[4]).toBe(c);
  });
});

describe('extractBattleData: moves', () => {
  it('makes a 3-turn fast move from durationTurns 2', () => {
    const { data } = run([ZAP]);
    expect(data.moves['ZAP_FAST']).toEqual({
      id: 'ZAP_FAST',
      type: 'electric',
      category: 'fast',
      power: 4,
      energy: 0,
      energyGain: 7,
      turns: 3,
    });
  });
  it('makes a charged move with positive energy cost', () => {
    const { data } = run([BOLT]);
    expect(data.moves['BOLT']).toEqual({
      id: 'BOLT',
      type: 'electric',
      category: 'charged',
      power: 90,
      energy: 55,
      energyGain: 0,
      turns: 1,
    });
  });
  it('defaults missing power, energy and duration to zero without negative zero', () => {
    const { data } = run([
      tCombatMove('COMBAT_V0904_MOVE_ODD', { uniqueId: 'ODD', type: 'POKEMON_TYPE_NORMAL' }),
      tCombatMove('COMBAT_V0905_MOVE_ODD_FAST', {
        uniqueId: 'ODD_FAST',
        type: 'POKEMON_TYPE_NORMAL',
      }),
    ]);
    const odd = data.moves['ODD'];
    expect(odd?.power).toBe(0);
    expect(Object.is(odd?.energy, 0)).toBe(true);
    expect(data.moves['ODD_FAST']?.turns).toBe(1);
  });
  it('names an integer-id move from its template id', () => {
    const { data } = run([
      tCombatMove('COMBAT_V0593_MOVE_DIVE', {
        uniqueId: 593,
        type: 'POKEMON_TYPE_WATER',
        power: 50,
        energyDelta: -40,
      }),
      tCombatMove('COMBAT_VM_MOVE_TEMP_EVOLUTION_MEGA_V0900_POKEMON_FAKEMON', {
        uniqueId: 515,
        type: 'POKEMON_TYPE_DRAGON',
        power: 80,
        energyDelta: -50,
      }),
    ]);
    expect(data.moves['DIVE']?.energy).toBe(40);
    expect(data.moves['TEMP_EVOLUTION_MEGA_V0900_POKEMON_FAKEMON']?.type).toBe('dragon');
  });
  it('treats a _FAST_ infix id as a fast move', () => {
    const { data } = run([
      tCombatMove('COMBAT_V0908_MOVE_ZAP_FAST_ALT', {
        uniqueId: 'ZAP_FAST_ALT',
        type: 'POKEMON_TYPE_ELECTRIC',
        power: 6,
        energyDelta: 4,
        durationTurns: 1,
      }),
    ]);
    expect(data.moves['ZAP_FAST_ALT']?.category).toBe('fast');
    expect(data.moves['ZAP_FAST_ALT']?.turns).toBe(2);
  });
  it('reads buffs with defaults and omits empty sides', () => {
    const { data } = run([
      tCombatMove('COMBAT_V0906_MOVE_SELFBUFF', {
        uniqueId: 'SELFBUFF',
        type: 'POKEMON_TYPE_FIRE',
        power: 50,
        energyDelta: -35,
        buffs: { attackerAttackStatStageChange: 2, buffActivationChance: 0.5 },
      }),
      tCombatMove('COMBAT_V0907_MOVE_DEBUFF', {
        uniqueId: 'DEBUFF',
        type: 'POKEMON_TYPE_FIRE',
        power: 50,
        energyDelta: -35,
        buffs: { targetDefenseStatStageChange: -1, attackerDefenseStatStageChange: 1 },
      }),
    ]);
    expect(data.moves['SELFBUFF']?.buffs).toEqual({ chance: 0.5, self: { atk: 2, def: 0 } });
    expect(data.moves['DEBUFF']?.buffs).toEqual({
      chance: 1,
      self: { atk: 0, def: 1 },
      opponent: { atk: 0, def: -1 },
    });
    expect(run([ZAP]).data.moves['ZAP_FAST']?.buffs).toBeUndefined();
  });
});

describe('extractBattleData: species', () => {
  it('reads stats, types, moves, dex, family and shadow', () => {
    const { data } = run([
      ZAP,
      BOLT,
      tCombatMove('COMBAT_V0902_MOVE_FRUSTRATION', {
        uniqueId: 'FRUSTRATION',
        type: 'POKEMON_TYPE_NORMAL',
        power: 10,
        energyDelta: -40,
      }),
      tCombatMove('COMBAT_V0903_MOVE_RETURN', {
        uniqueId: 'RETURN',
        type: 'POKEMON_TYPE_NORMAL',
        power: 10,
        energyDelta: -40,
      }),
      tCombatMove('COMBAT_V0904_MOVE_SPARK_FAST', {
        uniqueId: 'SPARK_FAST',
        type: 'POKEMON_TYPE_ELECTRIC',
        power: 3,
        energyDelta: 5,
      }),
      tCombatMove('COMBAT_V0905_MOVE_ZING', {
        uniqueId: 'ZING',
        type: 'POKEMON_TYPE_ELECTRIC',
        power: 60,
        energyDelta: -45,
      }),
      tCombatMove('COMBAT_V0906_MOVE_ZONK', {
        uniqueId: 'ZONK',
        type: 'POKEMON_TYPE_ELECTRIC',
        power: 70,
        energyDelta: -50,
      }),
      fakemon({
        type2: 'POKEMON_TYPE_STEEL',
        eliteQuickMove: ['SPARK_FAST'],
        eliteCinematicMove: ['ZING'],
        nonTmCinematicMoves: ['ZONK', 'BOLT'],
        shadow: { shadowChargeMove: 'FRUSTRATION', purifiedChargeMove: 'RETURN' },
      }),
    ]);
    expect(data.species['fakemon']).toEqual({
      id: 'fakemon',
      dex: 900,
      family: 'fakemon',
      baseStats: { atk: 150, def: 120, hp: 130 },
      types: ['electric', 'steel'],
      fast: ['ZAP_FAST', 'SPARK_FAST'],
      charged: ['BOLT', 'ZING', 'ZONK'],
      eliteFast: ['SPARK_FAST'],
      eliteCharged: ['ZING'],
      shadow: { charged: 'FRUSTRATION', purifiedCharged: 'RETURN' },
      tags: [],
    });
  });
  it('resolves integer move refs through the move pool', () => {
    const { data, warnings } = run([
      ZAP,
      tCombatMove('COMBAT_V0497_MOVE_ZOOM', {
        uniqueId: 497,
        type: 'POKEMON_TYPE_ELECTRIC',
        power: 65,
        energyDelta: -45,
      }),
      fakemon({ cinematicMoves: ['BOLT', 497] }),
      BOLT,
    ]);
    expect(data.species['fakemon']?.charged).toEqual(['BOLT', 'ZOOM']);
    expect(warnings).toEqual([]);
  });
  it('drops an unresolved integer move ref, keeps the species and warns', () => {
    const { data, warnings } = run([ZAP, BOLT, fakemon({ cinematicMoves: ['BOLT', 9999] })]);
    expect(data.species['fakemon']?.charged).toEqual(['BOLT']);
    expect(warnings).toEqual(['species fakemon: move ref 9999 has no combatMove template']);
  });
  it('drops an unresolved string move ref the same way', () => {
    const { data, warnings } = run([
      ZAP,
      BOLT,
      fakemon({ quickMoves: ['ZAP_FAST', 'GHOST_FAST'] }),
    ]);
    expect(data.species['fakemon']?.fast).toEqual(['ZAP_FAST']);
    expect(warnings).toEqual(['species fakemon: move ref GHOST_FAST has no combatMove template']);
  });
  it('names a form template by form, stripping a trailing _normal', () => {
    const { data } = run([
      ZAP,
      BOLT,
      fakemon({ form: 'FAKEMON_NORMAL' }, 'V0900_POKEMON_FAKEMON_NORMAL'),
      fakemon({ form: 'FAKEMON_ALOLA', type2: 'POKEMON_TYPE_ICE' }, 'V0900_POKEMON_FAKEMON_ALOLA'),
    ]);
    expect(Object.keys(data.species).sort()).toEqual(['fakemon', 'fakemon_alola']);
    expect(data.species['fakemon_alola']?.family).toBe('fakemon');
    expect(data.species['fakemon_alola']?.types).toEqual(['electric', 'ice']);
  });
  it('skips a costume form', () => {
    const { data } = run([
      ZAP,
      BOLT,
      tForms('FAKEMON', [
        { form: 'FAKEMON_NORMAL' },
        { form: 'FAKEMON_HAT_2019', isCostume: true },
      ]),
      fakemon({ form: 'FAKEMON_NORMAL' }, 'V0900_POKEMON_FAKEMON_NORMAL'),
      fakemon({ form: 'FAKEMON_HAT_2019' }, 'V0900_POKEMON_FAKEMON_HAT_2019'),
    ]);
    expect(Object.keys(data.species)).toEqual(['fakemon']);
  });
  it('drops a formless template that duplicates a kept form, keeps one that differs', () => {
    const forms = [
      fakemon({ form: 'FAKEMON_NORMAL' }, 'V0900_POKEMON_FAKEMON_NORMAL'),
      fakemon({}, 'V0900_POKEMON_FAKEMON'),
    ];
    expect(Object.keys(run([ZAP, BOLT, ...forms]).data.species)).toEqual(['fakemon']);

    const meteor = tPokemon('V0774_POKEMON_ROCKMON', {
      pokemonId: 'ROCKMON',
      type: 'POKEMON_TYPE_ROCK',
      stats: { baseAttack: 100, baseDefense: 200, baseStamina: 120 },
      quickMoves: ['ZAP_FAST'],
      cinematicMoves: ['BOLT'],
    });
    const core = tPokemon('V0774_POKEMON_ROCKMON_RED', {
      pokemonId: 'ROCKMON',
      form: 'ROCKMON_RED',
      type: 'POKEMON_TYPE_ROCK',
      stats: { baseAttack: 180, baseDefense: 100, baseStamina: 120 },
      quickMoves: ['ZAP_FAST'],
      cinematicMoves: ['BOLT'],
    });
    const { data } = run([ZAP, BOLT, meteor, core]);
    expect(Object.keys(data.species).sort()).toEqual(['rockmon', 'rockmon_red']);
    expect(data.species['rockmon']?.baseStats.atk).toBe(100);
  });
  it('lets a form template win an id collision with a formless one', () => {
    const formless = fakemon(
      { stats: { baseAttack: 1, baseDefense: 1, baseStamina: 1 } },
      'V0900_POKEMON_FAKEMON',
    );
    const form = fakemon(
      { form: 'FAKEMON_NORMAL', type2: 'POKEMON_TYPE_ICE' },
      'V0900_POKEMON_FAKEMON_NORMAL',
    );
    const { data } = run([ZAP, BOLT, formless, form]);
    expect(data.species['fakemon']?.baseStats.atk).toBe(150);
  });
});

describe('extractBattleData: megas', () => {
  const megaMove = tCombatMove('COMBAT_VM_MOVE_TEMP_EVOLUTION_MEGA_V0900_POKEMON_FAKEMON', {
    uniqueId: 515,
    type: 'POKEMON_TYPE_DRAGON',
    power: 80,
    energyDelta: -50,
  });
  const overrides = [
    {
      tempEvoId: 'TEMP_EVOLUTION_MEGA_X',
      stats: { baseAttack: 250, baseDefense: 200, baseStamina: 130 },
      typeOverride1: 'POKEMON_TYPE_FIRE',
      typeOverride2: 'POKEMON_TYPE_DRAGON',
    },
    {
      tempEvoId: 'TEMP_EVOLUTION_MEGA',
      stats: { baseAttack: 200, baseDefense: 150, baseStamina: 130 },
    },
    { tempEvoId: 'TEMP_EVOLUTION_PRIMAL' },
  ];
  it('adds mega species with overrides, fallback types and the mega move', () => {
    const { data } = run([ZAP, BOLT, megaMove, fakemon({ tempEvoOverrides: overrides })]);
    expect(Object.keys(data.species).sort()).toEqual(['fakemon', 'fakemon_mega', 'fakemon_mega_x']);
    const x = data.species['fakemon_mega_x'];
    expect(x?.types).toEqual(['fire', 'dragon']);
    expect(x?.baseStats).toEqual({ atk: 250, def: 200, hp: 130 });
    expect(x?.tags).toEqual(['mega']);
    expect(x?.family).toBe('fakemon');
    expect(x?.dex).toBe(900);
    expect(x?.fast).toEqual(['ZAP_FAST']);
    expect(x?.charged).toEqual(['BOLT']);
    const m = data.species['fakemon_mega'];
    expect(m?.charged).toEqual(['BOLT', 'TEMP_EVOLUTION_MEGA_V0900_POKEMON_FAKEMON']);
    expect(m?.types).toEqual(['electric']);
    expect(m?.shadow).toBeNull();
  });
  it('does not mega a non-canonical form', () => {
    const { data } = run([
      ZAP,
      BOLT,
      fakemon(
        { form: 'FAKEMON_ALOLA', tempEvoOverrides: overrides },
        'V0900_POKEMON_FAKEMON_ALOLA',
      ),
    ]);
    expect(Object.keys(data.species)).toEqual(['fakemon_alola']);
  });
});

describe('extractBattleData: leagues', () => {
  it('reads cap, types, ban list with forms, level range and the unmodelled warning', () => {
    const { data, warnings } = run([
      tLeague('COMBAT_LEAGUE_VS_SEEKER_GREAT_FAKE', {
        title: 'fake_cup_title',
        enabled: true,
        leagueType: 'PREMIER',
        pokemonCount: 3,
        allowTempEvos: true,
        bannedPokemon: ['DITTO'],
        pokemonCondition: [
          { type: 'WITH_POKEMON_CP_LIMIT', withPokemonCpLimit: { maxCp: 1500 } },
          { type: 'WITH_UNIQUE_POKEMON' },
          {
            type: 'WITH_POKEMON_TYPE',
            withPokemonType: { pokemonType: ['POKEMON_TYPE_FLYING', 'POKEMON_TYPE_ICE'] },
          },
          { type: 'POKEMON_LEVEL_RANGE', pokemonLevelRange: { maxLevel: 41 } },
          {
            type: 'POKEMON_BANLIST',
            pokemonBanList: {
              pokemon: [
                { id: 'CRADILY' },
                { id: 'FAKEMON', forms: ['FORM_UNSET', 'FAKEMON_NORMAL', 'FAKEMON_ALOLA'] },
              ],
            },
          },
          { type: 'WITH_WEATHER' },
        ],
      }),
    ]);
    const l = data.leagues['vs_seeker_great_fake'];
    expect(l).toEqual({
      id: 'vs_seeker_great_fake',
      title: 'fake_cup_title',
      enabled: true,
      leagueType: 'PREMIER',
      pokemonCount: 3,
      cpCap: 1500,
      maxLevel: 41,
      unique: true,
      allowMegas: true,
      types: ['flying', 'ice'],
      allowed: null,
      banned: [
        { family: 'cradily', forms: null },
        { family: 'fakemon', forms: ['fakemon', 'fakemon_alola'] },
        { family: 'ditto', forms: null },
      ],
      caughtWindow: null,
    });
    expect(warnings).toEqual(['league vs_seeker_great_fake: condition WITH_WEATHER not modelled']);
  });
  it('reads a whitelist, a single form entry and the caught window', () => {
    const { data } = run([
      tLeague('COMBAT_LEAGUE_SAFARI_FAKE', {
        title: 't',
        enabled: false,
        leagueType: 'PREMIER',
        pokemonCount: 3,
        pokemonCondition: [
          {
            type: 'POKEMON_CAUGHT_TIMESTAMP',
            pokemonCaughtTimestamp: {
              afterTimestamp: '1697184000000',
              beforeTimestamp: '1697212800000',
            },
          },
          {
            type: 'POKEMON_WHITELIST',
            pokemonWhiteList: { pokemon: [{ id: 'UNOWN', form: 'UNOWN_B' }, { id: 'SANDYGAST' }] },
          },
        ],
      }),
    ]);
    const l = data.leagues['safari_fake'];
    expect(l?.allowed).toEqual([
      { family: 'unown', forms: ['unown_b'] },
      { family: 'sandygast', forms: null },
    ]);
    expect(l?.caughtWindow).toEqual({ after: 1697184000000, before: 1697212800000 });
    expect(l?.enabled).toBe(false);
    expect(l?.allowMegas).toBe(false);
    expect(l?.unique).toBe(false);
    expect(l?.cpCap).toBeNull();
    expect(l?.maxLevel).toBeNull();
  });
});
