// Small pets: rabbits (hero `sandy`, its wild descendants and other coats), golden hamster, tricolour guinea pig.
// Same conventions as drawDog: (x, y) = ground point under the body, flip 1 faces right, s = scale, t = seconds of idle
// life (breathing, blinks, nose twitch, ear flicks), seed de-synchronises individuals, shadow: 0 disables the contact
// shadow. Every draw returns world-space anchors (after flip/scale) so shots can attach props, hands, doors and bars.
//
// drawRabbit(c, {
//   x, y, s, flip, t, seed,
//   v,        key of RABBITS or a partial variant object (default 'sandy')
//   pose,     'sit' (hunched loaf, ears up) | 'graze' (head down nibbling) | 'hop' | 'alert' (tall on hind legs, frozen)
//             | 'lie' (stretched flop) | 'dig' (forepaws scrabbling, dirt flying), or [from, to, k] to blend (either may be 'hop').
//             gait: 'hop' is an alias for pose 'hop'.
//   phase,    hop cycle, 0..1 per hop: 0 crouch -> 0.14 push-off -> 0.36 airborne stretch -> 0.56 forefeet land
//             -> 0.8 hind feet land -> 1 crouch. Advance by distance / rabbitStride(...) so planted feet never slide.
//   leap,     0..1 bigger, higher, longer bounds (fleeing / darting into cover). Pass the same value to rabbitStride.
//   kit,      0..1 baby proportions (about 0.42 of the adult size, big head and eyes, short ears, round body)
//   ears,     -1..1 carriage / swivel: -1 flat back along the spine, 0 upright, 1 pricked forward; or [near, far]
//   nose,     nose-twitch amount (default from the pose: 0.6 sit, 1 alert, 0.2 lie; 0 = still)
//   chew,     0..1 chewing (jaw, whisker pad, carrot bob; 'graze' defaults to 1)
//   thump,    0..1 progress of a warning stamp with both hind feet (lift 0..0.55, slam at 0.58, dust + settle after)
//   look,     [dx, dy] pupils -1..1 (dx > 0 = forward), default [0.35, 0.05]
//   lid,      0..1 extra eyelid closure (blinks are added on top; 'lie' defaults to a relaxed 0.45)
//   carrot,   0..1 carrot held in the mouth, value = length left (1 = whole with leaves); omit for none
//   push,     0..1 blend toward pressing nose and forepaws forward against a door (anchor `reach` = paw contact point)
//   still,    0..1 damps idle life (1 = frozen: no twitch, flicks or breathing)
//   shadow    contact shadow strength (default 0.3)
// }) -> { nose, mouth, eye, head, ear (near ear tip), tail, paw (near forepaw), reach (push contact), foot (near hind toe) }
// Size at s 1 (measured): sitting adult ~27 units to the top of the back, ~38 to the top of the head, ~49 to the ear
// tips, ~45 long (51 with whiskers); kit 1 is ~0.41 of that. push 1: forepaws/nose reach ~20 units in front of the
// ground point at ~26 high, so put the door plane at x + 20 * s * flip. Ears/pose combine: 'graze' and hops already
// lay the ears back a little; `ears` adds on top. Unknown pose names fall back to 'sit'.
//
// RABBITS: sandy (hero: sandy brown, white blaze and scut, pink inner ears), sandy20 / sandy50 / sandy200 (wild
//   descendants: browner agouti, slimmer, slightly shorter dark-tipped ears, fading blaze), white, patched (Dutch
//   black-and-white), grey, brown (wild agouti). Variant fields: coat dark light cream line inner nose iris blaze ear
//   (length k) lean agouti tip nape dutch size.
// rabbitStride(v = 'sandy', s = 1, kit = 0, leap = 0) -> world distance per hop cycle (33 units at s 1; leap 1: 48;
//   kit 1: 12). Pass the same kit / leap you draw with.
//
// drawHamster(c, {
//   x, y, s, flip, t, seed,
//   pose,     'sit' (on haunches, paws at chest) | 'eat' (paws at mouth with a seed, chewing) | 'run' (all fours,
//             scurrying in place: advance phase ~3-4 cycles/s, the caller rotates the wheel; ground point = rim contact)
//             | 'gnaw' (standing on hind legs, gripping a vertical bar, incisors on it) | 'sleep' (curled ball)
//   phase,    run cycle
//   cheeks,   0..1 stuffed cheek pouches
//   mood,     'neutral' | 'worried' (raised brows, ears back, small open mouth, tremble) | 'happy' (squinty smile)
//   look, lid, food (eat: draw the seed, default true),
//   part,     'all' | 'body' | 'grip' — behind cage bars draw part 'body', then the bars, then part 'grip'
//             (fingers wrapped round the bar + incisors) so the paws hold the bar from behind.
//   shadow
// }) -> { mouth, eye, head, bar (world x of the gnawed bar centreline), grip: [lowPaw, highPaw] }
// Size: ~12 units to the top of the head sitting at s 1 (~14 with ears; run ~10 tall; draw at s ~4-8). gnaw: the bar
// centreline is 5.4 * s in front of the ground point; the hamster stands ~17.7 tall, teeth ~12 above the ground, paws
// gripping at ~11 and ~13.6. Unknown pose names fall back to 'sit'.
//
// drawGuineaPig(c, {
//   x, y, s, flip, t, seed,
//   pose,     'stand' | 'walk' (phase; advance by distance / (6 * s)) | 'popcorn' (k 0..1: crouch, hop-twist jump, land)
//             | 'call' (head up, mouth open: wheek) | 'eat' (head down nibbling)
//   phase, k, look, mouth (0..1 override), shadow
// }) -> { mouth, eye, head }
// Size: ~14 units to the top of the back at s 1 (~15.7 with ears), ~30 long. Tricolour coat (white base, ginger and
// black patches, white blaze). popcorn peaks ~8 units up at k 0.5; drive k 0 -> 1 over ~0.5 s.
import { Path2D, createCanvas } from '@napi-rs/canvas';
import { blob, capsule, circle, oval, rect, join, fill, line, clipped, lin, rad, shadow, ik2 } from '../engine/draw.js';
import { TAU, clamp, lerp, mix, alpha, hash, noise1, smooth, ease } from '../engine/util.js';
import { eye, blink, inkW } from './rig.js';

const KR = 0.3; // rabbit design units -> character units (design shoulder ~100)
const KS = 0.1; // hamster design units -> character units
const KG = 0.115; // guinea pig design units -> character units
const lineW = (sd) => inkW(sd) * 1.2; // sd = screen px per design unit; slightly bolder than the dog for small bodies
const L2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const W = (pt, x, y, sd, flip) => [x + pt[0] * sd * flip, y + pt[1] * sd];

function mixState(a, b, k) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const o = {};
  for (const key in a) {
    const va = a[key], vb = b[key] ?? va;
    o[key] = Array.isArray(va) ? va.map((v, i) => lerp(v, vb[i], k)) : lerp(va, vb, k);
  }
  return o;
}
// Piecewise keyframes over a cycle: keys [[ph, state], ...] covering 0..1, eased between keys.
function keyed(keys, ph) {
  let i = 1;
  while (i < keys.length - 1 && keys[i][0] <= ph) i++;
  const a = keys[i - 1], b = keys[i];
  return mixState(a[1], b[1], ease.io(clamp((ph - a[0]) / (b[0] - a[0]))));
}
// Occasional signed 0 -> 1 -> 0 pulse at pseudo-random times (ear flicks, head shakes).
function pulse(t, seed, period, dur) {
  const k = t / period + hash(seed, 7), i = Math.floor(k), ph = (k - i) * period, at = hash(i, seed + 13) * (period - dur);
  const d = ph - at;
  return d > 0 && d < dur ? Math.sin((d / dur) * Math.PI) * (hash(i, seed + 21) < 0.5 ? -1 : 1) : 0;
}
const gate = (t, seed, rate = 0.45) => smooth(clamp(noise1(t * rate, seed) * 2.2 + 0.5));

