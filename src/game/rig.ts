/** Skeletal rig system (spec §1).
 *
 *  Every unit is drawn from layered body parts on a bone rig. Each animation
 *  state defines TARGET pose angles; every frame the current pose interpolates
 *  toward the target (`current += (target-current)*k`) — never snapped.
 *  Attacks are phased: anticipation → strike → impact → recovery. The weapon
 *  is its own bone; damage is applied by the engine at the impact frame.
 */
import { BonePose, UnitInstance, RigConfig } from './types';
import { seg, rrS, cirS, polyS, shade, groundShadow, swingTrail, boneEnd, pt, Pt, TAU, clamp, lerp } from './primitives';

/* ---------------------------------------------------------------- phases */
export const ATK_ANTICIPATION_END = 0.42;
export const ATK_IMPACT = 0.55;

export function defaultPose(): BonePose {
  return {
    lean: 0, bob: 0, lunge: 0,
    thighF: 0.12, shinF: -0.06, thighB: -0.12, shinB: 0.1,
    armUF: 0.35, armLF: 0.25, armUB: -0.3, armLB: 0.2,
    weapon: -0.5, head: 0, aux: 0, aux2: 0, fall: 0,
  };
}

/* ------------------------------------------------- target-pose authoring */

function walkTargets(u: UnitInstance, tgt: BonePose): void {
  const p = u.walkPhase;
  const s = Math.sin(p), c = Math.sin(p + Math.PI);
  const amp = u.def.role === 'fast' ? 0.85 : u.def.role === 'tank' ? 0.45 : 0.65;
  tgt.thighF = s * amp;
  tgt.shinF = Math.max(0, -s) * amp * 1.1 - 0.08;
  tgt.thighB = c * amp;
  tgt.shinB = Math.max(0, -c) * amp * 1.1 - 0.08;
  tgt.armUF = c * amp * 0.55 + 0.15;
  tgt.armLF = 0.35;
  tgt.armUB = s * amp * 0.55 - 0.15;
  tgt.armLB = 0.35;
  tgt.bob = Math.abs(Math.sin(p)) * 1.8;
  tgt.lean = 0.1;
  tgt.weapon = -0.55;
  tgt.aux = Math.sin(p) * 0.2;          // beast tail / flyer flap idles along
}

/** Phased attack targets. Returns interpolation-k override for the whip. */
function attackTargets(u: UnitInstance, tgt: BonePose): number {
  const t = u.attackT;
  const role = u.def.role;
  let k = 0.18;
  tgt.bob = 0;

  if (role === 'ranged') {
    // draw → loose → recover. aux = bow flex, aux2 = string draw.
    if (t < ATK_IMPACT) {
      const d = t / ATK_IMPACT;
      tgt.armUF = -1.15; tgt.armLF = 0.1;             // bow arm raised level
      tgt.armUB = -1.15 + d * 0.35; tgt.armLB = 0.9 * d; // draw hand pulls back
      tgt.aux = d; tgt.aux2 = d;
      tgt.lean = 0.06; tgt.weapon = 0;
    } else {
      tgt.armUF = -1.15; tgt.armLF = 0.1;
      tgt.armUB = -0.7; tgt.armLB = 0.2;
      tgt.aux = 0; tgt.aux2 = 0;
      k = 0.5;                                        // string snaps forward
    }
    return k;
  }

  if (role === 'siege') {
    // slow heavy wind-up, big release. aux drives the siege arm / neck.
    if (t < ATK_ANTICIPATION_END) { tgt.aux = -1; tgt.lean = -0.08; tgt.aux2 = 0; }
    else if (t < 0.75) { tgt.aux = 1; tgt.lean = 0.14; tgt.aux2 = t < 0.62 ? 1 : 0; k = 0.4; }
    else { tgt.aux = 0; tgt.lean = 0; k = 0.12; }
    tgt.armUF = tgt.aux * 0.4 - 0.4; tgt.armLF = 0.3;
    return k;
  }

  // melee / fast / tank — weapon slash with anticipation → whip → recovery.
  if (t < ATK_ANTICIPATION_END) {
    // wind-up: coil back, weapon raised behind head
    tgt.lean = -0.16; tgt.lunge = -2.5;
    tgt.armUF = -2.3; tgt.armLF = -0.5;
    tgt.weapon = -1.1;
    tgt.thighF = 0.35; tgt.thighB = -0.3;
    tgt.aux = -1;
  } else if (t < 0.7) {
    // strike: whip through with a fast k
    tgt.lean = 0.32; tgt.lunge = 5;
    tgt.armUF = -0.15; tgt.armLF = 0.55;
    tgt.weapon = 0.75;
    tgt.thighF = -0.15; tgt.thighB = 0.4;
    tgt.aux = 1;
    k = role === 'fast' ? 0.65 : role === 'tank' ? 0.4 : 0.55;
  } else {
    tgt.lean = 0.05; tgt.lunge = 0;
    tgt.armUF = 0.3; tgt.armLF = 0.25; tgt.weapon = -0.5;
    tgt.aux = 0;
    k = 0.14;
  }
  return k;
}

