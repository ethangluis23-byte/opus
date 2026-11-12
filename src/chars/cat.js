// Cat rig: side-view body with a three-quarter head — the feline counterpart of drawDog (src/chars/dog.js). One rig
// covers the hero orange tabby, its feral descendants and the other cats of the film; a house mouse sits at the end.
//
// drawCat(c, {
//   x, y, s, flip   ground point under the body, scale, facing (1 right, -1 left). s 1 = 45 units to the shoulder,
//                   ~68 to the ear tips, ~72 nose to rump, tail ~50 (the dog at s 1 is 100 to the shoulder).
//   t, seed         seconds (breathing, blinks, happy slow-blinks, ear twitches, tail sway, whiskers) and de-sync seed
//   v               key of CATS or a variant object merged over CATS.orange (default 'orange'; reuse the same object)
//   pose            'stand' | 'sit' | 'loaf' | 'curl' | 'crouch' | 'leap' | 'arch' | 'lie', or [from, to, k] to blend.
//                   Default 'stand' ('curl' when mood is 'asleep', a stalking half-crouch when gait is 'stalk').
//                   sit: upright, tail wrapped round the paws · loaf: paws tucked · curl: sleeping ball, tail round the
//                   front · crouch: low hunting crouch, shoulder blades and haunches up, head low · arch: Halloween arch
//                   (stiff legs, humped back, fur and tail puffed — pair with mood 'angry') · lie: sphinx, side view.
//   k, air          leap: k 0..1 = take-off push (hind paws on the ground) → stretched in the air (0.5) → landing reach
//                   (front paws touch the ground at k 1); air = apex height in units (scaled by s): the body rides
//                   air * sin(PI k) above the ground point. Move x yourself (lerp y too when landing on a table).
//   gait, phase     'walk' | 'trot' | 'run' | 'stalk' and cycle phase; advance phase by distance / catStride(gait, v, s)
//                   and the feet stay planted. Gaits drive 'stand' and 'crouch' (and blends between them).
//   mood            'neutral' | 'curious' | 'alert' | 'hunting' | 'scared' | 'angry' | 'sleepy' | 'asleep' | 'happy'
//   look            [dx, dy] gaze -1..1 (dx > 0 = forward; default [0.3, 0.05])     tilt   radians of head tilt
//   mouth           0..1 jaw open (a meow ~0.5; a hiss with bared fangs when mood is 'angry' or hiss: true)
//   paw             0..1 raise the near front paw (animate 0 → 1 → 0 to tap a bowl / bat at something)
//   eyeShine        0..1 night eye-shine: glowing green-gold eyes with a halo (see anchors.eyes to re-glow after grade)
//   tailFlick       0..1 tail-tip twitching (mood default; hunting 0.6)    pupil   0..1 dilation override (1 = round)
//   wet             0..1 rain-soaked: darker clumped fur, slimmer spiky tail, glossy streaks
//   slope           body pitch in radians (> 0 = nose down, e.g. walking down stairs; < 0 = climbing); the feet land
//                   on the inclined line through the ground point. Move (x, y) along the incline (y += dx * tan(slope)
//                   when facing right) and keep phase = horizontal distance / catStride: the paws stay planted.
//   ear, lid, blink overrides: ears -1 (flat) .. 1 (pricked forward), upper lid 0..1, blink signal 0..1
//   shadow          contact shadow: true (default, 0.3) | false | strength
// }) → anchors in the caller's coordinates: { eyes: [[x, y] near, [x, y] far], eyeR (world radius of the near eye),
//      nose, head, top (y of the ear tips), tail (tip), paws: { nf, ff, nh, fh } (contact points) }.
//      Night shots: draw the cat in the scene, then after g.grade(look): glow(c, ...eyes[i], eyeR * 3, '#c8ff5a', a).
//
// CATS                    orange (hero: #f08a24 tabby, cream chest/muzzle/paws, green eyes, pink nose),
//                         orange20 / orange50 / orange200 (feral line: leaner, scruffier, notched ear, duller coat),
//                         tuxedo (black, white bib/paws/muzzle, yellow eyes), grey (grey tabby)
// catStride(gait, v, s)   world distance covered per gait cycle
//
// drawMouse(c, { x, y, s, flip, t, seed, pose: 'stand' | 'run' | 'sniff', run (truthy → 'run'), phase, look, shadow })
//                         brown-grey house mouse, ~8 units tall and ~14 long (+ tail) at s 1, facing right at flip 1.
//                         Returns { nose, eye } anchors.
// mouseStride(s)          distance per run cycle (advance phase by distance / mouseStride(s))
import { Path2D } from '@napi-rs/canvas';
import { blob, capsule, oval, union, fill, line, clipped, lin, rad, shadow, ik2, glow } from '../engine/draw.js';
import { TAU, clamp, lerp, smooth, ease, hash, noise1, mix, alpha } from '../engine/util.js';
import { eye, blink, gaitFoot, GAITS, inkW } from './rig.js';

const PI = Math.PI;
const U = 0.5; // the rig is authored at 2x: 90 design units to the shoulder → 45 units at s 1

export const CATS = {
  // The hero: orange tabby with cream chest, muzzle and paws.
  orange: { coat: '#f08a24', dark: '#c35d17', light: '#ffb867', cream: '#fde3bf', stripe: '#c4561a', line: '#5a2a0c', nose: '#f2939b',
    iris: '#7cc243', ear: '#f6a7a2', tabby: 1, bib: 0, socks: 0.55, lean: 0, scruff: 0, notch: 0, legK: 1, size: 1 },
  // Feral descendants: nearly unchanged — a touch leaner, scruffier, a notched ear, a slightly duller coat.
  orange20: { coat: '#e98a2e', dark: '#bb5d1b', light: '#f9b46b', cream: '#f8dfbb', stripe: '#bb561f', line: '#58290d', nose: '#e8939a',
    iris: '#7cbd45', ear: '#eea6a2', tabby: 1, bib: 0, socks: 0.5, lean: 0.25, scruff: 0.45, notch: 1, legK: 1.01, size: 1 },
  orange50: { coat: '#e28a35', dark: '#b45f20', light: '#f2b06e', cream: '#f3dbb7', stripe: '#b25826', line: '#56290f', nose: '#e2949a',
    iris: '#7db948', ear: '#e9a6a2', tabby: 1, bib: 0, socks: 0.45, lean: 0.32, scruff: 0.6, notch: 1, legK: 1.02, size: 1 },
  orange200: { coat: '#da893c', dark: '#ab6025', light: '#ebad71', cream: '#eed7b3', stripe: '#a9592b', line: '#542a11', nose: '#dc949a',
    iris: '#80b64a', ear: '#e4a5a2', tabby: 1, bib: 0, socks: 0.4, lean: 0.38, scruff: 0.7, notch: 1, legK: 1.03, size: 1 },
  // Other cats.
  tuxedo: { coat: '#302f37', dark: '#1b1a20', light: '#5c5b68', cream: '#f6f4ef', stripe: null, line: '#0c0b0f', nose: '#d98c96',
    iris: '#efc331', ear: '#c78b92', inner: '#77758a', whisk: 'rgba(246,244,239,0.85)', tabby: 0, bib: 1, socks: 1,
    lean: 0.05, scruff: 0.1, notch: 0, legK: 1, size: 0.97 },
  grey: { coat: '#8f949c', dark: '#5d626b', light: '#c0c5cc', cream: '#efeee9', stripe: '#4b5058', line: '#22252b', nose: '#c98d93',
    iris: '#c3c43c', ear: '#e6a6a6', tabby: 1, bib: 0, socks: 0.5, lean: 0.1, scruff: 0.15, notch: 0, legK: 1, size: 0.95 },
};
const MERGED = new WeakMap();
function catVariant(v) {
  if (typeof v === 'string') return CATS[v] || CATS.orange;
  if (!v) return CATS.orange;
  let V = MERGED.get(v);
  if (!V) MERGED.set(v, (V = { ...CATS.orange, ...v }));
  return V;
}

