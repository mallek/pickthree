// PickThree sample data + type palette (developer-rebuildable, no IP)
export const TYPE_COLORS = {
  normal:'#A8A77A', fire:'#EE8130', water:'#6390F0', electric:'#F7D02C', grass:'#7AC74C', ice:'#96D9D6',
  fighting:'#C22E28', poison:'#A33EA1', ground:'#E2BF65', flying:'#A98FF3', psychic:'#F95587', bug:'#A6B91A',
  rock:'#B6A136', ghost:'#735797', dragon:'#6F35FC', dark:'#705746', steel:'#B7B7CE', fairy:'#D685AD'
};
const mon = (name, types, extra={}) => ({ name, types, shadow:false, ...extra });
export const META = {
  Azumarill: mon('Azumarill',['water','fairy']), 'Galarian Stunfisk': mon('Galarian Stunfisk',['ground','steel']),
  Medicham: mon('Medicham',['fighting','psychic']), Skarmory: mon('Skarmory',['steel','flying']),
  Talonflame: mon('Talonflame',['fire','flying']), 'Shadow Ninetales': mon('Shadow Ninetales',['fire'],{shadow:true}),
  Cresselia: mon('Cresselia',['psychic']), Lickitung: mon('Lickitung',['normal']), Corviknight: mon('Corviknight',['flying','steel']),
  Clodsire: mon('Clodsire',['poison','ground']), Feraligatr: mon('Feraligatr',['water']), Annihilape: mon('Annihilape',['fighting','ghost']),
  Venusaur: mon('Venusaur',['grass','poison']), Lanturn: mon('Lanturn',['water','electric']), 'Shadow Victreebel': mon('Shadow Victreebel',['grass','poison'],{shadow:true}), Registeel: mon('Registeel',['steel'])
};
export const TEAMS = [
  { id:'t1', fit:'Strong', difficulty:'Moderate', diffWhy:'Balanced team; Altaria needs to bait one shield', structure:'ABC', dust:214000, candy:231, xl:12, etm:1, hasShadow:true,
    slices:[['Fairy and Steel openers',['Azumarill','Medicham']],['Fighting and Water pressure',['Medicham','Feraligatr']],['Shield-down endgames',['Galarian Stunfisk','Skarmory']]],
    why:'Tinkaton pressures the common Fairy and Steel openers, Altaria absorbs Fighting and Water pressure safely, and Annihilape closes against anything that survives with shields down.',
    slots:[
      { role:'Lead', roleWhy:'Your opener. Wins the first shield exchange against most of the meta.', ...mon('Tinkaton',['fairy','steel']),
        fast:'Fairy Wind', charged:[{name:'Gigaton Hammer',count:7,tm:null},{name:'Bulldoze',count:12,tm:'TM'}],
        spec:'15 / 14 / 15 · Level 24.5 · IV rank 6%', flags:[], cost:'62,000 Stardust · 71 Candy',
        alt:{name:'Galarian Stunfisk',types:['ground','steel'],line:'Cheaper: your Galarian Stunfisk, loses the Azumarill matchup'} },
      { role:'Safe Switch', roleWhy:'Comes in when your lead loses. Rarely has a bad matchup, so switching is never a gamble.', ...mon('Altaria',['dragon','flying']),
        fast:'Dragon Breath', charged:[{name:'Moonblast',count:8,tm:'Elite TM'},{name:'Flamethrower',count:9,tm:null}],
        spec:'4 / 15 / 15 · Level 28 · IV rank 9%', flags:[], cost:'78,000 Stardust · 82 Candy · 1 Elite TM',
        alt:{name:'Lickitung',types:['normal'],line:'No Elite TM: your Lickitung, weaker into Medicham'} },
      { role:'Closer', roleWhy:'Finishes the battle once shields are gone. Needs to win without protection.', ...mon('Shadow Annihilape',['fighting','ghost'],{shadow:true}),
        fast:'Low Kick', charged:[{name:'Rage Fist',count:7,tm:null},{name:'Ice Punch',count:7,tm:null}],
        spec:'2 / 15 / 14 · Level 42 · IV rank 18%', flags:['Shadow'], cost:'74,000 Stardust · 78 Candy · 12 XL Candy',
        alt:{name:'Medicham',types:['fighting','psychic'],line:'No shadow: your Medicham, loses to Cresselia'} }
    ],
    wins:[['Azumarill','Tinkaton wins the shield race'],['Galarian Stunfisk','Annihilape farms it down'],['Medicham','Altaria walls it'],['Skarmory','Two Fire moves cover it']],
    threats:[['Talonflame','Switch to Altaria only after its first Brave Bird'],['Shadow Ninetales','Bait one shield, then close with Annihilape'],['Cresselia','Avoid the lead matchup; let Tinkaton hammer it late']]
  },
  { id:'t4', fit:'Solid', difficulty:'Easy', diffWhy:'ABB line; no baiting needed, switch either way', structure:'ABB', dust:158000, candy:190, xl:40, etm:2, hasShadow:false,
    counters:['Venusaur','Lanturn','Shadow Victreebel'],
    why:'Azumarill draws out Grass and Electric answers, and both Galarian Stunfisk and Registeel beat those answers. Whatever the opponent switches to for Azumarill, your back line wins.',
    slots:[
      { role:'Lead', roleWhy:'Your opener. Bulky enough to survive a bad start and force the opponent to answer it.', ...mon('Azumarill',['water','fairy']), fast:'Bubble', charged:[{name:'Ice Beam',count:5,tm:null},{name:'Play Rough',count:6,tm:null}], spec:'8 / 15 / 15 · Level 40 · IV rank 2%', flags:[], cost:'12,000 Stardust · 12 Candy', alt:{name:'Medicham',types:['fighting','psychic'],line:'Cheaper: your Medicham, but the back line no longer covers its counters'} },
      { role:'Safe Switch', roleWhy:'Comes in when Azumarill loses. Beats every one of its counters.', ...mon('Galarian Stunfisk',['ground','steel']), fast:'Mud Shot', charged:[{name:'Rock Slide',count:8,tm:null},{name:'Earthquake',count:13,tm:'Elite TM'}], spec:'0 / 14 / 15 · Level 27 · IV rank 21%', flags:[], cost:'48,000 Stardust · 60 Candy · 1 Elite TM', alt:{name:'Skarmory',types:['steel','flying'],line:'Cheaper: your Skarmory, loses to Lanturn'} },
      { role:'Closer', roleWhy:'Finishes once shields are gone. Also beats the lead\'s counters, so the line holds either way.', ...mon('Registeel',['steel']), fast:'Lock On', charged:[{name:'Focus Blast',count:8,tm:null},{name:'Zap Cannon',count:11,tm:'Elite TM'}], spec:'12 / 15 / 15 · Level 35 · IV rank 14%', flags:[], cost:'98,000 Stardust · 118 Candy · 40 XL Candy · 1 Elite TM', alt:{name:'Lickitung',types:['normal'],line:'No XL: your Lickitung, loses to Venusaur'} }
    ],
    wins:[['Venusaur','Both back-liners beat it'],['Lanturn','Stunfisk farms it'],['Medicham','Azumarill wins the shield race'],['Skarmory','Registeel walls it']],
    threats:[['Talonflame','Never switch Stunfisk into it'],['Cresselia','Long fight; save Registeel'],['Annihilape','Fighting hits two of three']]
  },
  { id:'t2', fit:'Solid', difficulty:'Moderate', diffWhy:'Balanced team; Medicham must bait Ice Punch', structure:'ABC', dust:96000, candy:140, xl:0, etm:0, hasShadow:true,
    slices:[['Steel and Flying',['Skarmory','Galarian Stunfisk']],['Fairy and Normal',['Azumarill','Lickitung']],['Psychic and Ghost',['Cresselia','Annihilape']]],
    why:'Three Pokemon you already have near Great League CP. Azumarill and Medicham cover each other\'s weaknesses and Sableye ends fights without shields.',
    slots:[
      { role:'Lead', roleWhy:'Your opener. Bulky enough to survive a bad start.', ...mon('Azumarill',['water','fairy']), fast:'Bubble', charged:[{name:'Ice Beam',count:5,tm:null},{name:'Play Rough',count:6,tm:null}], spec:'8 / 15 / 15 · Level 40 · IV rank 2%', flags:[], cost:'12,000 Stardust · 12 Candy', alt:{name:'Feraligatr',types:['water'],line:'Faster: your Feraligatr, loses to Medicham'} },
      { role:'Safe Switch', roleWhy:'Comes in when your lead loses. Fast charged moves punish shields.', ...mon('Medicham',['fighting','psychic']), fast:'Counter', charged:[{name:'Ice Punch',count:7,tm:null},{name:'Psychic',count:9,tm:null}], spec:'15 / 15 / 13 · Level 49 · IV rank 11%', flags:[], cost:'34,000 Stardust · 54 Candy', alt:{name:'Annihilape',types:['fighting','ghost'],line:'Stronger: your Shadow Annihilape, costs 12 XL Candy'} },
      { role:'Closer', roleWhy:'Finishes the battle once shields are gone.', ...mon('Shadow Sableye',['dark','ghost'],{shadow:true}), fast:'Shadow Claw', charged:[{name:'Foul Play',count:6,tm:null},{name:'Return',count:8,tm:null}], spec:'1 / 12 / 15 · Level 45 · IV rank 34%', flags:['Shadow'], cost:'50,000 Stardust · 74 Candy', alt:{name:'Skarmory',types:['steel','flying'],line:'Safer: your Skarmory, loses to Galarian Stunfisk'} }
    ],
    wins:[['Galarian Stunfisk','Medicham farms it'],['Cresselia','Sableye wins without shields'],['Skarmory','Azumarill beats it 1–1']],
    threats:[['Azumarill','Mirror match; shield first'],['Talonflame','Lead Azumarill, never switch into it'],['Clodsire','Poison walls the Fairy damage']]
  },
  { id:'t3', fit:'Situational', difficulty:'Demanding', diffWhy:'Balanced team; Corviknight needs bait and a full build', structure:'ABC', dust:318000,
    slices:[['Grass and Fighting',['Venusaur','Medicham']],['Fairy and Dragon',['Azumarill','Altaria']],['Steel walls',['Galarian Stunfisk','Registeel']]], candy:301, xl:24, etm:0, hasShadow:true,
    why:'Corviknight is a top safe switch but your Rookidee is a full build. Worth it only if you plan to play many seasons.',
    slots:[
      { role:'Lead', roleWhy:'Your opener.', ...mon('Azumarill',['water','fairy']), fast:'Bubble', charged:[{name:'Ice Beam',count:5,tm:null},{name:'Play Rough',count:6,tm:null}], spec:'8 / 15 / 15 · Level 40 · IV rank 2%', flags:[], cost:'12,000 Stardust · 12 Candy', alt:{name:'Medicham',types:['fighting','psychic'],line:'Cheaper: your Medicham, loses to Skarmory'} },
      { role:'Safe Switch', roleWhy:'Comes in when your lead loses.', ...mon('Corviknight',['flying','steel']), fast:'Sand Attack', charged:[{name:'Iron Head',count:9,tm:null},{name:'Payback',count:14,tm:null}], spec:'From Rookidee 15 / 14 / 13 · Level 1 · IV rank 3%', flags:[], cost:'232,000 Stardust · 211 Candy · 24 XL Candy', alt:{name:'Altaria',types:['dragon','flying'],line:'Cheaper: your Altaria, needs 1 Elite TM'} },
      { role:'Closer', roleWhy:'Finishes the battle once shields are gone.', ...mon('Shadow Annihilape',['fighting','ghost'],{shadow:true}), fast:'Low Kick', charged:[{name:'Rage Fist',count:7,tm:null},{name:'Ice Punch',count:7,tm:null}], spec:'2 / 15 / 14 · Level 42 · IV rank 18%', flags:['Shadow'], cost:'74,000 Stardust · 78 Candy · 12 XL Candy', alt:{name:'Medicham',types:['fighting','psychic'],line:'No shadow: your Medicham, loses to Cresselia'} }
    ],
    wins:[['Medicham','Corviknight walls it'],['Azumarill','Annihilape outpaces it'],['Skarmory','Two answers to it']],
    threats:[['Galarian Stunfisk','Only Annihilape beats it'],['Shadow Ninetales','Fire hits two of three'],['Cresselia','Long, shield-heavy fight']]
  }
];
export const COLLECTION = [
  { id:'c1', name:'Azumarill', types:['water','fairy'], cp:1494, rank:'2%', verdict:'Great League ready', recent:true,
    ivs:'8 / 15 / 15', level:'40', rankLine:'Top 2% for Great League, this one is worth it.', evo:null,
    fast:'Bubble', charged:[{name:'Ice Beam',count:5,tm:null},{name:'Play Rough',count:6,tm:null}],
    upgrade:{from:'40',to:'40.5',dust:'6,000',candy:'8',xl:'0'}, perfect:'A perfect one would win 2 more of 48 meta matchups.', teams:['t4','t2','t3'] },
  { id:'c2', name:'Medicham', types:['fighting','psychic'], cp:1497, rank:'11%', verdict:'Great League ready', recent:true,
    ivs:'15 / 15 / 13', level:'49', rankLine:'Top 11% for Great League, good enough to use now.', evo:null,
    fast:'Counter', charged:[{name:'Ice Punch',count:7,tm:null},{name:'Psychic',count:9,tm:null}],
    upgrade:{from:'49',to:'50',dust:'34,000',candy:'54',xl:'24'}, perfect:'A perfect one would win 1 more of 48 meta matchups.', teams:['t2'] },
  { id:'c3', name:'Sableye', types:['dark','ghost'], shadow:true, cp:1488, rank:'34%', verdict:'Worth building', recent:false,
    ivs:'1 / 12 / 15', level:'45', rankLine:'Top 34% for Great League. Shadow bonus makes up for the rank.', evo:null,
    fast:'Shadow Claw', charged:[{name:'Foul Play',count:6,tm:null},{name:'Return',count:8,tm:null}],
    upgrade:{from:'45',to:'50',dust:'50,000',candy:'74',xl:'88'}, perfect:'A perfect one would win 3 more of 48 meta matchups.', teams:['t2'] },
  { id:'c4', name:'Rookidee', types:['flying'], cp:284, rank:'3%', verdict:'Worth building', recent:true,
    ivs:'15 / 14 / 13', level:'1', rankLine:'Top 3% for Great League as Corviknight. A long build, but a rare find.', evo:'Corviknight',
    fast:'Sand Attack', charged:[{name:'Iron Head',count:9,tm:null},{name:'Payback',count:14,tm:null}],
    upgrade:{from:'1',to:'50',dust:'232,000',candy:'211',xl:'24'}, perfect:'A perfect one would win 0 more of 48 meta matchups.', teams:['t3'] },
  { id:'c5', name:'Talonflame', types:['fire','flying'], cp:1479, rank:'40%', verdict:'Wait for better IVs', recent:false,
    ivs:'14 / 6 / 9', level:'30', rankLine:'Top 40% for Great League. Usable, but a better one is likely to show up.', evo:null,
    fast:'Incinerate', charged:[{name:'Brave Bird',count:6,tm:null},{name:'Fly',count:5,tm:null}],
    upgrade:{from:'30',to:'31.5',dust:'12,000',candy:'14',xl:'0'}, perfect:'A perfect one would win 5 more of 48 meta matchups.', teams:[] },
  { id:'c6', name:'Snorlax', types:['normal'], cp:2445, rank:'—', verdict:'Not eligible', recent:false,
    ivs:'15 / 15 / 14', level:'40', rankLine:'Over 1500 CP and cannot be powered down. Keep it for Ultra League.', evo:null,
    fast:'Lick', charged:[{name:'Body Slam',count:6,tm:null},{name:'Superpower',count:14,tm:null}],
    upgrade:null, perfect:'', teams:[] },
  { id:'c7', name:'Lilligant', types:['grass'], cp:1312, rank:'?', verdict:'Needs rescan', recent:false,
    ivs:'? / ? / ?', level:'27', rankLine:'Poke Genie did not read the IVs. Rescan it with the appraisal screen open.', evo:null,
    fast:'Charm', charged:[{name:'Petal Blizzard',count:14,tm:null},{name:'Hyper Beam',count:20,tm:null}],
    upgrade:null, perfect:'', teams:[] }
];
