// Hero street (side-on, world x -900..3000) and back alley. Sets draw sky, skyline, the location and its ageing;
// they never grade and never draw UI, people or animals.
//
// streetSet(g, t, o)   call g.camera() first. o = {
//   years (0..200, continuous), look (LOOKS.*), power (default: years < 1.5 days), actors(c), front(c),
//   traffic 0..1   years 0 only: cars drive both ways (free flow) unless stopT is given
//   stopT          seconds since everyone vanished (may be negative = before): cars decelerate over 2.5 s and stop at
//                  their canonical abandoned places (one against lamp post 3). Omitted + traffic 0 = already abandoned
//   signal         'red' | 'amber' | 'green' | 'off' (default: cycles with t while power, else off)
//   litter 0..1 override, wet 0..1 (rain: dark reflective road, puddles), heroLit 0..1 (hero window, default = power),
//   cars: false (no cars at all), clouds (passed to drawSky), flicker 0..1 (lamps, used by streetLight) }
//   Draw order on the main plane: ground, facades, pavement furniture, back trees -> o.actors (pavement, y 880, doorway,
//   fire escape, under a parked car) -> kerb, lamp posts, parked + far-lane cars, road trees -> o.front (characters on
//   the road, y 960..1150) -> near-lane cars, front trees and tall grass.
// streetLight(g, t, o) same o; call AFTER g.grade(look): emissive windows, shop fronts, lamps, traffic light, billboard
//   lamps, headlights, wet reflections. Lit windows are screen-blended, so an actor in front of one is tinted warm
//   (pass windows: false to skip them).
// STREET anchors (world px): groundY 880 (walking line on the pavement), baseY 840 (facade foot), kerbY 930, parkY 995,
//   roadY 1080 (far lane, drives left), nearY 1215 (near lane, drives right);
//   heroDoor {x,y,w,h} (top-left + size), doorway {x,y} (dog sits here, on the top step inside the deep doorway),
//   heroWindow {x,y,w,h,cx,cy} (2nd floor, above the door), fireEscape [{x,y}..] (sill -> landing -> ladder -> pavement),
//   cafe {x,y,w,door}, cafeSign, tables [{x,y,top}], den {x,y} (dark space under the awning, collapsed by ~20 years),
//   petShop {x,y,w,door,window}, billboard {x,y,w,h}, trafficLight {x,y,lampY}, lampPosts [{x,y}], hydrant, mailbox,
//   busStop, parked [{x,y}], underCar {x,y}, abandoned [{x,y,kind}], intersection {x,x0,x1}, bounds, cams {name:[x,y,zoom]}.
// drawCar(c, {x, y, s, flip, color, kind: 'sedan'|'hatch'|'van'|'taxi'|'bus', years, lights 0..1, wheel (radians), rot,
//   t, dark 0..1, dust, flat (overrides), shadow}) — (x, y) = ground under the middle, about 620 px long at s 1 (bus 1300).
//   Ages with years: dust (7 d), flat tyres (1 y), rust, broken glass (5 y), moss + plants growing out (20 y), mound (100 y).
// drawCarLights(c, {x, y, s, flip, kind, lights}) emissive headlights/tail lights (after the grade).
// drawTrafficLight(c, {x, y, s, state, years, rot}); signalState(t, o) -> state used by the set.
//
// alleySet(g, t, o)    o = {years, look, power, actors(c), front(c), wet (default 0.5), litter, wrecks (default: years
//   >= 30: two rusted cars), clouds}. Dusk/night back alley: brick walls, back door with lamp, pipes, dumpster, two
//   static bins, chain-link fence with a torn gap, sky strip + skyline at the far end.
// alleyLight(g, t, o)  after the grade: door lamp (flickers slightly), lit windows.
// ALLEY anchors: groundY 880, wallBase {x0,x1,y} (mouse run), bins {x,y} (free spot for the tippable bin prop),
//   staticBins, dumpster {x,y,w,h}, door {x,y,w,h}, lamp {x,y}, hide {x,y} (cat crouches beside the dumpster),
//   gap {x,y} (hole in the fence), wrecks [{x,y}], bounds, cams.
import { Path2D } from '@napi-rs/canvas';
import { TAU, RNG, clamp, lerp, mix, tone, alpha, ss, hash, noise1, ramp, wrap } from '../engine/util.js';
import { lin, rad, glow, shadow, txt, rrect, poly, blob } from '../engine/draw.js';
import { LOOKS, drawSky } from '../engine/sky.js';
import { LEAF, wind, grass, tree, bush, ivy, moss, litter as leafLitter, aging } from '../env/nature.js';

const GY = 880, BASE = 840, KERB = 930, PARK_Y = 995, FAR_Y = 1080, NEAR_Y = 1215, F0 = 700, FH = 470;

export const STREET = {
  groundY: GY, baseY: BASE, kerbY: KERB, parkY: PARK_Y, roadY: FAR_Y, nearY: NEAR_Y,
  heroDoor: { x: 167, y: 246, w: 250, h: 540, cx: 292 },
  doorway: { x: 292, y: 786 },
  heroWindow: { x: 187, y: -260, w: 210, h: 300, cx: 292, cy: -110 },
  fireEscape: [{ x: 292, y: 40 }, { x: 330, y: 60 }, { x: 860, y: 60 }, { x: 894, y: 470 }, { x: 930, y: GY }],
  cafe: { x: 980, y: BASE, w: 900, door: { x: 1680, y: 290, w: 160, h: 550 } },
  cafeSign: { x: 1040, y: 228, w: 600, h: 104 },
  tables: [{ x: 1150, y: 868, top: 710 }, { x: 1470, y: 868, top: 710 }],
  den: { x: 1150, y: 852 },
  petShop: { x: 2200, y: BASE, w: 820, door: { x: 2235, y: 290, w: 130, h: 550 }, window: { x: 2390, y: 380, w: 570, h: 380 } },
  billboard: { x: 2300, y: -250, w: 620, h: 330 },
  trafficLight: { x: 1850, y: KERB, lampY: { red: KERB - 710, amber: KERB - 645, green: KERB - 580 } },
  lampPosts: [{ x: -1000, y: KERB }, { x: -120, y: KERB }, { x: 940, y: KERB }, { x: 2240, y: KERB }, { x: 3100, y: KERB }],
  hydrant: { x: -70, y: 866 }, mailbox: { x: 610, y: 868 }, busStop: { x: -770, y: 874, w: 330 },
  parked: [{ x: -200, y: PARK_Y }, { x: 730, y: PARK_Y }, { x: 3280, y: PARK_Y }],
  underCar: { x: 730, y: 990 },
  abandoned: [{ x: -640, y: FAR_Y, kind: 'sedan' }, { x: 1560, y: FAR_Y, kind: 'hatch' }, { x: 2552, y: PARK_Y - 4, kind: 'taxi' }, { x: 3700, y: FAR_Y, kind: 'van' },
    { x: -1020, y: NEAR_Y, kind: 'van' }, { x: 380, y: NEAR_Y, kind: 'sedan' }, { x: 1960, y: NEAR_Y, kind: 'hatch' }, { x: 4250, y: NEAR_Y, kind: 'bus' }],
  intersection: { x: 2040, x0: 1880, x1: 2200 },
  bounds: { x0: -900, x1: 3000 },
  cams: { wide: [1050, 300, 0.5], door: [292, 500, 1], window: [292, -80, 1.2], cafe: [1380, 520, 0.95], pet: [2600, 420, 0.8], cross: [2040, 620, 0.9], left: [-420, 520, 0.9] },
};

// ---------------------------------------------------------------- helpers
const fr = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const rr = (c, col, x, y, w, h, r) => { c.fillStyle = col; c.fill(rrect(x, y, w, h, r)); };
const quad = (c, col, pts) => { c.fillStyle = col; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); };
const disc = (c, col, x, y, r) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
const ag = (col, S, k = 1) => mix(mix(col, '#9c968b', clamp(S.A.grime * 0.5 * k)), '#66704c', clamp(S.A.vines * 0.16 * k));
const JAG = [[-1, -0.2], [-0.45, -0.55], [-0.6, -1], [0.1, -0.7], [0.7, -1], [0.55, -0.3], [1, 0.25], [0.4, 0.5], [0.6, 1], [-0.2, 0.75], [-0.8, 1], [-0.6, 0.3]];
const addHole = (p, cx, cy, hw, hh, k, f = 1) => { JAG.forEach(([jx, jy], i) => { const X = cx + jx * hw * k * f, Y = cy + jy * hh * k; if (i) p.lineTo(X, Y); else p.moveTo(X, Y); }); p.closePath(); };

function mkState(g, t, o) {
  const years = Math.max(0, +o.years || 0), look = o.look || LOOKS.day, A = aging(years), dark = clamp(look.dark || 0);
  const power = o.power ?? years < 1.5 / 365, tau = typeof o.stopT === 'number' ? o.stopT : null;
  const moving = years === 0 && (+o.traffic || 0) > 0 && tau == null;
  return {
    g, t: +t || 0, o, years, look, A, dark, power: !!power, lit: power ? ss(0.2, 0.5, dark) : 0, tau, moving,
    crash: moving ? 0 : tau == null ? 1 : ss(2.0, 2.35, tau),
    litter: clamp(o.litter ?? ramp(Math.log1p(years * 365), [[0, 0], [0.7, 0.12], [2.08, 0.7], [5.9, 1], [7.5, 0.7], [8.9, 0.3], [9.8, 0]])),
    wet: clamp(+o.wet || 0), v: g.view(1, 80), skyC: look.sky[1][1], hazeC: look.haze,
  };
}

function ivyOn(c, x, yBase, w, h, cover, seed, t, sc = 2.4, dens = 1) {
  if (cover < 0.012) return;
  c.save(); c.translate(x, yBase - h); c.scale(sc, sc);
  ivy(c, 0, 0, w / sc, h / sc, { cover: clamp(cover), seed, t, density: dens });
  c.restore();
}
function grassRow(c, S, y, o, seed) {
  const a = Math.floor(S.v.x0 / 600), b = Math.floor(S.v.x1 / 600);
  for (let i = a; i <= b; i++) grass(c, i * 600, i * 600 + 600, y, { ...o, t: S.t, seed: seed + i * 7 });
}
const fernCache = new Map();
function fern(c, x, y, s, seed, t) {
  let P = fernCache.get(seed);
  if (!P) {
    const r = RNG(seed * 11 + 2); P = [new Path2D(), new Path2D()];
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.36 + r.range(-0.1, 0.1), L = r.range(70, 120), p = P[i % 2];
      const tx = Math.cos(a) * L, ty = Math.sin(a) * L + Math.abs(Math.cos(a)) * L * 0.35, nx = -Math.sin(a) * L * 0.16, ny = Math.cos(a) * L * 0.16;
      p.moveTo(0, 0); p.quadraticCurveTo(tx * 0.5 + nx, ty * 0.5 + ny - L * 0.1, tx, ty); p.quadraticCurveTo(tx * 0.5 - nx, ty * 0.5 - ny - L * 0.1, 0, 0);
    }
    fernCache.set(seed, P);
  }
  c.save(); c.translate(x, y); c.rotate(wind(t, x) * 0.04); c.scale(s, s);
  c.fillStyle = LEAF.dark; c.fill(P[0]); c.fillStyle = LEAF.mid; c.fill(P[1]);
  c.restore();
}
const texCache = new Map();
function brickTex(x, y0, w, h, seed) {
  const key = `${x}|${y0}|${w}|${h}|${seed}`;
  let T = texCache.get(key);
  if (T) return T;
  const r = RNG(seed * 61 + 9), a = new Path2D(), b = new Path2D(), n = Math.round((w * h) / 5200), rows = Math.max(1, Math.floor(h / 26));
  for (let i = 0; i < n; i++) (r.chance(0.55) ? a : b).rect(x + r.range(0, Math.max(1, w - 60)), y0 + r.int(0, rows - 1) * 26 + 3, r.range(40, 58), 20);
  T = [a, b]; texCache.set(key, T);
  return T;
}
function signText(c, str, x0, x1, y, size, col, S, seed, drop = 420) {
  const n = str.length, br = S.A.broken;
  for (let i = 0; i < n; i++) {
    const ch = str[i];
    if (ch === ' ') continue;
    const x = lerp(x0, x1, n > 1 ? i / (n - 1) : 0.5), th = 0.3 + 0.62 * hash(i, seed), k = ss(th, th + 0.07, br);
    if (k > 0) txt(c, ch, x, y, { size, weight: 800, color: 'rgba(20,16,12,0.25)' });
    if (k >= 1) continue;
    c.save(); c.translate(x, y + k * k * drop); c.rotate(k * 1.3 * (hash(i, seed + 1) > 0.5 ? 1 : -1));
    txt(c, ch, 0, 0, { size, weight: 800, color: col, a: 1 - ss(0.75, 1, k) });
    c.restore();
  }
}

