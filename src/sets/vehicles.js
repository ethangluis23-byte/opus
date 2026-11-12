// Vehicles for the city sets — side view, hero-prop style: top-lit gradient paint, rim light, dark hue-tinted outline
// (inkW), soft contact shadow. Everything ages continuously with `years` (0 → 200) so time-lapses grow smoothly.
//
//   CAR_COLORS   {red, blue, navy, white, silver, black, green, teal, yellow, orange, cream, plum} (hex). Any hex works too.
//
//   drawCar(c, o) → {roof: [x, y], x0, x1, head: [x, y], tail: [x, y]}   (all world coords of the caller)
//     o = {x, y           ground point under the middle of the car
//          s = 1          dog-relative scale (s 1: sedan 840 long × 250 tall, hatch 720 × 255, van 900 × 335; the city
//                         sets draw cars at s 0.6 = their character scale)
//          flip = 1       1 = nose to the right, -1 = nose to the left
//          color          CAR_COLORS key or hex (default red; taxi yellow)
//          kind           'sedan' | 'hatch' | 'van' | 'taxi'
//          years = 0      0 clean · 7/365 dusty · 1 dusty, soft tyres · 5 rust spots, cracked glass, flat tyres ·
//                         20 rusted, broken glass, grass round the wheels, a bush growing out of the cabin (planter) ·
//                         100 moss on the roof, a young tree through it · 200 sunk in the ground, a rust-brown heap
//          wheel = 0      wheel rotation in radians (rolling: wheel = distance / (58 · s))
//          lights = 0     0..1 headlights + tail lights on (bright fills; add glows after the grade at head/tail)
//          brake = 0      0..1 extra tail-light brightness
//          seed = 1       dirt / rust / broken-glass / plant variation;  t = 0 (plant sway)
//          shadow = true, plants = true (false: no vegetation even when old), rot = 0 (tilt about the ground point)}
//   carSize(kind, s = 1) → {len, h, R}
//   drawBus(c, o)  same options (no kind): city bus ≈ 1500 × 430 at s 1, white upper body, `color` lower livery
//                  (default blue), route sign. years → rust, broken windows, flat tyres, plants on the roof and inside.
//                  Returns {roof, x0, x1, head, tail}.
//   drawTrolley(c, o)  o = {x, y, s, flip, years, rot, seed}: shopping trolley ≈ 190 × 185 at s 1 (wire basket, red
//                  handle); years → rust, a lost wheel (rot it yourself to topple it), grass at 20+.
import { Path2D } from '@napi-rs/canvas';
import { TAU, clamp, lerp, mix, alpha, RNG, ss, tone, sat, hash } from '../engine/util.js';
import { rrect, circle, fill, line, clipped, lin, shadow, txt } from '../engine/draw.js';
import { inkW } from '../chars/rig.js';
import { tree, bush, grass, moss as mossLine, LEAF } from '../env/nature.js';

export const CAR_COLORS = {
  red: '#c8423a', blue: '#3f6fb5', navy: '#2d416e', white: '#e8e6df', silver: '#aab3bd', black: '#3b3e46',
  green: '#4f8a5b', teal: '#2f8f8a', yellow: '#f2c230', orange: '#e2783a', cream: '#e6d6b0', plum: '#7d4a6e',
};

// Rounded polygon through [x, y, r] corners.
function rpoly(pts, rDef = 8) {
  const p = new Path2D(), n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  p.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const a = pts[i], m = mid(a, pts[(i + 1) % n]);
    p.arcTo(a[0], a[1], m[0], m[1], a[2] ?? rDef);
  }
  p.closePath();
  return p;
}