// Merged silhouette for fill + single outline. Skia's pairwise union can silently drop an operand on near-tangent
// curves (the rabbit haunch vanished in ~11% of 'push' frames), so each op is checked with a point-in-path probe at
// the operand's centre and retried with a tiny nudge. Last resort: keep overlapping contours (all parts wind clockwise,
// so the nonzero fill is still right; only a seam may show).
const PROBE = createCanvas(1, 1).getContext('2d'); // point-in-path tests only; allocated once
const mid = (q) => { const b = q.getBounds(); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
function merge(...ps) {
  const u = new Path2D(ps[0]), m0 = mid(ps[0]);
  for (let i = 1; i < ps.length; i++) {
    const mi = mid(ps[i]);
    let ok = false;
    for (let k = 0; k < 4 && !ok; k++) {
      let q = ps[i];
      if (k) { q = new Path2D(); q.addPath(ps[i], { a: 1, b: 0, c: 0, d: 1, e: 0.037 * k, f: -0.029 * k }); }
      u.op(q, 2); // 2 = PathOp.Union
      if (!PROBE.isPointInPath(u, m0[0], m0[1])) return join(...ps);
      ok = PROBE.isPointInPath(u, mi[0], mi[1]);
    }
    if (!ok) u.addPath(ps[i]);
  }
  return u;
}

// ---- shared shape cache (static local-space paths) ----
const CACHE = new Map();
function cached(key, make) {
  let v = CACHE.get(key);
  if (!v) { if (CACHE.size > 400) CACHE.clear(); v = make(); CACHE.set(key, v); }
  return v;
}

// =====================================================================================================  rabbit
export const RABBITS = {
  sandy: { coat: '#d8a868', dark: '#a7743d', light: '#f0d09b', cream: '#fbf4e6', line: '#56341b', inner: '#f0a39e', nose: '#df7f88', iris: '#3f2516',
    blaze: 1, ear: 1, lean: 0 },
  sandy20: { coat: '#cb9c62', dark: '#97693a', light: '#e3c18e', cream: '#f8eedc', line: '#51321a', inner: '#e99d97', nose: '#cf7b80', iris: '#3a2214',
    blaze: 0.6, ear: 0.96, lean: 0.3, agouti: 0.3 },
  sandy50: { coat: '#b68d5d', dark: '#83613c', light: '#d4b186', cream: '#f1e5cf', line: '#4b2f19', inner: '#e0958f', nose: '#b9706f', iris: '#33200f',
    blaze: 0.25, ear: 0.92, lean: 0.55, agouti: 0.65, tip: '#4e3826' },
  sandy200: { coat: '#a78259', dark: '#76573a', light: '#c8a77f', cream: '#ede0ca', line: '#432a17', inner: '#d88f88', nose: '#a8665f', iris: '#2f1d0f',
    blaze: 0.08, ear: 0.9, lean: 0.75, agouti: 1, tip: '#3e2c1f', nape: '#b47a4a' },
  white: { coat: '#f0ece3', dark: '#cbc3b5', light: '#faf8f3', cream: '#faf8f3', line: '#6b5d52', inner: '#f2ada8', nose: '#e8939b', iris: '#5a2a2a',
    ear: 1, lean: 0.05 },
  patched: { coat: '#f0ece4', dark: '#cdc5b9', light: '#faf8f4', cream: '#faf8f4', line: '#2e2a29', inner: '#e9a29e', nose: '#d88a91', iris: '#2f1f17',
    ear: 1, lean: 0.05, dutch: '#302c2d' },
  grey: { coat: '#9c9ea4', dark: '#6c6f77', light: '#c3c5ca', cream: '#ebe8e3', line: '#2e3037', inner: '#e3a3a2', nose: '#c98488', iris: '#2c221e',
    ear: 1, lean: 0.1 },
  brown: { coat: '#9a7853', dark: '#6b5035', light: '#bb9b76', cream: '#ece1cd', line: '#3b2819', inner: '#d48e88', nose: '#9f625c', iris: '#2b1b10',
    ear: 0.9, lean: 0.75, agouti: 1, tip: '#35261b', nape: '#ad7346' },
};

// Static poses in design units (ground y = 0, facing +x). H haunch centre, hr haunch radii/rotation, S chest centre,
// cr chest radius, arch back hump, hd head centre, hrot head rotation (+ = nose down), toe near hind toe (centre line
// of the foot, y -6 = planted), fa foot angle heel->toe (0 = flat forward, PI = pointing back), paw / paw2 forepaws.
const RPOSE = {
  sit: { H: [-30, -36], hr: [36, 34, -0.15], S: [12, -60], cr: 25, arch: 18, belly: 0, hd: [40, -88], hrot: 0.06, toe: [14, -6], fa: 0,
    paw: [34, -5], paw2: [42, -6], ear: 0, tail: 0, chew: 0, relax: 0, nose: 0.6 },
  graze: { H: [-34, -40], hr: [36, 34, -0.05], S: [14, -46], cr: 24, arch: 30, belly: 0, hd: [54, -30], hrot: 0.95, toe: [12, -6], fa: 0,
    paw: [38, -5], paw2: [46, -6], ear: -0.55, tail: 0, chew: 1, relax: 0.12, nose: 0.5 },
  alert: { H: [-18, -36], hr: [32, 35, -0.6], S: [-4, -100], cr: 24, arch: 4, belly: -4, hd: [14, -132], hrot: -0.06, toe: [22, -6], fa: 0,
    paw: [18, -72], paw2: [25, -76], ear: 0.2, tail: 0.2, chew: 0, relax: 0, nose: 1 },
  lie: { H: [-44, -22], hr: [32, 21, 0.05], S: [22, -24], cr: 21, arch: 4, belly: -6, hd: [60, -32], hrot: 0.16, toe: [-100, -6], fa: Math.PI,
    paw: [66, -5], paw2: [74, -6], ear: -0.9, tail: 0, chew: 0, relax: 0.45, nose: 0.2 },
  dig: { H: [-40, -48], hr: [34, 34, -0.1], S: [10, -40], cr: 23, arch: 22, belly: 0, hd: [30, -46], hrot: 0.55, toe: [6, -6], fa: 0,
    paw: [60, -8], paw2: [64, -8], ear: -0.35, tail: 0.25, chew: 0, relax: 0.1, nose: 0.3 },
  push: { H: [-26, -36], hr: [33, 34, -0.45], S: [2, -84], cr: 24, arch: 6, belly: 0, hd: [22, -114], hrot: 0.04, toe: [12, -6], fa: 0.1,
    paw: [56, -80], paw2: [58, -92], ear: -0.4, tail: 0.1, chew: 0, relax: 0.1, nose: 1 },
};
const HOP_STRIDE = 110; // design units per hop (adult, leap 0)
const HOP_KEYS = [
  [0.0, { H: [-30, -34], hr: [35, 32, -0.15], S: [18, -50], cr: 24, arch: 24, belly: 0, hd: [48, -78], hrot: 0.25, ear: -0.1, tail: 0.5 }],
  [0.14, { H: [-14, -60], hr: [33, 32, -0.5], S: [36, -74], cr: 24, arch: 10, belly: 0, hd: [66, -98], hrot: 0.0, ear: -0.35, tail: 0.8 }],
  [0.36, { H: [-30, -74], hr: [32, 30, -0.6], S: [36, -78], cr: 23, arch: 2, belly: -2, hd: [68, -94], hrot: 0.1, ear: -0.65, tail: 0.9 }],
  [0.56, { H: [-34, -62], hr: [33, 31, -0.25], S: [26, -40], cr: 24, arch: 14, belly: 0, hd: [54, -60], hrot: 0.35, ear: -0.35, tail: 0.6 }],
  [0.8, { H: [-28, -40], hr: [34, 32, -0.1], S: [20, -46], cr: 24, arch: 26, belly: 0, hd: [48, -70], hrot: 0.35, ear: -0.1, tail: 0.5 }],
  [1.0, null],
];
HOP_KEYS[5][1] = HOP_KEYS[0][1];

// Hop feet: stance spans are ground-anchored (slide back at exactly the stride rate), swing spans are keyed.
function hopState(phase, strideD, leap) {
  const ph = ((phase % 1) + 1) % 1;
  const st = { ...keyed(HOP_KEYS, ph), chew: 0, relax: 0, nose: 0.4 };
  const air = ph > 0.14 && ph < 0.56 ? Math.sin(((ph - 0.14) / 0.42) * Math.PI) : 0;
  const up = -leap * 34 * air;
  st.H = [st.H[0], st.H[1] + up]; st.S = [st.S[0], st.S[1] + up]; st.hd = [st.hd[0], st.hd[1] + up];
  // hind feet: stance 0.80 -> 1.14, planted at x 14
  const TPH = 14, hp = ph < 0.5 ? ph + 1 : ph;
  if (hp >= 0.8 && hp <= 1.14) {
    st.toe = [TPH - strideD * (hp - 0.8), -6];
    st.fa = hp < 1 ? lerp(0, 0.3, smooth((hp - 0.8) / 0.2)) : lerp(0.3, 1.0, smooth((hp - 1) / 0.14));
  } else {
    const k = keyed([
      [0.14, { toe: [TPH - strideD * 0.34, -6], fa: 1.0 }],
      [0.22, { toe: [-58 - (strideD - HOP_STRIDE) * 0.2, -12 + up * 0.6], fa: 1.9 }],
      [0.36, { toe: [-80 - (strideD - HOP_STRIDE) * 0.3, -20 + up], fa: 2.3 }],
      [0.56, { toe: [-14, -34 + up * 0.5], fa: 0.4 }],
      [0.8, { toe: [TPH, -6], fa: 0 }],
    ], ph);
    st.toe = [k.toe[0], Math.min(k.toe[1], -6)]; st.fa = k.fa;
  }
  // forepaws: stance 0.56 -> 0.84, planted at x 62; far paw lands a touch later
  const fore = (off) => {
    const fp = (((ph - off) % 1) + 1) % 1, TPF = 62;
    if (fp >= 0.56 && fp <= 0.84) return [TPF - strideD * (fp - 0.56), -5];
    const q = fp < 0.56 ? fp + 1 : fp;
    const k = keyed([
      [0.84, { p: [TPF - strideD * 0.28, -5] }],
      [1.0, { p: [34, -18] }],
      [1.14, { p: [52, -34] }],
      [1.36, { p: [74 + (strideD - HOP_STRIDE) * 0.2, -40 + up] }],
      [1.56, { p: [TPF, -5] }],
    ], q);
    return [k.p[0], Math.min(k.p[1], -5)];
  };
  st.paw = fore(0); st.paw2 = fore(0.035); st.paw2[0] += 6;
  return st;
}

export function rabbitStride(v = 'sandy', s = 1, kit = 0, leap = 0) {
  const V = typeof v === 'string' ? RABBITS[v] || RABBITS.sandy : { ...RABBITS.sandy, ...(v || {}) };
  return HOP_STRIDE * lerp(1, 1.45, clamp(leap)) * lerp(1, 0.85, clamp(kit)) * KR * (V.size ?? 1) * lerp(1, 0.42, clamp(kit)) * s;
}

const earShape = (Le, We) => cached(`rear|${Le.toFixed(1)}|${We.toFixed(1)}`, () => ({
  outer: blob([[-We * 0.42, 6], [-We * 0.56, -Le * 0.25], [-We * 0.52, -Le * 0.6], [-We * 0.3, -Le * 0.88], [-We * 0.02, -Le], [We * 0.3, -Le * 0.9],
    [We * 0.5, -Le * 0.6], [We * 0.5, -Le * 0.25], [We * 0.36, 6]]),
  inner: blob([[-We * 0.1, -Le * 0.1], [-We * 0.3, -Le * 0.32], [-We * 0.27, -Le * 0.64], [-We * 0.1, -Le * 0.86], [We * 0.1, -Le * 0.87],
    [We * 0.3, -Le * 0.62], [We * 0.32, -Le * 0.32], [We * 0.16, -Le * 0.1]]),
  tip: blob([[-We, -Le * 0.8], [We, -Le * 0.74], [We, -Le - 10], [-We, -Le - 10]]),
}));

// Head silhouette in head-local units (centre 0,0, facing +x); mz stretches the muzzle.
const rabbitHead = (mz) => cached(`rhead|${mz.toFixed(2)}`, () => {
  const X = (x) => (x > 6 ? 6 + (x - 6) * mz : x);
  const skull = oval(0, -1, 25, 23, 0);
  const muzzle = blob([[6, -16], [X(22), -13], [X(33), -6], [X(38.5), 2], [X(36), 11], [X(27), 18], [X(13), 20], [2, 16]]);
  const cheek = oval(-1, 9, 18, 14, 0.15);
  return { sil: merge(skull, muzzle, cheek), X };
});
const scutShape = cached('scut', () => blob([[0, -11], [7, -8.5], [11, -1], [8.5, 7], [1, 10.5], [-7, 8], [-11, 1], [-8, -7.5]]));

export function drawRabbit(c, p = {}) {
  const V = typeof p.v === 'string' ? RABBITS[p.v] || RABBITS.sandy : { ...RABBITS.sandy, ...(p.v || {}) };
  const t = p.t ?? 0, seed = p.seed ?? 0, kit = clamp(p.kit ?? 0), leap = clamp(p.leap ?? 0), live = 1 - clamp(p.still ?? 0);
  const size = (V.size ?? 1) * lerp(1, 0.42, kit), flip = p.flip ?? 1, sd = (p.s ?? 1) * KR * size;
  const lean = V.lean ?? 0, L = V.line, lw = lineW(sd);
  const strideD = HOP_STRIDE * lerp(1, 1.45, leap) * lerp(1, 0.85, kit);

  // ---- pose state ----
  const get = (n) => (n === 'hop' ? hopState(p.phase ?? 0, strideD, leap) : RPOSE[n] || RPOSE.sit);
  const pose = p.pose ?? (p.gait === 'hop' ? 'hop' : 'sit');
  let st = Array.isArray(pose) ? mixState(get(pose[0]), get(pose[1]), clamp(pose[2])) : get(pose);
  const push = clamp(p.push ?? 0);
  if (push > 0) st = mixState(st, RPOSE.push, push);
  const isDig = (Array.isArray(pose) ? (pose[2] < 0.5 ? pose[0] : pose[1]) : pose) === 'dig';
  let H = [...st.H], S = [...st.S], hd = [...st.hd], toe = [...st.toe], fa = st.fa, paw = [...st.paw], paw2 = [...st.paw2];
  let tail = st.tail, hrot = st.hrot;
  // life
  const br = Math.sin(t * lerp(4.2, 6, kit) + seed * 1.7) * live;
  hd[1] += br * 0.5; hrot += Math.sin(t * 0.7 + seed) * 0.02 * live;
  if (push > 0) { const shove = Math.max(0, Math.sin(t * 5.5 + seed)) * push * live; hd[0] += shove * 3; S[0] += shove * 1.5; paw[0] += shove * 0.5; }
  if (isDig) {
    const w = t * TAU * 3.2 + seed, a = Math.sin(w), b = Math.sin(w + Math.PI);
    paw = [paw[0] + a * 9, paw[1] - Math.max(0, Math.cos(w)) * 8]; paw2 = [paw2[0] + b * 9, paw2[1] - Math.max(0, Math.cos(w + Math.PI)) * 8];
    S[1] += Math.sin(w * 2) * 1.2; hd[1] += Math.sin(w * 2) * 1.5;
  }
  const th = clamp(p.thump ?? 0);
  let thLift = 0, thHit = 0;
  if (th > 0 && th < 1) {
    thLift = th < 0.55 ? ease.out(th / 0.55) : th < 0.6 ? 1 - (th - 0.55) / 0.05 : 0;
    thHit = th >= 0.58 ? 1 - (th - 0.58) / 0.42 : 0;
    toe[1] -= thLift * 16; fa += thLift * 0.35; tail += Math.max(thLift, thHit) * 0.8;
    const jolt = thHit * Math.sin((th - 0.58) * 60) * 2.5;
    H[1] -= thLift * 4 - jolt; S[1] -= thLift * 2 - jolt * 0.6; hd[1] -= thLift * 2 - jolt * 0.8;
  }
  // kit proportions: shorter, rounder body, head carried higher
  const kx = lerp(1, 0.86, kit);
  if (kit > 0) {
    for (const q of [H, S, hd, toe, paw, paw2]) q[0] *= kx;
    hd = [S[0] + (hd[0] - S[0]) * lerp(1, 1.08, kit), S[1] + (hd[1] - S[1]) * lerp(1, 1.12, kit)];
  }
  const g = lerp(1, 1.08, kit) * lerp(1, 0.88, lean) * (1 + br * 0.012);
  const hk = lerp(1, 1.34, kit) * lerp(1, 0.97, lean), mz = lerp(1, 0.76, kit) * lerp(1, 1.08, lean);
  const legK = lerp(1, 1.06, lean) * lerp(1, 0.88, kit);

  // ---- skeleton -> shapes ----
  const dx = S[0] - H[0], dy = S[1] - H[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = uy, ny = -ux;
  const sp = (a, b) => [H[0] + ux * a * d + nx * b, H[1] + uy * a * d + ny * b];
  const arch = st.arch;
  const torso = blob([sp(-0.15, -24 * g), sp(-0.55, -2 * g), sp(-0.42, 24 * g), sp(0.1, 34 * g + arch * 0.5), sp(0.6, 28 * g + arch),
    sp(1.0, 24 * g + arch * 0.3), sp(1.28, 6 * g), sp(1.1, -20 * g), sp(0.5, -21 * g - st.belly)]);
  const haunch = oval(H[0], H[1], st.hr[0] * g, st.hr[1] * g, st.hr[2]);
  const chest = circle(S[0], S[1], st.cr * g);
  const neck = capsule(S[0], S[1], st.cr * 0.82 * g, hd[0] - 6 * hk, hd[1] + 6 * hk, 15 * hk);
  const FLEN = 46 * legK, TH1 = 34 * legK, TH2 = 36 * legK;
  const hindLeg = (off, tt) => {
    const tx = tt[0] + off[0], ty = tt[1] + off[1];
    const hx = tx - Math.cos(fa) * FLEN, hy = ty - Math.sin(fa) * FLEN;
    const k = ik2(H[0] + off[0], H[1] + off[1], hx, hy, TH1, TH2, -1);
    return { parts: [capsule(k.jx, k.jy, 11 * g, k.ex, k.ey, 6.5), capsule(k.ex, k.ey, 6.5, tx, ty, 6.2)], toe: [tx, ty], heel: [k.ex, k.ey] };
  };
  const foreLeg = (off, pp) => {
    const rx = S[0] + 4 + off[0], ry = S[1] + 10 + off[1];
    const k = ik2(rx, ry, pp[0], pp[1] - 1, 25 * legK, 25 * legK, 1);
    return { parts: [capsule(rx, ry, 9.5 * g, k.jx, k.jy, 6), capsule(k.jx, k.jy, 6, k.ex, k.ey, 5), oval(k.ex + 3, k.ey + 0.5, 7.6, 5, 0)], e: [k.ex, k.ey] };
  };
  const nh = hindLeg([0, 0], toe), fh = hindLeg([8, -3], toe), nf = foreLeg([0, 0], paw), ff = foreLeg([6, -2], paw2);

  // head-space helpers
  const ca = Math.cos(hrot), sa = Math.sin(hrot);
  const toBody = (q) => [hd[0] + (q[0] * ca - q[1] * sa) * hk, hd[1] + (q[0] * sa + q[1] * ca) * hk];
  const HEAD = rabbitHead(mz), X = HEAD.X;

  // ears: carriage from option + pose, flicks from life
  const eo = p.ears, eN = Array.isArray(eo) ? eo[0] : eo ?? 0, eF = Array.isArray(eo) ? eo[1] : eo ?? 0;
  const carriage = (v) => (v < 0 ? lerp(-0.14, -1.42, -v) : lerp(-0.14, 0.22, v));
  const Le = 60 * (V.ear ?? 1) * lerp(1, 0.56, kit), We = 17 * lerp(1, 1.12, kit);
  const ears = [
    { b: [-8, -15], a: carriage(eN) + st.ear - 0.04 + 0.28 * pulse(t, seed + 11, 5.2, 0.32) * live + br * 0.01, v: eN, far: false },
    { b: [5, -18], a: carriage(eF) + st.ear + 0.1 + 0.28 * pulse(t, seed + 29, 6.1, 0.32) * live, v: eF, far: true },
  ];

  // ---- draw ----
  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(sd * flip, sd);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const shA = p.shadow ?? 0.3;
  if (shA > 0) {
    const lowest = Math.max(nh.toe[1], fh.toe[1], nf.e[1] + 5, ff.e[1] + 5, H[1] + st.hr[1] * g, S[1] + st.cr * g);
    const lift = clamp((-lowest - 2) / 50);
    shadow(c, (H[0] + S[0]) / 2 + 4, 0, (d * 0.5 + 52) * lerp(1, 0.75, lift), 7, shA * lerp(1, 0.55, lift));
  }
  const farCol = mix(V.dark, L, 0.1);
  for (const leg of [fh, ff]) { const u = merge(...leg.parts); fill(c, u, farCol); line(c, u, L, lw); }
  if (isDig) { // dirt kicked back between the legs
    for (let i = 0; i < 6; i++) {
      const u = (t * 1.9 + i / 6 + hash(i, seed)) % 1, r = 2.2 + hash(i, seed + 3) * 2.8;
      const px = lerp(58, -80 - hash(i, seed + 5) * 40, u), py = -6 - Math.sin(u * Math.PI) * (30 + hash(i, seed + 7) * 34);
      c.globalAlpha = 1 - u * u; fill(c, circle(px, py, r * 1.5 * (1 - u * 0.4)), '#6e4f33'); c.globalAlpha = 1;
    }
  }
  // tail scut (behind the haunch so only the puff shows)
  const tq = [H[0] - st.hr[0] * g * 0.9 - tail * 4, H[1] + st.hr[1] * g * 0.12 - tail * 16];
  c.save(); c.translate(tq[0], tq[1]); c.scale(g * lerp(1, 1.15, tail), g * lerp(1, 1.15, tail));
  fill(c, scutShape, lin(c, 0, -11, 0, 11, [[0, V.light], [0.5, V.cream], [1, mix(V.cream, V.dark, 0.35)]])); line(c, scutShape, L, lw / g);
  c.restore();

  // body silhouette
  const trunk = join(torso, haunch, chest, neck); // clip shapes: overlapping contours are fine
  const legParts = [...nh.parts, ...nf.parts];
  const legsU = join(...legParts);
  const sil = merge(torso, haunch, chest, neck, ...legParts);
  const top = Math.min(sp(0.6, 28 * g + arch)[1], S[1] - st.cr, H[1] - st.hr[1]) - 4;
  fill(c, sil, lin(c, 0, top, 0, 2, [[0, V.light], [0.45, V.coat], [1, V.dark]]));
  clipped(c, trunk, () => {
    if (V.dutch) fill(c, blob([sp(0.42, 90), sp(0.5, 30), sp(0.36, -60), sp(-1.6, -60), sp(-1.6, 90)]), V.dutch);
    if (V.agouti) {
      c.save(); c.globalAlpha = 0.28 * V.agouti; c.strokeStyle = V.dark; c.lineWidth = 16;
      const p0 = sp(-0.4, 22 * g), p1 = sp(0.1, 33 * g + arch * 0.5), p2 = sp(0.6, 27 * g + arch), p3 = sp(1.0, 23 * g + arch * 0.3);
      c.beginPath(); c.moveTo(p0[0], p0[1]); c.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]); c.stroke(); c.restore();
      if (V.nape) { const q = sp(1.05, 16 * g); fill(c, oval(q[0], q[1], 16, 10, Math.atan2(uy, ux)), alpha(V.nape, 0.7)); }
    }
    // cream throat / chest and belly
    const q = sp(1.15, -6 * g);
    c.fillStyle = rad(c, q[0], q[1], 30, [[0, alpha(V.cream, 0.95)], [0.55, alpha(V.cream, 0.6)], [1, alpha(V.cream, 0)]]);
    c.fillRect(q[0] - 30, q[1] - 30, 60, 60);
    const b2 = sp(0.45, -22 * g);
    c.save(); c.translate(b2[0], b2[1]); c.rotate(Math.atan2(uy, ux)); c.scale(1, 0.32);
    c.fillStyle = rad(c, 0, 0, 40, [[0, alpha(V.cream, 0.85)], [0.6, alpha(V.cream, 0.4)], [1, alpha(V.cream, 0)]]);
    c.fillRect(-40, -40, 80, 80); c.restore();
  });
  clipped(c, sil, () => {
    c.fillStyle = lin(c, 0, -26, 0, 0, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), 0.45)]]);
    c.fillRect(-200, -26, 400, 30);
    c.save(); c.translate(1.2, 2.6); c.globalAlpha = 0.34; line(c, sil, V.light, lw * 2.4); c.restore();
    c.save(); c.globalAlpha = 0.34; c.strokeStyle = L; c.lineWidth = lw * 0.8; c.beginPath();
    c.ellipse(H[0], H[1], st.hr[0] * g * 0.98, st.hr[1] * g * 0.98, st.hr[2], -2.0, -0.35); c.stroke(); c.restore();
  });
  line(c, sil, L, lw);
  // toes
  c.strokeStyle = alpha(L, 0.6); c.lineWidth = lw * 0.7;
  { const tx = nh.toe[0] + Math.cos(fa) * 2, ty = nh.toe[1] + Math.sin(fa) * 2;
    for (const k of [-1, 1]) { c.beginPath(); c.moveTo(tx - Math.cos(fa) * 5 + k * 0.5, ty - Math.sin(fa) * 5 + 2 * k); c.lineTo(tx + Math.cos(fa) * 1.5, ty + Math.sin(fa) * 1.5 + 1.2 * k); c.stroke(); } }
  { const e = nf.e; c.beginPath(); c.moveTo(e[0] + 6, e[1] - 2.5); c.lineTo(e[0] + 7.5, e[1] + 2); c.stroke(); }
  if (thHit > 0) { // dust puff on the stamp
    const u = 1 - thHit, hx = nh.toe[0] - 20;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i / 4) * Math.PI, r = 5 + u * 26;
      c.globalAlpha = thHit * 0.55; fill(c, circle(hx + Math.cos(a) * r * 1.4, -3 + Math.sin(a) * r * 0.45, 3 + u * 5), '#c8b393'); c.globalAlpha = 1;
    }
  }

  // ---- head ----
  c.save();
  c.translate(hd[0], hd[1]); c.rotate(hrot); c.scale(hk, hk);
  const lwH = lw / hk;
  for (const e of ears) {
    const sh = earShape(Le, We);
    c.save(); c.translate(e.b[0], e.b[1]); c.rotate(e.a); c.scale(1 - Math.abs(e.v) * 0.12, 1);
    const base = V.dutch || (e.far ? mix(V.coat, V.dark, 0.35) : V.coat);
    fill(c, sh.outer, lin(c, 0, -Le, 0, 6, [[0, mix(base, V.light, e.far ? 0 : 0.35)], [1, mix(base, V.dark, 0.4)]]));
    clipped(c, sh.outer, () => {
      c.globalAlpha = clamp((e.far ? 0.6 : 0.9) * (0.8 + e.v * 0.2) * (V.dutch ? 0.85 : 1), 0.25, 1);
      fill(c, sh.inner, e.far ? mix(V.inner, V.dark, 0.25) : V.inner);
      c.globalAlpha = 1;
      if (V.tip) { c.globalAlpha = 0.85; fill(c, sh.tip, V.tip); c.globalAlpha = 1; }
    });
    line(c, sh.outer, L, lwH);
    c.restore();
  }
  const headCol = V.coat;
  fill(c, HEAD.sil, lin(c, 0, -24, 0, 22, [[0, V.light], [0.5, headCol], [1, mix(headCol, V.dark, 0.55)]]));
  const chew = clamp(p.chew ?? st.chew ?? 0);
  const jaw = chew * (0.5 + 0.5 * Math.sin(t * 15 + seed)) * 1.6;
  const nAmt = (p.nose ?? st.nose ?? 0.6) * live;
  const tw = Math.sin(t * 34 + seed * 3) * gate(t, seed + 3) * nAmt * 1.1 + jaw * 0.4;
  clipped(c, HEAD.sil, () => {
    if (V.dutch) { fill(c, oval(-6, -2, 34, 34), V.dutch); }
    if (V.agouti) { c.globalAlpha = 0.6; fill(c, oval(4, -6, 13, 11), V.cream); c.globalAlpha = 1; }
    const bz = V.dutch ? 1 : V.blaze ?? 0;
    if (bz > 0.02) {
      c.globalAlpha = bz;
      fill(c, blob([[3, -26], [11, -25], [19, -14], [X(30), -6], [X(37), 2], [X(31), 8], [X(20), 4], [10, -7], [1, -18]]), V.cream);
      c.globalAlpha = 1;
    }
    // whisker pad + chin
    fill(c, oval(X(29), 10 + tw * 0.3, 10.5, 8.2, 0.1), mix(V.cream, V.coat, V.dutch ? 0 : 0.12));
    fill(c, oval(X(18), 18 + jaw, 12, 5, 0), mix(V.cream, V.coat, V.dutch ? 0 : 0.2));
    c.fillStyle = lin(c, 0, 6, 0, 26, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), 0.45)]]);
    c.fillRect(-30, 6, 80, 22);
  });
  line(c, HEAD.sil, L, lwH);
  // cheek fur line
  c.strokeStyle = alpha(L, 0.4); c.lineWidth = lwH * 0.8;
  c.beginPath(); c.moveTo(-14, 14); c.quadraticCurveTo(-6, 21 + jaw * 0.5, 4, 19); c.stroke();
  // nose, mouth, whiskers
  const nx0 = X(36.5), ny0 = 1.5 + tw;
  const noseP = blob([[nx0 - 3.6, ny0 - 2.4], [nx0 + 2.6, ny0 - 2.8], [nx0 + 2.2, ny0 + 0.8], [nx0, ny0 + 2.8], [nx0 - 2.4, ny0 + 1]]);
  fill(c, noseP, V.nose); line(c, noseP, L, lwH * 0.6);
  c.strokeStyle = L; c.lineWidth = lwH * 0.75;
  c.beginPath(); c.moveTo(nx0, ny0 + 2.8); c.lineTo(nx0 - 0.4, 8 + tw * 0.5);
  c.quadraticCurveTo(nx0 - 3, 11 + jaw * 0.6, nx0 - 6, 10.5 + jaw * 0.4); c.stroke();
  c.beginPath(); c.moveTo(nx0 - 0.4, 8 + tw * 0.5); c.quadraticCurveTo(nx0 + 1.5, 11 + jaw * 0.6, nx0 + 3, 10 + jaw * 0.4); c.stroke();
  c.strokeStyle = alpha(L, 0.5); c.lineWidth = lwH * 0.45;
  for (const [ex, ey] of [[X(55), 0], [X(58), 8], [X(54), 15]]) {
    c.beginPath(); c.moveTo(X(30), 8 + tw * 0.6); c.quadraticCurveTo((X(30) + ex) / 2, (8 + ey) / 2 - 2 + tw, ex, ey + tw * 1.2); c.stroke();
  }
  // eyes
  const ek = lerp(1, 1.16, kit), bl = p.blink ?? blink(t, seed + 1, 4.6) * live;
  const lid = clamp(Math.max(p.lid ?? st.relax ?? 0, bl));
  const look = p.look || [0.35, 0.05], lidCol = mix(V.dutch || headCol, V.light, 0.25);
  eye(c, { x: X(21), y: -8, r: 7.2 * ek, look, iris: V.iris, irisR: 0.8, lid, lidColor: lidCol, line: L, lw: lwH * 0.85 });
  eye(c, { x: 4, y: -5, r: 10 * ek, look, iris: V.iris, irisR: 0.8, lid, lidColor: lidCol, line: L, lw: lwH * 0.85 });
  // carrot held in the mouth
  if (p.carrot) {
    const k = clamp(typeof p.carrot === 'number' ? p.carrot : 1), len = 12 + 46 * k, a = 0.5, mx = X(30), my = 13 + jaw;
    c.save(); c.translate(mx, my); c.rotate(a);
    if (k > 0.85) {
      for (const [ang, ln] of [[-0.5, 16], [0, 19], [0.45, 15]]) {
        const lf = blob([[len - 2, -1.5], [len + Math.cos(ang) * ln * 0.5, Math.sin(ang) * ln * 0.5 - 3], [len + Math.cos(ang) * ln, Math.sin(ang) * ln, 1], [len + Math.cos(ang) * ln * 0.5 + 2, Math.sin(ang) * ln * 0.5 + 2], [len - 2, 1.5]]);
        fill(c, lf, '#5fa33d'); line(c, lf, '#2e5a1c', lwH * 0.7);
      }
    }
    const cr = capsule(-4, 0, 2.6, len, 0, 6.2);
    fill(c, cr, lin(c, 0, -6, 0, 6, [[0, '#ffa64a'], [0.5, '#f0862a'], [1, '#c8601a']]));
    c.strokeStyle = alpha('#8a3a10', 0.6); c.lineWidth = lwH * 0.6;
    for (const f of [0.3, 0.55, 0.78]) { c.beginPath(); c.moveTo(len * f, -2.5 - f * 2.5); c.lineTo(len * f + 1.5, -0.5); c.stroke(); }
    line(c, cr, '#7a3410', lwH * 0.85);
    c.restore();
  }
  c.restore();
  c.restore();

  // ---- anchors ----
  const w = (q) => W(q, p.x ?? 0, p.y ?? 0, sd, flip);
  const nearEar = ears[0], etip = [nearEar.b[0] + Math.sin(nearEar.a) * Le, nearEar.b[1] - Math.cos(nearEar.a) * Le];
  return {
    nose: w(toBody([X(37), 1.5])), mouth: w(toBody([X(32), 11])), eye: w(toBody([4, -5])), head: w(hd), ear: w(toBody(etip)),
    tail: w(tq), paw: w(nf.e), reach: w([Math.max(nf.e[0], ff.e[0]) + 9, (nf.e[1] + ff.e[1]) / 2]), foot: w(nh.toe),
  };
}

