/** Campaign / era / unit data (spec §3, §5, §6).
 *  45 units = 3 campaigns × 5 eras × 3. Numbers derive from role archetypes
 *  scaled by era so evolving always matters; values carried over from the
 *  play-tested v1 balance pass.
 */
import { CampaignDef, Commander, DoctrineDef, EraDef, LevelDef, Role, RigConfig, SpecialDef, TurretDef, UnitDef } from './types';

/* ------------------------------------------------------------ role bases */
/** Move speeds tuned up ~25% for the long scrolling lane. */
const ROLE_BASE: Record<Role, { hp: number; dmg: number; range: number; cdMs: number; spd: number; cost: number; sup: number }> = {
  melee:  { hp: 150, dmg: 18, range: 46,  cdMs: 900,  spd: 80,  cost: 55,  sup: 1 },
  fast:   { hp: 95,  dmg: 14, range: 44,  cdMs: 700,  spd: 148, cost: 65,  sup: 1 },
  ranged: { hp: 80,  dmg: 22, range: 230, cdMs: 1100, spd: 70,  cost: 85,  sup: 2 },
  tank:   { hp: 520, dmg: 16, range: 50,  cdMs: 1200, spd: 50,  cost: 150, sup: 3 },
  siege:  { hp: 140, dmg: 70, range: 330, cdMs: 2200, spd: 45,  cost: 210, sup: 4 },
};
const eraScale = (t: number) => ({ hp: 1 + 0.85 * t, dmg: 1 + 0.8 * t, cost: 1 + 0.7 * t });

/** Pacing pass from live play-testing: evolving was arriving too fast and the
 *  overall tempo felt frantic — slower XP, slower income, slower spawn cadence. */
export const EVOLVE_XP = [0, 120, 300, 560, 950];      // XP to evolve INTO era idx (0-based)
export const BASE_HP_SCALE = 0.6;
/** Troop limit grows with each era: base + (era-1) * per-era bonus. */
export const SUPPLY_BASE = 10;
export const SUPPLY_PER_ERA = 3;
export const supplyCapFor = (era: number): number => SUPPLY_BASE + (era - 1) * SUPPLY_PER_ERA;
export const PLAYER_INCOME = 7.5;                      // gold/sec passive trickle
export const XP_TRICKLE_PLAYER = 4.5;                  // keeps evolution progressing sans kills
export const XP_TRICKLE_ENEMY = 3.6;
export const SPAWN_COOLDOWN = 0.8;                     // sec between queue emerges
export const QUEUE_MAX = 5;

/** Veterancy kill thresholds by role (light units rank up fast; siege racks up
 *  AoE kills easily so its bar is highest). Gold bonus only — never stats. */
const VETERANCY: Record<Role, number> = { melee: 4, fast: 3, ranged: 4, tank: 8, siege: 10 };
export const VETERAN_GOLD_BONUS = 0.5;   // +50% of reward per kill once veteran

let uidSeq = 1;
function makeUnit(campaign: string, era: number, role: Role, name: string, rig: RigConfig): UnitDef {
  const b = ROLE_BASE[role], s = eraScale(era - 1);
  const cost = Math.round(b.cost * s.cost);
  return {
    id: `${campaign}-${era}-${uidSeq++}`,
    name, role, era,
    cost,
    hp: Math.round(b.hp * s.hp),
    damage: Math.round(b.dmg * s.dmg),
    attackRange: b.range,
    attackCooldownMs: b.cdMs,
    moveSpeed: b.spd,
    supply: b.sup,
    reward: Math.round(cost * 0.55),
    xpReward: Math.round(10 + (era - 1) * 8 + b.sup * 4),
    veterancyThreshold: VETERANCY[role],
    rig,
  };
}

/** Boss unit factory — enemyRosterOverride for Last Stand (identity label only,
 *  never rendered as emoji: 🗿 Titan / 🐉 Dragon King / 🛸 Mothership). */
function makeBoss(campaign: string, name: string, rig: RigConfig): UnitDef {
  const base = makeUnit(campaign, 5, 'tank', name, rig);
  return {
    ...base,
    id: `${campaign}-boss`,
    hp: Math.round(base.hp * 3),
    damage: Math.round(base.damage * 2.2),
    cost: Math.round(base.cost * 2.4),
    supply: 6,
    reward: Math.round(base.cost * 2.4 * 0.7),
    xpReward: 120,
    moveSpeed: 34,
    attackRange: 60,
    veterancyThreshold: 99,
  };
}

