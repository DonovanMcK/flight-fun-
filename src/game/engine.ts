/** Game simulation (spec §0, §3, §4, §5).
 *  Runs in fixed world units: lane is LANE_W wide; the renderer fits it to the
 *  canvas. Damage applies at the attack animation's impact frame, never on
 *  state-enter. React reads snapshots via subscribe().
 */
import {
  BaseState, CampaignDef, Commander, DoctrineDef, LevelDef, Projectile, Side, SideState, StatMods, Turret, TurretDef,
  UnitDef, UnitInstance,
} from './types';
import { CAMPAIGNS, COMMANDERS, endlessLevel, EVOLVE_XP, BASE_HP_SCALE, supplyCapFor, PLAYER_INCOME, FRIENDLY_DEATH_XP_PCT, SPAWN_COOLDOWN, QUEUE_MAX, VETERAN_GOLD_BONUS, TURRET_SLOT_COSTS, MAX_TURRET_SLOTS, TURRET_SELL_REFUND, TIER_HP, TIER_DMG, MAX_TIER, tierCost } from './data';
import { defaultPose, updatePose, ATK_IMPACT } from './rig';
import { clamp, lerp } from './primitives';
import { sfx } from './sfx';

/** Lane is much wider than the screen — the camera scrolls to see the bases. */
export const LANE_W = 2100;
export const LANE_L = 52;
export const LANE_R = LANE_W - 52;
const SPACING = 34;

/* ------------------------------------------------------------- VFX types */
export interface Particle {
  x: number; y: number; vx: number; vy: number; g: number;
  t: number; life: number; size: number; color: string;
  kind: 'dust' | 'spark' | 'flash' | 'smoke';
}
export interface FloatText { x: number; y: number; t: number; text: string; color: string; }
export interface SpecialFx { kind: 'rocks' | 'arrows' | 'shells' | 'fire' | 'beam'; x: number; radius: number; t: number; side: Side; }

/* ------------------------------------------------------------ persistence */
const SAVE_KEY = 'eonwars2_save';
export interface SaveData { unlocked: Record<string, number>; endlessBest: number; sound: boolean; }
export function loadSave(): SaveData {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s) return { unlocked: s.unlocked ?? {}, endlessBest: s.endlessBest ?? 0, sound: s.sound ?? true };
  } catch { /* fresh */ }
  return { unlocked: {}, endlessBest: 0, sound: true };
}
export function writeSave(s: SaveData): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/* ================================================================ engine */

export type GameMode = 'menu' | 'battle';
export type BattleResult = 'win' | 'lose' | null;

class Engine {
  mode: GameMode = 'menu';
  campaign: CampaignDef = CAMPAIGNS[0];
  level: LevelDef = CAMPAIGNS[0].levels[0];
  endless = false;
  endlessWave = 0;
  result: BattleResult = null;
  paused = false;
  speed = 1;
  time = 0;

  player!: SideState;
  enemy!: SideState;
  units: UnitInstance[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];
  specialFx: SpecialFx[] = [];
  /** screen shake magnitude — set ONLY by special-attack impacts */
  shake = 0;
  /** hit-stop: while > 0, simulation freezes (heavy/lethal impacts only) */
  hitStop = 0;
  /** full-screen white/gold flash on evolve, fading */
  evolveFlash = 0;
  commander: Commander = COMMANDERS.rusher;
  /** player evolve gate: the 1-of-2 doctrine cards awaiting a pick (sim freezes) */
  pendingDoctrines: [DoctrineDef, DoctrineDef] | null = null;
  /** canvas toast when the ENEMY adopts a doctrine */
  doctrineToast: { text: string; t: number } | null = null;

  save: SaveData = loadSave();

  private uidSeq = 1;
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getVersion = (): number => this.version;
  notify(): void { this.version++; this.listeners.forEach(fn => fn()); }

  /* ------------------------------------------------------------- battle setup */
  startBattle(campaign: CampaignDef, level: LevelDef, endless: boolean, wave = 0): void {
    this.campaign = campaign;
    this.level = endless ? endlessLevel(wave) : level;
    this.endless = endless;
    this.endlessWave = wave;
    this.mode = 'battle'; this.result = null; this.paused = false; this.speed = 1; this.time = 0;
    this.units = []; this.projectiles = []; this.particles = []; this.floats = []; this.specialFx = [];
    this.shake = 0; this.hitStop = 0; this.evolveFlash = 0;
    this.pendingDoctrines = null; this.doctrineToast = null;
    this.commander = COMMANDERS[this.level.commanderId] ?? COMMANDERS.rusher;

    this.player = this.makeSide('player', 1, 5);
    const lv = this.level;
    this.enemy = this.makeSide('enemy', lv.startEra, lv.maxEra);
    this.enemy.incomePerSec = 2.6 * lv.incomeMul;
    this.enemy.aggro = lv.aggro;
    this.enemy.base.hp = this.enemy.base.maxHp = Math.round(this.campaign.eras[lv.startEra - 1].baseHp * lv.baseHpMul * BASE_HP_SCALE);
    // both sides' supply grows as they evolve (see evolve()); the enemy starts
    // at its floor-era cap
    this.notify();
  }