// =====================================================================================================  hamster
const HAM = { coat: '#e6a34d', light: '#f8cd8e', dark: '#b8722b', belly: '#fbf3e4', pink: '#efa6a3', line: '#5b3416', ear: '#c88b6c', earIn: '#e7a7a0', bead: '#1b120e' };
const HAM_BAR = 54; // gnaw bar centreline, design units in front of the ground point
// body [cx, cy, rx, ry, rot], head centre + radius + rotation, hands / feet (near, far), ear carriage
const HPOSE = {
  sit: { body: [-4, -44, 46, 44, 0], hd: [20, -88], hr: 33, hrot: 0.04, hand: [38, -50], hand2: [46, -54], foot: [20, -5], foot2: [38, -6], ear: 0 },
  eat: { body: [-6, -44, 46, 44, -0.04], hd: [20, -90], hr: 33, hrot: 0.14, hand: [46, -72], hand2: [52, -77], foot: [20, -5], foot2: [38, -6], ear: 0.05 },
  gnaw: { body: [-8, -60, 36, 54, -0.1], hd: [16, -124], hr: 32, hrot: -0.06, hand: [HAM_BAR - 5, -110], hand2: [HAM_BAR - 5, -136], foot: [12, -5], foot2: [28, -6], ear: -0.15 },
  run: { body: [-8, -38, 56, 30, 0], hd: [48, -50], hr: 30, hrot: 0.16, hand: [40, -12], hand2: [48, -12], foot: [-30, -5], foot2: [-20, -6], ear: -0.5 },
  sleep: { body: [0, -32, 52, 32, 0], hd: [34, -32], hr: 28, hrot: 0.75, hand: [44, -10], hand2: [50, -10], foot: [10, -5], foot2: [20, -5], ear: -0.6 },
};
const hamEar = cached('hamEar', () => ({ o: blob([[-9, 3], [-12, -7], [-8, -17], [0, -20], [8, -17], [11, -7], [8, 3]]), i: blob([[-5, 0], [-7, -7], [-4, -14], [1, -15], [5, -12], [6, -5], [4, 1]]) }));