/** 3 turret options per era, cheap → expensive, mirroring Age of War's
 *  Slingshot / Catapult / Ion-Cannon ladder:
 *  Rapid = cheap fast single-target · Splash = slow AoE lobber ·
 *  Sniper = long-range heavy single hit (era 5 sniper almost reaches mid-lane). */
const turretsFor = (era: number): TurretDef[] => {
  const s = eraScale(era - 1);
  return [
    { kind: 'rapid', name: 'Rapid', icon: '⚡', damage: Math.round(10 * s.dmg), range: 250 + era * 12, cooldownMs: 380, cost: Math.round(120 * s.cost), aoe: 0, proj: 'bullet' },
    { kind: 'heavy', name: 'Splash', icon: '💥', damage: Math.round(42 * s.dmg), range: 290 + era * 12, cooldownMs: 1900, cost: Math.round(260 * s.cost), aoe: 52, proj: 'shell' },
    { kind: 'sniper', name: 'Sniper', icon: '🎯', damage: Math.round(85 * s.dmg), range: 400 + era * 24, cooldownMs: 2600, cost: Math.round(480 * s.cost), aoe: 0, proj: 'beam' },
  ];
};

/** Extra turret slots are bought with gold (start with 1, max 4) — the
 *  escalating-cost ladder from Age of War, scaled to this economy. */
export const TURRET_SLOT_COSTS = [300, 800, 2000];
export const MAX_TURRET_SLOTS = 4;
export const TURRET_SELL_REFUND = 0.6;

/* --------------------------------------------------- unit tier upgrades (A) */
/** In-battle tier track per unit type: I (base) → II → III.
 *  Each tier: +30% HP, +25% dmg. Cost: 3× / 6× the unit's gold cost. */
export const TIER_HP = 1.3;
export const TIER_DMG = 1.25;
export const TIER_COST_MULT = [3, 6];
export const MAX_TIER = 2;
export const tierCost = (unitCost: number, nextTier: number): number => Math.round(unitCost * TIER_COST_MULT[nextTier - 1]);

/* ------------------------------------------------------ evolve doctrines (B) */
/** Same math in every campaign; names/flavor differ per campaign.
 *  Every doctrine buffs ~2 things and pays with a nerf or rider cost. */
function doctrinePairs(campaignId: string, names: [string, string, string, string, string, string, string, string], icons: [string, string, string, string, string, string, string, string]): [DoctrineDef, DoctrineDef][] {
  const D = (i: number, era: number, tag: DoctrineDef['tag'], good: string[], bad: string[], mods: Pick<DoctrineDef, 'unitMods' | 'allMods' | 'rider'>): DoctrineDef =>
    ({ id: `${campaignId}-d${era}-${tag}`, era, name: names[i], icon: icons[i], tag, good, bad, ...mods });
  return [
    [ // evolve into era 2: Line vs Volley
      D(0, 2, 'defensive', ['Melee & tanks +30% HP', 'Bigger shields'], ['Ranged fire 10% slower'],
        { unitMods: { melee: { hp: 1.3 }, tank: { hp: 1.3 }, ranged: { cdMs: 1.1 } } }),
      D(1, 2, 'aggressive', ['Ranged +25% damage, +20% range', 'Melee +15% speed'], ['Tanks −10% HP'],
        { unitMods: { ranged: { dmg: 1.25, range: 1.2 }, melee: { spd: 1.15 }, tank: { hp: 0.9 } } }),
    ],
    [ // era 3: Mobility vs Siegecraft
      D(2, 3, 'aggressive', ['Fast units +25% speed, +15% damage', 'All era-3 units +10% speed'], ['Siege −15% damage'],
        { unitMods: { fast: { spd: 1.25, dmg: 1.15 }, siege: { dmg: 0.85 } }, allMods: { spd: 1.1 } }),
      D(3, 3, 'defensive', ['Siege +30% damage, +15% range', 'Wider splash'], ['Fast units −10% HP'],
        { unitMods: { siege: { dmg: 1.3, range: 1.15, aoe: 1.35 }, fast: { hp: 0.9 } } }),
    ],
    [ // era 4: Economy vs Arsenal
      D(4, 4, 'defensive', ['+20% gold income', 'Era-4 units cost −10%'], ['Era-4 damage −8%'],
        { allMods: { cost: 0.9, dmg: 0.92 }, rider: { incomeMul: 1.2 } }),
      D(5, 4, 'aggressive', ['Era-4 units +18% damage', 'Special recharges 20% faster'], ['Income −8%'],
        { allMods: { dmg: 1.18 }, rider: { specialCdMul: 0.8, incomeMul: 0.92 } }),
    ],
    [ // era 5: Apex vs Horde
      D(6, 5, 'defensive', ['Era-5 units +25% HP, +15% damage'], ['Era-5 units cost +25%'],
        { allMods: { hp: 1.25, dmg: 1.15, cost: 1.25 } }),
      D(7, 5, 'aggressive', ['Era-5 units cost −20%', '+3 supply cap'], ['Era-5 units −15% HP'],
        { allMods: { cost: 0.8, hp: 0.85 }, rider: { supplyBonus: 3 } }),
    ],
  ];
}