// ---------------------------------------------------------------- cars
const CARS = {
  sedan: { len: 620, roof: -250, belt: -152, cab: -30, r: 50, wheels: [-196, 200], lamp: -128,
    pts: [[-308, -62, 1], [-310, -118], [-296, -150], [-222, -160], [-150, -238], [-30, -252], [66, -242], [158, -170], [282, -146], [308, -116], [308, -62, 1], [290, -44, 1], [-292, -44, 1]],
    win: [[[-140, -230], [-48, -238], [-48, -170], [-190, -168]], [[-34, -238], [58, -230], [132, -170], [-34, -170]]], seams: [[-40, -166, -62], [-196, -160, -110], [140, -164, -62]] },
  hatch: { len: 564, roof: -250, belt: -152, cab: -40, r: 48, wheels: [-172, 186], lamp: -128,
    pts: [[-278, -62, 1], [-282, -120], [-266, -200], [-222, -240], [-40, -252], [60, -242], [150, -170], [262, -146], [284, -116], [284, -62, 1], [268, -44, 1], [-262, -44, 1]],
    win: [[[-214, -228], [-108, -238], [-108, -170], [-246, -168]], [[-94, -238], [52, -230], [124, -170], [-94, -170]]], seams: [[-100, -166, -62], [132, -164, -62]] },
  van: { len: 664, roof: -332, belt: -196, cab: 60, r: 52, wheels: [-212, 216], lamp: -132,
    pts: [[-328, -62, 1], [-330, -300], [-308, -332], [130, -332], [204, -300], [262, -200], [318, -176], [330, -120], [330, -62, 1], [312, -44, 1], [-312, -44, 1]],
    win: [[[138, -310], [190, -296], [240, -206], [138, -206]], [[-10, -310], [120, -310], [120, -206], [-10, -206]]], seams: [[128, -320, -62], [-20, -320, -62], [-180, -320, -62]] },
  bus: { len: 1300, roof: -410, belt: -214, cab: 0, r: 58, wheels: [-420, 410], lamp: -120,
    pts: [[-648, -70, 1], [-650, -380], [-628, -410], [620, -410], [648, -380], [650, -70, 1], [630, -48, 1], [-630, -48, 1]],
    win: [0, 1, 2, 3, 4, 5, 6].map((i) => [[-610 + i * 160, -360], [-470 + i * 160, -360], [-470 + i * 160, -228], [-610 + i * 160, -228]]).concat([[[512, -360], [632, -360], [632, -200], [512, -200]]]),
    seams: [[500, -370, -60], [380, -370, -60], [-140, -370, -60], [-250, -370, -60]] },
};
CARS.taxi = { ...CARS.sedan };
const carCache = new Map();
function carGeom(kind) {
  let G = carCache.get(kind);
  if (G) return G;
  const K = CARS[kind], r = RNG(kind.length * 31 + K.len), wins = new Path2D(), seams = new Path2D(), rust = new Path2D();
  for (const w of K.win) wins.addPath(poly(w));
  for (const [x, y0, y1] of K.seams) { seams.moveTo(x, y0); seams.lineTo(x, y1); }
  for (let i = 0; i < 16; i++) { const x = r.range(-K.len / 2, K.len / 2), y = r.range(K.roof, -50), q = r.range(14, 46); rust.moveTo(x + q, y); rust.arc(x, y, q, 0, TAU); }
  G = { ...K, body: blob(K.pts, true, 0.75), wins, seamP: seams, rustP: rust };
  carCache.set(kind, G);
  return G;
}
function carWheel(c, x, r, flat, rot, rust) {
  const ry = r * (1 - 0.22 * flat), rx = r * (1 + 0.1 * flat), cy = -ry;
  c.fillStyle = '#20232a'; c.beginPath(); c.ellipse(x, cy, rx, ry, 0, 0, TAU); c.fill();
  disc(c, mix('#c9ced6', '#7d4a2c', rust), x, cy + flat * 3, r * 0.56);
  c.strokeStyle = 'rgba(40,44,54,0.65)'; c.lineWidth = 5; c.beginPath();
  for (let i = 0; i < 5; i++) { const a = rot + (i / 5) * TAU; c.moveTo(x, cy + flat * 3); c.lineTo(x + Math.cos(a) * r * 0.5, cy + flat * 3 + Math.sin(a) * r * 0.5); }
  c.stroke();
  disc(c, '#5a606b', x, cy + flat * 3, r * 0.16);
}
export function drawCar(c, o = {}) {
  const kind = CARS[o.kind] ? o.kind : 'sedan', G = carGeom(kind), s = o.s ?? 1, flip = o.flip === -1 ? -1 : 1, years = Math.max(0, +o.years || 0), A = aging(years), t = +o.t || 0;
  const dust = clamp(o.dust ?? ramp(years, [[0, 0], [7 / 365, 0.3], [1, 0.7], [5, 0.9]])), flat = clamp(o.flat ?? ss(0.2, 1, years));
  const rust = ss(0.22, 0.72, A.grime), mossK = ss(0.5, 0.9, A.vines), plant = ss(0.38, 0.85, A.trees), bury = ss(0.8, 1.1, A.trees), brk = ss(0.1, 0.4, A.broken);
  const L = G.len, hl = L / 2, lights = clamp(+o.lights || 0), dark = clamp(+o.dark || 0), seed = (o.seed ?? 1) | 0;
  let col = o.color || (kind === 'taxi' ? '#f2c230' : '#c94a3f');
  col = mix(mix(mix(col, '#b9ad98', dust * 0.42), '#8a4a2a', rust * 0.85), '#4f5a38', mossK * 0.35);
  c.save();
  c.translate(o.x ?? 0, o.y ?? 0); if (o.rot) c.rotate(o.rot); c.scale(s * flip, s);
  if (o.shadow !== 0) shadow(c, 0, 2, hl * 1.04, 22, 0.36);
  const sink = flat * 14 + bury * 46;
  c.save(); c.translate(0, sink);
  c.fillStyle = lin(c, 0, G.roof, 0, -44, [[0, tone(col, 0.22)], [0.5, col], [1, tone(col, -0.3)]]); c.fill(G.body);
  c.save(); c.clip(G.body);
  if (kind === 'bus') fr(c, alpha('#f4efe2', 0.85 - rust * 0.6), -hl, -214, L, 46);
  if (kind === 'taxi') { c.fillStyle = alpha('#1d1d22', 0.8 * (1 - rust)); for (let i = 0; i < 20; i++) c.fillRect(-150 + i * 16, -146 + (i % 2) * 10, 16, 10); }
  fr(c, alpha('#ffffff', 0.22 * (1 - dust)), -hl, G.belt, L, 5);
  c.fillStyle = '#1b1e25'; for (const wx of G.wheels) { c.beginPath(); c.arc(wx, -50 - sink, G.r + 13, 0, TAU); c.fill(); }
  if (rust > 0.01) { c.fillStyle = alpha('#6f3a1c', ss(0.02, 0.6, rust) * 0.75); c.fill(G.rustP); }
  if (dust > 0.01) { c.fillStyle = lin(c, 0, G.roof, 0, G.roof + 150, [[0, alpha('#d2c7b0', dust * 0.55)], [1, alpha('#d2c7b0', 0)]]); c.fillRect(-hl, G.roof, L, 150); }
  if (mossK > 0.01) { c.fillStyle = lin(c, 0, G.roof, 0, -60, [[0, alpha(LEAF.dark, mossK * 0.85)], [0.6, alpha(LEAF.mid, mossK * 0.3)], [1, alpha(LEAF.mid, 0)]]); c.fillRect(-hl, G.roof, L, -G.roof); }
  c.restore();
  c.fillStyle = mix(mix('#a9cde3', '#18223a', dark * 0.78), '#a8a090', dust * 0.75); c.fill(G.wins);
  if (dust < 0.9) { c.save(); c.clip(G.wins); quad(c, alpha('#ffffff', 0.25 * (1 - dust) * (1 - dark * 0.7)), [[-hl, G.roof + 60], [-hl + 90, G.roof], [-hl + 190, G.roof], [-hl + 60, G.roof + 110]]); quad(c, alpha('#ffffff', 0.2 * (1 - dust) * (1 - dark * 0.7)), [[-20, G.roof + 70], [70, G.roof], [120, G.roof], [20, G.roof + 90]]); c.restore(); }
  if (brk > 0.01) { c.fillStyle = alpha('#14171c', brk * 0.92); c.fill(G.wins); }
  c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 3; c.stroke(G.seamP);
  const bump = mix('#3a3f48', '#6b4630', rust);
  rr(c, bump, hl - 30, -88, 34, 28, 9); rr(c, bump, -hl - 4, -88, 30, 28, 9);
  rr(c, mix(mix('#efe8d2', '#fffbe6', lights), '#8a7a66', rust * 0.7), hl - 34, G.lamp - 12, 30, 22, 7);
  rr(c, mix(mix('#b8392f', '#ff5a48', lights), '#6b3a2a', rust * 0.7), -hl + 2, G.lamp - 14, 16, 26, 5);
  if (kind !== 'bus') fr(c, 'rgba(0,0,0,0.3)', -30 + (kind === 'van' ? 60 : 0), G.belt + 20, 34, 7);
  if (kind === 'taxi') { rr(c, mix('#fff3c0', '#8a7a66', rust), -44, G.roof - 24, 88, 26, 7); if (rust < 0.6) txt(c, 'TAXI', 0, G.roof - 10, { size: 22, weight: 800, color: '#22252b', a: 1 - rust }); }
  if (kind === 'bus') { rr(c, '#1d2026', 380, -402, 250, 34, 6); fr(c, alpha('#ffb648', 0.9 * (1 - dust)), 400, -392, 150, 12); }
  c.restore();
  for (const wx of G.wheels) carWheel(c, wx, G.r, flat, +o.wheel || 0, rust);
  if (mossK > 0.05) moss(c, G.cab - L * 0.22, G.cab + L * 0.16, G.roof + sink + 5, { h: 13 * mossK, seed });
  if (plant > 0.03) {
    const th = 760 * ss(0.5, 1.05, A.trees);
    if (th > 40) tree(c, G.cab - 36, -110 + sink, { h: th, kind: 'birch', seed: seed + 4, t, shadow: 0 });
    bush(c, G.cab, G.roof * 0.6 + sink, { w: L * 0.52 * plant, h: 210 * plant, seed: seed + 1, t });
    bush(c, hl * 0.62, G.belt + 12 + sink, { w: 230 * plant, h: 120 * plant, seed: seed + 2, t });
  }
  if (bury > 0.01) { c.fillStyle = lin(c, 0, -150 * bury, 0, 12, [[0, LEAF.mid], [1, LEAF.dark]]); c.beginPath(); c.ellipse(0, 8, hl * 1.12, 34 + 120 * bury, 0, Math.PI, TAU); c.fill(); }
  if (A.weeds > 0.25) grass(c, -hl * 0.95, hl * 0.95, 4, { h: 14 + 22 * A.weeds + 40 * plant, density: 0.03 + 0.1 * plant, seed: seed + 9, t });
  c.restore();
}
export function drawCarLights(c, o = {}) {
  const a = clamp(+o.lights || 0);
  if (a <= 0.01) return;
  const K = CARS[o.kind] || CARS.sedan, s = o.s ?? 1, f = o.flip === -1 ? -1 : 1, hx = (o.x ?? 0) + f * (K.len / 2 - 14) * s, hy = (o.y ?? 0) + K.lamp * s;
  c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.5 * a;
  c.fillStyle = lin(c, hx, hy, hx + f * 640 * s, hy, [[0, 'rgba(255,240,196,0.8)'], [1, 'rgba(255,240,196,0)']]);
  c.beginPath(); c.moveTo(hx, hy - 8); c.lineTo(hx + f * 640 * s, hy - 110 * s); c.lineTo(hx + f * 640 * s, hy + 130 * s); c.lineTo(hx, hy + 8); c.closePath(); c.fill();
  c.restore();
  glow(c, hx, hy, 150 * s, '#fff0c4', 0.9 * a); glow(c, (o.x ?? 0) - f * (K.len / 2 - 8) * s, hy, 80 * s, '#ff4a3a', 0.7 * a);
}

const PARKED = [{ x: -200, kind: 'hatch', color: '#4f86c6' }, { x: 730, kind: 'sedan', color: '#c94a3f' }, { x: 3280, kind: 'van', color: '#e6e0d2' }];
const TRAFFIC = [
  { lane: 0, R: -640, kind: 'sedan', color: '#3f8a72' }, { lane: 0, R: 1560, kind: 'hatch', color: '#e39a3c' },
  { lane: 0, R: 2552, kind: 'taxi', color: '#f2c230', crash: 1 }, { lane: 0, R: 3700, kind: 'van', color: '#7d8894' },
  { lane: 1, R: -1020, kind: 'van', color: '#dcd6c8' }, { lane: 1, R: 380, kind: 'sedan', color: '#5a6fb8' },
  { lane: 1, R: 1960, kind: 'hatch', color: '#b8433a' }, { lane: 1, R: 4250, kind: 'bus', color: '#3d8fb0' },
];
function carList(S) {
  const { o, years, t, dark, tau, moving } = S, list = [], V = 560;
  if (o.cars === false) return list;
  const batt = ss(0.25, 0.5, dark) * (1 - ss(0.4 / 365, 1.2 / 365, years));
  PARKED.forEach((p, i) => list.push({ ...p, y: PARK_Y, flip: -1, years, t, dark, lights: 0, seed: 20 + i * 5 }));
  TRAFFIC.forEach((k, i) => {
    const dir = k.lane ? 1 : -1;
    let x = k.R, y = k.lane ? NEAR_Y : FAR_Y, rot = 0;
    if (moving) { if ((i % 4) / 4 >= o.traffic) return; x = wrap(k.R + 1500 + dir * V * t, 5800) - 1500; }
    else if (tau != null && tau < 2.5) x = tau < 0 ? k.R - dir * V * (1.25 - tau) : k.R - dir * V * 1.25 * (1 - tau / 2.5) ** 2;
    if (k.crash && !moving) { const u = tau == null ? 1 : ss(0.3, 2.3, tau); y = lerp(FAR_Y, PARK_Y - 4, u); rot = 0.05 * u; }
    list.push({ kind: k.kind, color: k.color, x, y, flip: dir, rot, wheel: (dir * x) / 50, years, t, dark, lights: batt, seed: 40 + i * 5 });
  });
  return list;
}