export function drawHamster(c, p = {}) {
  const t = p.t ?? 0, seed = p.seed ?? 0, flip = p.flip ?? 1, sd = (p.s ?? 1) * KS, lw = lineW(sd), L = HAM.line;
  const poseName = HPOSE[p.pose] ? p.pose : 'sit', P = HPOSE[poseName];
  const mood = p.mood || 'neutral', worried = mood === 'worried', happy = mood === 'happy';
  const ch = clamp(p.cheeks ?? 0), part = p.part || 'all';
  const br = Math.sin(t * (poseName === 'sleep' ? 1.6 : 5.5) + seed);
  let [bx, by, brx, bry, brot] = P.body;
  let hd = [...P.hd], hrot = P.hrot, hand = [...P.hand], hand2 = [...P.hand2];
  const tremble = worried ? Math.sin(t * 47 + seed) * 0.8 : 0;
  bry += br * (poseName === 'sleep' ? 1.6 : 0.7); by -= br * 0.4; hd[1] -= br * 0.6;
  hd[0] += tremble; bx += tremble * 0.5;
  // run: gallop deformation; gnaw: scraping nod; eat: nibble
  const ph = p.phase ?? 0, a = TAU * ph;
  if (poseName === 'run') { by += -Math.abs(Math.sin(a)) * 4; brx += Math.cos(a) * 4; brot = Math.sin(a) * 0.07; hd[1] += Math.sin(a + 0.8) * 2.5; }
  const gn = poseName === 'gnaw' ? Math.sin(t * 22 + seed) : 0;
  if (poseName === 'gnaw') { hd[1] += gn * 1.5; hrot += gn * 0.03; }
  const nib = poseName === 'eat' ? Math.max(0, Math.sin(t * 14 + seed)) : 0;
  if (poseName === 'eat') { hand[1] -= nib * 1.5; hand2[1] -= nib * 1.5; }
  const ca = Math.cos(hrot), sa = Math.sin(hrot), hr = P.hr;
  const toBody = (q) => [hd[0] + q[0] * ca - q[1] * sa, hd[1] + q[0] * sa + q[1] * ca];
  const cheekC = toBody([12 - ch * 8, 13 + ch * 8]), muzC = toBody([30, 7]);
  const ear0 = P.ear + (worried ? -0.45 : happy ? 0.12 : 0) + 0.2 * pulse(t, seed + 5, 4.4, 0.25);

  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(sd * flip, sd);
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (part !== 'grip') {
    if ((p.shadow ?? 0.3) > 0) shadow(c, bx + 6, 0, brx + 22, 7, p.shadow ?? 0.3);
    // legs (behind the body; only paws peek out)
    const legs = [];
    if (poseName === 'run') {
      for (const [ax, off, far] of [[-34, 0.06, true], [36, 0.56, true], [-30, 0, false], [40, 0.5, false]]) {
        const u = TAU * (ph + off), fx = ax + Math.cos(u) * 18, fy = -5 - Math.max(0, Math.sin(u)) * 12;
        legs.push({ path: capsule(ax + (far ? 6 : 0), -26, 9, fx + (far ? 6 : 0), fy, 5), foot: oval(fx + (far ? 6 : 0) + 3, fy, 7.5, 4.5, 0), far });
      }
    } else if (poseName !== 'sleep') {
      for (const [f, far] of [[P.foot2, true], [P.foot, false]]) legs.push({ path: capsule(f[0] - 6, f[1] - 16, 9, f[0], f[1], 6), foot: oval(f[0] + 3, f[1], 9, 5, 0), far });
    }
    for (const lg of legs) {
      const u = merge(lg.path, lg.foot);
      fill(c, u, lg.far ? mix(HAM.pink, L, 0.2) : HAM.pink); line(c, u, L, lw);
    }
    // ears (behind the head)
    for (const [b, far] of [[[8, -29], true], [[-12, -26], false]]) {
      const q = toBody(b);
      c.save(); c.translate(q[0], q[1]); c.rotate(hrot + ear0 + (far ? 0.25 : -0.2));
      fill(c, hamEar.o, far ? mix(HAM.ear, L, 0.2) : HAM.ear);
      fill(c, hamEar.i, far ? mix(HAM.earIn, L, 0.25) : HAM.earIn);
      line(c, hamEar.o, L, lw); c.restore();
    }
    // merged body + head + cheeks + muzzle
    const sil = merge(oval(bx, by, brx, bry, brot), circle(hd[0], hd[1], hr), oval(cheekC[0], cheekC[1], 18 + ch * 22, 15 + ch * 17, hrot - ch * 0.2), oval(muzC[0], muzC[1], 15, 12, hrot));
    const top = hd[1] - hr;
    fill(c, sil, lin(c, 0, top, 0, 0, [[0, HAM.light], [0.45, HAM.coat], [1, HAM.dark]]));
    clipped(c, sil, () => {
      // white belly, chin and cheeks
      const bl = poseName === 'run' || poseName === 'sleep'
        ? oval(bx + brx * 0.25, by + bry * 0.95, brx * 0.85, bry * 0.5, brot)
        : oval(bx + brx * 0.42, by + bry * 0.3, brx * 0.55, bry * 0.85, brot - 0.2);
      fill(c, bl, HAM.belly);
      c.save(); c.translate(hd[0], hd[1]); c.rotate(hrot);
      fill(c, blob([[2 - ch * 10, 8 + ch * 2], [16, 2], [34, -2], [48, 4], [44, 20 + ch * 10], [26, 28 + ch * 14], [4 - ch * 8, 26 + ch * 12]]), HAM.belly);
      if (ch > 0.05) { // pouch bulge shading
        c.strokeStyle = alpha(L, 0.25 * ch); c.lineWidth = lw * 0.8;
        c.beginPath(); c.arc(10 - ch * 6, 16 + ch * 6, 16 + ch * 12, 1.9, 3.4); c.stroke();
      }
      c.restore();
      c.fillStyle = lin(c, 0, -22, 0, 0, [[0, alpha(HAM.dark, 0)], [1, alpha(mix(HAM.dark, L, 0.3), 0.4)]]);
      c.fillRect(-200, -22, 400, 24);
      c.save(); c.translate(1.2, 2.6); c.globalAlpha = 0.34; line(c, sil, HAM.light, lw * 2.4); c.restore();
    });
    line(c, sil, L, lw);
    // fur parting between head and body (a hint, not an outline)
    c.strokeStyle = alpha(L, 0.3); c.lineWidth = lw * 0.8;
    c.beginPath(); const q0 = toBody([-30, 8]), q1 = toBody([-12, 28]); c.moveTo(q0[0], q0[1]); c.quadraticCurveTo(q1[0] - 10, q1[1], q1[0], q1[1]); c.stroke();

    // face (head space)
    c.save(); c.translate(hd[0], hd[1]); c.rotate(hrot);
    const tw = Math.sin(t * 30 + seed) * gate(t, seed + 9) * 0.9 + nib * 0.6;
    const asleep = poseName === 'sleep';
    const bl = asleep ? 1 : clamp(Math.max(p.lid ?? 0, blink(t, seed + 2, 3.8)));
    const look = p.look || (worried ? [0.3, -0.35] : [0.35, 0.05]);
    const eo = { look, irisR: 0.9, pupil: HAM.bead, white: '#3a2a22', lid: bl, lidColor: HAM.coat, line: L, lw: lw * 0.8, happy };
    if (happy && !asleep) eo.lid = 1;
    eye(c, { ...eo, x: 31, y: -12, r: 5.6 });
    eye(c, { ...eo, x: 12, y: -9, r: 7.4 });
    if (worried) { // brows: inner ends raised
      c.strokeStyle = L; c.lineWidth = lw * 1.1;
      c.beginPath(); c.moveTo(4, -18); c.quadraticCurveTo(11, -22, 18, -23); c.stroke();
      c.beginPath(); c.moveTo(26, -24); c.quadraticCurveTo(31, -23, 36, -19); c.stroke();
    }
    // nose, mouth, teeth, whiskers
    const nx = 46, ny = 3 + tw;
    const nose = blob([[nx - 3.5, ny - 2], [nx + 2.5, ny - 2.5], [nx + 2, ny + 1], [nx, ny + 2.6], [nx - 2.6, ny + 1]]);
    fill(c, nose, HAM.pink); line(c, nose, L, lw * 0.6);
    const open = worried ? 0.6 + 0.2 * Math.sin(t * 9) : poseName === 'gnaw' ? 0.7 : nib * 0.5;
    if (open > 0.05 || poseName === 'gnaw') {
      fill(c, oval(nx - 2, ny + 9, 3.2, 1.5 + open * 2.6, 0), '#6a2a26');
      fill(c, poly4(nx - 4, ny + 4.5, 4, 4 + open), '#fff8e8');
      c.strokeStyle = alpha(L, 0.6); c.lineWidth = lw * 0.4; c.beginPath(); c.moveTo(nx - 2, ny + 4.5); c.lineTo(nx - 2, ny + 8.5 + open); c.stroke();
    }
    c.strokeStyle = L; c.lineWidth = lw * 0.7;
    c.beginPath(); c.moveTo(nx, ny + 2.6); c.lineTo(nx - 0.5, ny + 5);
    if (happy) { c.moveTo(nx - 7, ny + 5); c.quadraticCurveTo(nx - 1, ny + 9, nx + 3, ny + 5); }
    c.stroke();
    c.strokeStyle = alpha(L, 0.45); c.lineWidth = lw * 0.4;
    for (const [ex, ey] of [[66, -4], [69, 4], [64, 12]]) { c.beginPath(); c.moveTo(38, 5 + tw * 0.5); c.quadraticCurveTo((38 + ex) / 2, (5 + ey) / 2 - 2, ex, ey + tw); c.stroke(); }
    c.restore();

    // hands (and the seed when eating)
    if (!asleep) {
      if (poseName === 'eat' && p.food !== false) {
        const sx = (hand[0] + hand2[0]) / 2 + 3, sy = (hand[1] + hand2[1]) / 2 - 6, seedP = oval(sx, sy, 4.5, 8, 0.4);
        fill(c, seedP, lin(c, sx - 4, 0, sx + 4, 0, [[0, '#3b3530'], [0.5, '#5d554c'], [1, '#2c2724']])); line(c, seedP, '#1d1a17', lw * 0.6);
        c.strokeStyle = '#e8e2d4'; c.lineWidth = lw * 0.5; c.beginPath(); c.moveTo(sx - 1, sy - 5); c.lineTo(sx + 1.5, sy + 5); c.stroke();
      }
      for (const [hq, far] of [[hand2, true], [hand, false]]) {
        if (poseName === 'run') continue;
        const hp = oval(hq[0], hq[1], 6, 4.6, poseName === 'gnaw' ? 1.3 : 0.5);
        fill(c, hp, far ? mix(HAM.pink, L, 0.15) : HAM.pink); line(c, hp, L, lw * 0.9);
      }
    }
  }
  if (poseName === 'gnaw' && part !== 'body') {
    // fingers wrapped round the bar (draw after the bars) + incisors on the bar
    for (const hq of [hand, hand2]) {
      for (let i = 0; i < 3; i++) {
        const f = oval(HAM_BAR + 1, hq[1] - 4 + i * 3.6, 3.4, 2, 0.15);
        fill(c, f, HAM.pink); line(c, f, L, lw * 0.6);
      }
    }
    const mq = toBody([44, 10]);
    fill(c, poly4(HAM_BAR - 2.5, mq[1] - 1, 4.5, 6), '#fff8e8'); line(c, poly4(HAM_BAR - 2.5, mq[1] - 1, 4.5, 6), L, lw * 0.5);
  }
  c.restore();
  const w = (q) => W(q, p.x ?? 0, p.y ?? 0, sd, flip);
  return { mouth: w(toBody([44, 10])), eye: w(toBody([12, -9])), head: w(hd), bar: (p.x ?? 0) + HAM_BAR * sd * flip, grip: [w(hand), w(hand2)] };
}
const poly4 = rect;