const SPECIALS: Record<string, SpecialDef> = {
  rock:   { name: 'Boulder',       icon: '🪨', dmg: 260, radius: 120, cdSec: 32, kind: 'rocks' },
  arrows: { name: 'Arrow Rain',    icon: '🏹', dmg: 330, radius: 200, cdSec: 36, kind: 'arrows' },
  strike: { name: 'Airstrike',     icon: '✈️', dmg: 640, radius: 240, cdSec: 46, kind: 'shells' },
  laser:  { name: 'Orbital Laser', icon: '🛰️', dmg: 900, radius: 200, cdSec: 50, kind: 'beam' },
  magic:  { name: 'Meteor Swarm',  icon: '🔥', dmg: 520, radius: 220, cdSec: 42, kind: 'fire' },
  dragon: { name: 'Dragonfire',    icon: '🐉', dmg: 780, radius: 260, cdSec: 48, kind: 'fire' },
};

/* ------------------------------------------------ commander personalities */
const W = (melee: number, fast: number, ranged: number, tank: number, siege: number): Record<Role, number> =>
  ({ melee, fast, ranged, tank, siege });

export const COMMANDERS: Record<string, Commander> = {
  rusher: {
    id: 'rusher', name: 'The Rusher',
    spawnRateMul: 1.6, roleWeights: W(3, 3, 1, 0.3, 0.1),
    evolveAggression: 0.6, turretInvestment: 0.3, specialAggression: 0.5,
    turretPref: { rapid: 3, heavy: 1, sniper: 0.2 },
  },
  turtle: {
    id: 'turtle', name: 'The Turtle',
    spawnRateMul: 0.75, roleWeights: W(1, 0.3, 1.2, 3, 0.8),
    evolveAggression: 1.1, turretInvestment: 2.5, specialAggression: 0.8,
    turretPref: { rapid: 1, heavy: 3, sniper: 2 },
  },
  economist: {
    id: 'economist', name: 'The Economist',
    spawnRateMul: 0.6, roleWeights: W(1, 0.8, 1.2, 1.5, 1.5),
    evolveAggression: 1.8, turretInvestment: 1, specialAggression: 1,
    turretPref: { rapid: 0.5, heavy: 1, sniper: 3 },
  },
  siegeSpammer: {
    id: 'siegeSpammer', name: 'The Bombardier',
    spawnRateMul: 1, roleWeights: W(1.6, 0.4, 2, 0.5, 3),
    evolveAggression: 1, turretInvestment: 1, specialAggression: 1.2,
    turretPref: { rapid: 2, heavy: 2, sniper: 0.5 },
  },
  boss: {
    id: 'boss', name: 'The Warlord',
    spawnRateMul: 1.15, roleWeights: W(1, 0.7, 1.3, 2, 2),
    evolveAggression: 1.6, turretInvestment: 2, specialAggression: 1.6,
    turretPref: { rapid: 1, heavy: 2, sniper: 3 },
    boss: true,
  },
};