/** Advance a unit's pose one frame toward its state's target pose. */
export function updatePose(u: UnitInstance, dt: number): void {
  const tgt = { ...u.pose };
  let k = 0.22;

  if (u.state === 'die') {
    tgt.fall = 1; tgt.lean = -1.2; tgt.bob = -6;
    tgt.armUF = -1.5; tgt.armUB = -1.2; tgt.weapon = -0.3;
    k = 0.14;
  } else if (u.state === 'attack') {
    Object.assign(tgt, u.pose);
    const base = defaultPose();
    // start from a neutral stance then let attackTargets override
    tgt.thighF = 0.18; tgt.shinF = -0.05; tgt.thighB = -0.18; tgt.shinB = 0.08;
    tgt.armUB = base.armUB; tgt.armLB = base.armLB;
    tgt.lunge = 0; tgt.head = 0;
    k = attackTargets(u, tgt);
  } else if (u.state === 'walk') {
    walkTargets(u, tgt);
  } else { // wait
    const base = defaultPose();
    Object.assign(tgt, base);
    tgt.bob = Math.sin(u.animT * 2.2) * 0.8;   // breathing
  }

  const p = u.pose;
  const kk = clamp(k * (dt * 60), 0, 1);       // frame-rate independent-ish
  for (const key of Object.keys(p) as (keyof BonePose)[]) {
    p[key] += (tgt[key] - p[key]) * kk;
  }
}

/* ================================================================ DRAWING */

const DOWN = Math.PI / 2, UP = -Math.PI / 2;

interface Ctx2D extends CanvasRenderingContext2D {}

/** Draw a unit. Handles facing flip, scale, death fade. `ux` is world x. */
export function drawUnit(ctx: Ctx2D, u: UnitInstance, ux: number, groundY: number, worldScale: number): void {
  const rig = u.def.rig;
  const dir = u.side === 'player' ? 1 : -1;
  const s = rig.scale * worldScale;
  const pose = u.pose;
  const dieFade = u.state === 'die' ? clamp(1 - u.deadT / 0.7, 0, 1) : 1;

  groundShadow(ctx, ux + pose.lunge * dir * s * 0.3, groundY, 13 * s * (rig.kind === 'flyer' ? 0.7 : 1), 0.26 * dieFade);

  ctx.save();
  ctx.translate(ux + pose.lunge * dir * s, groundY);
  ctx.scale(dir * s, s);
  ctx.globalAlpha = dieFade;
  if (u.state === 'die') {
    ctx.rotate(-pose.fall * 1.35);
    ctx.translate(0, pose.fall * 4);
  }
  if (u.hitFlash > 0.02) ctx.globalAlpha = dieFade * (0.55 + 0.45 * Math.abs(Math.sin(u.hitFlash * 40)));

  switch (rig.kind) {
    case 'biped': drawBiped(ctx, u, rig); break;
    case 'rider': drawRider(ctx, u, rig); break;
    case 'wheeled': drawWheeled(ctx, u, rig); break;
    case 'vehicle': drawVehicle(ctx, u, rig); break;
    case 'flyer': drawFlyer(ctx, u, rig); break;
    case 'beast': drawBeast(ctx, u, rig); break;
  }
  ctx.restore();
}

/* ------------------------------------------------------------- weapons */

