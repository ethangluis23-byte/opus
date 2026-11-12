// Vegetation kit: grass, trees, bushes, ivy, hanging vines, flowers, moss. Everything sways with a shared wind
// and most things accept a growth amount so overgrowth can be animated across years.
import { Path2D } from '@napi-rs/canvas';
import { TAU, RNG, clamp, lerp, mix, ease } from '../engine/util.js';
import { lin, shadow } from '../engine/draw.js';

export const LEAF = { deep: '#27562f', dark: '#33733a', mid: '#4b9645', light: '#72b955', lime: '#a3d56a', olive: '#7a9440', teal: '#2f7d5c', dry: '#b9a45a', stem: '#3a4a2a' };

// Shared wind signal in [-1, 1]; pass world x so neighbouring plants move as a wave.
export const wind = (t, x = 0) => Math.sin(t * 1.15 + x * 0.011) * 0.6 + Math.sin(t * 2.6 + x * 0.027 + 1.7) * 0.4;

// A strip of grass blades along a ground line. o: {h, density (blades per px), seed, t, colors, w, yVar}
export function grass(c, x0, x1, y, o = {}) {
  const h = o.h ?? 26, seed = o.seed ?? 1, t = o.t ?? 0, cols = o.colors ?? [LEAF.dark, LEAF.mid, LEAF.light];
  const n = Math.max(1, Math.round((x1 - x0) * (o.density ?? 0.35))), r = RNG(seed), paths = cols.map(() => new Path2D()), yv = o.yVar ?? 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), hh = h * r.range(0.45, 1.25), w = r.range(1.6, 3.4) * (o.w ?? 1), k = r.int(0, cols.length - 1), yy = y + r.range(-yv, yv);
    const lean = (wind(t, x) * 0.2 + r.range(-0.25, 0.25)) * hh, p = paths[k];
    p.moveTo(x - w, yy);
    p.quadraticCurveTo(x - w * 0.4 + lean * 0.45, yy - hh * 0.6, x + lean, yy - hh);
    p.quadraticCurveTo(x + w * 0.6 + lean * 0.45, yy - hh * 0.5, x + w, yy);
    p.closePath();
  }
  paths.forEach((p, k) => { c.fillStyle = cols[k]; c.fill(p); });
}

const TREE_PAL = [
  { deep: '#27562f', mid: '#3f8a40', light: '#69b24f', hi: '#9fd168' },
  { deep: '#2c5a2a', mid: '#4f8f3a', light: '#84b84a', hi: '#b6d76a' },
  { deep: '#1f4f3a', mid: '#2f7d55', light: '#55a56a', hi: '#8fcf8a' },
  { deep: '#31602c', mid: '#5a9a3e', light: '#8cc152', hi: '#c0e070' },
];

// Layered foliage mass lit from the upper left. clusters: [[x, y, r], ...]
function foliage(c, clusters, pal, cy, ry) {
  const pass = (dx, dy, k, col, pred) => {
    const p = new Path2D();
    for (const [x, y, r] of clusters) { if (pred && !pred(y)) continue; p.moveTo(x + dx * r + k * r, y + dy * r); p.arc(x + dx * r, y + dy * r, k * r, 0, TAU); }
    c.fillStyle = col; c.fill(p);
  };
  pass(0.12, 0.17, 1.04, pal.deep);
  pass(0, 0, 0.95, pal.mid);
  pass(-0.2, -0.24, 0.66, pal.light, (y) => y < cy + ry * 0.35);
  pass(-0.36, -0.44, 0.3, pal.hi, (y) => y < cy);
}