/** Enemy era window per level — spec §5 table, identical for all campaigns.
 *  Commander assignment escalates variety: Rusher early → Turtle/Bombardier
 *  mid → Economist late → Warlord boss on Last Stand. */
function levelsFor(): LevelDef[] {
  const names = ['First Contact', 'Border Skirmish', 'The Push', 'Bloody Ford', 'Siege', 'Counterattack', 'The Gauntlet', 'Last Stand'];
  const maxEra = [1, 1, 2, 2, 3, 4, 4, 5];
  const commanders = ['rusher', 'rusher', 'economist', 'siegeSpammer', 'turtle', 'siegeSpammer', 'economist', 'boss'];
  return names.map((name, i) => ({
    idx: i, name,
    startEra: i >= 6 ? 2 : 1,
    maxEra: maxEra[i],
    incomeMul: (0.85 + i * 0.13) * (commanders[i] === 'boss' ? 1.2 : 1),
    aggro: 0.85 + i * 0.07,
    baseHpMul: (1 + i * 0.12) * (commanders[i] === 'boss' ? 1.3 : 1),
    commanderId: commanders[i],
  }));
}

function era(name: string, eraIdx: number, baseHp: number, special: SpecialDef, units: UnitDef[]): EraDef {
  return { name, units, turrets: turretsFor(eraIdx), evolveXp: EVOLVE_XP[eraIdx - 1], baseHp, special };
}

/* ============================================================= campaigns */

const R = (rig: Partial<RigConfig> & Pick<RigConfig, 'kind' | 'body' | 'trim' | 'skin' | 'weapon' | 'weaponKind'>): RigConfig =>
  ({ scale: 1, ...rig });

