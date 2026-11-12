// Hero apartment living room (2nd floor, side-on "dollhouse" view). Opens the film on day 0; its ruin closes it at 200 years.
//
// apartmentSet(g, t, o)    call AFTER g.camera(...). Draws exterior (through the window), room, calls o.actors(c) on the
//                          main plane (depth 1), then front furniture, o.front(c), then a foreground plane (depth 1.3).
// apartmentLight(g, t, o)  call AFTER g.grade(look) with the SAME o: window sun/moon shafts + dust motes, shafts through
//                          ceiling holes / the wall break, lamp glow, TV flicker, lit city windows. Emissive only.
// o = {
//   years       0 (default) .. 200+, continuous. Everything derives from aging(years): 7 days = a little dust; 1-5 y dust,
//               cobwebs, dead leaves, water stains, first peeling wallpaper, cracked then missing panes, sill sprout;
//               20 y ivy through the window, mould, sagging sofa, fallen pictures, warped boards, small ferns;
//               100 y ferns + moss floor, fallen bookshelf, brick showing, ceiling holes, door on one hinge, vines;
//               200 y tree through the floor, window wall broken open onto a forest, flowers, furniture fragments.
//   look        a LOOKS entry (default LOOKS.day): sky / haze / key light colour / dark.
//   power       electricity (default true; ignored after ~1.5 years). Lit city windows, lamp, TV when look.dark is high.
//   lamp, tv    true/false/0..1 to force the floor lamp / TV on or off (default: on when power and look.dark > ~0.5).
//   windowOpen  0..1 slides the lower sash up (the cat slips out).   doorOpen  0..1 overrides the age-driven front door.
//   time        clock time in hours (default 10.17); the second hand ticks from t while years < 0.8.
//   light       0..1 multiplier for the window light patch / shafts.
//   actors(c), front(c)   callbacks in world coordinates on the main plane: actors stand on y = APT.floorY (behind the
//               coffee table and front ferns); front(c) is drawn over the coffee table (e.g. a cat on the table).
//   hide        {sofa, table, rug, tv, lamp, shelf, clock, pictures, hooks, mat, perch, curtains, plant, tree, fg, ext}
// }
// The set never grades or draws UI. It does NOT draw hero props (dog bed, bowls, feeder, plush, photo, collar) or
// characters: place those at the anchors below.
//
// APT (world coordinates, y down; world spans x -300..2920, floor line y 900, back wall meets the floor at y 846):
//   floorY 900, wallBase 846, ceilY -20, bounds {x0, x1}
//   door {x, y, w, h} (panelled front door in the back wall, far left), doorWait {x, y} (dog sits here, flip -1),
//   mat {x, y}, hooks {x, y}, dogBed, plush, bowls, feeder (floor points, left to right, between door and bookshelf),
//   photoShelf {x, y} (top of the bookshelf), photoFloor {x, y} (where the photo lies at 100 y),
//   tv {x, y} (screen centre), clock {x, y}, lamp {x, y} (shade centre), sofaSeat {x, y} (top of the right seat cushion, in the
//   sunbeam), sofaBack {x, y}, sofaArm {x, y}, table {x, y} (coffee-table top; draw in front()), rug {x, y},
//   window {x, y, w, h}, sill {x, y} (sill top, a cat can sit), perch {x, y} (top of the parrot stand, right of the window),
//   tree {x, y} (the 200 y tree), wallBreak {x, y, w, h, entry: {x, y}} (opening to the forest at 200 y; entry = low
//   point of the rubble where the puppy climbs in), cams {wide, door, dogCorner, sofa, window, ruin} = [x, y, zoom].
// Scale check: the door is 560 px tall, the sofa seat 150 px above the floor line, the adult dog (s 1.5) about 225 px.
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { W, H } from '../engine/stage.js';
import { LOOKS, drawStars, drawMoon, drawClouds } from '../engine/sky.js';
import { TAU, RNG, clamp, lerp, ss, mix, tone, alpha, hash, noise1 } from '../engine/util.js';
import { lin, rad, glow, shadow, rrect, blob } from '../engine/draw.js';
import { LEAF, wind, grass, tree, ivy, vines, flowers, moss, litter, aging } from '../env/nature.js';
import { lightShaft, dust } from '../env/fx.js';

const X0 = -300, X1 = 2920, CEIL = -20, ROOF = -110, DADO = 620, WB = 846, FRONT = 1130, SLAB = 1200, WT = 60;
const WIN = { x: 2150, y: 190, w: 500, h: 430 }, DOOR = { x: -170, y: 286, w: 260, h: 560 }, TREE = { x: 1490, y: 892 };

export const APT = {
  floorY: 900, wallBase: WB, ceilY: CEIL, bounds: { x0: X0, x1: X1 },
  door: { ...DOOR }, doorWait: { x: 215, y: 896 }, mat: { x: -40, y: 876 }, hooks: { x: 240, y: 330 },
  dogBed: { x: 445, y: 902 }, plush: { x: 590, y: 904 }, bowls: { x: 705, y: 900 }, feeder: { x: 812, y: 876 },
  photoShelf: { x: 950, y: 416 }, photoFloor: { x: 1010, y: 930 },
  tv: { x: 1300, y: 661 }, clock: { x: 1300, y: 300 }, lamp: { x: 1510, y: 468 },
  sofaSeat: { x: 1925, y: 752 }, sofaBack: { x: 1830, y: 612 }, sofaArm: { x: 2050, y: 674 }, table: { x: 1800, y: 880 }, rug: { x: 1810, y: 950 },
  window: { ...WIN }, sill: { x: 2330, y: 620 }, perch: { x: 2790, y: 514 }, tree: { ...TREE },
  wallBreak: { x: 1950, y: CEIL, w: 990, h: 832, entry: { x: 2400, y: 812 } },
  cams: { wide: [1310, 540, 0.58], door: [470, 560, 1.15], dogCorner: [560, 660, 1.6], sofa: [1830, 640, 1.55], window: [2260, 520, 1.3], ruin: [1500, 540, 0.8] },
};

// ---------- helpers ----------
const yt = (y, pts) => {
  const x = Math.log1p(Math.max(0, y)), n = pts.length;
  if (x <= Math.log1p(pts[0][0])) return pts[0][1];
  if (x >= Math.log1p(pts[n - 1][0])) return pts[n - 1][1];
  let i = 1;
  while (Math.log1p(pts[i][0]) < x) i++;
  const a = pts[i - 1], b = pts[i], xa = Math.log1p(a[0]), xb = Math.log1p(b[0]);
  return lerp(a[1], b[1], (x - xa) / (xb - xa));
};
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const quad = (c, pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); };
const disc = (c, x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
const ell = (c, x, y, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU); c.fill(); };
// window point -> where its light lands on the floor (light travels down-left toward the sofa)
const land = (x, y) => { const yf = 884 + (WIN.y + WIN.h - y) * 0.4; return [x - (yf - WB) * 2.6, yf]; };
const CH = [{ x: 1500, w: 150, th: 0, max: 1.7 }, { x: 665, w: 105, th: 0.25, max: 1 }];   // ceiling holes
const chSize = (S, h) => clamp((S.ceil - h.th) / 0.75, 0, h.max);

function state(g, t, o) {
  o = o || {};
  const years = Math.max(0, Number(o.years) || 0), look = o.look || LOOKS.day, A = aging(years), dark = clamp(look.dark || 0);
  const power = o.power !== false && years < 1.5, night = ss(0.3, 0.7, dark);
  const on = (v, d) => (v == null ? d : v === true ? 1 : clamp(Number(v) || 0));
  const Y = (pts) => yt(years, pts), lightK = o.light == null ? 1 : clamp(Number(o.light) || 0);
  const S = {
    g, t: Number(t) || 0, o, years, look, A, dark, power, night, hide: o.hide || {},
    lampOn: power ? on(o.lamp, night) : 0, tvOn: power ? on(o.tv, night) : 0, winOpen: clamp(Number(o.windowOpen) || 0),
    dust: Y([[0, 0], [7 / 365, 0.25], [1, 0.55], [5, 0.78], [20, 0.92], [100, 1]]),
    cob: Y([[0.2, 0], [1, 0.55], [5, 1], [100, 1], [200, 0.7]]),
    leaves: Y([[0.4, 0], [1, 0.35], [5, 1]]),
    stain: Y([[0.4, 0], [1, 0.3], [5, 0.7], [20, 1]]),
    peel: Y([[0.8, 0], [5, 0.24], [20, 0.5], [100, 0.86], [200, 0.96]]),
    crack: Y([[0.3, 0], [1, 0.5], [5, 1]]),
    miss: Y([[1, 0], [5, 0.45], [20, 0.95], [50, 1.4]]),
    sprout: Y([[0.4, 0], [1, 0.3], [5, 0.7], [20, 1], [100, 1.4]]),
    ivyIn: Y([[4, 0], [20, 0.55], [100, 1]]),
    ivy2: Y([[15, 0], [50, 0.4], [100, 0.8], [200, 1]]),
    mould: Y([[1.5, 0], [5, 0.2], [20, 0.7], [100, 1]]),
    sag: Y([[4, 0], [20, 0.5], [100, 1]]),
    skel: Y([[15, 0], [50, 0.45], [100, 1]]),
    frag: Y([[100, 0], [200, 1]]),
    warp: Y([[5, 0], [20, 0.5], [100, 1]]),
    green: Y([[8, 0], [20, 0.3], [100, 1]]),
    shelf: Y([[20, 0], [45, 0.08], [70, 0.55], [100, 1]]),
    hinge: Y([[50, 0], [100, 1]]),
    ceil: Y([[20, 0], [50, 0.35], [100, 1], [200, 1.5]]),
    treeG: Y([[100, 0], [200, 1]]),
    brk: Y([[90, 0], [100, 0.05], [150, 0.5], [200, 1]]),
    flower: Y([[100, 0], [140, 0.3], [200, 1]]),
    rot: Y([[2, 0], [20, 0.6], [100, 1]]),
    mossy: Y([[10, 0], [20, 0.15], [100, 0.7], [200, 1]]),
  };
  S.doorOpen = o.doorOpen != null ? clamp(Number(o.doorOpen) || 0) : Y([[20, 0], [50, 0.2], [100, 0.85], [200, 0.92]]);
  const gr = S.gr = clamp(S.dust * 0.3 + A.grime * 0.7), ms = S.mossy;
  S.ag = (col, k = 1) => {
    const q = gr > 0.004 ? mix(col, '#a69c88', gr * 0.5 * k) : col;
    return ms > 0.004 ? mix(q, '#5b7b47', ms * 0.5 * k) : q;
  };
  S.dayL = clamp(1 - dark * 1.25) * (look.sun ? 1 : look.moon ? 0 : 0.4) * lightK;
  S.moonL = look.moon ? ss(0.5, 1, dark) * (1 - 0.7 * S.lampOn) * lightK : 0;
  S.beam = Math.max(S.dayL, S.moonL * 0.7);
  return S;
}

// ---------- openings (window -> wall break, ceiling holes, sky above the roof) ----------
const HB = [[2150, 190], [2275, 190], [2400, 190], [2525, 190], [2650, 190], [2650, 297], [2650, 405], [2650, 512], [2650, 620], [2525, 620], [2400, 620], [2275, 620], [2150, 620], [2150, 512], [2150, 405], [2150, 297]];
const HT = [[1960, -460], [2250, -460], [2550, -460], [2800, -460], [5400, -460], [5400, 100], [5400, 420], [5400, 612], [2946, 640], [2800, 726], [2600, 800], [2400, 812], [2210, 742], [2060, 610], [1992, 400], [1945, 150]];
function holePts(k) {
  if (k <= 0) return HB;
  const base = HB.map((b, i) => {
    const u = Math.pow(k, 0.8 + 0.5 * hash(i, 3)), far = i >= 4 && i <= 7;
    return [lerp(b[0], HT[i][0], far ? k * k * k : u), lerp(b[1], HT[i][1], u)];
  });
  const J = 20 * ss(0, 0.12, k), out = [];
  for (let i = 0; i < 16; i++) {
    const a = base[i], b = base[(i + 1) % 16], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    out.push(a);
    if (L > 2500) continue;
    for (let j = 1; j < 3; j++) { const u = j / 3, off = (hash(i * 3 + j, 9) - 0.5) * 2 * J; out.push([a[0] + dx * u - (dy / L) * off, a[1] + dy * u + (dx / L) * off]); }
  }
  return out;
}
function openings(S, v) {
  const p = new Path2D(), hp = new Path2D(), pts = holePts(S.brk);
  pts.forEach((q, i) => (i ? hp.lineTo(q[0], q[1]) : hp.moveTo(q[0], q[1]))); hp.closePath();
  p.addPath(hp);
  if (v.y0 < ROOF) p.rect(v.x0 - 10, v.y0 - 10, v.x1 - v.x0 + 20, ROOF - v.y0 + 10);
  for (let n = 0; n < CH.length; n++) {
    const h = CH[n], s = chSize(S, h);
    if (s <= 0.01) continue;
    const w = h.w * s, j = (i) => (hash(i, 40 + n) - 0.5) * w * 0.3;
    p.moveTo(h.x - w * 0.92, ROOF - 2); p.lineTo(h.x + w * 0.9, ROOF - 2);
    p.lineTo(h.x + w * 0.82 + j(1), ROOF + 40); p.lineTo(h.x + w + j(2), CEIL + 5); p.lineTo(h.x + w * 0.4, CEIL + 3 + Math.abs(j(3)) * 0.3); p.lineTo(h.x - w * 0.3, CEIL + 6);
    p.lineTo(h.x - w + j(4), CEIL + 4); p.lineTo(h.x - w * 0.8 + j(5), ROOF + 46); p.closePath();
  }
  return { all: p, hole: hp, pts };
}