// A tree rooted at (x, y). o: {h, seed, kind: 'round'|'oak'|'poplar'|'pine'|'birch'|'willow'|'sapling', t, grow (0..1),
//   spread, pal, bark, shadow, sway}
export function tree(c, x, y, o = {}) {
  const grow = clamp(o.grow ?? 1);
  if (grow < 0.02) return;
  const seed = o.seed ?? 1, r = RNG(seed * 7 + 3), kind = o.kind || 'round', t = o.t ?? 0;
  const h = (o.h ?? 320) * lerp(0.1, 1, ease.out(grow)), pal = o.pal || TREE_PAL[seed % TREE_PAL.length];
  const sw = wind(t, x) * (o.sway ?? 1), spread = o.spread ?? 1;
  c.save();
  c.translate(x, y);
  if (o.shadow !== 0) shadow(c, 0, 0, h * 0.36, h * 0.03 + 5, o.shadow ?? 0.22);
  const bark = o.bark ?? (kind === 'birch' ? '#e6e2d6' : '#6c4c36');
  const lean = r.range(-0.07, 0.07) * h;

  if (kind === 'sapling') {
    c.strokeStyle = '#5d6b3a'; c.lineWidth = Math.max(2, h * 0.035); c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(lean * 0.4, -h * 0.5, lean + sw * h * 0.04, -h); c.stroke();
    const p = [new Path2D(), new Path2D()], n = 5 + r.int(0, 3);
    for (let i = 0; i < n; i++) {
      const u = 0.35 + (0.65 * i) / (n - 1), side = i % 2 ? 1 : -1, px = lean * u * u + sw * h * 0.04 * u, py = -h * u;
      const a = side * r.range(0.4, 0.9) - 0.2 + sw * 0.08, s = h * r.range(0.13, 0.2), ca = Math.cos(a - Math.PI / 2) * s * side, sa = Math.sin(a - Math.PI / 2) * s, q = p[i % 2];
      const tx = px + (side > 0 ? Math.sin(a) : Math.sin(a)) * s, ty = py - Math.abs(Math.cos(a)) * s * 0.6;
      q.moveTo(px, py); q.quadraticCurveTo(px + (tx - px) * 0.4 - sa * 0.35, py + (ty - py) * 0.4 - s * 0.3, tx, ty); q.quadraticCurveTo(px + (tx - px) * 0.6 + sa * 0.2, py + (ty - py) * 0.6 + s * 0.28, px, py);
      void ca;
    }
    c.fillStyle = pal.mid; c.fill(p[0]); c.fillStyle = pal.light; c.fill(p[1]);
    c.restore();
    return;
  }

  const tw = h * (kind === 'poplar' || kind === 'birch' ? 0.035 : kind === 'pine' ? 0.04 : 0.06);
  const crownY = -h * (kind === 'pine' ? 0.9 : 0.62);
  const tp = new Path2D();
  tp.moveTo(-tw * 1.5, 0); tp.quadraticCurveTo(-tw * 0.9, -h * 0.08, lean * 0.3 - tw * 0.8, -h * 0.3);
  tp.lineTo(lean - tw * 0.4, crownY); tp.lineTo(lean + tw * 0.4, crownY);
  tp.lineTo(lean * 0.3 + tw * 0.8, -h * 0.3); tp.quadraticCurveTo(tw * 0.9, -h * 0.08, tw * 1.5, 0); tp.closePath();
  c.fillStyle = lin(c, -tw, 0, tw, 0, [[0, mix(bark, '#ffffff', 0.18)], [0.5, bark], [1, mix(bark, '#000000', 0.32)]]);
  c.fill(tp);
  if (kind === 'birch') {
    c.fillStyle = '#4a4138';
    for (let i = 0; i < 7; i++) { const u = 0.08 + i * 0.11; c.fillRect(lean * u * 0.6 - tw * 0.7 + (i % 2) * tw * 0.6, -h * u * 0.6 - 2, tw * 0.8, 3); }
  }

  if (kind === 'pine') {
    const tiers = 5, dk = pal.deep, md = mix(pal.mid, '#1f4f3a', 0.35), lt = mix(pal.light, '#2f7d55', 0.4);
    for (let i = 0; i < tiers; i++) {
      const y0 = -h * (0.2 + i * 0.15), hw = h * 0.25 * (1 - i * 0.16) * spread, th = h * 0.3, cx = lean * (0.3 + i * 0.14) + sw * h * 0.006 * (i + 1);
      const tier = (col, shrink, off) => {
        c.fillStyle = col; c.beginPath(); c.moveTo(cx + off, y0 - th);
        const z = 5;
        for (let k = 0; k <= z; k++) { const u = k / z, px = cx + off + lerp(hw, -hw, u) * shrink; c.lineTo(px, y0 + (k % 2 ? -h * 0.03 : 0)); }
        c.closePath(); c.fill();
      };
      tier(dk, 1, h * 0.012); tier(md, 0.96, 0); 
      c.save(); c.beginPath(); c.rect(cx - hw * 1.2, y0 - th, hw * 1.15, th * 1.2); c.clip(); tier(lt, 0.9, -h * 0.01); c.restore();
    }
    c.restore();
    return;
  }

  // limbs
  c.strokeStyle = mix(bark, '#000000', 0.2); c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const side = i === 1 ? 1 : -1, by = -h * r.range(0.42, 0.58);
    c.lineWidth = tw * r.range(0.45, 0.7);
    c.beginPath(); c.moveTo(lean * 0.5, by); c.quadraticCurveTo(lean * 0.5 + side * h * 0.08, by - h * 0.1, lean + side * h * r.range(0.12, 0.2) * spread, by - h * r.range(0.16, 0.24)); c.stroke();
  }
  const narrow = kind === 'poplar';
  const cx = lean + sw * h * 0.012, cy = -h * (narrow ? 0.58 : 0.72), rx = h * (narrow ? 0.12 : kind === 'birch' ? 0.26 : 0.36) * spread, ry = h * (narrow ? 0.4 : 0.29);
  const n = narrow ? 9 : kind === 'birch' ? 9 : 12, cl = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.range(-0.25, 0.25), f = Math.sqrt(r()) * 0.82;
    const cr = h * r.range(0.11, 0.17) * (narrow ? 0.72 : kind === 'birch' ? 0.75 : 1);
    cl.push([cx + Math.cos(a) * rx * f + wind(t, x + i * 53) * h * 0.007, cy + Math.sin(a) * ry * f * 0.92, cr]);
  }
  cl.push([cx, cy, h * 0.17 * (narrow ? 0.7 : 1)]);
  cl.sort((a, b) => a[1] - b[1] > 0 ? -1 : 1);
  foliage(c, cl, pal, cy, ry);
  if (kind === 'willow') {
    c.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const u = (i + 0.5) / 16, sx = cx + lerp(-rx, rx, u) * 0.95, sy = cy + ry * (0.55 - 0.5 * Math.abs(u - 0.5)), len = h * r.range(0.22, 0.4), dx = wind(t, x + i * 31) * h * 0.03;
      c.strokeStyle = i % 2 ? pal.light : pal.mid; c.lineWidth = h * r.range(0.012, 0.022);
      c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx + dx * 0.3, sy + len * 0.5, sx + dx, sy + len); c.stroke();
    }
  }
  c.restore();
}