/* ---- 🗿 Rise of Man ---- */
function riseOfMan(): CampaignDef {
  const c = 'man';
  return {
    id: c, name: 'Rise of Man', icon: '🗿',
    desc: 'From stone spears to plasma — the classic climb.',
    theme: { tint1: '#243b6b', tint2: '#8ea6d8', ground: '#5a6b3c', basePlayer: '#6b8e23', baseEnemy: '#8b3a3a' },
    levels: levelsFor(),
    doctrines: doctrinePairs(c,
      ['Shield Wall', 'Arrow Storm', 'Cavalry Charge', 'Siege Engines', 'War Economy', 'Arms Race', 'Titan Program', 'Drone Swarm'],
      ['\u{1F6E1}\uFE0F', '\u{1F3F9}', '\u{1F40E}', '\u{1F3AF}', '\u{1F4B0}', '\u2694\uFE0F', '\u{1F9BE}', '\u{1F916}']),
    bossUnit: makeBoss(c, 'War Titan', R({ kind: 'biped', body: '#4a4a55', trim: '#8a2f2f', skin: '#6a6a75', weapon: '#2c2c34', weaponKind: 'hammer', helmet: 'visor', bulk: 2.6, scale: 1.7 })),
    eras: [
      era('Stone Age', 1, 1600, SPECIALS.rock, [
        makeUnit(c, 1, 'melee', 'Clubman', R({ kind: 'biped', body: '#8a6242', trim: '#6a4a30', skin: '#d9a066', weapon: '#7a5a3a', weaponKind: 'club' })),
        makeUnit(c, 1, 'fast', 'Boar Rider', R({ kind: 'rider', body: '#7a5a40', trim: '#8a6242', skin: '#d9a066', weapon: '#9aa0a8', weaponKind: 'spear', headStyle: 'boar' })),
        makeUnit(c, 1, 'ranged', 'Slinger', R({ kind: 'biped', body: '#a08252', trim: '#7a6242', skin: '#d9a066', weapon: '#8a7a5a', weaponKind: 'sling', helmet: 'hood', projKind: 'shell' })),
      ]),
      era('Iron Age', 2, 2400, SPECIALS.arrows, [
        makeUnit(c, 2, 'melee', 'Legionary', R({ kind: 'biped', body: '#a04a3a', trim: '#b08030', skin: '#d9a066', weapon: '#c8ccd4', weaponKind: 'sword', helmet: 'cap' })),
        makeUnit(c, 2, 'tank', 'Shieldman', R({ kind: 'biped', body: '#8a8a95', trim: '#6a6a75', skin: '#d9a066', weapon: '#9aa0a8', weaponKind: 'spear', helmet: 'kettle', shield: true, bulk: 1.5 })),
        makeUnit(c, 2, 'ranged', 'Archer', R({ kind: 'biped', body: '#5a7a4a', trim: '#3f5a34', skin: '#d9a066', weapon: '#8a6a3c', weaponKind: 'bow', helmet: 'hood', projKind: 'arrow' })),
      ]),
      era('Castle Age', 3, 3400, SPECIALS.strike, [
        makeUnit(c, 3, 'melee', 'Knight', R({ kind: 'biped', body: '#9aa0b0', trim: '#7a8090', skin: '#d9a066', weapon: '#d8dce4', weaponKind: 'sword', helmet: 'knight', shield: true })),
        makeUnit(c, 3, 'fast', 'Cavalry', R({ kind: 'rider', body: '#7a5a40', trim: '#9aa0b0', skin: '#d9a066', weapon: '#d8dce4', weaponKind: 'spear', headStyle: 'horse', helmet: 'knight' })),
        makeUnit(c, 3, 'siege', 'Catapult', R({ kind: 'wheeled', body: '#8a6a3c', trim: '#6a5030', skin: '#d9a066', weapon: '#a0824c', weaponKind: 'none', siegeArm: 'catapult', scale: 1.15, projKind: 'shell' })),
      ]),
      era('Modern Age', 4, 4800, SPECIALS.strike, [
        makeUnit(c, 4, 'melee', 'Rifleman', R({ kind: 'biped', body: '#5a6a4a', trim: '#48543c', skin: '#d9a066', weapon: '#3c4438', weaponKind: 'rifle', helmet: 'cap', projKind: 'bullet' })),
        makeUnit(c, 4, 'tank', 'Armored Car', R({ kind: 'vehicle', body: '#5a6a4a', trim: '#48543c', skin: '#9aa0a8', weapon: '#3c4438', weaponKind: 'none', vehicleStyle: 'car', scale: 1.1, projKind: 'bullet' })),
        makeUnit(c, 4, 'siege', 'Mortar', R({ kind: 'wheeled', body: '#48543c', trim: '#3c4438', skin: '#9aa0a8', weapon: '#5a6a5a', weaponKind: 'none', siegeArm: 'barrel', scale: 1.1, projKind: 'shell' })),
      ]),
      era('Future Age', 5, 6800, SPECIALS.laser, [
        makeUnit(c, 5, 'fast', 'Battle Drone', R({ kind: 'flyer', body: '#4ac0e0', trim: '#2a80a0', skin: '#c8ccd4', weapon: '#2a5a70', weaponKind: 'none', flyerStyle: 'drone', hover: 24, projKind: 'beam' })),
        makeUnit(c, 5, 'tank', 'Mech', R({ kind: 'biped', body: '#8aa0c0', trim: '#5a708c', skin: '#c8ccd4', weapon: '#3a4a5c', weaponKind: 'rifle', helmet: 'visor', bulk: 2, scale: 1.25, projKind: 'beam' })),
        makeUnit(c, 5, 'siege', 'Rocket Turret', R({ kind: 'wheeled', body: '#5a708c', trim: '#3a4a5c', skin: '#c8ccd4', weapon: '#7ee0ff', weaponKind: 'none', siegeArm: 'barrel', scale: 1.2, projKind: 'orb' })),
      ]),
    ],
  };
}

