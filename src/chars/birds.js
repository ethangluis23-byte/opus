// Birds: the hero scarlet macaw and its parrot cousins, a soaring red-tailed hawk with its ground shadow, the city
// pigeon, butterflies and cheap flocks. Same conventions as drawDog (src/chars/dog.js): (x, y) is the contact point,
// s the scale (dog-compatible units), flip 1 = facing right / -1 = facing left, t seconds of idle life, seed to
// de-synchronise individuals. Every frame is a pure function of the options (no randomness, no state).
//
// drawParrot(c, {
//   x, y, s, flip,  feet / perch contact point (the TOP of the rod the caller draws; toes curl down over it), scale,
//                   facing. Also the anchor in the air: the tucked feet sit ~13*size units below the body centre, so
//                   'fly' -> 'land' -> 'perch' blends finish exactly on the perch point.
//   v,              'macaw' (default) | 'parakeet' | 'amazon' | 'redcrown', a PARROTS entry, or a partial override object
//   pose,           'perch' (default) | 'walk' | 'fly' | 'glide' | 'land', or [from, to, k] to blend (e.g. ['land', 'perch', k])
//   phase, dir,     walk: sidestep-shuffle cycle (2 steps per cycle); advance phase by distance / parrotStride(v, s).
//                   dir 1 (default) = moving towards the facing side, -1 = backwards.
//   flap,           wing-beat phase for 'fly' / 'land' (continuous, 1 per beat; default t * 5). 0 = wings up.
//   beak,           0..1 lower mandible open (talking / calling); animate it, e.g. 0.5 + 0.5 * sin(t * 18) while talking
//   bob,            0..1 intensity of the happy rhythmic head bob (driven by t, ~2.2 bobs/s)
//   preen,          0..1 head turned down into the wing, nibbling
//   wingRaise,      0..1 wings half-opened and raised while perched (squabble display; pair with beak + mood 'angry')
//   food,           true: a sunflower seed held in the beak tip
//   look, tilt,     [dx, dy] pupil direction -1..1 (dx > 0 = forward); extra head rotation, radians (+ = beak down)
//   mood,           'neutral' | 'happy' | 'alert' | 'sad' | 'angry' | 'sleepy' | 'asleep' (lids, pupil pinning, ruffle)
//   lid,            0..1 eyelid override
//   age,            0..1 old bird: faded duller plumage, greyer face patch, ruffled feathers, heavier and slower blink
//   pitch,          radians, extra body pitch (+ = nose up), e.g. when climbing / diving in flight
//   t, seed,        life: breathing, blinking, tail sway, occasional foot shuffle
//   shadow,         false (default) | true | 0..1 strength: soft contact shadow at (x, y)
// })
// Heights at s = 1, perched (head top to tail tip): macaw ~90, redcrown ~52, amazon ~50, parakeet ~45 units; the tail
// hangs below the perch line. Returns {head: [x, y]} — the world position of the head centre (for bubbles / callouts).
// parrotStride(v = 'macaw', s = 1) -> distance moved along the perch per walk cycle.
// PARROTS: { macaw, parakeet, amazon, redcrown } colour / size tables (copy one and override to make a new bird).
//
// drawHawk(c, {x, y, s, flip, t, bank, view, seed})   soaring red-tailed hawk seen from slightly below and to the side:
//   (x, y) = body centre, span ~170 units at s = 1, wings spread with a slow flex over t. bank (radians, ±0.5) rolls
//   it (+ = near wing up), view 0..1 (default 0.55) how much from below. Underside: cream with dark patagial bars,
//   dark wingtips and belly band, brick-red tail.
// hawkShadow(c, {x, y, s, a, squash, rot, blur})  soft dark wing-shaped shadow on the ground (planform, wings along x),
//   centred at (x, y); a = opacity (default 0.35), squash = ground foreshortening (default 0.42), rot radians.
//   Move it over the ground faster than the hawk crosses the sky.
//
// drawPigeon(c, {x, y, s, flip, t, seed, pose, phase, flap, v, look, shadow})   grey city pigeon, ~34 units tall at s = 1.
//   (x, y) = ground point under the feet (also the anchor in flight). pose: 'stand' | 'walk' (head-bobbing strut;
//   advance phase by distance / pigeonStride(s)) | 'peck' (phase = peck cycle, default t * 1.3) | 'fly' (flap =
//   wing-beat phase, default t * 7). v: 'grey' (default) | 'dark' | 'pale'. shadow default 0.25 (0 / false off).
// pigeonStride(s = 1) -> distance per walk cycle.
//
// drawButterfly(c, {x, y, s, t, color, seed, flap, rot})  small flapping butterfly (span ~18 units at s = 1),
//   (x, y) = body centre. color: 'orange' (monarch) | 'yellow' | 'white' | 'blue' | any hex (default: picked by seed).
//   It flutters in place; move (x, y) along a wandering path yourself.
//
// drawFlock(c, {x, y, w, h, n, t, seed, kind, dir, scale, speed, a, color})  many small birds inside the rect
//   (x, y, w, h). kind: 'parrot' (small green parrots, flapping, a few red / yellow / blue accents) | 'pigeon' |
//   'far' (dark distant V silhouettes). dir: 0 (default) = wheel around inside the rect; 1 / -1 = stream across it
//   left->right / right->left, wrapping at the rect edges (make the rect wider than the view to hide the wrap).
//   scale = bird size (1 ~ 16 px parrots), speed multiplies motion, a = opacity, color overrides the 'far' ink.
//   Cheap: one fill per colour for the whole flock (~1-2 ms for n = 120).
import { Path2D } from '@napi-rs/canvas';
import { blob, capsule, circle, oval, union, fill, line, clipped, lin, rad, shadow } from '../engine/draw.js';
import { TAU, DEG, clamp, lerp, mix, alpha, sat, hash, noise1, RNG, wrap, ease } from '../engine/util.js';
import { eye, blink, inkW, gaitFoot } from './rig.js';

// ---------------------------------------------------------------- shared helpers
const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
// 0..1 bump of length dur at a pseudo-random moment in every period (foot shuffles, twitches).
function pulse(t, seed, period, dur) {
  const k = t / period + hash(seed, 7), i = Math.floor(k), at = hash(i, seed + 13) * (period - dur), d = (k - i) * period - at;
  return d > 0 && d < dur ? Math.sin((d / dur) * Math.PI) : 0;
}
// Wings are two edges (leading L, trailing T) sampled at the same stations from shoulder (0) to tip (last).
// That parametrisation lets folded and spread wings morph and lets colour bands follow the wing.
const edgeAt = (E, s) => {
  const i = Math.max(0, Math.min(Math.floor(s), E.length - 2)), f = s - i;
  return [lerp(E[i][0], E[i + 1][0], f), lerp(E[i][1], E[i + 1][1], f)];
};
const wingAt = (W, s, w) => lerp2(edgeAt(W.L, s), edgeAt(W.T, s), w);
const fAt = (arr, s) => { const i = Math.max(0, Math.min(Math.floor(s), arr.length - 2)); return lerp(arr[i], arr[i + 1], s - i); };
function wingOutline(W) {
  const n = W.L.length, tip = W.L[n - 1];
  return blob([...W.L.slice(0, n - 1), [tip[0], tip[1], 1], ...W.T.slice(0, n - 1).reverse()]);
}
// Region between w = lo(s) and w = hi(s) for s in [s0, s1] (lo / hi are station arrays or constants).
function wingRegion(W, s0, s1, lo, hi, steps = 6) {
  const pts = [], at = (f, s) => (typeof f === 'number' ? f : fAt(f, s));
  for (let i = 0; i <= steps; i++) { const s = lerp(s0, s1, i / steps); pts.push(wingAt(W, s, at(lo, s))); }
  for (let i = steps; i >= 0; i--) { const s = lerp(s0, s1, i / steps); pts.push(wingAt(W, s, at(hi, s))); }
  return blob(pts);
}
// Spread-wing edge (u along the body, v out along the span) projected into the body frame for elevation k = sin(angle).
const spreadEdge = (E, X, flex, k, sh) => E.map((q, i) => {
  const u = lerp(q[0], X[i][0], flex), v = lerp(q[1], X[i][1], flex);
  return [sh[0] + u - v * 0.16 * Math.abs(k), sh[1] - v * k];
});
// Wing elevation (deg, + = up) and flex 0..1 over one beat: quick downstroke, slower flexed upstroke. f = 0: wings up.
function beat(f) {
  const u = wrap(f);
  if (u < 0.45) return [lerp(68, -50, ease.io(u / 0.45)), 0];
  const k = (u - 0.45) / 0.55;
  return [lerp(-50, 68, ease.io(k)), Math.sin(k * Math.PI)];
}
// Feather tuft poking out of a silhouette at (bx, by) along (dx, dy).
function tuft(bx, by, dx, dy, w) {
  const ix = bx - dx * 0.9, iy = by - dy * 0.9;
  return blob([[ix - dy * w, iy + dx * w], [bx + dx * 0.2 - dy * w * 0.55, by + dy * 0.2 + dx * w * 0.55], [bx + dx, by + dy, 1], [bx + dx * 0.2 + dy * w * 0.55, by + dy * 0.2 - dx * w * 0.55], [ix + dy * w, iy - dx * w]]);
}
// Rim light along the upper-left edges of a filled shape (screen-space offset, so it survives flips).
function rim(c, path, col, lw, flip, k = 0.34) {
  c.save(); c.clip(path); c.translate(1.1 * flip, 2.4); c.globalAlpha = k; line(c, path, col, lw * 2.4); c.restore();
}
// Toe / leg polyline: dark outline stroke then the fill stroke.
function limb(c, pts, w, col, L, lw) {
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = L; c.lineWidth = w + lw * 1.6; c.stroke();
  c.strokeStyle = col; c.lineWidth = w; c.stroke();
}