// Geometry in units at s = 1, nose to +x, ground at y = 0.
const KINDS = {
  sedan: {
    len: 840, R: 58, wheels: [-262, 268], roof: -250, roofX: -40, belt: -176, bump: -64, cab: [-60, -200],
    body: [[-406, -36, 8], [-419, -92, 18], [-410, -150, 20], [-384, -167, 14], [-298, -174, 10], [-186, -246, 44], [96, -250, 36], [236, -174, 12], [372, -160, 28], [411, -134, 24], [421, -88, 16], [409, -36, 8]],
    glass: [[[-282, -181, 8], [-182, -235, 18], [-50, -237, 6], [-50, -181, 4]], [[-32, -181, 4], [-32, -237, 6], [90, -239, 14], [212, -181, 8]]],
    doors: [-288, -41, 214], head: [386, -152, 30, 20], tail: [-420, -158, 20, 30],
  },
  hatch: {
    len: 720, R: 56, wheels: [-226, 228], roof: -254, roofX: -110, belt: -178, bump: -62, cab: [-120, -205],
    body: [[-348, -36, 8], [-360, -96, 18], [-354, -196, 24], [-318, -250, 36], [66, -254, 34], [206, -174, 12], [316, -160, 26], [352, -134, 22], [362, -88, 14], [350, -36, 8]],
    glass: [[[-326, -183, 8], [-306, -236, 18], [-150, -240, 6], [-150, -183, 4]], [[-132, -183, 4], [-132, -240, 6], [62, -242, 14], [186, -183, 8]]],
    doors: [-140, 188], head: [328, -152, 26, 20], tail: [-364, -192, 16, 40],
  },
  van: {
    len: 900, R: 62, wheels: [-292, 296], roof: -336, roofX: -80, belt: -205, bump: -66, cab: [-100, -250],
    body: [[-446, -38, 8], [-455, -100, 14], [-452, -306, 20], [-424, -336, 24], [244, -336, 36], [336, -206, 12], [414, -182, 28], [450, -146, 24], [457, -92, 14], [446, -38, 8]],
    glass: [[[-420, -215, 6], [-420, -300, 10], [-250, -300, 6], [-250, -215, 4]], [[-226, -215, 4], [-226, -300, 6], [-40, -300, 6], [-40, -215, 4]], [[-12, -215, 4], [-12, -300, 6], [226, -300, 14], [312, -215, 8]]],
    doors: [-238, -24, 322], head: [420, -172, 30, 22], tail: [-460, -210, 16, 52],
  },
  bus: {
    len: 1500, R: 66, wheels: [-468, 474], roof: -432, roofX: 0, belt: -238, bump: -70, cab: [0, -300], bus: true,
    body: [[-748, -44, 10], [-753, -120, 16], [-750, -404, 26], [-722, -432, 28], [690, -432, 36], [738, -404, 20], [752, -300, 14], [753, -118, 14], [744, -44, 10]],
    glass: [
      ...[0, 1, 2, 3, 4, 5].map((i) => { const x0 = -704 + i * 186; return [[x0, -252, 6], [x0, -388, 8], [x0 + 166, -388, 8], [x0 + 166, -252, 6]]; }),
      [[496, -80, 4], [496, -392, 8], [596, -392, 8], [596, -80, 4]],
      [[620, -214, 8], [620, -408, 14], [700, -408, 22], [742, -380, 14], [744, -214, 8]],
    ],
    doors: [546], head: [722, -150, 34, 24], tail: [-758, -176, 16, 46],
  },
};
KINDS.taxi = { ...KINDS.sedan, taxi: true };

export function carSize(kind = 'sedan', s = 1) {
  const K = KINDS[kind] || KINDS.sedan;
  return { len: K.len * s, h: -K.roof * s, R: K.R * s };
}