// ---------- exterior: sky, city -> forest ----------
const LAY = [
  { d: 0.18, step: 115, w0: 70, w1: 125, h0: 130, h1: 470, base: 610, low: 0.2, hz: 0.62, cols: ['#8fa2c0', '#9aaac4', '#8597b5'] },
  { d: 0.4, step: 185, w0: 130, w1: 190, h0: 130, h1: 400, base: 650, low: 0.25, hz: 0.34, win: [11, 15, 9, 11], cols: ['#c08a72', '#cfb99a', '#a9b6c2', '#b7947e'] },
  { d: 0.7, step: 400, w0: 300, w1: 380, h0: 150, h1: 330, base: 690, low: 0.4, hz: 0.12, win: [26, 38, 22, 26], cols: ['#b5694f', '#c7a57f', '#a8674f'] },
];
const bcache = new Map();
function bGeom(L, i) {
  const key = L * 100000 + i + 50000;
  let b = bcache.get(key);
  if (b) return b;
  const r = RNG(key * 3 + 11), P = LAY[L], w = r.range(P.w0, P.w1), x = i * P.step + r.range(-0.12, 0.12) * P.step;
  const h = r.range(P.h0, P.h1) * (r.chance(P.low) ? 0.4 : 1), top = P.base - h, wd = new Path2D(), wl = new Path2D();
  if (P.win) {
    const [cw, ch, gx, gy] = P.win, nc = Math.max(1, Math.floor((w - gx) / (cw + gx))), nr = Math.min(14, Math.floor((P.base + 260 - top - gy * 2) / (ch + gy))), mx = (w - nc * (cw + gx) + gx) / 2;
    for (let rr = 0; rr < nr; rr++) for (let cc = 0; cc < nc; cc++) (r() < 0.36 ? wl : wd).rect(x + mx + cc * (cw + gx), top + gy * 1.5 + rr * (ch + gy), cw, ch);
  }
  b = { x, w, top, h, col: r.pick(P.cols), drops: [r(), r(), r(), r(), r()], roof: r.int(0, 3), seed: r.int(1, 9999) };
  b.wd = wd; b.wl = wl;
  bcache.set(key, b);
  return b;
}
function bBody(b, cl) {
  const p = new Path2D();
  p.moveTo(b.x, 1700);
  for (let j = 0; j <= 4; j++) p.lineTo(b.x + (b.w * j) / 4, b.top + cl * b.drops[j] * b.h * 0.85);
  p.lineTo(b.x + b.w, 1700); p.closePath();
  return p;
}
const KINDS = ['round', 'round', 'birch', 'round', 'poplar', 'pine'];
// mode 0 = bodies (before the grade), 1 = lit windows only (emissive, after the grade)
function cityLayer(c, S, L, mode) {
  const P = LAY[L], { g, look, A, t } = S, v = g.view(P.d, 60), i0 = Math.floor(v.x0 / P.step) - 1, i1 = Math.ceil(v.x1 / P.step) + 1;
  const lit = S.power ? ss(0.35, 0.75, S.dark) : 0, cl = A.collapse, green = mix('#5f8a52', look.haze, P.hz);
  if (mode === 1 && lit <= 0.01) return;
  for (let i = i0; i <= i1; i++) {
    const b = bGeom(L, i), body = bBody(b, cl);
    c.save(); c.clip(body);
    if (mode === 1) {
      c.globalCompositeOperation = 'screen'; c.fillStyle = alpha('#ffd27a', 0.9 * lit); c.fill(b.wl);
    } else {
      const col = mix(mix(b.col, '#6d8c61', A.vines * 0.5), look.haze, P.hz);
      c.fillStyle = lin(c, b.x, 0, b.x + b.w, 0, [[0, tone(col, 0.07)], [1, tone(col, -0.09)]]); c.fillRect(b.x, b.top, b.w, 1700 - b.top);
      if (P.win) {
        const wcol = mix(mix('#6f8dab', '#2c3644', A.broken), look.haze, P.hz * 0.6);
        c.fillStyle = wcol; c.fill(b.wd);
        c.fillStyle = lit > 0.01 ? mix(wcol, '#ffe2a0', lit) : wcol; c.fill(b.wl);
        if (L === 2) { R(c, b.x, b.top, b.w, 14, tone(col, -0.22)); R(c, b.x, b.top, b.w, 5, tone(col, 0.2)); }
      }
      if (A.vines > 0.04) {
        c.fillStyle = lin(c, 0, b.top, 0, b.top + b.h * (0.35 + A.vines), [[0, alpha(green, 0.95 * A.vines)], [1, alpha(green, 0)]]);
        c.fillRect(b.x, b.top, b.w, b.h * 1.4);
      }
    }
    c.restore();
    if (mode === 0 && L === 2 && b.roof === 0 && cl < 0.3) {   // water tank
      const tx = b.x + b.w * 0.3, col = mix('#7b5a45', look.haze, 0.15), k = 1 - cl / 0.3;
      R(c, tx + 6, b.top - 26 * k, 5, 26 * k, col); R(c, tx + 44, b.top - 26 * k, 5, 26 * k, col); R(c, tx, b.top - 26 * k - 46, 56, 46, tone(col, 0.1));
      quad(c, [[tx - 4, b.top - 26 * k - 46], [tx + 28, b.top - 26 * k - 64], [tx + 60, b.top - 26 * k - 46]], tone(col, -0.15));
    }
  }
  if (mode === 1 || L === 0) return;
  // street trees growing into a forest
  const st = L === 2 ? 250 : 170, base = L === 2 ? 1240 : 930, j0 = Math.floor(v.x0 / st) - 1, j1 = Math.ceil(v.x1 / st) + 1;
  const hz = L === 2 ? 0.08 : 0.3, pal = { deep: mix('#27562f', look.haze, hz), mid: mix('#3f8a40', look.haze, hz), light: mix('#69b24f', look.haze, hz), hi: mix('#9fd168', look.haze, hz) };
  const pal2 = { deep: mix('#1f4f3a', look.haze, hz), mid: mix('#2f7d55', look.haze, hz), light: mix('#55a56a', look.haze, hz), hi: mix('#8fcf8a', look.haze, hz) };
  for (let j = j0; j <= j1; j++) {
    const hh = hash(j, 31 + L), h0 = (L === 2 ? 600 : 300) * (0.8 + 0.4 * hh), h = h0 * (1 + A.trees * (0.75 + 0.7 * hh));
    tree(c, j * st + hh * 70, base, { h, seed: j * 7 + L + 200, kind: 'round', t, shadow: 0, sway: 0.6, pal: j % 2 ? pal : pal2 });
    const wk = ss(0.22, 1.05, A.trees + hh * 0.15), wh = (L === 2 ? 1250 : 700) * (0.55 + 0.6 * hash(j, 77)) * wk;
    if (wh > 10) tree(c, j * st + st * 0.5 + hh * 40, base, { h: wh, seed: j * 5 + L + 400, kind: KINDS[(j * 7 + 700) % 6], t, shadow: 0, sway: 0.6, pal: j % 2 ? pal2 : pal });
  }
}
function exterior(c, S) {
  const { g, look } = S, T = g.T || S.t;
  c.setTransform(g.scale, 0, 0, g.scale, 0, 0);
  c.fillStyle = lin(c, 0, 0, 0, H * 0.8, look.sky); c.fillRect(0, 0, W, H);
  if ((look.stars || 0) > 0.01) g.layer(0.02, (x) => drawStars(x, look.stars, T));
  drawClouds(g, look, { t: T, n: 9, seed: 5, y0: 110, y1: 500 });
  for (let L = 0; L < 3; L++) g.layer(LAY[L].d, (x) => cityLayer(x, S, L, 0));
}
// things just outside the wall on the main plane: moon / sun glow, earth bank at 200 y, fire escape, outer ivy
function outside(c, S) {
  const { look, years, A, t, g } = S, k = S.brk;
  if (look.moon) drawMoon(c, { ...look.moon, x: 2545 + (g.cam.x - 2330) * 0.08, y: 292, r: 40 });
  else if (look.sun) glow(c, 2700, 170, 420, look.sun.g, 0.5 * (look.sun.a ?? 1) * (1 - S.dark));
  if (k > 0.02) {
    const top = (x) => lerp(1260, 800 + 22 * noise1(x * 0.004, 5), k);
    c.fillStyle = lin(c, 0, 780, 0, 1250, [[0, '#6f9a4a'], [0.25, '#55793c'], [1, '#3e4f2c']]);
    c.beginPath(); c.moveTo(1800, 1300);
    for (let x = 1800; x <= 5500; x += 100) c.lineTo(x, top(x));
    c.lineTo(5500, 1300); c.closePath(); c.fill();
    if (k > 0.3) for (let x = 1850; x < 3700; x += 370) grass(c, x, x + 370, top(x + 185) + 6, { h: 44 * ss(0.3, 0.8, k), seed: 60 + x, t, density: 0.14, yVar: 10 });
  }
  // fire escape: top landing railing and ladder
  const fall = ss(105, 165, years);
  if (fall < 0.995) {
    const col = mix('#3a3f4b', '#8a4d2c', A.grime), p = new Path2D();
    c.save(); c.translate(2150, 640 + fall * 700); c.rotate(fall * 0.5); c.translate(-2150, -640);
    p.rect(2130, 508, 560, 9); p.rect(2130, 566, 560, 6); p.rect(2126, 628, 568, 12);
    for (let x = 2136; x < 2690; x += 37) p.rect(x, 508, 5, 124);
    p.rect(2566, 150, 8, 480); p.rect(2622, 150, 8, 480);
    for (let y = 176; y < 500; y += 38) p.rect(2566, y, 60, 6);
    c.fillStyle = col; c.fill(p);
    if (A.vines > 0.03) vines(c, 2150, 2650, 512, { len: 130 * A.vines, seed: 31, t, n: 9 });
    c.restore();
  }
  if (S.ivyIn > 0.02) ivy(c, WIN.x, WIN.y, WIN.w, WIN.h, { hang: true, cover: S.ivyIn * 0.5, seed: 14, t, density: 0.8 });
}