/* ---- 🐉 Mythic Realms ---- */
function mythicRealms(): CampaignDef {
  const c = 'myth';
  return {
    id: c, name: 'Mythic Realms', icon: '🐉',
    desc: 'Goblins, knights, arch-mages and dragons wage endless war.',
    theme: { tint1: '#2a1b45', tint2: '#7a5aa8', ground: '#3d5c3a', basePlayer: '#4a7a9e', baseEnemy: '#9e4a7a' },
    levels: levelsFor(),
    doctrines: doctrinePairs(c,
      ['Oathbound', 'Wild Hunt', 'Elven Grace', 'Ballista Groves', 'Golden Ledger', 'Arcane Overload', 'Dragonlords', 'Endless Brood'],
      ['\u{1F6E1}\uFE0F', '\u{1F3F9}', '\u{1F98C}', '\u{1F38B}', '\u{1FA99}', '\u{1F52E}', '\u{1F409}', '\u{1F479}']),
    bossUnit: makeBoss(c, 'Dragon King', R({ kind: 'beast', body: '#2c2c34', trim: '#f0c040', skin: '#d9a066', weapon: '#ff8040', weaponKind: 'none', wings: true, scale: 1.9, projKind: 'fire' })),
    eras: [
      era('Goblin Warren', 1, 1600, SPECIALS.rock, [
        makeUnit(c, 1, 'melee', 'Goblin', R({ kind: 'biped', body: '#6aa04a', trim: '#4a7a34', skin: '#8ac06a', weapon: '#7a5a3a', weaponKind: 'club', scale: 0.85, helmet: 'horns' })),
        makeUnit(c, 1, 'fast', 'Ratling', R({ kind: 'rider', body: '#8a8a90', trim: '#6aa04a', skin: '#8ac06a', weapon: '#c8ccd4', weaponKind: 'rapier', headStyle: 'rat', scale: 0.9 })),
        makeUnit(c, 1, 'ranged', 'Hurler', R({ kind: 'biped', body: '#5a8a3f', trim: '#41682c', skin: '#8ac06a', weapon: '#9aa0a8', weaponKind: 'axe', projKind: 'bolt', scale: 0.9 })),
      ]),
      era('Human Kingdom', 2, 2500, SPECIALS.arrows, [
        makeUnit(c, 2, 'melee', 'Footman', R({ kind: 'biped', body: '#4a6aa0', trim: '#35507c', skin: '#d9a066', weapon: '#d8dce4', weaponKind: 'sword', helmet: 'cap' })),
        makeUnit(c, 2, 'tank', 'Paladin', R({ kind: 'biped', body: '#d0c8a8', trim: '#f0c040', skin: '#d9a066', weapon: '#c8ccd4', weaponKind: 'hammer', helmet: 'knight', shield: true, bulk: 1.5 })),
        makeUnit(c, 2, 'ranged', 'Longbow', R({ kind: 'biped', body: '#4a7a50', trim: '#36593a', skin: '#d9a066', weapon: '#8a6a3c', weaponKind: 'bow', helmet: 'hood', projKind: 'arrow' })),
      ]),
      era('Elven Court', 3, 3500, SPECIALS.magic, [
        makeUnit(c, 3, 'fast', 'Stag Rider', R({ kind: 'rider', body: '#8a6a4a', trim: '#6a9a6a', skin: '#e8c898', weapon: '#d8dce4', weaponKind: 'sword', headStyle: 'stag' })),
        makeUnit(c, 3, 'ranged', 'Ranger', R({ kind: 'biped', body: '#6a9a6a', trim: '#4d7a4d', skin: '#e8c898', weapon: '#a08a5a', weaponKind: 'bow', helmet: 'hood', projKind: 'arrow' })),
        makeUnit(c, 3, 'siege', 'Ballista', R({ kind: 'wheeled', body: '#7a8a5a', trim: '#5a6a42', skin: '#e8c898', weapon: '#a0824c', weaponKind: 'none', siegeArm: 'ballista', scale: 1.15, projKind: 'bolt' })),
      ]),
      era('Arcane Order', 4, 5000, SPECIALS.magic, [
        makeUnit(c, 4, 'melee', 'Battlemage', R({ kind: 'biped', body: '#7a5aca', trim: '#5a3fa0', skin: '#d9a066', weapon: '#b07bff', weaponKind: 'staff', helmet: 'wizard' })),
        makeUnit(c, 4, 'tank', 'Golem', R({ kind: 'biped', body: '#8a8578', trim: '#6a6558', skin: '#a09a8a', weapon: '#8a8578', weaponKind: 'fist', bulk: 2.3, scale: 1.3 })),
        makeUnit(c, 4, 'siege', 'Orb Caster', R({ kind: 'biped', body: '#5a4a8a', trim: '#42356a', skin: '#d9a066', weapon: '#b07bff', weaponKind: 'orb', helmet: 'hood', projKind: 'orb' })),
      ]),
      era('Dragon Throne', 5, 7000, SPECIALS.dragon, [
        makeUnit(c, 5, 'fast', 'Wyvern', R({ kind: 'flyer', body: '#b04a3a', trim: '#8a3428', skin: '#d9a066', weapon: '#f0c040', weaponKind: 'none', flyerStyle: 'wings', hover: 26 })),
        makeUnit(c, 5, 'tank', 'Drake', R({ kind: 'beast', body: '#5a8a4a', trim: '#8ac06a', skin: '#8ac06a', weapon: '#f0c040', weaponKind: 'none', wings: false, scale: 1.15 })),
        makeUnit(c, 5, 'siege', 'Elder Dragon', R({ kind: 'beast', body: '#a03a3a', trim: '#f0c040', skin: '#d9a066', weapon: '#ff8040', weaponKind: 'none', wings: true, scale: 1.5, projKind: 'fire' })),
      ]),
    ],
  };
}