  private makeSide(side: Side, era: number, capEra: number): SideState {
    const base: BaseState = {
      side, x: side === 'player' ? LANE_L : LANE_R,
      hp: Math.round(this.campaign.eras[era - 1].baseHp * BASE_HP_SCALE),
      maxHp: Math.round(this.campaign.eras[era - 1].baseHp * BASE_HP_SCALE),
      turrets: [], slots: 1, hitT: 0, popT: 2,
    };
    return {
      side, gold: side === 'player' ? 200 : 100, xp: 0, era, capEra,
      supply: 0, supplyCap: supplyCapFor(era), supplyBonus: 0, queue: [], spawnCd: 0,
      base, specialCd: 0, specialCdMul: 1, killGoldMul: 1,
      incomePerSec: PLAYER_INCOME,
      doctrines: [null, null, null, null, null], tiers: {},
      aggro: 1, aiSpawnT: 1.5,
    };
  }

  quitToMenu(): void { this.mode = 'menu'; this.result = null; this.notify(); }

  /** Most advanced friendly unit's position — camera "jump to front" anchor. */
  frontX(): number {
    let best = LANE_L + 140;
    for (const u of this.units) {
      if (u.side === 'player' && u.state !== 'die' && u.x > best) best = u.x;
    }
    return best;
  }

  /* ------------------------------------------------------------- player actions */
  sideFor(side: Side): SideState { return side === 'player' ? this.player : this.enemy; }

  queuedSupply(s: SideState): number { return s.queue.reduce((a, q) => a + q.def.supply, 0); }

  /** Resolve a unit's battle stats: base def × era doctrine × bought tier.
   *  Doctrines touch only units OF their era; tiers only their unit type. */
  effectiveStats(side: Side, def: UnitDef): { cost: number; hp: number; dmg: number; spd: number; range: number; cdMs: number; aoe: number } {
    const s = this.sideFor(side);
    let hp = def.hp, dmg = def.damage, spd = def.moveSpeed, range = def.attackRange, cdMs = def.attackCooldownMs, cost = def.cost;
    let aoe = def.role === 'siege' ? 44 : 0;
    const doc = s.doctrines[def.era - 1];
    if (doc) {
      const apply = (m?: StatMods): void => {
        if (!m) return;
        hp *= m.hp ?? 1; dmg *= m.dmg ?? 1; spd *= m.spd ?? 1;
        range *= m.range ?? 1; cdMs *= m.cdMs ?? 1; cost *= m.cost ?? 1; aoe *= m.aoe ?? 1;
      };
      apply(doc.allMods);
      apply(doc.unitMods?.[def.role]);
    }
    const tier = s.tiers[def.id] ?? 0;
    hp *= Math.pow(TIER_HP, tier);
    dmg *= Math.pow(TIER_DMG, tier);
    return { cost: Math.round(cost), hp: Math.round(hp), dmg: Math.round(dmg), spd, range, cdMs, aoe };
  }

  canBuy(side: Side, def: UnitDef): boolean {
    const s = this.sideFor(side);
    return s.gold >= this.effectiveStats(side, def).cost && s.queue.length < QUEUE_MAX &&
      s.supply + this.queuedSupply(s) + def.supply <= s.supplyCap;
  }

  buyUnit(side: Side, def: UnitDef): boolean {
    if (this.mode !== 'battle' || this.result) return false;
    const s = this.sideFor(side);
    if (!this.canBuy(side, def)) return false;
    s.gold -= this.effectiveStats(side, def).cost;
    s.queue.push({ def });
    if (side === 'player') sfx('spawn');
    this.notify();
    return true;
  }

  /** Tier upgrade (I→II→III) for one unit type — applies to living units too
   *  (they keep their HP percentage) and all future spawns. */
  buyTier(side: Side, def: UnitDef): boolean {
    const s = this.sideFor(side);
    const cur = s.tiers[def.id] ?? 0;
    if (cur >= MAX_TIER) return false;
    const cost = tierCost(def.cost, cur + 1);
    if (s.gold < cost) return false;
    s.gold -= cost;
    s.tiers[def.id] = cur + 1;
    for (const u of this.units) {
      if (u.side !== side || u.def.id !== def.id || u.state === 'die') continue;
      const frac = u.hp / u.maxHp;
      u.maxHp = Math.round(u.maxHp * TIER_HP);
      u.hp = Math.round(u.maxHp * frac);
      u.stats.dmg = Math.round(u.stats.dmg * TIER_DMG);
      u.tier = cur + 1;
      this.burst(u.x, -40 * u.def.rig.scale, 5, '#ffd25a', 'spark');
    }
    if (side === 'player') sfx('evolve');
    this.notify();
    return true;
  }

