/** Scene renderer. Layered era-themed background (hazy far hills → near hills
 *  → grass-lip ground with pebbles), era-styled bases + turrets, units via the
 *  rig system, projectiles, particles, special FX, chunked HP bars.
 *  Backgrounds CROSS-FADE between era palettes (dispEra eases toward the
 *  player's era) rather than snapping.
 */
import { engine, LANE_W, LANE_L, LANE_R, SpecialFx } from './engine';
import { drawUnit } from './rig';
import { rrS, cirS, polyS, shade, seg, pt, clamp, lerp, TAU } from './primitives';
import { BaseState, EraStage, EraVisualDef, Projectile } from './types';

/* ------------------------------------------------------------- camera */
/** World units visible at once — the lane (LANE_W) is far wider, so the
 *  camera scrolls left/right to reach the bases. */
export const VIEW_W = 860;
export const camera = { x: 0, target: null as number | null };
let lastScale = 1;

const clampCam = (x: number): number => clamp(x, 0, LANE_W - VIEW_W);
/** Pan by a screen-pixel delta (drag/swipe/wheel). Cancels any glide target. */
export function panCamera(dxScreen: number): void {
  camera.target = null;
  camera.x = clampCam(camera.x + dxScreen / lastScale);
}
/** Glide the camera so `worldX` ends up centered. */
export function jumpCamera(worldX: number): void {
  camera.target = clampCam(worldX - VIEW_W / 2);
}
/** Minimap hit-test + scrub support: screen-space rect of the strip. */
export const minimapRect = { x: 0, y: 0, w: 0, h: 0 };
export function minimapSeek(screenX: number): void {
  const frac = clamp((screenX - minimapRect.x) / minimapRect.w, 0, 1);
  camera.target = clampCam(frac * LANE_W - VIEW_W / 2);
}

function hexRgb(h: string): [number, number, number] {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a: string, b: string, t: number): string {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${(A[0] + (B[0] - A[0]) * t) | 0},${(A[1] + (B[1] - A[1]) * t) | 0},${(A[2] + (B[2] - A[2]) * t) | 0})`;
}
function rgbHex(rgb: string): string {
  const m = rgb.match(/(\d+),(\d+),(\d+)/);
  if (!m) return rgb.startsWith('#') ? rgb : '#888888';
  const to2 = (v: string) => (+v).toString(16).padStart(2, '0');
  return `#${to2(m[1])}${to2(m[2])}${to2(m[3])}`;
}

interface EraVisualBlend {
  from: EraVisualDef;
  to: EraVisualDef;
  t: number;
  skyTop: string;
  skyBottom: string;
  mountain: string;
  hill: string;
  groundTop: string;
  groundBottom: string;
  lightTint: string;
  lightStrength: number;
}

let dispEra = 0;   // visual-only float era index; gameplay era changes instantly

function blendedVisual(dt: number): EraVisualBlend {
  const target = engine.player ? engine.player.era - 1 : 0;
  const eras = engine.campaign.eras;
  const duration = eras[target]?.visual.transition.durationSec ?? 0.8;
  const step = dt / Math.max(0.1, duration);
  dispEra = target > dispEra ? Math.min(target, dispEra + step) : Math.max(target, dispEra - step);
  const i0 = clamp(Math.floor(dispEra), 0, eras.length - 1), i1 = clamp(i0 + 1, 0, eras.length - 1);
  const t = clamp(dispEra - i0, 0, 1);
  const from = eras[i0].visual, to = eras[i1].visual;
  return {
    from, to, t,
    skyTop: mixHex(from.skyTop, to.skyTop, t),
    skyBottom: mixHex(from.skyBottom, to.skyBottom, t),
    mountain: mixHex(from.mountain, to.mountain, t),
    hill: mixHex(from.hill, to.hill, t),
    groundTop: mixHex(from.groundTop, to.groundTop, t),
    groundBottom: mixHex(from.groundBottom, to.groundBottom, t),
    lightTint: mixHex(from.lightTint, to.lightTint, t),
    lightStrength: lerp(from.lightStrength, to.lightStrength, t),
  };
}

/* --------------------------------------------------------- chunked HP bar */
export function chunkedBar(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  hp: number, maxHp: number, color: string, segs: number, flash: number,
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const gap = 1;
  const segW = (w - gap * (segs - 1)) / segs;
  const frac = clamp(hp / maxHp, 0, 1) * segs;
  for (let i = 0; i < segs; i++) {
    const fill = clamp(frac - i, 0, 1);
    const sx = x + i * (segW + gap);
    if (fill <= 0) {
      // the chunk currently being lost flashes red
      if (flash > 0 && i === Math.ceil(frac)) { ctx.fillStyle = `rgba(255,70,70,${flash * 3})`; ctx.fillRect(sx, y, segW, h); }
      continue;
    }
    ctx.fillStyle = fill >= 1 ? color : shade('#ff6b6b', 0.1);
    ctx.fillRect(sx, y, segW * fill, h);
  }
}

