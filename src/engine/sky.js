// Lighting "looks" (time-of-day palettes + grade) and sky rendering: gradient, stars, sun, moon, clouds.
import { Path2D } from '@napi-rs/canvas';
import { W, H } from './stage.js';
import { TAU, RNG, lerp, mix, alpha, clamp } from './util.js';
import { lin, rad, glow } from './draw.js';

// sky: 4 gradient stops top -> horizon. haze: colour distant layers fade toward. key: light colour for rays/rims.
// dark: 0 (day) .. 1 (night), drives lit windows, lamps, eye shine. grade: [blend mode, colour, alpha] washes.
export const LOOKS = {
  day: {
    sky: [[0, '#2f7fd6'], [0.5, '#79bdf0'], [0.85, '#c9e6fa'], [1, '#e6f3fb']], haze: '#cfe4f5', key: '#fff6d8',
    sun: { x: 1480, y: 200, r: 62, c: '#fffbe6', g: '#fff1b8' }, cloud: ['#ffffff', '#d4e3f3'], stars: 0, dark: 0,
    grade: [['soft-light', '#ffe2b0', 0.16]], vig: 0.26,
  },
  morning: {
    sky: [[0, '#5d9fe6'], [0.5, '#a9d4f5'], [0.85, '#fbe6c8'], [1, '#fff1dc']], haze: '#f3e6d6', key: '#fff0cf',
    sun: { x: 420, y: 330, r: 58, c: '#fffbe6', g: '#ffe6a8' }, cloud: ['#fffaf2', '#e9dfe0'], stars: 0, dark: 0,
    grade: [['soft-light', '#ffd9a0', 0.22]], vig: 0.26,
  },
  golden: {
    sky: [[0, '#4576b8'], [0.4, '#e8a56b'], [0.75, '#ffc87f'], [1, '#ffe0a6']], haze: '#ffc98f', key: '#ffc46b',
    sun: { x: 1420, y: 520, r: 74, c: '#fff3c9', g: '#ffb85a' }, cloud: ['#ffe2b8', '#e59a78'], stars: 0, dark: 0.12,
    grade: [['soft-light', '#ff9a3c', 0.3], ['multiply', '#fff0dc', 0.5]], vig: 0.34,
  },
  dusk: {
    sky: [[0, '#161c4a'], [0.45, '#4a3a78'], [0.78, '#c8627a'], [1, '#f6a560']], haze: '#8d5f86', key: '#ff9e6e',
    sun: null, cloud: ['#b77a9a', '#5b4479'], stars: 0.35, dark: 0.55,
    grade: [['multiply', '#c9b8e6', 0.5], ['soft-light', '#ff7f50', 0.18]], vig: 0.4,
  },
  night: {
    sky: [[0, '#040818'], [0.55, '#0c1a40'], [0.9, '#1f3566'], [1, '#2a4379']], haze: '#1c2f5e', key: '#a9c0ff',
    moon: { x: 1500, y: 220, r: 54, c: '#f4f1e4', g: '#bcd0ff' }, cloud: ['#2b3f73', '#141f44'], stars: 1, dark: 1,
    grade: [['multiply', '#7088cc', 0.72], ['soft-light', '#2a50a8', 0.25]], vig: 0.5,
  },
  overcast: {
    sky: [[0, '#7f8d9c'], [0.6, '#aab5bf'], [0.9, '#cdd3d6'], [1, '#d6dadb']], haze: '#b9c2c8', key: '#e8eef2',
    sun: null, cloud: ['#c7ced3', '#96a2ad'], stars: 0, dark: 0.2,
    grade: [['multiply', '#dfe6ee', 0.6], ['soft-light', '#6f87a0', 0.2]], vig: 0.36,
  },
  rain: {
    sky: [[0, '#3c4856'], [0.6, '#5f6e7c'], [0.9, '#8a969e'], [1, '#949fa6']], haze: '#6f7d89', key: '#c9d6e2',
    sun: null, cloud: ['#6c7a88', '#434f5c'], stars: 0, dark: 0.45,
    grade: [['multiply', '#b9c6d6', 0.7], ['soft-light', '#3d5f85', 0.25]], vig: 0.45,
  },
  dawn: {
    sky: [[0, '#3a4f8f'], [0.45, '#8f8fc4'], [0.75, '#f2b6a8'], [1, '#ffe1bd']], haze: '#e9c7c4', key: '#ffd0a6',
    sun: { x: 500, y: 560, r: 60, c: '#fff0d0', g: '#ffb98a' }, cloud: ['#f6cfc6', '#a892bd'], stars: 0.15, dark: 0.25,
    grade: [['soft-light', '#ffb48a', 0.22]], vig: 0.32,
  },
  forest: {
    sky: [[0, '#7fc0e8'], [0.5, '#c6e6d8'], [0.85, '#f1f6d0'], [1, '#f6f8dc']], haze: '#cfe3b8', key: '#fbf6c0',
    sun: { x: 1300, y: 160, r: 60, c: '#fffbe0', g: '#f6f0a8' }, cloud: ['#ffffff', '#dbe9d6'], stars: 0, dark: 0,
    grade: [['soft-light', '#e8f0a0', 0.2], ['soft-light', '#2f6b3a', 0.1]], vig: 0.36,
  },
};