// ---------------------------------------------------------------- parrots
export const PARROTS = {
  // Hero: scarlet macaw. Red body, yellow + blue wing bands, long red-and-blue tail, bare white face with feather lines.
  macaw: {
    size: 1, body: '#da2a2c', light: '#f6674c', dark: '#9c1420', line: '#4a0c12', rump: '#2f7fd0',
    wingBase: '#2b72cc', bands: [['#3f9a50', [1, 0.86, 0.62, 0.34, 0]], ['#f7c52c', [1, 0.76, 0.5, 0.22, 0]], ['#da2a2c', [0.6, 0.36, 0.14, 0.02, 0]]],
    tail: 'long', tailLen: 42, tailCol: ['#d8282c', '#2b72cc'], tailTip: '#2b72cc',
    patch: '#f6efe7', patchLine: '#b3343a', beak: '#f2e7d3', beakLine: '#5c4a3a', beakBase: '#3a302c', beakLow: '#2c2523',
    iris: '#f2c641', foot: '#8d8580', beakK: 1,
  },
  // Rose-ringed (ring-necked) parakeet: bright green, red beak, black-and-rose neck ring, long thin tail.
  parakeet: {
    size: 0.47, body: '#79c74a', light: '#b4e57c', dark: '#4a9530', line: '#21441a', nape: '#8fc0d0',
    wingBase: '#3f9a7c', bands: [['#6fbc45', [1, 0.8, 0.55, 0.28, 0]]],
    tail: 'thin', tailLen: 48, tailCol: ['#76c88a', '#3f9486'], tailTip: '#a8d86a',
    beak: '#dc3029', beakLine: '#5e1310', beakLow: '#4a1714', ring: ['#1d1b1e', '#ef8fb2'], eyeRing: '#ee7a3c',
    iris: '#f5ecb0', foot: '#9a8f8a', beakK: 0.84,
  },
  // Amazon parrot: green, yellow forehead, red wing patch, short square tail.
  amazon: {
    size: 0.64, body: '#4fac3e', light: '#8ad664', dark: '#2e7d2c', line: '#1b3f18',
    wingBase: '#2e6a8c', bands: [['#4aa23b', [1, 0.92, 0.76, 0.45, 0.1]]], speculum: '#e03a2e',
    tail: 'square', tailLen: 28, tailCol: ['#4fac3e', '#c8de4c'],
    fore: '#f6d43a', beak: '#8a8077', beakLine: '#2f2a26', beakLow: '#6a625c', eyeRing: '#e9e2d6',
    iris: '#f39a2c', foot: '#9a928c', beakK: 0.88,
  },
  // Red-crowned amazon: green with a red crown, lilac streak behind the eye, pale beak.
  redcrown: {
    size: 0.66, body: '#4cb046', light: '#88d870', dark: '#2c812f', line: '#1a4019',
    wingBase: '#2f6a96', bands: [['#46a540', [1, 0.92, 0.76, 0.45, 0.1]]], speculum: '#e03a2e',
    tail: 'square', tailLen: 28, tailCol: ['#4cb046', '#d2e252'],
    crown: '#de2f2c', cheek: '#8f95de', beak: '#ecd9a6', beakLine: '#5a4a2e', beakLow: '#cdb886', eyeRing: '#e9e2d6',
    iris: '#f4b336', foot: '#9a928c', beakK: 0.88,
  },
};

const PMOODS = {
  neutral: { lid: 0, ang: 0, low: 0, dil: 0.9, ruffle: 0 },
  happy: { lid: 0, ang: 0, low: 0.32, dil: 0.72, ruffle: 0 },
  alert: { lid: 0, ang: 0.06, low: 0, dil: 0.6, ruffle: 0.25 },
  sad: { lid: 0.3, ang: -0.32, low: 0, dil: 1, ruffle: 0 },
  angry: { lid: 0.24, ang: 0.34, low: 0.2, dil: 0.48, ruffle: 1 },
  sleepy: { lid: 0.6, ang: 0, low: 0.1, dil: 1, ruffle: 0.3 },
  asleep: { lid: 1, ang: 0, low: 0, dil: 1, ruffle: 0.45 },
};

// Body-frame pose table (x forward along the body axis, y = belly side). A = body pitch (deg, + nose up),
// (bx, by) body centre from the feet point, nA / nL neck angle and length, spread 0 folded .. 1 open, th wing
// elevation (deg) when not flapping, flapW how much the beat applies, tailA tail droop, fan tail spread,
// tuck / fwd foot modes (grip otherwise), walk = shuffle weight.
const PPOSE = {
  perch: { A: 62, bx: -3, by: -23, nA: 80, nL: 11, spread: 0, th: 0, flapW: 0, tailA: 13, fan: 0.1, tuck: 0, fwd: 0, walk: 0 },
  walk: { A: 62, bx: -3, by: -23, nA: 80, nL: 11, spread: 0, th: 0, flapW: 0, tailA: 13, fan: 0.1, tuck: 0, fwd: 0, walk: 1 },
  fly: { A: 7, bx: 0, by: -13, nA: 26, nL: 12, spread: 1, th: 10, flapW: 1, tailA: -3, fan: 0.15, tuck: 1, fwd: 0, walk: 0 },
  glide: { A: 3, bx: 0, by: -13, nA: 20, nL: 12, spread: 1, th: 22, flapW: 0, tailA: 0, fan: 0.5, tuck: 1, fwd: 0, walk: 0 },
  land: { A: 46, bx: -8, by: -21, nA: 62, nL: 11, spread: 1, th: 76, flapW: 0.28, tailA: 24, fan: 1, tuck: 0, fwd: 1, walk: 0 },
};
function ppose(pose) {
  if (!Array.isArray(pose)) return PPOSE[pose || 'perch'] || PPOSE.perch;
  const a = PPOSE[pose[0]] || PPOSE.perch, b = PPOSE[pose[1]] || PPOSE.perch, k = clamp(pose[2]), o = {};
  for (const key in a) o[key] = lerp(a[key], b[key], k);
  return o;
}

// Geometry in macaw units (each variant is drawn with the same rig scaled by its size).
const BODY = [[18, 1], [13.5, 11], [1, 14.5], [-12, 10.5], [-21, 3], [-15, -6], [-2, -11.5], [11, -10.5]];
const WFOLD = { L: [[12.5, -9], [1, -12.8], [-12, -11], [-26, -6], [-42, 1.5]], T: [[13, -0.5], [5, 8], [-8, 10], [-24, 7], [-42, 1.5]] };
const WEXT = { L: [[5, 0], [4.5, 14], [1.5, 28], [-6, 41], [-18, 56]], T: [[-13, 0], [-20, 14], [-24, 28], [-26, 42], [-18, 56]] };
const WFLEX = { L: [[5, 0], [3, 12], [-2, 22], [-14, 30], [-31, 35]], T: [[-13, 0], [-19, 10], [-25, 18], [-31, 27], [-31, 35]] };
const TAILS = { // [angle offset deg, length k, width, layer 0 = back / 1 = front]
  long: [[-8, 0.8, 4.4, 0], [8, 0.78, 4.4, 0], [-2.5, 0.97, 4.8, 1], [2.5, 1, 5, 1]],
  thin: [[-7, 0.5, 3.4, 0], [7, 0.48, 3.4, 0], [-1.2, 1, 2.7, 1], [1.2, 0.93, 2.7, 1]],
};