function drawWeapon(ctx: Ctx2D, hand: Pt, absAng: number, rig: RigConfig, u: UnitInstance): void {
  const w = rig.weaponKind, col = rig.weapon;
  const striking = u.state === 'attack' && u.attackT >= ATK_ANTICIPATION_END && u.attackT < 0.7 && u.def.role !== 'ranged' && u.def.role !== 'siege';
  if (striking && w !== 'none' && w !== 'fist') {
    swingTrail(ctx, pt(hand.x - 3, hand.y - 2), 4, 15, absAng - 1.6, absAng + 0.25, '#ffffff');
  }
  switch (w) {
    case 'club': {
      const end = boneEnd(hand, absAng, 12);
      seg(ctx, hand, end, col, 3.4);
      cirS(ctx, end.x, end.y, 3.4, col);
      break;
    }
    case 'axe': {
      const end = boneEnd(hand, absAng, 12);
      seg(ctx, hand, end, '#8a6a3c', 2.4);
      const n = absAng + Math.PI / 2;
      polyS(ctx, [
        boneEnd(end, n, 4), boneEnd(boneEnd(end, absAng, 3), n, 6),
        boneEnd(boneEnd(end, absAng, 4), n, -1), boneEnd(end, n, -3),
      ], col);
      break;
    }
    case 'sword': {
      const end = boneEnd(hand, absAng, 15);
      const guard = boneEnd(hand, absAng, 3.5);
      seg(ctx, guard, end, col, 2.6);
      seg(ctx, boneEnd(guard, absAng + Math.PI / 2, 3), boneEnd(guard, absAng - Math.PI / 2, 3), '#7c6a34', 2.2);
      break;
    }
    case 'rapier': {
      const end = boneEnd(hand, absAng, 16);
      seg(ctx, hand, end, col, 1.6);
      cirS(ctx, hand.x, hand.y, 2.4, '#7c6a34', 1.4);
      break;
    }
    case 'spear': {
      const back = boneEnd(hand, absAng + Math.PI, 7);
      const end = boneEnd(hand, absAng, 15);
      seg(ctx, back, end, '#8a6a3c', 2);
      polyS(ctx, [boneEnd(end, absAng, 4), boneEnd(end, absAng + 2.5, 3), boneEnd(end, absAng - 2.5, 3)], col);
      break;
    }
    case 'hammer': {
      const end = boneEnd(hand, absAng, 11);
      seg(ctx, hand, end, '#8a6a3c', 2.6);
      ctx.save(); ctx.translate(end.x, end.y); ctx.rotate(absAng);
      rrS(ctx, -3, -4.5, 6, 9, 1.5, col);
      ctx.restore();
      break;
    }
    case 'sling': {
      const end = boneEnd(hand, absAng, 8);
      seg(ctx, hand, end, col, 1.6);
      if (u.state === 'attack' && u.attackT < ATK_IMPACT) cirS(ctx, end.x, end.y, 2.2, '#9a9aa5', 1.4);
      break;
    }
    case 'bow': {
      // bow flexes with pose.aux; string pulled by aux2
      const flex = 0.55 + u.pose.aux * 0.4;
      const top = boneEnd(hand, absAng - flex, 11);
      const bot = boneEnd(hand, absAng + flex, 11);
      ctx.strokeStyle = '#101014'; ctx.lineWidth = 4.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bot.x, bot.y); ctx.quadraticCurveTo(hand.x + Math.cos(absAng) * 7, hand.y + Math.sin(absAng) * 7, top.x, top.y); ctx.stroke();
      ctx.strokeStyle = rig.weapon; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(bot.x, bot.y); ctx.quadraticCurveTo(hand.x + Math.cos(absAng) * 7, hand.y + Math.sin(absAng) * 7, top.x, top.y); ctx.stroke();
      const pull = boneEnd(hand, absAng + Math.PI, 2 + u.pose.aux2 * 7);
      ctx.strokeStyle = '#e8e0c8'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(pull.x, pull.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
      if (u.state === 'attack' && u.attackT < ATK_IMPACT) seg(ctx, pull, boneEnd(pull, absAng, 12), '#c8b48a', 1.4);
      break;
    }
    case 'crossbow': {
      ctx.save(); ctx.translate(hand.x, hand.y); ctx.rotate(absAng);
      rrS(ctx, -4, -1.8, 13, 3.6, 1.4, '#8a6a3c');
      seg(ctx, pt(7, -5), pt(7, 5), rig.weapon, 2);
      if (u.state === 'attack' && u.attackT < ATK_IMPACT) seg(ctx, pt(-2 - u.pose.aux2 * 4, 0), pt(9, 0), '#c8b48a', 1.4);
      ctx.restore();
      break;
    }
    case 'rifle': {
      ctx.save(); ctx.translate(hand.x, hand.y); ctx.rotate(absAng);
      rrS(ctx, -6, -1.6, 10, 3.4, 1.2, col);
      seg(ctx, pt(4, -0.4), pt(14, -0.4), shade(col, -0.15), 2.2);
      polyS(ctx, [pt(-6, 1), pt(-9, 5), pt(-6.5, 5.5), pt(-4, 1.6)], shade(col, -0.25), 1.6);
      ctx.restore();
      break;
    }
    case 'pistol': {
      ctx.save(); ctx.translate(hand.x, hand.y); ctx.rotate(absAng);
      rrS(ctx, -1, -1.6, 8, 3, 1.2, col);
      rrS(ctx, -1.6, 0.5, 3, 4.5, 1, shade(col, -0.25));
      ctx.restore();
      break;
    }
    case 'staff': {
      const top = boneEnd(hand, absAng, 15);
      const bot = boneEnd(hand, absAng + Math.PI, 9);
      seg(ctx, bot, top, '#6a5030', 2.2);
      cirS(ctx, top.x, top.y, 3.6, col);
      ctx.save(); ctx.globalAlpha = 0.4 + 0.25 * Math.sin(u.animT * 6);
      cirS(ctx, top.x, top.y, 5.6, col, 0); ctx.restore();
      break;
    }
    case 'wand': {
      const end = boneEnd(hand, absAng, 9);
      seg(ctx, hand, end, '#6a5030', 1.8);
      cirS(ctx, end.x, end.y, 2.2, col, 1.4);
      break;
    }
    case 'orb': {
      const o = boneEnd(hand, absAng, 6);
      cirS(ctx, o.x, o.y, 4, col);
      break;
    }
    case 'fist': cirS(ctx, hand.x, hand.y, 3.2 * (rig.bulk ?? 1), rig.skin, 1.8); break;
    case 'none': break;
  }
}