// ---------- shell: surrounding building, slabs, back wall ----------
function shell(c, S, v) {
  const ag = S.ag;
  R(c, v.x0, ROOF, v.x1 - v.x0, v.y1 - ROOF, '#211c2e');
  R(c, v.x0, ROOF, v.x1 - v.x0, 8, '#4a4358');
  for (const x of [X0 - WT, X1]) { c.fillStyle = lin(c, x, 0, x + WT, 0, [[0, ag('#cdbfae')], [1, ag('#ad9f8f')]]); c.fillRect(x, ROOF, WT, SLAB - ROOF); }
  for (const [y, h] of [[ROOF, CEIL - ROOF], [FRONT, SLAB - FRONT]]) {
    c.fillStyle = lin(c, 0, y, 0, y + h, [[0, ag('#8a6d53')], [1, ag('#654c3b')]]); c.fillRect(X0 - WT, y, X1 - X0 + WT * 2, h);
    c.fillStyle = alpha('#3d2c20', 0.4); for (let x = X0; x < X1; x += 140) c.fillRect(x, y + 14, 16, h - 14);
    R(c, X0 - WT, y, X1 - X0 + WT * 2, 12, ag(y === ROOF ? '#a39c96' : '#c08a52'));
  }
}
const STRIPES = (() => { const p = new Path2D(); for (let x = X0; x < X1; x += 66) p.rect(x, CEIL, 24, DADO - CEIL); return p; })();
const GROOVES = (() => { const p = new Path2D(); for (let x = X0 + 20; x < X1; x += 46) p.rect(x, DADO + 8, 2.5, WB - DADO - 34); return p; })();
const PATCH = (() => {
  const r = RNG(77), a = [];
  for (let i = 0; i < 52; i++) {
    const top = i < 10 || r.chance(0.4), m = [];
    for (let j = 0; j < 9; j++) m.push(r.range(0.6, 1.25));
    a.push({ x: r.range(X0, X1), y: top ? r.range(CEIL, 230) : r.range(180, WB), r: r.range(100, 250), th: 0.05 + 0.72 * (i / 52) + r.range(-0.03, 0.03), m });
  }
  return a;
})();
const STAINS = (() => { const r = RNG(91), a = []; for (let i = 0; i < 9; i++) a.push({ x: r.range(X0 + 100, X1 - 100), w: r.range(70, 200), d: r.range(130, 380), th: r.range(0, 0.7), s: r.int(1, 999) }); return a; })();
const MOULD = (() => { const r = RNG(93), a = []; for (let i = 0; i < 26; i++) a.push({ x: r.range(X0, X1), y: r.chance(0.6) ? r.range(WB - 190, WB - 10) : r.range(CEIL, CEIL + 190), r: r.range(50, 130), th: r.range(0, 0.7) }); return a; })();
const CRACKS = (() => {
  const r = RNG(95), a = [];
  for (const [x, y, dx, dy] of [[2150, 190, -0.7, -0.7], [2650, 620, 0.6, 0.8], [2150, 620, -0.8, 0.6], [900, CEIL, 0.2, 1], [1500, CEIL, -0.1, 1], [X0 + 5, 300, 1, 0.3], [2650, 190, 0.7, -0.7]]) {
    const pts = [[x, y]]; let px = x, py = y;
    for (let i = 0; i < 12; i++) { px += dx * 26 + r.range(-16, 16); py += dy * 26 + r.range(-16, 16); pts.push([px, py]); }
    a.push(pts);
  }
  return a;
})();
let brickTile = null;
const pats = new WeakMap();
function brick(c) {
  let p = pats.get(c);
  if (p) return p;
  if (!brickTile) {
    brickTile = createCanvas(120, 72);
    const x = brickTile.getContext('2d'), r = RNG(5), cols = ['#a8563f', '#b46248', '#9c4f3b', '#bb6e52', '#a55a45'];
    x.fillStyle = '#c4ae97'; x.fillRect(0, 0, 120, 72);
    for (let row = 0; row < 3; row++) for (let i = -1; i < 2; i++) { x.fillStyle = r.pick(cols); x.fillRect(i * 60 + (row % 2) * 30 + 2, row * 24 + 2, 56, 20); x.fillRect(i * 60 + (row % 2) * 30 + 122, row * 24 + 2, 56, 20); }
  }
  p = c.createPattern(brickTile, 'repeat');
  pats.set(c, p);
  return p;
}
function wall(c, S) {
  const { ag, A } = S, w = X1 - X0;
  c.save(); c.beginPath(); c.rect(X0, CEIL, w, WB - CEIL); c.clip();
  c.fillStyle = lin(c, 0, CEIL, 0, DADO, [[0, ag('#f7e9cb')], [1, ag('#f0ddb8')]]); c.fillRect(X0, CEIL, w, DADO - CEIL);
  c.fillStyle = alpha(ag('#e9d3a4'), 0.45); c.fill(STRIPES);
  c.fillStyle = lin(c, 0, DADO, 0, WB, [[0, ag('#a3c4b8')], [1, ag('#88ad a1'.replace(' ', ''))]]); c.fillRect(X0, DADO, w, WB - DADO);
  c.fillStyle = alpha('#5f8a7e', 0.3); c.fill(GROOVES);
  // water stains under the ceiling
  if (S.stain > 0.01) for (const s of STAINS) {
    const k = ss(s.th, s.th + 0.3, S.stain);
    if (k <= 0.01) continue;
    const pts = [[s.x - s.w * k, CEIL, 1], [s.x + s.w * k, CEIL, 1]];
    for (let j = 0; j < 6; j++) { const u = 1 - (j + 0.5) / 6; pts.push([s.x - s.w * k + 2 * s.w * k * u, CEIL + s.d * k * (0.35 + 0.65 * hash(j, s.s)) * Math.sqrt(Math.sin(Math.PI * u))]); }
    const p = blob(pts);
    c.fillStyle = alpha('#9c7a45', 0.2); c.fill(p); c.strokeStyle = alpha('#7d5c2e', 0.22); c.lineWidth = 3; c.stroke(p);
  }
  // peeling paper -> brick
  if (S.peel > 0.01) {
    const p = new Path2D(); let any = false;
    for (const q of PATCH) {
      const k = ss(q.th, q.th + 0.3, S.peel);
      if (k <= 0.01) continue;
      any = true;
      p.addPath(blob(q.m.map((m, j) => { const a = (j / 9) * TAU; return [q.x + Math.cos(a) * q.r * m * k, q.y + Math.sin(a) * q.r * m * k * 1.25]; })));
    }
    if (any) {
      c.strokeStyle = ag('#fbf4e2'); c.lineWidth = 7; c.lineJoin = 'round'; c.stroke(p);
      c.fillStyle = brick(c); c.fill(p);
      c.fillStyle = alpha(mix('#4a3a30', '#4f6a3a', S.mossy), 0.12 + 0.3 * A.grime); c.fill(p);
    }
  }
  // rail, baseboard, crown
  R(c, X0, DADO - 12, w, 14, ag('#fbf3e0')); R(c, X0, DADO + 2, w, 4, alpha('#35564c', 0.25));
  R(c, X0, CEIL, w, 26, ag('#fbf3e0')); R(c, X0, CEIL + 26, w, 4, alpha('#8a7350', 0.25));
  R(c, X0, WB - 26, w, 26, ag('#f8eeda')); R(c, X0, WB - 26, w, 3, ag('#ffffff')); R(c, X0, WB - 30, w, 4, alpha('#35564c', 0.2));
  // mould
  if (S.mould > 0.01) for (const m of MOULD) {
    const k = ss(m.th, m.th + 0.3, S.mould), rr = m.r * (0.4 + 0.6 * k);
    if (k <= 0.01) continue;
    c.fillStyle = rad(c, m.x, m.y, rr, [[0, alpha('#2f3d26', 0.5 * k)], [0.6, alpha('#3a4a2c', 0.24 * k)], [1, alpha('#3a4a2c', 0)]]); c.fillRect(m.x - rr, m.y - rr, rr * 2, rr * 2);
  }
  // cracks
  const cr = yt(S.years, [[1, 0], [5, 0.3], [20, 0.7], [100, 1]]);
  if (cr > 0.01) {
    c.strokeStyle = alpha('#3b2a22', 0.55); c.lineWidth = 2.4; c.lineJoin = 'round'; c.beginPath();
    for (const pts of CRACKS) {
      const n = cr * (pts.length - 1), f = Math.floor(n);
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i <= f; i++) c.lineTo(pts[i][0], pts[i][1]);
      if (f < pts.length - 1) c.lineTo(lerp(pts[f][0], pts[f + 1][0], n - f), lerp(pts[f][1], pts[f + 1][1], n - f));
    }
    c.stroke();
  }
  // corner occlusion + general grime
  c.fillStyle = lin(c, X0, 0, X0 + 150, 0, [[0, alpha('#4a3520', 0.2)], [1, alpha('#4a3520', 0)]]); c.fillRect(X0, CEIL, 150, WB - CEIL);
  c.fillStyle = lin(c, X1 - 150, 0, X1, 0, [[0, alpha('#4a3520', 0)], [1, alpha('#4a3520', 0.2)]]); c.fillRect(X1 - 150, CEIL, 150, WB - CEIL);
  c.fillStyle = lin(c, 0, CEIL, 0, CEIL + 120, [[0, alpha('#4a3520', 0.14 + 0.2 * A.grime)], [1, alpha('#4a3520', 0)]]); c.fillRect(X0, CEIL, w, 120);
  c.restore();
}

// ---------- floor ----------
const PLANKS = (() => {
  const r = RNG(41), seams = new Path2D(), lt = new Path2D(), dk = new Path2D(), boards = [];
  let y = WB, hgt = 22;
  while (y < FRONT - 4) {
    const h = Math.min(hgt, FRONT - y);
    seams.rect(X0, y, X1 - X0, 2);
    let x = X0 - r.range(0, 300);
    while (x < X1) {
      const w = r.range(260, 520), k = r();
      if (k < 0.28) lt.rect(x, y + 2, w, h - 2); else if (k > 0.74) dk.rect(x, y + 2, w, h - 2);
      seams.rect(x + w - 1, y, 2, h);
      boards.push({ x, y, w, h, th: r(), a: r.range(-1, 1) });
      x += w;
    }
    y += h; hgt *= 1.22;
  }
  return { seams, lt, dk, boards };
})();
function floor(c, S) {
  const { ag, A } = S, w = X1 - X0;
  c.save(); c.beginPath(); c.rect(X0, WB, w, FRONT - WB); c.clip();
  c.fillStyle = lin(c, 0, WB, 0, FRONT, [[0, ag('#dba66d')], [0.5, ag('#cf955c')], [1, ag('#b77d48')]]); c.fillRect(X0, WB, w, FRONT - WB);
  c.fillStyle = alpha('#f3c890', 0.32); c.fill(PLANKS.lt); c.fillStyle = alpha('#8f5a2c', 0.2); c.fill(PLANKS.dk); c.fillStyle = alpha('#6b3f1c', 0.3); c.fill(PLANKS.seams);
  if (S.gr > 0.01) R(c, X0, WB, w, FRONT - WB, alpha(mix('#8d8676', '#4d5a36', S.mossy), S.gr * 0.42));
  // missing and warped boards
  if (S.warp > 0.01) for (const b of PLANKS.boards) {
    if (b.th < 0.2) {
      const k = ss(b.th * 3, b.th * 3 + 0.5, S.warp);
      if (k > 0.01) R(c, b.x, b.y + 1, b.w * k, b.h, '#2a1c15');
    } else if (b.th > 0.78) {
      const k = S.warp * (b.th - 0.78) / 0.22;
      c.save(); c.translate(b.x, b.y + b.h); c.rotate(-0.035 * k * (b.a > 0 ? 1 : 0.5));
      R(c, 0, 0, b.w * 0.6, 5 * k, alpha('#1e130d', 0.45)); R(c, 0, -b.h, b.w * 0.6, b.h, ag('#c9925c'));
      c.restore();
    }
  }
  // the tree breaks through
  const tg = S.treeG;
  if (tg > 0.01 && !S.hide.tree) {
    const k = Math.sqrt(tg);
    ell(c, TREE.x, TREE.y + 4, 190 * k, 30 * k, '#241812');
    for (let i = 0; i < 9; i++) { const a = -0.3 + (i / 8) * (Math.PI + 0.6), s = i % 2 ? 1 : 0.75; quad(c, [[TREE.x + Math.cos(a) * 150 * k, TREE.y + 4 - Math.sin(a) * 22 * k], [TREE.x + Math.cos(a + 0.12) * 150 * k, TREE.y + 4 - Math.sin(a + 0.12) * 22 * k], [TREE.x + Math.cos(a + 0.06) * 250 * k * s, TREE.y - 4 - Math.sin(a + 0.06) * 52 * k * s]], ag(i % 2 ? '#c9925c' : '#a8733f')); }
  }
  c.fillStyle = lin(c, 0, WB, 0, WB + 46, [[0, alpha('#3a2412', 0.3)], [1, alpha('#3a2412', 0)]]); c.fillRect(X0, WB, w, 46);
  c.restore();
}