// Blend two looks (time-lapses, day -> dusk -> night).
export function mixLooks(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const body = (x, y) => {
    if (x && y) return { x: lerp(x.x, y.x, t), y: lerp(x.y, y.y, t), r: lerp(x.r, y.r, t), c: mix(x.c, y.c, t), g: mix(x.g, y.g, t), a: lerp(x.a ?? 1, y.a ?? 1, t) };
    if (x) return { ...x, a: (x.a ?? 1) * (1 - t) };
    if (y) return { ...y, a: (y.a ?? 1) * t };
    return null;
  };
  return {
    sky: a.sky.map((s, i) => [lerp(s[0], b.sky[i][0], t), mix(s[1], b.sky[i][1], t)]),
    haze: mix(a.haze, b.haze, t), key: mix(a.key, b.key, t),
    sun: body(a.sun, b.sun), moon: body(a.moon, b.moon),
    cloud: [mix(a.cloud[0], b.cloud[0], t), mix(a.cloud[1], b.cloud[1], t)],
    stars: lerp(a.stars || 0, b.stars || 0, t), dark: lerp(a.dark || 0, b.dark || 0, t),
    grade: [...(a.grade || []).map(([m, c, al]) => [m, c, al * (1 - t)]), ...(b.grade || []).map(([m, c, al]) => [m, c, al * t])],
    vig: lerp(a.vig ?? 0.3, b.vig ?? 0.3, t),
  };
}

const starCache = new Map();
export function drawStars(c, a, T, seed = 11) {
  let st = starCache.get(seed);
  if (!st) {
    const r = RNG(seed);
    st = [];
    for (let i = 0; i < 340; i++) st.push([r.range(-240, W + 240), Math.pow(r(), 1.4) * H * 0.84 - 80, r.range(0.6, 2.2), r.range(0, TAU), r.range(0.5, 2.4), r.chance(0.1)]);
    starCache.set(seed, st);
  }
  c.save();
  c.fillStyle = '#ffffff';
  for (const [x, y, s, ph, sp, big] of st) {
    const tw = 0.62 + 0.38 * Math.sin(T * sp + ph);
    c.globalAlpha = a * tw * (1 - clamp((y - H * 0.45) / (H * 0.4)) * 0.85);
    c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
    if (big) { c.globalAlpha *= 0.22; c.beginPath(); c.arc(x, y, s * 3.2, 0, TAU); c.fill(); }
  }
  c.restore();
}

export function drawSun(c, s) {
  const a = s.a ?? 1;
  glow(c, s.x, s.y, s.r * 7.5, s.g, 0.42 * a);
  glow(c, s.x, s.y, s.r * 3.2, s.g, 0.75 * a);
  c.save(); c.globalAlpha *= a;
  c.fillStyle = rad(c, s.x, s.y, s.r, [[0, '#ffffff'], [0.7, s.c], [1, mix(s.c, s.g, 0.5)]]);
  c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill();
  c.restore();
}