const SHAPES = new Map();
function shape(kind) {
  let S = SHAPES.get(kind);
  if (S) return S;
  const K = KINDS[kind];
  const body = rpoly(K.body), glass = K.glass.map((g) => rpoly(g));
  const seams = new Path2D();
  for (const dx of K.doors) { seams.moveTo(dx, K.belt + 2); seams.lineTo(dx + (dx > 0 ? 4 : -2), K.bump + 4); }
  const handles = new Path2D();
  if (!K.bus) for (const dx of K.doors.slice(0, -1)) handles.addPath(rrect(dx + 40, K.belt + 24, 30, 8, 4));
  // highlight streak per pane (inside the pane's bounding box)
  const streak = new Path2D();
  for (const g of K.glass) {
    const xs = g.map((q) => q[0]), ys = g.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), w = x1 - x0, h = y1 - y0;
    streak.moveTo(x0 + w * 0.32, y0); streak.lineTo(x0 + w * 0.5, y0); streak.lineTo(x0 + w * 0.26, y1); streak.lineTo(x0 + w * 0.08, y1); streak.closePath();
  }
  // rust patches: blobs anywhere on the lower body
  const rr = RNG(kind.length * 31 + 7), rustP = [];
  for (let i = 0; i < 9; i++) rustP.push([rr.range(-K.len * 0.45, K.len * 0.45), rr.range(K.belt + 10, -50), rr.range(18, 46), rr()]);
  S = { K, body, glass, seams, handles, streak, rustP };
  SHAPES.set(kind, S);
  return S;
}

function wheelDraw(c, x, cy, R, ang, rimCol, ink, lw, flat, gone) {
  const tyreR = lerp(R, R * 0.72, gone);
  c.save();
  // flattened bottom: clip the tyre at the ground line
  c.beginPath(); c.rect(x - R * 1.4, cy - R * 1.4, R * 2.8, -cy + R * 1.4 + 0.5); c.clip();
  const tyre = circle(x, cy, tyreR + flat * R * 0.06);
  fill(c, tyre, lin(c, 0, cy - R, 0, cy + R, [[0, mix('#3a3b42', '#4a3a2c', gone)], [1, mix('#1d1e22', '#2e241c', gone)]]));
  const rim = circle(x, cy, R * 0.6);
  fill(c, rim, lin(c, x - R, cy - R, x + R, cy + R, [[0, tone(rimCol, 0.35)], [0.5, rimCol], [1, tone(rimCol, -0.35)]]));
  c.strokeStyle = tone(rimCol, -0.45); c.lineWidth = R * 0.07; c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i < 5; i++) { const a = ang + (i * TAU) / 5; c.moveTo(x + Math.cos(a) * R * 0.16, cy + Math.sin(a) * R * 0.16); c.lineTo(x + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5); }
  c.stroke();
  fill(c, circle(x, cy, R * 0.16), tone(rimCol, 0.2));
  line(c, rim, alpha(tone(rimCol, -0.5), 0.8), lw * 0.6);
  line(c, tyre, ink, lw);
  c.restore();
}