// Derived colour strings per variant and wetness (parsing CSS colours is a measurable cost per frame).
const PALS = new WeakMap();
function palette(V, wet) {
  const wk = Math.round(clamp(wet) * 20);
  let byWet = PALS.get(V);
  if (!byWet) PALS.set(V, (byWet = new Map()));
  let Q = byWet.get(wk);
  if (Q) return Q;
  const w = wk / 20, L = V.line, inner = V.inner || L;
  const coat = w ? mix(V.coat, V.dark, w * 0.5) : V.coat, dark = w ? mix(V.dark, L, w * 0.3) : V.dark;
  const light = w ? mix(V.light, V.coat, w * 0.55) : V.light, cream = w ? mix(V.cream, V.dark, w * 0.22) : V.cream;
  const stripe = V.stripe ? (w ? mix(V.stripe, L, w * 0.3) : V.stripe) : null, sk = V.socks ?? 0;
  Q = { coat, dark, light, cream, stripe, L, inner, w,
    far: mix(dark, L, 0.12), farSock: mix(cream, '#8d8a96', 0.35), lid: mix(coat, light, 0.25), legMid: mix(coat, dark, 0.3),
    tailTop: mix(coat, light, 0.35), headTop: mix(coat, light, 0.6), headBot: mix(coat, dark, 0.5),
    earTop: mix(coat, light, 0.45), farEarTop: mix(coat, dark, 0.25), farEarBot: mix(coat, dark, 0.45), farEarIn: mix(V.ear, dark, 0.35),
    earTuft: alpha(mix(cream, '#ffffff', 0.5), 0.85), coat0: alpha(coat, 0), dark0: alpha(dark, 0), shade: alpha(mix(dark, L, 0.3), 0.42),
    stripeA: stripe && alpha(stripe, 0.7), stripeT: stripe && alpha(stripe, 0.75), stripeTip: stripe && alpha(stripe, 0.8),
    stripeL: stripe && alpha(stripe, 0.6), stripeH: stripe && alpha(stripe, 0.85),
    cream0: alpha(cream, 0), creamA: alpha(cream, 0.95), creamB: alpha(cream, 0.76), creamC: alpha(cream, 0.85), creamD: alpha(cream, 0.5),
    creamE: alpha(cream, 0.55), sockA: alpha(cream, sk), sockB: alpha(cream, sk * 0.75),
    toe: alpha(inner, 0.7), dot: alpha(inner, 0.45), whisk: V.whisk || alpha(L, 0.55), gloss: alpha('#ffffff', 0.32 * w),
    hl: 'rgba(255,255,255,0.55)', mouthIn: '#5e1c22', tongue: '#ef8b98', fang: '#fffaf0', pads: '#e9919a' };
  byWet.set(wk, Q);
  return Q;
}

// Rig gaits: the shared GAITS rescaled to the cat's legs (design units).
const CG = {};
for (const [k, g] of Object.entries(GAITS)) { // strides kept inside the legs' reach so planted paws never lift
  const f = { walk: 0.8, stalk: 0.8, trot: 0.7, run: 0.62 }[k] ?? 0.8;
  CG[k] = { ...g, stride: g.stride * f, lift: g.lift * (k === 'run' ? 0.6 : 0.8), bob: g.bob * (k === 'run' ? 0.3 : 0.8) };
}

// World distance per gait cycle. gaitFoot slides a planted foot back by `stride` over the stance fraction `duty`,
// so the body must advance stride / duty per cycle for the paws to stay put.
export function catStride(gait = 'walk', v = 'orange', s = 1) {
  const V = catVariant(v), g = CG[gait] || CG.walk;
  return (g.stride / g.duty) * (V.legK ?? 1) * U * (V.size ?? 1) * s;
}

// Mood table. ear -1..1, lid / low (lower lid), ang = lid slant (+ inner corners down = stern, - = worried),
// pupil = slit dilation, whisk = whisker angle, tail = TAILS style, sway/flick = tail life, head offset/rotation.
const MOODS = {
  neutral: { ear: 0, lid: 0.12, low: 0, ang: 0.1, pupil: 0.38, mouth: 0, whisk: 0, tail: 'up', sway: 1, flick: 0.12, head: [0, 0], hrot: 0, puff: 0 },
  curious: { ear: 0.6, lid: 0, low: 0, ang: -0.06, pupil: 0.62, mouth: 0, whisk: 0.5, tail: 'hook', sway: 0.8, flick: 0.25, head: [3, -3], hrot: 0, puff: 0 },
  alert: { ear: 1, lid: 0, low: 0, ang: 0.04, pupil: 0.5, mouth: 0, whisk: 0.4, tail: 'up', sway: 0.45, flick: 0.2, head: [2, -6], hrot: -0.04, puff: 0 },
  hunting: { ear: 0.85, lid: 0.1, low: 0.24, ang: 0.16, pupil: 0.97, mouth: 0, whisk: 0.85, tail: 'low', sway: 0.25, flick: 0.6, head: [6, 7], hrot: 0.06, puff: 0 },
  scared: { ear: -0.85, lid: 0, low: 0, ang: -0.3, pupil: 1, mouth: 0.08, whisk: -0.7, tail: 'tuck', sway: 0.2, flick: 0.1, head: [-4, 7], hrot: 0.08, puff: 0.55 },
  angry: { ear: -1, lid: 0.24, low: 0.3, ang: 0.42, pupil: 0.26, mouth: 0.8, hiss: 1, whisk: -0.8, tail: 'lash', sway: 1, swaySpeed: 3.4, flick: 0.4, head: [2, 4], hrot: 0.04, puff: 0.7 },
  sleepy: { ear: -0.12, lid: 0.62, low: 0.18, ang: 0.05, pupil: 0.4, mouth: 0, whisk: -0.1, tail: 'down', sway: 0.35, flick: 0.05, head: [0, 4], hrot: 0.08, puff: 0 },
  asleep: { ear: -0.2, lid: 1, low: 0, ang: 0, pupil: 0.4, mouth: 0, whisk: -0.2, tail: 'down', sway: 0.12, flick: 0.08, head: [0, 5], hrot: 0.12, puff: 0, sleep: 1 },
  happy: { ear: 0.15, lid: 0.3, low: 0.2, ang: 0.08, pupil: 0.45, mouth: 0, whisk: 0.15, tail: 'hook', sway: 0.9, flick: 0.2, head: [0, -2], hrot: -0.03, puff: 0, slow: 1 },
};

// Tail carriage: a0 = base direction (canvas radians for a cat facing right; PI = straight back), c0 / c1 = turn per
// segment at the base / tip (+ curls up and over, - curls down and under).
const TAILS = {
  up: { a0: PI + 1.0, c0: 0.07, c1: 0.32 },
  hook: { a0: PI + 1.38, c0: 0, c1: 0.62 },
  low: { a0: PI + 0.1, c0: -0.02, c1: 0.1 },
  down: { a0: PI - 0.6, c0: 0.07, c1: 0.2 },
  tuck: { a0: PI - 1.15, c0: -0.16, c1: -0.18 },
  lash: { a0: PI + 0.45, c0: 0.1, c1: -0.2 },
};
const RUN_TAIL = { a0: PI + 0.3, c0: 0.02, c1: 0.12 };