// ---------- door ----------
function door(c, S) {
  const { ag, t, A } = S, D = DOOR, op = S.doorOpen, hang = S.hinge, cas = ag('#fbf3e0');
  R(c, D.x - 20, D.y - 20, D.w + 40, D.h + 20, cas); R(c, D.x - 20, D.y - 20, D.w + 40, 4, ag('#ffffff')); R(c, D.x + D.w + 16, D.y - 16, 4, D.h + 16, alpha('#8a7350', 0.25));
  c.fillStyle = lin(c, D.x, 0, D.x + D.w, 0, [[0, '#241f30'], [1, '#3a3246']]); c.fillRect(D.x, D.y, D.w, D.h);
  if (op > 0.02) {
    R(c, D.x, D.y + D.h - 46, D.w, 46, '#4b4254');
    quad(c, [[D.x + D.w * 0.5, D.y + D.h], [D.x + D.w, D.y + D.h], [D.x + D.w, D.y + D.h - 46], [D.x + D.w * 0.8, D.y + D.h - 46]], alpha('#ffe8b8', 0.14 * (1 - S.dark)));
    if (A.vines > 0.1) { glow(c, D.x + D.w / 2, D.y + 200, 260, '#7fae6a', 0.25 * A.vines, 'source-over'); vines(c, D.x + 10, D.x + D.w - 10, D.y, { len: 260 * A.vines, seed: 17, t, n: 6 }); }
  }
  const th = op * 1.3, cw = Math.cos(th), base = ag('#2d7d7f'), dk = tone(base, -0.16), lt = tone(base, 0.12);
  c.save();
  c.translate(D.x, D.y + 40); c.rotate(hang * 0.07); c.translate(0, -(D.y + 40));
  if (th > 0.02) R(c, D.w * cw, D.y, 13 * Math.sin(th), D.h, tone(base, 0.2));
  c.scale(cw, 1);
  c.fillStyle = lin(c, 0, D.y, D.w, D.y + D.h, [[0, lt], [0.5, base], [1, tone(base, -0.1 - 0.25 * op)]]); c.fillRect(0, D.y, D.w, D.h);
  for (let i = 0; i < 4; i++) {
    const px = 26 + (i % 2) * 115, py = D.y + (i < 2 ? 28 : 312), ph = i < 2 ? 244 : 218;
    R(c, px, py, 93, ph, dk); R(c, px + 9, py + 9, 75, ph - 18, base);
    R(c, px, py + ph - 4, 93, 4, lt); R(c, px + 9, py + 9, 75, 4, tone(base, -0.24));
  }
  if (S.peel > 0.05) { c.fillStyle = alpha('#8a7a66', 0.55); for (let i = 0; i < 9; i++) { const k = ss(i / 12, i / 12 + 0.3, S.peel); c.beginPath(); c.ellipse(30 + hash(i, 61) * 200, D.y + 30 + hash(i, 62) * 500, 34 * k, 50 * k, hash(i, 63) * 3, 0, TAU); c.fill(); } }
  const brass = ag('#e2b04a');
  c.fillStyle = brass; c.fill(rrect(95, D.y + 284, 70, 14, 4)); R(c, 101, D.y + 289, 58, 4, tone(brass, -0.4));
  c.fill(rrect(D.w - 44, D.y + 268, 22, 74, 6)); disc(c, D.w - 33, D.y + 292, 12, tone(brass, 0.12)); disc(c, D.w - 36, D.y + 289, 4, tone(brass, 0.5)); disc(c, D.w - 33, D.y + 324, 3.5, tone(brass, -0.5));
  disc(c, D.w / 2, D.y + 150, 5, tone(brass, -0.1));
  c.restore();
}

// ---------- wall decor ----------
function clock(c, S) {
  const { ag, years, t, o } = S, x = APT.clock.x, drop = ss(105, 135, years), y = APT.clock.y + drop * drop * (WB - 40 - APT.clock.y), tilt = ss(20, 80, years) * 0.5 + drop;
  const time = Number.isFinite(+o.time) && o.time != null ? +o.time : 10.17, run = years < 0.8 ? t : 0;
  c.save(); c.translate(x, y); c.rotate(tilt);
  shadow(c, 5, 8, 54, 54, 0.14 * (1 - drop));
  disc(c, 0, 0, 50, ag('#2d7d7f')); disc(c, 0, 0, 42, ag('#fdf6e6'));
  c.fillStyle = ag('#3a3f4e');
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.beginPath(); c.arc(Math.cos(a) * 34, Math.sin(a) * 34, i % 3 ? 1.8 : 3.4, 0, TAU); c.fill(); }
  const hand = (a, len, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(-Math.sin(a) * len * -0.15, Math.cos(a) * len * -0.15 * -1); c.lineTo(Math.sin(a) * len, -Math.cos(a) * len); c.stroke(); };
  const mins = time * 60 + run / 60;
  hand((mins / 720) * TAU, 20, 5, '#2a2f3e'); hand((mins / 60) * TAU, 31, 3.5, '#2a2f3e');
  const sec = Math.floor(run) + ss(0, 0.12, run % 1);
  hand((sec / 60) * TAU, 34, 1.5, '#d9453c'); disc(c, 0, 0, 3.5, '#d9453c');
  if (S.dust > 0.3) disc(c, 0, 0, 42, alpha('#b9b09a', (S.dust - 0.3) * 0.5));
  c.restore();
}
const PICS = [
  { x: 470, y: 290, w: 190, h: 136, art: 0, th: 9 }, { x: 700, y: 330, w: 86, h: 106, art: 1, th: 14 },
  { x: 1640, y: 310, w: 124, h: 156, art: 2, th: 7 }, { x: 1800, y: 290, w: 190, h: 130, art: 3, th: 12 },
];
function pictures(c, S) {
  const { ag, years } = S;
  PICS.forEach((p, i) => {
    const sg = i % 2 ? 1 : -1, tilt = ss(p.th * 0.4, p.th * 0.9, years) * 0.13 * sg, d = ss(p.th, p.th * 1.5, years), sc = 1 - 0.55 * ss(80, 200, years);
    const cx = p.x + p.w / 2 + d * sg * 30, cy = lerp(p.y + p.h / 2, WB - p.h * 0.42 * sc, d * d);
    c.save(); c.translate(cx, cy); c.rotate(tilt + d * 0.2 * sg); c.scale(sc, sc); c.translate(-p.w / 2, -p.h / 2);
    if (d < 0.05) R(c, 5, 7, p.w, p.h, alpha('#5a4630', 0.16));
    R(c, 0, 0, p.w, p.h, ag('#7a5536')); R(c, 0, 0, p.w, 4, ag('#9a7350')); R(c, 9, 9, p.w - 18, p.h - 18, ag('#fbf4e4'));
    const ix = 20, iy = 20, iw = p.w - 40, ih = p.h - 40;
    c.save(); c.beginPath(); c.rect(ix, iy, iw, ih); c.clip();
    if (p.art === 0) { R(c, ix, iy, iw, ih, ag('#9ed0ea')); disc(c, ix + iw * 0.75, iy + ih * 0.3, 13, ag('#ffe08a')); ell(c, ix + iw * 0.3, iy + ih * 1.05, iw * 0.5, ih * 0.6, ag('#6fae5c')); ell(c, ix + iw * 0.85, iy + ih * 1.1, iw * 0.5, ih * 0.5, ag('#4f9450')); }
    else if (p.art === 1) { R(c, ix, iy, iw, ih, ag('#f3e2c0')); disc(c, ix + iw * 0.5, iy + ih * 0.45, iw * 0.3, ag('#d86a4a')); R(c, ix, iy + ih * 0.7, iw, ih * 0.1, ag('#2f8f8b')); }
    else if (p.art === 2) { R(c, ix, iy, iw, ih, ag('#f6efdc')); c.strokeStyle = ag('#4b9645'); c.lineWidth = 3; c.beginPath(); c.moveTo(ix + iw / 2, iy + ih); c.lineTo(ix + iw / 2, iy + 14); c.stroke(); for (let k = 0; k < 4; k++) { ell(c, ix + iw / 2 - 16, iy + 26 + k * 22, 14, 6, ag('#4b9645')); ell(c, ix + iw / 2 + 16, iy + 36 + k * 22, 14, 6, ag('#72b955')); } }
    else { R(c, ix, iy, iw, ih, ag('#f7c98a')); disc(c, ix + iw * 0.5, iy + ih * 0.62, 20, ag('#fff0c0')); quad(c, [[ix, iy + ih], [ix + iw * 0.3, iy + ih * 0.35], [ix + iw * 0.55, iy + ih]], ag('#31456e')); quad(c, [[ix + iw * 0.35, iy + ih], [ix + iw * 0.7, iy + ih * 0.5], [ix + iw, iy + ih]], ag('#4a618f')); }
    c.restore();
    quad(c, [[ix, iy], [ix + iw * 0.35, iy], [ix + iw * 0.1, iy + ih], [ix, iy + ih]], alpha('#ffffff', 0.12 * (1 - S.gr)));
    c.restore();
  });
}
function hooks(c, S) {
  const { ag, years } = S, away = 1 - ss(60, 130, years);
  R(c, 132, 322, 222, 20, ag('#8a5f3c')); R(c, 132, 322, 222, 4, ag('#a87a50'));
  for (let i = 0; i < 4; i++) disc(c, 162 + i * 54, 334, 7, ag('#e2b04a'));
  if (away <= 0.01) return;
  const item = (i, th, bottom, fn) => {
    const f = ss(th, th * 1.6, years), k = f * f;
    c.save(); c.translate(162 + i * 54 + f * 20 * (i % 2 ? 1 : -1), lerp(334, WB - 4, k)); c.scale(away * (1 + 0.25 * f), away * (1 - 0.72 * f) * (bottom ? 1 : 1)); fn(); c.restore();
  };
  // yellow raincoat
  item(0, 9, 1, () => {
    const col = ag('#e9b44c'), p = blob([[-6, 0, 1], [6, 0, 1], [44, 30], [62, 150], [44, 156], [38, 250], [-40, 250], [-46, 156], [-64, 150], [-44, 30]]);
    c.fillStyle = lin(c, -60, 0, 60, 0, [[0, tone(col, 0.1)], [1, tone(col, -0.14)]]); c.fill(p);
    R(c, -2, 30, 4, 220, tone(col, -0.25)); for (let k = 0; k < 4; k++) disc(c, 8, 60 + k * 48, 4, tone(col, -0.3));
    quad(c, [[-6, 0], [-30, 22], [0, 40], [30, 22], [6, 0]], tone(col, -0.12));
  });
  // red leash
  item(1, 30, 1, () => {
    c.strokeStyle = ag('#d9453c'); c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(-9, 0); c.bezierCurveTo(-22, 80, -16, 170, 0, 196); c.bezierCurveTo(16, 170, 22, 80, 9, 0); c.stroke();
    c.strokeStyle = ag('#b9bcc4'); c.lineWidth = 4; c.beginPath(); c.arc(0, 208, 9, 0, TAU); c.stroke(); R(c, -3, 214, 6, 18, ag('#b9bcc4'));
  });
  // tote bag
  item(2, 14, 1, () => {
    c.strokeStyle = ag('#b5694f'); c.lineWidth = 6; c.beginPath(); c.moveTo(-26, 96); c.quadraticCurveTo(0, -30, 26, 96); c.stroke();
    c.fillStyle = ag('#f1e2c2'); c.fill(rrect(-42, 90, 84, 104, 8)); disc(c, 0, 140, 20, ag('#d86a4a')); R(c, -42, 174, 84, 8, ag('#2f8f8b'));
  });
  // scarf
  item(3, 6, 1, () => {
    c.fillStyle = ag('#31456e'); c.fill(blob([[-8, 0, 1], [8, 0, 1], [20, 60], [16, 170], [-2, 176], [-4, 70], [-14, 130], [-28, 124], [-20, 50]]));
    c.fillStyle = ag('#f1e2c2'); for (let k = 0; k < 3; k++) c.fillRect(-2, 110 + k * 22, 18, 7);
  });
}
function cobweb(c, x, y, r, sx, sy, a) {
  if (r < 3) return;
  c.save(); c.translate(x, y); c.scale(sx, sy); c.strokeStyle = alpha('#ffffff', 0.5 * a); c.lineWidth = 1.3; c.beginPath();
  for (let i = 0; i <= 4; i++) { const an = (i / 4) * Math.PI / 2; c.moveTo(0, 0); c.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
  for (let k = 1; k <= 4; k++) for (let i = 0; i < 4; i++) {
    const rr = (r * k) / 4.4, a0 = (i / 4) * Math.PI / 2, a1 = ((i + 1) / 4) * Math.PI / 2, am = (a0 + a1) / 2;
    c.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr); c.quadraticCurveTo(Math.cos(am) * rr * 0.8, Math.sin(am) * rr * 0.8, Math.cos(a1) * rr, Math.sin(a1) * rr);
  }
  c.stroke(); c.restore();
}