// Head (head centre at 0,0, facing +x). Static paths, cached per beak size.
const SKULL = blob([[-12.5, 4], [-11.8, -6], [-5, -12.8], [4, -12.8], [10.5, -8.5], [12.8, 0], [10.5, 8], [2, 12], [-7, 11.2], [-11.8, 8]]);
const PATCH = blob([[10, -9], [12.2, -1], [11.2, 6], [6, 9.2], [-1, 8.8], [-6.8, 4], [-7.2, -3], [-3, -8.4], [3, -10]]);
const FORE = blob([[10, -8.2], [7, -12.8], [0, -14], [-4, -11.5], [-1, -7.6], [4, -6], [9.8, -4]]);
const CROWN = blob([[10.2, -7.8], [7.5, -13], [-1, -14.5], [-9.5, -11.5], [-12, -5.5], [-6, -7.4], [0, -7.2], [6, -5.2]]);
const PATCH_LINES = (() => {
  const pth = new Path2D();
  for (let j = 0; j < 4; j++) {
    const y = 1.2 + j * 2.1;
    for (let x = -5 + j * 1.1; x < 10 - j * 1.3; x += 2.1) { pth.moveTo(x, y + Math.abs(x - 2) * 0.08); pth.lineTo(x + 1.15, y + 0.55 + Math.abs(x - 2) * 0.08); }
  }
  return pth;
})();
const _beaks = new Map();
function beakPaths(k) {
  let b = _beaks.get(k);
  if (b) return b;
  const sc = (pts) => pts.map(([x, y, h]) => [9 + (x - 9) * k, y * k, h]);
  b = {
    upper: blob(sc([[8.5, -8.6], [15, -10.2], [21, -7.2], [24.6, -1], [24.4, 6.2], [21.6, 12.8, 1], [19.8, 8.6], [17, 5.2], [11.5, 5]])),
    base: blob(sc([[11.5, 5.4], [10.5, 0], [14.5, -0.6], [18, 5.6]])),
    lower: blob(sc([[10.5, 3.4], [16.6, 4.4], [19.6, 7], [18.6, 11.2], [13.5, 12.6], [9.4, 10]])),
    tongue: oval(9 + (14.2 - 9) * k, 8 * k, 3.2 * k, 2.1 * k, 0.2),
    tip: [9 + (21.6 - 9) * k, 12.8 * k], gape: [9 + (11 - 9) * k, 5.2 * k], cut: [9 + (19.4 - 9) * k, 8.4 * k],
    nostril: [9 + (12.2 - 9) * k, -5.8 * k],
  };
  _beaks.set(k, b);
  return b;
}

// Variant palettes (faded with age), cached per variant object and age step.
const _pal = new WeakMap(), _vv = new WeakMap();
function palette(V, age) {
  const q = Math.round(clamp(age) * 20) / 20;
  let m = _pal.get(V);
  if (!m) _pal.set(V, (m = new Map()));
  let P = m.get(q);
  if (P) return P;
  const f = (col) => (col && q > 0 ? mix(sat(col, 1 - 0.45 * q), '#b6aca4', 0.16 * q) : col);
  P = {
    ...V, body: f(V.body), light: f(V.light), dark: f(V.dark), rump: f(V.rump), wingBase: f(V.wingBase),
    bands: V.bands.map(([col, w]) => [f(col), w]), speculum: f(V.speculum), tailCol: V.tailCol.map(f), tailTip: f(V.tailTip),
    fore: f(V.fore), crown: f(V.crown), cheek: f(V.cheek), nape: f(V.nape),
    patch: V.patch && mix(V.patch, '#cdc6c0', 0.62 * q), patchLine: V.patchLine && mix(V.patchLine, '#8a7f7a', 0.5 * q),
    iris: mix(V.iris, '#efe7cc', 0.4 * q), beak: V.beak && mix(V.beak, '#d4cbbd', 0.35 * q),
  };
  P.wingLight = mix(P.wingBase, '#ffffff', 0.25);
  m.set(q, P);
  return P;
}

export function parrotStride(v = 'macaw', s = 1) {
  const V = typeof v === 'string' ? PARROTS[v] || PARROTS.macaw : { ...PARROTS.macaw, ...v };
  return 7 * V.size * s;
}