// Pose table (design units, ground at y 0, facing +x). hip / sh = spine end joints; arch = dorsal hump (archV share of
// it applied to the belly); belly = depth factor; back = dorsal thickness; froot = front-leg root offset from sh;
// ftar = front paw target; fl = front leg length factor; fpa / hpa = paw angles; hk = knee offset from hip;
// htar = hind paw target; haunch = [dx, dy, rx, ry, rot] from hip; head = head offset from the neck base; hrot = head
// rotation; gait = how much a gait drives the legs; puff = fur raised; tail = carriage override (front 1 = drawn over
// the body, 2 = over the head too; base = [a, b] spine coords of the root).
const P0 = { arch: 0, archV: 0, belly: 1, back: 19, fl: 1, fpa: 0, hpa: 0, hrot: 0, gait: 0, puff: 0, lift: 0, tail: null };
const POSES = {
  stand: { ...P0, hip: [-35, -66], sh: [35, -64], arch: 3, froot: [2, 10], ftar: [37, 0], hk: [11, 28], htar: [-37, 0],
    haunch: [3, 9, 17, 21, -0.25], head: [14, -22], gait: 1 },
  sit: { ...P0, hip: [-22, -24], sh: [18, -74], froot: [3, 7], ftar: [27, 0], fl: 1.13, hk: [30, 6], htar: [13, -1],
    haunch: [9, 3, 25, 22, 0.1], head: [8, -22], hrot: -0.05, tail: { a0: PI - 0.75, c0: -0.36, c1: -0.26, front: 1, base: [-0.3, -4] } },
  loaf: { ...P0, hip: [-32, -30], sh: [28, -32], belly: 1.06, back: 21, froot: [0, 6], ftar: [39, -3], hk: [22, 14], htar: [-6, -3],
    haunch: [6, 6, 22, 21, 0], head: [6, -17], tail: { a0: PI - 1.1, c0: -0.42, c1: -0.2, front: 1, base: [-0.3, -6] } },
  curl: { ...P0, hip: [-24, -24], sh: [16, -24], arch: 16, back: 20, froot: [0, 4], ftar: [28, -3], hk: [20, 12], htar: [4, -3],
    haunch: [4, 4, 23, 19, 0], head: [12, 10], hrot: 0.5, tail: { a0: PI - 1.15, c0: -0.3, c1: -0.1, front: 2, base: [-0.3, -12] } },
  crouch: { ...P0, hip: [-32, -42], sh: [28, -32], froot: [0, -14], ftar: [46, 0], hk: [14, 22], htar: [-26, 0],
    haunch: [2, 8, 18, 21, -0.1], head: [22, 8], hrot: 0.05, gait: 1 },
  arch: { ...P0, hip: [-26, -80], sh: [24, -68], arch: 22, archV: 0.85, froot: [0, 8], ftar: [16, 0], hk: [6, 30], htar: [-14, 0],
    haunch: [2, 8, 16, 19, -0.15], head: [16, 0], hrot: 0.1, puff: 1, tail: { a0: PI + 1.45, c0: -0.02, c1: -0.06, front: 0, base: [-0.27, 8] } },
  lie: { ...P0, hip: [-34, -26], sh: [30, -30], froot: [2, 6], ftar: [78, -3.5], hk: [26, 10], htar: [6, -3], haunch: [8, 6, 23, 20, 0],
    head: [10, -16], tail: { a0: PI + 0.05, c0: 0, c1: 0.12, front: 0, base: [-0.27, -2] } },
};
// Leap keys: take-off (k 0), stretched flight (k 0.5), landing reach (k 1).
const LEAP = [
  { ...P0, hip: [-22, -54], sh: [32, -84], froot: [2, 6], ftar: [54, -54], fpa: 1.1, hk: [-10, 22], htar: [-56, 0], hpa: 0.5,
    haunch: [2, 8, 17, 21, 0.3], head: [12, -16], hrot: -0.15, tail: { a0: PI + 0.2, c0: 0.04, c1: 0.1, front: 0, base: [-0.27, 8] } },
  { ...P0, hip: [-42, -58], sh: [40, -62], froot: [4, 6], ftar: [90, -36], fpa: 0.25, hk: [-6, 20], htar: [-96, -30], hpa: 2.2,
    haunch: [2, 8, 17, 20, -0.4], head: [20, -8], hrot: 0.05, tail: { a0: PI + 0.1, c0: 0.02, c1: 0.06, front: 0, base: [-0.27, 8] } },
  { ...P0, hip: [-30, -76], sh: [34, -52], froot: [2, 7], ftar: [58, 0], fpa: -0.2, hk: [16, 20], htar: [-4, -34], hpa: 0.9,
    haunch: [2, 8, 17, 21, -0.5], head: [16, -12], hrot: 0.12, tail: { a0: PI + 0.7, c0: 0.05, c1: 0.2, front: 0, base: [-0.27, 8] } },
];

function blendPose(A, B, k) {
  if (k <= 0) return A;
  if (k >= 1) return B;
  const o = {};
  for (const key in A) {
    const a = A[key], b = B[key];
    if (typeof a === 'number') o[key] = lerp(a, b, k);
    else if (Array.isArray(a)) o[key] = a.map((v, i) => lerp(v, b[i], k));
    else o[key] = k < 0.5 ? a : b;
  }
  return o;
}
function blendTail(A, B, k) {
  if (A === B || k <= 0) return A;
  if (k >= 1) return B;
  return { a0: lerp(A.a0, B.a0, k), c0: lerp(A.c0, B.c0, k), c1: lerp(A.c1, B.c1, k), front: k < 0.5 ? A.front : B.front,
    base: [lerp(A.base[0], B.base[0], k), lerp(A.base[1], B.base[1], k)] };
}
function onePose(name, k) {
  if (name !== 'leap') return POSES[name] || POSES.stand;
  const A = k < 0.5 ? LEAP[0] : LEAP[1], B = k < 0.5 ? LEAP[1] : LEAP[2], u = smooth(k < 0.5 ? k * 2 : k * 2 - 1);
  return { ...blendPose(A, B, u), tail: blendTail(A.tail, B.tail, u), lift: Math.sin(PI * k) };
}
function resolvePose(pose, k, MT) {
  if (Array.isArray(pose)) {
    const A = onePose(pose[0], k), B = onePose(pose[1], k), w = clamp(pose[2]);
    return { ...blendPose(A, B, w), tail: blendTail(A.tail || MT, B.tail || MT, w) };
  }
  const P = onePose(pose, k);
  return P.tail ? P : { ...P, tail: MT };
}

// Happy cats slow-blink: lids sink shut, hold, and reopen every few seconds.
function slowBlink(t, seed) {
  const per = 5.2, u = (((t + hash(seed, 4) * per) % per) + per) % per;
  if (u < 0.55) return smooth(u / 0.55);
  if (u < 1.0) return 1;
  if (u < 1.7) return 1 - smooth((u - 1.0) / 0.7);
  return 0;
}
// Ear flicks: one ear snaps back briefly every few seconds.
function earTwitch(t, seed) {
  const per = 3.9, k = t / per + hash(seed, 11), i = Math.floor(k), u = (k - i) * per, at = hash(i, seed + 13) * (per - 0.4);
  const d = u - at, amt = d > 0 && d < 0.3 ? Math.sin((d / 0.3) * PI) : 0;
  return hash(i, seed + 19) < 0.5 ? { near: amt, far: 0 } : { near: 0, far: amt };
}

// ---- path builders that append to one Path2D (explicit moveTo per contour; every contour runs clockwise, so a
// nonzero fill / clip of the combined path is the union of its parts without boolean ops) ----
function addBlob(p, pts, closed = true) {
  const n = pts.length, at = (i) => (closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)]);
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0, m = closed ? n : n - 1; i < m; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2), s1 = p1[2] ? 0 : 1 / 6, s2 = p2[2] ? 0 : 1 / 6;
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * s1, p1[1] + (p2[1] - p0[1]) * s1, p2[0] - (p3[0] - p1[0]) * s2, p2[1] - (p3[1] - p1[1]) * s2, p2[0], p2[1]);
  }
  if (closed) p.closePath();
  return p;
}
function addCap(p, ax, ay, ra, bx, by, rb) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d <= Math.abs(ra - rb) + 1e-6) {
    const x = ra >= rb ? ax : bx, y = ra >= rb ? ay : by, r = Math.max(ra, rb);
    p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); p.closePath();
    return p;
  }
  const ang = Math.atan2(dy, dx), phi = Math.acos(clamp((ra - rb) / d, -1, 1)), a0 = ang + phi;
  p.moveTo(ax + Math.cos(a0) * ra, ay + Math.sin(a0) * ra);
  p.arc(ax, ay, ra, a0, ang - phi + TAU); p.arc(bx, by, rb, ang - phi, ang + phi); p.closePath();
  return p;
}
function addOval(p, x, y, rx, ry, rot = 0) {
  p.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx); p.ellipse(x, y, rx, ry, rot, 0, TAU); p.closePath();
  return p;
}
const clockwise = (pts) => { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a >= 0 ? pts : pts.reverse(); };

// ---- static head geometry (head units: skull centre 0,0, radius ~24, x forward), built once ----
const EAR_NEAR = { piv: [-11, -16], pts: [[-21, -6], [-24.5, -20], [-23, -33], [-19, -44, 1], [-12, -36], [-5, -27], [-1, -21], [-9, -10]],
  notch: [[-21, -6], [-24.5, -20], [-23.6, -29, 1], [-19.6, -30.5, 1], [-22.2, -35, 1], [-19, -44, 1], [-12, -36], [-5, -27], [-1, -21], [-9, -10]],
  inner: [[-18.5, -13], [-20.5, -31], [-18.6, -39.5, 1], [-12, -32], [-7, -24], [-11, -15]] };
const EAR_FAR = { piv: [14, -18], pts: [[6, -21], [7.5, -32], [16, -42, 1], [21, -31], [23, -18], [20, -10], [12, -12]],
  inner: [[9.5, -22], [11, -31.5], [16, -39, 1], [17.5, -28], [15, -18]] };