// ---------- window ----------
const PANE_TH = [0.55, 0.2, 0, 0.35], PANE_C = [[0.3, 0.7], [0.6, 0.4], [0.5, 0.5], [0.7, 0.6]];
function windowAsm(c, S) {
  const { ag, years } = S, { x, y, w, h } = WIN, mid = y + h / 2, fc = ag('#fbf3e2'), fs = ag('#d9ccb2');
  const fm = (i) => 1 - ss(55 + i * 10, 80 + i * 10, years), gG = clamp(S.A.grime * 1.6);
  const pane = (px, py, pw, ph, i) => {
    const m = clamp((S.miss - PANE_TH[i]) / 0.4);
    if (m >= 0.99) return;
    const p = new Path2D(), cx = px + pw * PANE_C[i][0], cy = py + ph * PANE_C[i][1];
    p.rect(px, py, pw, ph);
    if (m > 0) { const RR = Math.hypot(pw, ph) * 1.3 * m; for (let j = 0; j < 12; j++) { const a = -(j / 12) * TAU, rr = RR * (j % 2 ? 0.6 : 1) * (0.8 + 0.4 * hash(j, i)); if (j) p.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else p.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } p.closePath(); }
    c.save(); c.beginPath(); c.rect(px, py, pw, ph); c.clip(); c.clip(p, 'evenodd');
    R(c, px, py, pw, ph, alpha(mix('#e4f3ff', '#a59d80', gG * 0.8), 0.12 + 0.36 * gG));
    c.fillStyle = alpha('#ffffff', 0.2 * (1 - gG * 0.7));
    quad(c, [[px + pw * 0.12, py + ph], [px + pw * 0.46, py], [px + pw * 0.62, py], [px + pw * 0.28, py + ph]], c.fillStyle);
    quad(c, [[px + pw * 0.7, py + ph], [px + pw * 1.04, py], [px + pw * 1.1, py], [px + pw * 0.76, py + ph]], c.fillStyle);
    const ck = clamp(S.crack * 1.4 - PANE_TH[i]);
    if (ck > 0.01) { c.strokeStyle = alpha('#ffffff', 0.75); c.lineWidth = 1.6; c.beginPath(); for (let j = 0; j < 6; j++) { const a = (j / 6) * TAU + hash(j, i + 20) * 0.8, L = pw * 0.7 * ck * (0.5 + hash(j, i + 30)); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * L * 0.5 + 6, cy + Math.sin(a) * L * 0.5 - 5); c.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); } c.stroke(); }
    c.restore();
  };
  pane(x + 14, y + 14, w / 2 - 21, h / 2 - 22, 0); pane(x + w / 2 + 7, y + 14, w / 2 - 21, h / 2 - 22, 1);
  R(c, x + w / 2 - 7, y, 14, (h / 2) * fm(1), fc);
  R(c, x, mid - 9, w * fm(2), 18, fc); R(c, x, mid + 7, w * fm(2), 3, fs);
  // lower sash
  c.save(); c.translate(0, -S.winOpen * (h / 2 - 24) + ss(25, 70, years) * 14); if (years > 25) { c.translate(x, mid); c.rotate(ss(25, 70, years) * 0.03); c.translate(-x, -mid); }
  pane(x + 22, mid + 12, w / 2 - 31, h / 2 - 44, 2); pane(x + w / 2 + 9, mid + 12, w / 2 - 31, h / 2 - 44, 3);
  const f4 = fm(4);
  R(c, x + 10, mid - 4, (w - 20) * f4, 16, fc); R(c, x + 10, y + h - 34, (w - 20) * f4, 20, fc); R(c, x + 10, y + h - 34, (w - 20) * f4, 3, ag('#ffffff'));
  R(c, x + 10, mid, 12, (h / 2 - 14) * f4, fc); R(c, x + w - 22, mid, 12, (h / 2 - 14) * f4, fc); R(c, x + w / 2 - 7, mid, 14, (h / 2 - 14) * f4, fc);
  if (f4 > 0.9) c.fillStyle = ag('#e2b04a'), c.fill(rrect(x + w / 2 - 22, y + h - 30, 44, 9, 4));
  c.restore();
  // outer frame
  R(c, x, y, w * fm(0), 14, fc); R(c, x, y + 14, w * fm(0), 3, fs);
  R(c, x, y, 14, h * fm(3), fc); R(c, x + 14, y, 3, h * fm(3), fs);
  R(c, x + w - 14, y, 14, h * fm(5), fc);
  R(c, x + w * (1 - fm(6)), y + h - 14, w * fm(6), 14, fc);
}
function sill(c, S) {
  const ag = S.ag;
  R(c, WIN.x - 24, WIN.y - 20, WIN.w + 48, 22, ag('#fbf3e0')); R(c, WIN.x - 24, WIN.y - 20, WIN.w + 48, 4, ag('#ffffff'));
  R(c, WIN.x - 16, WIN.y, 18, WIN.h, ag('#fbf3e0')); R(c, WIN.x + WIN.w - 2, WIN.y, 18, WIN.h, ag('#fbf3e0'));
  R(c, WIN.x - 34, DADO, WIN.w + 68, 12, ag('#fffaf0')); R(c, WIN.x - 34, DADO + 12, WIN.w + 68, 14, ag('#e9dcc2')); R(c, WIN.x - 26, DADO + 26, WIN.w + 52, 8, alpha('#35564c', 0.22));
  if (S.dust > 0.02) R(c, WIN.x - 34, DADO, WIN.w + 68, 5, alpha('#cfc6b2', S.dust * 0.6));
}
function curtains(c, S) {
  const { ag, years, t } = S, len = 1 - yt(years, [[2, 0], [8, 0.25], [25, 0.7], [50, 1]]);
  const rodA = yt(years, [[15, 0], [30, 0.08], [60, 1.3]]), rodL = 1 - ss(60, 110, years);
  if (rodL > 0.01) { c.save(); c.translate(2080, 160); c.rotate(rodA); R(c, 0, -5, 640 * rodL, 9, ag('#7a5a3c')); disc(c, 0, 0, 9, ag('#e2b04a')); disc(c, 640 * rodL, 0, 9, ag('#e2b04a')); c.restore(); }
  if (len <= 0.01) return;
  const base = mix(ag('#cf6f4f'), '#b3a089', S.rot * 0.7), sw = S.winOpen * wind(t, 2400) * 14 + wind(t * 0.5, 2100) * 2;
  for (const [x0, x1, n] of [[2084, 2198, 3], [2602, 2716, 4]]) {
    const yb = 164 + 540 * len, wv = x1 - x0, pts = [[x0, 164, 1], [x1, 164, 1]];
    for (let j = 0; j <= 8; j++) { const u = 1 - j / 8; pts.push([x0 + wv * u + sw * (0.4 + 0.6 * u), yb + (j % 2 ? 10 : 0) - (1 - len) * 70 * hash(j, n), j === 0 || j === 8 ? 1 : 0]); }
    const p = blob(pts);
    c.fillStyle = lin(c, x0, 0, x1, 0, [[0, tone(base, 0.1)], [0.5, base], [1, tone(base, -0.12)]]); c.fill(p);
    c.save(); c.clip(p);
    for (let k = 0; k < 4; k++) { const fx = x0 + (k + 0.5) * (wv / 4); R(c, fx + sw * 0.5, 164, 9, 560, alpha('#6a2a1a', 0.16)); R(c, fx - 14 + sw * 0.5, 164, 7, 560, alpha('#ffe6c8', 0.12)); }
    R(c, x0 - 20, 164, wv + 40, 16, tone(base, -0.2));
    c.restore();
  }
}