export function drawParrot(c, p = {}) {
  let V0 = PARROTS.macaw;
  if (typeof p.v === 'string') V0 = PARROTS[p.v] || V0;
  else if (p.v) { V0 = _vv.get(p.v); if (!V0) { V0 = { ...PARROTS.macaw, ...p.v }; _vv.set(p.v, V0); } }
  const age = clamp(p.age ?? 0), V = palette(V0, age);
  const t = p.t ?? 0, seed = p.seed ?? 0, flip = p.flip ?? 1, s = (p.s ?? 1) * V.size;
  const P = ppose(p.pose), M = PMOODS[p.mood] || PMOODS.neutral, L = V.line, lw = inkW(s) * 0.92;
  const breath = Math.sin(t * lerp(2.3, 1.6, age) + seed * 1.7);
  const wr = clamp(p.wingRaise ?? 0) * (1 - P.flapW), bobK = clamp(p.bob ?? 0), pre = ease.io(clamp(p.preen ?? 0));
  const bobV = bobK * (0.5 - 0.5 * Math.cos(TAU * 2.2 * t + seed));

  // ---- skeleton ----
  const walkW = P.walk, ph = p.phase ?? 0, wdir = p.dir ?? 1;
  const fl = p.flap ?? t * 5 + hash(seed, 4), [thF, flexF] = beat(fl);
  let A = P.A - wr * 12 + (p.pitch ?? 0) / DEG + walkW * 3.5 * Math.sin(TAU * ph) + Math.sin(t * 0.7 + seed) * 0.8 * (1 - P.flapW);
  let bx = P.bx + walkW * 1.2 * Math.sin(TAU * ph) * wdir, by = P.by + 1.2 * bobV - walkW * 1.3 * Math.abs(Math.sin(TAU * ph));
  by += -1.6 * Math.sin(TAU * wrap(fl) + 0.6) * P.flapW;
  A *= DEG;
  const ca = Math.cos(A), sa = Math.sin(A);
  const bp = (x, y) => [bx + x * ca + y * sa, by - x * sa + y * ca];
  const bk = 1 + 0.012 * breath, bv = 1 + 0.035 * breath;
  const bodyPts = BODY.map(([x, y]) => bp(x * bk, y * bv));
  const nb = bp(9, -5), na = (P.nA - 26 * wr - 7 * age + 4 * bobV) * DEG;
  let hc = [nb[0] + Math.cos(na) * P.nL + 1.2 * bobV, nb[1] - Math.sin(na) * P.nL + 4.5 * bobV];
  hc = lerp2(hc, bp(3, -8), pre);
  const hRot = (p.tilt ?? 0) + bobV * 0.16 + Math.sin(t * 0.8 + seed) * 0.03 + wr * 0.25
    + pre * (2.05 + 0.07 * Math.sin(t * 13 + seed)) - P.flapW * 0.04;
  const neck = capsule(nb[0], nb[1], 11.2, hc[0], hc[1], 9.6);

  // wings (body frame) -> world
  const spread = Math.max(P.spread, wr * 0.62);
  let th = lerp(P.th, thF, P.flapW) + wr * 54 * (1 - P.spread) + Math.sin(t * 9 + seed) * 2.5 * wr;
  if (P.flapW < 0.5) th += Math.sin(t * 1.7 + seed) * 2.5 * P.spread;
  const flex = flexF * P.flapW + (1 - P.flapW) * (0.06 + 0.04 * Math.sin(t * 1.3 + seed)) * P.spread + wr * 0.35;
  const thr = th * DEG, e = 12 * DEG;
  const mkWing = (near) => {
    const k = near ? Math.sin(thr + e) : Math.sin(thr - e), sh = near ? [5, -8] : [7, -10];
    const eL = spreadEdge(WEXT.L, WFLEX.L, flex, k, sh), eT = spreadEdge(WEXT.T, WFLEX.T, flex, k, sh);
    const W = { L: [], T: [] };
    for (let i = 0; i < 5; i++) {
      W.L.push(bp(...lerp2(WFOLD.L[i], eL[i], spread)));
      W.T.push(bp(...lerp2(WFOLD.T[i], eT[i], spread)));
    }
    return W;
  };
  const nearW = mkWing(true), farW = spread > 0.04 ? mkWing(false) : null;

  // tail
  const tSway = Math.sin(t * 1.1 + seed * 2) * 2.2 + walkW * 4 * Math.sin(TAU * ph + 1) + breath * 0.6;
  const tdir = (P.A - wr * 12 + 180 + P.tailA + tSway) * DEG + (A - (P.A - wr * 12) * DEG) * 0.5;
  const tb = bp(-18, 2), TL = V.tailLen;

  // feet: grip (default), tuck (flight) or fwd (landing); walk adds sidesteps, life adds a rare shuffle
  const feet = [];
  for (const far of [true, false]) {
    let ax = far ? -2.5 : 1.5, ay = -4.6;
    if (walkW > 0) { const d = gaitFoot(ph + (far ? 0.5 : 0), { duty: 0.55, stride: 7, lift: 3.4 }); ax += d[0] * wdir * walkW; ay += d[1] * walkW; }
    ay -= 2.2 * pulse(t, seed + (far ? 11 : 3), 7, 0.5) * (1 - P.tuck) * (1 - P.fwd) * (1 - walkW);
    const g = [ax, ay], tk = bp(-3 + (far ? 2 : 0), 12.5), fw = [ax + 1.5, ay + 0.5];
    const ank = lerp2(lerp2(g, tk, P.tuck), fw, P.fwd * (1 - P.tuck));
    const hip = bp(lerp(-2, -9, clamp(P.A / 62)) + (far ? 2 : 0), lerp(11, 10, clamp(P.A / 62)));
    const curl = clamp(1 - P.fwd) * (1 - P.tuck);
    const toeF = [[ank[0] + lerp(4.6, 3.6, curl), ank[1] + lerp(1.4, 2.6, curl)], [ank[0] + lerp(7.6, 5.4, curl), ank[1] + lerp(2.4, 6.2, curl)]];
    const toeB = [[ank[0] - lerp(3.8, 3.2, curl), ank[1] + lerp(1.8, 2.8, curl)], [ank[0] - lerp(5.8, 4.4, curl), ank[1] + lerp(2.8, 6, curl)]];
    if (P.tuck > 0.5) { toeF[0] = [ank[0] - 2.4, ank[1] + 1.6]; toeF[1] = [ank[0] - 4, ank[1] - 0.2]; toeB[0] = [ank[0] - 1.6, ank[1] + 1.8]; toeB[1] = [ank[0] - 3, ank[1] + 0.4]; }
    feet.push({ far, hip, ank, toeF, toeB });
  }

  // ---- draw ----
  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(s * flip, s);
  if (p.shadow) shadow(c, bx * 0.5, 1, 20, 4.5, p.shadow === true ? 0.3 : p.shadow);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const yTop = Math.min(hc[1] - 13, by - 16), yBot = Math.max(by + 15, hc[1] + 12);
  const grad = lin(c, 0, yTop, 0, yBot, [[0, V.light], [0.42, V.body], [1, V.dark]]);

  const paintWing = (W, near) => {
    const o = wingOutline(W);
    if (near) {
      const ys = [...W.L, ...W.T].map((q) => q[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
      fill(c, o, lin(c, 0, y0, 0, y1 + 2, [[0, V.wingLight], [1, V.wingBase]]));
      clipped(c, o, () => {
        for (const [col, w] of V.bands) fill(c, wingRegion(W, 0, 4, 0, w, 6), col);
        if (V.speculum) fill(c, wingRegion(W, 0.6, 2.2, 0.6, 0.98, 4), V.speculum);
        c.strokeStyle = alpha(L, 0.42); c.lineWidth = lw * 0.55; c.beginPath();
        const w0 = V.bands[V.bands.length > 1 ? 1 : 0][1];
        for (const st of [1.9, 2.5, 3.1]) { const a = wingAt(W, st, Math.min(0.9, fAt(w0, st) + 0.06)), b = wingAt(W, st + 0.42, 0.98); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
        c.stroke();
        c.fillStyle = lin(c, 0, y0, 0, y1, [[0, alpha(V.dark, 0)], [0.6, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.4), 0.35)]]);
        c.fillRect(-120, y0 - 5, 240, y1 - y0 + 10);
      });
      rim(c, o, '#ffffff', lw, flip, 0.22);
    } else {
      fill(c, o, mix(V.wingBase, L, 0.32));
      clipped(c, o, () => { const b = V.bands[0]; fill(c, wingRegion(W, 0, 4, 0, b[1], 5), mix(b[0], L, 0.3)); });
    }
    line(c, o, L, lw);
  };
  const paintFoot = (f) => {
    const col = f.far ? mix(V.foot, L, 0.3) : V.foot;
    limb(c, [f.hip, f.ank], 4.2, col, L, lw * 0.9);
    limb(c, [f.ank, ...f.toeB], 2.5, col, L, lw * 0.8);
    limb(c, [f.ank, ...f.toeF], 2.6, col, L, lw * 0.8);
    c.fillStyle = alpha('#1f1a18', 0.85);
    for (const q of [f.toeF[1], f.toeB[1]]) { c.beginPath(); c.arc(q[0], q[1], 0.9, 0, TAU); c.fill(); }
  };

  if (farW) paintWing(farW, false);
  paintFoot(feet[0]);

  // tail feathers: back layer, then front layer (one fill per layer)
  {
    const fan = 0.5 + P.fan * 1.6;
    const layers = [new Path2D(), new Path2D()];
    if (V.tail === 'square') {
      const w0 = 4.6, w1 = 6.5 + P.fan * 4, d = [Math.cos(tdir), -Math.sin(tdir)], n = [-d[1], d[0]];
      const tip = [tb[0] + d[0] * TL, tb[1] + d[1] * TL];
      layers[1].addPath(blob([[tb[0] + n[0] * w0, tb[1] + n[1] * w0], [tip[0] + n[0] * w1, tip[1] + n[1] * w1, 1], [tip[0] + d[0] * 1.2, tip[1] + d[1] * 1.2], [tip[0] - n[0] * w1, tip[1] - n[1] * w1, 1], [tb[0] - n[0] * w0, tb[1] - n[1] * w0]]));
      layers[0].addPath(blob([[tb[0] + n[0] * w0, tb[1] + n[1] * w0], [tip[0] + n[0] * (w1 + 1.6) - d[0] * 3, tip[1] + n[1] * (w1 + 1.6) - d[1] * 3, 1], [tip[0] - d[0] * 4, tip[1] - d[1] * 4], [tb[0] - n[0] * 2, tb[1] - n[1] * 2]]));
    } else {
      for (const [da, lk, w, layer] of TAILS[V.tail]) {
        const a = tdir + da * fan * DEG, d = [Math.cos(a), -Math.sin(a)], n = [-d[1], d[0]], len = TL * lk;
        const curve = (x) => [tb[0] + d[0] * x * len + n[0] * x * x * 2.2, tb[1] + d[1] * x * len + n[1] * x * x * 2.2];
        const q1 = curve(0.35), q2 = curve(0.75), tip = curve(1);
        layers[layer].addPath(blob([[tb[0] + n[0] * w * 0.5, tb[1] + n[1] * w * 0.5], [q1[0] + n[0] * w * 0.6, q1[1] + n[1] * w * 0.6], [q2[0] + n[0] * w * 0.4, q2[1] + n[1] * w * 0.4], [tip[0], tip[1], 1], [q2[0] - n[0] * w * 0.4, q2[1] - n[1] * w * 0.4], [q1[0] - n[0] * w * 0.6, q1[1] - n[1] * w * 0.6], [tb[0] - n[0] * w * 0.5, tb[1] - n[1] * w * 0.5]]));
      }
    }
    const d = [Math.cos(tdir), -Math.sin(tdir)], tipP = [tb[0] + d[0] * TL, tb[1] + d[1] * TL];
    fill(c, layers[0], mix(V.tailCol[1], L, 0.12)); line(c, layers[0], L, lw);
    const g2 = lin(c, tb[0], tb[1], tipP[0], tipP[1], V.tail === 'square'
      ? [[0, V.tailCol[0]], [0.62, V.tailCol[0]], [0.8, V.tailCol[1]], [1, V.tailCol[1]]]
      : [[0, V.tailCol[0]], [0.55, V.tailCol[0]], [0.9, V.tailTip], [1, V.tailTip]]);
    fill(c, layers[1], g2); line(c, layers[1], L, lw);
  }

  // ruffled feathers (age / agitation) poke out from behind the silhouette
  const ruf = Math.max(M.ruffle, age * 0.85);
  if (ruf > 0.15) {
    const tf = new Path2D();
    for (const [x, y, dx, dy] of [[-4, -11, -2, -5], [-12, -8, -4, -3], [12, 9, 4, 3], [4, 13, 1.5, 4.5]]) {
      const q = bp(x, y), d = [dx * ca + dy * sa, -dx * sa + dy * ca];
      tf.addPath(tuft(q[0], q[1], d[0] * ruf * 0.9, d[1] * ruf * 0.9, 0.55));
    }
    fill(c, tf, V.body); line(c, tf, L, lw * 0.85);
  }

  // body + neck: one merged silhouette
  const torso = blob(bodyPts), sil = union(torso, neck);
  fill(c, sil, grad);
  clipped(c, sil, () => {
    if (V.rump) fill(c, oval(...bp(-17, -1), 7, 5.5, -A), alpha(V.rump, 0.9));
    const q = bp(12, 0);
    c.fillStyle = rad(c, q[0], q[1], 17, [[0, alpha(V.light, 0.55)], [1, alpha(V.light, 0)]]);
    c.fillRect(q[0] - 17, q[1] - 17, 34, 34);
    c.fillStyle = lin(c, 0, by + 2, 0, yBot, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), 0.5)]]);
    c.fillRect(-60, by + 2, 120, yBot - by);
  });
  rim(c, sil, V.light, lw, flip);
  line(c, sil, L, lw);
  paintFoot(feet[1]);
  paintWing(nearW, true);

  // ---- head ----
  const ch = Math.cos(hRot), shh = Math.sin(hRot);
  const skull = SKULL.transform({ a: ch, b: shh, c: -shh, d: ch, e: hc[0], f: hc[1] });
  if (ruf > 0.15) {
    const tf = new Path2D();
    for (const [x, y, dx, dy] of [[-10, -8, -3.5, -2.5], [-5.5, -12, -1.5, -4], [-12, -2, -4, -0.5]]) {
      const qx = hc[0] + x * ch - y * shh, qy = hc[1] + x * shh + y * ch, dxx = dx * ch - dy * shh, dyy = dx * shh + dy * ch;
      tf.addPath(tuft(qx, qy, dxx * ruf, dyy * ruf, 0.6));
    }
    fill(c, tf, V.body); line(c, tf, L, lw * 0.85);
  }
  fill(c, skull, grad);
  rim(c, skull, V.light, lw, flip);
  { // outline everywhere except where the head merges into the neck
    c.save();
    const ex = new Path2D(); ex.rect(-1e4, -1e4, 2e4, 2e4); ex.addPath(neck);
    c.clip(ex, 'evenodd'); line(c, skull, L, lw); c.restore();
  }
  c.save();
  c.translate(hc[0], hc[1]); c.rotate(hRot);
  clipped(c, SKULL, () => {
    if (V.patch) {
      fill(c, PATCH, lin(c, 0, -10, 0, 9, [[0, V.patch], [1, mix(V.patch, '#d9c9c0', 0.5)]]));
      c.strokeStyle = alpha(V.patchLine, 0.75); c.lineWidth = lw * 0.42; c.stroke(PATCH_LINES);
      c.strokeStyle = alpha(L, 0.3); c.lineWidth = lw * 0.6; c.stroke(PATCH);
    }
    if (V.fore) fill(c, FORE, V.fore);
    if (V.crown) fill(c, CROWN, V.crown);
    if (V.cheek) fill(c, oval(-5.5, -1.6, 4.6, 2.3, -0.2), alpha(V.cheek, 0.85));
    if (V.nape) fill(c, oval(-8.5, -4, 5, 4.2, 0.3), alpha(V.nape, 0.45));
    if (V.ring) {
      c.lineCap = 'round';
      c.strokeStyle = V.ring[1]; c.lineWidth = 1.7; c.beginPath(); c.moveTo(-3, 11.6); c.quadraticCurveTo(-9.5, 10, -13, 3.5); c.stroke();
      c.strokeStyle = V.ring[0]; c.lineWidth = 2.3; c.beginPath(); c.moveTo(9.4, 7.4); c.quadraticCurveTo(1.5, 15.5, -13.5, 6.5); c.stroke();
    }
  });
  // beak: lower mandible (opens), mouth, upper mandible (kinetic: lifts a little)
  const B = beakPaths(V.beakK), open = clamp(p.beak ?? 0);
  c.save(); c.translate(B.gape[0], B.gape[1]); c.rotate(open * 0.62); c.translate(-B.gape[0], -B.gape[1]);
  if (open > 0.03) { fill(c, B.tongue, '#4a3134'); }
  fill(c, B.lower, V.beakLow); line(c, B.lower, L, lw * 0.9);
  c.restore();
  if (open > 0.03) {
    const lo = [B.gape[0] + (B.cut[0] - B.gape[0]) * Math.cos(open * 0.62) - (B.cut[1] - B.gape[1]) * Math.sin(open * 0.62), B.gape[1] + (B.cut[0] - B.gape[0]) * Math.sin(open * 0.62) + (B.cut[1] - B.gape[1]) * Math.cos(open * 0.62)];
    c.fillStyle = '#3a181c'; c.beginPath(); c.moveTo(B.gape[0] - 0.5, B.gape[1] - 0.6); c.lineTo(B.cut[0], B.cut[1] - 0.6); c.lineTo(lo[0], lo[1]); c.closePath(); c.fill();
    c.save(); c.beginPath(); c.moveTo(B.gape[0] - 0.5, B.gape[1] - 0.6); c.lineTo(B.cut[0], B.cut[1] - 0.6); c.lineTo(lo[0], lo[1]); c.closePath(); c.clip();
    fill(c, oval(B.gape[0] + 3.5 * V.beakK, B.gape[1] + 4 * open * V.beakK, 3.4 * V.beakK, 2.4 * V.beakK, 0.5), '#5a3a3e'); c.restore();
  }
  c.save(); c.translate(9, -3); c.rotate(-open * 0.1); c.translate(-9, 3);
  fill(c, B.upper, lin(c, 0, -10, 0, 12, [[0, mix(V.beak, '#ffffff', 0.25)], [0.6, V.beak], [1, mix(V.beak, V.beakLine, 0.35)]]));
  if (V.beakBase) clipped(c, B.upper, () => fill(c, B.base, alpha(V.beakBase, 0.88)));
  c.save(); c.clip(B.upper); c.globalAlpha = 0.5; c.translate(-0.8, 1.6); line(c, B.upper, '#ffffff', lw * 1.4); c.restore();
  line(c, B.upper, L, lw * 0.9);
  c.fillStyle = alpha(V.beakLine, 0.8); c.beginPath(); c.ellipse(B.nostril[0], B.nostril[1], 0.9, 0.7, 0, 0, TAU); c.fill();
  if (p.food) {
    const [fx, fy] = B.tip;
    c.save(); c.translate(fx - 1.2, fy - 0.6); c.rotate(0.5);
    const sd = oval(0, 0, 3.4, 1.9);
    fill(c, sd, '#d8d0bf'); clipped(c, sd, () => { c.strokeStyle = '#3d3936'; c.lineWidth = 0.75; c.beginPath(); for (const yy of [-0.9, 0.2, 1.3]) { c.moveTo(-3.5, yy); c.lineTo(3.5, yy - 0.3); } c.stroke(); });
    line(c, sd, L, lw * 0.6); c.restore();
  }
  c.restore();
  // eye
  const ex2 = 2.4, ey2 = -2.6, er = 4.5;
  if (V.eyeRing) { c.strokeStyle = V.eyeRing; c.lineWidth = 1.5; c.beginPath(); c.arc(ex2, ey2, er + 1.2, 0, TAU); c.stroke(); }
  const bl = p.blink ?? blink(t * lerp(1, 0.68, age), seed + 1, lerp(3.4, 4.6, age));
  const lid = clamp(Math.max(p.lid ?? M.lid, bl, age * 0.18, pre * 0.55));
  const lidCol = V.patch || mix(V.body, V.light, 0.3);
  eye(c, { x: ex2, y: ey2, r: er, look: p.look || [0.3, 0.05], iris: V.iris, lid, lidAng: M.ang, lidColor: lidCol, line: L, lw: lw * 0.8, low: M.low, dilate: M.dil, irisR: 0.74 });
  c.restore();

  c.restore();
  const hx = (p.x ?? 0) + hc[0] * s * flip, hy = (p.y ?? 0) + hc[1] * s;
  return { head: [hx, hy] };
}