/* ---- 🛸 Cosmic Frontier ---- */
function cosmicFrontier(): CampaignDef {
  const c = 'cosmos';
  return {
    id: c, name: 'Cosmic Frontier', icon: '🛸',
    desc: 'Colonists to star-empires — war among the void.',
    theme: { tint1: '#0a0a2a', tint2: '#3a2a6a', ground: '#3a3a4a', basePlayer: '#3aa0d0', baseEnemy: '#d05a3a' },
    levels: levelsFor(),
    doctrines: doctrinePairs(c,
      ['Bulwark Protocol', 'Railgun Doctrine', 'Overdrive', 'Orbital Bombardment', 'Trade Federation', 'Weapons Lab', 'Dreadnought Rising', 'Fighter Swarm'],
      ['\u{1F6E1}\uFE0F', '\u26A1', '\u{1F680}', '\u{1F6F0}\uFE0F', '\u{1FA99}', '\u{1F52C}', '\u{1F30C}', '\u{1F6F8}']),
    bossUnit: makeBoss(c, 'Mothership', R({ kind: 'vehicle', body: '#2a1a4a', trim: '#f0c040', skin: '#c8ccd4', weapon: '#ff6bd0', weaponKind: 'none', vehicleStyle: 'hoverHull', scale: 2, projKind: 'orb' })),
    eras: [
      era('Colony', 1, 1700, SPECIALS.rock, [
        makeUnit(c, 1, 'melee', 'Colonist', R({ kind: 'biped', body: '#d08a3a', trim: '#a86a28', skin: '#d9a066', weapon: '#8a8a90', weaponKind: 'hammer', helmet: 'visor' })),
        makeUnit(c, 1, 'fast', 'Speeder', R({ kind: 'vehicle', body: '#4ac0e0', trim: '#2a80a0', skin: '#c8ccd4', weapon: '#2a5a70', weaponKind: 'none', vehicleStyle: 'car', scale: 0.9, projKind: 'bullet' })),
        makeUnit(c, 1, 'ranged', 'Marine', R({ kind: 'biped', body: '#4a7ac0', trim: '#35598c', skin: '#d9a066', weapon: '#3c4450', weaponKind: 'rifle', helmet: 'visor', projKind: 'bullet' })),
      ]),
      era('Federation', 2, 2700, SPECIALS.arrows, [
        makeUnit(c, 2, 'melee', 'Trooper', R({ kind: 'biped', body: '#6a7a8a', trim: '#4e5a66', skin: '#d9a066', weapon: '#3c4450', weaponKind: 'rifle', helmet: 'cap', projKind: 'bullet' })),
        makeUnit(c, 2, 'tank', 'APC', R({ kind: 'vehicle', body: '#7a8a95', trim: '#5a6a75', skin: '#c8ccd4', weapon: '#3c4450', weaponKind: 'none', vehicleStyle: 'apc', scale: 1.15, projKind: 'bullet' })),
        makeUnit(c, 2, 'ranged', 'Sniper', R({ kind: 'biped', body: '#4e5a66', trim: '#39434c', skin: '#d9a066', weapon: '#2c343c', weaponKind: 'rifle', helmet: 'hood', projKind: 'beam' })),
      ]),
      era('Robotics', 3, 3800, SPECIALS.strike, [
        makeUnit(c, 3, 'fast', 'Scout Bot', R({ kind: 'biped', body: '#9ab0c0', trim: '#6a8090', skin: '#c8ccd4', weapon: '#3c4450', weaponKind: 'pistol', helmet: 'antenna', scale: 0.9, projKind: 'beam' })),
        makeUnit(c, 3, 'tank', 'Warbot', R({ kind: 'biped', body: '#8a95a5', trim: '#5a6570', skin: '#aab5c5', weapon: '#3c4450', weaponKind: 'rifle', helmet: 'visor', bulk: 1.9, scale: 1.2, projKind: 'beam' })),
        makeUnit(c, 3, 'siege', 'Rail Cannon', R({ kind: 'wheeled', body: '#5a6570', trim: '#434c55', skin: '#c8ccd4', weapon: '#7ee0ff', weaponKind: 'none', siegeArm: 'barrel', scale: 1.15, projKind: 'beam' })),
      ]),
      era('Star Fleet', 4, 5400, SPECIALS.laser, [
        makeUnit(c, 4, 'fast', 'Interceptor', R({ kind: 'flyer', body: '#5aa0ff', trim: '#3a70c0', skin: '#c8ccd4', weapon: '#2a5a70', weaponKind: 'none', flyerStyle: 'jet', hover: 28, projKind: 'beam' })),
        makeUnit(c, 4, 'tank', 'Cruiser', R({ kind: 'vehicle', body: '#4a6a9a', trim: '#35507c', skin: '#c8ccd4', weapon: '#7ee0ff', weaponKind: 'none', vehicleStyle: 'hoverHull', scale: 1.2, projKind: 'beam' })),
        makeUnit(c, 4, 'siege', 'Ion Turret', R({ kind: 'wheeled', body: '#3a70c0', trim: '#2a5490', skin: '#c8ccd4', weapon: '#7ee0ff', weaponKind: 'none', siegeArm: 'barrel', scale: 1.2, projKind: 'orb' })),
      ]),
      era('Star Empire', 5, 7600, SPECIALS.laser, [
        makeUnit(c, 5, 'fast', 'Fighter', R({ kind: 'flyer', body: '#b05aff', trim: '#8040c0', skin: '#c8ccd4', weapon: '#ff6bd0', weaponKind: 'none', flyerStyle: 'saucer', hover: 30, projKind: 'beam' })),
        makeUnit(c, 5, 'tank', 'Dreadnought', R({ kind: 'vehicle', body: '#4a3a7a', trim: '#6a5aa8', skin: '#c8ccd4', weapon: '#b07bff', weaponKind: 'none', vehicleStyle: 'hoverHull', scale: 1.45, projKind: 'orb' })),
        makeUnit(c, 5, 'siege', 'Nova Cannon', R({ kind: 'wheeled', body: '#6a5aa8', trim: '#4a3a7a', skin: '#c8ccd4', weapon: '#f0c040', weaponKind: 'none', siegeArm: 'barrel', scale: 1.25, projKind: 'orb' })),
      ]),
    ],
  };
}

export const CAMPAIGNS: CampaignDef[] = [riseOfMan(), mythicRealms(), cosmicFrontier()];

/** Endless era window — spec §5: floor ≈ ⌊wave/3⌋, cap ≈ ⌊wave/2⌋ (1-based eras). */
export function endlessWindow(wave: number): { startEra: number; maxEra: number } {
  const floor = Math.min(1 + Math.floor(wave / 3), 5);
  const cap = Math.max(floor, Math.min(1 + Math.floor(wave / 2), 5));
  return { startEra: floor, maxEra: cap };
}
export function endlessLevel(wave: number): LevelDef {
  const w = endlessWindow(wave);
  const cycle = ['rusher', 'siegeSpammer', 'turtle', 'economist'];
  return {
    idx: wave, name: `Wave ${wave + 1}`,
    startEra: w.startEra, maxEra: w.maxEra,
    incomeMul: 0.8 + wave * 0.14,
    aggro: 0.85 + wave * 0.06,
    baseHpMul: 1 + wave * 0.15,
    commanderId: (wave + 1) % 5 === 0 ? 'boss' : cycle[wave % cycle.length],
  };
}