// ---------- furniture ----------
const BOOKS = (() => {
  const r = RNG(58), a = [], cols = ['#2f8f8b', '#d86a4a', '#e9b44c', '#f3e6cc', '#31456e', '#8fb5aa', '#b5694f', '#6d8a5a'];
  const run = (x0, x1, yb, hmax) => { let x = x0; while (x < x1 - 10) { const w = r.range(12, 24), h = r.range(hmax * 0.7, hmax); a.push({ x: x + w / 2, y: yb, w, h, col: r.pick(cols), lean: r.chance(0.12) ? r.range(-0.2, 0.2) : 0, loose: r.chance(0.36), fy: r.range(15, 60), fx: r.range(900, 1140), fyy: r.range(856, 930), fr: r.sign() * r.range(1.2, 1.9) }); x += w + 1; } };
  run(890, 1000, 522, 78); run(984, 1092, 622, 80); run(890, 1040, 722, 82); run(1010, 1092, 832, 70);
  return a;
})();
function drawBook(c, b, x, y, rot, S) {
  c.save(); c.translate(x, y); c.rotate(rot);
  const col = S.ag(b.col, 1.3);
  R(c, -b.w / 2, -b.h, b.w, b.h, col); R(c, -b.w / 2, -b.h, 3, b.h, tone(col, 0.18)); R(c, -b.w / 2, -b.h * 0.82, b.w, 5, tone(col, -0.25)); R(c, -b.w / 2, -b.h * 0.3, b.w, 3, tone(col, -0.25));
  c.restore();
}
function bookshelf(c, S) {
  const { ag, years, t } = S, th = S.shelf * 1.5, sq = 1 - 0.62 * S.frag, wood = ag('#b98352'), wd = tone(wood, -0.3), px = 1110, py = WB;
  shadow(c, 990 + S.shelf * 330, WB + 10, 150 + 100 * S.shelf, 12, 0.22);
  c.save(); c.translate(0, py); c.scale(1, sq); c.translate(px, 0); c.rotate(th); c.translate(-px, -py);
  R(c, 870, 416, 240, 430, wood); R(c, 884, 430, 212, 402, wd);
  for (const y of [522, 622, 722]) { R(c, 884, y, 212, 9, wood); R(c, 884, y + 9, 212, 5, alpha('#000000', 0.18)); }
  R(c, 870, 416, 240, 5, tone(wood, 0.2)); R(c, 870, 416, 5, 430, tone(wood, 0.12)); R(c, 1104, 416, 6, 430, tone(wood, -0.14));
  // ornaments
  R(c, 1030, 486, 34, 36, ag('#c8674a')); for (let k = 0; k < 5; k++) ell(c, 1047 + (k - 2) * 9, 480 - Math.abs(k - 2) * -3 - 8, 7, 14 * (1 - 0.6 * ss(0.05, 1, years)), mix(LEAF.mid, '#8a7a44', ss(0.05, 1, years)));
  R(c, 898, 556, 62, 66, ag('#7a5536')); R(c, 905, 563, 48, 52, ag('#f4dcae')); disc(c, 929, 585, 12, ag('#e58e4a')); R(c, 905, 600, 48, 15, ag('#6fae5c'));
  c.fillStyle = ag('#2f8f8b'); c.fill(blob([[1058, 722, 1], [1084, 722, 1], [1090, 690], [1078, 664], [1080, 650], [1062, 650], [1064, 664], [1052, 690]]));
  c.fill(rrect(890, 762, 104, 70, 6)); R(c, 890, 762, 104, 12, ag('#3aa39e')); R(c, 928, 790, 28, 8, ag('#f3e6cc'));
  for (const b of BOOKS) if (!b.loose) drawBook(c, b, b.x, b.y, b.lean, S);
  // trailing plant on top
  const dead = ss(0.05, 1.2, years), gone = ss(1, 8, years);
  R(c, 1040, 384, 46, 32, ag('#c8674a')); R(c, 1036, 380, 54, 9, ag('#d98463'));
  if (gone < 0.99) { const lc = [mix(LEAF.mid, '#9a8648', dead), mix(LEAF.light, '#b9a45a', dead)]; for (let k = 0; k < 14; k++) { const u = k / 13, sx = 1050 + hash(k, 3) * 30, L = (20 + u * 120) * (1 - gone), dx = (hash(k, 4) - 0.3) * 60 + wind(t, k * 40) * 3; ell(c, sx + dx * u + (k % 2 ? 9 : -9), 384 + L * (0.4 + 0.6 * hash(k, 5)) - 12 + dead * 10, 10 * (1 - gone), 6 * (1 - gone), lc[k % 2]); } }
  if (S.dust > 0.02) R(c, 870, 416, 240, 4, alpha('#e3dccb', S.dust * 0.6));
  if (S.mossy > 0.05) moss(c, 874, 1106, 418, { h: 13 * S.mossy, seed: 6 });
  c.restore();
  // loose books spill onto the floor
  const cs = Math.cos(th), sn = Math.sin(th);
  for (const b of BOOKS) if (b.loose) {
    const sp = ss(b.fy, b.fy * 1.4, years), dx = b.x - px, dy = b.y - py, wx = px + dx * cs - dy * sn, wy = py + (dx * sn + dy * cs) * sq, sc = 1 - 0.5 * S.frag;
    c.save(); c.translate(lerp(wx, b.fx, sp), lerp(wy, b.fyy, sp * sp)); c.scale(sc, sc); drawBook(c, b, 0, 0, lerp(th + b.lean, b.fr, sp), S); c.restore();
  }
}
function tvSet(c, S) {
  const { ag, years, t } = S, fall = yt(years, [[10, 0], [20, 0.12], [45, 1]]), flat = yt(years, [[30, 0], [80, 1]]), frag = S.frag;
  const ssc = 1 - 0.6 * flat - 0.2 * frag, top = 858 - 116 * ssc, wd = ag('#8a5a3a');
  shadow(c, 1300, 860, 170, 12, 0.24);
  c.save(); c.translate(0, 858); c.scale(1, ssc); c.translate(0, -858);
  c.fillStyle = ag('#5e3d28'); c.fillRect(1176, 836, 10, 22); c.fillRect(1414, 836, 10, 22);
  c.fillStyle = lin(c, 0, 742, 0, 842, [[0, tone(wd, 0.1)], [1, tone(wd, -0.14)]]); c.fill(rrect(1160, 742, 280, 100, 6));
  R(c, 1160, 742, 280, 7, tone(wd, 0.24)); R(c, 1256, 758, 88, 74, tone(wd, -0.34)); R(c, 1256, 796, 88, 6, tone(wd, 0.05));
  R(c, 1266, 806, 60, 20, ag('#2b2f3a')); disc(c, 1316, 816, 3, ag('#6fd08a')); R(c, 1266, 768, 9, 28, ag('#d86a4a')); R(c, 1276, 772, 9, 24, ag('#e9b44c')); R(c, 1286, 766, 11, 30, ag('#2f8f8b'));
  for (const dx of [1170, 1352]) { c.fillStyle = tone(wd, 0.05); c.fill(rrect(dx, 756, 78, 76, 4)); R(c, dx + 6, 762, 66, 3, tone(wd, 0.2)); disc(c, dx === 1170 ? dx + 68 : dx + 10, 794, 3.5, ag('#e2b04a')); }
  if (S.dust > 0.02) R(c, 1160, 742, 280, 4, alpha('#e3dccb', S.dust * 0.6));
  c.restore();
  // TV
  c.save(); c.translate(1300, top); c.rotate(0.09 * ss(0, 0.14, fall) * (1 - ss(0.5, 1, fall))); c.scale(1, lerp(1, 0.13, ss(0.14, 1, fall)) * (1 - 0.5 * frag));
  const bz = ag('#23252e');
  R(c, -10, -9, 20, 9, bz); R(c, -48, -3, 96, 4, bz);
  c.fillStyle = bz; c.fill(rrect(-125, -155, 250, 146, 8));
  const on = S.tvOn * (0.85 + 0.15 * noise1(t * 6, 3));
  c.save(); c.beginPath(); c.rect(-117, -147, 234, 130); c.clip();
  c.fillStyle = lin(c, -117, -147, 117, -17, [[0, ag('#394050')], [1, ag('#1b1f28')]]); c.fillRect(-117, -147, 234, 130);
  if (on > 0.02) {
    c.globalAlpha = on;
    c.fillStyle = lin(c, 0, -147, 0, -17, [[0, '#7ec3f2'], [0.6, '#d5ecf8'], [1, '#bfe3c0']]); c.fillRect(-117, -147, 234, 130);
    disc(c, -60 + ((t * 6) % 40), -112, 14, '#fff3c4'); ell(c, -40, -8, 120, 46, '#5ea653'); ell(c, 70, -4, 100, 38, '#3f8a40');
    const bx = ((t * 22) % 280) - 140; ell(c, bx, -52, 16, 9, '#e9a53f'); disc(c, bx + 14, -60, 7, '#e9a53f');
    c.globalAlpha = 1;
  }
  quad(c, [[-90, -17], [-40, -147], [-10, -147], [-60, -17]], alpha('#ffffff', 0.07)); 
  if (years > 12) { c.strokeStyle = alpha('#c9d2de', 0.5 * ss(12, 20, years)); c.lineWidth = 1.5; c.beginPath(); for (let j = 0; j < 6; j++) { c.moveTo(30, -90); c.lineTo(30 + Math.cos(j * 1.1) * 110, -90 + Math.sin(j * 1.1) * 70); } c.stroke(); }
  c.restore();
  if (S.dust > 0.02) R(c, -125, -155, 250, 4, alpha('#e3dccb', S.dust * 0.7));
  c.restore();
}
function lamp(c, S) {
  const { ag, years } = S, tilt = yt(years, [[8, 0], [20, 0.1], [60, 0.45], [100, 1.42]]), on = S.lampOn, sc = 1 - 0.4 * S.frag;
  shadow(c, 1510, 866, 50, 9, 0.24);
  c.save(); c.translate(1510, 864); c.rotate(-tilt); c.scale(sc, sc);
  ell(c, 0, 0, 36, 9, ag('#3a3f4e')); R(c, -3.5, -360, 7, 360, ag('#4a5062')); R(c, -3.5, -360, 2.5, 360, ag('#6a7186'));
  const sh = mix(ag('#f3dfae'), '#fff3c8', on);
  c.fillStyle = lin(c, -62, 0, 62, 0, [[0, tone(sh, 0.12)], [1, tone(sh, -0.14 * (1 - on))]]);
  c.beginPath(); c.moveTo(-40, -446); c.lineTo(40, -446); c.lineTo(64, -352); c.lineTo(-64, -352); c.closePath(); c.fill();
  R(c, -64, -358, 128, 6, tone(sh, -0.14)); R(c, -40, -446, 80, 5, tone(sh, -0.1));
  c.strokeStyle = ag('#b9bcc4'); c.lineWidth = 1.5; c.beginPath(); c.moveTo(22, -352); c.lineTo(22, -322); c.stroke(); disc(c, 22, -320, 3, ag('#e2b04a'));
  c.restore();
}
const SOFA_HOLES = (() => { const r = RNG(66), a = []; for (let i = 0; i < 13; i++) { const m = []; for (let j = 0; j < 8; j++) m.push(r.range(0.6, 1.3)); a.push({ x: r.range(1590, 2070), y: r.range(630, 850), r: r.range(60, 130), th: r.range(0, 0.7), m }); } return a; })();
function sofa(c, S) {
  const { ag, sag, skel, frag, years } = S, x0 = 1570, x1 = 2090, w = x1 - x0;
  const T1 = mix(ag('#2f8f8b'), '#8f958a', S.rot * 0.45), T2 = tone(T1, 0.1), T3 = tone(T1, -0.2), sq = 1 - 0.22 * skel - 0.48 * frag;
  shadow(c, x0 + w / 2, WB + 16, w * 0.54, 16, 0.26);
  c.save(); c.translate(x0 + w / 2, WB + 14); c.rotate(-0.02 * skel); c.scale(1, sq); c.translate(-(x0 + w / 2), -(WB + 14));
  c.fillStyle = ag('#6b4630'); c.fillRect(x0 + 30, 846, 14, 16); c.fillRect(x1 - 44, 846, 14, 16);
  const by = 610 + sag * 16, sil = rrect(x0, by, w, 858 - by, 34);
  c.fillStyle = lin(c, 0, by, 0, by + 190, [[0, T2], [1, T1]]); c.fill(rrect(x0 + 34, by, w - 68, 200, 32));
  R(c, x0 + w / 2 - 1.5, by + 10, 3, 130, alpha('#0f3b3c', 0.3));
  c.fillStyle = alpha('#ffffff', 0.12); c.fill(rrect(x0 + 50, by + 5, w - 100, 8, 4));
  // throw pillows
  const pk = 1 - ss(20, 70, years);
  if (pk > 0.01) for (const [px, rot, col] of [[1668, -0.16, '#d86a4a'], [2022, 0.2, '#e9b44c'], [1740, 0.1, '#f1e2c2']]) {
    c.save(); c.translate(px, 752); c.rotate(rot); c.scale(pk, pk); const pc = ag(col, 1.2);
    c.fillStyle = lin(c, 0, -78, 0, 0, [[0, tone(pc, 0.1)], [1, tone(pc, -0.12)]]); c.fill(rrect(-40, -80, 80, 78, 14));
    if (col === '#f1e2c2') { R(c, -40, -52, 80, 6, ag('#2f8f8b')); R(c, -40, -36, 80, 6, ag('#d86a4a')); }
    c.restore();
  }
  // seat cushions
  for (let i = 0; i < 2; i++) {
    const cx = x0 + 78 + i * 182;
    c.fillStyle = lin(c, 0, 750, 0, 826, [[0, T2], [0.3, T1], [1, T3]]); c.fill(rrect(cx + 1, 750, 180, 76, 20));
    c.fillStyle = alpha('#ffffff', 0.13); c.fill(rrect(cx + 16, 754, 150, 7, 3.5));
    if (sag > 0.02) ell(c, cx + 91, 756, 70, 12 + 16 * sag, alpha('#0f3b3c', 0.32 * sag));
  }
  // arms and base
  for (const ax of [x0, x1 - 84]) { c.fillStyle = lin(c, ax, 0, ax + 84, 0, [[0, T2], [1, T1]]); c.fill(rrect(ax, 674 + sag * 8, 84, 184 - sag * 8, 34)); c.fillStyle = alpha('#ffffff', 0.12); c.fill(rrect(ax + 14, 680 + sag * 8, 56, 7, 3.5)); }
  R(c, x0 + 80, 822, w - 160, 36, T3); R(c, x0 + 80, 822, w - 160, 4, alpha('#0f3b3c', 0.3));
  // sunbeam across the right half
  if (S.beam > 0.02 && S.brk < 0.5) { c.save(); c.clip(sil); quad(c, [[1897, 590], [2110, 590], [2110, 880], [1720, 880]], alpha(S.look.key, 0.2 * S.beam * (1 - S.brk * 2) * (1 - 0.5 * S.gr))); c.restore(); }
  if (S.dust > 0.3) { c.save(); c.clip(sil); R(c, x0, by, w, 30, alpha('#cfc6b2', (S.dust - 0.3) * 0.3)); c.restore(); }
  // decay: holes showing frame and springs
  if (skel > 0.01) {
    const hp = new Path2D(); let any = false;
    for (const h of SOFA_HOLES) { const k = ss(h.th, h.th + 0.4, skel * 1.3); if (k <= 0.01) continue; any = true; hp.addPath(blob(h.m.map((m, j) => { const a = (j / 8) * TAU; return [h.x + Math.cos(a) * h.r * m * k, h.y + Math.sin(a) * h.r * m * k]; }))); }
    if (any) {
      c.save(); c.clip(hp); c.clip(sil);
      R(c, x0, by, w, 260, '#2a1f18');
      const beam = ag('#8a6846', 1.4);
      for (const yy of [by + 14, 748, 838]) R(c, x0 + 10, yy, w - 20, 16, beam);
      for (let xx = x0 + 14; xx < x1; xx += 124) R(c, xx, by + 10, 16, 240, tone(beam, -0.12));
      c.strokeStyle = '#8c9199'; c.lineWidth = 3; c.beginPath();
      for (let xx = x0 + 110; xx < x1 - 100; xx += 44) { c.moveTo(xx, 836); for (let k = 0; k < 6; k++) c.lineTo(xx + (k % 2 ? 12 : -12), 824 - k * 12); }
      c.stroke();
      c.restore();
      c.strokeStyle = alpha(ag('#f1e2c2'), 0.5); c.lineWidth = 3; c.save(); c.clip(sil); c.stroke(hp); c.restore();
    }
  }
  if (S.mossy > 0.05) { moss(c, x0 + 40, x1 - 40, by + 3, { h: 16 * S.mossy, seed: 4 }); moss(c, x0 + 6, x0 + 80, 678 + sag * 8, { h: 12 * S.mossy, seed: 5 }); moss(c, x1 - 80, x1 - 6, 678 + sag * 8, { h: 12 * S.mossy, seed: 7 }); }
  c.restore();
}
function coffeeTable(c, S) {
  const { ag, years } = S, tilt = ss(40, 90, years) * 0.2, sq = 1 - 0.55 * S.frag, wood = ag('#b5763f'), items = 1 - ss(15, 50, years);
  shadow(c, 1800, 964, 150, 14, 0.24);
  c.save(); c.translate(1694, 964); c.rotate(tilt); c.scale(1, sq); c.translate(-1694, -964);
  R(c, 1716, 896, 10, 46, tone(wood, -0.36)); R(c, 1874, 896, 10, 46 * (1 - ss(40, 80, years)), tone(wood, -0.36));
  R(c, 1692, 896, 13, 68, tone(wood, -0.18)); R(c, 1895, 896, 13, 68 * (1 - ss(40, 80, years) * 0.7), tone(wood, -0.18));
  c.fillStyle = lin(c, 0, 880, 0, 898, [[0, tone(wood, 0.16)], [1, tone(wood, -0.1)]]); c.fill(rrect(1680, 880, 240, 18, 6)); R(c, 1686, 880, 228, 4, tone(wood, 0.3));
  if (items > 0.01) {
    c.save(); c.translate(1800, 880); c.scale(items, items);
    R(c, -76, -34, 30, 34, ag('#2f8f8b')); R(c, -76, -34, 30, 5, ag('#3aa39e')); c.strokeStyle = ag('#2f8f8b'); c.lineWidth = 5; c.beginPath(); c.arc(-44, -17, 9, -1.2, 1.2); c.stroke();
    R(c, 6, -10, 82, 10, ag('#d86a4a')); R(c, 12, -19, 70, 9, ag('#f1e2c2')); R(c, 12, -19, 8, 9, ag('#31456e'));
    c.restore();
  }
  if (S.dust > 0.02) R(c, 1686, 880, 228, 4, alpha('#e3dccb', S.dust * 0.6));
  if (S.mossy > 0.05) moss(c, 1684, 1916, 882, { h: 11 * S.mossy, seed: 12 });
  c.restore();
}
function rug(c, S) {
  const ag = S.ag, a = 1 - ss(30, 110, S.years);
  if (a <= 0.01) return;
  c.save(); c.globalAlpha = a;
  c.fillStyle = ag('#2f8f8b'); c.fill(rrect(1540, 874, 560, 152, 30));
  c.fillStyle = ag('#f1e2c2'); c.fill(rrect(1556, 884, 528, 132, 22));
  c.fillStyle = ag('#d86a4a'); c.fill(rrect(1572, 894, 496, 112, 16)); c.fillStyle = ag('#f6ead2'); c.fill(rrect(1580, 900, 480, 100, 12));
  for (let i = 0; i < 6; i++) { const x = 1622 + i * 79; quad(c, [[x, 950], [x + 30, 922], [x + 60, 950], [x + 30, 978]], ag(i % 2 ? '#e9b44c' : '#2f8f8b')); quad(c, [[x + 16, 950], [x + 30, 937], [x + 44, 950], [x + 30, 963]], ag('#f6ead2')); }
  c.restore();
}
function doormat(c, S) {
  const a = 1 - ss(25, 90, S.years), ag = S.ag;
  if (a <= 0.01) return;
  c.save(); c.globalAlpha = a;
  c.fillStyle = ag('#b5633f'); c.fill(rrect(-160, 856, 240, 40, 6)); R(c, -148, 864, 216, 4, ag('#f1e2c2')); R(c, -148, 884, 216, 4, ag('#f1e2c2'));
  c.restore();
}
function perchStand(c, S) {
  const { ag, years } = S, tilt = yt(years, [[40, 0], [100, 0.22], [140, 1.45]]), wood = ag('#b98352'), steel = ag('#c3c8d0'), sc = 1 - 0.5 * S.frag;
  shadow(c, 2790, 866, 80, 10, 0.24);
  c.save(); c.translate(2790, 864); c.rotate(-tilt); c.scale(sc, sc);
  ell(c, 0, 0, 74, 12, ag('#7a8290')); ell(c, 0, -4, 70, 10, ag('#aeb5c0')); R(c, -5, -340, 10, 338, steel); R(c, -5, -340, 3, 338, ag('#e3e7ec'));
  R(c, -5, -160, 10, 8, ag('#7a8290'));
  c.fillStyle = lin(c, 0, -352, 0, -338, [[0, tone(wood, 0.16)], [1, tone(wood, -0.16)]]); c.fill(rrect(-78, -350, 156, 14, 7));
  for (const sx of [-1, 1]) { c.fillStyle = steel; c.beginPath(); c.arc(sx * 62, -336, 16, 0, Math.PI); c.fill(); R(c, sx * 62 - 16, -338, 32, 3, ag('#8a919c')); }
  c.strokeStyle = ag('#e9b44c'); c.lineWidth = 3; c.beginPath(); c.moveTo(-30, -336); c.lineTo(-30, -290); c.stroke(); disc(c, -30, -300, 6, ag('#d86a4a')); disc(c, -30, -286, 6, ag('#2f8f8b'));
  c.restore();
}
function sillPlant(c, S) {
  const { ag, years, t } = S, dead = ss(0.04, 0.8, years), gone = ss(0.8, 5, years), x = 2212;
  R(c, x - 20, DADO - 34, 40, 34, ag('#c8674a')); R(c, x - 24, DADO - 38, 48, 9, ag('#d98463'));
  if (gone < 0.99) for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.33 * (1 + dead * 0.8), L = (34 + (k % 2) * 10) * (1 - gone); c.save(); c.translate(x, DADO - 38); c.rotate(a + Math.PI / 2 + wind(t, k * 30) * 0.02); ell(c, 0, -L * 0.6, 7, L * 0.55, mix(k % 2 ? LEAF.mid : LEAF.light, '#a08a4a', dead)); c.restore(); }
  if (S.sprout > 0.02) tree(c, 2470, DADO, { kind: 'sapling', h: 150 * S.sprout, seed: 9, t, grow: 1, shadow: 0 });
}