export function drawMoon(c, m) {
  const a = m.a ?? 1, col = m.c || '#f4f1e4';
  glow(c, m.x, m.y, m.r * 6, m.g || '#bcd0ff', 0.3 * a);
  glow(c, m.x, m.y, m.r * 2.4, m.g || '#bcd0ff', 0.5 * a);
  c.save(); c.globalAlpha *= a;
  c.fillStyle = rad(c, m.x - m.r * 0.25, m.y - m.r * 0.25, m.r * 1.3, [[0, '#ffffff'], [0.6, col], [1, mix(col, '#9aa4c4', 0.6)]]);
  c.beginPath(); c.arc(m.x, m.y, m.r, 0, TAU); c.fill();
  c.fillStyle = alpha('#8f97b5', 0.22);
  for (const [dx, dy, r] of [[-0.3, -0.2, 0.2], [0.25, 0.1, 0.26], [-0.05, 0.42, 0.14], [0.38, -0.38, 0.1], [-0.5, 0.25, 0.09]]) {
    c.beginPath(); c.arc(m.x + dx * m.r, m.y + dy * m.r, r * m.r, 0, TAU); c.fill();
  }
  c.restore();
}

// One puffy flat-bottomed cloud centred on x, sitting on baseline y.
export function cloud(c, x, y, w, seed, top, bot, a = 1) {
  const r = RNG(seed), n = 5 + r.int(0, 3), h = w * 0.2, p = new Path2D();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, rr = h * (0.42 + 0.85 * Math.sin(u * Math.PI)) * r.range(0.85, 1.15);
    const cx = x - w / 2 + u * w, cy = y - rr * 0.62;
    p.moveTo(cx + rr, cy); p.arc(cx, cy, rr, 0, TAU);
  }
  c.save();
  c.globalAlpha *= a;
  c.beginPath(); c.rect(x - w, y - h * 3, w * 2, h * 3); c.clip();
  c.fillStyle = lin(c, 0, y - h * 1.9, 0, y, [[0, top], [0.55, mix(top, bot, 0.35)], [1, bot]]);
  c.fill(p);
  c.restore();
}

const cloudCache = new Map();
// Two drifting cloud planes. o: {n, seed, y0, y1, speed, size, a}
export function drawClouds(g, look, o = {}) {
  const n = o.n ?? 7, seed = o.seed ?? 3, T = o.t ?? g.T, y0 = o.y0 ?? 110, y1 = o.y1 ?? 430, sp = o.speed ?? 1, size = o.size ?? 1;
  if (n <= 0) return;
  const key = `${n}|${seed}`;
  let cs = cloudCache.get(key);
  if (!cs) {
    const r = RNG(seed);
    cs = [];
    for (let i = 0; i < n; i++) cs.push({ u: r(), v: r(), w: r.range(240, 520), seed: r.int(1, 9999), band: i % 2, sp: r.range(5, 12) });
    cloudCache.set(key, cs);
  }
  const span = W + 1200;
  for (let band = 0; band < 2; band++) {
    g.layer(band ? 0.13 : 0.06, (c) => {
      for (const k of cs) {
        if (k.band !== band) continue;
        const x = ((k.u * span + T * k.sp * sp * (band ? 1.5 : 1)) % span + span) % span - 600;
        const w = k.w * size * (band ? 1.15 : 0.8);
        cloud(c, x, lerp(y0, y1, k.v), w, k.seed, look.cloud[0], look.cloud[1], (o.a ?? 1) * (band ? 0.95 : 0.8));
      }
    });
  }
}

// Full sky: gradient, stars, moon, sun, clouds. o: {horizon, clouds: {...}|false, starSeed}
export function drawSky(g, look, o = {}) {
  const T = o.t ?? g.T;
  g.screen((c) => { c.fillStyle = lin(c, 0, 0, 0, o.horizon ?? H * 0.84, look.sky); c.fillRect(0, 0, W, H); });
  g.layer(0.02, (c) => {
    if ((look.stars || 0) > 0.01) drawStars(c, look.stars, T, o.starSeed ?? 11);
    if (look.moon) drawMoon(c, look.moon);
    if (look.sun) drawSun(c, look.sun);
  });
  if (o.clouds !== false) drawClouds(g, look, { t: T, ...(o.clouds || {}) });
}