function drawHelmet(ctx: Ctx2D, hx: number, hy: number, r: number, rig: RigConfig): void {
  const col = rig.trim;
  switch (rig.helmet ?? 'none') {
    case 'cap':
      ctx.beginPath(); ctx.arc(hx, hy - 1, r + 0.8, Math.PI, 0);
      ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#101014'; ctx.lineWidth = 1.8; ctx.stroke();
      break;
    case 'kettle':
      ctx.beginPath(); ctx.arc(hx, hy - 1.5, r + 0.6, Math.PI, 0); ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = '#101014'; ctx.lineWidth = 1.8; ctx.stroke();
      seg(ctx, pt(hx - r - 3, hy - 1.5), pt(hx + r + 3, hy - 1.5), col, 2);
      break;
    case 'knight':
      rrS(ctx, hx - r - 0.5, hy - r - 1, (r + 0.5) * 2, r * 1.7, 2.5, col);
      seg(ctx, pt(hx + r * 0.2, hy - 1), pt(hx + r + 1, hy - 1), '#101014', 1.4);
      polyS(ctx, [pt(hx - 1, hy - r - 1), pt(hx - 4, hy - r - 7), pt(hx + 1, hy - r - 2)], '#d04a4a', 1.4);
      break;
    case 'horns':
      ctx.beginPath(); ctx.arc(hx, hy - 1, r + 0.8, Math.PI, 0); ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = '#101014'; ctx.lineWidth = 1.8; ctx.stroke();
      polyS(ctx, [pt(hx - r, hy - 2), pt(hx - r - 4, hy - 8), pt(hx - r + 2, hy - 4)], '#e8e0c8', 1.4);
      polyS(ctx, [pt(hx + r, hy - 2), pt(hx + r + 4, hy - 8), pt(hx + r - 2, hy - 4)], '#e8e0c8', 1.4);
      break;
    case 'hood':
      polyS(ctx, [pt(hx - r - 1.5, hy + 2), pt(hx - r + 1, hy - r - 2), pt(hx + 2, hy - r - 3.5), pt(hx + r + 1, hy - r + 1), pt(hx + r, hy + 2)], col, 1.8);
      break;
    case 'crown':
      polyS(ctx, [pt(hx - r + 1, hy - r + 1), pt(hx - r + 1, hy - r - 3), pt(hx - 2, hy - r), pt(hx, hy - r - 4), pt(hx + 2, hy - r), pt(hx + r - 1, hy - r - 3), pt(hx + r - 1, hy - r + 1)], '#f0c040', 1.4);
      break;
    case 'antenna':
      seg(ctx, pt(hx, hy - r), pt(hx, hy - r - 5), col, 1.2);
      cirS(ctx, hx, hy - r - 5.5, 1.6, '#ff5a5a', 1.2);
      break;
    case 'visor':
      rrS(ctx, hx - r, hy - 2.5, r * 2, 3.4, 1.6, col, 1.6);
      break;
    case 'wizard':
      polyS(ctx, [pt(hx - r - 3, hy - r + 3), pt(hx + r + 3, hy - r + 3), pt(hx + 1, hy - r - 9)], col, 1.8);
      break;
  }
}

/* -------------------------------------------------------------- biped */

function drawBiped(ctx: Ctx2D, u: UnitInstance, rig: RigConfig): void {
  const p = u.pose;
  const bulk = rig.bulk ?? 1;
  const legH = 16, torsoH = 13 + bulk * 1.5, headR = 5;
  const pelvis = pt(0, -legH - p.bob);

  const legW = 4 * bulk, armW = 3.2 * bulk;
  // back leg
  const kneeB = boneEnd(pelvis, DOWN + p.thighB, 8.5);
  const footB = boneEnd(kneeB, DOWN + p.thighB + p.shinB, 8.5);
  seg(ctx, pelvis, kneeB, shade(rig.trim, -0.25), legW);
  seg(ctx, kneeB, footB, shade(rig.trim, -0.25), legW);
  // back arm behind torso
  const shoulder = boneEnd(pelvis, UP + p.lean, torsoH);
  const elbowB = boneEnd(shoulder, DOWN + p.armUB, 7);
  const handB = boneEnd(elbowB, DOWN + p.armUB + p.armLB, 7);
  seg(ctx, shoulder, elbowB, shade(rig.body, -0.3), armW);
  seg(ctx, elbowB, handB, shade(rig.skin, -0.25), armW * 0.85);
  if (rig.shield) {
    ctx.save(); ctx.translate(handB.x + 3, handB.y); ctx.rotate(0.1);
    rrS(ctx, -1.5, -8, 6.5 * bulk, 16 * bulk, 3, rig.trim);
    cirS(ctx, 1.6, 0, 1.6, shade(rig.trim, 0.35), 1.2);
    ctx.restore();
  }
  // torso
  seg(ctx, pelvis, shoulder, rig.body, 7.5 * bulk);
  if (bulk > 1.5) rrS(ctx, pelvis.x - 5 * bulk, shoulder.y - 2, 10 * bulk, torsoH * 0.85, 3.5, rig.body); // chest plate for heavies
  // head
  const headC = boneEnd(shoulder, UP + p.lean + p.head, headR + 2.5);
  cirS(ctx, headC.x, headC.y, headR, rig.skin);
  drawHelmet(ctx, headC.x, headC.y, headR, rig);
  // front leg
  const kneeF = boneEnd(pelvis, DOWN + p.thighF, 8.5);
  const footF = boneEnd(kneeF, DOWN + p.thighF + p.shinF, 8.5);
  seg(ctx, pelvis, kneeF, rig.trim, legW);
  seg(ctx, kneeF, footF, rig.trim, legW);
  // front (weapon) arm on top
  const elbowF = boneEnd(shoulder, DOWN + p.armUF, 7);
  const handF = boneEnd(elbowF, DOWN + p.armUF + p.armLF, 7);
  seg(ctx, shoulder, elbowF, rig.body, armW);
  seg(ctx, elbowF, handF, rig.skin, armW * 0.85);
  // Aimed weapons (bows, guns) are held level regardless of role; swung
  // weapons continue from the forearm plus the swinging weapon-bone offset.
  const AIMED: Partial<Record<RigConfig['weaponKind'], boolean>> = { bow: true, crossbow: true, rifle: true, pistol: true, sling: true };
  const forearmAbs = DOWN + p.armUF + p.armLF;
  const wAbs = u.def.role === 'ranged' || AIMED[rig.weaponKind]
    ? -0.08 + p.lean * 0.4
    : forearmAbs + p.weapon - DOWN + 0.35;
  drawWeapon(ctx, handF, wAbs, rig, u);
}