  /** Build a specific turret type into a free slot. */
  buyTurret(side: Side, def: TurretDef): boolean {
    const s = this.sideFor(side);
    if (s.gold < def.cost || s.base.turrets.length >= s.base.slots) return false;
    s.base.turrets.push({ def, era: s.era, cd: 0 });
    s.gold -= def.cost;
    if (side === 'player') sfx('build');
    this.notify();
    return true;
  }

  nextSlotCost(side: Side): number | null {
    const s = this.sideFor(side);
    if (s.base.slots >= MAX_TURRET_SLOTS) return null;
    return TURRET_SLOT_COSTS[s.base.slots - 1];
  }

  /** Buy an extra turret slot (escalating cost, max 4 — Age of War style). */
  buySlot(side: Side): boolean {
    const s = this.sideFor(side);
    const cost = this.nextSlotCost(side);
    if (cost == null || s.gold < cost) return false;
    s.gold -= cost;
    s.base.slots++;
    if (side === 'player') sfx('build');
    this.notify();
    return true;
  }

  /** Sell a built turret for a partial refund — frees the slot for a
   *  newer-era or different-type turret. */
  sellTurret(side: Side, idx: number): boolean {
    const s = this.sideFor(side);
    const tr = s.base.turrets[idx];
    if (!tr) return false;
    s.base.turrets.splice(idx, 1);
    s.gold += Math.round(tr.def.cost * TURRET_SELL_REFUND);
    if (side === 'player') sfx('spawn');
    this.notify();
    return true;
  }

  canEvolve(side: Side): boolean {
    const s = this.sideFor(side);
    return s.era < s.capEra && s.xp >= EVOLVE_XP[s.era];
  }

  /** Player path: evolving opens the 1-of-2 doctrine pick (sim freezes until
   *  chosen). Enemy path: commander auto-picks and evolves immediately. */
  evolve(side: Side): boolean {
    if (!this.canEvolve(side)) return false;
    const s = this.sideFor(side);
    if (side === 'player') {
      this.pendingDoctrines = this.campaign.doctrines[s.era - 1]; // pair for era s.era+1
      this.notify();
      return true;
    }
    // enemy: pick by personality (aggressive commanders take the aggressive card)
    const pair = this.campaign.doctrines[s.era - 1];
    const wantAggro = ['rusher', 'siegeSpammer', 'boss'].includes(this.commander.id);
    const pick = Math.random() < 0.8
      ? pair.find(d => (d.tag === 'aggressive') === wantAggro) ?? pair[0]
      : pair[(Math.random() * 2) | 0];
    this.applyDoctrine(s, pick);
    this.doctrineToast = { text: `Enemy adopts ${pick.icon} ${pick.name}!`, t: 0 };
    return this.evolveNow(side);
  }

  /** Player's doctrine pick from the overlay → evolve proceeds. */
  chooseDoctrine(d: DoctrineDef): void {
    if (!this.pendingDoctrines) return;
    this.pendingDoctrines = null;
    this.applyDoctrine(this.player, d);
    this.evolveNow('player');
  }

  private applyDoctrine(s: SideState, d: DoctrineDef): void {
    s.doctrines[d.era - 1] = d;
    if (d.rider) {
      s.killGoldMul *= d.rider.killGoldMul ?? 1;
      s.specialCdMul *= d.rider.specialCdMul ?? 1;
      s.supplyBonus += d.rider.supplyBonus ?? 0;
    }
  }

  private evolveNow(side: Side): boolean {
    const s = this.sideFor(side);
    s.xp -= EVOLVE_XP[s.era];
    s.era++;
    const ratio = s.base.hp / s.base.maxHp;
    s.base.maxHp = Math.round(this.campaign.eras[s.era - 1].baseHp * BASE_HP_SCALE * (s.side === 'enemy' ? this.level.baseHpMul : 1));
    s.base.hp = Math.round(s.base.maxHp * Math.max(ratio, 0.5));
    s.supplyCap = supplyCapFor(s.era) + s.supplyBonus;  // troop limit grows each era
    // evolve moment: stinger + tower scale-pop + screen flash (player's is
    // the big cinematic; the enemy's reads smaller with no forced focus)
    sfx('evolve');
    s.base.popT = 0;
    this.evolveFlash = Math.max(this.evolveFlash, side === 'player' ? 0.85 : 0.3);
    this.burst(s.base.x, -120, 14, '#ffe066', 'spark');
    this.notify();
    return true;
  }

