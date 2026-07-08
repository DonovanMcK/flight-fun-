/** Scene renderer. Layered era-themed background (hazy far hills → near hills
 *  → grass-lip ground with pebbles), era-styled bases + turrets, units via the
 *  rig system, projectiles, particles, special FX, chunked HP bars.
 *  Backgrounds CROSS-FADE between era palettes (dispEra eases toward the
 *  player's era) rather than snapping.
 */
import { engine, LANE_W, LANE_L, LANE_R, SpecialFx } from './engine';
import { drawUnit } from './rig';
import { rrS, cirS, polyS, shade, seg, pt, clamp, lerp, TAU } from './primitives';
import { BaseState, Projectile } from './types';

interface EraEnv { sky1: string; sky2: string; mtn: string; hill: string; g1: string; g2: string; props: 'rock' | 'tree' | 'castle' | 'city' | 'neon'; }
const ERA_ENV: EraEnv[] = [
  { sky1: '#7aa8d8', sky2: '#e8d8b8', mtn: '#7d8a76', hill: '#7c8a52', g1: '#6f7a44', g2: '#4c5730', props: 'rock' },
  { sky1: '#6d95cf', sky2: '#d8ccb0', mtn: '#5f6f82', hill: '#5f7a4a', g1: '#5f6d3a', g2: '#3d4c29', props: 'tree' },
  { sky1: '#5f7fbf', sky2: '#c0b8a8', mtn: '#4d5f7d', hill: '#4f6f46', g1: '#586738', g2: '#37461f', props: 'castle' },
  { sky1: '#7a7684', sky2: '#c8bda8', mtn: '#4c4c58', hill: '#47505a', g1: '#4c5054', g2: '#2f3438', props: 'city' },
  { sky1: '#141433', sky2: '#4a3a6e', mtn: '#26264a', hill: '#2f3057', g1: '#31374a', g2: '#1e2030', props: 'neon' },
];

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

let dispEra = 0;   // eased float era index (0-based) — drives the cross-fade