// ---------------------------------------------------------------- street furniture
export function signalState(t, o = {}) {
  const years = Math.max(0, +o.years || 0);
  if (!(o.power ?? years < 1.5 / 365)) return 'off';
  if (o.signal) return o.signal;
  const ph = wrap(+t || 0, 12);
  return ph < 5 ? 'green' : ph < 6.5 ? 'amber' : 'red';
}
const SIG = { red: ['#ff4a3a', -710], amber: ['#ffb82e', -645], green: ['#3fe08a', -580] };
export function drawTrafficLight(c, o = {}) {
  const A = aging(Math.max(0, +o.years || 0)), rust = ss(0.2, 0.8, A.grime), s = o.s ?? 1, st = o.state || 'off';
  const pole = mix('#4a545c', '#7a4a30', rust), box = mix('#23272e', '#5e3a26', rust * 0.8);
  c.save(); c.translate(o.x ?? 0, o.y ?? 0); c.rotate(o.rot ?? -1.25 * ss(0.3, 0.75, A.collapse)); c.scale(s, s);
  rr(c, tone(pole, -0.15), -20, -64, 40, 64, 6); fr(c, pole, -9, -530, 18, 470); fr(c, 'rgba(255,255,255,0.14)', -9, -530, 5, 470);
  rr(c, tone(box, 0.12), -54, -778, 108, 262, 16); rr(c, box, -46, -770, 92, 246, 12);
  for (const k of ['red', 'amber', 'green']) {
    const [col, y] = SIG[k], on = st === k;
    disc(c, on ? col : mix(col, '#14161b', 0.8), 0, y, 29);
    if (on) disc(c, 'rgba(255,255,255,0.55)', -8, y - 9, 9);
    c.fillStyle = box; c.beginPath(); c.arc(0, y, 36, Math.PI * 1.05, Math.PI * 1.95); c.arc(0, y + 9, 33, Math.PI * 1.9, Math.PI * 1.1, true); c.closePath(); c.fill();
  }
  c.restore();
}
const LAMPS = [{ x: -1000, f: 1 }, { x: -120, f: -1 }, { x: 940, f: 1 }, { x: 2240, f: 1, crash: 1 }, { x: 3100, f: -1 }];
const lampRot = (i, S) => ss(0.25, 0.62, S.A.collapse) * (i % 2 ? 0.22 : 1.47) * (i % 4 < 2 ? 1 : -1) - (LAMPS[i].crash ? 0.075 * S.crash : 0);
const lampHead = (i, S) => { const L = LAMPS[i], r = lampRot(i, S); return [L.x + 128 * L.f * Math.cos(r) + 760 * Math.sin(r), KERB + 128 * L.f * Math.sin(r) - 760 * Math.cos(r)]; };
function drawLamp(c, i, S) {
  const L = LAMPS[i], rust = ss(0.2, 0.8, S.A.grime), col = mix('#3a4750', '#7a4a30', rust), on = S.lit;
  c.save(); c.translate(L.x, KERB); c.rotate(lampRot(i, S));
  rr(c, tone(col, -0.12), -17, -84, 34, 84, 6); fr(c, col, -8, -722, 16, 640); fr(c, 'rgba(255,255,255,0.13)', -8, -722, 5, 640);
  c.strokeStyle = col; c.lineWidth = 13; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -716); c.quadraticCurveTo(0, -778, L.f * 62, -778); c.lineTo(L.f * 112, -776); c.stroke();
  rr(c, tone(col, -0.1), L.f * 128 - 60, -786, 120, 28, 13);
  rr(c, mix(mix('#cfd6d8', '#8d8a80', S.A.grime), '#fff3c8', on), L.f * 128 - 46, -762, 92, 12, 6);
  c.restore();
}
function hydrant(c, S) {
  const { x, y } = STREET.hydrant, col = mix(ag('#d2473a', S, 1.3), '#7a4a30', ss(0.3, 0.9, S.A.grime) * 0.6);
  shadow(c, x, y, 52, 9, 0.25);
  rr(c, tone(col, -0.2), x - 34, y - 16, 68, 16, 5); rr(c, col, x - 24, y - 92, 48, 80, 8); rr(c, tone(col, 0.1), x - 30, y - 104, 60, 16, 8);
  disc(c, tone(col, 0.1), x, y - 108, 16); rr(c, tone(col, -0.12), x - 40, y - 66, 16, 22, 5); rr(c, tone(col, -0.12), x + 24, y - 66, 16, 22, 5);
  fr(c, 'rgba(255,255,255,0.25)', x - 18, y - 88, 7, 66);
}
function mailbox(c, S) {
  const { x, y } = STREET.mailbox, col = mix(ag('#2f62a8', S, 1.3), '#6f4a36', ss(0.3, 0.9, S.A.grime) * 0.5);
  shadow(c, x, y, 90, 11, 0.25);
  fr(c, tone(col, -0.35), x - 62, y - 30, 12, 30); fr(c, tone(col, -0.35), x + 50, y - 30, 12, 30);
  c.fillStyle = lin(c, 0, y - 240, 0, y - 26, [[0, tone(col, 0.16)], [1, tone(col, -0.14)]]); c.fill(rrect(x - 74, y - 240, 148, 214, 46));
  fr(c, tone(col, -0.14), x - 74, y - 60, 148, 34); rr(c, tone(col, -0.3), x - 50, y - 196, 100, 16, 6);
  fr(c, alpha('#f2ede0', 0.85 * (1 - S.A.grime)), x - 40, y - 160, 80, 44); fr(c, alpha(col, 0.9), x - 30, y - 150, 60, 6); fr(c, alpha(col, 0.9), x - 30, y - 136, 44, 6);
}
function busStop(c, S) {
  const { x, y } = STREET.busStop, rust = ss(0.2, 0.8, S.A.grime), col = mix('#3d4a55', '#7a4a30', rust), br = ss(0.1, 0.35, S.A.broken);
  shadow(c, x + 165, y, 210, 12, 0.22);
  fr(c, alpha(mix('#bfe2f0', S.skyC, 0.3), 0.3 * (1 - br)), x + 12, y - 490, 306, 340);
  quad(c, alpha('#ffffff', 0.16 * (1 - br)), [[x + 140, y - 490], [x + 220, y - 490], [x + 110, y - 150], [x + 30, y - 150]]);
  fr(c, ag('#f3ead6', S), x + 18, y - 470, 112, 250); fr(c, ag('#e0683f', S, 1.5), x + 26, y - 462, 96, 90); fr(c, alpha('#33415a', 0.6), x + 30, y - 356, 80, 8); fr(c, alpha('#33415a', 0.45), x + 30, y - 338, 60, 8); fr(c, alpha('#33415a', 0.45), x + 30, y - 320, 70, 8);
  fr(c, col, x, y - 500, 12, 500); fr(c, col, x + 318, y - 500, 12, 500); fr(c, col, x + 12, y - 150, 306, 8);
  rr(c, tone(col, -0.15), x - 28, y - 530, 386, 32, 8); fr(c, 'rgba(255,255,255,0.14)', x - 24, y - 530, 378, 5);
  fr(c, ag('#9a6a40', S), x + 146, y - 122, 168, 14); fr(c, ag('#9a6a40', S), x + 146, y - 200, 168, 12); fr(c, col, x + 160, y - 108, 8, 108); fr(c, col, x + 292, y - 108, 8, 108);
  fr(c, col, x + 384, y - 560, 9, 560); disc(c, ag('#2f6fb5', S, 1.4), x + 388, y - 600, 48); disc(c, 'rgba(255,255,255,0.9)', x + 388, y - 600, 39); disc(c, ag('#2f6fb5', S, 1.4), x + 388, y - 600, 33);
  txt(c, 'BUS', x + 388, y - 598, { size: 30, weight: 800, color: '#ffffff' });
}
function cafeTable(c, x, y, S, i) {
  const rust = ss(0.15, 0.7, S.A.grime), col = mix('#3d4a52', '#7a4a30', rust), tip = i ? ss(0.1, 0.22, S.A.broken) : ss(0.3, 0.45, S.A.broken);
  shadow(c, x, y, 150, 12, 0.22);
  for (const sd of [-1, 1]) {
    c.save(); c.translate(x + sd * 126, y); if (sd > 0) c.rotate(tip * 1.5);
    fr(c, col, -30, -106, 8, 106); fr(c, col, 22, -106, 8, 106); fr(c, col, sd * 26 - 4, -220, 8, 120); rr(c, col, sd * 26 - 5, -226, 10, 70, 5);
    rr(c, ag('#c9463c', S, 1.6), -36, -116, 72, 14, 6);
    c.restore();
  }
  c.save(); c.translate(x - 40, y); c.rotate(-tip * 1.48); c.translate(40, 0);
  rr(c, col, -42, -8, 84, 8, 4); fr(c, col, -5, -150, 10, 144); rr(c, ag('#efe7d6', S), -82, -160, 164, 13, 6); fr(c, 'rgba(0,0,0,0.15)', -76, -148, 152, 4);
  c.restore();
}
const LITTER = (() => {
  const r = RNG(404), a = [];
  for (let i = 0; i < 60; i++) { const road = r.chance(0.42); a.push({ x: r.range(-1150, 3300), y: road ? r.range(948, 1010) : r.range(848, 874), k: r.int(0, 3), rot: r.range(-0.5, 0.5), th: r.range(0.02, 0.9), s: r.range(0.85, 1.35), h: r() }); }
  return a;
})();
function litterItems(c, S, list, back) {
  if (S.litter <= 0.02) return;
  const paper = mix('#ebe5d3', '#bfae84', S.A.grime);
  for (const it of list) {
    if ((it.y < 900) !== back || it.x < S.v.x0 || it.x > S.v.x1) continue;
    const k = ss(it.th, it.th + 0.12, S.litter);
    if (k <= 0) continue;
    c.save(); c.translate(it.x, it.y); c.rotate(it.rot + wind(S.t, it.x) * 0.04 * (it.k === 0)); c.scale(it.s * k, it.s * k);
    if (it.k === 0) { quad(c, paper, [[-34, -6], [30, -12], [36, 8], [-30, 12]]); c.fillStyle = 'rgba(60,60,70,0.4)'; c.fillRect(-24, -3, 34, 3); c.fillRect(-22, 3, 44, 2); c.fillRect(8, -8, 18, 4); }
    else if (it.k === 1) { quad(c, '#f4f1ea', [[-16, -9], [14, -6], [14, 6], [-16, 9]]); fr(c, '#8a5a3a', -20, -10, 5, 20); fr(c, it.h > 0.5 ? '#d9534a' : '#3f8a72', -6, -8, 10, 15); }
    else if (it.k === 2) { rr(c, it.h > 0.5 ? '#c94a3f' : '#3f7fc0', -13, -6, 26, 12, 4); fr(c, 'rgba(255,255,255,0.5)', -10, -4, 20, 3); }
    else { c.fillStyle = alpha(it.h > 0.5 ? '#dfe8ee' : '#f0e2c8', 0.8); c.beginPath(); c.ellipse(0, -4, 22, 12, 0, 0, TAU); c.fill(); quad(c, c.fillStyle, [[-8, -12], [0, -24], [8, -12]]); }
    c.restore();
  }
}

// ---------------------------------------------------------------- buildings
const BLD = [
  { id: 'left', x: -1560, w: 740, fl: 4, cols: 3, wall: '#9aa6b6', trim: '#e6e9ec', kind: 'stone', shop: 'shutter', seed: 1, accent: '#3f5f8a' },
  { id: 'town', x: -820, w: 700, fl: 3, cols: 3, wall: '#b3543d', trim: '#f1e8d8', kind: 'brick', shop: 'stoop', seed: 2 },
  { id: 'hero', x: -120, w: 1100, fl: 5, cols: 4, wall: '#e9d09a', trim: '#f7efdf', kind: 'stucco', shop: 'hero', seed: 3 },
  { id: 'cafe', x: 980, w: 900, fl: 3, cols: 3, wall: '#d58f72', trim: '#f4ead8', kind: 'brick', shop: 'cafe', seed: 4 },
  { id: 'pet', x: 2200, w: 820, fl: 4, cols: 3, wall: '#8fb0a4', trim: '#eef0e6', kind: 'stucco', shop: 'pet', seed: 5, skip: (f) => f === 1 },
  { id: 'right', x: 3020, w: 760, fl: 3, cols: 3, wall: '#c9a86a', trim: '#f1e8d8', kind: 'brick', shop: 'shutter', seed: 6, accent: '#8a3f3a' },
];
const geomCache = new Map();
function geom(b) {
  let G = geomCache.get(b.id);
  if (G) return G;
  const r = RNG(b.seed * 97 + 5), top = BASE - F0 - (b.fl - 1) * FH, x1 = b.x + b.w, ww = 200, wh = 300, P = () => new Path2D();
  const wins = [], frame = P(), glass = P(), refl = P(), bars = P(), sill = P(), sillSh = P(), stain = P(), curtain = P(), reveal = P(), band = P(), bandSh = P();
  for (let f = 1; f < b.fl; f++) for (let k = 0; k < b.cols; k++) {
    if (b.skip && b.skip(f, k)) continue;
    const cx = b.x + (b.w * (k + 0.5)) / b.cols, yb = BASE - F0 - (f - 1) * FH - 100, i = wins.length, hero = b.id === 'hero' && f === 1 && k === 1;
    const w2 = hero ? 210 : ww, x = cx - w2 / 2, y = yb - wh;
    wins.push({ x, y, w: w2, h: wh, cx, cy: y + wh / 2, brk: hero ? 0.6 : 0.04 + 0.92 * hash(i, b.seed), on: hash(i, b.seed + 40), warm: hash(i, b.seed + 80), hero });
    frame.rect(x - 14, y - 14, w2 + 28, wh + 28); glass.rect(x, y, w2, wh);
    refl.moveTo(x, y + wh * 0.55); refl.lineTo(x + w2 * 0.6, y); refl.lineTo(x + w2 * 0.92, y); refl.lineTo(x, y + wh * 0.86); refl.closePath();
    bars.rect(cx - 4, y, 8, wh); bars.rect(x, y + wh * 0.42 - 4, w2, 8);
    reveal.rect(x, y, w2, 12); reveal.rect(x, y, 9, wh);
    sill.rect(x - 24, yb + 10, w2 + 48, 20); sillSh.rect(x - 16, yb + 30, w2 + 32, 9);
    stain.moveTo(x + w2 * 0.2, yb + 30); stain.lineTo(x + w2 * 0.8, yb + 30); stain.lineTo(x + w2 * 0.62, yb + 110 + 70 * r()); stain.lineTo(x + w2 * 0.36, yb + 96); stain.closePath();
    if (!hero) { if (r.chance(0.5)) { curtain.rect(x, y, w2 * 0.24, wh); curtain.rect(x + w2 * 0.76, y, w2 * 0.24, wh); } else if (r.chance(0.45)) curtain.rect(x, y, w2, wh * 0.3); }
  }
  let texA = P(), texB = P();
  if (b.kind === 'brick') [texA, texB] = brickTex(b.x, top, b.w, BASE - top, b.seed);
  else if (b.kind === 'stone') { for (let y = top + 94, j = 0; y < BASE; y += 94, j++) { texA.rect(b.x, y, b.w, 4); for (let x = b.x + (j % 2 ? 60 : 150); x < x1; x += 180) texA.rect(x, y - 94, 4, 94); } }
  else for (let i = 0; i < 16; i++) { const px = b.x + r.range(60, b.w - 60), py = r.range(top + 80, BASE - 760), q = r.range(30, 90); texB.moveTo(px + q, py); texB.ellipse(px, py, q, q * 0.5, 0, 0, TAU); }
  for (let f = 1; f < b.fl; f++) { const y = BASE - F0 - (f - 1) * FH; band.rect(b.x, y - 24, b.w, 24); bandSh.rect(b.x, y, b.w, 9); }
  band.rect(b.x - 16, top - 12, b.w + 32, 66); bandSh.rect(b.x, top + 54, b.w, 14);
  for (let x = b.x + 12; x < x1 - 24; x += 46) bandSh.rect(x, top + 70, 22, 16);
  const n = Math.max(6, Math.round(b.w / 95)), prof = [], frag = [];
  for (let i = 0; i < n; i++) { prof.push(0.5 + 0.55 * (noise1(i * 0.7, b.seed + 3) + 1) * 0.5 + 0.5 * hash(i, b.seed + 5)); frag.push(120 + 420 * hash(i, b.seed + 8)); }
  G = { top, wins, frame, glass, refl, bars, sill, sillSh, stain, curtain, reveal, band, bandSh, texA, texB, prof, frag, n };
  geomCache.set(b.id, G);
  return G;
}
const profY = (b, G, i, col) => G.top - 90 + clamp(col * 2 * G.prof[i]) * (BASE - G.top + 90 - G.frag[i]);
function profPath(b, G, col, close) {
  const p = new Path2D(), n = G.n, dx = (b.w + 40) / n, x0 = b.x - 20;
  if (close) p.moveTo(x0, BASE + 90); else p.moveTo(x0, profY(b, G, 0, col));
  for (let i = 0; i < n; i++) { const y = profY(b, G, i, col); p.lineTo(x0 + i * dx, y); p.lineTo(x0 + (i + 1) * dx, y); }
  if (close) { p.lineTo(x0 + n * dx, BASE + 90); p.closePath(); }
  return p;
}
const winOn = (w, S) => (w.hero ? clamp(S.o.heroLit ?? S.lit) * ss(0.15, 0.4, S.dark) : w.on < 0.52 ? S.lit * ss(0.2 + w.on * 0.5, 0.28 + w.on * 0.5, S.dark) : 0);
const winCol = (w) => (w.hero ? '#ffd27a' : w.warm > 0.82 ? '#cfe2ff' : w.warm > 0.4 ? '#ffd88c' : '#ffc46a');