/* -------------------------------------------------------------- rider */

function drawRider(ctx: Ctx2D, u: UnitInstance, rig: RigConfig): void {
  const p = u.pose;
  const bodyY = -14 - p.bob;
  const trot = u.walkPhase;
  // 4 mount legs (paired diagonal trot)
  for (const [ox, ph, back] of [[-8, 0, true], [6, Math.PI, true], [-6, Math.PI, false], [8, 0, false]] as [number, number, boolean][]) {
    const sw = u.state === 'walk' ? Math.sin(trot + ph) * 0.6 : 0.05;
    const hip = pt(ox, bodyY + 4);
    const knee = boneEnd(hip, DOWN + sw, 5.5);
    const foot = boneEnd(knee, DOWN + sw * 0.5, 5.5);
    const c = back ? shade(rig.body, -0.3) : shade(rig.body, -0.1);
    seg(ctx, hip, knee, c, 3.4); seg(ctx, knee, foot, c, 3);
  }
  // body
  rrS(ctx, -13, bodyY - 5, 26, 11, 5, rig.body);
  // tail
  const tail = rig.headStyle === 'rat'
    ? boneEnd(pt(-13, bodyY - 2), Math.PI - 0.5 + Math.sin(u.animT * 4) * 0.3, 10)
    : boneEnd(pt(-13, bodyY - 3), Math.PI - 1 + Math.sin(u.animT * 3) * 0.2, 5);
  seg(ctx, pt(-13, bodyY - 2), tail, shade(rig.body, -0.2), rig.headStyle === 'rat' ? 1.6 : 2.4);
  // head + style
  const headB = pt(13, bodyY - 4);
  const lungeHead = u.state === 'attack' && p.aux > 0 ? 2.5 : 0;
  const hs = rig.headStyle ?? 'boar';
  if (hs === 'horse' || hs === 'stag') {
    const neckTop = boneEnd(headB, -1.1, 8);
    seg(ctx, headB, neckTop, rig.body, 5);
    const nose = boneEnd(neckTop, 0.25, 7 + lungeHead);
    seg(ctx, neckTop, nose, rig.body, 4);
    cirS(ctx, neckTop.x, neckTop.y - 1, 3.2, rig.body, 1.6);
    if (hs === 'stag') {
      polyS(ctx, [pt(neckTop.x - 1, neckTop.y - 4), pt(neckTop.x - 6, neckTop.y - 12), pt(neckTop.x - 2, neckTop.y - 5)], '#e0d6b8', 1.4);
      polyS(ctx, [pt(neckTop.x + 1, neckTop.y - 4), pt(neckTop.x + 4, neckTop.y - 12), pt(neckTop.x + 3, neckTop.y - 5)], '#e0d6b8', 1.4);
    } else {
      polyS(ctx, [pt(neckTop.x - 3, neckTop.y - 3), pt(headB.x - 2, headB.y - 3), pt(headB.x + 1, headB.y)], shade(rig.trim, -0.1), 1.4); // mane
    }
  } else { // boar / rat
    const snout = boneEnd(pt(13 + lungeHead, bodyY - 3), 0.15, 7);
    cirS(ctx, 13 + lungeHead, bodyY - 4, 4.5, rig.body, 1.8);
    seg(ctx, pt(13 + lungeHead, bodyY - 3), snout, rig.body, 3.4);
    if (hs === 'boar') {
      seg(ctx, pt(snout.x - 1, snout.y + 1), pt(snout.x + 2, snout.y - 3), '#f0ead0', 1.6); // tusk
    }
    cirS(ctx, 14 + lungeHead, bodyY - 6.5, 1.1, '#101014', 0);
    polyS(ctx, [pt(11 + lungeHead, bodyY - 8), pt(13 + lungeHead, bodyY - 12), pt(15 + lungeHead, bodyY - 8)], rig.body, 1.4); // ear
  }
  // rider (mini biped upper body)
  const seat = pt(-2, bodyY - 5);
  const rShoulder = boneEnd(seat, UP + p.lean, 9);
  const rElbow = boneEnd(rShoulder, DOWN + p.armUF, 5);
  const rHand = boneEnd(rElbow, DOWN + p.armUF + p.armLF, 5);
  seg(ctx, seat, rShoulder, rig.trim, 5);
  const rHead = boneEnd(rShoulder, UP + p.lean, 6);
  cirS(ctx, rHead.x, rHead.y, 3.8, rig.skin);
  drawHelmet(ctx, rHead.x, rHead.y, 3.8, rig);
  seg(ctx, rShoulder, rElbow, rig.trim, 2.6);
  seg(ctx, rElbow, rHand, rig.skin, 2.2);
  drawWeapon(ctx, rHand, DOWN + p.armUF + p.armLF + p.weapon - DOWN + 0.35, rig, u);
}