// ---------------------------------------------------------------- hawk
const HAWK = {
  under: '#f2e4ca', body: '#f4e8d2', light: '#fff6e6', dark: '#cdb08a', line: '#3a2414', bar: '#5a341c', tip: '#3c2617',
  trail: '#9d7a5c', head: '#8e5a34', streak: '#7a4a28', tail: '#d4643a', tailLight: '#ec8d5a', band: '#4a2a1c', beak: '#3a3434', cere: '#e8c84a',
};
// Wing planform (u forward along the body, v out along the span) and the slotted "fingers" at the tip.
const HW = { L: [[9, 0], [10.5, 20], [8, 40], [2, 56], [-5, 70]], T: [[-17, 0], [-23, 20], [-25, 40], [-25, 56], [-21, 70]] };
const HFINGERS = [[-3, 80, 1], [-8.5, 74], [-9.5, 83, 1], [-13.5, 75], [-15.5, 81, 1], [-18.5, 73.5], [-21, 78, 1]];
function hawkWingPath(W, map) {
  const pts = [...W.L.map((q) => map(q)), ...HFINGERS.map((q) => [...map(q), q[2]]), ...W.T.slice().reverse().map((q) => map(q))];
  return blob(pts);
}

export function drawHawk(c, p = {}) {
  const t = p.t ?? 0, s = p.s ?? 1, flip = p.flip ?? 1, bank = p.bank ?? 0, seed = p.seed ?? 0, H = HAWK;
  const lw = inkW(s) * 0.85, L = H.line, view = clamp(p.view ?? 0.55) * 1.2;
  const flex = Math.sin(t * 0.9 + seed) * 0.5 + 0.5, dih = (6 + flex * 4) * DEG;
  const kN = Math.sin(dih + bank + view), kF = Math.sin(dih - bank - view);
  const sweep = 0.1 + flex * 0.06;
  const mapW = (k, sh) => (q) => [sh[0] + q[0] - q[1] * sweep * (0.6 + 0.4 * Math.abs(k)), sh[1] - q[1] * k];
  const wingSet = (k, sh) => {
    const m = mapW(k, sh);
    return { path: hawkWingPath(HW, m), W: { L: HW.L.map(m), T: HW.T.map(m) } };
  };
  const near = wingSet(kN * (1 + 0.03 * Math.sin(t * 1.3 + seed)), [2, -3]), far = wingSet(kF, [4, -1]);
  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(s * flip, s); c.rotate(-bank * 0.25 + Math.sin(t * 0.5 + seed) * 0.03);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const paint = (wg, isNear) => {
    const { path, W } = wg, ys = [...W.L, ...W.T].map((q) => q[1]), y0 = Math.min(...ys) - 12, y1 = Math.max(...ys) + 12;
    const base = isNear ? H.under : mix(H.under, H.dark, 0.45);
    fill(c, path, lin(c, 0, y0, 0, y1, [[0, isNear ? H.light : base], [1, mix(base, H.dark, 0.35)]]));
    clipped(c, path, () => {
      const d = isNear ? 0 : 0.25;
      fill(c, wingRegion(W, 3.2, 4.6, -0.2, 1.3, 3), mix(H.tip, H.under, d));
      fill(c, wingRegion(W, 0.2, 4.2, 0.86, 1.2, 6), alpha(mix(H.trail, H.under, d), 0.85));
      fill(c, wingRegion(W, 0, 2.15, -0.2, 0.15, 5), mix(H.bar, H.under, d));
      const q = wingAt(W, 2.25, 0.3);
      fill(c, oval(q[0], q[1], 4.5, 3, 0.4), mix(H.bar, H.under, d));
      c.strokeStyle = alpha(L, 0.28); c.lineWidth = lw * 0.5; c.beginPath();
      for (const st of [0.8, 1.6, 2.4, 3.0]) { const a = wingAt(W, st, 0.55), b = wingAt(W, st + 0.25, 0.97); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
      c.stroke();
    });
    line(c, path, L, lw);
  };
  paint(far, false);
  // tail (fanned, brick red with a dark subterminal band)
  const tail = blob([[-16, -5], [-38, -13], [-47, -9], [-50, -1], [-47, 7], [-38, 11], [-16, 5]]);
  fill(c, tail, lin(c, -16, 0, -50, 0, [[0, H.tail], [0.6, H.tailLight], [1, H.tail]]));
  clipped(c, tail, () => { c.strokeStyle = alpha(H.band, 0.75); c.lineWidth = 2.6; c.beginPath(); c.moveTo(-42, -14); c.quadraticCurveTo(-47, -1, -42, 12); c.stroke(); });
  line(c, tail, L, lw);
  // body + head
  const body = union(blob([[28, -6], [26, 5], [10, 10.5], [-8, 9], [-19, 4], [-20, -3], [-8, -8.5], [10, -10], [22, -9]]), circle(31, -3.5, 8.6));
  fill(c, body, lin(c, 0, -14, 0, 12, [[0, H.light], [0.5, H.body], [1, H.dark]]));
  clipped(c, body, () => {
    fill(c, oval(34, -6, 10, 7, 0.2), H.head);
    c.fillStyle = alpha(H.streak, 0.85);
    for (let i = 0; i < 7; i++) { c.beginPath(); c.ellipse(4 - i * 3.1, 4 + (i % 2) * 2.2, 1.6, 1, 0.3, 0, TAU); c.fill(); }
    c.fillStyle = lin(c, 0, 0, 0, 12, [[0, alpha(H.dark, 0)], [1, alpha(H.dark, 0.6)]]); c.fillRect(-30, 0, 70, 14);
  });
  rim(c, body, H.light, lw, flip);
  line(c, body, L, lw);
  // beak + eye
  const bk = blob([[37.5, -6.5], [41.5, -6], [44, -2.5], [42.5, 1.6, 1], [41.5, -1.2], [38, -1]]);
  fill(c, bk, H.beak); line(c, bk, L, lw * 0.7);
  fill(c, oval(38.4, -4.6, 1.8, 1.6), H.cere);
  eye(c, { x: 33.5, y: -6.2, r: 2.7, look: [0.5, 0.3], iris: '#6b3a16', lid: 0.18, lidAng: 0.3, lidColor: H.head, line: L, lw: lw * 0.6, irisR: 0.8 });
  paint(near, true);
  c.restore();
}

// Planform (wings along x, head towards -y), cached once.
const HAWK_PLAN = (() => {
  const pth = new Path2D();
  for (const side of [1, -1]) {
    const m = (q) => [side * (6 + q[1]), -q[0] * 0.95];
    pth.addPath(hawkWingPath(HW, m));
  }
  pth.addPath(blob([[0, -36], [6, -28], [8, -6], [5, 12], [0, 17], [-5, 12], [-8, -6], [-6, -28]]));
  pth.addPath(blob([[-5, 12], [-12, 40], [0, 46], [12, 40], [5, 12]]));
  return pth;
})();

export function hawkShadow(c, p = {}) {
  const s = p.s ?? 1, a = p.a ?? 0.35;
  if (a <= 0) return;
  const D = 6000;
  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.rotate(p.rot ?? 0); c.scale(s, s * (p.squash ?? 0.42));
  const m = c.getTransform();
  c.shadowColor = `rgba(10,14,20,${clamp(a)})`; c.shadowBlur = (p.blur ?? 7) * s;
  c.shadowOffsetX = m.a * D; c.shadowOffsetY = m.b * D;
  c.translate(-D, 0);
  c.fillStyle = '#000'; c.fill(HAWK_PLAN);
  c.restore();
}

// ---------------------------------------------------------------- pigeon
const PIGEONS = {
  grey: { body: '#8f99a7', light: '#c3cad3', dark: '#5f6876', line: '#262a33', head: '#707a8a', wing: '#aab2bd', bar: '#2c2f36', prim: '#5d6573', tail: '#808996' },
  dark: { body: '#6c7380', light: '#9aa1ab', dark: '#454b56', line: '#1e2128', head: '#555c69', wing: '#7c838f', bar: '#24262c', prim: '#40454f', tail: '#5d6470' },
  pale: { body: '#c4c3c0', light: '#ecebe7', dark: '#949390', line: '#3a3632', head: '#a9a9ab', wing: '#d6d4cf', bar: '#7a5f4a', prim: '#8f8c88', tail: '#b4b2ae' },
};
const PG_BODY = [[16, 0.5], [10.5, 9.5], [-2, 11], [-14, 6.5], [-21, 1], [-12, -7], [2, -10.5], [12, -7.5]];
const PG_FOLD = { L: [[9.5, -7.5], [0, -10.2], [-9, -8.5], [-18, -4.5], [-28, 0.5]], T: [[10.5, -1], [3, 5.5], [-7, 7], [-17, 4.5], [-28, 0.5]] };
const PG_EXT = { L: [[4, 0], [3.5, 12], [0.5, 24], [-6, 35], [-15, 46]], T: [[-11, 0], [-17, 12], [-20, 24], [-21, 36], [-15, 46]] };
const PG_FLEX = { L: [[4, 0], [2, 10], [-3, 18], [-12, 25], [-25, 29]], T: [[-11, 0], [-16, 9], [-20, 16], [-25, 23], [-25, 29]] };
const PG_SKULL = blob([[-6.2, 1.5], [-5.6, -3.6], [-1.5, -6.6], [3.5, -5.8], [6.2, -2], [6, 2.5], [2.5, 5.6], [-3, 5.4]]);
const PG_BEAK = blob([[4.8, -1.4], [9.6, 0.4], [11, 1.6, 1], [9.2, 2.3], [5, 2]]);
const PG_GAIT = { duty: 0.6, stride: 10, lift: 2.6 };
export const pigeonStride = (s = 1) => PG_GAIT.stride * s;

export function drawPigeon(c, p = {}) {
  const V = PIGEONS[p.v] || PIGEONS.grey, t = p.t ?? 0, s = p.s ?? 1, flip = p.flip ?? 1, seed = p.seed ?? 0;
  const pose = p.pose || 'stand', L = V.line, lw = inkW(s) * 0.85;
  const flying = pose === 'fly', walking = pose === 'walk', pecking = pose === 'peck';
  const ph = p.phase ?? (pecking ? t * 1.3 + hash(seed, 5) : 0);
  const breath = Math.sin(t * 2.6 + seed);
  // head: bob (walk), peck cycle, idle glances
  let hx = 0, hy = 0, hr = Math.sin(t * 0.9 + seed) * 0.05, peckK = 0;
  if (walking) {
    const u = wrap(ph * 2);
    hx = u < 0.68 ? lerp(2.4, -2.4, u / 0.68) : lerp(-2.4, 2.4, ease.io((u - 0.68) / 0.32));
    hy = u < 0.68 ? 0 : -1.2 * Math.sin(((u - 0.68) / 0.32) * Math.PI);
  }
  if (pecking) {
    const u = wrap(ph);
    peckK = u < 0.16 ? ease.io(u / 0.16) : u < 0.62 ? 1 : u < 0.82 ? 1 - ease.io((u - 0.62) / 0.2) : 0;
    const jab = u > 0.16 && u < 0.62 ? Math.abs(Math.sin(((u - 0.16) / 0.46) * TAU)) * 1.6 : 0;
    hy += jab;
  }
  const A = (flying ? 4 : 13 - peckK * 16 + (walking ? 2 * Math.sin(TAU * ph * 2) : 0)) * DEG + (flying ? 0 : breath * 0.01);
  const fl = p.flap ?? t * 7 + hash(seed, 6), [thF, flexF] = beat(fl);
  const bx = flying ? 0 : -2, by = flying ? -13 - 1.4 * Math.sin(TAU * wrap(fl) + 0.6) : -15 + (walking ? -0.8 * Math.abs(Math.sin(TAU * ph)) : 0);
  const ca = Math.cos(A), sa = Math.sin(A), bp = (x, y) => [bx + x * ca + y * sa, by - x * sa + y * ca];
  const nb = bp(9, -3), na = (flying ? 20 : 72) * DEG;
  let hc = [nb[0] + Math.cos(na) * 9.5 + hx, nb[1] - Math.sin(na) * 9.5 + hy];
  hc = lerp2(hc, [nb[0] + 9 + hx, -6.5 + hy], peckK);
  hr += peckK * 1.15;
  const body = blob(PG_BODY.map(([x, y]) => bp(x, y * (1 + 0.03 * breath))));
  const neck = capsule(nb[0], nb[1], 7.4, hc[0], hc[1], 5.2);
  // wings
  const k1 = Math.sin(thF * DEG + 12 * DEG), k2 = Math.sin(thF * DEG - 12 * DEG);
  const mkW = (near) => {
    if (!flying) return { L: PG_FOLD.L.map((q) => bp(q[0], q[1])), T: PG_FOLD.T.map((q) => bp(q[0], q[1])) };
    const k = near ? k1 : k2, sh = near ? [4, -7] : [6, -9];
    return { L: spreadEdge(PG_EXT.L, PG_FLEX.L, flexF, k, sh).map((q) => bp(...q)), T: spreadEdge(PG_EXT.T, PG_FLEX.T, flexF, k, sh).map((q) => bp(...q)) };
  };
  // legs
  const legs = [];
  if (!flying) {
    for (const far of [true, false]) {
      let fx = far ? 1.5 : -1, fy = 0;
      if (walking) { const d = gaitFoot(ph + (far ? 0.5 : 0), PG_GAIT); fx += d[0]; fy = d[1]; }
      const hip = bp(far ? 0 : -2, 9.5), knee = [lerp(hip[0], fx, 0.5) + 1.8, lerp(hip[1], fy - 2.5, 0.5)];
      legs.push({ far, pts: [hip, knee, [fx, fy - 2.2]], foot: [fx, fy] });
    }
  }
  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(s * flip, s);
  const sh0 = p.shadow ?? 0.25;
  if (sh0 && !flying) shadow(c, -2, 0.8, 18, 3.5, sh0 === true ? 0.25 : sh0);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const paintLeg = (g) => {
    const col = g.far ? '#a9504c' : '#d4645e';
    limb(c, g.pts, 2.3, col, L, lw * 0.75);
    const [fx, fy] = g.foot;
    limb(c, [[fx, fy - 2.2], [fx + 4.2, fy - 0.2]], 1.4, col, L, lw * 0.6);
    limb(c, [[fx, fy - 2.2], [fx - 2.6, fy - 0.3]], 1.3, col, L, lw * 0.6);
  };
  const paintWing = (W, near) => {
    const o = wingOutline(W);
    fill(c, o, near ? V.wing : mix(V.wing, L, 0.3));
    clipped(c, o, () => {
      fill(c, wingRegion(W, 2.7, 4.2, -0.2, 1.2, 3), near ? V.prim : mix(V.prim, L, 0.3));
      if (near) {
        fill(c, wingRegion(W, 1.15, 1.45, 0.15, 1, 2), V.bar);
        fill(c, wingRegion(W, 1.8, 2.1, 0.2, 1, 2), V.bar);
        c.fillStyle = lin(c, 0, by - 12, 0, by + 10, [[0, alpha('#ffffff', 0.18)], [1, alpha(V.dark, 0.25)]]); c.fillRect(-60, by - 40, 120, 80);
      }
    });
    line(c, o, L, lw);
  };
  if (flying) paintWing(mkW(false), false);
  if (legs.length) paintLeg(legs[0]);
  // tail
  const td = A + Math.PI + (flying ? 0 : 0.18), tb = bp(-17, 1), dd = [Math.cos(td), -Math.sin(td)], nn = [-dd[1], dd[0]];
  const tip = [tb[0] + dd[0] * 14, tb[1] + dd[1] * 14], tw0 = 3.6, tw1 = flying ? 6.5 : 4.6;
  const tail = blob([[tb[0] + nn[0] * tw0, tb[1] + nn[1] * tw0], [tip[0] + nn[0] * tw1, tip[1] + nn[1] * tw1, 1], [tip[0] - nn[0] * tw1, tip[1] - nn[1] * tw1, 1], [tb[0] - nn[0] * tw0, tb[1] - nn[1] * tw0]]);
  fill(c, tail, lin(c, tb[0], tb[1], tip[0], tip[1], [[0, V.tail], [0.68, V.tail], [0.72, V.bar], [1, V.bar]]));
  line(c, tail, L, lw);
  // body + neck
  const sil = union(body, neck);
  const yTop = hc[1] - 6, yBot = by + 12;
  fill(c, sil, lin(c, 0, yTop, 0, yBot, [[0, V.light], [0.45, V.body], [1, V.dark]]));
  clipped(c, sil, () => {
    const q = lerp2(nb, hc, 0.35);
    c.fillStyle = rad(c, q[0], q[1] + 2, 8, [[0, alpha('#5fae86', 0.85)], [0.5, alpha('#8a63b0', 0.6)], [1, alpha('#8a63b0', 0)]]);
    c.fillRect(q[0] - 9, q[1] - 7, 18, 18);
    c.fillStyle = lin(c, 0, by + 2, 0, yBot, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), 0.5)]]); c.fillRect(-40, by + 2, 80, 12);
  });
  rim(c, sil, V.light, lw, flip);
  line(c, sil, L, lw);
  if (legs.length) paintLeg(legs[1]);
  paintWing(mkW(true), true);
  // head
  const hTo = () => { c.translate(hc[0], hc[1]); c.rotate(hr); };
  c.save(); hTo();
  fill(c, PG_SKULL, lin(c, 0, -7, 0, 6, [[0, mix(V.head, V.light, 0.35)], [1, mix(V.head, V.dark, 0.3)]]));
  c.restore();
  { // outline except where the head merges into the neck
    c.save();
    const ex = new Path2D(); ex.rect(-1e4, -1e4, 2e4, 2e4); ex.addPath(neck);
    c.clip(ex, 'evenodd'); hTo(); line(c, PG_SKULL, L, lw); c.restore();
  }
  c.save(); hTo();
  fill(c, PG_BEAK, '#3d3639'); line(c, PG_BEAK, L, lw * 0.7);
  fill(c, oval(5.6, -1.2, 1.7, 1.1, 0.2), '#ece6df');
  eye(c, { x: 0.6, y: -1.4, r: 2.4, look: p.look || [0.4, 0.1], iris: '#ee7f2a', lid: blink(t, seed + 2), lidColor: V.head, line: L, lw: lw * 0.6, irisR: 0.76, dilate: 0.75 });
  c.restore();
  c.restore();
}