function vehicle(c, o, kindKey) {
  const S = shape(kindKey), K = S.K;
  const s = o.s ?? 1, flip = (o.flip ?? 1) < 0 ? -1 : 1, years = Math.max(0, o.years ?? 0), seed = o.seed ?? 1, t = o.t ?? 0;
  const L = K.len, R = K.R;
  let base = CAR_COLORS[o.color] || o.color || (K.taxi ? CAR_COLORS.yellow : K.bus ? CAR_COLORS.blue : CAR_COLORS.red);
  const fade = ss(0.5, 40, years), rust = ss(1.5, 70, years), dust = clamp(ss(0, 0.05, years) * 0.3 + ss(0.05, 4, years) * 0.4 - ss(30, 120, years) * 0.35);
  const flat = ss(0.3, 5, years), gone = ss(15, 60, years), broken = ss(3, 25, years), sink = ss(80, 200, years);
  const plants = o.plants === false ? 0 : ss(9, 30, years), mossK = ss(45, 130, years);
  base = mix(sat(base, 1 - 0.55 * fade), '#8a5234', rust * 0.62);
  const ink = mix(tone(base, -0.62), '#2a1a12', 0.15), lw = inkW(s) * (K.bus ? 1.15 : 1);
  const drop = flat * R * 0.14 + gone * R * 0.28 + sink * R * 1.6;
  const lights = clamp(o.lights ?? 0), brake = clamp(o.brake ?? 0);
  const out = {
    roof: [(o.x ?? 0) + flip * K.roofX * s, (o.y ?? 0) + (K.roof + drop) * s],
    x0: (o.x ?? 0) - (L / 2) * s, x1: (o.x ?? 0) + (L / 2) * s,
    head: [(o.x ?? 0) + flip * (K.head[0] + K.head[2] / 2) * s, (o.y ?? 0) + (K.head[1] + K.head[3] / 2 + drop) * s],
    tail: [(o.x ?? 0) - flip * (L / 2) * s, (o.y ?? 0) + (K.tail[1] + K.tail[3] / 2 + drop) * s],
  };
  c.save();
  c.translate(o.x ?? 0, o.y ?? 0);
  if (o.rot) c.rotate(o.rot);
  c.scale(s, s);
  if (o.shadow !== false) shadow(c, 0, 2, L * 0.56, 22, 0.34 * (1 - sink * 0.8));
  c.save();
  c.scale(flip, 1);
  c.beginPath(); c.rect(-L, -1200, L * 2, 1201); c.clip();   // nothing below the ground (sinking)
  c.translate(0, drop);
  // wheel wells
  clipped(c, S.body, () => { for (const wx of K.wheels) fill(c, circle(wx, -R, R * 1.16), '#1b1c21'); });
  // paint
  const top = tone(base, 0.24), bot = tone(base, -0.3);
  clipped(c, S.body, () => {
    c.fillStyle = lin(c, 0, K.roof, 0, -36, [[0, top], [0.45, base], [1, bot]]);
    c.fillRect(-L, K.roof - 10, L * 2, -K.roof + 20);
    for (const wx of K.wheels) fill(c, circle(wx, -R, R * 1.16), '#1b1c21');
    if (K.bus) {
      c.fillStyle = lin(c, 0, K.roof, 0, K.belt, [[0, mix('#fbfaf5', base, rust * 0.5)], [1, mix('#d9d6cc', base, rust * 0.5)]]);
      c.fillRect(-L, K.roof - 10, L * 2, K.belt - K.roof + 10);
      fill(c, rrect(-L, K.belt - 8, L * 2, 12, 0), tone(base, -0.15));
    }
    if (K.taxi) {
      c.fillStyle = '#26282e';
      for (let i = 0; i < 26; i++) c.fillRect(-390 + i * 30, -132 + (i % 2) * 10, 15, 10);
    }
    // form shadow low on the body + rim light along the top
    c.fillStyle = lin(c, 0, -130, 0, -36, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.22)']]);
    c.fillRect(-L, -130, L * 2, 100);
    c.save(); c.beginPath(); c.rect(-L, K.roof - 20, L * 2, K.belt - K.roof + 30); c.clip();
    line(c, S.body, alpha(tone(base, 0.55), 0.55), 9);
    c.restore();
    fill(c, rrect(-L, K.bump, L * 2, 40, 0), tone(base, -0.42));
    // rust and dust
    if (rust > 0.02) for (const [rx, ry, r0, h] of S.rustP) {
      const r1 = r0 * clamp(rust * 1.6 - h * 0.5) * (1 + rust);
      if (r1 > 1) { fill(c, circle(rx, ry, r1), alpha('#7a3f22', 0.75)); fill(c, circle(rx - r1 * 0.2, ry - r1 * 0.2, r1 * 0.55), alpha('#a85a2c', 0.6)); }
    }
  });
  // glass
  const glassTop = mix('#9cbad0', '#c9b896', dust * 0.6), glassBot = mix('#34495e', '#7a6c55', dust * 0.5);
  S.glass.forEach((gp, i) => {
    const isBroken = hash(seed * 7.3 + i, 11) < broken;
    if (isBroken) {
      fill(c, gp, '#1c1f26');
      clipped(c, gp, () => {
        const r = RNG(seed * 13 + i * 5), xs = K.glass[i].map((q) => q[0]), ys = K.glass[i].map((q) => q[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        c.fillStyle = alpha(glassTop, 0.75 * (1 - gone));
        c.beginPath();
        c.moveTo(x0, y0); c.lineTo(x0 + (x1 - x0) * r.range(0.2, 0.5), y0); c.lineTo(x0, y0 + (y1 - y0) * r.range(0.3, 0.7)); c.closePath();
        c.moveTo(x1, y1); c.lineTo(x1 - (x1 - x0) * r.range(0.2, 0.4), y1); c.lineTo(x1, y1 - (y1 - y0) * r.range(0.3, 0.6)); c.closePath();
        c.fill();
      });
    } else {
      fill(c, gp, lin(c, 0, K.roof, 0, K.belt, [[0, glassTop], [1, glassBot]]));
      clipped(c, gp, () => fill(c, S.streak, alpha('#ffffff', 0.22 * (1 - dust))));
    }
    line(c, gp, alpha(ink, 0.7), lw * 0.7);
  });
  line(c, S.seams, alpha(ink, 0.55), lw * 0.7);
  fill(c, S.handles, tone(base, -0.3));
  // lights
  const [hx, hy, hw, hh] = K.head, [tx, ty, tw, th] = K.tail;
  fill(c, rrect(hx, hy, hw, hh, 7), lights > 0 ? mix('#efe8d0', '#fffbea', lights) : mix('#efe8d0', '#8a7c60', rust));
  fill(c, rrect(tx, ty, tw, th, 6), mix(mix('#a8322b', '#ff4b3a', Math.max(lights * 0.7, brake)), '#5a3020', rust * 0.6));
  if (K.taxi) {
    const sp = rrect(-70, K.roof - 34, 120, 32, 8);
    fill(c, sp, lin(c, 0, K.roof - 34, 0, K.roof, [[0, '#fff3c8'], [1, '#e8c867']]));
    line(c, sp, ink, lw * 0.8);
    c.save(); c.translate(-10, K.roof - 17); c.scale(flip, 1);
    txt(c, 'TAXI', 0, 1, { size: 22, color: mix('#2a2a2a', '#6a5a40', fade), font: 'Barlow Condensed', weight: 800 });
    c.restore();
  }
  if (K.bus) {
    const sp = rrect(560, K.roof + 14, 170, 34, 6);
    fill(c, sp, '#1e2127');
    c.save(); c.translate(645, K.roof + 31); c.scale(flip, 1);
    txt(c, '24  CENTRAL', 0, 1, { size: 22, color: lights > 0 || years < 0.003 ? '#ffb347' : '#5a4a2c', font: 'Barlow Condensed', weight: 700, track: 1 });
    c.restore();
  }
  // dust / moss film over the paint
  if (dust > 0.02 || mossK > 0.02) clipped(c, S.body, () => {
    if (dust > 0.02) { c.fillStyle = lin(c, 0, K.roof, 0, -36, [[0, alpha('#c9b48c', dust * 0.62)], [0.5, alpha('#b8a27a', dust * 0.3)], [1, alpha('#8a7454', dust * 0.4)]]); c.fillRect(-L, K.roof - 10, L * 2, -K.roof + 20); }
    if (mossK > 0.02) { c.fillStyle = lin(c, 0, K.roof, 0, -36, [[0, alpha(LEAF.mid, mossK * 0.75)], [0.4, alpha(LEAF.dark, mossK * 0.35)], [1, alpha(LEAF.deep, mossK * 0.5)]]); c.fillRect(-L, K.roof - 10, L * 2, -K.roof + 20); }
  });
  line(c, S.body, ink, lw);
  // wheels (the far-side tyres are hidden behind the body)
  const rimCol = mix('#c9ced6', '#7a4a2e', rust * 0.85);
  const wheel = o.wheel ?? 0;
  for (const wx of K.wheels) wheelDraw(c, wx, -R + flat * R * 0.14 + gone * R * 0.28 - drop + drop, R, wheel, rimCol, ink, lw, flat, gone);
  c.restore();
  // vegetation (unflipped so the light stays upper-left)
  if (plants > 0.01 || mossK > 0.02) {
    const cx = flip * K.cab[0], cy = K.cab[1] + drop;
    if (mossK > 0.02) mossLine(c, -L * 0.25, L * 0.2, K.roof + drop + 4, { seed: seed + 3, h: 10 + 8 * mossK, colors: [LEAF.dark, LEAF.mid] });
    if (plants > 0.01) {
      bush(c, cx, cy + 40, { w: (K.bus ? 520 : 300) * plants, h: (K.bus ? 230 : 170) * plants * (1 + mossK * 0.3), seed: seed + 5, t });
      if (years > 40) tree(c, cx + 30, cy + 30, { h: (K.bus ? 900 : 640) * ss(40, 160, years), seed: seed + 9, t, kind: 'round', shadow: 0 });
      grass(c, -L * 0.55, L * 0.55, 2, { h: 26 + 60 * plants, seed: seed + 1, t, density: 0.22 + 0.2 * plants });
    }
  }
  c.restore();
  return out;
}

export function drawCar(c, o = {}) { return vehicle(c, o, KINDS[o.kind] && o.kind !== 'bus' ? o.kind : 'sedan'); }
export function drawBus(c, o = {}) { return vehicle(c, o, 'bus'); }

// Shopping trolley, ≈ 190 long × 185 tall at s 1, handle at the back (left when flip = 1).
const TROLLEY = (() => {
  const basket = rpoly([[-88, -176, 6], [96, -176, 6], [80, -86, 6], [-70, -86, 6]]);
  const mesh = new Path2D();
  for (let x = -76; x <= 86; x += 15) { const u = (x + 88) / 184; mesh.moveTo(x, -174); mesh.lineTo(lerp(-70, 80, u) + (x - lerp(-88, 96, u)) * 0.1, -88); }
  for (let y = -160; y <= -95; y += 16) { const u = (y + 176) / 90; mesh.moveTo(lerp(-88, -70, u), y); mesh.lineTo(lerp(96, 80, u), y); }
  const frame = new Path2D();
  frame.moveTo(-70, -86); frame.lineTo(-58, -26); frame.lineTo(72, -26); frame.lineTo(80, -86);
  frame.moveTo(-88, -176); frame.lineTo(-112, -192);
  frame.moveTo(-58, -26); frame.lineTo(-64, -14); frame.moveTo(72, -26); frame.lineTo(66, -14);
  return { basket, mesh, frame };
})();
export function drawTrolley(c, o = {}) {
  const s = o.s ?? 1, flip = (o.flip ?? 1) < 0 ? -1 : 1, years = o.years ?? 0, rust = ss(0.5, 40, years), seed = o.seed ?? 1;
  const metal = mix('#c3cad3', '#8a5432', rust * 0.85), ink = tone(metal, -0.6), lw = inkW(s) * 0.9;
  c.save();
  c.translate(o.x ?? 0, o.y ?? 0); if (o.rot) c.rotate(o.rot); c.scale(s * flip, s);
  if (o.shadow !== false) shadow(c, 0, 1, 110, 12, 0.3);
  fill(c, TROLLEY.basket, alpha(tone(metal, -0.25), 0.18));
  line(c, TROLLEY.mesh, metal, 2.6);
  line(c, TROLLEY.frame, ink, 7.5); line(c, TROLLEY.frame, metal, 4.2);
  line(c, TROLLEY.basket, ink, lw + 3); line(c, TROLLEY.basket, metal, 3.6);
  const grip = rrect(-126, -202, 26, 18, 7);
  fill(c, grip, mix('#d8443a', '#6a3a2a', ss(1, 30, years))); line(c, grip, ink, lw);
  const lost = years > 8 && hash(seed, 4) > 0.4;
  for (const wx of [-64, 66]) {
    if (lost && wx > 0) continue;
    const w = circle(wx, -12, 12);
    fill(c, w, '#2b2c31'); line(c, w, ink, lw * 0.8); fill(c, circle(wx, -12, 4), metal);
  }
  if (years > 15) grass(c, -110, 110, 1, { h: 30 + 50 * ss(15, 60, years), seed: seed + 2, density: 0.3 });
  c.restore();
}
