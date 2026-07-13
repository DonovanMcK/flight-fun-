/** Core shared types for EON WARS v2 (spec §2). */

export type Role = 'melee' | 'fast' | 'ranged' | 'tank' | 'siege';
export type Side = 'player' | 'enemy';
export type MovementTier = 'Very Fast' | 'Fast' | 'Normal' | 'Slow' | 'Very Slow' | 'Massive';

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
  movementTier: MovementTier;
  moveSpeed: number;        // px/s
  spawnTimeSec: number;     // queue delay after this unit emerges
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
  /** resolved stats at spawn: base def × era doctrine × unit tier */
  maxHp: number;
  stats: { dmg: number; spd: number; range: number; cdMs: number; aoe: number };
  tier: number;           // 0..2 — tier at spawn (retro-bumped on upgrade)
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

export type TurretKind = 'rapid' | 'heavy' | 'sniper';

export interface TurretDef {
  kind: TurretKind;
  name: string;
  icon: string;            // HUD glyph only — the turret itself is drawn procedurally
  damage: number;
  range: number;
  cooldownMs: number;
  cost: number;
  aoe: number;             // splash radius (heavy only)
  proj: NonNullable<RigConfig['projKind']>;
}

export interface Turret {
  def: TurretDef;
  era: number;
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
  supplyBonus: number;         // from doctrine riders — survives evolve recalcs
  queue: QueuedSpawn[];
  spawnCd: number;             // seconds until next queued unit emerges
  base: BaseState;
  specialCd: number;           // seconds remaining
  specialCdMul: number;        // doctrine rider
  killGoldMul: number;         // doctrine rider — gold-from-kills multiplier
  incomePerSec: number;
  /** doctrine chosen per era (index era-1); null = none / era 1 */
  doctrines: (DoctrineDef | null)[];
  /** unit tier upgrades bought this battle: defId → 0..2 */
  tiers: Record<string, number>;
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
  turretPref: Record<TurretKind, number>;  // which turret types it favors
  boss?: boolean;              // Last Stand: roster override + boss unit
}

export interface LevelDef {
  idx: number;                 // 0-based
  name: string;
  startEra: number;            // opening era; fair-start rules keep this at 1
  maxEra: number;              // 1-based cap
  incomeMul: number;
  enemyStartingGold: number;   // opening war chest; ongoing income remains combat-driven
  aggro: number;
  baseHpMul: number;
  commanderId: string;
}

export interface SpecialDef { name: string; icon: string; dmg: number; radius: number; cdSec: number; kind: 'rocks' | 'arrows' | 'shells' | 'fire' | 'beam'; }

export type EraMotif = 'human' | 'mythic' | 'cosmic';
export type EraStage = 'primitive' | 'fortified' | 'engineered' | 'advanced' | 'apex';
export type AmbientEffect = 'dust' | 'leaves' | 'embers' | 'sparks' | 'energy';
export type EvolutionEffect = 'rebuild' | 'morph' | 'energy';

/** Complete visual package for one era. The renderer consumes this data only;
 *  adding another era can reuse the procedural motif/stage vocabulary without
 *  changing combat or progression code. */
export interface EraVisualDef {
  skyTop: string;
  skyBottom: string;
  mountain: string;
  hill: string;
  groundTop: string;
  groundBottom: string;
  lightTint: string;
  lightStrength: number;
  accent: string;
  motif: EraMotif;
  stage: EraStage;
  ambient: AmbientEffect;
  propDensity: number;
  transition: { kind: EvolutionEffect; durationSec: number };
}

/** Stat multipliers a doctrine applies (1 = unchanged). */
export interface StatMods { hp?: number; dmg?: number; spd?: number; range?: number; cdMs?: number; cost?: number; aoe?: number; }

/** Evolve doctrine — chosen 1-of-2 when evolving INTO an era; battle-scoped.
 *  Affects only units OF that era (older survivors keep their own doctrines). */
export interface DoctrineDef {
  id: string;
  era: number;                       // 2..5
  name: string;                      // campaign-flavored
  icon: string;
  tag: 'defensive' | 'aggressive';
  good: string[];                    // green lines on the pick card
  bad: string[];                     // red lines
  unitMods?: Partial<Record<Role, StatMods>>;
  allMods?: StatMods;                // applies to every unit of this era
  rider?: { killGoldMul?: number; specialCdMul?: number; supplyBonus?: number };
}

export interface EraDef {
  name: string;
  units: UnitDef[];
  turrets: TurretDef[];        // 3 options per era: rapid / heavy / sniper
  evolveXp: number;            // XP required to evolve INTO this era
  baseHp: number;
  special: SpecialDef;
  visual: EraVisualDef;
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
  /** doctrine pairs for evolving into eras 2..5: doctrines[era-2] = [opt1, opt2] */
  doctrines: [DoctrineDef, DoctrineDef][];
  /** enemyRosterOverride extension point — the Last Stand boss unit */
  bossUnit: UnitDef;
}