  useSpecial(side: Side): boolean {
    const s = this.sideFor(side);
    if (s.specialCd > 0 || this.result) return false;
    const sp = this.campaign.eras[s.era - 1].special;
    s.specialCd = sp.cdSec * s.specialCdMul;
    const foeSide: Side = side === 'player' ? 'enemy' : 'player';
    const foes = this.units.filter(u => u.side === foeSide && u.state !== 'die');
    let cx: number;
    if (foes.length) {
      const front = side === 'player' ? Math.min(...foes.map(u => u.x)) : Math.max(...foes.map(u => u.x));
      cx = clamp(front + (side === 'player' ? sp.radius * 0.4 : -sp.radius * 0.4), LANE_L + 60, LANE_R - 60);
    } else {
      cx = side === 'player' ? LANE_R - 120 : LANE_L + 120;
    }
    // damage lands mid-animation via the fx timer in update()
    this.specialFx.push({ kind: sp.kind, x: cx, radius: sp.radius, t: 0, side });
    if (side === 'player') sfx('boom');
    this.notify();
    return true;
  }

  private applySpecialDamage(fx: SpecialFx): void {
    const s = this.sideFor(fx.side);
    const sp = this.campaign.eras[s.era - 1].special;
    const foeSide: Side = fx.side === 'player' ? 'enemy' : 'player';
    for (const u of this.units) {
      if (u.side !== foeSide || u.state === 'die') continue;
      if (Math.abs(u.x - fx.x) <= fx.radius) this.damageUnit(u, sp.dmg, fx.side);
    }
    const foeBase = this.sideFor(foeSide).base;
    if (Math.abs(foeBase.x - fx.x) <= fx.radius) this.damageBase(foeSide, sp.dmg * 0.4);
    // shake + hit-stop are reserved for THIS moment (specials only)
    this.shake = Math.max(this.shake, 11);
    this.hitStop = Math.max(this.hitStop, 0.055);
    this.burst(fx.x, -40, 26, '#ffb040', 'spark');
    this.burst(fx.x, -10, 14, '#c8b8a0', 'dust');
  }

  /* ------------------------------------------------------------- combat */
  private spawnUnit(side: Side, def: UnitDef): void {
    const s = this.sideFor(side);
    const eff = this.effectiveStats(side, def);
    const u: UnitInstance = {
      uid: this.uidSeq++,
      def, side,
      x: side === 'player' ? LANE_L + 14 : LANE_R - 14,
      hp: eff.hp, maxHp: eff.hp,
      stats: { dmg: eff.dmg, spd: eff.spd, range: eff.range, cdMs: eff.cdMs, aoe: eff.aoe },
      tier: s.tiers[def.id] ?? 0,
      state: 'walk',
      pose: defaultPose(),
      animT: Math.random() * 10,
      walkPhase: Math.random() * Math.PI * 2,
      atkCd: 0, attackT: 0, didImpact: false,
      targetUid: null, targetIsBase: false,
      hitFlash: 0, deadT: 0, prevWeaponAngle: 0,
      kills: 0, veteran: false,
    };
    this.units.push(u);
    s.supply += def.supply;
    this.burst(u.x, -8, 4, '#c8b8a0', 'dust');
  }

  private damageUnit(u: UnitInstance, dmg: number, from: Side, attacker: UnitInstance | null = null): void {
    if (u.state === 'die') return;
    u.hp -= dmg;
    u.hitFlash = 0.25;
    if (u.hp <= 0) {
      u.state = 'die'; u.deadT = 0; u.animT = 0;
      this.hitStop = Math.max(this.hitStop, 0.04);   // killing blow — brief freeze
      const killer = this.sideFor(from);
      const sd = this.sideFor(u.side);
      sd.supply = Math.max(0, sd.supply - u.def.supply);
      // COMBAT-DRIVEN ECONOMY: the kill IS the income.
      let reward = Math.round(u.def.reward * killer.killGoldMul);
      // veterancy: kill credit → threshold unlock → gold bonus (never stats)
      if (attacker && attacker.state !== 'die') {
        attacker.kills++;
        if (!attacker.veteran && attacker.kills >= attacker.def.veterancyThreshold) {
          attacker.veteran = true;
          this.burst(attacker.x, -50 * attacker.def.rig.scale, 6, '#ffd25a', 'spark');
          if (from === 'player') sfx('vet');
        } else if (attacker.veteran) {
          const bonus = Math.round(u.def.reward * VETERAN_GOLD_BONUS);
          reward += bonus;
          if (from === 'player') this.floats.push({ x: u.x, y: -60, t: 0, text: `+${bonus} ★`, color: '#ffe9a0' });
        }
      }
      killer.gold += reward;
      // kill XP (enemy's pace shaped by its commander's evolve aggression)
      killer.xp += Math.round(u.def.xpReward * (from === 'enemy' ? this.commander.evolveAggression : 1));
      // consolation XP: your fallen troops still teach you something
      sd.xp += Math.round(u.def.xpReward * FRIENDLY_DEATH_XP_PCT * (u.side === 'enemy' ? this.commander.evolveAggression : 1));
      if (from === 'player') this.floats.push({ x: u.x, y: -46, t: 0, text: `+${reward}`, color: '#ffd25a' });
      sfx('die');
    }
  }

