/** Rendering primitives (spec §1): thick black outlines, cel fills with a
 *  single gradient for volume. Every rig draws exclusively through these. */

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const shadeCache = new Map<string, string>();

/** Lighten (pct>0) or darken (pct<0) a hex color. pct in [-1, 1]. */
export function shade(hex: string, pct: number): string {
  const key = hex + '|' + pct.toFixed(3);
  const hit = shadeCache.get(key);
  if (hit) return hit;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (pct >= 0) { r += (255 - r) * pct; g += (255 - g) * pct; b += (255 - b) * pct; }
  else { r *= 1 + pct; g *= 1 + pct; b *= 1 + pct; }
  const out = `rgb(${r | 0},${g | 0},${b | 0})`;
  shadeCache.set(key, out);
  return out;
}

export interface Pt { x: number; y: number; }
export const pt = (x: number, y: number): Pt => ({ x, y });
/** End point of a bone starting at `a`, with absolute angle `ang` and length `len`. */
export const boneEnd = (a: Pt, ang: number, len: number): Pt =>
  ({ x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len });

/** Bone segment: thick black under-stroke + colored stroke on top → outlined limb. */
export function seg(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string, width: number): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#101014';
  ctx.lineWidth = width + 2.6;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

function rrPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Shaded rounded rect: vertical light→dark gradient fill + black outline. */
export function rrS(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string, outline = 2): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(1, shade(color, -0.28));
  rrPath(ctx, x, y, w, h, r);
  ctx.fillStyle = g; ctx.fill();
  if (outline > 0) { ctx.strokeStyle = '#101014'; ctx.lineWidth = outline; ctx.stroke(); }
}

/** Shaded circle: radial highlight top-left → base → darker edge + black outline. */
export function cirS(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, outline = 2): void {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
  g.addColorStop(0, shade(color, 0.35));
  g.addColorStop(0.7, color);
  g.addColorStop(1, shade(color, -0.3));
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g; ctx.fill();
  if (outline > 0) { ctx.strokeStyle = '#101014'; ctx.lineWidth = outline; ctx.stroke(); }
}

/** Outlined filled polygon (flags, blades, fins). */
export function polyS(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, outline = 2): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  if (outline > 0) { ctx.strokeStyle = '#101014'; ctx.lineWidth = outline; ctx.stroke(); }
}

/** Soft dark ellipse under a unit, offset by lunge, for weight. */
export function groundShadow(ctx: CanvasRenderingContext2D, x: number, groundY: number, radius: number, alpha = 0.28): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, groundY, radius, radius * 0.28, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Motion-trail arc for a fast-swinging weapon: translucent wedge between two angles. */
export function swingTrail(ctx: CanvasRenderingContext2D, pivot: Pt, r0: number, r1: number, angFrom: number, angTo: number, color: string): void {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, r1, angFrom, angTo, angFrom > angTo);
  ctx.arc(pivot.x, pivot.y, r0, angTo, angFrom, angFrom <= angTo);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