// =====================================================================================================  guinea pig
const GP = { white: '#f5efe5', light: '#fdf9f2', dark: '#d3c6b6', ginger: '#e0954c', gingerL: '#f0b574', black: '#332d2c', blackL: '#554c4a',
  line: '#3b2a22', skin: '#dba59c', iris: '#2b1a14' };
const GP_GAIT = { duty: 0.62, off: { nh: 0, nf: 0.25, fh: 0.5, ff: 0.75 }, stride: 52, lift: 8 };
const GPOSE = {
  stand: { body: [-28, -62, 86, 56, 0], hd: [70, -74], hrot: 0, mouth: 0 },
  walk: { body: [-28, -63, 86, 56, 0], hd: [72, -74], hrot: 0.03, mouth: 0 },
  popcorn: { body: [-28, -64, 86, 56, 0], hd: [70, -76], hrot: -0.05, mouth: 0 },
  call: { body: [-30, -64, 84, 58, -0.06], hd: [74, -92], hrot: -0.5, mouth: 1 },
  eat: { body: [-30, -60, 86, 56, 0.06], hd: [80, -50], hrot: 0.5, mouth: 0 },
};
const gpParts = cached('gp', () => ({
  ear: blob([[-6, 2], [-15, -4], [-17, -14], [-8, -20], [4, -17], [9, -8], [6, 2]]),
  ginger: blob([[-84, -130], [-30, -136], [22, -128], [30, -86], [10, -30], [-30, -14], [-62, -30], [-86, -84]]),
  rump: blob([[-140, -40], [-132, -104], [-104, -128], [-82, -112], [-74, -70], [-86, -24], [-112, -4]]),
  hBlack: blob([[-46, -30], [-24, -48], [4, -50], [18, -32], [14, -4], [-4, 14], [-40, 14]]),
  hGinger: blob([[26, -40], [46, -30], [62, -6], [48, 20], [30, 14], [22, -12]]),
}));