/* ------------------------------------------------------------- wheeled */

function drawWheel(ctx: Ctx2D, x: number, y: number, r: number, rot: number, col: string): void {
  cirS(ctx, x, y, r, col);
  for (let i = 0; i < 3; i++) {
    const a = rot + (i * TAU) / 3;
    seg(ctx, pt(x, y), boneEnd(pt(x, y), a, r - 1.6), shade(col, -0.35), 1.6);
  }
  cirS(ctx, x, y, 1.8, shade(col, -0.3), 1.2);
}

function drawWheeled(ctx: Ctx2D, u: UnitInstance, rig: RigConfig): void {
  const p = u.pose;
  const rot = u.walkPhase * 0.8;
  const wy = -5.5, wr = 5.5;
  const arm = rig.siegeArm ?? 'catapult';

  if (arm === 'catapult') {
    drawWheel(ctx, -9, wy, wr, rot, rig.trim);
    rrS(ctx, -14, -12, 28, 6, 2.5, rig.body);
    // throwing arm: pose.aux -1 (cranked back) → +1 (released fwd)
    const pivot = pt(-4, -12);
    const armAng = lerp(-2.6, -0.55, (p.aux + 1) / 2);
    const tip = boneEnd(pivot, armAng, 19);
    seg(ctx, pivot, tip, rig.weapon, 3.4);
    ctx.beginPath(); ctx.arc(tip.x, tip.y, 3.4, armAng + 2.6, armAng + 6.2); // sling cup
    ctx.strokeStyle = '#101014'; ctx.lineWidth = 2.4; ctx.stroke();
    if (u.state === 'attack' && u.attackT < ATK_IMPACT) cirS(ctx, tip.x, tip.y - 1, 2.6, '#9a9aa5', 1.4);
    rrS(ctx, 2, -18, 7, 8, 2, shade(rig.body, -0.2));  // counterweight
    drawWheel(ctx, 9, wy, wr, rot, rig.trim);
  } else if (arm === 'ballista') {
    drawWheel(ctx, -8, wy, wr, rot, rig.trim);
    rrS(ctx, -13, -11, 26, 5.5, 2.5, rig.body);
    ctx.save(); ctx.translate(0, -13); ctx.rotate(-0.28);
    rrS(ctx, -9, -1.6, 22, 3.4, 1.4, rig.body);
    const flex = 0.5 + p.aux2 * 0.35;
    const t1 = boneEnd(pt(9, 0), -flex - DOWN + 0.6, 9), t2 = boneEnd(pt(9, 0), flex + DOWN - 0.6, 9);
    seg(ctx, pt(9, 0), t1, rig.weapon, 2.2); seg(ctx, pt(9, 0), t2, rig.weapon, 2.2);
    ctx.strokeStyle = '#e8e0c8'; ctx.lineWidth = 1;
    const nock = pt(2 - p.aux2 * 6, 0);
    ctx.beginPath(); ctx.moveTo(t1.x, t1.y); ctx.lineTo(nock.x, nock.y); ctx.lineTo(t2.x, t2.y); ctx.stroke();
    if (u.state === 'attack' && u.attackT < ATK_IMPACT) seg(ctx, nock, pt(nock.x + 14, nock.y), '#c8b48a', 1.8);
    ctx.restore();
    drawWheel(ctx, 8, wy, wr, rot, rig.trim);
  } else { // barrel artillery: mortar / rail / nova
    drawWheel(ctx, -8, wy, wr, rot, rig.trim);
    rrS(ctx, -13, -12, 26, 6.5, 2.5, rig.body);
    const recoil = p.aux2 * 4;
    ctx.save(); ctx.translate(-2, -13); ctx.rotate(-0.62);
    rrS(ctx, -4 - recoil, -3, 20, 6, 2.5, rig.weapon);
    rrS(ctx, 12 - recoil, -3.6, 4, 7.2, 2, shade(rig.weapon, 0.2)); // muzzle ring
    ctx.restore();
    cirS(ctx, -2, -13, 3.6, shade(rig.body, 0.1), 1.8);
    drawWheel(ctx, 8, wy, wr, rot, rig.trim);
  }
}

/* ------------------------------------------------------------- vehicle */