/* ------------------------------------------------------------- background */
const STAGE_INDEX: Record<EraStage, number> = { primitive: 1, fortified: 2, engineered: 3, advanced: 4, apex: 5 };

function drawProps(ctx: CanvasRenderingContext2D, visual: EraVisualDef, alpha: number, gy: number, s: number, wx: (x: number) => number, W: number): void {
  if (alpha <= 0.001) return;
  const base = shade(visual.hill, -0.35);
  const stage = STAGE_INDEX[visual.stage];
  // world-anchored scenery across the whole lane so it scrolls with the camera
  const spots = [0.02, 0.1, 0.18, 0.27, 0.36, 0.45, 0.54, 0.63, 0.72, 0.81, 0.9, 0.98];
  spots.forEach((fx, i) => {
    if (((i * 37) % 100) / 100 > visual.propDensity) return;
    const x = wx(LANE_W * fx), sc = s * (0.85 + ((i * 7 + 3) % 5) * 0.12);
    if (x < -90 || x > W + 90) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, gy); ctx.fillStyle = base; ctx.strokeStyle = base;

    if (stage === 1 && visual.motif === 'human') {
      ctx.beginPath(); ctx.moveTo(-16 * sc, 0); ctx.lineTo(-8 * sc, -13 * sc); ctx.lineTo(6 * sc, -10 * sc); ctx.lineTo(17 * sc, 0); ctx.closePath(); ctx.fill();
      if (i % 2) { ctx.fillRect(-2 * sc, -22 * sc, 4 * sc, 22 * sc); polyS(ctx, [pt(-9 * sc, -20 * sc), pt(0, -30 * sc), pt(9 * sc, -20 * sc)], visual.accent, 1); }
    } else if (stage === 1 && visual.motif === 'mythic') {
      ctx.fillRect(-2 * sc, -22 * sc, 4 * sc, 22 * sc);
      for (let a = 0; a < 3; a++) { ctx.beginPath(); ctx.arc((a - 1) * 7 * sc, (-22 + Math.abs(a - 1) * 3) * sc, 9 * sc, 0, TAU); ctx.fill(); }
    } else if (stage === 1) {
      ctx.beginPath(); ctx.ellipse(0, -6 * sc, 17 * sc, 8 * sc, 0, Math.PI, TAU); ctx.fill();
      seg(ctx, pt(0, -14 * sc), pt(0, -27 * sc), visual.accent, 1.6 * sc); cirS(ctx, 0, -29 * sc, 2 * sc, visual.accent, 0);
    } else if (stage === 2) {
      ctx.fillRect(-13 * sc, -30 * sc, 26 * sc, 30 * sc);
      for (let b = 0; b < 4; b++) ctx.fillRect(-13 * sc + b * 7.4 * sc, -35 * sc, 4.6 * sc, 5 * sc);
      if (visual.motif === 'cosmic') { ctx.fillStyle = visual.accent; ctx.fillRect(-9 * sc, -23 * sc, 18 * sc, 2 * sc); }
      else if (visual.motif === 'mythic') { polyS(ctx, [pt(-14 * sc, -35 * sc), pt(0, -46 * sc), pt(14 * sc, -35 * sc)], visual.accent, 1); }
    } else if (stage === 3) {
      ctx.fillRect(-4 * sc, -38 * sc, 8 * sc, 38 * sc);
      if (visual.motif === 'human') { seg(ctx, pt(0, -35 * sc), pt(20 * sc, -43 * sc), base, 3 * sc); seg(ctx, pt(17 * sc, -42 * sc), pt(17 * sc, -8 * sc), base, 1.5 * sc); }
      else if (visual.motif === 'mythic') { ctx.strokeStyle = visual.accent; ctx.lineWidth = 3 * sc; ctx.beginPath(); ctx.arc(0, -4 * sc, 18 * sc, Math.PI, TAU); ctx.stroke(); cirS(ctx, 0, -35 * sc, 3 * sc, visual.accent, 0); }
      else { for (let p = -1; p <= 1; p++) { seg(ctx, pt(0, -28 * sc), pt(p * 12 * sc, -43 * sc), visual.accent, 2 * sc); } }
    } else if (stage === 4) {
      const h = (24 + ((i * 13 + 2) % 5) * 9) * sc;
      ctx.fillRect(-11 * sc, -h, 22 * sc, h);
      ctx.fillStyle = visual.accent;
      for (let wy = -h + 5 * sc; wy < -5 * sc; wy += 7 * sc) for (let wx = -8 * sc; wx < 8 * sc; wx += 6.4 * sc) ctx.fillRect(wx, wy, 2.6 * sc, 2.6 * sc);
      if (visual.motif === 'mythic') { cirS(ctx, 0, -h - 8 * sc, 5 * sc, visual.accent, 0); }
    } else {
      const h = (28 + ((i * 11 + 1) % 6) * 10) * sc;
      ctx.fillRect(-9 * sc, -h, 18 * sc, h);
      ctx.fillStyle = visual.accent;
      ctx.fillRect(-1.6 * sc, -h - 12 * sc, 3.2 * sc, 12 * sc);
      ctx.beginPath(); ctx.arc(0, -h - 13 * sc, 2.6 * sc, 0, TAU); ctx.fill();
      if (visual.motif === 'mythic') { ctx.strokeStyle = visual.accent; ctx.lineWidth = 2 * sc; ctx.beginPath(); ctx.arc(0, -h * 0.55, 15 * sc, 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
  });
}

function drawGroundPattern(ctx: CanvasRenderingContext2D, visual: EraVisualDef, alpha: number, gy: number, H: number, s: number, wx: (x: number) => number, W: number): void {
  if (alpha <= 0.001) return;
  const stage = STAGE_INDEX[visual.stage];
  ctx.save(); ctx.globalAlpha = alpha * (stage <= 2 ? 0.18 : 0.28); ctx.strokeStyle = visual.accent; ctx.fillStyle = visual.accent;
  for (let i = 0; i < 30; i++) {
    const x = wx((i * 431) % LANE_W);
    if (x < -30 || x > W + 30) continue;
    const y = gy + (10 + ((i * 97) % 42)) * s;
    if (stage === 1) { ctx.beginPath(); ctx.ellipse(x, y, 5 * s, 1.4 * s, 0.15, 0, TAU); ctx.fill(); }
    else if (stage === 2) { ctx.strokeRect(x - 8 * s, y - 3 * s, 16 * s, 6 * s); }
    else if (stage === 3) { seg(ctx, pt(x - 10 * s, y), pt(x + 10 * s, y), visual.accent, 1.2 * s); }
    else if (stage === 4) { ctx.fillRect(x - 12 * s, y, 24 * s, 1.5 * s); ctx.fillRect(x, y - 4 * s, 1.5 * s, 9 * s); }
    else { ctx.beginPath(); ctx.arc(x, y, 4 * s, 0, TAU); ctx.stroke(); ctx.fillRect(x - 0.7 * s, gy, 1.4 * s, H - gy); }
  }
  ctx.restore();
}

function drawAmbient(ctx: CanvasRenderingContext2D, visual: EraVisualDef, alpha: number, t: number, cam: number, gy: number, s: number, W: number): void {
  if (alpha <= 0.001) return;
  ctx.save(); ctx.globalAlpha = alpha * 0.45; ctx.fillStyle = visual.accent;
  for (let i = 0; i < 18; i++) {
    const phase = t * (visual.ambient === 'energy' ? 24 : 11) + i * 73 - cam * 0.08;
    const x = ((phase + i * 149) % (W + 80) + W + 80) % (W + 80) - 40;
    const y = gy * (0.25 + ((i * 41) % 65) / 100);
    const drift = Math.sin(t * 1.7 + i) * 6 * s;
    const rise = ((phase % 500) + 500) % 500;
    if (visual.ambient === 'leaves') { ctx.save(); ctx.translate(x, y + drift); ctx.rotate(phase * 0.03); ctx.fillRect(-3 * s, -1 * s, 6 * s, 2 * s); ctx.restore(); }
    else if (visual.ambient === 'dust') { ctx.beginPath(); ctx.arc(x, gy - ((rise * 0.35) % (gy * 0.45)), 1.8 * s, 0, TAU); ctx.fill(); }
    else if (visual.ambient === 'embers') { ctx.fillRect(x, gy - ((rise * 0.55) % (gy * 0.55)), 1.5 * s, 3 * s); }
    else if (visual.ambient === 'sparks') { ctx.fillRect(x, y + drift, 1.8 * s, 1.8 * s); }
    else { ctx.beginPath(); ctx.arc(x, y + drift, (1.2 + (i % 3) * 0.6) * s, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ base */
function drawBase(ctx: CanvasRenderingContext2D, b: BaseState, color: string, visual: EraVisualDef, gy: number, s: number, popT: number, t: number, wx: (x: number) => number, W: number): void {
  const stage = STAGE_INDEX[visual.stage];
  const w = (54 + stage * 2) * s, hgt = (118 + stage * 12) * s;
  const isP = b.side === 'player';
  const x = wx(b.x);
  if (x < -120 || x > W + 120) return;   // scrolled off-screen
  const bx = isP ? x - w * 0.7 : x - w * 0.3;
  const transitionT = clamp(popT / visual.transition.durationSec, 0, 1);
  const pop = 1 + Math.sin(transitionT * Math.PI) * 0.09;

  ctx.save();
  ctx.translate(bx + w / 2, gy);
  ctx.scale(pop, pop);
  ctx.translate(-(bx + w / 2), -gy);

  const by = gy - hgt;
  rrS(ctx, bx, by, w, hgt, 7 * s, b.hitT > 0 ? shade(color, 0.35) : color, 2.5);
  // subtle darker band under the crown
  ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#000';
  ctx.fillRect(bx + 2, by + 3, w - 4, hgt * 0.16); ctx.restore();
  // campaign-specific construction language: masonry, living growth, or hull panels
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
  const panelLines = visual.motif === 'cosmic' ? 5 : 3;
  for (let i = 1; i <= panelLines; i++) {
    ctx.beginPath(); ctx.moveTo(bx + 3, by + hgt * (i / (panelLines + 1))); ctx.lineTo(bx + w - 3, by + hgt * (i / (panelLines + 1))); ctx.stroke();
  }
  if (visual.motif === 'mythic') {
    ctx.strokeStyle = visual.accent; ctx.lineWidth = 1.6 * s;
    ctx.beginPath(); ctx.moveTo(bx + 8 * s, gy); ctx.bezierCurveTo(bx + 2 * s, by + hgt * 0.7, bx + 16 * s, by + hgt * 0.35, bx + 10 * s, by + 8 * s); ctx.stroke();
    cirS(ctx, bx + 10 * s, by + hgt * 0.52, 2.2 * s, visual.accent, 0);
  } else if (visual.motif === 'cosmic') {
    ctx.fillStyle = visual.accent; ctx.globalAlpha = 0.55;
    for (let i = 0; i < 3; i++) ctx.fillRect(bx + 6 * s, by + hgt * (0.27 + i * 0.21), w - 12 * s, 1.8 * s);
    ctx.globalAlpha = 1;
  }

  // stage-specific crown and silhouette
  if (stage <= 2) {
    polyS(ctx, [pt(bx - 4 * s, by), pt(bx + w / 2, by - 16 * s), pt(bx + w + 4 * s, by)], shade(color, -0.25), 2);
    if (stage === 2) for (let i = 0; i < 3; i++) rrS(ctx, bx + i * (w / 3) + 2 * s, by - 7 * s, w / 3 - 4 * s, 7 * s, 1 * s, color, 1.5);
  } else if (stage === 3) {
    for (let i = 0; i < 4; i++) rrS(ctx, bx + i * (w / 4) + 1.5 * s, by - 9 * s, w / 4 - 3 * s, 9 * s, 1.5 * s, color, 2);
  } else if (stage === 4) {
    rrS(ctx, bx + 4 * s, by - 10 * s, w - 8 * s, 10 * s, 2 * s, shade(color, -0.2), 2);
    seg(ctx, pt(bx + w / 2, by - 10 * s), pt(bx + w / 2, by - 30 * s), shade(color, -0.3), 2 * s);
    cirS(ctx, bx + w / 2, by - 31 * s, 2.4 * s, visual.accent, 1.4);
  } else {
    polyS(ctx, [pt(bx + 6 * s, by), pt(bx + w / 2, by - 26 * s), pt(bx + w - 6 * s, by)], shade(color, 0.05), 2);
    ctx.save(); ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 4);
    seg(ctx, pt(bx + w / 2, by - 25 * s), pt(bx + w / 2, by - 38 * s), visual.accent, 2.4 * s);
    ctx.restore();
  }
  // arrow-slit windows
  for (let i = 0; i < 2; i++) {
    rrS(ctx, bx + w * 0.44, by + hgt * (0.34 + i * 0.26), w * 0.12, hgt * 0.13, 2.5 * s, shade(color, -0.55), 1.4);
  }
  // flag
  const fx = bx + w / 2;
  seg(ctx, pt(fx, by - (stage >= 5 ? 38 : 16) * s), pt(fx, by - (stage >= 5 ? 52 : 40) * s), '#3a3a44', 2 * s);
  polyS(ctx, [pt(fx + 1, by - (stage >= 5 ? 52 : 40) * s), pt(fx + 18 * s, by - (stage >= 5 ? 46 : 34) * s), pt(fx + 1, by - (stage >= 5 ? 40 : 28) * s)], isP ? '#5ac8ff' : '#ff6b6b', 1.8);
  // turrets mounted up the inner wall — silhouette per type:
  // rapid = twin thin barrels · splash = fat stubby mortar · sniper = long barrel + scope
  b.turrets.forEach((tr, i) => {
    const ty = gy - hgt * 0.72 - i * 22 * s;
    const tx2 = isP ? bx + w + 2 : bx - 2;
    const dir = isP ? 1 : -1;
    const eraCol = ['#8a6a3c', '#9aa0a8', '#b0b4c0', '#5a6a4a', '#7ee0ff'][tr.era - 1];
    rrS(ctx, tx2 - 5.5 * s, ty, 11 * s, 7.5 * s, 2 * s, shade(eraCol, -0.15), 1.8);
    ctx.save(); ctx.translate(tx2, ty + 2 * s);
    ctx.rotate(dir > 0 ? -0.35 : 0.35 + Math.PI);
    if (tr.def.kind === 'rapid') {
      seg(ctx, pt(0, -1.6 * s), pt(11 * s, -1.6 * s), eraCol, 2 * s);
      seg(ctx, pt(0, 1.6 * s), pt(11 * s, 1.6 * s), eraCol, 2 * s);
    } else if (tr.def.kind === 'heavy') {
      seg(ctx, pt(-1 * s, 0), pt(9 * s, 0), eraCol, 5.5 * s);
      seg(ctx, pt(8 * s, 0), pt(10.5 * s, 0), shade(eraCol, 0.25), 6.5 * s);
    } else { // sniper
      seg(ctx, pt(0, 0), pt(19 * s, 0), eraCol, 2.4 * s);
      seg(ctx, pt(15 * s, 0), pt(18 * s, 0), shade(eraCol, 0.3), 3.4 * s);
      cirS(ctx, 5 * s, -3 * s, 1.8 * s, shade(eraCol, 0.35), 1.2);
    }
    ctx.restore();
  });

  // Data-selected rebuild/morph/energy treatment masks the model swap while
  // leaving base position, HP, collision, and turret behavior untouched.
  if (transitionT < 1) {
    const a = 1 - transitionT;
    ctx.save(); ctx.globalAlpha = a;
    if (visual.transition.kind === 'rebuild') {
      ctx.strokeStyle = visual.accent; ctx.lineWidth = 1.5 * s;
      for (let i = 0; i < 3; i++) { ctx.strokeRect(bx - 5 * s + i * 8 * s, by + i * 16 * s, w + 10 * s - i * 16 * s, hgt - i * 24 * s); }
    } else if (visual.transition.kind === 'morph') {
      ctx.strokeStyle = visual.accent; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.ellipse(bx + w / 2, by + hgt / 2, w * (0.55 + transitionT), hgt * 0.45, 0, 0, TAU); ctx.stroke();
    } else {
      ctx.strokeStyle = visual.accent; ctx.lineWidth = 2.5 * s;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(bx + w / 2, gy - (20 + i * 30) * s, (12 + transitionT * 24) * s, 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
  }
  ctx.restore();

  // chunked base HP bar above the tower
  const bw = w + 14 * s;
  chunkedBar(ctx, bx - 7 * s, gy - hgt - 26 * s, bw, 7 * s, b.hp, b.maxHp,
    b.hp / b.maxHp > 0.5 ? '#5ef08a' : b.hp / b.maxHp > 0.25 ? '#ffd25a' : '#ff6b6b', 8, b.hitT);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${9 * s}px -apple-system, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.ceil(b.hp)), bx - 7 * s + bw / 2, gy - hgt - 22 * s + 0.5);
}

/* ------------------------------------------------------------ projectiles */
function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, x: number, gy: number, s: number): void {
  const y = gy + p.y * s;
  const ang = Math.atan2(p.vy, p.vx);
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  switch (p.kind) {
    case 'arrow':
      seg(ctx, pt(-7 * s, 0), pt(6 * s, 0), '#c8b48a', 1.6 * s);
      polyS(ctx, [pt(6 * s, 0), pt(3 * s, -2 * s), pt(3 * s, 2 * s)], '#9aa0a8', 1);
      break;
    case 'bolt':
      seg(ctx, pt(-8 * s, 0), pt(8 * s, 0), '#e0d6b8', 2.2 * s);
      break;
    case 'bullet':
      seg(ctx, pt(-5 * s, 0), pt(4 * s, 0), '#ffe08a', 1.8 * s);
      break;
    case 'shell':
      cirS(ctx, 0, 0, 3.4 * s, '#4a4a52', 1.6);
      break;
    case 'orb': {
      ctx.globalAlpha = 0.5; cirS(ctx, 0, 0, 6 * s, '#b07bff', 0); ctx.globalAlpha = 1;
      cirS(ctx, 0, 0, 3.4 * s, '#d0b0ff', 1.4);
      break;
    }
    case 'fire': {
      ctx.globalAlpha = 0.6;
      polyS(ctx, [pt(-10 * s, 0), pt(-3 * s, -3 * s), pt(-3 * s, 3 * s)], '#ff8040', 0);
      ctx.globalAlpha = 1;
      cirS(ctx, 0, 0, 3.6 * s, '#ffb040', 1.4);
      break;
    }
    case 'beam': {
      const g = ctx.createLinearGradient(-14 * s, 0, 6 * s, 0);
      g.addColorStop(0, 'rgba(126,224,255,0)'); g.addColorStop(1, '#e8fbff');
      ctx.strokeStyle = g; ctx.lineWidth = 2.4 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-14 * s, 0); ctx.lineTo(6 * s, 0); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------- specials */
function drawSpecialFx(ctx: CanvasRenderingContext2D, fx: SpecialFx, cx: number, gy: number, s: number, H: number): void {
  const r = fx.radius * s;
  const n = fx.kind === 'arrows' ? 14 : fx.kind === 'beam' ? 1 : 7;
  for (let i = 0; i < n; i++) {
    const fxr = ((i * 137) % 100) / 100;             // deterministic spread
    const ix = cx + (fxr - 0.5) * 2 * r * 0.9;
    const fallT = clamp((fx.t - fxr * 0.25) / 0.45, 0, 1);
    const iy = lerp(-40, gy, fallT);
    if (fx.kind === 'beam') {
      const a = fx.t < 0.55 ? fx.t / 0.55 : 1 - (fx.t - 0.55) / 0.6;
      ctx.save(); ctx.globalAlpha = clamp(a, 0, 1) * 0.85;
      const g = ctx.createLinearGradient(cx - r * 0.4, 0, cx + r * 0.4, 0);
      g.addColorStop(0, 'rgba(126,224,255,0)'); g.addColorStop(0.5, '#e8fbff'); g.addColorStop(1, 'rgba(126,224,255,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - r * 0.4, 0, r * 0.8, gy);
      ctx.restore();
      break;
    }
    if (fallT >= 1) {
      const bt = clamp((fx.t - 0.5) / 0.4, 0, 1);
      if (bt < 1) {
        ctx.save(); ctx.globalAlpha = 1 - bt;
        cirS(ctx, ix, gy - 6 * s, (8 + bt * 22) * s, fx.kind === 'fire' ? '#ff8040' : '#ffb040', 0);
        ctx.restore();
      }
      continue;
    }
    if (fx.kind === 'rocks') cirS(ctx, ix, iy, 6 * s, '#8a8578', 2);
    else if (fx.kind === 'arrows') { ctx.save(); ctx.translate(ix, iy); ctx.rotate(1.35); seg(ctx, pt(-6 * s, 0), pt(6 * s, 0), '#c8b48a', 1.6 * s); ctx.restore(); }
    else if (fx.kind === 'shells') { cirS(ctx, ix, iy, 4 * s, '#4a4a52', 1.6); }
    else { // fire meteors
      ctx.save(); ctx.globalAlpha = 0.55; polyS(ctx, [pt(ix - 3 * s, iy - 14 * s), pt(ix + 3 * s, iy - 14 * s), pt(ix, iy)], '#ff8040', 0); ctx.restore();
      cirS(ctx, ix, iy, 5 * s, '#ffb040', 1.6);
    }
  }
  void H;
}

/* ---------------------------------------------------------------- main */
let lastFrame = 0;
export function renderScene(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  ctx.clearRect(0, 0, W, H);
  if (engine.mode !== 'battle') return;

  const s = W / VIEW_W;
  lastScale = s;
  const gy = H * 0.78;
  const env = blendedVisual(dt);
  const t = engine.time;

  // camera glide toward target (drag cancels the target)
  if (camera.target != null) {
    camera.x += (camera.target - camera.x) * clamp(dt * 7, 0, 1);
    if (Math.abs(camera.target - camera.x) < 1) camera.target = null;
  }
  camera.x = clampCam(camera.x);
  const cam = camera.x;
  /** world x → screen x */
  const wx = (x: number): number => (x - cam) * s;

  ctx.save();
  // screen shake (specials only — engine controls magnitude)
  if (engine.shake > 0.2) ctx.translate((Math.random() - 0.5) * engine.shake, (Math.random() - 0.5) * engine.shake);

  // sky (screen-fixed)
  const sky = ctx.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, env.skyTop); sky.addColorStop(1, env.skyBottom);
  ctx.fillStyle = sky; ctx.fillRect(-12, -12, W + 24, gy + 12);
  // drifting clouds (slow parallax)
  const cloudAlpha = lerp(env.from.stage === 'apex' ? 0.05 : 0.16, env.to.stage === 'apex' ? 0.05 : 0.16, env.t);
  ctx.fillStyle = `rgba(255,255,255,${cloudAlpha})`;
  for (let i = 0; i < 4; i++) {
    const cx = ((i * W / 3.2 - (t * 7 + cam * 0.15 * s) % (W + 200)) % (W + 200) + W + 200) % (W + 200) - 100;
    const cy = gy * 0.24 + i * 20;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 54 * s, 15 * s, 0, 0, TAU);
    ctx.ellipse(cx + 36 * s, cy + 5 * s, 38 * s, 12 * s, 0, 0, TAU);
    ctx.fill();
  }
  // far mountains (hazy, 0.35× parallax)
  const mOff = cam * 0.35 * s;
  ctx.fillStyle = env.mountain;
  ctx.save(); ctx.globalAlpha = 0.75;
  ctx.beginPath(); ctx.moveTo(0, gy);
  for (let x = 0; x <= W; x += 26) ctx.lineTo(x, gy - 86 * s - 66 * s * Math.abs(Math.sin((x + mOff) * 0.004 + 1.3)));
  ctx.lineTo(W, gy); ctx.fill(); ctx.restore();
  // near hills (0.65× parallax)
  const hOff = cam * 0.65 * s;
  ctx.fillStyle = env.hill;
  ctx.beginPath(); ctx.moveTo(0, gy);
  for (let x = 0; x <= W; x += 26) ctx.lineTo(x, gy - 38 * s - 32 * s * Math.sin((x + hOff) * 0.006 + 2));
  ctx.lineTo(W, gy); ctx.fill();
  drawProps(ctx, env.from, 1 - env.t, gy, s, wx, W);
  drawProps(ctx, env.to, env.t, gy, s, wx, W);
  // ground with grass lip
  const gr = ctx.createLinearGradient(0, gy, 0, H);
  gr.addColorStop(0, env.groundTop); gr.addColorStop(1, env.groundBottom);
  ctx.fillStyle = gr; ctx.fillRect(-12, gy, W + 24, H - gy + 12);
  ctx.fillStyle = shade(rgbHex(env.groundTop), 0.18);
  ctx.fillRect(-12, gy, W + 24, 3 * s);
  drawGroundPattern(ctx, env.from, 1 - env.t, gy, H, s, wx, W);
  drawGroundPattern(ctx, env.to, env.t, gy, H, s, wx, W);
  // pebbles across the full lane (world-anchored)
  ctx.fillStyle = shade(rgbHex(env.groundBottom), -0.15);
  for (let i = 0; i < 34; i++) {
    const pxw = (i * 761) % LANE_W;
    const px = wx(pxw);
    if (px < -20 || px > W + 20) continue;
    const py = gy + 8 * s + ((i * 353) % 40) * s * 0.5;
    ctx.beginPath(); ctx.ellipse(px, py, (2 + (i % 3)) * s, (1.2 + (i % 2)) * s, 0, 0, TAU); ctx.fill();
  }

  drawAmbient(ctx, env.from, 1 - env.t, t, cam, gy, s, W);
  drawAmbient(ctx, env.to, env.t, t, cam, gy, s, W);

  // Bases consume the same Era visual package as the battlefield.
  drawBase(ctx, engine.player.base, engine.campaign.theme.basePlayer, engine.campaign.eras[engine.player.era - 1].visual, gy, s, engine.player.base.popT ?? 2, t, wx, W);
  drawBase(ctx, engine.enemy.base, engine.campaign.theme.baseEnemy, engine.campaign.eras[engine.enemy.era - 1].visual, gy, s, engine.enemy.base.popT ?? 2, t, wx, W);

  // dust particles behind units
  for (const pa of engine.particles) {
    if (pa.kind !== 'dust' && pa.kind !== 'smoke') continue;
    const px = wx(pa.x);
    if (px < -30 || px > W + 30) continue;
    const a = clamp(1 - pa.t / pa.life, 0, 1);
    ctx.save(); ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = pa.color;
    ctx.beginPath(); ctx.arc(px, gy + pa.y * s, pa.size * (0.7 + pa.t * 2) * s, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // units sorted by x for overlap depth (cull off-screen)
  const units = [...engine.units].sort((a, b) => a.x - b.x);
  for (const u of units) {
    const ux = wx(u.x);
    if (ux < -80 || ux > W + 80) continue;
    // tier III/II units render slightly bigger
    drawUnit(ctx, u, ux, gy, s * (1 + u.tier * 0.06));
    // chunked unit HP bar (only when damaged) — max uses resolved stats
    if (u.hp < u.maxHp && u.state !== 'die') {
      const bw = 26 * s * u.def.rig.scale;
      chunkedBar(ctx, ux - bw / 2, gy - (52 * u.def.rig.scale + (u.def.rig.kind === 'flyer' ? (u.def.rig.hover ?? 26) : 0)) * s, bw, 3.5 * s,
        u.hp, u.maxHp, u.side === 'player' ? '#5ef08a' : '#ff8b6b', 5, u.hitFlash);
    }
    const py = gy - (58 * u.def.rig.scale + (u.def.rig.kind === 'flyer' ? (u.def.rig.hover ?? 26) : 0)) * s;
    // veteran rank pip
    if (u.veteran && u.state !== 'die') {
      polyS(ctx, [pt(ux - 3.4 * s, py), pt(ux, py - 4.4 * s), pt(ux + 3.4 * s, py), pt(ux, py + 1.6 * s)], '#ffd25a', 1.2);
    }
    // tier stars (gold dots left of the vet pip position)
    if (u.tier > 0 && u.state !== 'die') {
      ctx.fillStyle = '#ffd25a';
      for (let k = 0; k < u.tier; k++) {
        ctx.beginPath(); ctx.arc(ux - 8 * s - k * 5 * s, py, 1.8 * s, 0, TAU); ctx.fill();
      }
    }
  }

  // projectiles
  for (const p of engine.projectiles) {
    const px = wx(p.x);
    if (px < -40 || px > W + 40) continue;
    drawProjectile(ctx, p, px, gy, s);
  }

  // sparks / flashes over units
  for (const pa of engine.particles) {
    if (pa.kind === 'dust' || pa.kind === 'smoke') continue;
    const px = wx(pa.x);
    if (px < -30 || px > W + 30) continue;
    const a = clamp(1 - pa.t / pa.life, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = pa.color;
    ctx.fillRect(px - pa.size / 2, gy + pa.y * s - pa.size / 2, pa.size * s, pa.size * s);
    ctx.restore();
  }

  // specials
  for (const fx of engine.specialFx) drawSpecialFx(ctx, fx, wx(fx.x), gy, s, H);

  // floating gold
  for (const f of engine.floats) {
    const px = wx(f.x);
    if (px < -60 || px > W + 60) continue;
    ctx.save(); ctx.globalAlpha = clamp(1 - f.t / 0.9, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = `bold ${12 * s}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(f.text, px, gy + f.y * s);
    ctx.restore();
  }

  // Subtle era color grade; kept below UI overlays for gameplay readability.
  ctx.save(); ctx.globalAlpha = env.lightStrength; ctx.fillStyle = env.lightTint;
  ctx.fillRect(-12, -12, W + 24, H + 24); ctx.restore();

  ctx.restore();

  // ---------- screen-fixed overlays ----------
  drawCornerBars(ctx, W);
  drawMinimap(ctx, W);

  // enemy doctrine toast
  if (engine.doctrineToast) {
    const dt2 = engine.doctrineToast;
    const a = dt2.t < 0.3 ? dt2.t / 0.3 : dt2.t > 2.3 ? clamp(1 - (dt2.t - 2.3) / 0.7, 0, 1) : 1;
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = 'bold 13px -apple-system, sans-serif';
    const tw = ctx.measureText(dt2.text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeStyle = 'rgba(255,107,107,0.6)'; ctx.lineWidth = 1;
    const bx2 = W / 2 - tw / 2 - 12, by2 = 84;
    ctx.beginPath();
    (ctx as any).roundRect ? (ctx as any).roundRect(bx2, by2, tw + 24, 26, 13) : ctx.rect(bx2, by2, tw + 24, 26);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd9d9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(dt2.text, W / 2, by2 + 13);
    ctx.restore();
  }

  // evolve flash overlay (full-screen white/gold, fading)
  if (engine.evolveFlash > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(engine.evolveFlash, 0, 0.85);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fff8e0'); g.addColorStop(1, '#ffd25a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** Both base HP bars pinned to the top corners — always visible even when the
 *  bases themselves are scrolled off-screen. */
function drawCornerBars(ctx: CanvasRenderingContext2D, W: number): void {
  const y = 64, h = 9, w = Math.min(W * 0.24, 190);
  const P = engine.player.base, E = engine.enemy.base;
  chunkedBar(ctx, 12, y, w, h, P.hp, P.maxHp, P.hp / P.maxHp > 0.5 ? '#5ef08a' : P.hp / P.maxHp > 0.25 ? '#ffd25a' : '#ff6b6b', 8, P.hitT);
  chunkedBar(ctx, W - 12 - w, y, w, h, E.hp, E.maxHp, E.hp / E.maxHp > 0.5 ? '#ff8b6b' : '#ff5a5a', 8, E.hitT);
  ctx.fillStyle = '#ffffffcc';
  ctx.font = 'bold 9px -apple-system, sans-serif';
  ctx.textAlign = 'left'; ctx.fillText('YOUR BASE', 13, y - 3);
  ctx.textAlign = 'right'; ctx.fillText('ENEMY BASE', W - 13, y - 3);
}

/** Clickable minimap strip: bases, unit dots, and the camera window. */
function drawMinimap(ctx: CanvasRenderingContext2D, W: number): void {
  const w = Math.min(W * 0.36, 300), h = 12;
  const x = (W - w) / 2, y = 58;
  minimapRect.x = x; minimapRect.y = y - 6; minimapRect.w = w; minimapRect.h = h + 12;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h);
  ctx.fill(); ctx.stroke();
  const mm = (worldX: number): number => x + (worldX / LANE_W) * w;
  // bases
  ctx.fillStyle = '#5ac8ff'; ctx.fillRect(mm(LANE_L) - 2, y + 2, 4, h - 4);
  ctx.fillStyle = '#ff6b6b'; ctx.fillRect(mm(LANE_R) - 2, y + 2, 4, h - 4);
  // units
  for (const u of engine.units) {
    if (u.state === 'die') continue;
    ctx.fillStyle = u.side === 'player' ? '#7ee0ff' : '#ff8b6b';
    ctx.fillRect(mm(u.x) - 1, y + h / 2 - 1.5, 2, 3);
  }
  // camera window
  ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = 1.5;
  ctx.strokeRect(mm(camera.x), y - 1.5, (VIEW_W / LANE_W) * w, h + 3);
  ctx.restore();
}

/** Reset renderer transition state when a battle starts. */
export function resetRenderState(): void {
  dispEra = engine.player ? engine.player.era - 1 : 0;
  lastFrame = 0;
  camera.x = 0;              // open on your own base
  camera.target = null;
}