const EARS = {
  near: blob(EAR_NEAR.pts), nearNotch: blob(EAR_NEAR.notch), nearIn: blob(EAR_NEAR.inner), far: blob(EAR_FAR.pts), farIn: blob(EAR_FAR.inner),
  tufts: (() => { const p = new Path2D(); for (const [x0, y0, x1, y1] of [[-14, -16, -18, -27], [-11, -17, -12.5, -28], [-16, -14, -21, -22]]) { p.moveTo(x0, y0); p.lineTo(x1, y1); } return p; })(),
};
const TABBY_FACE = (() => {
  const p = new Path2D();
  for (const [x0, y0, cx, cy, x1, y1] of [[3.5, -23, 5.5, -18, 5.5, -14], [-4.5, -22.5, -2.5, -18.5, -1.5, -15], [12, -21.5, 12.5, -17, 12.5, -13.5],
    [-12, -19, -9, -16, -6.5, -15.5], [-12.5, 1.5, -17, -0.5, -23, -1], [-11.5, 7, -16, 6.5, -21, 8]]) { p.moveTo(x0, y0); p.quadraticCurveTo(cx, cy, x1, y1); }
  return p;
})();
const NOSE_X = 30.6, NOSE_Y = 5.6;
const NOSE = blob([[26, 1], [32.4, 0], [33.6, 2.4], [NOSE_X, NOSE_Y], [27.2, 3.6]]);
const WDOTS = (() => { const p = new Path2D(); for (const [x, y] of [[21.5, 8.2], [24.6, 9.3], [21.2, 11.4], [24.4, 12.4]]) { p.moveTo(x + 0.7, y); p.arc(x, y, 0.7, 0, TAU); p.closePath(); } return p; })();
const MOUTH_SHUT = (() => {
  const p = new Path2D();
  p.moveTo(NOSE_X, NOSE_Y); p.lineTo(NOSE_X - 0.4, 9.2); p.quadraticCurveTo(28, 12.4, 23, 11.2);
  p.moveTo(NOSE_X - 0.4, 9.2); p.quadraticCurveTo(32, 11.6, 33.2, 9.8);
  return p;
})();
// Head silhouette + muzzle patch vary with jaw drop d and cheek fluff ck: cached on quantised keys.
const HEADS = new Map();
function headGeo(bib, d, ck) {
  const key = (bib ? 'b' : 'c') + d + '|' + ck;
  let G = HEADS.get(key);
  if (G) return G;
  const H = blob([[-20, 10], [-24.5, -2], [-19, -16], [-6, -24], [9, -22.5], [20, -15], [25.5, -7.5], [30, -1], [33, 4.5], [32.4, 9.8],
    [29, 13.4 + d * 0.15], [25, 16.5 + d], [17, 20.5 + d * 0.95], [7, 21.5 + d * 0.55], [0, 22 + d * 0.2],
    [-5.5, 23.5 + 2.4 * ck, 1], [-9, 21], [-14, 24 + 2.6 * ck, 1], [-16.5, 18.5], [-21.5, 19 + 2.2 * ck, 1], [-20.5, 14]]);
  const mz = bib
    ? blob([[6, 6], [9, -3], [8.5, -12, 1], [12.5, -3], [21, 1], [29, -2], [34, 4], [33, 11], [27, 16 + d], [18, 23 + d], [5, 23], [1, 14]])
    : blob([[13, 5], [22, 1.5], [30, 2.5], [34, 9], [29, 14 + d * 0.2], [24, 18.5 + d], [15, 22 + d], [6, 21 + d * 0.5], [6.5, 12]]);
  G = { H, mz };
  if (HEADS.size > 400) HEADS.clear();
  HEADS.set(key, G);
  return G;
}

