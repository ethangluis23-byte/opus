// Math, easing, deterministic randomness, keyframes and colour helpers.
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (a === b ? (x >= b ? 1 : 0) : clamp((x - a) / (b - a)));
export const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const ss = (a, b, x) => smooth(invLerp(a, b, x));
export const wrap = (x, m = 1) => ((x % m) + m) % m;

export const ease = {
  lin: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in3: (t) => t * t * t,
  out3: (t) => 1 - Math.pow(1 - t, 3),
  io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out5: (t) => 1 - Math.pow(1 - t, 5),
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  elastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
  bounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  hold: (t) => (t < 1 ? 0 : 1),
};

// Keyframes: K(t, [[t0, v0], [t1, v1, 'out3'], ...]). The ease named on a key shapes the segment arriving at it.
// Values may be numbers or equal-length arrays.
export function K(t, keys, def = 'io') {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 1;
  while (keys[i][0] < t) i++;
  const a = keys[i - 1], b = keys[i];
  const u = (ease[b[2] || def] || ease.io)((t - a[0]) / (b[0] - a[0]));
  if (Array.isArray(a[1])) return a[1].map((v, j) => lerp(v, b[1][j], u));
  return lerp(a[1], b[1], u);
}

// 0 -> 1 -> 0 window with soft edges.
export const win = (t, t0, t1, fin = 0.4, fout = fin) => Math.min(ss(t0, t0 + fin, t), 1 - ss(t1 - fout, t1, t));

// Seeded PRNG (mulberry32) with helpers. Every random choice in the film goes through this so frames are reproducible.
export function RNG(seed = 1) {
  let a = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.gauss = () => (f() + f() + f() + f() - 2) / 2;
  return f;
}

export const hash = (n, seed = 0) => { const x = Math.sin(n * 127.1 + seed * 311.7 + 0.5) * 43758.5453; return x - Math.floor(x); };
// Smooth value noise in [-1, 1].
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1;
}
export function fbm1(x, seed = 0, oct = 3) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += noise1(x * f, seed + i * 17) * a; n += a; a *= 0.5; f *= 2; }
  return s / n;
}
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (i, j) => hash(i * 57.13 + j * 131.7, seed);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v) * 2 - 1;
}

// Piecewise-linear ramp over a table [[x0,y0],[x1,y1],...].
export function ramp(x, table) {
  const n = table.length;
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[n - 1][0]) return table[n - 1][1];
  let i = 1;
  while (table[i][0] < x) i++;
  const a = table[i - 1], b = table[i];
  return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
}

// ---- colour ----
const _cc = new Map();
export function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = _cc.get(c);
  if (v) return v;
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  } else {
    const m = c.match(/[\d.]+/g).map(Number);
    v = [m[0], m[1], m[2]];
  }
  _cc.set(c, v);
  return v;
}
export const css = (v, a = 1) => (a >= 1
  ? `rgb(${Math.round(v[0])},${Math.round(v[1])},${Math.round(v[2])})`
  : `rgba(${Math.round(v[0])},${Math.round(v[1])},${Math.round(v[2])},${Math.max(0, a).toFixed(3)})`);
export function mix(a, b, t, al = 1) {
  const x = rgb(a), y = rgb(b);
  return css([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)], al);
}
// tone(c, +0.2) lightens toward white, tone(c, -0.2) darkens toward black.
export const tone = (c, k) => (k >= 0 ? mix(c, '#ffffff', k) : mix(c, '#000000', -k));
export const alpha = (c, a) => css(rgb(c), a);
// Saturation scale around luma.
export function sat(c, k) {
  const v = rgb(c), l = 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
  return css([clamp(l + (v[0] - l) * k, 0, 255), clamp(l + (v[1] - l) * k, 0, 255), clamp(l + (v[2] - l) * k, 0, 255)]);
}