function groundWin(c, S, x, y, w, h, id, trim, grille = true) {
  const br = S.A.broken, th = 0.08 + 0.5 * hash(id, 3), k = ss(th, th + 0.08, br);
  fr(c, trim, x - 14, y - 14, w + 28, h + 28);
  fr(c, S.glass, x, y, w, h);
  const on = S.lit * (hash(id, 9) < 0.45 ? 1 : 0);
  if (on > 0.01) fr(c, alpha('#ffd88c', on), x, y, w, h);
  quad(c, alpha('#ffffff', 0.15 * (1 - S.dark * 0.8)), [[x, y + h * 0.5], [x + w * 0.55, y], [x + w * 0.85, y], [x, y + h * 0.8]]);
  if (k > 0) { const p = new Path2D(); addHole(p, x + w / 2, y + h / 2, w / 2, h / 2, k); c.fillStyle = '#131824'; c.fill(p); }
  fr(c, 'rgba(10,14,30,0.22)', x, y, w, 12);
  if (grille) { c.fillStyle = mix('#2c3440', '#7a4a30', ss(0.2, 0.8, S.A.grime)); for (let i = 1; i < 6; i++) c.fillRect(x + (w * i) / 6 - 3, y, 6, h); c.fillRect(x, y + h * 0.5 - 3, w, 6); }
  fr(c, tone(trim, 0.05), x - 24, y + h + 10, w + 48, 20); fr(c, 'rgba(20,16,30,0.2)', x - 16, y + h + 30, w + 32, 8);
}
function doorSet(c, S, cx, o) {
  // surround + recess + leaf + steps. o: {col, w, top, recess, surround, hood, steps}
  const landing = BASE - 54, tr = o.trim, hw = o.w / 2, rw = hw + (o.recess ?? 45), sw = rw + 45, dc = mix(ag(o.col, S, 1.5), '#5d5a4c', S.A.grime * 0.35), ajar = ss(0.45, 0.8, S.A.broken);
  fr(c, tr, cx - sw, o.top - 96, sw * 2, landing - o.top + 96);
  fr(c, tone(tr, 0.05), cx - sw - 24, o.top - 114, sw * 2 + 48, 30); fr(c, 'rgba(30,20,10,0.2)', cx - sw, o.top - 84, sw * 2, 8);
  if (o.hood === 'pediment') quad(c, tone(tr, 0.03), [[cx - sw - 24, o.top - 114], [cx, o.top - 200], [cx + sw + 24, o.top - 114]]);
  c.fillStyle = lin(c, cx - rw, 0, cx + rw, 0, [[0, '#1b1513'], [0.78, '#30241d'], [0.88, '#5d4b3c'], [1, '#6e5a48']]); c.fillRect(cx - rw, o.top - 56, rw * 2, landing - o.top + 56);
  fr(c, mix(mix('#33414f', S.skyC, 0.2), '#ffd88c', S.lit * 0.9), cx - hw, o.top - 50, o.w, 44);
  if (o.num) txt(c, o.num, cx, o.top - 27, { size: 34, weight: 800, color: mix('#e9c46a', '#5a4a2a', S.lit * 0.8) });
  const lw = o.w - 80 * ajar, x0 = cx - hw, h = landing - o.top;
  c.fillStyle = lin(c, 0, o.top, 0, landing, [[0, tone(dc, 0.14)], [1, tone(dc, -0.2)]]); c.fillRect(x0, o.top, lw, h);
  if (ajar > 0) fr(c, '#0e0b0b', x0 + lw, o.top, o.w - lw, h);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
    const px = x0 + 22 + i * (lw / 2 - 6), py = o.top + 26 + j * (h / 3 - 6), pw = lw / 2 - 38, ph = h / 3 - (j === 2 ? 50 : 36);
    fr(c, tone(dc, -0.16), px, py, pw, ph); fr(c, tone(dc, 0.16), px + 5, py + ph - 5, pw - 5, 5); fr(c, tone(dc, 0.1), px + pw - 5, py + 5, 5, ph - 5);
  }
  disc(c, mix('#e2b84f', '#8a6a3a', S.A.grime), x0 + lw - 22, o.top + h * 0.52, 11); rr(c, mix('#e2b84f', '#8a6a3a', S.A.grime), x0 + lw / 2 - 42, o.top + h * 0.6, 84, 13, 4);
  fr(c, tone(dc, -0.3), x0, landing - 30, lw, 30);
  const sc = ag('#d8cfbe', S);
  for (let i = 0; i < 3; i++) { const w2 = sw + 10 + i * 28, y = landing + i * 18; fr(c, tone(sc, 0.1 - i * 0.03), cx - w2, y, w2 * 2, 18); fr(c, 'rgba(30,24,20,0.22)', cx - w2, y + 12, w2 * 2, 6); }
}
function shopWin(c, S, x, y, w, h, id, inner, litCol = '#ffcf80') {
  const th = 0.12 + 0.3 * hash(id, 5), k = ss(th, th + 0.1, S.A.broken);
  fr(c, mix(inner, litCol, S.lit * 0.92), x, y, w, h);
  return () => {
    fr(c, alpha(mix('#9cc3dc', S.skyC, 0.4), 0.2 * (1 - S.dark * 0.6) + S.A.grime * 0.35), x, y, w, h);
    quad(c, alpha('#ffffff', 0.16 * (1 - S.dark * 0.8)), [[x, y + h * 0.7], [x + w * 0.45, y], [x + w * 0.7, y], [x, y + h]]);
    if (k > 0) { const p = new Path2D(); addHole(p, x + w / 2, y + h / 2, w / 2, h / 2, k, id % 2 ? -1 : 1); c.fillStyle = '#16131a'; c.fill(p); }
    fr(c, 'rgba(10,10,24,0.25)', x, y, w, 14);
  };
}
const GF = {
  hero(c, b, S) {
    const st = ag('#cbbfa9', S), yT = BASE - F0;
    c.fillStyle = lin(c, 0, yT, 0, BASE, [[0, tone(st, 0.06)], [1, tone(st, -0.12)]]); c.fillRect(b.x, yT, b.w, F0);
    c.fillStyle = 'rgba(40,30,20,0.12)'; for (let y = yT + 78; y < BASE - 80; y += 78) c.fillRect(b.x, y, b.w, 6);
    fr(c, tone(st, -0.2), b.x, BASE - 70, b.w, 70); fr(c, 'rgba(255,255,255,0.18)', b.x, BASE - 70, b.w, 5);
    fr(c, S.trimC, b.x, yT - 24, b.w, 30);
    for (const k of [0, 2, 3]) groundWin(c, S, b.x + (b.w * (k + 0.5)) / 4 - 105, 330, 210, 330, 30 + k, S.trimC);
    doorSet(c, S, 292, { col: '#1f6f6b', w: 250, top: 246, trim: ag('#f3ead8', S, 0.8), num: '24' });
    for (const sd of [-1, 1]) { const lx = 292 + sd * 262; fr(c, '#2c3440', lx - 4, 330, 8, 26); rr(c, '#2c3440', lx - 20, 352, 40, 62, 6); rr(c, mix('#c9d2d6', '#ffe2a0', S.lit), lx - 14, 358, 28, 50, 4); }
  },
  stoop(c, b, S) {
    const cx = -237, tr = S.trimC;
    for (const k of [0, 1]) { const x = b.x + (b.w * (k + 0.5)) / 3 - 105; fr(c, tr, x - 30, 296, 270, 30); groundWin(c, S, x, 340, 210, 360, 40 + k, tr, false); }
    doorSet(c, S, cx, { col: '#27503a', w: 220, top: 266, trim: tr, hood: 'pediment', recess: 22 });
    c.strokeStyle = mix('#2c3440', '#7a4a30', ss(0.2, 0.8, S.A.grime)); c.lineWidth = 8; c.beginPath();
    for (const sd of [-1, 1]) { c.moveTo(cx + sd * 176, BASE - 54); c.lineTo(cx + sd * 176, BASE - 190); c.lineTo(cx + sd * 236, BASE - 140); c.lineTo(cx + sd * 236, BASE); }
    c.stroke();
    fr(c, tone(S.wallC, -0.25), b.x, BASE - 60, cx - 215 - b.x, 60);
  },
  shutter(c, b, S) {
    const ac = ag(b.accent || '#3f5f8a', S, 1.3), x = b.x, m = mix('#aab1b8', '#7a5a44', ss(0.2, 0.8, S.A.grime) * 0.7);
    fr(c, ac, x, 210, b.w, 120); fr(c, tone(ac, 0.15), x, 210, b.w, 8); fr(c, 'rgba(0,0,0,0.2)', x, 330, b.w, 10);
    fr(c, alpha('#f4ead8', 0.9 - S.A.grime * 0.6), x + 70, 246, b.w - 330, 48);
    fr(c, m, x + 50, 350, b.w - 310, 490); c.fillStyle = 'rgba(0,0,0,0.14)'; for (let y = 362; y < 840; y += 24) c.fillRect(x + 50, y, b.w - 310, 6);
    fr(c, tone(m, -0.3), x + 50, 816, b.w - 310, 24);
    fr(c, S.trimC, x + b.w - 226, 276, 192, 564); c.fillStyle = lin(c, 0, 290, 0, 840, [[0, tone(ac, -0.1)], [1, tone(ac, -0.35)]]); c.fillRect(x + b.w - 212, 290, 164, 550);
    fr(c, S.glass, x + b.w - 192, 320, 124, 200); disc(c, '#d9b65a', x + b.w - 66, 580, 9);
  },
  cafe(c, b, S) {
    const wood = ag('#2f5a4a', S, 1.3), x = b.x, k = ss(0.22, 0.5, S.A.broken);
    fr(c, wood, x, 215, b.w, 625); fr(c, tone(wood, 0.14), x, 215, 44, 625); fr(c, tone(wood, 0.14), x + b.w - 44, 215, 44, 625);
    fr(c, ag('#f4ead8', S), x - 8, 203, b.w + 16, 18); fr(c, 'rgba(0,0,0,0.2)', x, 340, b.w, 10);
    disc(c, ag('#f6d98a', S), 1010 + 62, 281, 34); disc(c, wood, 1010 + 78, 271, 30);
    signText(c, 'CAFÉ LUNA', 1160, 1590, 284, 96, ag('#f6ead2', S), S, 11);
    const fin = [shopWin(c, S, 1045, 380, 280, 380, 1, '#4a372c'), shopWin(c, S, 1345, 380, 280, 380, 2, '#4a372c')];
    c.fillStyle = 'rgba(30,18,12,0.42)';
    for (const wx of [1045, 1345]) { c.fillRect(wx, 640, 280, 120); c.fillRect(wx + 30, 560, 70, 80); c.fillRect(wx + 190, 590, 12, 50); c.fillRect(wx + 170, 580, 52, 12); for (const lx of [80, 200]) { c.fillRect(wx + lx - 2, 380, 4, 70); c.beginPath(); c.arc(wx + lx, 462, 22, Math.PI, TAU); c.fill(); } }
    for (const f of fin) f();
    if (S.A.grime < 0.5) { txt(c, 'COFFEE', 1185, 730, { size: 30, weight: 700, color: alpha('#f6ead2', 0.8 * (1 - S.A.grime * 2)), track: 4 }); txt(c, 'CAKES', 1485, 730, { size: 30, weight: 700, color: alpha('#f6ead2', 0.8 * (1 - S.A.grime * 2)), track: 4 }); }
    fr(c, tone(wood, -0.12), 1045, 772, 280, 56); fr(c, tone(wood, -0.12), 1345, 772, 280, 56);
    fr(c, ag('#f4ead8', S), 1666, 276, 188, 564); fr(c, tone(wood, -0.05), 1680, 290, 160, 550);
    const d = shopWin(c, S, 1698, 310, 124, 380, 3, '#4a372c'); d(); rr(c, '#d9b65a', 1692, 560, 12, 70, 5);
    if (S.A.grime < 0.4) { rr(c, ag('#c9463c', S), 1724, 420, 72, 34, 6); txt(c, S.power ? 'OPEN' : 'OPEN', 1760, 438, { size: 22, weight: 800, color: '#fff3dc' }); }
    if (k < 1) { c.fillStyle = lin(c, 0, 470, 0, 640, [[0, alpha('#0a0a14', 0.3 * (1 - k))], [1, 'rgba(10,10,20,0)']]); c.fillRect(1030, 470, 610, 170); }
  },
  pet(c, b, S) {
    const fc = ag('#d9603f', S, 1.3), cream = ag('#f6ecd6', S), x = b.x;
    fr(c, cream, x, 215, b.w, 625); fr(c, fc, x, 215, b.w, 125); fr(c, tone(fc, 0.14), x, 215, b.w, 8); fr(c, 'rgba(0,0,0,0.2)', x, 340, b.w, 10);
    signText(c, 'PET SHOP', 2420, 2880, 282, 92, ag('#fff3dc', S), S, 23);
    for (const [dx, dy, q] of [[0, 8, 22], [-24, -16, 10], [-8, -28, 10], [8, -28, 10], [24, -16, 10]]) disc(c, ag('#fff3dc', S), 2300 + dx, 284 + dy, q);
    const f1 = shopWin(c, S, 2390, 380, 570, 380, 4, '#35434a', '#ffe2a8');
    c.fillStyle = 'rgba(20,30,40,0.4)'; c.fillRect(2390, 690, 570, 70); c.fillRect(2420, 590, 90, 100); c.fillRect(2520, 620, 80, 70);
    c.strokeStyle = 'rgba(230,240,245,0.55)'; c.lineWidth = 5; c.beginPath(); c.arc(2690, 640, 48, 0, TAU); c.moveTo(2800, 690); c.lineTo(2800, 560); c.arc(2850, 560, 50, Math.PI, TAU); c.lineTo(2900, 690); for (let i = 1; i < 5; i++) { c.moveTo(2800 + i * 20, 520); c.lineTo(2800 + i * 20, 690); } c.stroke();
    fr(c, alpha('#7cc7e8', 0.4), 2646, 640, 88, 40);
    f1();
    fr(c, tone(fc, -0.1), 2390, 772, 570, 56);
    fr(c, tone(cream, -0.12), 2221, 276, 158, 564); fr(c, tone(fc, -0.05), 2235, 290, 130, 550); const d = shopWin(c, S, 2251, 310, 98, 380, 5, '#35434a', '#ffe2a8'); d(); rr(c, '#d9b65a', 2344, 560, 12, 70, 5);
  },
};
let FE = null;
function fireEscape(c, S) {
  if (!FE) {
    const thick = new Path2D(), thin = new Path2D(), ys = [60, -410, -880, -1350];
    ys.forEach((y, i) => {
      const x0 = i === 0 ? 170 : 470, x1 = 930;
      thick.moveTo(x0, y); thick.lineTo(x1, y);
      thin.moveTo(x0, y - 110); thin.lineTo(x1, y - 110); thin.moveTo(x0, y - 56); thin.lineTo(x1, y - 56);
      for (let x = x0; x <= x1; x += 38) { thin.moveTo(x, y - 110); thin.lineTo(x, y); }
      thick.moveTo(x0 + 6, y + 6); thick.lineTo(x0 + 6, y + 50); thick.moveTo(x1 - 6, y + 6); thick.lineTo(x1 - 6, y + 50);
      if (i < ys.length - 1) {
        const a = i % 2 ? [860, 540] : [540, 860], yn = ys[i + 1];
        thick.moveTo(a[0], y); thick.lineTo(a[1], yn);
        thin.moveTo(a[0], y - 104); thin.lineTo(a[1], yn - 104);
        for (let k = 1; k < 12; k++) { const u = k / 12, sx = lerp(a[0], a[1], u), sy = lerp(y, yn, u); thin.moveTo(sx - 24, sy); thin.lineTo(sx + 24, sy); }
      }
    });
    thin.moveTo(872, 60); thin.lineTo(872, 470); thin.moveTo(916, 60); thin.lineTo(916, 470);
    for (let y = 100; y <= 460; y += 40) { thin.moveTo(872, y); thin.lineTo(916, y); }
    FE = { thick, thin };
  }
  const col = mix('#2b333d', '#7a4630', ss(0.25, 0.85, S.A.grime));
  c.save(); c.lineCap = 'butt';
  c.save(); c.translate(18, 24); c.strokeStyle = 'rgba(20,16,30,0.16)'; c.lineWidth = 12; c.stroke(FE.thick); c.lineWidth = 5; c.stroke(FE.thin); c.restore();
  c.strokeStyle = col; c.lineWidth = 12; c.stroke(FE.thick); c.lineWidth = 5; c.stroke(FE.thin);
  c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 3; c.translate(0, -5); c.stroke(FE.thick);
  c.restore();
}
function billboard(c, S) {
  const { x, y, w, h } = STREET.billboard, g = S.A.grime, cream = ag('#f6ead2', S, 1.4), peel = ss(0.2, 0.7, g);
  fr(c, 'rgba(20,16,30,0.2)', x - 4, y + 10, w + 26, h + 16);
  fr(c, mix('#2c3440', '#6b4630', ss(0.2, 0.8, g)), x - 14, y - 14, w + 28, h + 28);
  c.fillStyle = lin(c, 0, y, 0, y + h, [[0, tone(cream, 0.04)], [1, tone(cream, -0.08)]]); c.fillRect(x, y, w, h);
  fr(c, ag('#2f8f86', S, 1.5), x, y, 232, h);
  const hx = x + 116, hy = y + 150, hc = ag('#ef6a5b', S, 1.5);
  c.fillStyle = hc; c.beginPath(); c.moveTo(hx, hy + 98); c.bezierCurveTo(hx - 150, hy - 10, hx - 70, hy - 120, hx, hy - 50); c.bezierCurveTo(hx + 70, hy - 120, hx + 150, hy - 10, hx, hy + 98); c.fill();
  for (const [dx, dy, q] of [[0, 14, 26], [-30, -14, 12], [-10, -30, 12], [10, -30, 12], [30, -14, 12]]) disc(c, cream, hx + dx, hy + dy, q);
  signText(c, 'ADOPT', x + 290, x + 560, y + 112, 130, ag('#1b2a52', S, 1.2), S, 31, 300);
  signText(c, 'A FRIEND', x + 276, x + 578, y + 236, 88, ag('#e0683f', S, 1.4), S, 37, 200);
  if (peel > 0.01) { c.fillStyle = alpha('#6b6156', peel * 0.9); for (let i = 0; i < 7; i++) { const px = x + 30 + hash(i, 71) * (w - 90), ph = h * (0.3 + 0.6 * hash(i, 72)) * peel; c.beginPath(); c.moveTo(px, y); c.lineTo(px + 46, y); c.lineTo(px + 36, y + ph * 0.8); c.lineTo(px + 18, y + ph); c.lineTo(px + 6, y + ph * 0.7); c.closePath(); c.fill(); } }
  for (const lx of [x + 150, x + w - 150]) { c.strokeStyle = '#2c3440'; c.lineWidth = 7; c.beginPath(); c.moveTo(lx, y - 14); c.quadraticCurveTo(lx, y - 70, lx + 40, y - 62); c.stroke(); rr(c, '#2c3440', lx + 22, y - 72, 48, 22, 8); }
}
function awning(c, S) {
  const br = S.A.broken, k = ss(0.22, 0.5, br), tear = ss(0.08, 0.2, br), fade = S.A.grime, mossK = ss(0.6, 0.95, S.A.vines) * 0.6;
  const P = (a, b) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  const TL = [1030, 350], TR = P([1640, 350], [1650, 560]), BL = P([1012, 470], [1000, 520]), BR = P([1658, 470], [1700, 846]);
  const at = (u, v) => { const a = [lerp(TL[0], TR[0], u), lerp(TL[1], TR[1], u)], b = [lerp(BL[0], BR[0], u), lerp(BL[1], BR[1], u)]; return [lerp(a[0], b[0], v), lerp(a[1], b[1], v)]; };
  if (k > 0.01) quad(c, alpha('#110d14', k * 0.94), [BL, BR, [1700, 850], [1000, 850]]);
  const cols = [mix(mix('#c9463c', '#a39a8c', fade * 0.75), LEAF.dark, mossK), mix(mix('#f3e7cf', '#b3aa98', fade * 0.75), LEAF.dark, mossK)], n = 12;
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n, col = cols[i % 2], m = at((u0 + u1) / 2, 1), q = (Math.hypot(at(u1, 1)[0] - at(u0, 1)[0], at(u1, 1)[1] - at(u0, 1)[1]) / 2) * (1 - 0.5 * k);
    quad(c, col, [at(u0, 0), at(u1, 0), at(u1, 1), at(u0, 1)]);
    disc(c, col, m[0], m[1], q);
  }
  c.fillStyle = lin(c, 0, TL[1], 0, BR[1], [[0, 'rgba(255,255,255,0.12)'], [1, 'rgba(20,10,20,0.2)']]); c.beginPath(); [TL, TR, BR, BL].forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill();
  if (tear > 0.01) {
    for (const [u, v, q] of [[0.3, 0.55, 0.07], [0.72, 0.4, 0.09]]) { const p = new Path2D(); JAG.forEach(([jx, jy], i) => { const z = at(u + jx * q * tear, v + jy * 0.38 * tear); if (i) p.lineTo(z[0], z[1]); else p.moveTo(z[0], z[1]); }); p.closePath(); c.fillStyle = 'rgba(30,22,24,0.85)'; c.fill(p); }
    const a = at(0.52, 1), b = at(0.6, 1); quad(c, tone(cols[0], -0.2), [a, b, [b[0] - 6, b[1] + 100 * tear], [a[0] + 14, a[1] + 70 * tear]]);
  }
  c.strokeStyle = mix('#3d4a52', '#7a4a30', ss(0.15, 0.7, fade)); c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(TL[0], TL[1]); c.lineTo(TR[0], TR[1]); c.stroke();
}
function drawBuilding(c, b, S) {
  const G = geom(b), { A } = S, top = G.top, wc = ag(b.wall, S), trim = ag(b.trim, S, 0.8), col = A.collapse;
  S.wallC = wc; S.trimC = trim;
  c.save();
  if (col > 0.002) c.clip(profPath(b, G, col, true));
  c.fillStyle = lin(c, 0, top, 0, BASE, [[0, tone(wc, 0.1)], [0.75, wc], [1, tone(wc, -0.12)]]); c.fillRect(b.x, top - 12, b.w, BASE - top + 12);
  fr(c, 'rgba(0,0,0,0.1)', b.x + b.w - 14, top, 14, BASE - top); fr(c, 'rgba(255,255,255,0.1)', b.x, top, 8, BASE - top);
  c.fillStyle = b.kind === 'stone' ? 'rgba(40,45,60,0.15)' : 'rgba(70,24,10,0.16)'; c.fill(G.texA);
  c.fillStyle = 'rgba(255,240,220,0.14)'; c.fill(G.texB);
  c.fillStyle = trim; c.fill(G.band); c.fillStyle = 'rgba(20,16,30,0.2)'; c.fill(G.bandSh);
  c.fillStyle = trim; c.fill(G.frame);
  c.fillStyle = S.glass; c.fill(G.glass);
  c.fillStyle = alpha('#efe7d6', 0.5 * (1 - A.grime * 0.6)); c.fill(G.curtain);
  for (const w of G.wins) {
    if (w.hero) { quad(c, ag('#d9a25f', S), [[w.x, w.y], [w.x + 70, w.y], [w.x + 24, w.y + w.h * 0.7], [w.x, w.y + w.h]]); quad(c, ag('#d9a25f', S), [[w.x + w.w, w.y], [w.x + w.w - 70, w.y], [w.x + w.w - 24, w.y + w.h * 0.7], [w.x + w.w, w.y + w.h]]); }
    const on = winOn(w, S);
    if (on > 0.01) { c.globalAlpha = on * (w.hero ? 0.8 : 1); c.fillStyle = winCol(w); c.fillRect(w.x, w.y, w.w, w.h); c.globalAlpha = 1; }
  }
  c.fillStyle = alpha('#ffffff', 0.16 * (1 - S.dark * 0.8)); c.fill(G.refl);
  if (A.broken > 0.03) { const hp = new Path2D(); for (const w of G.wins) { const k = ss(w.brk, w.brk + 0.06, A.broken); if (k > 0) addHole(hp, w.cx, w.cy, w.w / 2, w.h / 2, k, w.on > 0.5 ? 1 : -1); } c.fillStyle = '#131824'; c.fill(hp); }
  c.fillStyle = 'rgba(10,14,30,0.22)'; c.fill(G.reveal);
  c.fillStyle = alpha(trim, 1 - A.broken * 0.7); c.fill(G.bars);
  c.fillStyle = tone(trim, 0.06); c.fill(G.sill); c.fillStyle = 'rgba(20,16,30,0.22)'; c.fill(G.sillSh);
  if (A.grime > 0.02) { c.fillStyle = alpha('#2a2620', A.grime * 0.3); c.fill(G.stain); }
  GF[b.shop](c, b, S);
  if (b.id === 'hero') {
    const hw = STREET.heroWindow, alive = 1 - ss(0.02, 0.4, S.years);
    fr(c, ag('#b5613c', S), hw.x - 12, 46, hw.w + 24, 34);
    if (alive > 0.02) { c.save(); c.globalAlpha = alive; bush(c, hw.cx, 52, { w: hw.w + 6, h: 50, seed: 4, t: S.t, flowers: '#f0503f' }); c.restore(); }
    fireEscape(c, S);
  }
  if (b.id === 'pet') billboard(c, S);
  if (A.grime > 0.02) { c.fillStyle = lin(c, 0, BASE - 520, 0, BASE, [[0, 'rgba(40,36,28,0)'], [1, alpha('#28241c', A.grime * 0.4)]]); c.fillRect(b.x, BASE - 520, b.w, 520); }
  ivyOn(c, b.x, BASE, b.w, Math.min(BASE - top, 2300), A.vines * (b.id === 'hero' ? 1.04 : 0.96), b.seed + 2, S.t, 2.4, b.id === 'hero' ? 1.25 : 1);
  c.restore();
  if (col > 0.002) { c.strokeStyle = tone(wc, -0.34); c.lineWidth = 16; c.lineJoin = 'miter'; c.stroke(profPath(b, G, col, false)); }
  if (col > 0.01) {      // rubble at the foot
    const q = Math.sqrt(col), r = RNG(b.seed * 7 + 1), p = new Path2D();
    for (let x = b.x + 30; x < b.x + b.w; x += r.range(70, 150)) { const rx = r.range(60, 130), ry = r.range(30, 110) * q; if (Math.abs(x - 292) < 260) continue; p.moveTo(x + rx, BASE + 6); p.ellipse(x, BASE + 6, rx, ry, 0, Math.PI, TAU); }
    c.fillStyle = mix(tone(wc, -0.2), LEAF.dark, clamp(A.vines * 0.7)); c.fill(p);
  }
}

