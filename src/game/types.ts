/** Core shared types for EON WARS v2 (spec §2). */

export type Role = 'melee' | 'fast' | 'ranged' | 'tank' | 'siege';
export type Side = 'player' | 'enemy';

/** Which procedural rig archetype draws this unit (spec §1). */
export type RigKind = 'biped' | 'rider' | 'wheeled' | 'vehicle' | 'flyer' | 'beast';

export type WeaponKind =
  | 'club' | 'axe' | 'sword' | 'spear' | 'hammer' | 'rapier'
  | 'sling' | 'bow' | 'crossbow' | 'rifle' | 'pistol'
  | 'staff' | 'orb' | 'wand' | 'fist' | 'none';

export interface RigConfig {
  kind: RigKind;
  /** primary body / cloth color */
  body: string;
  /** secondary (trim, pants, hull stripe) */
  trim: string;
  /** skin / metal face color */
  skin: string;
  /** weapon / barrel color */
  weapon: string;
  weaponKind: WeaponKind;
  /** overall scale multiplier (1 = footman) */
  scale: number;
  /** biped bulk (limb thickness mult), default 1 */
  bulk?: number;
  helmet?: 'none' | 'cap' | 'knight' | 'horns' | 'hood' | 'crown' | 'kettle' | 'antenna' | 'visor' | 'wizard';
  shield?: boolean;
  /** rider/beast head style */
  headStyle?: 'boar' | 'horse' | 'stag' | 'rat' | 'drake' | 'dragon' | 'bird';
  /** wheeled: 'catapult' | 'ballista' | 'barrel' — which siege arm to draw */
  siegeArm?: 'catapult' | 'ballista' | 'barrel';
  /** flyer hover height in px (world units, pre-scale) */
  hover?: number;
  /** flyer style */
  flyerStyle?: 'wings' | 'saucer' | 'jet' | 'drone';
  /** vehicle style */
  vehicleStyle?: 'car' | 'apc' | 'treads' | 'hoverHull';
  /** beast: draw wings */
  wings?: boolean;
  /** projectile look */
  projKind?: 'arrow' | 'shell' | 'orb' | 'bolt' | 'bullet' | 'fire' | 'beam';
}

export interface UnitDef {
  id: string;
  name: string;
  role: Role;
  era: number;              // 1..5
  cost: number;
  hp: number;
  damage: number;
  attackRange: number;      // px (world units)
  attackCooldownMs: number;
  moveSpeed: number;        // px/s
  supply: number;
  reward: number;           // gold to killer on death
  xpReward: number;
  /** kills needed for this unit to reach veteran rank (gold bonus, no stat buff) */
  veterancyThreshold: number;
  rig: RigConfig;
}

export type UnitState = 'walk' | 'attack' | 'die' | 'wait';

/** Interpolated bone angles — one flat bag shared by all archetypes.
 *  Each archetype reads the subset it cares about. Radians unless noted. */
export interface BonePose {
  lean: number;       // torso lean (fwd +)
  bob: number;        // vertical body offset (px, up +)
  lunge: number;      // horizontal body offset (px, fwd +)
  thighF: number; shinF: number;
  thighB: number; shinB: number;
  armUF: number; armLF: number;   // lead arm (weapon arm)
  armUB: number; armLB: number;   // off arm
  weapon: number;     // weapon bone angle relative to forearm
  head: number;       // head tilt
  aux: number;        // archetype extra: bow flex / siege arm / neck / wing flap
  aux2: number;       // second extra: jaw / string draw / turret recoil
  fall: number;       // die rotation 0..1
}

export interface UnitInstance {
  uid: number;
  def: UnitDef;
  side: Side;
  x: number;
  hp: number;
  state: UnitState;
  pose: BonePose;         // current (interpolated)
  animT: number;          // seconds in current state
  walkPhase: number;
  atkCd: number;          // seconds until next attack cycle may start
  attackT: number;        // 0..1 progress through current attack cycle
  didImpact: boolean;     // impact event fired for this cycle
  targetUid: number | null;
  targetIsBase: boolean;
  hitFlash: number;
  deadT: number;          // seconds since death started
  prevWeaponAngle: number; // for motion-trail velocity detection
  kills: number;
  veteran: boolean;       // banked enough kills → bonus gold per kill (no stat buff)
}

export interface Projectile {
  side: Side;
  x: number; y: number;
  vx: number; vy: number;
  gravity: number;        // 0 = straight
  damage: number;
  aoe: number;            // 0 = single target
  kind: NonNullable<RigConfig['projKind']>;
  targetUid: number | null;
  targetIsBase: boolean;
  /** uid of the firing unit — kill credit for veterancy (null = turret/special) */
  sourceUid: number | null;
  dead: boolean;
}

export interface Turret {
  era: number;
  damage: number;
  range: number;
  cooldownMs: number;
  cd: number;
}

export interface BaseState {
  side: Side;
  x: number;
  hp: number;
  maxHp: number;
  turrets: Turret[];
  slots: number;
  hitT: number;           // recent-hit flash timer
  popT: number;           // evolve scale-pop progress (0 = start, >=1 = done)
}

export interface QueuedSpawn { def: UnitDef; }

export interface SideState {
  side: Side;
  gold: number;
  xp: number;
  era: number;                 // 1..5 current era
  capEra: number;              // max era this side may reach (enemy window)
  supply: number;
  supplyCap: number;
  queue: QueuedSpawn[];
  spawnCd: number;             // seconds until next queued unit emerges
  base: BaseState;
  specialCd: number;           // seconds remaining
  incomePerSec: number;
  // enemy-only knobs
  aggro: number;
  aiSpawnT: number;
}

/** Enemy commander personality — a weight profile over the AI's existing
 *  decisions. Changes HOW it spends, never the era-window table. */
export interface Commander {
  id: string;
  name: string;
  spawnRateMul: number;
  roleWeights: Record<Role, number>;
  evolveAggression: number;    // multiplies enemy XP gain toward evolving
  turretInvestment: number;    // multiplies turret-buy chance
  specialAggression: number;   // multiplies special-usage chance
  boss?: boolean;              // Last Stand: roster override + boss unit
}

export interface LevelDef {
  idx: number;                 // 0-based
  name: string;
  startEra: number;            // 1-based
  maxEra: number;              // 1-based cap
  incomeMul: number;
  aggro: number;
  baseHpMul: number;
  commanderId: string;
}

export interface SpecialDef { name: string; icon: string; dmg: number; radius: number; cdSec: number; kind: 'rocks' | 'arrows' | 'shells' | 'fire' | 'beam'; }

export interface EraDef {
  name: string;
  units: UnitDef[];
  turret: { damage: number; range: number; cooldownMs: number; cost: number };
  evolveXp: number;            // XP required to evolve INTO this era
  baseHp: number;
  special: SpecialDef;
}

export interface CampaignTheme {
  tint1: string; tint2: string; ground: string; basePlayer: string; baseEnemy: string;
}

export interface CampaignDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  theme: CampaignTheme;
  eras: EraDef[];              // 5
  levels: LevelDef[];          // 8
  /** enemyRosterOverride extension point — the Last Stand boss unit */
  bossUnit: UnitDef;
}
