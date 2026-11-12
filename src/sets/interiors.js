// Secondary interior sets. Every set is nameSet(g, t, o): the shot calls g.camera(...) first, the set draws its layers,
// calls o.actors(c) on the main plane (depth 1), then its own in-front parts, then o.front(c), then its foreground.
// Sets never grade: call g.grade(look) afterwards, then the matching *Light(g, t, o) for emissive light.
// Common options: years (decay via aging()), look (a LOOKS entry, default day), power (boolean), actors(c), front(c).
// All anchors are world coordinates on depth 1. Unknown / missing options fall back to defaults.
//
// petRoomSet(g, t, o)   child's room, side-on. Extra options: hutchDoor 0..1 (mesh door swings open towards camera,
//     hinged on its right), latch 0..1 (0 = bolt home in the keeper, ~0.5 = barely holding, 1 = fully drawn back),
//     wheel (hamster-wheel rotation, radians). Enclosure backs are drawn before actors, mesh / bars / wire after.
//   petRoomLight(g, t, {look, a})   sunbeam (day) or moon shaft (night) from the window across the enclosures + dust.
//   PETROOM = { s: 2 (character scale the room is built for), floorY, window {x,y,w,h},
//     hutch {x,y} rabbit floor point (face it left: flip -1), hutchDoor {x,y,w,h}, latch {x,y} bolt centre,
//     girlStand {x,y} floor point left of the hutch (face right), hamster {x,y} cage floor, wheel {x,y,r} centre and
//     inner radius (running hamster stands at x, y + r), bars {x,y,barX} hamster 'grip' spot at s = 2, flip 1 (the end
//     bar is at barX), gpig {x,y}, dish {x,y}, hay {x,y},
//     cams { wide, hutch, girl, latch, hamster, wheel, gpig, panFrom, panTo } each [x, y, zoom] for g.camera(...) }
//
// hallwaySet(g, t, o)   apartment corridor, one-point perspective, all on depth 1 (dolly = zoom towards HALL.vanish).
//     Extra options: flicker 0..1 (ceiling lights fluttering / failing); power false = lights dead.
//   hallwayLight(g, t, {look, power, flicker, a})   lamp glows, floor pools, end-window glow (same flicker pattern).
//   hallLights(t, {power, flicker}) -> brightness 0..1 of the four ceiling lamps.
//   HALL = { vanish {x,y}, doors [{x, y, side (-1 left wall, 1 right wall), n (door number), u (metres away)}] centre
//     of each door, lamps [{x,y,u}], at(u, xm = 0) -> {x, y, s} floor point u metres from the camera, xm metres right
//     of the centre line, with the character scale s for that depth (u 4..15), cams { wide, deep } }
//
// stairwellSet(g, t, o)   concrete stairwell, side-on (meant for ~5 years). The upper flight comes down from the upper
//     floor (left) to the half landing (right, under the tall window); the lower flight goes from the landing down
//     to the ground floor (left). Rails are drawn in front of the actors.
//   stairwellLight(g, t, {look, years, a})   shafts through the broken panes + dust.
//   stairY(x, flight = 'upper' | 'lower') -> y of the tread under x (stepped), for moving a cat step by step.
//   STAIRS = { landing {x, y, x0, x1}, upper {x0,y0,x1,y1} and lower {x0,y0,x1,y1} nosing lines from top to bottom,
//     upperFloor {x0,x1,y}, ground {x0,x1,y}, window {x,y,w,h}, step {tread, riser, n}, cams { wide, upper, landing } }
//
// ruinFloorsSet(g, t, o)   gutted upper storey in cross-section, open to the sky and the green city (meant for ~20
//     years). Draws the sky itself (option clouds: false to skip clouds). Left slab, a 420 px gap, right slab.
//   RUINFLOORS = { floorY (left slab top), rightY, leftEdge {x,y} take-off lip, rightEdge {x,y} landing lip,
//     run {x0, x1} clear run-up on the left slab, runOut {x0, x1} on the right slab, gap, cams { wide, leap, drop } }
import { Path2D } from '@napi-rs/canvas';
import { TAU, clamp, lerp, mix, alpha, RNG, hash, noise1 } from '../engine/util.js';
import { lin, rad, glow, shadow, rrect, poly, txt } from '../engine/draw.js';
import { LOOKS, drawSky } from '../engine/sky.js';
import { LEAF, grass, tree, bush, ivy, vines, moss, litter, aging } from '../env/nature.js';
import { lightShaft, dust } from '../env/fx.js';

const fnOf = (f) => (typeof f === 'function' ? f : null);
const num = (v, d) => (v == null || !Number.isFinite(+v) ? d : +v);
const lookOf = (o) => (o && o.look && Array.isArray(o.look.sky) ? o.look : LOOKS.day);
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const Q = (c, pts, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fill(); };
const S = (c, path, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.stroke(path); };
const skyFill = (c, look, y0, y1) => lin(c, 0, y0, 0, y1, [[0, look.sky[0][1]], [0.6, look.sky[1][1]], [1, look.sky[2][1]]]);
// Polygon with a lumpy top edge (bedding, straw, rubble).
function bumpy(x0, x1, y, amp, step, seed, yb) {
  const p = new Path2D(); p.moveTo(x0, yb); p.lineTo(x0, y);
  for (let x = x0, i = 0; x < x1; x += step, i++) { const nx = Math.min(x1, x + step); p.quadraticCurveTo((x + nx) / 2, y - amp * (0.4 + hash(i, seed)), nx, y + amp * 0.3 * (hash(i, seed + 5) - 0.5)); }
  p.lineTo(x1, yb); p.closePath(); return p;
}
const WOOD = ['#d7a468', '#b47a45', '#8a5630'], STEEL = ['#eef1f4', '#aab4be', '#5b6570'];

// ───────────────────────────────────────────── pet room ─────────────────────────────────────────────
export const PETROOM = {
  s: 2, floorY: 940, window: { x: 60, y: 130, w: 360, h: 420 },
  hutch: { x: 640, y: 816 }, hutchDoor: { x: 516, y: 524, w: 230, h: 296 }, latch: { x: 530, y: 623 },
  girlStand: { x: 370, y: 940 },
  hamster: { x: 1300, y: 600 }, wheel: { x: 1160, y: 530, r: 68 }, bars: { x: 1384.8, y: 600, barX: 1410 },
  gpig: { x: 1760, y: 898 }, dish: { x: 1905, y: 898 }, hay: { x: 1630, y: 898 },
  cams: {
    wide: [1050, 590, 0.86], hutch: [700, 660, 1.9], girl: [600, 640, 1.45], latch: [540, 640, 5],
    hamster: [1250, 505, 2.7], wheel: [1160, 525, 3.4], gpig: [1800, 800, 2.1], panFrom: [720, 650, 1.6], panTo: [1780, 720, 1.6],
  },
};
const FLAGS = ['#ef6f6c', '#f7c35f', '#6fb7c9', '#9bd08a', '#f29ac0'];
let PRC = null;
function prCache() {
  if (PRC) return PRC;
  const stars = new Path2D(), planks = new Path2D(), bars = new Path2D(), backBars = new Path2D(), pen = new Path2D(), penBack = new Path2D();
  for (let y = -300, row = 0; y < 760; y += 86, row++) for (let x = -700 + (row % 2) * 62; x < 2900; x += 124) {
    const s = 5 + hash(x + y * 3.1, 2) * 3.5;
    stars.moveTo(x, y - s); stars.lineTo(x + s * 0.28, y - s * 0.28); stars.lineTo(x + s, y); stars.lineTo(x + s * 0.28, y + s * 0.28);
    stars.lineTo(x, y + s); stars.lineTo(x - s * 0.28, y + s * 0.28); stars.lineTo(x - s, y); stars.lineTo(x - s * 0.28, y - s * 0.28); stars.closePath();
  }
  const ys = [800, 826, 858, 898, 946, 1004, 1074, 1160];
  for (let i = 1; i < ys.length; i++) {
    planks.moveTo(-700, ys[i]); planks.lineTo(2900, ys[i]);
    for (let x = -700 + hash(i, 4) * 300; x < 2900; x += 330 + hash(x, i) * 200) { planks.moveTo(x, ys[i - 1]); planks.lineTo(x, ys[i]); }
  }
  for (let x = 1090; x < 1405; x += 20) { bars.moveTo(x, 386); bars.lineTo(x, 598); backBars.moveTo(x + 10, 386); backBars.lineTo(x + 10, 598); }
  bars.moveTo(1070, 470); bars.lineTo(1410, 470);
  for (let x = 1565; x < 2030; x += 25) { pen.moveTo(x, 792); pen.lineTo(x, 896); penBack.moveTo(x + 12, 800); penBack.lineTo(x + 12, 896); }
  for (let y = 818; y < 890; y += 26) { pen.moveTo(1540, y); pen.lineTo(2040, y); }
  const flags = FLAGS.map(() => new Path2D()), string = new Path2D();
  const gy = (x) => 24 + 46 * Math.sin((((x + 700) % 560) / 560) * Math.PI);
  for (let x = -700; x <= 2900; x += 20) (x === -700 ? string.moveTo(x, gy(x)) : string.lineTo(x, gy(x)));
  for (let x = -660, i = 0; x < 2900; x += 80, i++) { const p = flags[i % 5], y = gy(x); p.moveTo(x - 27, gy(x - 27)); p.lineTo(x + 27, gy(x + 27)); p.lineTo(x + 2, y + 56); p.closePath(); }
  const r = RNG(31), hay = [new Path2D(), new Path2D()], straw = new Path2D();
  for (let i = 0; i < 90; i++) { const x = 1632 + (r() + r() - 1) * 70, h = 58 * (1 - Math.abs(x - 1632) / 78), y = 898 - r() * Math.max(4, h), a = r.range(-1.3, 1.3), l = r.range(14, 30), p = hay[i % 2]; p.moveTo(x - Math.cos(a) * l, y + Math.sin(a) * l * 0.5); p.lineTo(x + Math.cos(a) * l, y - Math.sin(a) * l * 0.5); }
  for (let i = 0; i < 46; i++) { const x = r.range(522, 740), y = r.range(806, 818), a = r.range(-0.5, 0.5), l = r.range(10, 24); straw.moveTo(x - l, y + a * 6); straw.lineTo(x + l, y - a * 6); }
  PRC = {
    stars, planks, bars, backBars, pen, penBack, flags, string, hay, straw,
    cageBed: bumpy(1066, 1414, 600, 6, 22, 3, 614), penBed: bumpy(1540, 2040, 898, 5, 26, 8, 910), hutchBed: bumpy(516, 746, 814, 7, 24, 5, 822),
  };
  return PRC;
}