// Rounded shrub sitting on the ground. o: {w, h, seed, t, pal, flowers: colour}
export function bush(c, x, y, o = {}) {
  const w = o.w ?? 160, h = o.h ?? 90, seed = o.seed ?? 1, r = RNG(seed * 5 + 11), t = o.t ?? 0, pal = o.pal || TREE_PAL[seed % TREE_PAL.length];
  const n = Math.max(4, Math.round(w / 32)), cl = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, rr = h * (0.42 + 0.34 * Math.sin(u * Math.PI)) * r.range(0.85, 1.15);
    cl.push([x - w / 2 + u * w + wind(t, x + i * 41) * 1.6, y - rr * 0.8, rr]);
  }
  c.save();
  c.beginPath(); c.rect(x - w, y - h * 3, w * 2, h * 3 + 1); c.clip();
  foliage(c, cl, pal, y - h * 0.5, h * 0.5);
  if (o.flowers) {
    c.fillStyle = o.flowers;
    for (let i = 0; i < n * 3; i++) { const fx = x + r.range(-w / 2, w / 2), fy = y - r.range(h * 0.25, h * 0.95); c.beginPath(); c.arc(fx, fy, r.range(2.2, 4), 0, TAU); c.fill(); }
  }
  c.restore();
}

const ivyCache = new Map();
function ivyGeom(w, h, seed, dens) {
  const key = `${Math.round(w)}|${Math.round(h)}|${seed}|${dens}`;
  let g = ivyCache.get(key);
  if (g) return g;
  const r = RNG(seed * 13 + 1), stems = [], leaves = [];
  const grow = (x, y, ang, maxLen, depth) => {
    const pts = [[x, y]];
    let len = 0;
    while (len < maxLen && y > 0 && pts.length < 500) {
      ang += r.range(-0.42, 0.42); ang = lerp(ang, -Math.PI / 2, 0.12);
      x += Math.cos(ang) * 13; y += Math.sin(ang) * 13; len += 13;
      if (x < 4 || x > w - 4) { ang = -Math.PI - ang; x = clamp(x, 4, w - 4); }
      pts.push([x, y]);
      const ord = 1 - y / h, nl = r.int(1, 2);
      for (let k = 0; k < nl; k++) leaves.push({ x: x + r.range(-17, 17), y: y + r.range(-13, 13), s: r.range(6.5, 12.5), a: r.range(0, TAU), k: r.int(0, 2), ord: clamp(ord + r.range(-0.03, 0.05)), th: r(), ph: r.range(0, TAU) });
      if (depth < 2 && r.chance(0.1)) grow(x, y, ang + r.sign() * r.range(0.5, 1.1), maxLen * r.range(0.25, 0.5), depth + 1);
    }
    stems.push(pts);
  };
  const nStem = Math.max(2, Math.round((w / 78) * dens));
  for (let i = 0; i < nStem; i++) grow(r.range(8, w - 8), h, -Math.PI / 2 + r.range(-0.3, 0.3), h * r.range(0.55, 1.15), 0);
  leaves.sort((a, b) => a.ord - b.ord);
  g = { stems, leaves };
  ivyCache.set(key, g);
  return g;
}