// ---------------------------------------------------------------- butterfly
const BFLY = {
  orange: { wing: '#f39a22', edge: '#2a1a12', dots: '#fff2dc', veins: true },
  yellow: { wing: '#f5dc56', edge: '#8a6a18', dots: null },
  white: { wing: '#f2f0e6', edge: '#4a4a52', dots: null, tips: '#3a3a40' },
  blue: { wing: '#6fa8ee', edge: '#253a6a', dots: '#e9f2ff' },
};
const BF_FORE = blob([[0.4, -1.2], [4.5, -7.5], [9.5, -9.5], [11.2, -6.4], [8.5, -1.6], [1.4, 0.4]]);
const BF_HIND = blob([[0.4, 0.4], [6.5, 0.6], [8.8, 4.5], [6.2, 8.6], [2.2, 7], [0.4, 3]]);
const BF_VEINS = (() => { const v = new Path2D(); v.moveTo(1, -0.5); v.lineTo(8.5, -7.5); v.moveTo(1.2, 0); v.lineTo(9.4, -3.6); v.moveTo(1, 1.2); v.lineTo(6.4, 6.2); v.moveTo(1, 0.9); v.lineTo(7.6, 2.8); return v; })();
const BF_KEYS = ['orange', 'yellow', 'white', 'blue'];