function prRoom(c, look, t) {
  const K = prCache(), W0 = PETROOM.window;
  c.fillStyle = lin(c, 0, -200, 0, 800, [[0, '#cfe6de'], [1, '#aed3cb']]); c.fillRect(-700, -500, 3600, 1300);
  c.fillStyle = alpha('#ffffff', 0.42); c.fill(K.stars);
  // bookcase left of the window, bed on the far right
  c.fillStyle = lin(c, -430, 0, -20, 0, [[0, WOOD[1]], [1, WOOD[0]]]); c.fillRect(-430, 110, 410, 720);
  for (let i = 0; i < 4; i++) { R(c, -410, 132 + i * 172, 370, 150, '#6f4a30'); const rr = RNG(i + 3); for (let x = -404; x < -80;) { const w = rr.range(18, 34), h = rr.range(84, 138); R(c, x, 282 + i * 172 - h, w, h, rr.pick(['#ef6f6c', '#f7c35f', '#6fb7c9', '#9bd08a', '#f3ead8', '#c58cf0', '#f08a24'])); x += w + 2; } }
  R(c, 2120, 640, 800, 220, WOOD[1]); c.fillStyle = '#f6efe2'; c.fill(rrect(2110, 600, 820, 90, 30));
  c.fillStyle = lin(c, 0, 620, 0, 880, [[0, '#f29a86'], [1, '#d9705f']]); c.fill(rrect(2230, 612, 700, 250, 36));
  c.fillStyle = '#fdf8ee'; c.fill(rrect(2124, 560, 150, 74, 30));
  // window: sky, far trees, sun or moon, frame, curtains
  c.fillStyle = skyFill(c, look, W0.y, W0.y + W0.h * 1.25); c.fillRect(W0.x, W0.y, W0.w, W0.h);
  c.save(); c.beginPath(); c.rect(W0.x, W0.y, W0.w, W0.h); c.clip();
  if (look.moon) { glow(c, 300, 236, 110, look.moon.g || '#bcd0ff', 0.6 * (look.moon.a ?? 1)); c.fillStyle = look.moon.c || '#f4f1e4'; c.globalAlpha = look.moon.a ?? 1; c.beginPath(); c.arc(300, 236, 30, 0, TAU); c.fill(); c.globalAlpha = 1; }
  if (look.sun) glow(c, 330, 180, 240, look.sun.g || '#fff1b8', 0.8 * (look.sun.a ?? 1));
  c.fillStyle = mix('#8fb7c9', look.haze, 0.5); c.fillRect(70, 440, 120, 120); c.fillRect(300, 400, 140, 160);
  c.fillStyle = mix(LEAF.mid, look.haze, 0.25); for (const [x, y, r] of [[120, 520, 70], [215, 500, 80], [320, 535, 66], [400, 505, 60]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  c.fillStyle = mix(LEAF.light, look.haze, 0.25); for (const [x, y, r] of [[200, 470, 44], [330, 505, 36], [105, 492, 34]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  c.restore();
  c.strokeStyle = '#fdf8ee'; c.lineWidth = 16; c.strokeRect(W0.x, W0.y, W0.w, W0.h);
  R(c, W0.x + W0.w / 2 - 5, W0.y, 10, W0.h, '#fdf8ee'); R(c, W0.x, W0.y + 150, W0.w, 9, '#fdf8ee'); R(c, W0.x - 26, W0.y + W0.h, W0.w + 52, 20, '#fdf8ee'); R(c, W0.x - 26, W0.y + W0.h + 20, W0.w + 52, 6, '#c9d8cf');
  R(c, 0, 92, 480, 9, WOOD[2]);
  for (const [x0, dir] of [[18, 1], [462, -1]]) {
    const sw = Math.sin(t * 0.7 + x0) * 4;
    c.fillStyle = lin(c, x0, 0, x0 + 92 * dir, 0, [[0, '#f2b84a'], [0.5, '#f9d27a'], [1, '#eaa93c']]);
    c.beginPath(); c.moveTo(x0, 98); c.lineTo(x0 + 96 * dir, 98); c.quadraticCurveTo(x0 + (84 + sw) * dir, 330, x0 + 40 * dir, 420); c.quadraticCurveTo(x0 + (70 + sw) * dir, 520, x0 + 84 * dir, 610); c.lineTo(x0, 610); c.closePath(); c.fill();
    c.strokeStyle = alpha('#c98a2a', 0.5); c.lineWidth = 3; c.beginPath(); for (const k of [30, 58]) { c.moveTo(x0 + k * dir, 104); c.quadraticCurveTo(x0 + (k - 4) * dir, 300, x0 + k * 0.5 * dir, 418); } c.stroke();
    R(c, x0 + (dir > 0 ? 0 : -46), 412, 46, 12, '#ef6f6c');
  }
  // bunting, picture, shelf
  S(c, K.string, '#f3ead8', 3); K.flags.forEach((p, i) => { c.fillStyle = FLAGS[i]; c.fill(p); });
  c.fillStyle = '#f08a6a'; c.fill(rrect(596, 236, 206, 152, 8)); R(c, 610, 250, 178, 124, '#fdf6e6');
  c.fillStyle = '#f7c35f'; c.beginPath(); c.arc(752, 284, 17, 0, TAU); c.fill();
  c.fillStyle = '#9bd08a'; c.fillRect(610, 346, 178, 28);
  c.fillStyle = '#d9913f'; c.beginPath(); c.ellipse(672, 330, 34, 19, 0, 0, TAU); c.arc(706, 308, 15, 0, TAU); c.fill(); R(c, 648, 340, 8, 22, '#d9913f'); R(c, 688, 340, 8, 22, '#d9913f');
  R(c, 1060, 262, 380, 14, WOOD[0]); R(c, 1060, 276, 380, 5, WOOD[2]); R(c, 1090, 276, 12, 34, WOOD[1]); R(c, 1398, 276, 12, 34, WOOD[1]);
  { const rr = RNG(12); for (let x = 1076; x < 1250;) { const w = rr.range(18, 30), h = rr.range(70, 112); R(c, x, 262 - h, w, h, rr.pick(['#ef6f6c', '#6fb7c9', '#f7c35f', '#f3ead8', '#9bd08a', '#c58cf0'])); x += w + 2; } }
  c.fillStyle = '#e07a4f'; c.fill(poly([[1356, 262], [1420, 262], [1412, 212], [1364, 212]]));
  c.fillStyle = LEAF.mid; for (const a of [-0.7, -0.15, 0.4, 0.9]) { c.beginPath(); c.ellipse(1388 + Math.sin(a) * 34, 212 - Math.cos(a) * 36, 13, 34, a, 0, TAU); c.fill(); }
  c.fillStyle = '#ef6f6c'; c.beginPath(); c.arc(1300, 236, 26, 0, TAU); c.fill(); c.fillStyle = '#fdf6e6'; c.beginPath(); c.ellipse(1300, 236, 26, 9, 0.4, 0, TAU); c.fill();
  // skirting, floor, rug, toys
  R(c, -700, 772, 3600, 28, '#fbf5e8'); R(c, -700, 794, 3600, 6, '#cfdacb');
  c.fillStyle = lin(c, 0, 800, 0, 1200, [[0, '#cf9a63'], [1, '#9c6840']]); c.fillRect(-700, 800, 3600, 600);
  S(c, K.planks, alpha('#6b4426', 0.22), 2);
  c.fillStyle = '#f6ead0'; c.beginPath(); c.ellipse(1240, 962, 980, 104, 0, 0, TAU); c.fill();
  c.fillStyle = '#f0cf86'; c.beginPath(); c.ellipse(1240, 962, 940, 92, 0, 0, TAU); c.fill();
  c.strokeStyle = '#f6ead0'; c.lineWidth = 7; c.beginPath(); c.ellipse(1240, 962, 800, 66, 0, 0, TAU); c.stroke();
  shadow(c, 1492, 946, 40, 9, 0.25); c.fillStyle = rad(c, 1484, 908, 40, [[0, '#ff9a8a'], [1, '#d9504a']]); c.beginPath(); c.arc(1492, 918, 28, 0, TAU); c.fill();
  c.fillStyle = '#fdf6e6'; c.beginPath(); c.ellipse(1492, 918, 28, 8, -0.3, 0, TAU); c.fill();
  shadow(c, 2096, 944, 60, 9, 0.25); R(c, 2060, 900, 40, 40, '#6fb7c9'); R(c, 2104, 900, 40, 40, '#f7c35f'); R(c, 2082, 860, 40, 40, '#ef6f6c');
}

function prHutchBack(c) {
  const K = prCache();
  shadow(c, 722, 946, 300, 22, 0.3);
  R(c, 530, 842, 22, 86, WOOD[2]); R(c, 896, 842, 22, 86, WOOD[2]); R(c, 498, 842, 26, 98, WOOD[1]); R(c, 922, 842, 26, 98, WOOD[1]);
  c.fillStyle = lin(c, 0, 500, 0, 842, [[0, WOOD[0]], [1, WOOD[1]]]); c.fillRect(484, 500, 476, 342);
  c.strokeStyle = alpha(WOOD[2], 0.45); c.lineWidth = 2; c.beginPath(); for (let y = 556; y < 820; y += 52) { c.moveTo(764, y); c.lineTo(958, y); } c.stroke();
  c.fillStyle = lin(c, 0, 524, 0, 820, [[0, '#4a2f1e'], [1, '#6a452c']]); c.fillRect(516, 524, 230, 296);
  c.strokeStyle = alpha('#2e1a0e', 0.4); c.beginPath(); for (let x = 574; x < 740; x += 57) { c.moveTo(x, 524); c.lineTo(x, 812); } c.stroke();
  c.fillStyle = '#e8c868'; c.fill(K.hutchBed); S(c, K.straw, '#c9a23c', 2);
  c.fillStyle = '#3a2416'; c.beginPath(); c.moveTo(812, 820); c.lineTo(812, 720); c.arc(860, 720, 48, Math.PI, 0); c.lineTo(908, 820); c.closePath(); c.fill();
  c.fillStyle = '#e8c868'; c.fill(bumpyOnce('hole', 812, 908, 812, 5, 20, 9, 820));
  R(c, 484, 820, 476, 22, WOOD[1]); R(c, 484, 820, 476, 3, alpha('#f3d9a8', 0.6));
  c.fillStyle = lin(c, 0, 462, 0, 504, [[0, '#8f5d3c'], [1, '#6b4128']]); c.fill(rrect(458, 464, 528, 40, 6)); R(c, 462, 464, 520, 4, alpha('#f3d9a8', 0.55));
}
const onceCache = new Map();
function bumpyOnce(key, ...a) { let p = onceCache.get(key); if (!p) { p = bumpy(...a); onceCache.set(key, p); } return p; }

// Door mapping: hinge on the right edge (x = 746); the free edge swings towards the camera (narrower, lower).
function prHutchFront(c, door, latch) {
  const th = door * 1.45, cs = Math.cos(th), sn = Math.sin(th);
  const M = (x, y) => { const d = 746 - x; return [746 - d * cs, 380 + (y - 380) * (1 + 0.075 * sn * d / 230)]; };
  const q = (x0, y0, x1, y1) => [M(x0, y0), M(x1, y0), M(x1, y1), M(x0, y1)];
  // mesh
  const mesh = new Path2D();
  for (let x = 530; x <= 733; x += 16.9) { const a = M(x, 538), b = M(x, 806); mesh.moveTo(a[0], a[1]); mesh.lineTo(b[0], b[1]); }
  for (let y = 538; y <= 807; y += 16.75) { const a = M(530, y), b = M(732, y); mesh.moveTo(a[0], a[1]); mesh.lineTo(b[0], b[1]); }
  c.lineCap = 'butt'; S(c, mesh, alpha('#39424c', 0.5), 3); S(c, mesh, alpha('#e9edf0', 0.9), 1.3);
  // wooden door frame + mid rail
  const wood = lin(c, 0, 524, 0, 830, [[0, '#edc48a'], [1, '#c98f55']]);
  for (const [x0, y0, x1, y1] of [[516, 524, 746, 540], [516, 804, 746, 820], [516, 524, 532, 820], [730, 524, 746, 820], [516, 609, 746, 637]]) Q(c, q(x0, y0, x1, y1), wood);
  Q(c, q(516, 524, 746, 527), alpha('#fff1d2', 0.7)); Q(c, q(516, 609, 746, 612), alpha('#fff1d2', 0.6)); Q(c, q(516, 634, 746, 637), alpha('#8a5630', 0.5)); Q(c, q(516, 817, 746, 820), alpha('#8a5630', 0.5));
  // hinges on the centre post
  for (const y of [556, 782]) { c.fillStyle = STEEL[1]; c.fill(rrect(738, y, 26, 14, 3)); c.fillStyle = STEEL[2]; c.beginPath(); c.arc(757, y + 7, 2.2, 0, TAU); c.fill(); }
  // keeper on the left post
  c.fillStyle = lin(c, 0, 606, 0, 640, [[0, '#dfe4e8'], [1, '#929da8']]); c.fill(rrect(486, 607, 28, 32, 4));
  c.strokeStyle = STEEL[2]; c.lineWidth = 1; c.stroke(rrect(486, 607, 28, 32, 4));
  c.fillStyle = '#2b323c'; c.fill(rrect(489, 617, 24, 12, 5));
  // bolt, in door space (origin = 4 px inside the free edge, on the mid rail)
  const p0 = M(520, 623), px = M(620, 623), py = M(520, 723);
  c.save();
  c.transform((px[0] - p0[0]) / 100, (px[1] - p0[1]) / 100, (py[0] - p0[0]) / 100, (py[1] - p0[1]) / 100, p0[0], p0[1]);
  c.fillStyle = lin(c, 0, -15, 0, 15, [[0, '#d5dbe0'], [1, '#8d98a3']]); c.fill(rrect(2, -15, 96, 30, 4)); c.strokeStyle = STEEL[2]; c.lineWidth = 1; c.stroke(rrect(2, -15, 96, 30, 4));
  for (const [sx, sy] of [[33, -10.5], [33, 10.5], [66, -10.5], [66, 10.5]]) { c.fillStyle = '#6f7a85'; c.beginPath(); c.arc(sx, sy, 2.6, 0, TAU); c.fill(); c.strokeStyle = '#3d4650'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(sx - 1.8, sy - 1); c.lineTo(sx + 1.8, sy + 1); c.stroke(); }
  const tip = -27 + latch * 41;
  c.fillStyle = lin(c, 0, -6, 0, 6, [[0, '#fafbfc'], [0.45, '#c3cbd3'], [1, '#77828d']]); c.fill(rrect(tip, -5.5, 104, 11, 5.5));
  c.strokeStyle = alpha('#3d4650', 0.7); c.lineWidth = 0.8; c.stroke(rrect(tip, -5.5, 104, 11, 5.5));
  for (const gx of [11, 78]) { c.fillStyle = lin(c, 0, -12, 0, 12, [[0, '#f1f4f6'], [0.5, '#b7c0c9'], [1, '#7d8893']]); c.fill(rrect(gx, -11.5, 11, 23, 3)); c.strokeStyle = STEEL[2]; c.stroke(rrect(gx, -11.5, 11, 23, 3)); }
  R(c, tip + 53, -15, 6, 11, '#8d98a3');
  c.fillStyle = rad(c, tip + 54, -19, 9, [[0, '#ffffff'], [0.5, '#c3cbd3'], [1, '#6f7a85']]); c.beginPath(); c.arc(tip + 56, -17, 7, 0, TAU); c.fill();
  c.strokeStyle = alpha('#3d4650', 0.7); c.stroke();
  c.restore();
  // keeper strap over the bolt
  c.fillStyle = lin(c, 0, 608, 0, 638, [[0, '#f1f4f6'], [0.5, '#b7c0c9'], [1, '#7d8893']]); c.fill(rrect(493, 609, 9, 28, 3)); c.strokeStyle = STEEL[2]; c.lineWidth = 1; c.stroke(rrect(493, 609, 9, 28, 3));
  for (const y of [612, 634]) { c.fillStyle = '#6f7a85'; c.beginPath(); c.arc(508, y, 2.2, 0, TAU); c.fill(); }
}

function prCageBack(c, wheel) {
  const K = prCache(), Wh = PETROOM.wheel;
  // cabinet
  shadow(c, 1240, 946, 250, 20, 0.3);
  R(c, 1048, 924, 22, 16, WOOD[2]); R(c, 1410, 924, 22, 16, WOOD[2]);
  c.fillStyle = lin(c, 0, 660, 0, 930, [[0, '#fbf3e2'], [1, '#e6d5b8']]); c.fill(rrect(1030, 656, 420, 272, 8));
  c.strokeStyle = alpha('#b79f7c', 0.6); c.lineWidth = 2; c.stroke(rrect(1048, 686, 186, 224, 6)); c.stroke(rrect(1246, 686, 186, 224, 6));
  c.fillStyle = '#ef6f6c'; c.beginPath(); c.arc(1216, 798, 9, 0, TAU); c.fill(); c.fillStyle = '#6fb7c9'; c.beginPath(); c.arc(1264, 798, 9, 0, TAU); c.fill();
  R(c, 1018, 646, 444, 18, WOOD[0]); R(c, 1018, 646, 444, 3, alpha('#fff1d2', 0.7)); R(c, 1018, 661, 444, 3, alpha(WOOD[2], 0.6));
  // cage back, roof, tray
  R(c, 1070, 384, 340, 220, alpha('#ffffff', 0.2)); S(c, K.backBars, alpha('#7f8a95', 0.3), 1.5);
  c.strokeStyle = '#8fd6d2'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(1200, 366); c.quadraticCurveTo(1240, 326, 1280, 366); c.stroke();
  c.fillStyle = lin(c, 0, 362, 0, 388, [[0, '#63cfca'], [1, '#33a3a4']]); c.fill(rrect(1058, 362, 364, 26, 10));
  c.fillStyle = lin(c, 0, 598, 0, 660, [[0, '#56c8c4'], [1, '#2b9395']]); c.fill(rrect(1056, 598, 368, 60, 12)); R(c, 1064, 598, 352, 4, alpha('#d6fbf6', 0.7));
  // wooden house, bottle spout, wheel
  c.fillStyle = lin(c, 0, 548, 0, 600, [[0, '#e3b072'], [1, '#c4874a']]); c.fill(rrect(1262, 546, 86, 56, 6));
  c.fillStyle = '#b86d38'; c.fill(poly([[1250, 552], [1305, 516], [1360, 552]]));
  c.fillStyle = '#5a3a26'; c.beginPath(); c.moveTo(1290, 602); c.lineTo(1290, 580); c.arc(1305, 580, 15, Math.PI, 0); c.lineTo(1320, 602); c.closePath(); c.fill();
  c.strokeStyle = '#c3cbd3'; c.lineWidth = 5; c.beginPath(); c.moveTo(1252, 490); c.lineTo(1270, 538); c.stroke(); c.fillStyle = '#eef1f4'; c.beginPath(); c.arc(1271, 540, 3.6, 0, TAU); c.fill();
  c.strokeStyle = STEEL[1]; c.lineWidth = 8; c.beginPath(); c.moveTo(Wh.x, Wh.y); c.lineTo(Wh.x, 600); c.moveTo(Wh.x - 30, 600); c.lineTo(Wh.x + 30, 600); c.stroke();
  c.fillStyle = alpha('#ffe08a', 0.5); c.beginPath(); c.arc(Wh.x, Wh.y, 74, 0, TAU); c.fill();
  c.strokeStyle = '#f2a23a'; c.lineWidth = 8; c.beginPath(); c.arc(Wh.x, Wh.y, 72, 0, TAU); c.stroke();
  c.strokeStyle = '#c97a22'; c.lineWidth = 3; c.lineCap = 'butt'; c.beginPath();
  for (let i = 0; i < 22; i++) { const a = wheel + (i / 22) * TAU, co = Math.cos(a), si = Math.sin(a); c.moveTo(Wh.x + co * 68.5, Wh.y + si * 68.5); c.lineTo(Wh.x + co * 75.5, Wh.y + si * 75.5); }
  c.stroke();
  c.strokeStyle = '#f6b94f'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath();
  for (let i = 0; i < 3; i++) { const a = wheel + (i / 3) * TAU; c.moveTo(Wh.x, Wh.y); c.lineTo(Wh.x + Math.cos(a) * 66, Wh.y + Math.sin(a) * 66); }
  c.stroke();
  c.fillStyle = '#d98a2a'; c.beginPath(); c.arc(Wh.x, Wh.y, 10, 0, TAU); c.fill(); c.fillStyle = '#ffe08a'; c.beginPath(); c.arc(Wh.x - 2, Wh.y - 2, 4, 0, TAU); c.fill();
  // bedding, seeds, end bars
  c.fillStyle = '#f3e0b4'; c.fill(K.cageBed);
  c.fillStyle = '#d9bf88'; for (let i = 0; i < 26; i++) { c.beginPath(); c.ellipse(1074 + hash(i, 6) * 332, 603 + hash(i, 7) * 8, 5, 2, hash(i, 8) * 3, 0, TAU); c.fill(); }
  c.fillStyle = '#5a4a3a'; for (const x of [1236, 1352, 1366]) { c.beginPath(); c.ellipse(x, 598, 4.5, 2.4, 0.5, 0, TAU); c.fill(); }
  c.strokeStyle = STEEL[1]; c.lineWidth = 4; c.lineCap = 'butt'; c.beginPath(); c.moveTo(1070, 386); c.lineTo(1070, 600); c.moveTo(1410, 386); c.lineTo(1410, 600); c.stroke();
}
function prCageFront(c) {
  const K = prCache(), Wh = PETROOM.wheel;
  c.strokeStyle = alpha('#fff1c4', 0.85); c.lineWidth = 2.5; c.beginPath(); c.arc(Wh.x, Wh.y, 75, 0, TAU); c.stroke();
  c.lineCap = 'butt'; S(c, K.bars, alpha('#4b5560', 0.32), 3.2); S(c, K.bars, alpha('#f1f4f6', 0.85), 1.5);
  // water bottle hangs outside the bars
  c.fillStyle = alpha('#d6eef8', 0.82); c.fill(rrect(1237, 396, 32, 90, 9));
  c.fillStyle = alpha('#6fbfe6', 0.75); c.fill(rrect(1239, 424, 28, 60, 7)); R(c, 1243, 402, 5, 74, alpha('#ffffff', 0.65));
  c.fillStyle = '#ef6f6c'; c.fill(rrect(1240, 480, 26, 14, 4));
}

function prPenBack(c) {
  const K = prCache(), D = PETROOM.dish;
  shadow(c, 1790, 948, 310, 20, 0.3);
  R(c, 1540, 796, 500, 104, alpha('#ffffff', 0.16)); S(c, K.penBack, alpha('#7f8a95', 0.28), 1.5);
  c.strokeStyle = STEEL[1]; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(1548, 796); c.lineTo(2032, 796); c.stroke();
  c.fillStyle = lin(c, 0, 894, 0, 942, [[0, '#f59a7c'], [1, '#d5654a']]); c.fill(rrect(1530, 894, 520, 48, 9)); R(c, 1538, 894, 504, 4, alpha('#ffe1d2', 0.7));
  c.fillStyle = '#f5e6c2'; c.fill(K.penBed);
  // hay pile
  c.fillStyle = '#e3bf55'; c.beginPath(); c.moveTo(1552, 900); c.quadraticCurveTo(1590, 836, 1634, 832); c.quadraticCurveTo(1686, 838, 1716, 900); c.closePath(); c.fill();
  c.lineCap = 'round'; S(c, K.hay[0], '#c29a34', 2.4); S(c, K.hay[1], '#f7e08e', 2.2);
  // lettuce leaf + dish with pellets
  c.fillStyle = LEAF.light; c.beginPath(); c.ellipse(1838, 893, 22, 8, -0.2, 0, TAU); c.fill(); c.strokeStyle = LEAF.lime; c.lineWidth = 2; c.beginPath(); c.moveTo(1818, 895); c.lineTo(1858, 890); c.stroke();
  c.fillStyle = '#7a5a34'; c.beginPath(); c.ellipse(D.x, D.y - 30, 30, 11, 0, Math.PI, 0); c.fill();
  c.fillStyle = '#9bbf5a'; for (const dx of [-16, 2, 17]) { c.beginPath(); c.arc(D.x + dx, D.y - 34, 3.4, 0, TAU); c.fill(); }
  c.fillStyle = lin(c, 0, D.y - 30, 0, D.y, [[0, '#8fc4e6'], [1, '#4a86b3']]); c.fill(poly([[D.x - 40, D.y - 30], [D.x + 40, D.y - 30], [D.x + 30, D.y], [D.x - 30, D.y]]));
  R(c, D.x - 40, D.y - 32, 80, 5, '#c3e2f5');
}
function prPenFront(c) {
  const K = prCache();
  c.lineCap = 'butt'; S(c, K.pen, alpha('#4b5560', 0.28), 3); S(c, K.pen, alpha('#f1f4f6', 0.82), 1.4);
  c.strokeStyle = '#e6eaee'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(1540, 790); c.lineTo(2040, 790); c.moveTo(1540, 790); c.lineTo(1540, 896); c.moveTo(2040, 790); c.lineTo(2040, 896); c.stroke();
}

export function petRoomSet(g, t, o) {
  o = o || {};
  const look = lookOf(o), actors = fnOf(o.actors), front = fnOf(o.front);
  const door = clamp(num(o.hutchDoor, 0)), latch = clamp(num(o.latch, 0)), wheel = num(o.wheel, 0);
  t = num(t, 0);
  g.layer(1, (c) => {
    prRoom(c, look, t);
    prHutchBack(c); prCageBack(c, wheel); prPenBack(c);
    if (actors) { c.save(); actors(c); c.restore(); }
    prHutchFront(c, door, latch); prCageFront(c); prPenFront(c);
    if (front) { c.save(); front(c); c.restore(); }
  });
  // soft foreground: blanket edge and a toy block, close to the lens
  g.layer(1.45, (c) => {
    c.fillStyle = '#b8574c'; c.beginPath(); c.moveTo(1560, 1300); c.quadraticCurveTo(1640, 1010, 1900, 1040); c.quadraticCurveTo(2200, 1060, 2500, 1010); c.lineTo(2500, 1300); c.closePath(); c.fill();
    c.fillStyle = '#4f8f9f'; c.fill(rrect(-260, 1010, 150, 200, 14)); c.fillStyle = '#c9963c'; c.fill(rrect(-120, 1040, 130, 200, 14));
  });
}

export function petRoomLight(g, t, o) {
  o = o || {};
  const look = lookOf(o), dark = look.dark || 0, k = num(o.a, 1), W0 = PETROOM.window, col = look.key || '#fff3c4';
  t = num(t, 0);
  if (k <= 0 || (!look.sun && !look.moon)) return;
  g.layer(1, (c) => {
    const a = lerp(0.3, 0.44, dark) * k, dx = 1500, dy = 760;
    glow(c, W0.x + W0.w / 2, W0.y + W0.h / 2, 330, col, lerp(0.3, 0.42, dark) * k);
    lightShaft(c, [[W0.x + 10, W0.y + W0.h], [W0.x + W0.w, W0.y + 10], [W0.x + W0.w + dx * 1.15, W0.y + 10 + dy * 1.15], [W0.x + 10 + dx * 0.9, W0.y + W0.h + dy * 0.9]], { color: col, a });
    lightShaft(c, [[W0.x + 60, W0.y + W0.h - 60], [W0.x + W0.w - 110, W0.y + 110], [W0.x + W0.w - 110 + dx, W0.y + 110 + dy], [W0.x + 60 + dx * 0.9, W0.y + W0.h - 60 + dy * 0.9]], { color: col, a: a * 0.6 });
    c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.16 * k;      // pool on the floor
    c.fillStyle = col; c.beginPath(); c.ellipse(1250, 960, 620, 70, 0, 0, TAU); c.fill(); c.restore();
    c.save(); c.beginPath(); c.moveTo(W0.x, W0.y + W0.h); c.lineTo(W0.x + W0.w, W0.y); c.lineTo(W0.x + W0.w + dx, W0.y + dy); c.lineTo(W0.x + dx * 0.9, W0.y + W0.h + dy * 0.9); c.closePath(); c.clip();
    dust(c, 100, 150, 1900, 800, { t, n: 46, color: col, a: 0.55 * k, seed: 5, drift: 0.5 });
    c.restore();
  });
}

// ───────────────────────────────────────────── hallway ─────────────────────────────────────────────
const HV = { x: 960, y: 520 }, HP = 1600, HHW = 1.15, EYE = 1.15, CEIL = 2.65, UF = 17, UN = 1.1;
const hp = (u, xm, h) => [HV.x + (xm * HP) / u, HV.y + ((EYE - h) * HP) / u];
const DOORS = [[3.2, -1, 12], [6.4, -1, 14], [9.6, -1, 16], [12.8, -1, 18], [4.8, 1, 11], [8.0, 1, 13], [11.2, 1, 15], [14.4, 1, 17]];
const LAMPS = [3.4, 6.6, 9.8, 13.0];
export const HALL = {
  vanish: { x: HV.x, y: HV.y },
  doors: DOORS.map(([u, side, n]) => { const [x, y] = hp(u + 0.45, side * HHW, 1.05); return { x, y, side, n, u: u + 0.45 }; }),
  lamps: LAMPS.map((u) => { const [x, y] = hp(u, 0, CEIL); return { x, y, u }; }),
  at(u, xm = 0) { u = clamp(num(u, 6), 1.5, UF); const [x, y] = hp(u, num(xm, 0), 0); return { x, y, s: HP / u / 194 }; },
  cams: { wide: [960, 540, 1], deep: [960, 525, 1.5] },
};
export function hallLights(t, o) {
  o = o || {}; t = num(t, 0);
  const f = clamp(num(o.flicker, 0));
  return LAMPS.map((u, i) => {
    if (o.power === false) return 0;
    if (f <= 0) return 1;
    let b = 1 - f * 0.3 - f * 0.45 * clamp(noise1(t * 7 + i * 17.3, 40 + i) * 0.9 + 0.5);
    if (hash(Math.floor(t * 16) + i * 57, 3) < f * 0.5) b *= 0.12;                      // hard drop-outs
    if (f > 0.5 && hash(Math.floor(t * 0.9 + i * 0.37) + i * 13, 9) < (f - 0.5) * 1.3) b *= 0.05;   // lamp dies for a while
    return clamp(b);
  });
}
const wq = (side, u0, u1, h0, h1) => [hp(u0, side * HHW, h0), hp(u1, side * HHW, h0), hp(u1, side * HHW, h1), hp(u0, side * HHW, h1)];
const fq = (u0, u1, x0, x1, h = 0) => [hp(u0, x0, h), hp(u0, x1, h), hp(u1, x1, h), hp(u1, x0, h)];
const DOORCOL = ['#a8703f', '#96623a', '#b07a48', '#8f5c36'], MATS = ['#5f7f6a', '#7a5a8a', '#b8873c', '#4f6f8f'];

export function hallwaySet(g, t, o) {
  o = o || {};
  const look = lookOf(o), actors = fnOf(o.actors), front = fnOf(o.front), A = aging(Math.max(0, num(o.years, 0))), dark = look.dark || 0;
  t = num(t, 0);
  const L = hallLights(t, o), avg = (L[0] + L[1] + L[2] + L[3]) / 4;
  g.layer(1, (c) => {
    const xf = hp(UF, HHW, 0)[0] - HV.x, yc = hp(UF, 0, CEIL)[1], yf = hp(UF, 0, 0)[1];
    R(c, -2000, -2000, 5920, 5080, '#2a2420');
    // ceiling, floor, runner
    Q(c, fq(UN, UF, -HHW, HHW, CEIL), lin(c, 0, -300, 0, yc, [[0, '#efe6d2'], [1, '#cdbf9f']]));
    Q(c, fq(UN, UF, -HHW, HHW), lin(c, 0, yf, 0, 1500, [[0, '#6f5d4d'], [0.4, '#9a846c'], [1, '#a8927a']]));
    c.strokeStyle = alpha('#3d3026', 0.2); c.lineWidth = 2; c.beginPath(); for (let u = 2; u < UF; u += 1) { const a = hp(u, -HHW, 0), b = hp(u, HHW, 0); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); } c.stroke();
    Q(c, fq(UN, UF, -0.62, 0.62), '#e0b25c');
    Q(c, fq(UN, UF, -0.55, 0.55), lin(c, 0, yf, 0, 1400, [[0, '#7f3330'], [0.5, '#a8443c'], [1, '#b54d43']]));
    for (let u = 2.2; u < UF - 0.5; u += 1.3) Q(c, [hp(u, 0, 0), hp(u + 0.32, 0.26, 0), hp(u + 0.64, 0, 0), hp(u + 0.32, -0.26, 0)], alpha('#e0b25c', 0.55));
    // side walls: wainscot, dado rail, skirting
    for (const side of [-1, 1]) {
      const x0 = hp(UN, side * HHW, 0)[0], x1 = hp(UF, side * HHW, 0)[0];
      Q(c, wq(side, UN, UF, 0, CEIL), lin(c, x0, 0, x1, 0, side < 0 ? [[0, '#e9dcc0'], [1, '#cdbb98']] : [[0, '#f1e6cc'], [1, '#d6c5a3']]));
      Q(c, wq(side, UN, UF, 0, 1.0), lin(c, x0, 0, x1, 0, side < 0 ? [[0, '#86a89e'], [1, '#62837b']] : [[0, '#92b3a8'], [1, '#6a8b83']]));
      Q(c, wq(side, UN, UF, 0.97, 1.05), '#f6efe0'); Q(c, wq(side, UN, UF, 0, 0.13), '#5a483a');
    }
    // end wall with a window, radiator, plant
    R(c, HV.x - xf, yc, xf * 2, yf - yc, '#d2c2a0'); R(c, HV.x - xf, hp(UF, 0, 1)[1], xf * 2, yf - hp(UF, 0, 1)[1], '#6a8b83');
    { const a = hp(UF, -0.55, 2.2), b = hp(UF, 0.55, 0.95);
      c.fillStyle = skyFill(c, look, a[1], b[1] + 30); c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      if (look.moon) { c.fillStyle = look.moon.c || '#f4f1e4'; c.beginPath(); c.arc(a[0] + 28, a[1] + 26, 9, 0, TAU); c.fill(); }
      c.fillStyle = mix(LEAF.mid, look.haze, 0.3); c.beginPath(); c.arc(b[0] - 24, b[1], 26, Math.PI, 0); c.arc(a[0] + 20, b[1], 18, Math.PI, 0); c.fill();
      c.strokeStyle = '#f6efe0'; c.lineWidth = 5; c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); R(c, (a[0] + b[0]) / 2 - 1.5, a[1], 3, b[1] - a[1], '#f6efe0');
      const r0 = hp(UF, -0.45, 0.75), r1 = hp(UF, 0.45, 0.15); R(c, r0[0], r0[1], r1[0] - r0[0], r1[1] - r0[1], '#e9e2d2');
      c.strokeStyle = alpha('#8a8474', 0.6); c.lineWidth = 1.5; c.beginPath(); for (let x = r0[0] + 6; x < r1[0]; x += 8) { c.moveTo(x, r0[1] + 3); c.lineTo(x, r1[1] - 3); } c.stroke(); }
    { const [px, py] = hp(UF - 0.5, -0.82, 0), k = HP / (UF - 0.5);
      c.fillStyle = '#b8643c'; c.fill(poly([[px - 0.16 * k, py - 0.34 * k], [px + 0.16 * k, py - 0.34 * k], [px + 0.12 * k, py], [px - 0.12 * k, py]]));
      c.fillStyle = LEAF.dark; for (const a of [-0.8, -0.3, 0.25, 0.75]) { c.beginPath(); c.ellipse(px + Math.sin(a) * 0.3 * k, py - (0.34 + Math.cos(a) * 0.42) * k, 0.09 * k, 0.34 * k, a, 0, TAU); c.fill(); } }
    // doors (far to near), mats, numbers
    const order = DOORS.map((d, i) => i).sort((a, b) => DOORS[b][0] - DOORS[a][0]);
    for (const i of order) {
      const [u, side, n] = DOORS[i], u1 = u + 0.9, col = DOORCOL[i % 4];
      Q(c, fq(u + 0.08, u1 - 0.08, side * (HHW - 0.62), side * (HHW - 0.06)), MATS[i % 4]);
      Q(c, wq(side, u - 0.09, u1 + 0.09, 0, 2.17), '#f3ead6');
      const xa = hp(u, side * HHW, 0)[0], xb = hp(u1, side * HHW, 0)[0];
      Q(c, wq(side, u, u1, 0, 2.08), lin(c, xa, 0, xb, 0, [[0, mix(col, '#ffffff', 0.1)], [1, mix(col, '#2a1a10', 0.22)]]));
      for (const [h0, h1] of [[1.12, 1.93], [0.18, 0.96]]) { Q(c, wq(side, u + 0.13, u1 - 0.13, h0, h1), alpha('#3a2212', 0.3)); Q(c, wq(side, u + 0.16, u1 - 0.16, h0 + 0.03, h1 - 0.03), mix(col, '#ffffff', 0.06)); }
      Q(c, wq(side, u, u1, 0, 0.03), alpha('#1a120c', 0.6));
      const uk = side < 0 ? u1 - 0.12 : u + 0.12, [kx, ky] = hp(uk, side * (HHW - 0.03), 1.02), ks = HP / uk;
      c.fillStyle = '#e8c56a'; c.beginPath(); c.ellipse(kx, ky, 0.022 * ks, 0.045 * ks, 0, 0, TAU); c.fill(); c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(kx - 0.006 * ks, ky - 0.014 * ks, 0.008 * ks, 0, TAU); c.fill();
      const uc = u + 0.45, [px, py] = hp(uc, side * HHW, 1.62), ax = (HHW * HP) / (uc * uc) * 0.01, by = (side < 0 ? -1 : 1) * ((EYE - 1.62) * HP) / (uc * uc) * 0.01, dd = (HP / uc) * 0.01;
      c.save(); c.transform(ax, by, 0, dd, px, py);
      c.fillStyle = '#e8c56a'; c.fill(rrect(-13, -9, 26, 18, 3)); c.strokeStyle = '#8a6a2a'; c.lineWidth = 0.8; c.stroke(rrect(-13, -9, 26, 18, 3));
      txt(c, String(n), 0, 0.5, { size: 15, weight: 700, color: '#3a2a14', font: 'Barlow Semi Condensed' });
      c.fillStyle = '#2a1a10'; c.beginPath(); c.arc(0, 17, 1.6, 0, TAU); c.fill();
      c.restore();
    }
    // notice board, extinguisher, grime
    Q(c, wq(-1, 5.0, 5.9, 1.25, 1.95), '#8a5a34'); Q(c, wq(-1, 5.05, 5.85, 1.3, 1.9), '#c79a62');
    Q(c, wq(-1, 5.12, 5.4, 1.5, 1.82), '#fdf6e6'); Q(c, wq(-1, 5.45, 5.78, 1.38, 1.7), '#f7e39a'); Q(c, wq(-1, 5.2, 5.45, 1.34, 1.46), '#c9e6f5');
    Q(c, wq(1, 6.9, 7.12, 0.75, 1.3), '#d5453c'); Q(c, wq(1, 6.95, 7.07, 1.3, 1.42), '#2a2a2e');
    if (A.grime > 0.02) for (let i = 0; i < 10; i++) { const side = i % 2 ? 1 : -1, u = 2 + hash(i, 21) * 13, w = 0.3 + hash(i, 22) * 0.8; Q(c, wq(side, u, u + w, 1.05, CEIL), alpha('#4a4030', A.grime * (0.12 + hash(i, 23) * 0.2))); }
    // ceiling lamps
    L.forEach((b, i) => {
      const u = LAMPS[i], [x, y] = hp(u, 0, CEIL), rx = (0.3 * HP) / u, ry = ((CEIL - EYE) * HP * (1 / (u - 0.3) - 1 / (u + 0.3))) / 2;
      c.fillStyle = '#b3a992'; c.beginPath(); c.ellipse(x, y, rx * 1.12, ry * 1.12 + 1, 0, 0, TAU); c.fill();
      c.fillStyle = mix('#77736a', '#fff6d6', b); c.beginPath(); c.ellipse(x, y + ry * 0.4, rx, ry + rx * 0.16, 0, 0, TAU); c.fill();
    });
    if (actors) { c.save(); actors(c); c.restore(); }
    if (front) { c.save(); front(c); c.restore(); }
    // darkness as the lamps fail (covers actors too)
    const dk = (1 - avg) * lerp(0.62, 0.42, dark);
    if (dk > 0.005) R(c, -3000, -3000, 7920, 7080, alpha('#070b22', dk));
    c.fillStyle = lin(c, 0, yc - 40, 0, yf + 40, [[0, alpha('#1a1420', 0)], [0.5, alpha('#1a1420', 0.16)], [1, alpha('#1a1420', 0)]]); c.fillRect(HV.x - xf * 2.4, yc - 40, xf * 4.8, yf - yc + 80);
  });
}

export function hallwayLight(g, t, o) {
  o = o || {};
  const look = lookOf(o), k = num(o.a, 1), dark = look.dark || 0;
  t = num(t, 0);
  if (k <= 0) return;
  const L = hallLights(t, o), avg = (L[0] + L[1] + L[2] + L[3]) / 4;
  g.layer(1, (c) => {
    L.forEach((b, i) => {
      if (b <= 0.01) return;
      const u = LAMPS[i], s = HP / u, [x, y] = hp(u, 0, CEIL), [fx, fy] = hp(u, 0, 0);
      glow(c, x, y, 1.9 * s, '#ffe2a0', 0.5 * b * k); glow(c, x, y + 4, 0.5 * s, '#fff6dc', 0.9 * b * k);
      c.save(); c.translate(fx, fy); c.scale(1, 0.24); glow(c, 0, 0, 1.5 * s, '#ffd78c', 0.34 * b * k); c.restore();
    });
    const a = hp(UF, 0, 1.55), col = look.key || '#fff3c4';
    glow(c, a[0], a[1], 190, col, (0.3 + 0.3 * (1 - avg)) * k);
    lightShaft(c, [hp(UF, -0.5, 0), hp(UF, 0.5, 0), hp(3.2, 0.95, 0), hp(3.2, -0.95, 0)], { color: col, a: (0.1 + 0.3 * (1 - avg) + 0.1 * dark) * k });
  });
}

// ───────────────────────────────────────────── stairwell ─────────────────────────────────────────────
const ST = { x0: 494, x1: 1012, yu: 200, yl: 552, yb: 904, tr: 74, ri: 44, n: 8, wall: 1620 };
export const STAIRS = {
  landing: { x: 1300, y: ST.yl, x0: 1040, x1: 1590 },
  upper: { x0: ST.x0, y0: ST.yu, x1: ST.x1, y1: ST.yl }, lower: { x0: ST.x1, y0: ST.yl, x1: ST.x0, y1: ST.yb },
  upperFloor: { x0: -300, x1: ST.x0, y: ST.yu }, ground: { x0: -300, x1: 1590, y: ST.yb },
  window: { x: 1130, y: 20, w: 360, h: 450 }, step: { tread: ST.tr, riser: ST.ri, n: ST.n },
  cams: { wide: [900, 545, 1], upper: [820, 380, 1.5], landing: [1250, 440, 1.6] },
};
export function stairY(x, flight) {
  x = num(x, 0);
  if (flight === 'lower') return ST.yl + clamp(Math.ceil((ST.x1 - x) / ST.tr), 0, ST.n) * ST.ri;
  return ST.yu + clamp(Math.ceil((x - ST.x0) / ST.tr), 0, ST.n) * ST.ri;
}
let STC = null;
function stCache() {
  if (STC) return STC;
  const up = new Path2D(), lo = new Path2D(), upTop = new Path2D(), loTop = new Path2D(), upRis = new Path2D(), loRis = new Path2D();
  up.moveTo(ST.x0, ST.yu); lo.moveTo(ST.x1, ST.yl);
  for (let i = 0; i < ST.n; i++) {
    const xu = ST.x0 + i * ST.tr, yu = ST.yu + (i + 1) * ST.ri, xl = ST.x1 - i * ST.tr, yl = ST.yl + (i + 1) * ST.ri;
    up.lineTo(xu, yu); up.lineTo(xu + ST.tr, yu); lo.lineTo(xl, yl); lo.lineTo(xl - ST.tr, yl);
    if (i < ST.n - 1) { upTop.rect(xu, yu, ST.tr + 4, 6); loTop.rect(xl - ST.tr - 4, yl, ST.tr + 4, 6); }
    upRis.rect(xu, yu - ST.ri + 6, 5, ST.ri - 6); loRis.rect(xl - 5, yl - ST.ri + 6, 5, ST.ri - 6);
  }
  up.lineTo(ST.x1 + 40, ST.yl); up.lineTo(ST.x1 + 40, ST.yl + 62); up.lineTo(ST.x1 - 30, ST.yl + 62); up.lineTo(ST.x0 - 110, ST.yu + 56); up.lineTo(ST.x0 - 110, ST.yu); up.closePath();
  lo.lineTo(ST.x0 - ST.tr, ST.yb); lo.lineTo(ST.x0 + 100, ST.yb); lo.lineTo(ST.x1 + 30, ST.yl + 62); lo.lineTo(ST.x1 + 30, ST.yl); lo.closePath();
  const r = RNG(404), peel = [];
  for (let i = 0; i < 40; i++) {
    const x = r.range(-650, 1600), y = r.range(-220, 880), s = r.range(26, 86), pts = [], n = 8;
    for (let j = 0; j < n; j++) { const a = (j / n) * TAU, rr = s * r.range(0.55, 1.1); pts.push([x + Math.cos(a) * rr * 1.25, y + Math.sin(a) * rr * 0.8]); }
    const edge = new Path2D(); edge.moveTo(pts[5][0], pts[5][1]); edge.lineTo(pts[6][0], pts[6][1]); edge.lineTo(pts[7][0], pts[7][1]); edge.lineTo(pts[0][0], pts[0][1]);
    peel.push({ p: poly(pts), edge, ord: r() });
  }
  const leaves = [];
  for (let i = 0; i < ST.n - 1; i++) for (const up2 of [1, 0]) { const n = r.int(0, 3); for (let j = 0; j < n; j++) leaves.push([up2 ? ST.x0 + i * ST.tr + r.range(8, 66) : ST.x1 - i * ST.tr - r.range(8, 66), (up2 ? ST.yu : ST.yl) + (i + 1) * ST.ri - 2, r.range(5, 9), r.range(0, 3), r.int(0, 3), up2, r()]); }
  STC = { up, lo, upTop, loTop, upRis, loRis, peel, leaves };
  return STC;
}
const paneBroken = (i, A) => hash(i, 7) < A.broken * 2.3;
const LEAFCOL = ['#b9853a', '#8d6a2f', '#c9a14a', '#7a8a3a'];

function stRail(c, x0, y0, x1, y1, col, hi) {
  const hgt = 186, n = 4;
  c.lineCap = 'round'; c.strokeStyle = col; c.lineWidth = 5; c.beginPath();
  for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n); c.moveTo(x, y); c.lineTo(x, y - hgt); }
  c.moveTo(x0, y0 - hgt * 0.5); c.lineTo(x1, y1 - hgt * 0.5); c.stroke();
  c.lineWidth = 9; c.beginPath(); c.moveTo(x0, y0 - hgt); c.lineTo(x1, y1 - hgt); c.stroke();
  c.strokeStyle = hi; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x0, y0 - hgt - 2.5); c.lineTo(x1, y1 - hgt - 2.5); c.stroke();
}