// Climbing ivy over the wall rectangle with top-left (x, y), size w x h. Grows up from the bottom edge as cover goes 0 -> 1.
// o: {cover, seed, t, density, hang (grow down from the top edge instead), colors}
export function ivy(c, x, y, w, h, o = {}) {
  const cover = clamp(o.cover ?? 1);
  if (cover <= 0.01 || w < 10 || h < 10) return;
  const g = ivyGeom(w, h, o.seed ?? 1, o.density ?? 1), t = o.t ?? 0, cols = o.colors ?? [LEAF.dark, LEAF.mid, LEAF.light];
  c.save();
  c.translate(x, y);
  if (o.hang) { c.translate(0, h); c.scale(1, -1); }
  c.strokeStyle = LEAF.stem; c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  for (const pts of g.stems) {
    let started = false;
    for (const [px, py] of pts) { if (1 - py / h > cover) break; if (started) c.lineTo(px, py); else { c.moveTo(px, py); started = true; } }
  }
  c.stroke();
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  for (const l of g.leaves) {
    if (l.ord > cover) break;
    if (l.th > cover * 1.1 + 0.25) continue;
    const s = l.s * (0.4 + 0.6 * clamp((cover - l.ord) / 0.12)), a = l.a + Math.sin(t * 1.4 + l.ph) * 0.14;
    const ca = Math.cos(a) * s, sa = Math.sin(a) * s, p = paths[l.k];
    p.moveTo(l.x - ca, l.y - sa);
    p.quadraticCurveTo(l.x - sa * 0.75, l.y + ca * 0.75, l.x + ca, l.y + sa);
    p.quadraticCurveTo(l.x + sa * 0.75, l.y - ca * 0.75, l.x - ca, l.y - sa);
  }
  c.save(); c.translate(3, 4); c.globalAlpha *= 0.3; c.fillStyle = '#16260f'; for (const p of paths) c.fill(p); c.restore();
  paths.forEach((p, k) => { c.fillStyle = cols[k]; c.fill(p); });
  c.restore();
}