function blendedEnv(dt: number): EraEnv {
  const target = engine.player ? engine.player.era - 1 : 0;
  dispEra += (target - dispEra) * clamp(dt * 2.2, 0, 1);
  const i0 = clamp(Math.floor(dispEra), 0, 4), i1 = clamp(i0 + 1, 0, 4);
  const t = clamp(dispEra - i0, 0, 1);
  const a = ERA_ENV[i0], b = ERA_ENV[i1];
  const th = engine.campaign.theme;
  const camp = 0.28; // blend toward the campaign tint so timelines stay distinct
  const mixC = (x: string, y: string) => mixHex(x, y, t);
  const env: EraEnv = {
    sky1: mixHex(rgbHex(mixC(a.sky1, b.sky1)), th.tint1, camp),
    sky2: mixHex(rgbHex(mixC(a.sky2, b.sky2)), th.tint2, camp * 0.7),
    mtn: mixHex(rgbHex(mixC(a.mtn, b.mtn)), th.tint1, camp),
    hill: mixHex(rgbHex(mixC(a.hill, b.hill)), th.ground, camp),
    g1: mixHex(rgbHex(mixC(a.g1, b.g1)), th.ground, camp * 0.6),
    g2: mixHex(rgbHex(mixC(a.g2, b.g2)), th.ground, camp * 0.6),
    props: (t > 0.5 ? b : a).props,
  };
  return env;
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
function drawProps(ctx: CanvasRenderingContext2D, env: EraEnv, W: number, gy: number, s: number): void {
  const base = shade(rgbHex(env.hill), -0.35);
  const spots = [0.03, 0.2, 0.34, 0.52, 0.66, 0.8, 0.96];
  spots.forEach((fx, i) => {
    const x = W * fx, k = env.props, sc = s * (0.85 + ((i * 7 + 3) % 5) * 0.12);
    ctx.save(); ctx.translate(x, gy); ctx.fillStyle = base; ctx.strokeStyle = base;
    if (k === 'rock') {
      ctx.beginPath(); ctx.moveTo(-16 * sc, 0); ctx.lineTo(-6 * sc, -15 * sc); ctx.lineTo(8 * sc, -11 * sc); ctx.lineTo(17 * sc, 0); ctx.closePath(); ctx.fill();
    } else if (k === 'tree') {
      ctx.fillRect(-2 * sc, -17 * sc, 4 * sc, 17 * sc);
      ctx.beginPath(); ctx.arc(0, -21 * sc, 11 * sc, 0, TAU); ctx.fill();
    } else if (k === 'castle') {
      ctx.fillRect(-13 * sc, -30 * sc, 26 * sc, 30 * sc);
      for (let b = 0; b < 4; b++) ctx.fillRect(-13 * sc + b * 7.4 * sc, -35 * sc, 4.6 * sc, 5 * sc);
      ctx.fillRect(9 * sc, -42 * sc, 7 * sc, 42 * sc);
    } else if (k === 'city') {
      const h = (24 + ((i * 13 + 2) % 5) * 9) * sc;
      ctx.fillRect(-11 * sc, -h, 22 * sc, h);
      ctx.fillStyle = shade(rgbHex(env.hill), -0.12);
      for (let wy = -h + 5 * sc; wy < -5 * sc; wy += 7 * sc) for (let wx = -8 * sc; wx < 8 * sc; wx += 6.4 * sc) ctx.fillRect(wx, wy, 2.6 * sc, 2.6 * sc);
      if (i % 2) { ctx.fillStyle = base; for (let p = 0; p < 3; p++) ctx.fillRect(-7 * sc + p * 7 * sc, -h - 7 * sc, 3.4 * sc, 7 * sc); }
    } else { // neon
      const h = (28 + ((i * 11 + 1) % 6) * 10) * sc;
      ctx.fillRect(-9 * sc, -h, 18 * sc, h);
      ctx.fillStyle = ['#7ee0ff', '#ff6bd0', '#b07bff'][i % 3];
      ctx.fillRect(-1.6 * sc, -h - 12 * sc, 3.2 * sc, 12 * sc);
      ctx.beginPath(); ctx.arc(0, -h - 13 * sc, 2.6 * sc, 0, TAU); ctx.fill();
    }
    ctx.restore();
  });
}

/* ------------------------------------------------------------------ base */
function drawBase(ctx: CanvasRenderingContext2D, b: BaseState, color: string, era: number, gy: number, s: number, popT: number, t: number): void {
  const w = 58 * s, hgt = (120 + era * 10) * s;
  const isP = b.side === 'player';
  const x = b.x * s;
  const bx = isP ? x - w * 0.7 : x - w * 0.3;
  const pop = 1 + Math.sin(clamp(popT, 0, 1) * Math.PI) * 0.09;

  ctx.save();
  ctx.translate(bx + w / 2, gy);
  ctx.scale(pop, pop);
  ctx.translate(-(bx + w / 2), -gy);

  const by = gy - hgt;
  rrS(ctx, bx, by, w, hgt, 7 * s, b.hitT > 0 ? shade(color, 0.35) : color, 2.5);
  // subtle darker band under the crown
  ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#000';
  ctx.fillRect(bx + 2, by + 3, w - 4, hgt * 0.16); ctx.restore();
  // masonry lines
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(bx + 3, by + hgt * (i / 4)); ctx.lineTo(bx + w - 3, by + hgt * (i / 4)); ctx.stroke();
  }
  // era-specific crown
  if (era <= 2) {
    // thatch / stone lip
    polyS(ctx, [pt(bx - 4 * s, by), pt(bx + w / 2, by - 16 * s), pt(bx + w + 4 * s, by)], shade(color, -0.25), 2);
  } else if (era === 3) {
    for (let i = 0; i < 4; i++) rrS(ctx, bx + i * (w / 4) + 1.5 * s, by - 9 * s, w / 4 - 3 * s, 9 * s, 1.5 * s, color, 2);
  } else if (era === 4) {
    rrS(ctx, bx + 4 * s, by - 10 * s, w - 8 * s, 10 * s, 2 * s, shade(color, -0.2), 2);
    seg(ctx, pt(bx + w / 2, by - 10 * s), pt(bx + w / 2, by - 30 * s), shade(color, -0.3), 2 * s);
    cirS(ctx, bx + w / 2, by - 31 * s, 2.4 * s, '#ff5a5a', 1.4);
  } else {
    polyS(ctx, [pt(bx + 6 * s, by), pt(bx + w / 2, by - 26 * s), pt(bx + w - 6 * s, by)], shade(color, 0.05), 2);
    ctx.save(); ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 4);
    seg(ctx, pt(bx + w / 2, by - 25 * s), pt(bx + w / 2, by - 38 * s), '#7ee0ff', 2.4 * s);
    ctx.restore();
  }
  // arrow-slit windows
  for (let i = 0; i < 2; i++) {
    rrS(ctx, bx + w * 0.44, by + hgt * (0.34 + i * 0.26), w * 0.12, hgt * 0.13, 2.5 * s, shade(color, -0.55), 1.4);
  }
  // flag
  const fx = bx + w / 2;
  seg(ctx, pt(fx, by - (era >= 5 ? 38 : 16) * s), pt(fx, by - (era >= 5 ? 52 : 40) * s), '#3a3a44', 2 * s);
  polyS(ctx, [pt(fx + 1, by - (era >= 5 ? 52 : 40) * s), pt(fx + 18 * s, by - (era >= 5 ? 46 : 34) * s), pt(fx + 1, by - (era >= 5 ? 40 : 28) * s)], isP ? '#5ac8ff' : '#ff6b6b', 1.8);
  // turrets mounted up the inner wall
  b.turrets.forEach((tr, i) => {
    const ty = gy - hgt * 0.72 - i * 20 * s;
    const tx2 = isP ? bx + w + 2 : bx - 2;
    const dir = isP ? 1 : -1;
    const eraCol = ['#8a6a3c', '#9aa0a8', '#b0b4c0', '#5a6a4a', '#7ee0ff'][tr.era - 1];
    rrS(ctx, tx2 - 5 * s, ty, 10 * s, 7 * s, 2 * s, shade(eraCol, -0.15), 1.8);
    ctx.save(); ctx.translate(tx2, ty + 2 * s); ctx.rotate(dir > 0 ? -0.35 : 0.35 + Math.PI);
    seg(ctx, pt(0, 0), pt(13 * s, 0), eraCol, 3 * s);
    ctx.restore();
  });
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
function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, gy: number, s: number): void {
  const x = p.x * s, y = gy + p.y * s;
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
function drawSpecialFx(ctx: CanvasRenderingContext2D, fx: SpecialFx, gy: number, s: number, H: number): void {
  const cx = fx.x * s, r = fx.radius * s;
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

  const s = W / LANE_W;
  const gy = H * 0.78;
  const env = blendedEnv(dt);
  const t = engine.time;

  ctx.save();
  // screen shake (specials only — engine controls magnitude)
  if (engine.shake > 0.2) ctx.translate((Math.random() - 0.5) * engine.shake, (Math.random() - 0.5) * engine.shake);

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, env.sky1); sky.addColorStop(1, env.sky2);
  ctx.fillStyle = sky; ctx.fillRect(-12, -12, W + 24, gy + 12);
  // drifting clouds
  ctx.fillStyle = env.props === 'neon' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.16)';
  for (let i = 0; i < 4; i++) {
    const cx = ((i * W / 3.2 - (t * 7) % (W + 200)) % (W + 200) + W + 200) % (W + 200) - 100;
    const cy = gy * 0.24 + i * 20;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 54 * s, 15 * s, 0, 0, TAU);
    ctx.ellipse(cx + 36 * s, cy + 5 * s, 38 * s, 12 * s, 0, 0, TAU);
    ctx.fill();
  }
  // far mountains (hazy)
  ctx.fillStyle = env.mtn;
  ctx.save(); ctx.globalAlpha = 0.75;
  ctx.beginPath(); ctx.moveTo(0, gy);
  for (let x = 0; x <= W; x += 26) ctx.lineTo(x, gy - 86 * s - 66 * s * Math.abs(Math.sin(x * 0.004 + 1.3)));
  ctx.lineTo(W, gy); ctx.fill(); ctx.restore();
  // near hills
  ctx.fillStyle = env.hill;
  ctx.beginPath(); ctx.moveTo(0, gy);
  for (let x = 0; x <= W; x += 26) ctx.lineTo(x, gy - 38 * s - 32 * s * Math.sin(x * 0.006 + 2));
  ctx.lineTo(W, gy); ctx.fill();
  drawProps(ctx, env, W, gy, s);
  // ground with grass lip
  const gr = ctx.createLinearGradient(0, gy, 0, H);
  gr.addColorStop(0, env.g1); gr.addColorStop(1, env.g2);
  ctx.fillStyle = gr; ctx.fillRect(-12, gy, W + 24, H - gy + 12);
  ctx.fillStyle = shade(rgbHex(env.g1), 0.18);
  ctx.fillRect(-12, gy, W + 24, 3 * s);
  // pebbles
  ctx.fillStyle = shade(rgbHex(env.g2), -0.15);
  for (let i = 0; i < 14; i++) {
    const px = ((i * 761) % LANE_W) * s, py = gy + 8 * s + ((i * 353) % 40) * s * 0.5;
    ctx.beginPath(); ctx.ellipse(px, py, (2 + (i % 3)) * s, (1.2 + (i % 2)) * s, 0, 0, TAU); ctx.fill();
  }

  // bases
  drawBase(ctx, engine.player.base, engine.campaign.theme.basePlayer, engine.player.era, gy, s, engine.player.base.popT ?? 2, t);
  drawBase(ctx, engine.enemy.base, engine.campaign.theme.baseEnemy, engine.enemy.era, gy, s, engine.enemy.base.popT ?? 2, t);

  // dust particles behind units
  for (const pa of engine.particles) {
    if (pa.kind !== 'dust' && pa.kind !== 'smoke') continue;
    const a = clamp(1 - pa.t / pa.life, 0, 1);
    ctx.save(); ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = pa.color;
    ctx.beginPath(); ctx.arc(pa.x * s, gy + pa.y * s, pa.size * (0.7 + pa.t * 2) * s, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // units sorted by x for overlap depth
  const units = [...engine.units].sort((a, b) => a.x - b.x);
  for (const u of units) {
    drawUnit(ctx, u, u.x * s, gy, s);
    // chunked unit HP bar (only when damaged)
    if (u.hp < u.def.hp && u.state !== 'die') {
      const bw = 26 * s * u.def.rig.scale;
      chunkedBar(ctx, u.x * s - bw / 2, gy - (52 * u.def.rig.scale + (u.def.rig.kind === 'flyer' ? (u.def.rig.hover ?? 26) : 0)) * s, bw, 3.5 * s,
        u.hp, u.def.hp, u.side === 'player' ? '#5ef08a' : '#ff8b6b', 5, u.hitFlash);
    }
    // veteran rank pip
    if (u.veteran && u.state !== 'die') {
      const py = gy - (58 * u.def.rig.scale + (u.def.rig.kind === 'flyer' ? (u.def.rig.hover ?? 26) : 0)) * s;
      polyS(ctx, [pt(u.x * s - 3.4 * s, py), pt(u.x * s, py - 4.4 * s), pt(u.x * s + 3.4 * s, py), pt(u.x * s, py + 1.6 * s)], '#ffd25a', 1.2);
    }
  }

  // projectiles
  for (const p of engine.projectiles) drawProjectile(ctx, p, gy, s);

  // sparks / flashes over units
  for (const pa of engine.particles) {
    if (pa.kind === 'dust' || pa.kind === 'smoke') continue;
    const a = clamp(1 - pa.t / pa.life, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = pa.color;
    ctx.fillRect(pa.x * s - pa.size / 2, gy + pa.y * s - pa.size / 2, pa.size * s, pa.size * s);
    ctx.restore();
  }

  // specials
  for (const fx of engine.specialFx) drawSpecialFx(ctx, fx, gy, s, H);

  // floating gold
  for (const f of engine.floats) {
    ctx.save(); ctx.globalAlpha = clamp(1 - f.t / 0.9, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = `bold ${12 * s}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x * s, gy + f.y * s);
    ctx.restore();
  }

  ctx.restore();

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

/** Reset renderer transition state when a battle starts. */
export function resetRenderState(): void {
  dispEra = engine.player ? engine.player.era - 1 : 0;
  lastFrame = 0;
}

void LANE_L; void LANE_R;