export function stairwellSet(g, t, o) {
  o = o || {};
  const look = lookOf(o), actors = fnOf(o.actors), front = fnOf(o.front), A = aging(Math.max(0, num(o.years, 5)));
  t = num(t, 0);
  const K = stCache(), Wn = STAIRS.window, gr = A.grime;
  const conc = mix('#c2bdae', '#a39f8f', gr), concD = mix('#9a9587', '#7d796d', gr), rail = mix('#39464f', '#8f4a28', clamp(gr * 2)), railHi = mix('#6f8591', '#c9793f', clamp(gr * 2));
  g.layer(1, (c) => {
    // back wall, dado paint following the flight, peeling patches, stains
    c.fillStyle = lin(c, 0, -300, 0, 1000, [[0, mix('#eae3d0', '#cfc8b4', gr)], [1, mix('#d6ceb9', '#b3ac98', gr)]]); c.fillRect(-900, -600, 3600, 2000);
    const dado = mix('#7fae9f', '#6f9186', gr);
    Q(c, [[-900, ST.yu - 236], [ST.x0, ST.yu - 236], [ST.x1, ST.yl - 236], [ST.wall, ST.yl - 236], [ST.wall, ST.yl], [ST.x1, ST.yl], [ST.x0, ST.yu], [-900, ST.yu]], dado);
    R(c, -900, ST.yb - 236, 2600, 236, dado);
    Q(c, [[-900, ST.yu - 244], [ST.x0, ST.yu - 244], [ST.x1, ST.yl - 244], [ST.wall, ST.yl - 244], [ST.wall, ST.yl - 236], [ST.x1, ST.yl - 236], [ST.x0, ST.yu - 236], [-900, ST.yu - 236]], mix('#4f7a6c', '#55695f', gr));
    R(c, -900, ST.yb - 244, 2600, 8, mix('#4f7a6c', '#55695f', gr));
    txt(c, '4', 250, 70, { size: 150, weight: 800, color: alpha('#8a7f6a', 0.45) }); txt(c, '3', 250, 760, { size: 150, weight: 800, color: alpha('#3f5a50', 0.4) });
    const show = gr * 2.6;
    for (const p of K.peel) { if (p.ord > show) continue; c.fillStyle = '#aaa79a'; c.fill(p.p); S(c, p.edge, alpha('#f6f1e2', 0.75), 3); }
    for (let i = 0; i < 9; i++) { const x = -500 + i * 250 + hash(i, 3) * 120, w = 30 + hash(i, 4) * 70, y = -300 + hash(i, 5) * 300, h = 300 + hash(i, 6) * 500; c.fillStyle = lin(c, 0, y, 0, y + h, [[0, alpha('#5a5340', gr * 0.5)], [1, alpha('#5a5340', 0)]]); c.fillRect(x, y, w, h); }
    // window: sky, outside foliage, panes, frame
    const pw = Wn.w / 3, ph = Wn.h / 4;
    R(c, Wn.x - 22, Wn.y - 22, Wn.w + 44, Wn.h + 44, mix('#b9b2a0', '#8f8a7c', gr));
    c.fillStyle = skyFill(c, look, Wn.y, Wn.y + Wn.h * 1.2); c.fillRect(Wn.x, Wn.y, Wn.w, Wn.h);
    c.save(); c.beginPath(); c.rect(Wn.x, Wn.y, Wn.w, Wn.h); c.clip();
    c.fillStyle = mix(LEAF.dark, look.haze, 0.3); for (const [x, y, r] of [[1160, 430, 110], [1330, 470, 120], [1470, 400, 100]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    c.fillStyle = mix(LEAF.light, look.haze, 0.3); for (const [x, y, r] of [[1200, 372, 56], [1400, 386, 60], [1480, 330, 44]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    c.restore();
    for (let i = 0; i < 12; i++) {
      const x = Wn.x + (i % 3) * pw, y = Wn.y + Math.floor(i / 3) * ph;
      if (!paneBroken(i, A)) { c.fillStyle = alpha(mix('#dfe6e0', '#b9b99a', gr), 0.3 + 0.6 * clamp(gr * 1.6)); c.fillRect(x, y, pw, ph); c.fillStyle = alpha('#6f6a4a', 0.25 * gr); c.fillRect(x, y + ph * 0.55, pw, ph * 0.45); continue; }
      c.fillStyle = alpha('#dfe6e0', 0.55);
      c.fill(poly([[x, y], [x + pw * (0.3 + hash(i, 1) * 0.3), y], [x, y + ph * (0.3 + hash(i, 2) * 0.4)]]));
      c.fill(poly([[x + pw, y + ph], [x + pw * (0.35 + hash(i, 3) * 0.3), y + ph], [x + pw * (0.8 + hash(i, 5) * 0.1), y + ph * 0.7], [x + pw, y + ph * (0.4 + hash(i, 4) * 0.3)]]));
    }
    c.strokeStyle = mix('#4a4f55', '#6e4028', clamp(gr * 2)); c.lineWidth = 9; c.strokeRect(Wn.x, Wn.y, Wn.w, Wn.h);
    c.lineWidth = 6; c.beginPath(); for (let i = 1; i < 3; i++) { c.moveTo(Wn.x + i * pw, Wn.y); c.lineTo(Wn.x + i * pw, Wn.y + Wn.h); } for (let i = 1; i < 4; i++) { c.moveTo(Wn.x, Wn.y + i * ph); c.lineTo(Wn.x + Wn.w, Wn.y + i * ph); } c.stroke();
    R(c, Wn.x - 30, Wn.y + Wn.h + 4, Wn.w + 60, 16, conc);
    ivy(c, Wn.x - 70, Wn.y - 10, 190, 480, { cover: clamp(A.vines * 1.7), seed: 6, t, hang: true });
    ivy(c, Wn.x + Wn.w - 60, Wn.y + 130, 170, 400, { cover: clamp(A.vines * 1.4), seed: 9, t });
    vines(c, Wn.x + 130, Wn.x + Wn.w - 20, Wn.y + 6, { len: 300 * A.vines, seed: 4, t, n: 5 });
    // drain pipe, cut right wall
    R(c, 1560, -600, 26, 1504, mix('#6f7a7f', '#7a4a2c', clamp(gr * 1.6))); R(c, 1560, -600, 6, 1504, alpha('#ffffff', 0.18)); for (const y of [130, 440, 760]) R(c, 1554, y, 38, 12, mix('#5a656a', '#5f3820', clamp(gr * 1.6)));
    c.fillStyle = lin(c, ST.wall, 0, ST.wall + 300, 0, [[0, '#6d685f'], [1, '#55514a']]); c.fillRect(ST.wall, -600, 1200, 2200);
    // ground floor, upper flight + upper floor + landing (further away)
    R(c, -900, ST.yb, 3600, 500, concD); R(c, -900, ST.yb, 2520, 8, mix(conc, '#ffffff', 0.25));
    c.fillStyle = lin(c, 0, ST.yl + 62, 0, ST.yb, [[0, alpha('#1d1c22', 0.34)], [1, alpha('#1d1c22', 0.06)]]); c.fillRect(ST.x1 - 30, ST.yl + 62, ST.wall - ST.x1 + 30, ST.yb - ST.yl - 62);
    c.fillStyle = lin(c, 0, ST.yu, 0, ST.yl + 80, [[0, mix(conc, '#6f6b60', 0.18)], [1, mix(concD, '#55524a', 0.25)]]); c.fill(K.up);
    c.fillRect(-900, ST.yu, ST.x0 - 100 + 900, 56); c.fillRect(ST.x1 + 30, ST.yl, ST.wall - ST.x1 - 30, 62);
    c.fillStyle = mix(conc, '#ffffff', 0.3); c.fill(K.upTop); c.fillRect(-900, ST.yu, ST.x0 + 900, 6); c.fillRect(ST.x1 - ST.tr, ST.yl, ST.wall - ST.x1 + ST.tr, 6);
    c.fillStyle = alpha('#3a372f', 0.22); c.fill(K.upRis);
    R(c, -900, ST.yu + 50, ST.x0 - 110 + 900, 6, alpha('#2a2822', 0.3)); R(c, ST.x1 + 30, ST.yl + 56, ST.wall - ST.x1 - 30, 6, alpha('#2a2822', 0.3));
    // leaves, weeds, a sapling under the landing
    tree(c, 1420, ST.yb + 2, { h: 300, seed: 8, t, kind: 'sapling', grow: clamp(A.trees * 1.6) });
    litter(c, 1040, 1600, ST.yl - 1, { n: Math.round(46 * A.weeds), seed: 3, yVar: 3 });
    litter(c, -600, ST.x0 - 20, ST.yu - 1, { n: Math.round(26 * A.weeds), seed: 5, yVar: 3 });
    litter(c, -600, 1600, ST.yb + 8, { n: Math.round(90 * A.weeds), seed: 7, yVar: 10 });
    grass(c, 1500, 1618, ST.yl + 2, { h: 30 * A.weeds, seed: 4, t, density: 0.2 }); grass(c, 1050, 1618, ST.yb + 4, { h: 34 * A.weeds, seed: 6, t, density: 0.1 });
    moss(c, 1380, 1600, ST.yl + 2, { seed: 3 });
    for (const [x, y, s, a, ci, isUp, ord] of K.leaves) { if (!isUp || ord > A.weeds) continue; c.fillStyle = LEAFCOL[ci]; c.beginPath(); c.ellipse(x, y, s, s * 0.4, a, 0, TAU); c.fill(); }
    if (actors) { c.save(); actors(c); c.restore(); }
    // upper rail, lower flight (nearer), lower rail
    stRail(c, ST.x0, ST.yu, ST.x1, ST.yl, rail, railHi); stRail(c, 120, ST.yu, ST.x0, ST.yu, rail, railHi);
    c.fillStyle = lin(c, 0, ST.yl, 0, ST.yb, [[0, conc], [1, concD]]); c.fill(K.lo);
    c.fillStyle = mix(conc, '#ffffff', 0.38); c.fill(K.loTop); c.fillStyle = alpha('#3a372f', 0.2); c.fill(K.loRis);
    for (const [x, y, s, a, ci, isUp, ord] of K.leaves) { if (isUp || ord > A.weeds) continue; c.fillStyle = LEAFCOL[ci]; c.beginPath(); c.ellipse(x, y, s, s * 0.4, a, 0, TAU); c.fill(); }
    grass(c, ST.x0 - 80, ST.x0 + 10, ST.yb + 4, { h: 26 * A.weeds, seed: 11, t, density: 0.16 });
    stRail(c, ST.x1, ST.yl, ST.x0, ST.yb, rail, railHi);
    if (front) { c.save(); front(c); c.restore(); }
  });
  g.layer(1.4, (c) => {
    vines(c, 1500, 2200, -120, { len: 120 + 420 * A.vines, seed: 12, t, n: 9, colors: ['#1f3a22', '#2a4a2a', '#35602f'] });
    R(c, -1100, -400, 560, 2200, '#3a3832');
  });
}

export function stairwellLight(g, t, o) {
  o = o || {};
  const look = lookOf(o), k = num(o.a, 1) * (1 - 0.35 * (look.dark || 0)), A = aging(Math.max(0, num(o.years, 5))), Wn = STAIRS.window, col = look.key || '#fff3c4';
  t = num(t, 0);
  if (k <= 0) return;
  g.layer(1, (c) => {
    const pw = Wn.w / 3, ph = Wn.h / 4, dx = -860, dy = 700;
    glow(c, Wn.x + Wn.w / 2, Wn.y + Wn.h / 2, 420, col, 0.34 * k);
    let n = 0;
    for (let i = 0; i < 12 && n < 4; i++) {
      if (!paneBroken(i, A) || i % 3 === (n + 1) % 3) continue;
      const x = Wn.x + (i % 3) * pw, y = Wn.y + Math.floor(i / 3) * ph, f = 1 + n * 0.08; n++;
      lightShaft(c, [[x + 8, y + 8], [x + pw - 8, y + ph - 8], [x + pw + dx * f + 60, y + ph + dy * f + 40], [x + dx * f - 60, y + dy * f - 40]], { color: col, a: (0.34 - n * 0.03) * k });
    }
    if (!n) lightShaft(c, [[Wn.x, Wn.y], [Wn.x + Wn.w, Wn.y + Wn.h], [Wn.x + Wn.w + dx, Wn.y + Wn.h + dy], [Wn.x + dx, Wn.y + dy]], { color: col, a: 0.2 * k });
    dust(c, 300, 60, 1250, 760, { t, n: 54, color: col, a: 0.6 * k, seed: 9, drift: 0.5 });
  });
}

// ───────────────────────────────────────────── ruin floors ─────────────────────────────────────────────
const RF = { yl: 620, yr: 640, xl: 760, xr: 1180, th: 72, low: 1490 };
export const RUINFLOORS = {
  floorY: RF.yl, rightY: RF.yr, gap: RF.xr - RF.xl,
  leftEdge: { x: RF.xl - 12, y: RF.yl }, rightEdge: { x: RF.xr + 14, y: RF.yr },
  run: { x0: -260, x1: RF.xl - 12 }, runOut: { x0: RF.xr + 14, x1: 2300 },
  cams: { wide: [960, 520, 0.9], leap: [970, 500, 1.25], drop: [970, 900, 0.8] },
};
const RCOLS = [[-520, 1], [40, 0.42], [560, 1], [1290, 0.7], [1880, 1], [2460, 0.5]];   // [x, standing fraction of the storey]
let RFC = null;
function rfCache() {
  if (RFC) return RFC;
  const r = RNG(909), far = [], mid = [], canopy = [];
  for (let x = -1000; x < 3600;) { const w = r.range(80, 190), h = r.range(240, 660); far.push({ x, w, h, k: r(), cut: r.range(0.15, 0.85), dy: r.range(14, 70) }); x += w + r.range(6, 80); }
  for (let x = -1100; x < 3900;) {
    const w = r.range(180, 330), h = r.range(240, 540), win = new Path2D(), top = [];
    for (let yy = 40; yy < h - 60; yy += 56) for (let xx = 22; xx < w - 40; xx += 48) if (r.chance(0.78)) win.rect(x + xx, 1010 - h + yy, 24, 32);
    for (let i = 0; i <= 5; i++) top.push([x + (w * i) / 5, 1010 - h - (r.chance(0.5) ? r.range(0, 46) : 0)]);
    const trees = []; for (let i = 0; i < 3; i++) if (r.chance(0.6)) trees.push([x + r.range(20, w - 20), 1010 - h, r.range(26, 54)]);
    mid.push({ x, w, h, win, top, trees, k: r() }); x += w + r.range(20, 150);
  }
  for (let x = -1200; x < 4200; x += r.range(46, 100)) canopy.push([x, r.range(905, 1010), r.range(64, 130), r.int(0, 2)]);
  const crack = new Path2D();
  for (let i = 0; i < 16; i++) { let x = r.range(-800, 2800), y = (x < 900 ? RF.yl : RF.yr) + 6; if (x > RF.xl - 60 && x < RF.xr + 60) continue; crack.moveTo(x, y); for (let j = 0; j < 4; j++) { x += r.range(-16, 16); y += r.range(10, 18); crack.lineTo(x, y); } }
  RFC = { far, mid, canopy, crack };
  return RFC;
}
function rebar(c, pts, w = 5) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [col, lw, dy] of [['#5a2f1a', w, 0], ['#a8623a', w * 0.4, -w * 0.22]]) { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(pts[0][0], pts[0][1] + dy); for (let i = 1; i < pts.length; i += 2) c.quadraticCurveTo(pts[i][0], pts[i][1] + dy, pts[i + 1][0], pts[i + 1][1] + dy); c.stroke(); }
}

export function ruinFloorsSet(g, t, o) {
  o = o || {};
  const look = lookOf(o), actors = fnOf(o.actors), front = fnOf(o.front), A = aging(Math.max(0, num(o.years, 20))), K = rfCache();
  t = num(t, 0);
  drawSky(g, look, o.clouds === false ? { clouds: false } : (o.clouds && typeof o.clouds === 'object' ? { clouds: o.clouds } : {}));
  const green = (col, k) => mix(col, LEAF.mid, clamp(k));
  g.layer(0.12, (c) => {
    for (const b of K.far) {
      const y = 1010 - b.h; c.fillStyle = mix('#8ea3b4', '#6f879c', b.k);
      c.beginPath(); c.moveTo(b.x, 1400); c.lineTo(b.x, y + b.dy * A.broken); c.lineTo(b.x + b.w * b.cut, y); c.lineTo(b.x + b.w * b.cut, y + b.dy * 0.6 * A.broken); c.lineTo(b.x + b.w, y + b.dy * 0.3); c.lineTo(b.x + b.w, 1400); c.closePath(); c.fill();
      c.fillStyle = lin(c, 0, y + b.h * 0.35, 0, 1010, [[0, alpha(LEAF.mid, 0)], [1, alpha(LEAF.mid, 0.75 * A.vines)]]); c.fillRect(b.x, y + b.h * 0.35, b.w, b.h * 0.65 + 400);
    }
  }, { fog: [look.haze, 0.6] });
  g.layer(0.3, (c) => {
    for (const b of K.mid) {
      const y = 1010 - b.h;
      c.fillStyle = lin(c, 0, y, 0, 1010, [[0, mix('#a7ab9c', '#8d9484', b.k)], [0.45, green('#8d9484', A.vines * 0.6)], [1, green('#6f8a5f', A.vines)]]);
      c.beginPath(); c.moveTo(b.x, 1500); for (const [px, py] of b.top) c.lineTo(px, lerp(y, py, A.broken * 1.4)); c.lineTo(b.x + b.w, 1500); c.closePath(); c.fill();
      c.fillStyle = alpha('#3f4f4a', 0.5); c.fill(b.win);
      c.fillStyle = LEAF.mid; for (const [tx, ty, tr] of b.trees) { const rr = tr * clamp(A.trees * 1.4); if (rr < 3) continue; c.beginPath(); c.arc(tx, ty - rr * 0.6, rr, 0, TAU); c.arc(tx + rr * 0.8, ty - rr * 0.3, rr * 0.7, 0, TAU); c.fill(); }
    }
  }, { fog: [look.haze, 0.34] });
  g.layer(0.55, (c) => {
    const cols = [LEAF.dark, LEAF.mid, LEAF.teal || LEAF.dark];
    for (let pass = 0; pass < 2; pass++) for (const [x, y, r, ci] of K.canopy) {
      const sw = Math.sin(t * 0.8 + x * 0.01) * 3;
      if (!pass) { c.fillStyle = cols[ci]; c.beginPath(); c.arc(x + sw, y, r, 0, TAU); c.fill(); } else { c.fillStyle = alpha(LEAF.light, 0.5); c.beginPath(); c.arc(x - r * 0.25 + sw, y - r * 0.3, r * 0.5, 0, TAU); c.fill(); }
    }
    R(c, -1400, 1010, 5800, 900, LEAF.dark);
  }, { fog: [look.haze, 0.16] });
  g.layer(1, (c) => {
    const gr = A.grime, conc = mix('#cfcbbb', '#b3af9f', gr), concD = mix('#a7a394', '#8a8779', gr), wall = mix('#9da294', '#858b7c', gr);
    // remains of the far wall
    c.fillStyle = lin(c, 0, 260, 0, 620, [[0, wall], [1, mix(wall, '#5f6a5a', 0.3)]]);
    c.fill(poly([[-1200, 640], [-1200, 250], [-760, 262], [-700, 330], [-420, 318], [-380, 250], [-90, 268], [-40, 360], [150, 372], [200, 452], [330, 470], [350, 640]]));
    c.fill(poly([[1560, 660], [1580, 520], [1700, 505], [1730, 430], [2010, 420], [2050, 340], [2380, 352], [2420, 470], [2700, 480], [2700, 660]]));
    c.fillStyle = skyFill(c, look, 300, 700); c.fillRect(-340, 400, 150, 150); c.fillRect(2120, 460, 150, 130);
    ivy(c, -700, 250, 620, 380, { cover: A.vines, seed: 21, t }); ivy(c, 1700, 420, 700, 230, { cover: A.vines, seed: 23, t });
    // lower storey: next slab down, far below
    R(c, -1400, RF.low, 5800, 80, concD); R(c, -1400, RF.low, 5800, 8, conc);
    c.fillStyle = '#8f8b7d'; c.fill(bumpyOnce('rub', 820, 1320, RF.low - 30, 26, 60, 4, RF.low + 4));
    tree(c, 1000, RF.low, { h: 520, seed: 31, t, kind: 'round', grow: clamp(A.trees * 1.3) });
    // columns (down to the lower slab, up to a broken top)
    for (let i = 0; i < RCOLS.length; i++) {
      const [x, f] = RCOLS[i], w = 112, base = x < 900 ? RF.yl : RF.yr, top = f >= 1 ? -700 : base - 870 * f;
      c.fillStyle = lin(c, x, 0, x + w, 0, [[0, mix(conc, '#ffffff', 0.12)], [0.35, conc], [1, concD]]);
      c.beginPath(); c.moveTo(x, RF.low); c.lineTo(x, top + 14); c.lineTo(x + w * 0.3, top - 10); c.lineTo(x + w * 0.62, top + 18); c.lineTo(x + w, top - 4); c.lineTo(x + w, RF.low); c.closePath(); c.fill();
      c.fillStyle = lin(c, 0, top, 0, top + 500, [[0, alpha('#4a4636', 0.4 * gr)], [1, alpha('#4a4636', 0)]]); c.fillRect(x + w * 0.3, top + 18, w * 0.3, 480);
      if (f < 1) { rebar(c, [[x + 30, top + 4], [x + 26, top - 40], [x + 44, top - 78]], 4); rebar(c, [[x + 80, top + 6], [x + 86, top - 30], [x + 70, top - 54]], 4); }
      ivy(c, x, base - 420, w, 420, { cover: clamp(A.vines * (0.7 + hash(i, 2) * 0.6)), seed: 30 + i, t, density: 0.8 });
      ivy(c, x, base + RF.th, w, 300, { cover: A.vines * 0.6, seed: 40 + i, t, hang: true, density: 0.7 });
    }
    // remnant of the slab above, with hanging growth
    c.fillStyle = concD; c.fill(poly([[-1400, -250], [300, -250], [330, -214], [296, -196], [310, -178], [-1400, -178]]));
    c.fill(poly([[3200, -250], [1820, -250], [1790, -220], [1830, -178], [3200, -178]]));
    vines(c, -500, 300, -178, { len: 180 + 320 * A.vines, seed: 17, t, n: 12 }); vines(c, 1840, 2500, -178, { len: 140 + 260 * A.vines, seed: 19, t, n: 9 });
    // slabs
    const lp = [[-1400, RF.yl], [RF.xl, RF.yl], [RF.xl - 8, RF.yl + 20], [RF.xl - 28, RF.yl + 34], [RF.xl - 14, RF.yl + 54], [RF.xl - 40, RF.yl + RF.th], [-1400, RF.yl + RF.th]];
    const rp = [[3400, RF.yr], [RF.xr, RF.yr], [RF.xr + 14, RF.yr + 22], [RF.xr + 2, RF.yr + 44], [RF.xr + 34, RF.yr + RF.th], [3400, RF.yr + RF.th]];
    rebar(c, [[RF.xl - 20, RF.yl + 30], [RF.xl + 44, RF.yl + 28], [RF.xl + 78, RF.yl + 76]]); rebar(c, [[RF.xl - 30, RF.yl + 56], [RF.xl + 50, RF.yl + 70], [RF.xl + 56, RF.yl + 150]]);
    rebar(c, [[RF.xr + 8, RF.yr + 30], [RF.xr - 56, RF.yr + 30], [RF.xr - 92, RF.yr + 84]]); rebar(c, [[RF.xr + 16, RF.yr + 58], [RF.xr - 30, RF.yr + 70], [RF.xr - 40, RF.yr + 124]], 4);
    c.fillStyle = concD; c.fill(poly([[RF.xr - 62, RF.yr + 118], [RF.xr - 24, RF.yr + 112], [RF.xr - 16, RF.yr + 150], [RF.xr - 50, RF.yr + 160]]));
    for (const [pts, y] of [[lp, RF.yl], [rp, RF.yr]]) {
      c.fillStyle = lin(c, 0, y, 0, y + RF.th, [[0, conc], [1, concD]]); c.fill(poly(pts));
      c.fillStyle = lin(c, 0, y + RF.th, 0, y + RF.th + 150, [[0, alpha('#1c2018', 0.3)], [1, alpha('#1c2018', 0)]]);
      if (pts === lp) c.fillRect(-1400, y + RF.th, RF.xl - 40 + 1400, 150); else c.fillRect(RF.xr + 34, y + RF.th, 2400, 150);
    }
    R(c, -1400, RF.yl, RF.xl + 1400, 7, mix(conc, '#ffffff', 0.4)); R(c, RF.xr, RF.yr, 2300, 7, mix(conc, '#ffffff', 0.4));
    R(c, -1400, RF.yl + RF.th - 8, RF.xl - 40 + 1400, 8, alpha('#3a3a30', 0.35)); R(c, RF.xr + 34, RF.yr + RF.th - 8, 2300, 8, alpha('#3a3a30', 0.35));
    S(c, K.crack, alpha('#4a473c', 0.45), 2);
    vines(c, 380, RF.xl - 44, RF.yl + RF.th, { len: 300 * A.vines, seed: 3, t, n: 9 }); vines(c, RF.xr + 40, 1640, RF.yr + RF.th, { len: 340 * A.vines, seed: 5, t, n: 10 });
    // growth on the slabs (behind the actors)
    moss(c, -1000, RF.xl - 20, RF.yl + 3, { seed: 2 }); moss(c, RF.xr + 20, 2800, RF.yr + 3, { seed: 4 });
    tree(c, 300, RF.yl + 2, { h: 520, seed: 3, t, kind: 'sapling', grow: clamp(A.trees * 1.3) });
    tree(c, 1640, RF.yr + 2, { h: 560, seed: 14, t, kind: 'birch', grow: clamp(A.trees * 1.2) });
    tree(c, 2250, RF.yr + 2, { h: 420, seed: 7, t, kind: 'sapling', grow: clamp(A.trees * 1.3) });
    if (A.weeds > 0.2) { bush(c, -130, RF.yl + 4, { w: 190, h: 100, seed: 4, t }); bush(c, 1480, RF.yr + 4, { w: 170, h: 90, seed: 6, t, flowers: '#ffd84d' }); bush(c, 2050, RF.yr + 4, { w: 210, h: 110, seed: 9, t }); }
    grass(c, -1000, RF.xl - 16, RF.yl + 2, { h: 14 + 22 * A.weeds, seed: 2, t, density: 0.1 * A.weeds }); grass(c, RF.xr + 16, 2800, RF.yr + 2, { h: 14 + 22 * A.weeds, seed: 3, t, density: 0.1 * A.weeds });
    litter(c, -800, RF.xl - 30, RF.yl, { n: Math.round(40 * A.weeds), seed: 2, yVar: 2 }); litter(c, RF.xr + 30, 2600, RF.yr, { n: Math.round(40 * A.weeds), seed: 4, yVar: 2 });
    if (actors) { c.save(); actors(c); c.restore(); }
    grass(c, -1000, RF.xl - 60, RF.yl + 9, { h: 9 + 12 * A.weeds, seed: 12, t, density: 0.06 * A.weeds }); grass(c, RF.xr + 60, 2800, RF.yr + 9, { h: 9 + 12 * A.weeds, seed: 13, t, density: 0.06 * A.weeds });
    if (front) { c.save(); front(c); c.restore(); }
  });
  g.layer(1.5, (c) => {
    c.fillStyle = '#2f3a2c'; c.fill(poly([[-900, 1700], [-900, -500], [-700, -500], [-690, 1700]])); c.fill(poly([[2560, 1700], [2575, -500], [2800, -500], [2800, 1700]]));
    const cols = ['#20361f', '#2a4a2a', '#35602f'];
    vines(c, -720, -200, -90, { len: 200 + 380 * A.vines, seed: 8, t, n: 8, colors: cols }); vines(c, 1500, 2600, -110, { len: 160 + 300 * A.vines, seed: 10, t, n: 12, colors: cols });
  });
}