export function drawButterfly(c, p = {}) {
  const t = p.t ?? 0, s = p.s ?? 1, seed = p.seed ?? 0;
  const key = p.color ?? BF_KEYS[Math.floor(hash(seed, 9) * 4)], B = BFLY[key] || { wing: key, edge: mix(key, '#000000', 0.6), dots: null };
  const f = p.flap ?? t * 6.2 + hash(seed, 2) + noise1(t * 1.5, seed) * 0.35;
  const open = 0.5 + 0.5 * Math.cos(TAU * f), sx = lerp(0.12, 1, open);
  const rot = p.rot ?? -0.35 + noise1(t * 0.6, seed + 4) * 0.35, lw = inkW(s) * 0.4;
  c.save();
  c.translate(p.x ?? 0, (p.y ?? 0) + Math.sin(TAU * f) * 0.7 * s); c.rotate(rot); c.scale(s, s);
  c.lineJoin = 'round';
  const wingPair = (side, k) => {
    c.save(); c.scale(side * sx * k, 1);
    for (const w of [BF_HIND, BF_FORE]) {
      fill(c, w, k < 1 ? mix(B.wing, B.edge, 0.3) : B.wing);
      clipped(c, w, () => {
        c.strokeStyle = B.edge; c.lineWidth = B.veins ? 2.2 : 1.2; c.stroke(w);
        if (B.veins) { c.lineWidth = 0.5; c.stroke(BF_VEINS); }
        if (B.tips && w === BF_FORE) fill(c, oval(10, -8, 3, 2.4, 0.4), B.tips);
      });
      if (B.dots) { c.fillStyle = B.dots; for (const [x, y] of [[9.5, -7.6], [10.3, -6.2], [7.6, 6.8], [5.8, 7.8]]) { c.beginPath(); c.arc(x, y, 0.42, 0, TAU); c.fill(); } }
      c.strokeStyle = B.edge; c.lineWidth = lw / Math.max(0.3, sx * k); c.stroke(w);
    }
    c.restore();
  };
  wingPair(-1, 0.86);
  const bd = capsule(0, -3.6, 1.15, 0, 5.2, 0.7);
  fill(c, bd, '#2a211c');
  c.strokeStyle = '#2a211c'; c.lineWidth = 0.45; c.beginPath();
  c.moveTo(-0.3, -4.4); c.quadraticCurveTo(-1, -7, -2.4, -8.6); c.moveTo(0.3, -4.4); c.quadraticCurveTo(1, -7, 2.4, -8.6); c.stroke();
  c.fillStyle = '#2a211c'; c.beginPath(); c.arc(-2.4, -8.6, 0.5, 0, TAU); c.arc(2.4, -8.6, 0.5, 0, TAU); c.fill();
  wingPair(1, 1);
  c.restore();
}