// ---------------------------------------------------------------- skyline, ground
let SKYL = null;
function skylineGeom() {
  if (SKYL) return SKYL;
  const r = RNG(31), mk = (x0, x1, wa, wb, ha, hb, base) => {
    const a = new Path2D(), ru = new Path2D(), wn = new Path2D();
    for (let x = x0; x < x1;) {
      const w = r.range(wa, wb), h = r.range(ha, hb), h2 = h * r.range(0.3, 0.75), yb = base + 500;
      a.rect(x, base - h, w, h + 500);
      ru.moveTo(x, yb); ru.lineTo(x, base - h2); ru.lineTo(x + w * 0.3, base - h2 - r.range(0, 70)); ru.lineTo(x + w * 0.5, base - h2 + 30); ru.lineTo(x + w * 0.8, base - h2 - r.range(0, 90)); ru.lineTo(x + w, base - h2 + 10); ru.lineTo(x + w, yb); ru.closePath();
      const cw = w / 5;
      for (let wy = base - h + 30; wy < base - 40; wy += cw * 1.5) for (let k = 0; k < 4; k++) if (r.chance(0.3)) wn.rect(x + cw * (k + 0.75), wy, cw * 0.5, cw * 0.7);
      x += w + r.range(0, 70);
    }
    return { a, ru, wn };
  };
  const far = mk(-1300, 3300, 90, 190, 260, 900, 900), mid = mk(-1700, 4300, 240, 420, 700, 2300, 930), trees = new Path2D();
  for (let x = -1700; x < 4300; x += r.range(120, 260)) { const q = r.range(120, 260), y = 930 - r.range(0, 500); trees.moveTo(x + q, y); trees.arc(x, y, q, 0, TAU); trees.rect(x - q, y, q * 2, 900); }
  SKYL = { far, mid, trees };
  return SKYL;
}
function skyline(g, S) {
  const K = skylineGeom(), col = S.A.collapse, intact = 1 - ss(0.03, 0.3, col), look = S.look, green = clamp(S.A.vines * 0.6);
  const draw = (c, L, base) => {
    c.fillStyle = mix(base, '#5f7a5a', green); c.fill(L.ru);
    if (intact > 0.01) { c.globalAlpha = intact; c.fill(L.a); if (S.lit > 0.01) { c.globalAlpha = intact * S.lit * 0.85; c.fillStyle = '#ffd98a'; c.fill(L.wn); } c.globalAlpha = 1; }
  };
  g.layer(0.25, (c) => draw(c, K.far, '#7f95b8'), { fog: [look.haze, 0.55] });
  g.layer(0.5, (c) => {
    draw(c, K.mid, '#6b7fa6');
    const tk = ss(0.3, 1.05, S.A.trees);
    if (tk > 0.01) { c.save(); c.translate(0, (1 - tk) * 700); c.fillStyle = LEAF.dark; c.fill(K.trees); c.translate(-30, -40); c.globalAlpha = 0.5; c.fillStyle = LEAF.mid; c.fill(K.trees); c.restore(); }
  }, { fog: [look.haze, 0.32] });
}
const PUDDLES = (() => { const r = RNG(77), a = []; for (let i = 0; i < 22; i++) a.push([r.range(-1100, 3300), i < 6 ? r.range(856, 900) : r.range(985, 1290), r.range(60, 170), r.range(0.1, 0.16)]); return a; })();
let GRD = null;
function ground(c, S) {
  const { A, v, look } = S, x0 = v.x0 - 40, w = v.x1 - v.x0 + 80, green = ss(0.45, 1.05, A.trees), mossy = ss(0.2, 0.9, A.trees);
  if (!GRD) {
    const r = RNG(909), joints = new Path2D(), cracks = new Path2D(), dashes = new Path2D();
    for (let x = -1820; x < 4000; x += 130) { joints.moveTo(x, BASE); joints.lineTo(x, KERB); }
    joints.moveTo(-1820, 885); joints.lineTo(4000, 885);
    for (let i = 0; i < 46; i++) { let x = r.range(-1300, 3500), y = i < 14 ? r.range(846, 920) : r.range(970, 1300); cracks.moveTo(x, y); for (let k = 0; k < 5; k++) { x += r.range(-60, 70); y += r.range(-14, 22) * (i < 14 ? 0.6 : 1); cracks.lineTo(x, y); } }
    for (let x = -1800; x < 4000; x += 300) dashes.rect(x, 1142, 150, 12);
    GRD = { joints, cracks, dashes };
  }
  const pave = mix(mix('#bdb6aa', '#8f8a7e', A.grime * 0.6), '#6f8a52', mossy * 0.75);
  c.fillStyle = lin(c, 0, BASE, 0, KERB, [[0, tone(pave, -0.1)], [0.25, pave], [1, tone(pave, 0.05)]]); c.fillRect(x0, BASE - 4, w, KERB - BASE + 4);
  c.strokeStyle = alpha('#3a362e', 0.2 * (1 - mossy * 0.6)); c.lineWidth = 3; c.stroke(GRD.joints);
  fr(c, tone(pave, 0.14), x0, KERB, w, 14); fr(c, tone(pave, -0.28), x0, KERB + 14, w, 14);
  const road = mix(mix('#5d616c', '#6d6a66', A.grime * 0.6), '#587a44', green * 0.9);
  c.fillStyle = lin(c, 0, KERB + 28, 0, 1500, [[0, tone(road, -0.08)], [0.15, road], [1, tone(road, -0.2)]]); c.fillRect(x0, KERB + 28, w, 1300);
  const mark = alpha('#ece6d4', 0.85 * (1 - clamp(A.grime * 1.5)) * (1 - green));
  c.fillStyle = mark; c.fill(GRD.dashes); c.fillRect(x0, 1028, w, 5);
  if (v.x1 > 1900 && v.x0 < 2200) { for (let i = 0; i < 7; i++) c.fillRect(1925, 972 + i * 46, 230, 24); c.fillRect(1880, 1130, 10, 150); }
  disc(c, tone(road, -0.25), 1300, 1110, 1); c.fillStyle = tone(road, -0.22); c.beginPath(); c.ellipse(1300, 1110, 56, 22, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(-300, 1200, 56, 22, 0, 0, TAU); c.fill();
  if (A.grime > 0.02) { c.strokeStyle = alpha('#24221f', clamp(A.grime * 1.6) * 0.5); c.lineWidth = 4; c.lineJoin = 'round'; c.stroke(GRD.cracks); }
  if (S.wet > 0.01) {
    const sk = look.sky[3][1];
    fr(c, alpha('#141b28', 0.34 * S.wet), x0, KERB + 28, w, 1300); fr(c, alpha('#141b28', 0.16 * S.wet), x0, BASE, w, KERB - BASE + 28);
    c.fillStyle = lin(c, 0, KERB + 28, 0, 1180, [[0, alpha(sk, 0.3 * S.wet)], [1, alpha(sk, 0)]]); c.fillRect(x0, KERB + 28, w, 260);
    for (const [px, py, pr, pk] of PUDDLES) { if (px + pr < v.x0 || px - pr > v.x1) continue; c.fillStyle = alpha(mix(sk, '#ffffff', 0.12), 0.55 * S.wet); c.beginPath(); c.ellipse(px, py, pr, pr * pk, 0, 0, TAU); c.fill(); c.fillStyle = alpha('#ffffff', 0.25 * S.wet); c.beginPath(); c.ellipse(px - pr * 0.2, py - pr * pk * 0.3, pr * 0.5, pr * pk * 0.25, 0, 0, TAU); c.fill(); }
  }
}
function sideStreet(c, S) {
  if (S.v.x1 < 1880 || S.v.x0 > 2200) return;
  const cafe = BLD[3], pet = BLD[4], col = S.A.collapse, t0 = profY(cafe, geom(cafe), geom(cafe).n - 1, col) + 90, t1 = profY(pet, geom(pet), 0, col) + 90;
  quad(c, tone(ag(cafe.wall, S), -0.3), [[1880, BASE], [1880, t0], [1992, lerp(t0, 700, 0.7)], [1992, 742]]);
  quad(c, tone(ag(pet.wall, S), -0.18), [[2200, BASE], [2200, t1], [2088, lerp(t1, 700, 0.7)], [2088, 742]]);
  quad(c, mix(mix('#6b6f78', '#587a44', ss(0.45, 1.05, S.A.trees) * 0.9), S.hazeC, 0.25), [[1880, BASE], [2200, BASE], [2088, 742], [1992, 742]]);
  c.fillStyle = 'rgba(20,24,40,0.3)'; for (let i = 0; i < 4; i++) { const y = 200 - i * 330; if (y < t0 + 100) break; quad(c, c.fillStyle, [[1905, y], [1960, y + 40], [1960, y + 200], [1905, y + 220]]); }
}
const TREES = [   // x, ground y, full height, kind, threshold on A.trees, seed.  y < 900: behind the actors
  [-980, 862, 1500, 'round', 0.08, 3], [-450, 858, 1900, 'round', 0.3, 5], [-40, 864, 1300, 'birch', 0.1, 8], [660, 860, 2000, 'round', 0.24, 12], [1010, 866, 1500, 'poplar', 0.4, 4],
  [1800, 862, 1800, 'round', 0.12, 9], [2120, 868, 1400, 'birch', 0.05, 15], [2520, 858, 2100, 'round', 0.35, 7], [2980, 864, 1600, 'round', 0.15, 2], [3400, 860, 1700, 'round', 0.2, 6],
  [-700, 1020, 1700, 'round', 0.26, 21], [900, 1040, 1500, 'birch', 0.16, 22], [1500, 1010, 1900, 'round', 0.45, 23], [2060, 1050, 1600, 'round', 0.2, 24], [2760, 1030, 1800, 'round', 0.3, 25], [3300, 1040, 1500, 'birch', 0.4, 26],
  [-330, 1290, 2100, 'round', 0.52, 31], [1180, 1320, 2300, 'round', 0.58, 32], [2400, 1300, 2000, 'round', 0.5, 33],
];
const treeH = (hm, th, tk) => hm * Math.pow(clamp((tk - th) / (1.05 - th), 0, 1.15), 1.3);
const BUSHES = [[-900, 0.12, 5], [-560, 0.3, 2], [-90, 0.2, 7], [520, 0.4, 3], [1010, 0.15, 9], [1560, 0.5, 4], [2180, 0.1, 6], [2700, 0.28, 8], [3050, 0.2, 1]];
const FERNS = (() => { const r = RNG(555), a = []; for (let i = 0; i < 26; i++) a.push([r.range(-1100, 3300), r.range(960, 1290), r.range(0.9, 1.9), r.range(0.45, 0.8), i + 1]); return a; })();

// ---------------------------------------------------------------- the street
export function streetSet(g, t, o = {}) {
  const S = mkState(g, t, o), { A, look, v } = S, tk = A.trees;
  S.glass = mix(mix(mix('#3f5f86', S.skyC, 0.35), '#0e1426', S.dark * 0.75), '#8d8f86', A.grime * 0.45);
  drawSky(g, look, { clouds: o.clouds });
  if (A.collapse > 0.001 || (v.x0 < 2200 && v.x1 > 1880) || v.y0 < -700 || v.x0 < -1560 || v.x1 > 3780) skyline(g, S);
  const cars = carList(S), items = [];
  for (const k of cars) items.push({ y: k.y, x0: k.x - 760, x1: k.x + 760, draw: (c) => drawCar(c, k) });
  if (tk > 0.03) for (const [x, y, hm, kind, th, seed] of TREES) { if (y < 900) continue; const h = treeH(hm, th, tk); if (h > 30) items.push({ y, x0: x - h * 0.5, x1: x + h * 0.5, draw: (c) => tree(c, x, y, { h, kind, seed, t: S.t }) }); }
  const fk = ss(0.55, 1, tk);
  if (fk > 0.01) for (const [x, y, s, th, seed] of FERNS) { const q = ss(th, th + 0.25, tk) * s; if (q > 0.05) items.push({ y, x0: x - 200, x1: x + 200, draw: (c) => fern(c, x, y, q, seed, S.t) }); }
  const vis = items.filter((i) => i.x1 > v.x0 && i.x0 < v.x1).sort((a, b) => a.y - b.y);
  const rk = ss(0.35, 0.9, tk), wk = A.weeds;
  g.layer(1, (c) => {
    sideStreet(c, S);
    ground(c, S);
    for (const b of BLD) if (b.x < v.x1 && b.x + b.w > v.x0) drawBuilding(c, b, S);
    // pavement furniture and growth behind the actors
    if (wk > 0.01) grassRow(c, S, BASE + 3, { h: 10 + 46 * wk + 30 * rk, density: 0.02 + 0.2 * wk }, 100);
    if (tk > 0.05) for (const [x, th, seed] of BUSHES) { const q = ss(th, th + 0.45, tk); if (q > 0.03 && x > v.x0 - 300 && x < v.x1 + 300) bush(c, x, BASE + 8, { w: 300 * q, h: 170 * q, seed, t: S.t }); }
    if (tk > 0.03) for (const [x, y, hm, kind, th, seed] of TREES) { if (y >= 900) continue; const h = treeH(hm, th, tk); if (h > 30 && x + h * 0.5 > v.x0 && x - h * 0.5 < v.x1) tree(c, x, y, { h, kind, seed, t: S.t }); }
    if (v.x0 < -300) busStop(c, S);
    if (v.x0 < 800 && v.x1 > -200) { hydrant(c, S); mailbox(c, S); }
    if (v.x1 > 900 && v.x0 < 1900) {
      STREET.tables.forEach((p, i) => cafeTable(c, p.x, p.y, S, i));
      awning(c, S);
      const bc = ag('#3a2f2a', S); quad(c, ag('#9a6a40', S), [[1634, 870], [1652, 720], [1700, 720], [1716, 870]]); quad(c, bc, [[1644, 858], [1658, 734], [1694, 734], [1706, 858]]);
      c.fillStyle = alpha('#f4f1ea', 0.7 * (1 - clamp(A.grime * 2))); c.fillRect(1662, 752, 28, 5); c.fillRect(1660, 772, 32, 4); c.fillRect(1660, 788, 26, 4); c.fillRect(1658, 806, 34, 4);
    }
    litterItems(c, S, LITTER, true);
    if (A.weeds > 0.2) leafLitter(c, v.x0, v.x1, 866, { n: Math.round(40 * ss(0.2, 0.8, A.weeds)), yVar: 20, seed: 3 });
    if (wk > 0.01) grassRow(c, S, 886, { h: 8 + 30 * wk + 30 * rk, density: 0.008 + 0.09 * wk + 0.1 * rk, yVar: 3 }, 200);
    if (o.actors) o.actors(c);
    if (wk > 0.01) grassRow(c, S, KERB + 4, { h: 8 + 44 * wk + 30 * rk, density: 0.02 + 0.22 * wk }, 300);
    LAMPS.forEach((L, i) => { if (L.x > v.x0 - 900 && L.x < v.x1 + 900) drawLamp(c, i, S); });
    if (v.x1 > 1700 && v.x0 < 2000) drawTrafficLight(c, { x: 1850, y: KERB, state: signalState(S.t, o), years: S.years });
    litterItems(c, S, LITTER, false);
    let i = 0;
    for (; i < vis.length && vis[i].y < 1150; i++) vis[i].draw(c);
    if (wk > 0.05) grassRow(c, S, 1050, { h: 10 + 26 * wk + 60 * rk, density: 0.004 + 0.03 * wk + 0.2 * rk, yVar: 46 }, 400);
    if (o.front) o.front(c);
    for (; i < vis.length; i++) vis[i].draw(c);
    if (wk > 0.05) grassRow(c, S, 1250, { h: 12 + 30 * wk + 70 * rk, density: 0.004 + 0.03 * wk + 0.2 * rk, yVar: 60 }, 500);
  });
  if (rk > 0.05 && o.fg !== false) g.layer(1.3, (c) => grassRow(c, { ...S, v: g.view(1.3, 80) }, 1400, { h: 60 + 130 * rk, density: 0.05 + 0.12 * rk, yVar: 30, w: 2.4, colors: [LEAF.deep, LEAF.dark] }, 600));
}

const SHOP_GLOW = [[1045, 380, 280, 380, '#ffc878', 1], [1345, 380, 280, 380, '#ffc878', 2], [1698, 310, 124, 380, '#ffc878', 3], [2390, 380, 570, 380, '#ffe2a8', 4], [2251, 310, 98, 380, '#ffe2a8', 5], [167, 196, 250, 44, '#ffd88c', 0]];
export function streetLight(g, t, o = {}) {
  const S = mkState(g, t, o), D = ss(0.15, 0.55, S.dark), { v } = S;
  if (D <= 0.01) return;
  const fl = clamp(+o.flicker || 0), P = S.power ? D : 0;
  g.layer(1, (c) => {
    c.save(); c.globalCompositeOperation = 'screen';
    if (S.lit > 0.01 && o.windows !== false && S.A.collapse < 0.01) {
      for (const b of BLD) {
        if (b.x > v.x1 || b.x + b.w < v.x0) continue;
        for (const w of geom(b).wins) { const on = winOn(w, S); if (on <= 0.01 || w.y > v.y1 || w.y + w.h < v.y0) continue; c.globalAlpha = 0.72 * on; c.fillStyle = winCol(w); c.fillRect(w.x, w.y, w.w, w.h); c.globalAlpha = 1; glow(c, w.cx, w.cy, w.hero ? 420 : 300, w.hero ? '#ffc060' : '#ffb65c', (w.hero ? 0.4 : 0.2) * on); }
      }
      for (const [x, y, w, h, col] of SHOP_GLOW) { if (x > v.x1 || x + w < v.x0) continue; c.globalAlpha = 0.55 * S.lit; c.fillStyle = col; c.fillRect(x, y, w, h); c.globalAlpha = 1; glow(c, x + w / 2, y + h / 2, Math.max(w, h) * 0.9, col, 0.28 * S.lit); }
      for (const sd of [-1, 1]) glow(c, 292 + sd * 262, 384, 150, '#ffd890', 0.7 * S.lit);
      const B = STREET.billboard; if (B.x < v.x1 && B.x + B.w > v.x0) { c.globalAlpha = 0.3 * S.lit; c.fillStyle = '#fff0cc'; c.fillRect(B.x, B.y, B.w, B.h); c.globalAlpha = 1; glow(c, B.x + 196, B.y - 50, 220, '#fff0cc', 0.5 * S.lit); glow(c, B.x + B.w - 104, B.y - 50, 220, '#fff0cc', 0.5 * S.lit); }
    }
    if (P > 0.01) {
      LAMPS.forEach((L, i) => {
        if (L.x < v.x0 - 700 || L.x > v.x1 + 700) return;
        const [hx, hy] = lampHead(i, S), k = P * (1 - fl * (noise1(S.t * 9 + i * 13, i) > 0.1 ? 0.75 : 0));
        c.globalAlpha = 0.16 * k; c.fillStyle = lin(c, 0, hy, 0, GY + 40, [[0, 'rgba(255,222,160,1)'], [1, 'rgba(255,222,160,0.15)']]);
        c.beginPath(); c.moveTo(hx - 40, hy + 14); c.lineTo(hx + 40, hy + 14); c.lineTo(hx + 330, GY + 40); c.lineTo(hx - 330, GY + 40); c.closePath(); c.fill(); c.globalAlpha = 1;
        glow(c, hx, hy + 16, 470, '#ffd9a0', 0.7 * k); glow(c, hx, hy + 12, 90, '#fff6dc', k);
        shadow(c, hx, GY + 30, 360, 70, 0.4 * k, '#ffd9a0');
        if (S.wet > 0.01) { c.globalAlpha = 0.3 * k * S.wet; c.fillStyle = lin(c, 0, KERB + 30, 0, 1400, [[0, 'rgba(255,222,160,1)'], [1, 'rgba(255,222,160,0)']]); c.fillRect(hx - 46, KERB + 30, 92, 470); c.globalAlpha = 1; }
      });
      const st = signalState(S.t, o);
      if (SIG[st] && v.x1 > 1500 && v.x0 < 2200) { const [col, y] = SIG[st]; glow(c, 1850, KERB + y, 190, col, 0.85 * P); glow(c, 1850, KERB + y, 46, '#ffffff', 0.5 * P); if (S.wet > 0.01) { c.globalAlpha = 0.3 * P * S.wet; c.fillStyle = lin(c, 0, KERB + 30, 0, 1300, [[0, col], [1, alpha(col, 0)]]); c.fillRect(1818, KERB + 30, 64, 370); c.globalAlpha = 1; } }
    }
    c.restore();
    for (const k of carList(S)) if (k.lights > 0.01 && k.x > v.x0 - 900 && k.x < v.x1 + 900) drawCarLights(c, { ...k, lights: k.lights * D });
  });
}

// ---------------------------------------------------------------- alley
export const ALLEY = {
  groundY: GY, wallBase: { x0: -260, x1: 1600, y: 856 }, bins: { x: 600, y: 876 }, staticBins: [{ x: 250, y: 868 }, { x: 400, y: 868 }],
  dumpster: { x: 1100, y: 868, w: 460, h: 330 }, door: { x: 760, y: 290, w: 250, h: 560 }, lamp: { x: 885, y: 206 },
  hide: { x: 1052, y: 874 }, gap: { x: 1750, y: 874 }, fence: { x0: 1620, x1: 2000, top: 400 }, wrecks: [{ x: -90, y: 874 }, { x: 1500, y: 992 }],
  bounds: { x0: -300, x1: 2300 }, cams: { wide: [960, 480, 0.8], bins: [420, 600, 1.2], door: [900, 520, 1], gap: [1760, 620, 1.2], base: [600, 700, 1.5] },
};
const AW = [{ x: -900, w: 1540, col: '#8a4a3c', seed: 11 }, { x: 640, w: 980, col: '#6f4b4a', seed: 12 }, { x: 2000, w: 900, col: '#5b4650', seed: 13 }];
const AWIN = [[-420, -420, 0.3], [40, -420, 0.9], [300, 110, 0.2], [760, -420, 0.7], [1220, -420, 0.35], [2180, -200, 0.8]];
let MESH = null;
function meshGeom() {
  if (MESH) return MESH;
  const p = new Path2D(), x0 = 1620, x1 = 2000, y0 = 400, y1 = 850, hx = 1750, hy = 800;
  for (let d = -460; d < 400; d += 30) for (const sg of [1, -1]) {
    for (let s = 0; s < 450; s += 30) {
      const xa = sg > 0 ? x0 + d + s : x1 - d - s, xb = xa + sg * 30, ya = y0 + s, yb = ya + 30, mx = (xa + xb) / 2, my = (ya + yb) / 2;
      if (Math.min(xa, xb) < x0 || Math.max(xa, xb) > x1 || ((mx - hx) / 78) ** 2 + ((my - hy) / 86) ** 2 < 1) continue;
      p.moveTo(xa, ya); p.lineTo(xb, yb);
    }
  }
  MESH = p;
  return p;
}
function bin(c, x, y, S, tilt = 0) {
  const rust = ss(0.2, 0.8, S.A.grime), col = mix('#8d98a0', '#7a4a30', rust * 0.8);
  shadow(c, x, y, 100, 12, 0.3);
  c.save(); c.translate(x, y); c.rotate(tilt);
  c.fillStyle = lin(c, -70, 0, 70, 0, [[0, tone(col, 0.18)], [0.5, col], [1, tone(col, -0.3)]]); c.beginPath(); c.moveTo(-62, 0); c.lineTo(-72, -214); c.lineTo(72, -214); c.lineTo(62, 0); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.13)'; for (let i = -2; i <= 2; i++) c.fillRect(i * 26 - 3, -200, 6, 190);
  fr(c, tone(col, -0.2), -70, -150, 140, 7); fr(c, tone(col, -0.2), -66, -70, 132, 7);
  rr(c, tone(col, 0.1), -82, -236, 164, 26, 10); rr(c, tone(col, -0.15), -22, -252, 44, 18, 8);
  c.restore();
}
function dumpster(c, S) {
  const { x, y, w, h } = ALLEY.dumpster, rust = ss(0.15, 0.75, S.A.grime), col = mix(ag('#3f7a5a', S, 1.2), '#7a4a30', rust * 0.75);
  shadow(c, x + w / 2, y + 4, w * 0.56, 16, 0.35);
  disc(c, '#1c1e24', x + 60, y - 14, 18); disc(c, '#1c1e24', x + w - 60, y - 14, 18);
  c.fillStyle = lin(c, 0, y - h, 0, y - 24, [[0, tone(col, 0.14)], [1, tone(col, -0.25)]]); c.beginPath(); c.moveTo(x, y - h + 40); c.lineTo(x + w, y - h + 40); c.lineTo(x + w - 26, y - 24); c.lineTo(x + 26, y - 24); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.14)'; for (let i = 1; i < 5; i++) c.fillRect(x + (w * i) / 5 - 6, y - h + 60, 12, h - 100);
  fr(c, tone(col, 0.12), x - 10, y - h + 30, w + 20, 22);
  quad(c, mix('#2a2f36', '#5e3a26', rust * 0.6), [[x - 6, y - h + 30], [x + w * 0.5, y - h + 30], [x + w * 0.5, y - h + 6], [x + 6, y - h - 4]]);
  quad(c, mix('#343a42', '#5e3a26', rust * 0.6), [[x + w * 0.5, y - h + 30], [x + w + 6, y - h + 30], [x + w - 10, y - h - 70], [x + w * 0.5 + 10, y - h - 30]]);
  fr(c, '#15171c', x + w * 0.5, y - h + 12, w * 0.5 - 6, 20);
  rr(c, tone(col, -0.3), x + 30, y - h + 110, 70, 16, 6); rr(c, tone(col, -0.3), x + w - 100, y - h + 110, 70, 16, 6);
  if (S.A.grime < 0.6) fr(c, alpha('#f2e9c8', 0.7 * (1 - S.A.grime)), x + w * 0.5 - 60, y - h + 150, 120, 60);
}
const ALITTER = (() => { const r = RNG(808), a = []; for (let i = 0; i < 26; i++) a.push({ x: r.range(-300, 2300), y: r.chance(0.5) ? r.range(856, 876) : r.range(930, 1040), k: r.int(0, 3), rot: r.range(-0.5, 0.5), th: r.range(0, 0.85), s: r.range(0.9, 1.4), h: r() }); return a; })();
const APUD = [[330, 960, 190, 0.14], [980, 1010, 240, 0.13], [1500, 930, 150, 0.15], [1900, 990, 200, 0.12], [-150, 1030, 220, 0.12]];
const alleyOn = (a, S) => (a[2] < 0.55 ? S.lit : 0);
export function alleySet(g, t, o = {}) {
  const S = mkState(g, t, { litter: undefined, ...o, wet: o.wet ?? 0.5 }), { A, look, v } = S, rust = ss(0.2, 0.8, A.grime), tk = A.trees, wk = A.weeds;
  S.glass = mix(mix(mix('#3f5f86', S.skyC, 0.3), '#0e1426', S.dark * 0.75), '#8d8f86', A.grime * 0.45);
  const wrecks = o.wrecks ?? S.years >= 30, pipe = mix('#5d6a70', '#7a4a30', rust * 0.8);
  drawSky(g, look, { clouds: o.clouds });
  if (v.x1 > 1600 && v.x0 < 2020) skyline(g, S);
  g.layer(1, (c) => {
    // far end seen through the fence
    const wb = ag(AW[1].col, S), wc = ag(AW[2].col, S);
    quad(c, mix(mix('#6a6770', '#587a44', ss(0.45, 1.05, tk) * 0.8), S.hazeC, 0.3), [[1620, 850], [2000, 850], [1880, 770], [1740, 770]]);
    quad(c, tone(wb, -0.38), [[1620, -1700], [1740, -1700], [1740, 770], [1620, 852]]);
    quad(c, tone(wc, -0.2), [[2000, -1700], [1880, -1700], [1880, 770], [2000, 852]]);
    if (tk > 0.3) tree(c, 1810, 772, { h: 900 * ss(0.3, 1, tk), seed: 5, t: S.t, shadow: 0 });
    // walls
    for (const w of AW) {
      if (w.x > v.x1 || w.x + w.w < v.x0) continue;
      const col = ag(w.col, S), [ta, tb] = brickTex(w.x, -1700, w.w, 2550, w.seed);
      c.fillStyle = lin(c, 0, -600, 0, 850, [[0, tone(col, 0.06)], [0.7, col], [1, tone(col, -0.22)]]); c.fillRect(w.x, -1700, w.w, 2550);
      c.fillStyle = 'rgba(40,14,10,0.2)'; c.fill(ta); c.fillStyle = 'rgba(255,230,210,0.1)'; c.fill(tb);
      fr(c, 'rgba(0,0,0,0.16)', w.x + w.w - 16, -1700, 16, 2550); fr(c, tone(col, -0.3), w.x, 800, w.w, 50); fr(c, 'rgba(255,255,255,0.08)', w.x, 800, w.w, 5);
    }
    for (const a of AWIN) {
      const [x, y] = a, on = alleyOn(a, S), k = ss(a[2], a[2] + 0.08, A.broken);
      fr(c, ag('#d9d2c4', S), x - 12, y - 12, 204, 244); fr(c, S.glass, x, y, 180, 220);
      if (on > 0.01) fr(c, alpha('#ffd48a', on), x, y, 180, 220);
      if (k > 0) { const p = new Path2D(); addHole(p, x + 90, y + 110, 90, 110, k); c.fillStyle = '#131824'; c.fill(p); }
      c.fillStyle = mix('#2c3440', '#7a4a30', rust); for (let i = 1; i < 5; i++) c.fillRect(x + i * 36 - 3, y, 6, 220);
      fr(c, ag('#e3dccd', S), x - 20, y + 228, 220, 16);
    }
    // pipes, meter boxes, vent
    c.strokeStyle = pipe; c.lineCap = 'butt'; c.lineWidth = 24; c.beginPath(); c.moveTo(120, -1700); c.lineTo(120, 790); c.quadraticCurveTo(120, 836, 160, 842); c.moveTo(2090, -1700); c.lineTo(2090, 836); c.stroke();
    c.lineWidth = 10; c.beginPath(); c.moveTo(-900, 250); c.lineTo(640, 250); c.moveTo(560, 250); c.lineTo(560, 640); c.stroke();
    c.fillStyle = tone(pipe, -0.25); for (let y = -1400; y < 800; y += 330) { c.fillRect(102, y, 36, 12); c.fillRect(2072, y, 36, 12); }
    for (let x = -700; x < 640; x += 260) c.fillRect(x, 242, 14, 16);
    rr(c, mix('#9aa3aa', '#7a5a44', rust * 0.7), -150, 420, 110, 150, 8); rr(c, mix('#8a949c', '#7a5a44', rust * 0.7), -20, 450, 90, 120, 8); disc(c, '#2c3440', -95, 480, 22); disc(c, '#cfd6d8', -95, 480, 16);
    rr(c, mix('#a7b0b6', '#7a5a44', rust * 0.7), 1250, 130, 200, 140, 10); c.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 6; i++) c.fillRect(1266, 146 + i * 20, 168, 9);
    fr(c, 'rgba(0,0,0,0.2)', 1262, 270, 190, 10);
    // back door + lamp
    const D = ALLEY.door, dc = mix(ag('#5f7a72', S, 1.2), '#7a4a30', rust * 0.6), ajar = ss(0.4, 0.75, A.broken);
    fr(c, ag('#cfc7b8', S), D.x - 26, D.y - 30, D.w + 52, D.h + 30); fr(c, '#141114', D.x, D.y, D.w, D.h);
    c.fillStyle = lin(c, 0, D.y, 0, D.y + D.h, [[0, tone(dc, 0.1)], [1, tone(dc, -0.25)]]); c.fillRect(D.x, D.y, D.w - 90 * ajar, D.h);
    fr(c, tone(dc, -0.18), D.x + 24, D.y + 30, (D.w - 90 * ajar) - 48, 180); fr(c, tone(dc, -0.18), D.x + 24, D.y + 250, (D.w - 90 * ajar) - 48, 270);
    rr(c, '#c9ced6', D.x + D.w - 90 * ajar - 44, D.y + 290, 16, 60, 6); fr(c, tone(dc, -0.4), D.x, D.y + D.h - 34, D.w - 90 * ajar, 34);
    if (rust > 0.05) { c.fillStyle = alpha('#6f3a1c', rust * 0.5); c.fillRect(D.x + 40, D.y, 14, 210); c.fillRect(D.x + 150, D.y, 10, 320); }
    fr(c, ag('#b8b0a2', S), D.x - 40, 850, D.w + 80, 14);
    c.strokeStyle = pipe; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(885, 120); c.quadraticCurveTo(885, 160, 885, 176); c.stroke();
    quad(c, mix('#2f5d4f', '#6b4630', rust), [[845, 206], [868, 172], [902, 172], [925, 206]]); rr(c, mix(mix('#cfd6d8', '#8d8a80', A.grime), '#fff0c0', S.lit), 868, 204, 34, 16, 7);
    // ground
    const gr = mix(mix('#4f4c56', '#5d5a56', A.grime * 0.6), '#526e42', ss(0.45, 1.05, tk) * 0.85);
    c.fillStyle = lin(c, 0, 850, 0, 1300, [[0, tone(gr, -0.16)], [0.12, gr], [1, tone(gr, -0.3)]]); c.fillRect(v.x0 - 40, 850, v.x1 - v.x0 + 80, 1200);
    quad(c, tone(gr, -0.16), [[1620, 850], [2000, 850], [2000, 858], [1620, 858]]);
    c.fillStyle = 'rgba(255,255,255,0.045)'; for (let i = 0; i < 40; i++) c.fillRect(-400 + i * 72 + (hash(i, 5) * 30), 880 + hash(i, 6) * 200, 54, 26);
    fr(c, 'rgba(0,0,0,0.2)', v.x0 - 40, 978, v.x1 - v.x0 + 80, 7);
    const sk = look.sky[2][1];
    for (const [px, py, pr, pk] of APUD) { c.fillStyle = alpha(mix(sk, '#101828', 0.35), 0.3 + 0.6 * S.wet); c.beginPath(); c.ellipse(px, py, pr, pr * pk, 0, 0, TAU); c.fill(); c.fillStyle = alpha('#ffffff', 0.08 + 0.2 * S.wet); c.beginPath(); c.ellipse(px - pr * 0.25, py - pr * pk * 0.3, pr * 0.45, pr * pk * 0.25, 0, 0, TAU); c.fill(); }
    // fence
    const fcol = mix('#7d868c', '#7a4a30', rust * 0.8), fall = ss(0.3, 0.8, A.collapse + A.broken * 0.3);
    c.save(); c.globalAlpha = 1 - fall * 0.7; c.strokeStyle = alpha(fcol, 0.8); c.lineWidth = 3; c.stroke(meshGeom());
    c.strokeStyle = fcol; c.lineWidth = 5; c.beginPath(); c.ellipse(1750, 800, 78, 86, 0, Math.PI * 0.95, Math.PI * 2.05); c.stroke(); c.restore();
    fr(c, fcol, 1614, 380, 14, 472); fr(c, fcol, 1803, 394, 12, 320); fr(c, fcol, 1992, 380, 14, 472); fr(c, fcol, 1620, 394, 380, 10);
    // growth on the walls, boxes, dumpster, bins
    ivyOn(c, -900, 850, 1540, 2200, A.vines, 21, S.t, 2.6); ivyOn(c, 640, 850, 980, 2200, A.vines * 0.92, 22, S.t, 2.6); ivyOn(c, 2000, 850, 900, 2200, A.vines, 23, S.t, 2.6);
    const cb = ag('#b98a56', S, 1.4); fr(c, cb, -30, 760, 150, 106); fr(c, tone(cb, -0.15), -30, 760, 150, 12); fr(c, tone(cb, 0.08), 0, 690, 110, 70); fr(c, 'rgba(0,0,0,0.18)', 40, 690, 10, 70);
    dumpster(c, S);
    ALLEY.staticBins.forEach((b, i) => bin(c, b.x, b.y, S, i ? ss(0.2, 0.5, A.broken) * 1.45 : 0));
    if (wk > 0.01) grassRow(c, S, 852, { h: 10 + 50 * wk, density: 0.02 + 0.2 * wk }, 700);
    if (tk > 0.05) { bush(c, 640, 856, { w: 320 * ss(0.1, 0.6, tk), h: 180 * ss(0.1, 0.6, tk), seed: 3, t: S.t }); const h = treeH(1500, 0.2, tk); if (h > 30) tree(c, 2130, 862, { h, seed: 9, t: S.t }); const h2 = treeH(1300, 0.35, tk); if (h2 > 30) tree(c, -420, 864, { h: h2, kind: 'birch', seed: 4, t: S.t }); }
    if (wrecks) drawCar(c, { ...ALLEY.wrecks[0], kind: 'sedan', color: '#5a6fb8', years: S.years, flip: -1, t: S.t, dark: S.dark, seed: 61 });
    litterItems(c, S, ALITTER, true);
    if (o.actors) o.actors(c);
    litterItems(c, S, ALITTER, false);
    if (wk > 0.05) grassRow(c, S, 960, { h: 10 + 40 * wk, density: 0.004 + 0.07 * wk, yVar: 40 }, 800);
    if (o.front) o.front(c);
    if (wrecks) drawCar(c, { ...ALLEY.wrecks[1], kind: 'hatch', color: '#c94a3f', years: S.years, flip: 1, rot: -0.03, t: S.t, dark: S.dark, seed: 67 });
    if (wk > 0.05) grassRow(c, S, 1090, { h: 14 + 60 * wk, density: 0.004 + 0.09 * wk, yVar: 40 }, 900);
  });
}
export function alleyLight(g, t, o = {}) {
  const S = mkState(g, t, o), D = ss(0.15, 0.55, S.dark) * (S.power ? 1 : 0);
  if (D <= 0.01) return;
  const k = D * (0.86 + 0.14 * noise1(S.t * 7, 3)), L = ALLEY.lamp;
  g.layer(1, (c) => {
    c.save(); c.globalCompositeOperation = 'screen';
    c.globalAlpha = 0.2 * k; c.fillStyle = lin(c, 0, L.y, 0, 900, [[0, 'rgba(255,214,150,1)'], [1, 'rgba(255,214,150,0.1)']]);
    c.beginPath(); c.moveTo(L.x - 30, L.y + 8); c.lineTo(L.x + 30, L.y + 8); c.lineTo(L.x + 420, 900); c.lineTo(L.x - 420, 900); c.closePath(); c.fill(); c.globalAlpha = 1;
    glow(c, L.x, L.y + 10, 520, '#ffcf8a', 0.75 * k); glow(c, L.x, L.y + 10, 80, '#fff4d8', k); shadow(c, L.x, 900, 430, 80, 0.4 * k, '#ffcf8a');
    for (const a of AWIN) { const on = alleyOn(a, S) * D; if (on > 0.01) { c.globalAlpha = 0.7 * on; c.fillStyle = '#ffd48a'; c.fillRect(a[0], a[1], 180, 220); c.globalAlpha = 1; glow(c, a[0] + 90, a[1] + 110, 280, '#ffb65c', 0.25 * on); } }
    c.restore();
  });
}