  private damageBase(side: Side, dmg: number): void {
    const b = this.sideFor(side).base;
    b.hp = Math.max(0, b.hp - dmg);
    b.hitT = 0.2;
    this.burst(b.x, -80, 5, '#ffb040', 'spark');
    if (b.hp <= 0 && !this.result) this.finish(side === 'enemy' ? 'win' : 'lose');
  }

  private finish(result: BattleResult): void {
    this.result = result;
    sfx(result === 'win' ? 'win' : 'lose');
    if (result === 'win') {
      if (this.endless) {
        const next = this.endlessWave + 1;
        if (next > this.save.endlessBest) { this.save.endlessBest = next; writeSave(this.save); }
      } else {
        const cur = this.save.unlocked[this.campaign.id] ?? 0;
        if (this.level.idx + 1 > cur) {
          this.save.unlocked[this.campaign.id] = this.level.idx + 1;
          writeSave(this.save);
        }
      }
    }
    this.notify();
  }

  nextEndlessWave(): void { this.startBattle(this.campaign, this.level, true, this.endlessWave + 1); }

  private burst(x: number, y: number, n: number, color: string, kind: Particle['kind']): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * (kind === 'spark' ? 140 : 50);
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        g: kind === 'dust' ? 60 : 220,
        t: 0, life: kind === 'dust' ? 0.5 + Math.random() * 0.3 : 0.25 + Math.random() * 0.25,
        size: kind === 'dust' ? 2.5 + Math.random() * 2.5 : 1.5 + Math.random() * 2,
        color, kind,
      });
    }
  }

  private frontBlocked(u: UnitInstance): boolean {
    const dir = u.side === 'player' ? 1 : -1;
    for (const o of this.units) {
      if (o === u || o.side !== u.side || o.state === 'die') continue;
      const ahead = (o.x - u.x) * dir;
      if (ahead > 0 && ahead < SPACING) return true;
    }
    return false;
  }

  private findTarget(u: UnitInstance): UnitInstance | null {
    const dir = u.side === 'player' ? 1 : -1;
    let best: UnitInstance | null = null, bd = Infinity;
    for (const o of this.units) {
      if (o.side === u.side || o.state === 'die') continue;
      const d = (o.x - u.x) * dir;
      if (d >= -8 && Math.abs(o.x - u.x) <= u.stats.range && Math.abs(o.x - u.x) < bd) {
        best = o; bd = Math.abs(o.x - u.x);
      }
    }
    return best;
  }

  private fireProjectile(u: UnitInstance, target: UnitInstance | null, isBase: boolean): void {
    const dir = u.side === 'player' ? 1 : -1;
    const foeBase = this.sideFor(u.side === 'player' ? 'enemy' : 'player').base;
    const tx = isBase ? foeBase.x : target!.x;
    const kind = u.def.rig.projKind ?? 'arrow';
    const arc = u.def.role === 'siege' && kind !== 'beam';
    const speed = kind === 'beam' ? 640 : arc ? 250 : 420;
    const dist = Math.abs(tx - u.x);
    const tof = dist / speed;
    const g = arc ? 260 : kind === 'arrow' ? 70 : 0;
    const y0 = u.def.rig.kind === 'flyer' ? -(u.def.rig.hover ?? 26) - 4 : u.def.role === 'siege' ? -20 : -26;
    this.projectiles.push({
      side: u.side,
      x: u.x + dir * 14, y: y0 * u.def.rig.scale,
      vx: dir * speed,
      vy: -0.5 * g * tof,
      gravity: g,
      damage: u.stats.dmg,
      aoe: u.stats.aoe,
      kind,
      targetUid: isBase ? null : target!.uid,
      targetIsBase: isBase,
      sourceUid: u.uid,
      dead: false,
    });
    this.burst(u.x + dir * 16, y0 * u.def.rig.scale, 3, '#fff2b0', 'flash');
    // muzzle smoke: one cheap grey puff drifting up
    this.particles.push({
      x: u.x + dir * 18, y: y0 * u.def.rig.scale, vx: dir * 8, vy: -22,
      g: -18, t: 0, life: 0.3, size: 3, color: '#b8b8b8', kind: 'smoke',
    });
    sfx('shoot');
  }

  /* ------------------------------------------------------------- enemy AI */
  /** Commander personalities re-weight the SAME decision loop (spend/spawn
   *  mix, evolve pace, turret & special investment). The era-window table is
   *  never altered by personality (spec add-on §4). */
  private enemyAI(dt: number): void {
    const E = this.enemy;
    const cmd = this.commander;
    // evolve up the window when XP allows
    if (this.canEvolve('enemy')) this.evolve('enemy');
    // turret buys — type weighted by commander preference; slots bought when rich
    if (E.base.turrets.length < E.base.slots && Math.random() < dt * 0.25 * cmd.turretInvestment) {
      const options = this.campaign.eras[E.era - 1].turrets.filter(td => E.gold > td.cost * 1.4);
      if (options.length) {
        const total = options.reduce((a, td) => a + (cmd.turretPref[td.kind] ?? 1), 0);
        let roll = Math.random() * total;
        let pick = options[0];
        for (const td of options) { roll -= cmd.turretPref[td.kind] ?? 1; if (roll <= 0) { pick = td; break; } }
        this.buyTurret('enemy', pick);
      }
    }
    const slotCost = this.nextSlotCost('enemy');
    if (slotCost != null && E.base.turrets.length >= E.base.slots && E.gold > slotCost * 2.2 && Math.random() < dt * 0.12 * cmd.turretInvestment) {
      this.buySlot('enemy');
    }
    // sell outdated turrets (2+ eras behind) to rebuild with current tech
    const stale = E.base.turrets.findIndex(tr => tr.era <= E.era - 2);
    if (stale >= 0 && Math.random() < dt * 0.1 * cmd.turretInvestment) this.sellTurret('enemy', stale);
    // tier upgrades when gold pools (the Economist and the Warlord love these)
    const tierChance = cmd.id === 'economist' || cmd.boss ? 0.14 : 0.05;
    if (Math.random() < dt * tierChance) {
      const eraUnits = this.campaign.eras[E.era - 1].units;
      const candidate = eraUnits[(Math.random() * eraUnits.length) | 0];
      const cur = E.tiers[candidate.id] ?? 0;
      if (cur < MAX_TIER && E.gold > tierCost(candidate.cost, cur + 1) * 1.8) this.buyTier('enemy', candidate);
    }
    // special usage when there's a push worth resetting
    const playerPush = this.units.filter(u => u.side === 'player' && u.state !== 'die').length;
    if (E.specialCd <= 0 && playerPush >= 4 && Math.random() < dt * 0.35 * cmd.specialAggression) {
      this.useSpecial('enemy');
    }
    // boss commander: keep exactly one boss unit on the field when affordable
    if (cmd.boss) {
      const boss = this.campaign.bossUnit;
      const alive = this.units.some(u => u.side === 'enemy' && u.def.id === boss.id && u.state !== 'die')
        || E.queue.some(q => q.def.id === boss.id);
      if (!alive && E.gold >= boss.cost && E.supply + this.queuedSupply(E) + boss.supply <= E.supplyCap + 2) {
        E.supplyCap = Math.max(E.supplyCap, E.supply + this.queuedSupply(E) + boss.supply);
        this.buyUnit('enemy', boss);
      }
    }
    // spawn loop: role-weighted mix within era window (older eras stay available)
    E.aiSpawnT -= dt;
    if (E.aiSpawnT <= 0) {
      E.aiSpawnT = (lerp(3, 1, clamp(E.aggro / 1.4, 0, 1)) + (Math.random() - 0.4) * 0.6) / cmd.spawnRateMul;
      const startIdx = this.level.startEra - 1;
      const candidates: { def: UnitDef; w: number }[] = [];
      for (let e = startIdx; e < E.era; e++) {
        const eraW = e === E.era - 1 ? 3 : 1;          // current era favored
        for (const d of this.campaign.eras[e].units) {
          if (!this.canBuy('enemy', d)) continue;
          candidates.push({ def: d, w: eraW * (cmd.roleWeights[d.role] ?? 1) });
        }
      }
      if (candidates.length) {
        const total = candidates.reduce((a, c) => a + c.w, 0);
        let roll = Math.random() * total;
        let pick = candidates[0].def;
        for (const cnd of candidates) { roll -= cnd.w; if (roll <= 0) { pick = cnd.def; break; } }
        this.buyUnit('enemy', pick);
      }
    }
  }

  /* ------------------------------------------------------------- update */
  update(dt: number): void {
    if (this.mode !== 'battle' || this.paused || this.result) return;
    // visual timers keep decaying even during hit-stop
    this.shake = Math.max(0, this.shake - dt * 26);
    this.evolveFlash = Math.max(0, this.evolveFlash - dt * 1.4);
    if (this.doctrineToast) { this.doctrineToast.t += dt; if (this.doctrineToast.t > 3) this.doctrineToast = null; }
    // doctrine pick pending → the world holds its breath
    if (this.pendingDoctrines) return;
    // hit-stop: freeze the sim for a couple frames on heavy/lethal impacts
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    this.time += dt;
    const P = this.player, E = this.enemy;

    // COMBAT-DRIVEN ECONOMY: gold & XP come from kills (see damageUnit).
    // This trickle is intentionally tiny — anti-stalemate insurance only.
    P.gold += P.incomePerSec * dt;
    E.gold += E.incomePerSec * dt;
    P.specialCd = Math.max(0, P.specialCd - dt);
    E.specialCd = Math.max(0, E.specialCd - dt);
    P.base.hitT = Math.max(0, P.base.hitT - dt);
    E.base.hitT = Math.max(0, E.base.hitT - dt);
    P.base.popT += dt; E.base.popT += dt;

    // spawn queues
    for (const s of [P, E]) {
      s.spawnCd -= dt;
      if (s.queue.length && s.spawnCd <= 0) {
        const q = s.queue.shift()!;
        this.spawnUnit(s.side, q.def);
        s.spawnCd = SPAWN_COOLDOWN;
      }
    }

    this.enemyAI(dt);

    // units
    for (const u of this.units) {
      u.animT += dt;
      u.hitFlash = Math.max(0, u.hitFlash - dt);
      if (u.state === 'die') { u.deadT += dt; updatePose(u, dt); continue; }

      const foeSide: Side = u.side === 'player' ? 'enemy' : 'player';
      const foeBase = this.sideFor(foeSide).base;
      const dir = u.side === 'player' ? 1 : -1;
      const target = this.findTarget(u);
      const baseInRange = foeBase.hp > 0 && Math.abs(foeBase.x - u.x) <= u.stats.range;

      if (u.state === 'attack') {
        const cycle = Math.max(0.45, u.stats.cdMs / 1000);
        u.attackT += dt / cycle;
        // impact frame — apply damage exactly once per cycle
        if (!u.didImpact && u.attackT >= ATK_IMPACT) {
          u.didImpact = true;
          const isRangedLike = u.def.role === 'ranged' || u.def.role === 'siege' || u.def.rig.projKind !== undefined;
          const tgt = u.targetUid != null ? this.units.find(o => o.uid === u.targetUid && o.state !== 'die') ?? null : null;
          if (u.targetIsBase && baseInRange) {
            if (isRangedLike && Math.abs(foeBase.x - u.x) > 60) this.fireProjectile(u, null, true);
            else { this.damageBase(foeSide, u.stats.dmg); this.burst(foeBase.x - dir * 8, -60, 5, '#ffd25a', 'spark'); sfx('hit'); }
          } else if (tgt && Math.abs(tgt.x - u.x) <= u.stats.range + 10) {
            if (isRangedLike && Math.abs(tgt.x - u.x) > 60) this.fireProjectile(u, tgt, false);
            else {
              this.damageUnit(tgt, u.stats.dmg, u.side, u);
              this.burst((u.x + tgt.x) / 2, -24 * u.def.rig.scale, 6, '#ffe08a', 'spark');
              if (u.def.role === 'siege' || u.def.role === 'tank') {
                // heavy bash: dust + a touch of hit-stop (NO screen shake here)
                this.burst((u.x + tgt.x) / 2, -6, 5, '#c8b8a0', 'dust');
                this.hitStop = Math.max(this.hitStop, 0.035);
              }
              sfx('hit');
            }
          }
        }
        if (u.attackT >= 1) {
          // re-target and either restart the cycle or go back to walking
          const nt = this.findTarget(u);
          if (nt) { u.targetUid = nt.uid; u.targetIsBase = false; u.attackT = 0; u.didImpact = false; }
          else if (baseInRange) { u.targetUid = null; u.targetIsBase = true; u.attackT = 0; u.didImpact = false; }
          else { u.state = 'walk'; u.attackT = 0; u.didImpact = false; }
        }
      } else {
        if (target) { u.state = 'attack'; u.targetUid = target.uid; u.targetIsBase = false; u.attackT = 0; u.didImpact = false; }
        else if (baseInRange && !this.frontBlocked(u)) { u.state = 'attack'; u.targetUid = null; u.targetIsBase = true; u.attackT = 0; u.didImpact = false; }
        else if (!this.frontBlocked(u)) {
          u.state = 'walk';
          u.x += dir * u.stats.spd * dt;
          u.x = clamp(u.x, LANE_L - 6, LANE_R + 6);
          u.walkPhase += dt * u.stats.spd * 0.12;
          if (Math.random() < dt * 6 && u.def.rig.kind !== 'flyer') {
            this.particles.push({
              x: u.x - dir * 8, y: -2, vx: -dir * 12 + (Math.random() - 0.5) * 14, vy: -14 - Math.random() * 16,
              g: 50, t: 0, life: 0.4 + Math.random() * 0.25, size: 2 + Math.random() * 2.4, color: '#c8b8a0', kind: 'dust',
            });
          }
        } else {
          u.state = 'wait';
        }
      }
      updatePose(u, dt);
    }
    this.units = this.units.filter(u => u.state !== 'die' || u.deadT < 0.75);

    // projectiles
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const foeSide: Side = p.side === 'player' ? 'enemy' : 'player';
      const foeBase = this.sideFor(foeSide).base;
      // resolve on reaching target x or the ground
      let hitX: number | null = null;
      if (p.targetIsBase && (foeBase.x - p.x) * Math.sign(p.vx) <= 0) hitX = foeBase.x;
      else if (!p.targetIsBase) {
        const tgt = p.targetUid != null ? this.units.find(o => o.uid === p.targetUid && o.state !== 'die') : null;
        const tx = tgt ? tgt.x : null;
        if (tx != null && (tx - p.x) * Math.sign(p.vx) <= 0) hitX = tx;
      }
      if (p.y >= -2) hitX = hitX ?? p.x;               // arced shot landed
      if (Math.abs(p.x - foeBase.x) < 8) hitX = hitX ?? p.x; // reached the wall
      if (hitX == null) continue;

      p.dead = true;
      const shooter = p.sourceUid != null ? this.units.find(o => o.uid === p.sourceUid && o.state !== 'die') ?? null : null;
      if (p.aoe > 0) {
        for (const o of this.units) {
          if (o.side !== foeSide || o.state === 'die') continue;
          if (Math.abs(o.x - hitX) <= p.aoe) this.damageUnit(o, p.damage, p.side, shooter);
        }
        if (Math.abs(foeBase.x - hitX) <= p.aoe + 10) this.damageBase(foeSide, p.damage * 0.8);
        // siege impact: dust + brief hit-stop (screen shake stays specials-only)
        this.burst(hitX, -14, 10, '#ffb040', 'spark');
        this.burst(hitX, -4, 8, '#c8b8a0', 'dust');
        this.hitStop = Math.max(this.hitStop, 0.04);
      } else {
        const tgt = p.targetUid != null ? this.units.find(o => o.uid === p.targetUid && o.state !== 'die') : null;
        if (p.targetIsBase) this.damageBase(foeSide, p.damage);
        else if (tgt) this.damageUnit(tgt, p.damage, p.side, shooter);
        this.burst(hitX, p.y, 4, '#ffe08a', 'spark');
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);

    // turrets — each fires per its own def (rapid / splash-AoE / sniper)
    for (const s of [P, E]) {
      for (const tr of s.base.turrets) {
        tr.cd -= dt * 1000;
        if (tr.cd > 0) continue;
        let best: UnitInstance | null = null, bd = Infinity;
        for (const o of this.units) {
          if (o.side === s.side || o.state === 'die') continue;
          const d = Math.abs(o.x - s.base.x);
          if (d <= tr.def.range && d < bd) { best = o; bd = d; }
        }
        if (best) {
          tr.cd = tr.def.cooldownMs;
          const dir = s.side === 'player' ? 1 : -1;
          const arc = tr.def.kind === 'heavy';
          const speed = tr.def.kind === 'sniper' ? 760 : arc ? 300 : 540;
          const tof = Math.abs(best.x - s.base.x) / speed;
          this.projectiles.push({
            side: s.side, x: s.base.x + dir * 10, y: -105,
            vx: dir * speed,
            vy: arc ? -0.5 * 260 * tof + 30 : 30,
            gravity: arc ? 260 : 0,
            damage: tr.def.damage, aoe: tr.def.aoe, kind: tr.def.proj,
            targetUid: best.uid, targetIsBase: false, sourceUid: null, dead: false,
          });
          sfx('shoot');
        }
      }
    }

    // special fx: damage lands mid-animation
    for (const fx of this.specialFx) {
      const before = fx.t;
      fx.t += dt;
      if (before < 0.55 && fx.t >= 0.55) this.applySpecialDamage(fx);
    }
    this.specialFx = this.specialFx.filter(fx => fx.t < 1.4);

    // particles / floats / shake
    for (const pa of this.particles) { pa.t += dt; pa.vy += pa.g * dt; pa.x += pa.vx * dt; pa.y += pa.vy * dt; }
    this.particles = this.particles.filter(pa => pa.t < pa.life);
    for (const f of this.floats) { f.t += dt; f.y -= 26 * dt; }
    this.floats = this.floats.filter(f => f.t < 0.9);
  }
}

export const engine = new Engine();