// Strands hanging from a ledge between x0 and x1 at height y. o: {len, n, seed, t, colors}
export function vines(c, x0, x1, y, o = {}) {
  const len = o.len ?? 160, seed = o.seed ?? 1, t = o.t ?? 0, r = RNG(seed * 3 + 7), n = o.n ?? Math.max(2, Math.round((x1 - x0) / 34));
  const cols = o.colors ?? [LEAF.dark, LEAF.mid, LEAF.light], paths = cols.map(() => new Path2D());
  c.save();
  c.strokeStyle = LEAF.stem; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const sx = x0 + r() * (x1 - x0), L = len * r.range(0.35, 1), dx = wind(t, sx) * L * 0.07 + r.range(-8, 8);
    c.moveTo(sx, y); c.quadraticCurveTo(sx + dx * 0.25, y + L * 0.5, sx + dx, y + L);
    const m = Math.max(2, Math.round(L / 13));
    for (let k = 1; k <= m; k++) {
      const u = k / m, px = sx + dx * u * u, py = y + L * u, s = r.range(6, 11), a = (k % 2 ? 0.5 : Math.PI - 0.5) + r.range(-0.3, 0.3) + wind(t, sx + k * 9) * 0.12;
      const ca = Math.cos(a) * s, sa = Math.sin(a) * s, lx = px + ca * 0.9, ly = py + sa * 0.9, p = paths[r.int(0, cols.length - 1)];
      p.moveTo(lx - ca, ly - sa); p.quadraticCurveTo(lx - sa * 0.7, ly + ca * 0.7, lx + ca, ly + sa); p.quadraticCurveTo(lx + sa * 0.7, ly - ca * 0.7, lx - ca, ly - sa);
    }
  }
  c.stroke();
  paths.forEach((p, k) => { c.fillStyle = cols[k]; c.fill(p); });
  c.restore();
}

// Wild flowers scattered along a ground line. o: {n, seed, t, colors, h, yVar}
export function flowers(c, x0, x1, y, o = {}) {
  const n = o.n ?? 30, r = RNG((o.seed ?? 1) * 17 + 5), t = o.t ?? 0, cols = o.colors ?? ['#ffffff', '#ffd84d', '#ef5b5b', '#c58cf0', '#ff9ecb'], h = o.h ?? 26, yv = o.yVar ?? 0;
  c.save();
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), yy = y + r.range(-yv, yv), hh = h * r.range(0.6, 1.3), col = r.pick(cols), rr = r.range(2.6, 4.6), lean = wind(t, x) * hh * 0.16;
    c.strokeStyle = LEAF.mid; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x, yy); c.quadraticCurveTo(x + lean * 0.4, yy - hh * 0.6, x + lean, yy - hh); c.stroke();
    c.fillStyle = col;
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + i; c.beginPath(); c.arc(x + lean + Math.cos(a) * rr * 0.75, yy - hh + Math.sin(a) * rr * 0.75, rr * 0.62, 0, TAU); c.fill(); }
    c.fillStyle = col === '#ffd84d' ? '#e58e26' : '#ffd84d';
    c.beginPath(); c.arc(x + lean, yy - hh, rr * 0.45, 0, TAU); c.fill();
  }
  c.restore();
}

// Lumpy moss along a ledge or kerb. o: {seed, h, colors}
export function moss(c, x0, x1, y, o = {}) {
  const r = RNG((o.seed ?? 1) * 19 + 2), h = o.h ?? 9, cols = o.colors ?? [LEAF.dark, LEAF.mid];
  cols.forEach((col, k) => {
    const p = new Path2D();
    for (let x = x0 + k * 7; x < x1; x += r.range(9, 20)) { const rr = h * r.range(0.6, 1.3) * (k ? 0.7 : 1); p.moveTo(x + rr, y); p.ellipse(x, y, rr, rr * 0.7, 0, Math.PI, TAU); }
    c.fillStyle = col; c.fill(p);
  });
}