// ---------------------------------------------------------------- flocks
const _flocks = new Map();
function flockData(seed, n) {
  const key = seed * 100003 + n;
  let d = _flocks.get(key);
  if (d) return d;
  const r = RNG(seed * 7919 + 17);
  d = [];
  for (let i = 0; i < n; i++) {
    d.push({ u: r(), v: r(), sz: r.range(0.72, 1.25), ph: r() * TAU, fr: r.range(0.85, 1.2), sp: r.range(0.85, 1.15), rx: r.range(0.1, 0.24), ry: r.range(0.12, 0.34), w1: r(), acc: r() });
  }
  _flocks.set(key, d);
  return d;
}
const FLOCK_COL = {
  parrot: { body: '#5bb544', wing: '#3f8f36', line: '#1c3b18', acc: ['#e8382f', '#f4d23c', '#3f7fd6'] },
  pigeon: { body: '#8f98a6', wing: '#b4bcc6', line: '#2a2e38', acc: ['#5f6876', '#d6d4cf', '#6c7380'] },
};

export function drawFlock(c, o = {}) {
  const x = o.x ?? 0, y = o.y ?? 0, w = o.w ?? 800, h = o.h ?? 300, n = o.n ?? 40, t = o.t ?? 0, seed = o.seed ?? 1;
  const kind = o.kind || 'parrot', dir = o.dir ?? 0, sc = o.scale ?? 1, spd = o.speed ?? 1;
  const D = flockData(seed, n), far = kind === 'far';
  const body = new Path2D(), wings = new Path2D(), acc = [new Path2D(), new Path2D(), new Path2D()];
  const cx0 = x + w / 2 + w * 0.25 * Math.sin(t * 0.17 * spd + seed), cy0 = y + h / 2 + h * 0.2 * Math.sin(t * 0.29 * spd + seed * 2);
  const om = 0.55 * spd * (hash(seed, 1) < 0.5 ? 1 : -1), margin = 40 * sc;
  for (let i = 0; i < n; i++) {
    const b = D[i], sz = b.sz * sc * (far ? 0.8 : 1);
    let px, py, vx, vy;
    if (dir) {
      const span = w + margin * 2, v = 95 * sc * spd * b.sp;
      px = x - margin + wrap(b.u * span + dir * v * t, span);
      py = y + h * (0.1 + 0.8 * b.v) + Math.sin(t * 0.8 * spd + b.ph) * h * 0.05 + Math.sin(px * 0.004 + t * 0.6) * h * 0.06;
      vx = dir; vy = Math.cos(t * 0.8 * spd + b.ph) * 0.12;
    } else {
      const a = om * t * b.sp + b.ph, rx = w * b.rx, ry = h * b.ry;
      px = cx0 + Math.cos(a) * rx + noise1(t * 0.4 + i, seed) * w * 0.03;
      py = cy0 + Math.sin(a) * ry + noise1(t * 0.4 + i, seed + 5) * h * 0.04;
      vx = -Math.sin(a) * rx * om; vy = Math.cos(a) * ry * om;
      const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
    }
    const f = vx < 0 ? -1 : 1, flap = Math.sin(TAU * (t * 4.2 * b.fr * (far ? 0.8 : 1) + b.ph / TAU)), pitch = clamp(vy, -0.6, 0.6);
    const cs = Math.cos(pitch), sn = Math.sin(pitch);
    const P = (lx, ly) => [px + (lx * cs - ly * sn) * sz * f, py + (lx * sn + ly * cs) * sz];
    if (far) {
      const tipY = -flap * 5, a1 = P(-7, tipY), a2 = P(-3, -1.5), m = P(0, 0), b2 = P(3, -1.5), b1 = P(7, tipY);
      body.moveTo(a1[0], a1[1]); body.quadraticCurveTo(a2[0], a2[1], m[0], m[1]); body.quadraticCurveTo(b2[0], b2[1], b1[0], b1[1]);
      continue;
    }
    const tail = kind === 'parrot' ? 9 : 5.5;
    const hd = P(5.5, -0.6), bt = P(-1, 2), tl = P(-1 - tail, 1.6), tp = P(-2, -1.6);
    body.moveTo(hd[0], hd[1]); body.quadraticCurveTo(bt[0], bt[1], tl[0], tl[1]); body.quadraticCurveTo(tp[0], tp[1], hd[0], hd[1]);
    const hp = P(5, -0.6); body.moveTo(hp[0] + 2.1 * sz, hp[1]); body.arc(hp[0], hp[1], 2.1 * sz, 0, TAU);
    const wy = -flap * 7.5, s0 = P(1.8, -0.8), s1 = P(-3.5, -0.4), wt = P(-2.5, wy), wm = P(1, wy * 0.55);
    wings.moveTo(s0[0], s0[1]); wings.quadraticCurveTo(wm[0], wm[1], wt[0], wt[1]); wings.lineTo(s1[0], s1[1]); wings.closePath();
    if (b.acc < 0.42) { const ai = Math.floor(b.acc / 0.14); acc[ai].moveTo(hp[0] + 1.6 * sz, hp[1]); acc[ai].arc(hp[0], hp[1], 1.6 * sz, 0, TAU); }
  }
  c.save();
  if (o.a != null) c.globalAlpha *= o.a;
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (far) {
    c.strokeStyle = o.color ?? '#2a3348'; c.lineWidth = 1.5 * sc; c.stroke(body);
  } else {
    const C = FLOCK_COL[kind] || FLOCK_COL.parrot;
    c.strokeStyle = o.color ?? C.line; c.lineWidth = 1.4 * sc; c.stroke(body); c.stroke(wings);
    c.fillStyle = C.body; c.fill(body);
    for (let i = 0; i < 3; i++) { c.fillStyle = C.acc[i]; c.fill(acc[i]); }
    c.fillStyle = C.wing; c.fill(wings);
  }
  c.restore();
}