function drawVehicle(ctx: Ctx2D, u: UnitInstance, rig: RigConfig): void {
  const p = u.pose;
  const style = rig.vehicleStyle ?? 'car';
  const rot = u.walkPhase * 0.8;
  const bounce = u.state === 'walk' ? Math.abs(Math.sin(u.walkPhase * 0.5)) * 1 : 0;
  const recoil = p.aux2 * 3.5;

  if (style === 'hoverHull') {
    const hov = 10 + Math.sin(u.animT * 3) * 1.6;
    ctx.save(); ctx.translate(0, -hov);
    // engine glow
    ctx.save(); ctx.globalAlpha = 0.45 + 0.2 * Math.sin(u.animT * 11);
    polyS(ctx, [pt(-9, 0), pt(-5, 7 + Math.sin(u.animT * 13) * 2), pt(-1, 0)], '#7ee0ff', 0);
    polyS(ctx, [pt(3, 0), pt(7, 6 + Math.cos(u.animT * 12) * 2), pt(11, 0)], '#7ee0ff', 0);
    ctx.restore();
    rrS(ctx, -16, -9, 32, 9.5, 4.5, rig.body);
    polyS(ctx, [pt(14, -9), pt(20, -5.5), pt(14, -2)], rig.trim, 1.8);      // prow
    rrS(ctx, -8, -14, 12, 6, 2.5, rig.trim);                                // bridge
    ctx.save(); ctx.translate(4, -11); ctx.rotate(-0.35);
    seg(ctx, pt(-recoil, 0), pt(13 - recoil, 0), rig.weapon, 3);            // gun
    ctx.restore();
    ctx.restore();
    return;
  }

  ctx.save(); ctx.translate(0, -bounce);
  if (style === 'treads') {
    rrS(ctx, -14, -7, 28, 7, 3.5, shade(rig.trim, -0.25));
    for (let i = 0; i < 5; i++) {
      const tx = -12 + ((i * 6 + (u.walkPhase * 4) % 6 + 6) % 28);
      seg(ctx, pt(tx - 13, -1.4), pt(tx - 13, -5.6), shade(rig.trim, -0.5), 1.4);
    }
    rrS(ctx, -12, -13, 24, 7, 2.5, rig.body);
  } else {
    const wheels = style === 'apc' ? [-9, 0, 9] : [-8, 8];
    rrS(ctx, -14, -13.5, 28, 8.5, 3.5, rig.body);
    if (style === 'car') rrS(ctx, -6, -18.5, 12, 6, 2.5, rig.trim);
    else rrS(ctx, -10, -17.5, 15, 5, 2, rig.trim);
    for (const wx of wheels) drawWheel(ctx, wx, -5, 4.6, rot, '#2a2a30');
  }
  // top gun
  ctx.save(); ctx.translate(2, style === 'treads' ? -14 : -17); ctx.rotate(-0.25);
  seg(ctx, pt(-recoil, 0), pt(11 - recoil, 0), rig.weapon, 2.6);
  ctx.restore();
  ctx.restore();
}

/* --------------------------------------------------------------- flyer */

function drawFlyer(ctx: Ctx2D, u: UnitInstance, rig: RigConfig): void {
  const p = u.pose;
  const hov = (rig.hover ?? 26) + Math.sin(u.animT * 3.2) * 2.5 - (u.state === 'attack' && p.aux > 0 ? 5 : 0);
  const style = rig.flyerStyle ?? 'wings';
  ctx.save();
  ctx.translate(0, -hov);
  ctx.rotate(u.state === 'walk' ? 0.08 : 0);

  if (style === 'wings') {
    const flap = Math.sin(u.animT * 9) * 0.7;
    polyS(ctx, [pt(-2, -2), pt(-13, -6 - flap * 8), pt(-16, 1 - flap * 6), pt(-4, 2)], shade(rig.body, -0.25), 1.8); // far wing
    rrS(ctx, -9, -4, 18, 8, 4, rig.body);
    const beak = pt(12, -2);
    cirS(ctx, 8, -3, 3.6, rig.body, 1.8);
    polyS(ctx, [pt(10.5, -4), pt(15, -2.4), pt(10.5, -1)], '#f0c040', 1.4);
    seg(ctx, pt(-9, 0), boneEnd(pt(-9, 0), Math.PI - 0.4 + Math.sin(u.animT * 5) * 0.2, 8), rig.body, 2); // tail
    polyS(ctx, [pt(0, -3), pt(-10, -9 - flap * 10), pt(-14, -1 - flap * 8), pt(-2, 1)], rig.trim, 1.8);   // near wing
    void beak;
  } else if (style === 'saucer') {
    ctx.save(); ctx.globalAlpha = 0.5 + 0.2 * Math.sin(u.animT * 10);
    polyS(ctx, [pt(-4, 3), pt(0, 10), pt(4, 3)], '#7ee0ff', 0); ctx.restore();  // tractor glow
    rrS(ctx, -12, -2, 24, 5.5, 3, rig.body);
    ctx.beginPath(); ctx.arc(0, -2, 6.5, Math.PI, 0);
    ctx.fillStyle = shade(rig.trim, 0.15); ctx.fill(); ctx.strokeStyle = '#101014'; ctx.lineWidth = 2; ctx.stroke();
    for (const lx of [-8, 0, 8]) cirS(ctx, lx, 0.6, 1.3, Math.sin(u.animT * 8 + lx) > 0 ? '#ffe066' : '#ff6bd0', 0.8);
  } else if (style === 'jet') {
    ctx.save(); ctx.globalAlpha = 0.6;
    polyS(ctx, [pt(-11, -1), pt(-17 - Math.random() * 4, 1), pt(-11, 3)], '#ffb040', 0); ctx.restore(); // thruster
    polyS(ctx, [pt(-10, -2), pt(12, -2), pt(16, 1), pt(12, 3), pt(-10, 3)], rig.body, 1.8);              // fuselage
    polyS(ctx, [pt(-2, 0), pt(-8, 6), pt(-3, 6)], rig.trim, 1.6);                                        // wing
    polyS(ctx, [pt(-9, -2), pt(-11, -8), pt(-7, -2)], rig.trim, 1.6);                                    // tail fin
    rrS(ctx, 2, -4.5, 6, 3, 1.4, shade(rig.trim, 0.3));                                                  // canopy
  } else { // drone
    const spin = u.animT * 30;
    seg(ctx, pt(-8 * Math.cos(spin % 1), -8), pt(8 * Math.cos(spin % 1), -8), shade(rig.trim, 0.1), 1.4); // rotor blur
    seg(ctx, pt(0, -8), pt(0, -4), rig.trim, 1.8);
    rrS(ctx, -6, -4, 12, 8, 3.5, rig.body);
    cirS(ctx, 3, 0, 2, '#ff5a5a', 1.2);                                                                   // eye
    seg(ctx, pt(2, 4), pt(8, 4), rig.weapon, 2);                                                          // gun pod
  }
  ctx.restore();
}