// ---------- overgrowth ----------
const MOSSP = (() => { const r = RNG(121), a = []; for (let i = 0; i < 24; i++) a.push({ x: r.range(X0, X1), y: r.range(858, 1120), rx: r.range(130, 360), ry: r.range(16, 44), th: r.range(0, 0.7) }); return a; })();
const mkFerns = (seed, n, y0, y1, s0, s1, skip) => { const r = RNG(seed), a = []; for (let i = 0; i < n; i++) { const x = X0 + ((i + r.range(0.1, 0.9)) / n) * (X1 - X0); const f = { x, y: r.range(y0, y1), s: r.range(s0, s1), th: r.range(0, 0.65), seed: r.int(1, 9999) }; if (!skip || !skip(x)) a.push(f); } return a; };
const FERN_B = mkFerns(131, 18, 852, 872, 60, 130), FERN_F = mkFerns(133, 13, 960, 1110, 90, 170, (x) => (x > 300 && x < 760) || (x > 930 && x < 1090));
function ferns(c, list, S) {
  if (S.green <= 0.01) return;
  const t = S.t, paths = [new Path2D(), new Path2D(), new Path2D()];
  for (const f of list) {
    const k = ss(f.th, f.th + 0.35, S.green);
    if (k <= 0.01) continue;
    const r = RNG(f.seed), s = f.s * k, n = 6;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5, ang = -Math.PI / 2 + u * 2.3 + r.range(-0.15, 0.15) + wind(t, f.x + i * 20) * 0.05, len = s * r.range(0.7, 1.1), dr = len * 0.55 * Math.abs(u) * 2;
      const mx = f.x + Math.cos(ang) * len * 0.6, my = f.y + Math.sin(ang) * len * 0.75, tx = f.x + Math.cos(ang) * len, ty = f.y + Math.sin(ang) * len + dr, p = paths[(i + f.seed) % 3], L = [], Rr = [];
      for (let j = 0; j <= 8; j++) {
        const v = j / 8, a1 = (1 - v) * (1 - v), b1 = 2 * v * (1 - v), c1 = v * v, qx = a1 * f.x + b1 * mx + c1 * tx, qy = a1 * f.y + b1 * my + c1 * ty;
        const dx = 2 * (1 - v) * (mx - f.x) + 2 * v * (tx - mx), dy = 2 * (1 - v) * (my - f.y) + 2 * v * (ty - my), dl = Math.hypot(dx, dy) || 1, wd = len * 0.17 * Math.sin(Math.PI * Math.min(1, v * 1.08 + 0.04)) * (j % 2 ? 1 : 0.5);
        L.push([qx - (dy / dl) * wd, qy + (dx / dl) * wd]); Rr.push([qx + (dy / dl) * wd, qy - (dx / dl) * wd]);
      }
      p.moveTo(f.x, f.y); for (const q of L) p.lineTo(q[0], q[1]); for (let j = 8; j >= 0; j--) p.lineTo(Rr[j][0], Rr[j][1]); p.closePath();
    }
  }
  [LEAF.dark, LEAF.mid, LEAF.light].forEach((col, i) => { c.fillStyle = col; c.fill(paths[i]); });
}
function mossCarpet(c, S, y0, y1) {
  if (S.green <= 0.01) return;
  const a = new Path2D(), b = new Path2D();
  for (const m of MOSSP) { if (m.y < y0 || m.y >= y1) continue; const k = ss(m.th, m.th + 0.35, S.green); if (k <= 0.01) continue; a.ellipse(m.x, m.y, m.rx * k, m.ry * k, 0, 0, TAU); a.closePath(); b.moveTo(m.x - m.rx * 0.1 + m.rx * 0.62 * k, m.y - m.ry * 0.2); b.ellipse(m.x - m.rx * 0.1, m.y - m.ry * 0.2, m.rx * 0.62 * k, m.ry * 0.55 * k, 0, 0, TAU); }
  c.fillStyle = '#3f6a35'; c.fill(a); c.fillStyle = '#5b8f45'; c.fill(b);
}
const flw = (c, x0, x1, y, n, seed, s, t) => { if (s <= 0.02) return; c.save(); c.translate(0, y); c.scale(s, s); flowers(c, x0 / s, x1 / s, 0, { n, seed, t, h: 36, yVar: 8 }); c.restore(); };
const RUBBLE = (() => { const r = RNG(141), a = []; for (let i = 0; i < 34; i++) a.push({ x: r.range(1990, 2900), y: r.range(848, 892), w: r.range(22, 54), h: r.range(12, 26), a: r.range(-0.6, 0.6), th: r.range(0, 0.6), col: r.pick(['#a8563f', '#b46248', '#9c4f3b', '#c4ae97', '#b9ab98']) }); return a; })();
function wallGreens(c, S) {
  const t = S.t;
  if (S.ivyIn > 0.02) {
    ivy(c, WIN.x - 40, DADO + 20, WIN.w + 80, WB - DADO - 20, { hang: true, cover: S.ivyIn, seed: 3, t });
    ivy(c, WIN.x - 120, 110, 110, 520, { cover: S.ivyIn * 0.9, seed: 5, t }); ivy(c, WIN.x + WIN.w + 8, 110, 130, 520, { cover: S.ivyIn * 0.9, seed: 6, t });
  }
  if (S.ivy2 > 0.02) {
    ivy(c, X0, 40, 620, WB - 40, { cover: S.ivy2 * 0.8, seed: 8, t, density: 0.8 });
    ivy(c, 760, CEIL, 1240, 430, { hang: true, cover: S.ivy2 * 0.75, seed: 9, t, density: 0.7 });
    vines(c, X0, X1, CEIL + 4, { len: 210 * S.ivy2, n: 44, seed: 21, t });
  }
}
function floorDress(c, S) {
  const { t, years } = S;
  // rubble under ceiling holes
  CH.forEach((h, n) => { const s = chSize(S, h); if (s <= 0.01) return; const k = Math.min(1, s); for (let i = 0; i < 9; i++) { const x = h.x + (hash(i, 50 + n) - 0.5) * h.w * 2.4, rr = (14 + 22 * hash(i, 52 + n)) * k; ell(c, x, 858 + hash(i, 51 + n) * 16, rr * 1.5, rr * 0.7, S.ag(i % 3 ? '#b9ab98' : '#8a6d53', 1.3)); } c.save(); c.translate(h.x + 30, 860); c.rotate(-0.2 - 0.1 * n); R(c, -110 * k, -9, 220 * k, 16 * k, S.ag('#7a5a40', 1.3)); c.restore(); });
  // rubble under the wall break
  if (S.brk > 0.01) for (const b of RUBBLE) { const k = ss(b.th, b.th + 0.3, S.brk * 1.4); if (k <= 0.01) continue; c.save(); c.translate(b.x, b.y); c.rotate(b.a); R(c, -b.w * k / 2, -b.h * k / 2, b.w * k, b.h * k, S.ag(b.col, 1.2)); c.restore(); }
  mossCarpet(c, S, 0, 930);
  if (S.leaves > 0.01) { litter(c, 1900, 2900, 880, { n: Math.round(46 * S.leaves), seed: 3, yVar: 24 }); litter(c, X0, 1900, 884, { n: Math.round(40 * S.leaves * clamp(years / 4)), seed: 4, yVar: 26 }); }
  if (S.green > 0.02) { moss(c, X0, X1, WB + 2, { h: 12 * S.green, seed: 8 }); grass(c, X0, X1, 862, { h: 50 * S.green, density: 0.07, seed: 15, t, yVar: 8 }); }
  ferns(c, FERN_B, S);
  flw(c, X0, X1, 872, 44, 5, S.flower, t);
}