export function drawGuineaPig(c, p = {}) {
  const t = p.t ?? 0, seed = p.seed ?? 0, flip = p.flip ?? 1, sd = (p.s ?? 1) * KG, lw = lineW(sd), L = GP.line;
  const poseName = GPOSE[p.pose] ? p.pose : 'stand', P = GPOSE[poseName];
  let [bx, by, brx, bry, brot] = P.body;
  let hd = [...P.hd], hrot = P.hrot;
  const br = Math.sin(t * 4.6 + seed);
  bry += br * 0.8; hd[1] -= br * 0.6;
  const ph = p.phase ?? 0, walking = poseName === 'walk';
  if (walking) { by += -Math.abs(Math.sin(TAU * ph)) * 2.5; hd[1] += Math.sin(TAU * ph * 2 + 0.6) * 1.5; }
  const chew = poseName === 'eat' ? Math.max(0, Math.sin(t * 13 + seed)) : 0;
  const mouth = clamp(p.mouth ?? (poseName === 'call' ? 0.7 + 0.3 * Math.sin(t * 9 + seed) : chew * 0.35));
  // popcorn: crouch, hop-twist jump, land
  const k = poseName === 'popcorn' ? clamp(p.k ?? 0) : 0;
  let lift = 0, twist = 0, sx = 1, sy = 1, kick = 0;
  if (k > 0) {
    if (k < 0.15) { const u = Math.sin((k / 0.15) * Math.PI * 0.5); sy = 1 - 0.1 * u; sx = 1 + 0.05 * u; }
    else if (k < 0.85) { const u = (k - 0.15) / 0.7; lift = Math.sin(u * Math.PI) * 72; twist = Math.sin(u * TAU) * 0.32; sx = 1 - 0.16 * Math.sin(u * Math.PI); sy = 1 + 0.05 * Math.sin(u * Math.PI); kick = Math.sin(clamp((u - 0.3) / 0.5) * Math.PI); }
    else { const u = Math.sin(((k - 0.85) / 0.15) * Math.PI); sy = 1 - 0.1 * u; sx = 1 + 0.05 * u; }
  }
  const ca = Math.cos(hrot), sa = Math.sin(hrot);
  const toBody = (q) => [hd[0] + q[0] * ca - q[1] * sa, hd[1] + q[0] * sa + q[1] * ca];
  const pivot = [bx, by + bry * 0.6];

  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(sd * flip, sd);
  c.lineJoin = 'round'; c.lineCap = 'round';
  if ((p.shadow ?? 0.3) > 0) shadow(c, bx + 18, 0, (brx + 34) * lerp(1, 0.7, lift / 72), 8, (p.shadow ?? 0.3) * lerp(1, 0.5, lift / 72));
  c.save();
  c.translate(pivot[0], pivot[1] - lift); c.rotate(twist); c.scale(sx, sy); c.translate(-pivot[0], -pivot[1]);
  // legs: tiny, behind the body
  const GP_LEGS = [[-70, 'fh', true], [62, 'ff', true], [-78, 'nh', false], [54, 'nf', false]];
  for (const [ax, key, far] of GP_LEGS) {
    let fx = ax + (far ? 10 : 0), fy = -6;
    if (walking) { const d = gaitFootLocal(ph + GP_GAIT.off[key]); fx += d[0]; fy += d[1]; }
    if (k > 0.15 && k < 0.85) { fy += 4 * Math.sin(((k - 0.15) / 0.7) * Math.PI); if (key.endsWith('h')) { fx -= kick * 14; fy -= kick * 6; } }
    const u = merge(capsule(fx - 2, -24, 9, fx, fy, 6), oval(fx + 4, fy + 0.5, 8.5, 5, 0));
    fill(c, u, far ? mix(GP.skin, L, 0.25) : GP.skin); line(c, u, L, lw);
  }
  const G = gpParts;
  // far ear (behind)
  { const q = toBody([4, -38]); c.save(); c.translate(q[0], q[1]); c.rotate(hrot + 0.5 + Math.sin(t * 2 + seed) * 0.04 - kick * 0.4);
    fill(c, G.ear, mix(GP.skin, L, 0.3)); line(c, G.ear, L, lw); c.restore(); }
  const snout = toBody([36, 10]);
  const rump = [bx - 50 * Math.cos(brot), by - 4 - 50 * Math.sin(brot)];
  const sil = merge(oval(bx, by, brx, bry, brot), oval(rump[0], rump[1], 50, 54, brot), oval(hd[0], hd[1], 46, 42, hrot), oval(snout[0], snout[1], 24, 22, hrot));
  const top = Math.min(by - bry, hd[1] - 42);
  fill(c, sil, GP.white);
  clipped(c, sil, () => {
    c.save(); c.translate(bx, by); c.rotate(brot); c.translate(28, 62); // patches are authored around the stand body centre
    fill(c, G.ginger, lin(c, 0, -126, 0, -40, [[0, GP.gingerL], [1, GP.ginger]]));
    fill(c, G.rump, lin(c, 0, -118, 0, -14, [[0, GP.blackL], [1, GP.black]]));
    c.restore();
    c.save(); c.translate(hd[0], hd[1]); c.rotate(hrot);
    fill(c, G.hBlack, lin(c, 0, -46, 0, 12, [[0, GP.blackL], [1, GP.black]]));
    fill(c, G.hGinger, GP.ginger);
    c.restore();
    // light from the upper left: top highlight, soft form shadow underneath
    c.fillStyle = lin(c, 0, top, 0, 0, [[0, alpha(GP.light, 0.45)], [0.4, alpha(GP.light, 0)], [0.7, alpha(GP.dark, 0)], [1, alpha(mix(GP.dark, L, 0.3), 0.55)]]);
    c.fillRect(-220, top - 10, 440, -top + 14);
    c.save(); c.translate(1.2, 2.6); c.globalAlpha = 0.3; line(c, sil, GP.light, lw * 2.4); c.restore();
    // fur rosette hint on the back
    c.strokeStyle = alpha(L, 0.22); c.lineWidth = lw * 0.8;
    c.beginPath(); c.moveTo(bx - 40, by - 30); c.quadraticCurveTo(bx - 20, by - 46, bx + 6, by - 40); c.stroke();
  });
  line(c, sil, L, lw);
  // face
  c.save(); c.translate(hd[0], hd[1]); c.rotate(hrot);
  const bl = clamp(Math.max(p.lid ?? 0, blink(t, seed + 4, 4.2)));
  const look = p.look || [0.35, poseName === 'call' ? -0.4 : 0.05];
  eye(c, { x: 30, y: -14, r: 7.6, look, iris: GP.iris, irisR: 0.84, lid: bl, lidColor: GP.ginger, line: L, lw: lw * 0.85 });
  eye(c, { x: 6, y: -10, r: 10, look, iris: GP.iris, irisR: 0.84, lid: bl, lidColor: GP.blackL, line: L, lw: lw * 0.85 });
  const tw = Math.sin(t * 26 + seed) * gate(t, seed + 6) * 0.8;
  const nx = 56, ny = 6 + tw;
  if (mouth > 0.05) {
    const mo = blob([[nx - 10, ny + 9], [nx - 2, ny + 8], [nx + 1, ny + 12 + mouth * 6], [nx - 6, ny + 14 + mouth * 9], [nx - 12, ny + 12 + mouth * 4]]);
    fill(c, mo, '#6a2a2a'); clipped(c, mo, () => fill(c, oval(nx - 6, ny + 16 + mouth * 9, 6, 4, 0), '#e88c96')); line(c, mo, L, lw * 0.8);
    fill(c, poly4(nx - 6, ny + 7.5, 4.5, 3.5), '#fff8e8');
  }
  const nose = blob([[nx - 4.5, ny - 2], [nx + 1.5, ny - 3], [nx + 2, ny + 1.5], [nx - 1, ny + 3.5], [nx - 4, ny + 1.5]]);
  fill(c, nose, '#8a5550'); line(c, nose, L, lw * 0.6);
  c.strokeStyle = L; c.lineWidth = lw * 0.7;
  c.beginPath(); c.moveTo(nx - 1, ny + 3.5); c.lineTo(nx - 2, ny + 8); c.quadraticCurveTo(nx - 6, ny + 11, nx - 10, ny + 9.5); c.stroke();
  c.strokeStyle = alpha(L, 0.45); c.lineWidth = lw * 0.45;
  for (const [ex, ey] of [[84, -2], [88, 8], [82, 18]]) { c.beginPath(); c.moveTo(48, 9 + tw * 0.5); c.quadraticCurveTo((48 + ex) / 2, (9 + ey) / 2 - 3, ex, ey + tw); c.stroke(); }
  c.restore();
  // near ear (petal, drooping over the side of the head)
  { const q = toBody([-16, -32]); c.save(); c.translate(q[0], q[1]); c.rotate(hrot - 0.35 + Math.sin(t * 2.3 + seed) * 0.05 - kick * 0.5);
    fill(c, G.ear, lin(c, 0, -20, 0, 2, [[0, mix(GP.skin, GP.light, 0.2)], [1, mix(GP.skin, L, 0.15)]])); line(c, G.ear, L, lw); c.restore(); }
  c.restore();
  c.restore();
  const wT = (q) => { // through the popcorn transform
    let x = q[0] - pivot[0], y = q[1] - pivot[1];
    x *= sx; y *= sy;
    const xr = x * Math.cos(twist) - y * Math.sin(twist), yr = x * Math.sin(twist) + y * Math.cos(twist);
    return W([xr + pivot[0], yr + pivot[1] - lift], p.x ?? 0, p.y ?? 0, sd, flip);
  };
  return { mouth: wT(toBody([nx - 4, ny + 10])), eye: wT(toBody([6, -10])), head: wT(hd) };
}
function gaitFootLocal(phase) {
  const g = GP_GAIT, q = ((phase % 1) + 1) % 1;
  if (q < g.duty) return [lerp(g.stride / 2, -g.stride / 2, q / g.duty), 0];
  const u = (q - g.duty) / (1 - g.duty);
  return [lerp(-g.stride / 2, g.stride / 2, ease.io(u)), -g.lift * Math.sin(u * Math.PI)];
}