// Fallen leaves on the ground. o: {n, seed, colors, yVar}
export function litter(c, x0, x1, y, o = {}) {
  const r = RNG((o.seed ?? 1) * 23 + 9), n = o.n ?? 40, cols = o.colors ?? ['#b9853a', '#8d6a2f', '#c9a14a', '#7a8a3a'], yv = o.yVar ?? 6;
  for (let i = 0; i < n; i++) {
    c.fillStyle = r.pick(cols);
    c.beginPath(); c.ellipse(x0 + r() * (x1 - x0), y + r.range(-yv, yv), r.range(3, 6.5), r.range(1.6, 3), r.range(0, TAU), 0, TAU); c.fill();
  }
}

// Leafy branch reaching into frame from (x, y) toward angle a: use on a blurred foreground layer to frame a shot.
// o: {len, seed, t, pal}
export function bough(c, x, y, a, o = {}) {
  const len = o.len ?? 520, r = RNG((o.seed ?? 1) * 29 + 4), t = o.t ?? 0, pal = o.pal || TREE_PAL[0];
  c.save();
  c.translate(x, y); c.rotate(a + wind(t, x) * 0.012);
  c.strokeStyle = '#3d2c20'; c.lineCap = 'round'; c.lineWidth = len * 0.035;
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.08, len, len * 0.04); c.stroke();
  const p = [new Path2D(), new Path2D(), new Path2D()];
  for (let i = 0; i < 46; i++) {
    const u = 0.12 + 0.88 * r(), px = len * u, py = -len * 0.08 * Math.sin(u * Math.PI) * 0.6 + len * 0.04 * u * u, s = len * r.range(0.05, 0.09);
    const la = r.range(-1.4, 1.4) + wind(t, px + i * 13) * 0.1, ca = Math.cos(la) * s, sa = Math.sin(la) * s, lx = px + ca, ly = py + sa, q = p[i % 3];
    q.moveTo(lx - ca, ly - sa); q.quadraticCurveTo(lx - sa * 0.62, ly + ca * 0.62, lx + ca, ly + sa); q.quadraticCurveTo(lx + sa * 0.62, ly - ca * 0.62, lx - ca, ly - sa);
  }
  [pal.deep, pal.mid, pal.light].forEach((col, k) => { c.fillStyle = col; c.fill(p[k]); });
  c.restore();
}

// Overgrowth amounts for a number of years without people. Sets use these so every location ages consistently.
const table = (yrs, pts) => {
  const x = Math.log1p(Math.max(0, yrs));
  let i = 1;
  if (x <= Math.log1p(pts[0][0])) return pts[0][1];
  if (x >= Math.log1p(pts[pts.length - 1][0])) return pts[pts.length - 1][1];
  while (Math.log1p(pts[i][0]) < x) i++;
  const a = pts[i - 1], b = pts[i], xa = Math.log1p(a[0]), xb = Math.log1p(b[0]);
  return lerp(a[1], b[1], (x - xa) / (xb - xa));
};
export function aging(years) {
  return {
    years,
    weeds: table(years, [[0, 0], [0.02, 0.03], [1, 0.45], [5, 0.8], [20, 1]]),          // grass and weeds in cracks, lawns gone wild
    vines: table(years, [[0, 0], [0.5, 0.02], [1, 0.14], [5, 0.42], [20, 0.68], [50, 0.84], [100, 0.94], [200, 1]]),
    trees: table(years, [[0, 0], [0.5, 0.02], [1, 0.1], [5, 0.3], [20, 0.62], [50, 0.85], [100, 1], [200, 1.12]]),   // new growth height
    grime: table(years, [[0, 0], [0.02, 0.02], [1, 0.15], [5, 0.35], [20, 0.62], [50, 0.8], [100, 0.95], [200, 1]]),  // dirt, rust, fading paint
    broken: table(years, [[0, 0], [0.5, 0.01], [1, 0.04], [5, 0.18], [20, 0.5], [50, 0.78], [100, 0.94], [200, 1]]),  // share of broken windows
    collapse: table(years, [[0, 0], [5, 0], [20, 0.06], [50, 0.2], [100, 0.45], [200, 0.75]]),                      // structural failure
  };
}