// ---------- foreground plane (depth 1.3), darkened ----------
const fgc = (col) => mix(col, '#131a2a', 0.42);
function fgPlant(c, x, y, s, S, seed) {
  const { years, t } = S, dead = ss(0.05, 1.2, years), gone = ss(1.2, 6, years), r = RNG(seed);
  if (gone < 0.99) for (let i = 0; i < 11; i++) {
    const u = i / 10 - 0.5, a = -Math.PI / 2 + u * 1.9 + Math.sign(u || 1) * dead * 0.7 + wind(t, x + i * 60) * 0.03, L = s * r.range(0.65, 1.1) * (1 - gone), wd = L * r.range(0.16, 0.24);
    const tx = x + Math.cos(a) * L, ty = y - s * 0.2 + Math.sin(a) * L + Math.abs(u) * L * 0.5, mx = (x + tx) / 2, my = (y - s * 0.2 + ty) / 2 - L * 0.2, nx = -(ty - y) / L, ny = (tx - x) / L;
    c.fillStyle = fgc(mix([LEAF.dark, LEAF.mid, LEAF.deep][i % 3], '#8f7c44', dead));
    c.beginPath(); c.moveTo(x, y - s * 0.2); c.quadraticCurveTo(mx + nx * wd, my + ny * wd, tx, ty); c.quadraticCurveTo(mx - nx * wd, my - ny * wd, x, y - s * 0.2); c.fill();
  }
  quad(c, [[x - s * 0.22, y - s * 0.24], [x + s * 0.22, y - s * 0.24], [x + s * 0.17, y + s * 0.2], [x - s * 0.17, y + s * 0.2]], fgc(S.ag('#c8674a')));
  R(c, x - s * 0.25, y - s * 0.28, s * 0.5, s * 0.08, fgc(S.ag('#d98463')));
}
function foreground(c, S) {
  const { t } = S;
  fgPlant(c, -380, 1150, 330, S, 3); fgPlant(c, 3330, 1160, 300, S, 8);
  if (S.ivy2 > 0.02) vines(c, -900, 4300, -720, { len: 1120 * S.ivy2, n: 26, seed: 71, t, colors: [fgc(LEAF.dark), fgc(LEAF.mid), fgc(LEAF.deep)] });
  if (S.green > 0.05) {
    const fl = [{ x: -330, y: 1190, s: 300, th: 0.1, seed: 5 }, { x: 420, y: 1230, s: 260, th: 0.3, seed: 6 }, { x: 1700, y: 1240, s: 240, th: 0.4, seed: 7 }, { x: 2700, y: 1230, s: 280, th: 0.2, seed: 8 }, { x: 3350, y: 1200, s: 320, th: 0.05, seed: 9 }];
    c.save(); ferns(c, fl, S); c.fillStyle = alpha('#131a2a', 0.0); c.restore();
  }
}

// ---------- the set ----------
export function apartmentSet(g, t, o) {
  const S = state(g, t, o), hide = S.hide;
  o = S.o;
  g.layer(1, (c) => {
    const v = g.view(1, 40), ag = S.ag;
    shell(c, S, v); wall(c, S); floor(c, S);
    door(c, S);
    if (!hide.clock) clock(c, S);
    if (!hide.pictures) pictures(c, S);
    if (!hide.hooks) hooks(c, S);
    sill(c, S);
    wallGreens(c, S);
    // exterior seen through the openings
    const op = openings(S, v);
    c.save(); c.clip(op.all);
    if (hide.ext) R(c, v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0, S.look.sky[2][1]);
    else { c.save(); exterior(c, S); c.restore(); }
    outside(c, S);
    c.restore();
    if (S.brk > 0.01) { c.strokeStyle = mix('#7d4c3c', '#5c5a3c', S.mossy * 0.5); c.lineWidth = 24 * ss(0, 0.1, S.brk); c.lineJoin = 'bevel'; c.stroke(op.hole); }
    // roof garden
    if (S.A.weeds > 0.05 && v.y0 < ROOF) { grass(c, X0 - WT, X1 + WT, ROOF + 2, { h: 46 * S.A.weeds, density: 0.1, seed: 44, t: S.t }); }
    windowAsm(c, S);
    if (!hide.curtains) curtains(c, S);
    CH.forEach((h, n) => { const s = chSize(S, h); if (s > 0.01) vines(c, h.x - h.w * s, h.x + h.w * s, CEIL + 2, { len: 330 * S.A.vines * Math.min(1, s), seed: 25 + n, t: S.t, n: 8 }); });
    if (S.cob > 0.02) {
      const k = S.cob;
      cobweb(c, X0, CEIL + 26, 190 * k, 1, 1, k); cobweb(c, X1, CEIL + 26, 170 * k, -1, 1, k); cobweb(c, DOOR.x + DOOR.w + 20, DOOR.y - 20, 90 * k, 1, -1, k);
      cobweb(c, 1110, 416, 80 * k, 1, -1, k); cobweb(c, WIN.x - 24, WIN.y - 20, 100 * k, -1, -1, k); cobweb(c, X0, WB - 26, 110 * k, 1, -1, k); cobweb(c, 1446, 742, 60 * k, 1, -1, k);
    }
    // furniture against the wall
    if (!hide.mat) doormat(c, S);
    if (!hide.rug) rug(c, S);
    if (!hide.lamp) lamp(c, S);
    if (!hide.tv) tvSet(c, S);
    if (!hide.shelf) bookshelf(c, S);
    if (!hide.sofa) sofa(c, S);
    if (!hide.perch) perchStand(c, S);
    if (!hide.plant) sillPlant(c, S);
    // window light on the floor
    const pl = S.beam * (1 - clamp(S.brk * 2.5)) * (1 - 0.5 * clamp(S.A.grime * 1.5) * (1 - clamp(S.miss)));
    if (pl > 0.01) {
      const col = alpha(S.look.key, 0.3 * pl), hw = WIN.w / 2, hh = WIN.h / 2;
      c.save(); c.beginPath(); c.rect(X0, WB, X1 - X0, FRONT - WB); c.clip();
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const xa = WIN.x + i * hw + 12, xb = WIN.x + (i + 1) * hw - 12, ya = WIN.y + j * hh + 12, yb = WIN.y + (j + 1) * hh - 12; quad(c, [land(xa, yb), land(xb, yb), land(xb, ya), land(xa, ya)], col); }
      c.restore();
    }
    floorDress(c, S);
    if (S.treeG > 0.01 && !hide.tree) tree(c, TREE.x, TREE.y, { h: 1180 * S.treeG, seed: 12, t: S.t, kind: 'round', grow: 1, spread: 0.92, sway: 0.5, shadow: 0.3 });
    if (S.dust > 0.02) { c.save(); c.globalAlpha = 1; R(c, X0, FRONT - 1, 0, 0, ag('#000000')); c.restore(); }
    if (typeof o.actors === 'function') { c.save(); o.actors(c); c.restore(); }
    // in front of the actors
    if (!hide.table) coffeeTable(c, S);
    mossCarpet(c, S, 930, 9999);
    if (S.green > 0.02) grass(c, X0, X1, 1040, { h: 64 * S.green, density: 0.06, seed: 19, t: S.t, yVar: 60 });
    ferns(c, FERN_F, S);
    flw(c, X0, X1, 1030, 40, 9, S.flower, S.t);
    if (typeof o.front === 'function') { c.save(); o.front(c); c.restore(); }
  });
  if (!hide.fg) g.layer(1.3, (c) => foreground(c, S));
}

// ---------- emissive light (after g.grade) ----------
export function apartmentLight(g, t, o) {
  const S = state(g, t, o), { look, years } = S, key = look.key || '#fff6d8';
  g.layer(1, (c) => {
    const v = g.view(1, 40), day = S.dayL, brk = S.brk;
    // lit city windows through the openings
    if (S.power && S.dark > 0.3 && !S.hide.ext) {
      const op = openings(S, v);
      c.save(); c.clip(op.all); c.setTransform(g.scale, 0, 0, g.scale, 0, 0);
      for (let L = 1; L < 3; L++) g.layer(LAY[L].d, (x) => cityLayer(x, S, L, 1));
      c.restore();
    }
    // window shafts (sun by day, moon in the dark)
    const wk = S.beam * (1 - clamp(brk * 2.5)) * (1 - 0.45 * clamp(S.A.grime * 1.5) * (1 - clamp(S.miss)));
    if (wk > 0.01) {
      const hw = WIN.w / 2;
      for (let i = 0; i < 2; i++) { const xa = WIN.x + i * hw + 12, xb = WIN.x + (i + 1) * hw - 12; lightShaft(c, [[xa, WIN.y + 12], [xb, WIN.y + WIN.h - 12], land(xb, WIN.y + WIN.h - 12), land(xa, WIN.y + 12)], { color: key, a: (S.dayL >= S.moonL * 0.7 ? 0.26 : 0.3) * wk }); }
      glow(c, WIN.x + WIN.w / 2, WIN.y + WIN.h / 2, 520, key, 0.16 * wk);
      dust(c, 1640, 300, 900, 640, { n: 46, t: S.t, color: key, a: 0.6 * Math.min(1, wk * 1.3) * (0.5 + 0.5 * S.dust), seed: 3 });
    }
    // shafts through the ceiling holes
    const dl = Math.max(day, S.moonL * 0.5);
    if (dl > 0.01) CH.forEach((h, n) => {
      const s = chSize(S, h);
      if (s <= 0.01) return;
      const w = h.w * s * 0.9, a = 0.3 * dl * Math.min(1, s) * (n === 0 ? 1 - 0.6 * S.treeG : 1);
      lightShaft(c, [[h.x - w, CEIL], [h.x + w, CEIL], [h.x + w - 250, 1010], [h.x - w - 330, 1010]], { color: key, a });
      dust(c, h.x - w - 300, 60, w * 2 + 300, 800, { n: 22, t: S.t, color: key, a: 0.6 * dl, seed: 7 + n });
    });
    // the broken wall: broad shafts from the forest
    if (brk > 0.3 && dl > 0.01) {
      const k = ss(0.3, 0.9, brk) * dl;
      for (let i = 0; i < 4; i++) { const x = 2060 + i * 210, wd = 60 + 30 * hash(i, 5), f = 0.7 + 0.3 * Math.sin(S.t * 0.4 + i * 1.7); lightShaft(c, [[x, CEIL - 40], [x + wd, CEIL - 40], [x + wd - 560, 1040], [x - 620, 1040]], { color: key, a: 0.2 * k * f }); }
      dust(c, 1500, 100, 1300, 800, { n: 40, t: S.t, color: key, a: 0.6 * k, seed: 11 });
    }
    // lamp
    if (S.lampOn > 0.01 && years < 8 && !S.hide.lamp) {
      const a = S.lampOn * (0.35 + 0.65 * S.dark), L = APT.lamp;
      glow(c, L.x, L.y + 60, 1250, '#ffb766', 0.3 * a); glow(c, L.x, L.y, 430, '#ffd692', 0.6 * a);
      c.save(); c.globalCompositeOperation = 'screen'; c.translate(L.x, 880); c.scale(1, 0.2);
      c.fillStyle = rad(c, 0, 0, 420, [[0, alpha('#ffcf8a', 0.42 * a)], [1, alpha('#ffcf8a', 0)]]); c.fillRect(-420, -420, 840, 840); c.restore();
      c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = alpha('#fff0c4', 0.75 * a); c.beginPath(); c.moveTo(L.x - 40, 418); c.lineTo(L.x + 40, 418); c.lineTo(L.x + 64, 512); c.lineTo(L.x - 64, 512); c.closePath(); c.fill(); c.restore();
    }
    // TV
    if (S.tvOn > 0.01 && years < 8 && !S.hide.tv) {
      const f = 0.72 + 0.28 * noise1(S.t * 5.3, 9) * (0.6 + 0.4 * noise1(S.t * 1.1, 4)), a = S.tvOn * (0.3 + 0.7 * S.dark) * f, T = APT.tv;
      c.save(); c.globalCompositeOperation = 'screen'; R(c, T.x - 117, T.y - 65, 234, 130, alpha('#bfe0ff', 0.5 * a)); c.restore();
      glow(c, T.x, T.y, 520, '#8fc0ff', 0.4 * a);
      c.save(); c.globalCompositeOperation = 'screen'; c.translate(T.x, 900); c.scale(1, 0.22);
      c.fillStyle = rad(c, 0, 0, 380, [[0, alpha('#9cc8ff', 0.3 * a)], [1, alpha('#9cc8ff', 0)]]); c.fillRect(-380, -380, 760, 760); c.restore();
    }
  });
}