/* --------------------------------------------------------------- beast */

function drawBeast(ctx: Ctx2D, u: UnitInstance, rig: RigConfig): void {
  const p = u.pose;
  const bodyY = -13 - p.bob;
  // legs
  for (const [ox, ph] of [[-8, 0], [7, Math.PI], [-5, Math.PI], [10, 0]] as [number, number][]) {
    const sw = u.state === 'walk' ? Math.sin(u.walkPhase + ph) * 0.5 : 0.05;
    const hip = pt(ox, bodyY + 4);
    const foot = boneEnd(hip, DOWN + sw, 9);
    seg(ctx, hip, foot, shade(rig.body, ox < 0 ? -0.3 : -0.05), 3.8);
  }
  // tail (2 seg wave)
  const t1 = boneEnd(pt(-14, bodyY - 2), Math.PI - 0.35 + Math.sin(u.animT * 3) * 0.15, 9);
  const t2 = boneEnd(t1, Math.PI - 0.15 + Math.sin(u.animT * 3 + 1) * 0.25, 8);
  seg(ctx, pt(-14, bodyY - 2), t1, rig.body, 3.4); seg(ctx, t1, t2, rig.body, 2.2);
  polyS(ctx, [t2, boneEnd(t2, Math.PI + 0.6, 4), boneEnd(t2, Math.PI - 1, 4)], rig.trim, 1.4);
  // far wing
  if (rig.wings) {
    const flap = Math.sin(u.animT * 5) * 0.35;
    polyS(ctx, [pt(-2, bodyY - 3), pt(-14, bodyY - 14 - flap * 8), pt(-18, bodyY - 4 - flap * 5), pt(-6, bodyY - 1)], shade(rig.body, -0.3), 1.8);
  }
  // body
  rrS(ctx, -15, bodyY - 6, 30, 12, 6, rig.body);
  // belly stripe
  rrS(ctx, -10, bodyY + 1, 22, 4, 2, shade(rig.trim, 0.2), 1.4);
  // neck: rears back in anticipation (aux -1), whips forward on strike (aux +1)
  const neckBase = pt(12, bodyY - 4);
  const neckAng = lerp(-1.55, -0.35, (p.aux + 1) / 2);
  const n1 = boneEnd(neckBase, neckAng, 8);
  const headP = boneEnd(n1, neckAng + 0.35, 7);
  seg(ctx, neckBase, n1, rig.body, 5);
  seg(ctx, n1, headP, rig.body, 4.4);
  // head + jaw (aux2 opens on strike)
  const jawOpen = u.state === 'attack' && u.attackT > ATK_ANTICIPATION_END && u.attackT < 0.75 ? 0.5 : 0.08;
  cirS(ctx, headP.x, headP.y, 4.2, rig.body, 1.8);
  polyS(ctx, [pt(headP.x + 1, headP.y - 1), pt(headP.x + 9, headP.y - 2 - jawOpen * 4), pt(headP.x + 2, headP.y + 0.5)], rig.body, 1.6); // upper snout
  polyS(ctx, [pt(headP.x + 1, headP.y + 1), pt(headP.x + 8, headP.y + 2 + jawOpen * 6), pt(headP.x + 2, headP.y + 2.5)], shade(rig.body, -0.2), 1.6); // lower jaw
  polyS(ctx, [pt(headP.x - 2, headP.y - 3.5), pt(headP.x - 4, headP.y - 9), pt(headP.x + 1, headP.y - 4)], rig.trim, 1.4); // horn
  cirS(ctx, headP.x + 1.5, headP.y - 1.8, 1.1, '#ffe066', 0.8);
  // near wing
  if (rig.wings) {
    const flap = Math.sin(u.animT * 5) * 0.35;
    polyS(ctx, [pt(2, bodyY - 4), pt(-9, bodyY - 17 - flap * 10), pt(-15, bodyY - 6 - flap * 7), pt(-3, bodyY - 2)], rig.trim, 1.8);
  }
  // spikes
  for (const sx of [-9, -3, 3, 9]) polyS(ctx, [pt(sx - 2, bodyY - 6), pt(sx, bodyY - 10), pt(sx + 2, bodyY - 6)], rig.trim, 1.2);
}