export function drawCat(c, p = {}) {
  const V = catVariant(p.v);
  const moodKey = p.mood && MOODS[p.mood] ? p.mood : 'neutral', m = MOODS[moodKey];
  const pick = (k) => (p[k] !== undefined ? p[k] : m[k]);
  const t = p.t ?? 0, seed = p.seed ?? 0, flip = p.flip ?? 1, s = p.s ?? 1, size = V.size ?? 1;
  const K = s * U * size, lw = (inkW(s) * s * 0.92) / K;
  const wet = clamp(p.wet ?? 0), legK = V.legK ?? 1, lean = V.lean ?? 0, scruff = V.scruff ?? 0;
  const C = palette(V, wet), L = C.L;

  // ---- pose ----
  const gname = p.gait && CG[p.gait] ? p.gait : null;
  const pose = p.pose ?? (moodKey === 'asleep' ? 'curl' : gname === 'stalk' ? ['stand', 'crouch', 0.55] : 'stand');
  const MT = { ...TAILS[m.tail], front: 0, base: [-0.27, 8] };
  const P = resolvePose(pose, clamp(p.k ?? 0.5), MT);
  const g = gname ? CG[gname] : null, ph = p.phase ?? 0, gw = g ? P.gait : 0;
  const sleep = m.sleep ? 1 : 0;
  const breath = 0.5 + 0.5 * Math.sin(t * (sleep ? 1.25 : 2.1) + seed * 1.7);
  const slope = p.slope ?? 0, ts = Math.tan(slope), gy = (x) => x * ts;
  const lift = ((P.lift ?? 0) * (p.air ?? 0)) / (U * size);
  const puff = clamp(Math.max(P.puff, m.puff ?? 0));
  const runW = gname === 'run' ? gw : 0;

  // ---- skeleton ----
  let hip = [P.hip[0], P.hip[1] - lift + runW * 5], sh = [P.sh[0], P.sh[1] - lift + runW * 6], ba = 0, archX = 0;
  const rotAbout = (q, cx, cy, a) => { const ca = Math.cos(a), sa = Math.sin(a), x = q[0] - cx, y = q[1] - cy; return [cx + x * ca - y * sa, cy + x * sa + y * ca]; };
  if (g && gw > 0) {
    const bob = -g.bob * (0.5 - 0.5 * Math.cos(TAU * g.bobs * ph)) * gw, pit = g.pitch * Math.sin(TAU * ph + 0.6) * gw * (runW ? 0.6 : 1);
    const cx = (hip[0] + sh[0]) / 2, cy = (hip[1] + sh[1]) / 2;
    if (runW) { // bounding gallop: the spine gathers (hind feet forward) and stretches (front reach)
      const fx = Math.cos(TAU * (ph - 0.05)) * runW, fk = 1 - 0.16 * fx;
      hip[0] = cx + (hip[0] - cx) * fk; sh[0] = cx + (sh[0] - cx) * fk; archX = 12 * Math.max(0, fx);
    }
    hip = rotAbout(hip, cx, cy, pit); sh = rotAbout(sh, cx, cy, pit); hip[1] += bob; sh[1] += bob; ba += pit;
  }
  if (slope) { // pitch about the uphill end so both pairs of legs still reach the inclined ground
    const [cx, cy] = slope > 0 ? hip : sh;
    hip = rotAbout(hip, cx, cy, slope); sh = rotAbout(sh, cx, cy, slope); ba += slope;
  }
  const cb = Math.cos(ba), sb = Math.sin(ba), R = (v) => [v[0] * cb - v[1] * sb, v[0] * sb + v[1] * cb];
  const sd = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]) || 1, ux = (sh[0] - hip[0]) / sd, uy = (sh[1] - hip[1]) / sd, nx = uy, ny = -ux;
  const arch = P.arch + archX, archV = P.archV;
  const sp = (a, b) => { const bb = b + arch * 4 * a * (1 - a) * (b >= 0 ? 1 : archV); return [hip[0] + ux * a * sd + nx * bb, hip[1] + uy * a * sd + ny * bb]; };

  // head placement
  const gaitNod = g && gw ? Math.sin(TAU * g.bobs * ph + 1.2) * 0.03 * gw : 0;
  const n0 = R([6, -8]), nb = [sh[0] + n0[0], sh[1] + n0[1]];
  const ho = R([P.head[0] + m.head[0] + runW * 6, P.head[1] + m.head[1] - breath * 0.6 * (1 - sleep) + breath * 0.9 * sleep + runW * 10]);
  const hc = [nb[0] + ho[0], nb[1] + ho[1] + gaitNod * 12];
  const hRot = P.hrot + m.hrot + (p.tilt ?? 0) + gaitNod + ba * 0.7 + Math.sin(t * 0.8 + seed) * 0.012;
  const hcos = Math.cos(hRot), hsin = Math.sin(hRot);
  const H2B = (q) => [hc[0] + q[0] * hcos - q[1] * hsin, hc[1] + q[0] * hsin + q[1] * hcos];

  // ---- trunk: torso outline in spine coords (a along hip→shoulder, b towards the back), fur tufts as sharp points ----
  const dep = (25 + breath * (sleep ? 1.6 : 0.9)) * (1 - lean * 0.12) * (1 - wet * 0.05) * P.belly;
  const tuck = (19 - lean * 3) * P.belly, back = P.back + puff * 2;
  const fz = 0.55 + scruff * 0.6 + puff * 0.6 + wet * 0.5, fb = scruff * 0.8 + wet * 0.9 + puff * 0.4;
  const T = [[-0.08, back + 1], [-0.27, 9], [-0.31, -6], [-0.345 - 0.05 * fz, -13, 1], [-0.24, -18], [-0.2, -20], [0.18, -tuck - 4]];
  if (fb > 0.15) for (const a of [0.3, 0.45, 0.6, 0.75]) { const b = -lerp(tuck + 3, dep, (a - 0.2) / 0.6); T.push([a - 0.05, b], [a, b - 4.5 * fb, 1]); }
  else T.push([0.55, -tuck - 2]);
  T.push([0.88, -dep], [1.1, -dep * 0.6], [1.17 + 0.05 * fz, -dep * 0.46, 1], [1.15, -dep * 0.33], [1.21 + 0.045 * fz, -dep * 0.18, 1], [1.2, -4], [1.12, 12], [0.92, back + 2]);
  if (puff + wet * 0.5 > 0.1) { const k = puff + wet * 0.35; for (let a = 0.8; a > -0.05; a -= 0.12) T.push([a, back + 0.5], [a - 0.06, back + 1 + 6 * k, 1]); }
  else T.push([0.5, back - 2.5]);
  const torso = blob(T.map(([a, b, sharp]) => { const q = sp(a, b); return sharp ? [q[0], q[1], 1] : q; }));
  const nA = [sh[0] + R([1, 3])[0], sh[1] + R([1, 3])[1]], nB = H2B([-4, 9]);
  const trunk = union(torso, capsule(nA[0], nA[1], 18 * (1 - lean * 0.06), nB[0], nB[1], 13.5));

  // ---- legs: each leg is one multi-contour path ----
  const fU = 29 * legK * P.fl, fL = 31 * legK * P.fl, th = 29 * legK, mt = 25 * legK;
  const frontLeg = (far) => {
    const off = far ? 5 : 0, key = far ? 'ff' : 'nf', ro = R(P.froot);
    const root = [sh[0] + ro[0] + off, sh[1] + ro[1] - off * 0.4];
    let tx = P.ftar[0] + off, gyo = 0;
    if (g && gw > 0) { const d = gaitFoot(ph + g.off[key], g); tx += d[0] * gw * legK; gyo = d[1] * gw; }
    let ty = P.ftar[1] - lift + gy(tx) + gyo - off * 0.4;
    const pr = far ? 0 : clamp(p.paw ?? 0);
    if (pr > 0) { const e = ease.io(pr); tx = lerp(tx, root[0] + 25, e); ty = lerp(ty, root[1] + 27, e) - Math.sin(pr * PI) * 4; }
    const a = ik2(root[0], root[1], tx, ty, fU, fL, 1);
    const j = [a.jx, Math.min(a.jy, gy(a.jx) - 3)], e = [a.ex, a.ey];
    const sw = g && gw > 0 ? clamp(-gyo / g.lift) : 0, pa = P.fpa + sw * 0.9 + pr * 1.15 + ba * 0.6;
    const pc = [e[0] + Math.cos(pa) * 4.5, e[1] - 4 + Math.sin(pa) * 4.5];
    const path = new Path2D();
    addCap(path, root[0], root[1], 8.4 - lean, j[0], j[1], 6); addCap(path, j[0], j[1], 6, e[0], e[1] - 4, 4.7); addOval(path, pc[0], pc[1], 8.6, 5.3, pa);
    return { path, root, j, up: j, e, pa, pc, pr };
  };
  const hindLeg = (far) => {
    const off = far ? 5 : 0, key = far ? 'fh' : 'nh', hh = R(P.haunch), kk = R(P.hk);
    const hcen = [hip[0] + hh[0] + off, hip[1] + hh[1] - off * 0.4], hrx = P.haunch[2] * (1 - lean * 0.08), hry = P.haunch[3] * (1 - lean * 0.06), hro = P.haunch[4] + ba;
    const knee = [hip[0] + kk[0] * legK + off, hip[1] + kk[1] * legK - off * 0.4];
    let tx = P.htar[0] + off, gyo = 0;
    if (g && gw > 0) { const d = gaitFoot(ph + g.off[key], g); tx += d[0] * gw * legK; gyo = d[1] * gw; }
    const ty = P.htar[1] - lift + gy(tx) + gyo - off * 0.4;
    const k = ik2(knee[0], knee[1], tx, ty, th, mt, 1);
    const hock = [k.jx, Math.min(k.jy, gy(k.jx) - 3)], e = [k.ex, k.ey];
    const sw = g && gw > 0 ? clamp(-gyo / g.lift) : 0, pa = P.hpa + sw * 0.8 + ba * 0.6;
    const pc = [e[0] + Math.cos(pa) * 5, e[1] - 4 + Math.sin(pa) * 5];
    const path = new Path2D();
    addOval(path, hcen[0], hcen[1], hrx, hry, hro); addCap(path, knee[0], knee[1], 8.6 - lean, hock[0], hock[1], 5.2);
    addCap(path, hock[0], hock[1], 5.2, e[0], e[1] - 4, 4.6); addOval(path, pc[0], pc[1], 9.2, 5.2, pa);
    return { path, hcen, hrx, hry, hro, knee, hock, up: hock, e, pa, pc };
  };
  const nf = frontLeg(false), ff = frontLeg(true), nh = hindLeg(false), fh = hindLeg(true);

  // ---- tail ----
  let TL = P.tail;
  if (runW && !TL.front) TL = blendTail(TL, { ...RUN_TAIL, front: 0, base: TL.base }, runW * 0.85);
  const tb = sp(TL.base[0], TL.base[1]);
  const flick = clamp(p.tailFlick ?? m.flick ?? 0), swayAmp = (m.sway ?? 1) * (gw ? 0.6 : 1), swaySp = m.swaySpeed ?? 1.25;
  const fsig = flick * (Math.sin(t * 7.3 + seed) * 0.6 + Math.sin(t * 12.7 + seed * 2.1) * 0.4) * (0.55 + 0.45 * noise1(t * 0.9, seed + 7));
  const segs = 9, segLen = 11.4, cen = [tb];
  let ta = TL.a0 + ba * 0.8, tx0 = tb[0], ty0 = tb[1];
  for (let i = 0; i < segs; i++) {
    const u = i / (segs - 1);
    ta += lerp(TL.c0, TL.c1, smooth(u)) + Math.sin(t * swaySp + seed * 0.7 - i * 0.5) * 0.045 * swayAmp * (0.4 + u) + (i >= segs - 3 ? (fsig * 0.3 * (i - segs + 4)) / 3 : 0);
    tx0 += Math.cos(ta) * segLen; ty0 = Math.min(ty0 + Math.sin(ta) * segLen, gy(tx0) - 5.5);
    cen.push([tx0, ty0]);
  }
  const tpuff = puff * (TL.front ? 0.3 : 1), spiky = tpuff + wet * 0.6;
  const up = [], lo = [];
  let w = 0;
  for (let i = 0; i <= segs; i++) {
    const a = cen[Math.max(0, i - 1)], b = cen[Math.min(segs, i + 1)], q = cen[i];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const dl = Math.hypot(dx, dy) || 1;
    w = lerp(7, 5.3, i / segs) * (1 - wet * 0.28) * (1 + tpuff * 0.9 + scruff * 0.06);
    dx /= dl; dy /= dl;
    if (spiky > 0 && i > 0) { // bottle-brush / clumped fur: a sharp tuft between centreline points
      const pm = cen[i - 1], wm = w * (1 + 0.42 * spiky), mx = (pm[0] + q[0]) / 2, my = (pm[1] + q[1]) / 2;
      up.push([mx - dy * wm, my + dx * wm, 1]); lo.push([mx + dy * wm, my - dx * wm, 1]);
    }
    up.push([q[0] - dy * w, q[1] + dx * w]); lo.push([q[0] + dy * w, q[1] - dx * w]);
  }
  { const e = cen[segs], q = cen[segs - 1], dl = Math.hypot(e[0] - q[0], e[1] - q[1]) || 1; up.push([e[0] + ((e[0] - q[0]) / dl) * w, e[1] + ((e[1] - q[1]) / dl) * w]); }
  const tailPath = addBlob(new Path2D(), [...up, ...lo.reverse()], false); // open at the root: fill closes it, stroke leaves no cap

  // ---- draw ----
  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(K * flip, K);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const shA = p.shadow === false ? 0 : p.shadow === true || p.shadow == null ? 0.3 : +p.shadow;
  if (shA > 0) {
    const x0 = Math.min(nf.pc[0], nh.pc[0], nh.hcen[0] - nh.hrx), x1 = Math.max(nf.pc[0] + 8, nh.pc[0]), cx = (x0 + x1) / 2, ak = 1 / (1 + lift / 70);
    c.save(); c.translate(cx, gy(cx) + 1); c.rotate(slope);
    shadow(c, 0, 0, ((x1 - x0) / 2 + 16) * lerp(0.75, 1, ak), 7 * lerp(0.7, 1, ak), shA * ak);
    c.restore();
  }
  // far legs: outline under fill = one merged contour
  for (const leg of [fh, ff]) {
    line(c, leg.path, L, lw * 2); fill(c, leg.path, C.far);
    if (V.socks >= 0.9) clipped(c, leg.path, () => fill(c, capsule(leg.pc[0], leg.pc[1], 10, leg.up[0], leg.up[1], 4), C.farSock));
  }
  const drawTail = (front) => {
    const y0 = Math.min(...cen.map((q) => q[1])) - 8, y1 = Math.max(...cen.map((q) => q[1])) + 8;
    fill(c, tailPath, lin(c, 0, y0, 0, y1, [[0, C.tailTop], [0.6, C.coat], [1, C.dark]]));
    clipped(c, tailPath, () => {
      if (C.stripe) {
        const rp = new Path2D();
        for (const i of [2, 4, 6]) { const a = cen[i - 1], b = cen[i + 1], q = cen[i], dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1; rp.moveTo(q[0] - (dy / dl) * 14, q[1] + (dx / dl) * 14); rp.lineTo(q[0] + (dy / dl) * 14 - dx * 0.12, q[1] - (dx / dl) * 14 - dy * 0.12); }
        line(c, rp, C.stripeT, 4.2);
        const e = cen[segs], q = cen[segs - 1];
        fill(c, oval(e[0], e[1], 13, 10, Math.atan2(e[1] - q[1], e[0] - q[0])), C.stripeTip);
      }
      c.save(); c.translate(1.1 * flip, 2.4); c.globalAlpha = 0.3; line(c, tailPath, C.light, lw * 2.2); c.restore();
    });
    line(c, tailPath, L, lw);
  };
  if (!TL.front) drawTail(false);

  // near body: every outline first (doubled width, half covered by the fills), then legs, then the trunk on top
  line(c, nh.path, L, lw * 2); line(c, nf.path, L, lw * 2); line(c, trunk, L, lw * 2);
  const top = Math.min(hip[1], sh[1]) - back - arch - 4, bot = Math.max(nh.e[1], nf.e[1], 0) + 2;
  const coatGrad = lin(c, 0, top, 0, bot, [[0, C.light], [0.42, C.coat], [1, C.dark]]);
  for (const leg of [nh, nf]) {
    fill(c, leg.path, coatGrad);
    clipped(c, leg.path, () => {
      const f0 = clamp((sh[1] + 4 - top) / (bot - top)), f1 = clamp((sh[1] + 30 - top) / (bot - top));
      c.fillStyle = lin(c, 0, top, 0, bot, [[0, C.coat0], [f0, C.coat0], [f1, C.legMid], [1, C.dark]]);
      c.fillRect(-300, top - 60, 600, 500);
      if (C.stripe) {
        const bp = new Path2D(), band = (a, b, k, w) => { const x = lerp(a[0], b[0], k), y = lerp(a[1], b[1], k), dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1; bp.moveTo(x - (dy / dl) * w, y + (dx / dl) * w); bp.lineTo(x + (dy / dl) * w, y - (dx / dl) * w); };
        if (leg === nf) { band(nf.j, nf.e, 0.3, 9); band(nf.j, nf.e, 0.6, 9); }
        else { band(nh.knee, nh.hock, 0.35, 11); band(nh.knee, nh.hock, 0.7, 10); bp.moveTo(nh.hcen[0] + Math.cos(-2.4) * 13, nh.hcen[1] + Math.sin(-2.4) * 17); bp.ellipse(nh.hcen[0] - 3, nh.hcen[1] + 2, nh.hrx * 0.75, nh.hry * 0.8, nh.hro, -2.4, -1.2); }
        line(c, bp, C.stripeL, 4.2);
      }
      const sk = V.socks ?? 0;
      if (sk >= 0.9) fill(c, capsule(leg.pc[0], leg.pc[1], 10, lerp(leg.e[0], leg.up[0], 0.55), lerp(leg.e[1], leg.up[1], 0.55), 6), C.cream);
      else if (sk > 0) { c.fillStyle = rad(c, leg.pc[0], leg.pc[1] - 1, 15, [[0, C.sockA], [0.55, C.sockB], [1, C.cream0]]); c.fillRect(leg.pc[0] - 15, leg.pc[1] - 16, 30, 30); }
    });
  }
  fill(c, trunk, coatGrad);
  clipped(c, trunk, () => {
    if (C.stripe) {
      const stp = new Path2D();
      addBlob(stp, clockwise([sp(-0.12, back + 6), sp(0.5, back + 5), sp(1.02, back + 6), sp(1.0, back - 4), sp(0.5, back - 6.5), sp(-0.1, back - 5)]));
      for (let i = 0; i < 6; i++) {
        const a = 0.04 + i * 0.155, w = 0.032, b1 = -6 - (i % 2) * 5, b0 = sp(a - w * 1.2, b1);
        addBlob(stp, clockwise([sp(a - w, back + 6), sp(a + w, back + 6), sp(a + w * 0.6, 4), [b0[0], b0[1], 1], sp(a - w * 1.4, 4)]));
      }
      fill(c, stp, C.stripeA);
    }
    if (V.bib) fill(c, blob([sp(1.3, 2), sp(1.05, -dep * 0.22), sp(0.78, -tuck * 0.75), sp(0.4, -tuck * 0.72), sp(0.15, -tuck - 2), sp(0.1, -dep - 14), sp(1.3, -dep - 14)]), C.cream);
    else {
      const q = sp(1.1, -dep * 0.45);
      c.fillStyle = rad(c, q[0], q[1], 26, [[0, C.creamA], [0.55, C.creamB], [1, C.cream0]]); c.fillRect(q[0] - 26, q[1] - 26, 52, 52);
      const b2 = sp(0.5, -dep - 2);
      c.save(); c.translate(b2[0], b2[1]); c.rotate(Math.atan2(uy, ux)); c.scale(1, 0.3);
      c.fillStyle = rad(c, 0, 0, sd * 0.62, [[0, C.creamC], [0.6, C.creamD], [1, C.cream0]]); c.fillRect(-sd, -sd, sd * 2, sd * 2);
      c.restore();
    }
    if (wet > 0.05) { // glossy wet streaks along the back
      const gp = new Path2D();
      for (const [a, b] of [[0.15, back - 4], [0.42, back - 6], [0.7, back - 4]]) { const q0 = sp(a, b), q1 = sp(a + 0.13, b - 1); gp.moveTo(q0[0], q0[1]); gp.lineTo(q1[0], q1[1]); }
      line(c, gp, C.gloss, 1.6);
    }
    // soft form shadow underneath, rim light along the top edges
    const fy = sh[1] + dep * 0.55 - 8;
    c.fillStyle = lin(c, 0, fy - 10, 0, fy + 24, [[0, C.dark0], [1, C.shade]]); c.fillRect(-300, fy - 10, 600, 240);
    c.save(); c.translate(1.2 * flip, 2.8); c.globalAlpha = 0.36; line(c, trunk, C.light, lw * 2.4); c.restore();
  });
  // a hint of the thigh, toes, and the pink pads of a raised paw
  c.save(); c.globalAlpha = 0.34; c.strokeStyle = C.inner; c.lineWidth = lw * 0.8; c.beginPath();
  c.ellipse(nh.hcen[0], nh.hcen[1], nh.hrx, nh.hry, nh.hro, -1.3, 0.7); c.stroke(); c.restore();
  { const tp = new Path2D();
    for (const leg of [nf, nh]) for (const d of [2.6, 6.6]) { const bx = leg.pc[0] + Math.cos(leg.pa) * (d - 1), by = leg.pc[1] + 1 + Math.sin(leg.pa) * (d - 1); tp.moveTo(bx, by); tp.lineTo(bx + 0.6, by + 2.8); }
    line(c, tp, C.toe, lw * 0.65); }
  if (nf.pr > 0.35) {
    c.save(); c.translate(nf.pc[0], nf.pc[1]); c.rotate(nf.pa); c.globalAlpha = clamp((nf.pr - 0.35) / 0.4);
    const pp = new Path2D(); addOval(pp, -0.5, 4.4, 4.2, 2.3); for (const [dx, dy] of [[4.8, 3.2], [6.6, 0.6], [2.4, 5.6]]) addOval(pp, dx, dy, 1.6, 1.3);
    fill(c, pp, C.pads); c.restore();
  }
  if (TL.front === 1) drawTail(true);

  // ---- head ----
  c.save();
  c.translate(hc[0], hc[1]); c.rotate(hRot);
  const earIn = clamp(pick('ear') ?? 0, -1, 1), flat = Math.max(0, -earIn), tw = earTwitch(t, seed);
  const earSway = g && gw ? Math.sin(TAU * g.bobs * ph) * 0.03 : 0;
  const drawEar = (far) => {
    const E = far ? EAR_FAR : EAR_NEAR, a = (earIn > 0 ? 0.13 * earIn : -flat * (far ? 0.9 : 1.15)) - (far ? tw.far : tw.near) * 0.32 + earSway;
    const outer = far ? EARS.far : V.notch ? EARS.nearNotch : EARS.near;
    c.save(); c.translate(E.piv[0], E.piv[1]); c.rotate(a); c.scale(1, 1 - flat * 0.36); c.translate(-E.piv[0], -E.piv[1]);
    fill(c, outer, lin(c, 0, -44, 0, -12, far ? [[0, C.farEarTop], [1, C.farEarBot]] : [[0, C.earTop], [1, C.coat]]));
    clipped(c, outer, () => { fill(c, far ? EARS.farIn : EARS.nearIn, far ? C.farEarIn : V.ear); if (!far) line(c, EARS.tufts, C.earTuft, 1.3); });
    line(c, outer, L, lw);
    c.restore();
  };
  drawEar(true); drawEar(false);
  const hiss = clamp(p.hiss ? 1 : m.hiss ?? 0), mo = clamp(pick('mouth') ?? 0);
  const d = Math.round(mo * (9 + hiss * 4) * 2) / 2, ck = Math.round((1 + puff * 0.6 + scruff * 0.45 + wet * 0.35) * 20) / 20;
  const { H, mz } = headGeo(V.bib, d, ck);
  fill(c, H, lin(c, 0, -25, 0, 24, [[0, C.headTop], [0.5, C.coat], [1, C.headBot]]));
  clipped(c, H, () => {
    if (V.bib) fill(c, mz, C.cream);
    else {
      c.globalAlpha = 0.95; fill(c, mz, C.cream); c.globalAlpha = 1;
      c.fillStyle = rad(c, 6, 10, 15, [[0, C.creamE], [1, C.cream0]]); c.fillRect(-9, -5, 30, 30);
    }
    if (C.stripe) line(c, TABBY_FACE, C.stripeH, 2.6);
    c.fillStyle = lin(c, 0, 5, 0, 27, [[0, C.dark0], [1, C.shade]]); c.fillRect(-30, 5, 70, 30);
    c.save(); c.translate(flip, 2.2); c.globalAlpha = 0.3; line(c, H, C.light, lw * 2.2); c.restore();
  });
  line(c, H, L, lw);
  // mouth: open (meow / hiss) or the closed cat smile
  if (d > 0.4) {
    const cx = lerp(17, 13.5, hiss), lift2 = hiss * 1.6;
    const mouthP = blob([[31.6, 9.4 - lift2 * 0.4], [24, 11.2 - lift2], [cx, 13.2], [cx + 4, 14.6 + d * 0.5], [25, 15.6 + d * 0.95], [30.6, 12.6 + d * 0.75]]);
    fill(c, mouthP, C.mouthIn);
    clipped(c, mouthP, () => fill(c, oval(25.5, 15 + d * 0.95, 7, 2.6 + d * 0.12), C.tongue));
    const fp = new Path2D();
    for (const [fx, fs] of [[28.6, 1], [21.4, 0.8]]) {
      const fy = lerp(10.8, 9.2, hiss) - (fx < 25 ? lift2 * 0.5 : 0), fl2 = (2.4 + hiss * 1.8 + mo * 0.8) * fs;
      fp.moveTo(fx - 1.3 * fs, fy); fp.lineTo(fx, fy + fl2); fp.lineTo(fx + 1.3 * fs, fy); fp.closePath();
    }
    fill(c, fp, C.fang);
    line(c, mouthP, L, lw * 0.85);
    if (hiss > 0.3) { // wrinkled nose
      const wp = new Path2D();
      for (const [x0, y0] of [[22.5, -2], [24.6, -4.6]]) { wp.moveTo(x0, y0); wp.quadraticCurveTo(x0 + 2.2, y0 - 1.6, x0 + 4.4, y0 - 0.4); }
      c.globalAlpha = 0.6 * hiss; line(c, wp, L, lw * 0.6); c.globalAlpha = 1;
    }
  } else line(c, MOUTH_SHUT, L, lw * 0.8);
  fill(c, NOSE, V.nose); line(c, NOSE, L, lw * 0.7);
  c.fillStyle = C.hl; c.beginPath(); c.ellipse(29.5, 1.5, 1.8, 0.8, -0.1, 0, TAU); c.fill();
  fill(c, WDOTS, C.dot);
  // whiskers
  const wa = (pick('whisk') ?? 0) * 0.22 + noise1(t * 1.6, seed + 3) * 0.05, wf = new Path2D(), wn = new Path2D();
  for (let i = 0; i < 3; i++) {
    const ox = 29.6, oy = 9.6 + i * 1.5, a = -0.24 + i * 0.22 - wa, ln = 25 - i * 2;
    wf.moveTo(ox, oy); wf.quadraticCurveTo(ox + Math.cos(a) * ln * 0.55, oy + Math.sin(a) * ln * 0.55 - 1.2, ox + Math.cos(a + 0.12) * ln, oy + Math.sin(a + 0.12) * ln);
    const ix = 20.5, iy = 10 + i * 1.6, b = PI - 0.18 + i * 0.25 + wa * 0.6, l2 = 15 - i;
    wn.moveTo(ix, iy); wn.quadraticCurveTo(ix + Math.cos(b) * l2 * 0.5, iy + Math.sin(b) * l2 * 0.5 - 1, ix + Math.cos(b - 0.1) * l2, iy + Math.sin(b - 0.1) * l2);
  }
  line(c, wf, C.whisk, lw * 0.42); c.globalAlpha = 0.6; line(c, wn, C.whisk, lw * 0.42); c.globalAlpha = 1;
  // eyes
  const bl = p.blink ?? blink(t, seed + 1, 4.2);
  let lid = Math.max(pick('lid') ?? 0, bl);
  if (m.slow && p.lid === undefined) lid = Math.max(lid, slowBlink(t, seed));
  lid = clamp(lid);
  const es = clamp(p.eyeShine ?? 0), dil = clamp(lerp(p.pupil ?? m.pupil, 1, es * 0.8));
  const iris = es > 0 ? mix(V.iris, '#d6ff5e', es * 0.85) : V.iris, pupCol = es > 0 ? mix('#17110d', '#f3ffc6', es) : undefined;
  const look = p.look || [0.3, 0.05], ang = m.ang ?? 0, low = m.low ?? 0;
  const EF = [16.5, -5.5, 7.1], EN = [-0.5, -4.5, 8.4];
  eye(c, { x: EF[0], y: EF[1], r: EF[2], look, iris, slit: true, dilate: dil, lid, lidAng: -ang, lidColor: C.lid, line: L, lw: lw * 0.85, low, irisR: 0.8, pupil: pupCol });
  eye(c, { x: EN[0], y: EN[1], r: EN[2], look, iris, slit: true, dilate: dil, lid, lidAng: ang, lidColor: C.lid, line: L, lw: lw * 0.85, low, irisR: 0.8, pupil: pupCol });
  if (es > 0 && lid < 0.9) for (const [x, y, r] of [EF, EN]) glow(c, x, y, r * 3.2, '#c8ff5a', es * 0.75 * (1 - lid));
  c.restore();
  if (TL.front === 2) drawTail(true);
  c.restore();

  // anchors in caller coordinates
  const X = (q) => [(p.x ?? 0) + flip * K * q[0], (p.y ?? 0) + K * q[1]];
  return {
    eyes: [X(H2B(EN)), X(H2B(EF))], eyeR: EN[2] * K, nose: X(H2B([33, 3])), head: X(hc),
    top: (p.y ?? 0) + K * Math.min(H2B([-19, -44])[1], H2B([16, -42])[1]), tail: X(cen[segs]),
    paws: { nf: X([nf.pc[0], nf.e[1]]), ff: X([ff.pc[0], ff.e[1]]), nh: X([nh.pc[0], nh.e[1]]), fh: X([fh.pc[0], fh.e[1]]) },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// House mouse (authored at 4x: 32 design units tall → 8 at s 1).
export const MOUSE = { coat: '#8f7e6f', dark: '#65564a', light: '#b8a796', belly: '#e2d6c6', line: '#3a2c24', ear: '#eaa8a5',
  tail: '#d3a99f', feet: '#ecb4ac', nose: '#ef8e9a' };
const MPAL = { farEar: mix(MOUSE.coat, MOUSE.dark, 0.3), belly: alpha(MOUSE.belly, 0.95), belly0: alpha(MOUSE.belly, 0), thigh: alpha(MOUSE.line, 0.22),
  whisk: alpha(MOUSE.line, 0.5) };
const MU = 0.25, MSTRIDE = 44;
export function mouseStride(s = 1) { return MSTRIDE * MU * s; }

export function drawMouse(c, p = {}) {
  const M = MOUSE, s = p.s ?? 1, flip = p.flip ?? 1, t = p.t ?? 0, seed = p.seed ?? 0, K = s * MU;
  const pose = p.pose ?? (p.run ? 'run' : 'stand'), ph = p.phase ?? 0, run = pose === 'run' ? 1 : 0, sniff = pose === 'sniff' ? 1 : 0;
  const lw = (0.95 * Math.sqrt(Math.max(s, 0.3))) / K, L = M.line;
  const breath = Math.sin(t * 9 + seed) * 0.5;
  const cyc = TAU * ph, ext = run ? Math.sin(cyc) : 0; // bound: +1 stretched, -1 gathered
  const hop = run ? Math.max(0, Math.sin(cyc + 0.5)) * 5 : 0;
  const rear = sniff ? 0.42 + Math.sin(t * 1.3 + seed) * 0.04 : 0, pitch = -rear + (run ? -ext * 0.08 : 0);
  const sx = 1 + ext * 0.12, sy = 1 - ext * 0.08 - run * 0.08;
  const twitch = Math.sin(t * (sniff ? 31 : 17) + seed) * (sniff ? 1 : 0.4) * (Math.sin(t * 2.1 + seed) > -0.2 ? 1 : 0);
  // body points relative to the hind-foot pivot (-12, 0); rearing rotates about it
  const ca = Math.cos(pitch), sa = Math.sin(pitch);
  const B = (x, y) => { const X = (x + 12) * sx, Y = y * sy - hop; return [-12 + X * ca - Y * sa, X * sa + Y * ca]; };
  const body = blob([B(-24, -12), B(-17, -25 - breath * 0.4), B(-3, -31 - breath * 0.6), B(9, -28), B(17, -24), B(25.5, -17.5), B(33 + twitch * 0.4, -12),
    B(31, -9), B(25, -6.5), B(15, -5.5), B(5, -3.5), B(-8, -3), B(-20, -5)]);
  const nose = B(33.2 + twitch * 0.4, -12), eyeP = B(20, -20), earN = B(11, -30), earF = B(18, -32);
  const fF = run ? [16 + ext * 9, -Math.max(0, -Math.sin(cyc)) * 4] : sniff ? null : [15, 0];
  const fH = run ? [-12 - ext * 7, -Math.max(0, Math.sin(cyc)) * 3] : [-12, 0];
  // tail: one tapered ribbon
  const tb = B(-23, -9), up = [], lo = [];
  let ta = PI + 0.25 - pitch * 0.5 - run * 0.15, tx = tb[0], ty = tb[1];
  for (let i = 0; i <= 10; i++) {
    if (i) { ta += Math.sin(t * 2.2 + seed - i * 0.6) * 0.07 * (1 - run * 0.6) - 0.025; tx += Math.cos(ta) * 4.8; ty = Math.min(ty + Math.sin(ta) * 4.8, -1.4); }
    const w = lerp(1.9, 0.45, i / 10), nx2 = -Math.sin(ta), ny2 = Math.cos(ta);
    up.push([tx + nx2 * w, ty + ny2 * w]); lo.push([tx - nx2 * w, ty - ny2 * w]);
  }
  const tailP = blob([...up, ...lo.reverse()], false);

  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(K * flip, K);
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (p.shadow !== false) shadow(c, 2, 0.5, 30, 4.5, (typeof p.shadow === 'number' ? p.shadow : 0.28) / (1 + hop * 0.05));
  fill(c, tailP, M.tail); line(c, tailP, L, lw * 0.8);
  const ef = oval(earF[0], earF[1], 6.2, 7.2, -0.25 + pitch);
  fill(c, ef, MPAL.farEar); line(c, ef, L, lw);
  const feet = new Path2D();
  addOval(feet, fH[0] + 4, fH[1] - 1.6, 6.5, 2.2);
  if (fF) addOval(feet, fF[0], fF[1] - 1.6, 4.2, 2.2);
  line(c, feet, L, lw * 0.8); fill(c, feet, M.feet);
  fill(c, body, lin(c, 0, -32, 0, 0, [[0, M.light], [0.45, M.coat], [1, M.dark]]));
  clipped(c, body, () => {
    const q = B(10, -4);
    c.fillStyle = rad(c, q[0], q[1], 18, [[0, MPAL.belly], [1, MPAL.belly0]]); c.fillRect(q[0] - 20, q[1] - 20, 40, 40);
    const h = B(-12, -16);
    c.strokeStyle = MPAL.thigh; c.lineWidth = lw * 0.8; c.beginPath(); c.ellipse(h[0], h[1], 10, 11, pitch, -1.4, 0.8); c.stroke();
    c.save(); c.translate(0.8 * flip, 1.8); c.globalAlpha = 0.35; line(c, body, M.light, lw * 2.2); c.restore();
  });
  line(c, body, L, lw);
  if (sniff) { // front paws held up under the chin
    const fp = new Path2D();
    for (const dx of [0, 2.6]) { const q = B(22 + dx, -7); addOval(fp, q[0], q[1], 2.6, 1.8, 0.6); }
    line(c, fp, L, lw * 1.4); fill(c, fp, M.feet);
  }
  const en = oval(earN[0], earN[1], 7.6, 8.6, -0.3 + pitch - run * 0.35);
  fill(c, en, lin(c, 0, earN[1] - 9, 0, earN[1] + 9, [[0, M.light], [1, M.coat]]));
  clipped(c, en, () => fill(c, oval(earN[0] + 1, earN[1] + 0.8, 5, 6, -0.3 + pitch), M.ear));
  line(c, en, L, lw);
  fill(c, oval(nose[0] - 0.4, nose[1] - 0.2, 2.1, 1.8, 0), M.nose);
  const wp = new Path2D();
  for (let i = 0; i < 3; i++) { const a = -0.3 + i * 0.3 + twitch * 0.08 + pitch, ox = nose[0] - 3.5, oy = nose[1] + 1; wp.moveTo(ox, oy); wp.lineTo(ox + Math.cos(a) * 13, oy + Math.sin(a) * 13); }
  line(c, wp, MPAL.whisk, lw * 0.45);
  eye(c, { x: eyeP[0], y: eyeP[1], r: 3.4, look: p.look || [0.5, 0], white: '#2b1d17', pupil: '#0f0a08', irisR: 0.92, lid: blink(t, seed + 3, 2.8), lidColor: M.coat, line: L, lw: lw * 0.7 });
  c.restore();
  const X = (q) => [(p.x ?? 0) + flip * K * q[0], (p.y ?? 0) + K * q[1]];
  return { nose: X(nose), eye: X(eyeP) };
}
