// Small-pet rigs: golden hamster, tricolour guinea pig, house mouse. Same conventions as drawDog / drawRabbit:
// (x, y) = ground point under the body, s = scale, flip (1 = facing right, -1 = left), t (seconds: breathing,
// blinking, nose and whisker twitch, chewing), seed (individual offset), look [dx, dy] (-1..1 pupil direction),
// shadow (ground shadow strength, default 0.3, 0 = none), v (optional colour overrides, see HAM / GP / MOUSE).
// Moods for all three: 'neutral' | 'happy' | 'scared' ('worried' and 'sad' are aliases) | 'asleep'.
// Every function returns anchors in canvas coordinates: { head, eye, nose, mouth, top, paws: [near, far] }.
//
// drawHamster(c, p)  golden (Syrian) hamster, about 33 units long and 19 tall on all fours at s = 1.
//   pose   'stand' (default) | 'sit' (upright, holding food at the mouth, chewing) | 'run' (driven by phase, for the
//          wheel: advance phase by distance / SMALL_STRIDE.hamster / s) | 'grip' (upright, both front paws on a cage
//          bar, gnawing: draw a vertical bar at x + 12.6 * s * flip before the hamster; anchors.paws sit on it)
//   gnaw   0..1 gnawing strength (default 0.6 in 'grip'), munch 0..1 chewing (default 1 in 'sit'),
//   cheeks 0..1 stuffed cheek pouches, food: false | colour | (c) => draw held food (default sunflower seed, 'sit' only)
//   lid, tilt   eyelid closure 0..1, extra head rotation (radians)
//
// drawGuineaPig(c, p)  tricolour (white, ginger, black), about 47 units long and 24 tall.
//   pose   'stand' (default) | 'walk' (phase; SMALL_STRIDE.guineaPig) | 'call' (head up, wheeking)
//   mouth  0..1 open mouth (in 'call' it pulses from t unless given)
//   hop    0..1 progress of one "popcorn" jump: airborne arc with a body twist and kicked-out legs (0 and 1 = on the ground)
//
// drawMouse(c, p)  brown house mouse, about 17 units long plus a 15-unit tail.
//   pose   'stand' (default) | 'sniff' (reared up, nose working) | 'run' (phase; SMALL_STRIDE.mouse)
//
// SMALL_STRIDE = { hamster, guineaPig, mouse }: distance in character units per gait cycle (multiply by s).
import { blob, capsule, circle, oval, union, fill, line, clipped, lin, shadow } from '../engine/draw.js';
import { TAU, clamp, lerp, mix, alpha } from '../engine/util.js';
import { eye, blink, gaitFoot, inkW } from './rig.js';

export const SMALL_STRIDE = { hamster: 15, guineaPig: 13, mouse: 10 };
const poseName = (p, list) => { let q = p.pose; if (Array.isArray(q)) q = (+q[2] || 0) > 0.5 ? q[1] : q[0]; return list.includes(q) ? q : list[0]; };
const moodName = (m) => (m === 'happy' || m === 'asleep' ? m : m === 'scared' || m === 'worried' || m === 'sad' ? 'scared' : 'neutral');
const colours = (base, v) => (v && typeof v === 'object' ? { ...base, ...v } : base);

// gradient coat + markings + form shadow + rim light + outline for one merged silhouette
function paint(c, sil, V, top, lw, marks) {
  fill(c, sil, lin(c, 0, top, 0, 0.5, [[0, V.light], [0.45, V.coat], [1, V.dark]]));
  clipped(c, sil, () => {
    if (marks) marks();
    c.fillStyle = lin(c, 0, top * 0.45, 0, 0, [[0, alpha(V.shade, 0)], [1, alpha(V.shade, 0.42)]]);
    c.fillRect(-120, top * 0.45, 240, -top * 0.45 + 2);
    c.save(); c.translate(0.3, 0.75); c.globalAlpha = 0.4; line(c, sil, V.rim || V.light, lw * 2.2); c.restore();
  });
  line(c, sil, V.line, lw);
}
function whiskers(c, x, y, L, w, k, tw, set) {
  c.strokeStyle = alpha(L, 0.42); c.lineWidth = w; c.beginPath();
  for (const [a, l] of set) { const q = a + tw * 0.1; c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(q) * l * k * 0.5, y + Math.sin(q) * l * k * 0.5 - 0.6 * k, x + Math.cos(q) * l * k, y + Math.sin(q) * l * k); }
  c.stroke();
}
const WH = [[2.5, 9], [2.2, 10], [1.9, 8], [0.7, 6], [0.3, 7]];

// ------------------------------------------------------------------ hamster
const HAM = { coat: '#e9a04a', light: '#f9cf8e', dark: '#c27a2c', belly: '#fff6e6', line: '#6a3c17', pink: '#f4aaa0', ear: '#b9794a', iris: '#3a2416', shade: '#8a4f1c' };
const HP = {
  stand: { bc: [-2, -9.2], rx: 13, ry: 8.8, h: [8, -10.2], hr: 0, belly: [2, 6.5, 12, 5.2] },
  run: { bc: [-2, -8.4], rx: 13.6, ry: 7.6, h: [9, -9.4], hr: 0.04, belly: [2, 5.6, 12.5, 4.6] },
  sit: { bc: [-3, -11], rx: 9.4, ry: 10.6, h: [3, -20.5], hr: -0.05, rump: [-4, -7, 10.8, 7], belly: [5.5, 1, 6.5, 9.5] },
  grip: { bc: [-1, -13], rx: 8.4, ry: 12.6, h: [3.5, -27.5], hr: -0.35, rump: [-2.5, -7, 9.6, 7], belly: [5, 0, 6, 11.5] },
};
const HG = { duty: 0.5, stride: SMALL_STRIDE.hamster, lift: 3 };

export function drawHamster(c, p = {}) {
  const V = colours(HAM, p.v), pose = poseName(p, ['stand', 'sit', 'run', 'grip']), P = HP[pose], mood = moodName(p.mood);
  const t = p.t ?? 0, seed = p.seed ?? 0, s = Math.max(p.s ?? 1, 1e-3), flip = p.flip === -1 ? -1 : 1, lw = inkW(s, 1.2), L = V.line;
  const sc = mood === 'scared', up = pose === 'sit' || pose === 'grip', run = pose === 'run', ph = p.phase ?? 0;
  const gnaw = clamp(p.gnaw ?? (pose === 'grip' ? 0.6 : 0)), gn = gnaw * (0.5 + 0.5 * Math.sin(t * 31 + seed));
  const munch = clamp(p.munch ?? (pose === 'sit' ? 1 : 0)), chew = munch * (0.5 + 0.5 * Math.sin(t * 21 + seed));
  const breath = Math.sin(t * 5 + seed) * 0.5 + 0.5, shiver = sc ? Math.sin(t * 43 + seed) * 0.16 : 0;
  const bob = run ? -Math.abs(Math.sin(TAU * ph)) * 0.9 : 0;
  const bc = [P.bc[0] + shiver, P.bc[1] + bob], rx = P.rx, ry = P.ry + breath * 0.3;
  const h = [P.h[0] + shiver + gn * 0.5, P.h[1] + bob * 0.7 - gn * 0.3 + Math.sin(t * 1.3 + seed) * 0.15], hr = P.hr + (p.tilt ?? 0) + gn * 0.05;
  const ch = Math.cos(hr), sh = Math.sin(hr), hp = (x, y) => [h[0] + x * ch - y * sh, h[1] + x * sh + y * ch];
  const ck = clamp(p.cheeks ?? 0.2) + chew * 0.12, nt = Math.sin(t * 17 + seed) * 0.3 * (0.5 + 0.5 * Math.sin(t * 2.1 + seed));

  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(s * flip, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const shA = p.shadow ?? 0.3;
  if (shA > 0) shadow(c, bc[0] + 2, 0.5, rx + 6, 3, shA);

  // feet (behind the body) and tail nub
  const feet = up ? [[0.5, 0, 1, 5], [-2, 0, 0, 5]] : [[-6.5, 0.5, 1, 4.2], [8, 0, 1, 3.2], [-8.5, 0, 0, 4.2], [6.5, 0.5, 0, 3.2]];
  for (const [bx, off, far, len] of feet) {
    const d = run ? gaitFoot(ph + off, HG) : [0, 0], fx = bx + d[0], fy = d[1] - 1.5 - far * 0.5;
    const leg = capsule(lerp(fx, bc[0], 0.25), -6, 3, fx, fy - 0.6, 1.8);
    fill(c, leg, far ? mix(V.dark, L, 0.15) : V.dark); line(c, leg, L, lw);
    const paw = oval(fx + 1.2, fy, len, 1.6, d[1] < -0.5 ? 0.35 : 0);
    fill(c, paw, far ? mix(V.pink, L, 0.2) : V.pink); line(c, paw, L, lw * 0.9);
  }
  const nub = circle(bc[0] - rx * (up ? 0.9 : 0.97), up ? -3.5 : bc[1] + 2.5, 1.7);
  fill(c, nub, V.pink); line(c, nub, L, lw * 0.9);
  // far ear
  const earK = sc ? 0.7 : mood === 'happy' ? 1.08 : 1, earR = hr - 0.3 - (sc ? 0.5 : 0);
  { const q = hp(2.8, -7.6), e = oval(q[0], q[1], 2.8, 3.3 * earK, hr + 0.15); fill(c, e, mix(V.ear, L, 0.3)); line(c, e, L, lw); }
  // far arm
  const armRoot = up ? [bc[0] + (pose === 'grip' ? 5.5 : 7), bc[1] - (pose === 'grip' ? 7.5 : 4.5)] : null;
  const pawN = pose === 'grip' ? [12.6, -20.5] : hp(8.6, 7.6 + chew * 0.5), pawF = pose === 'grip' ? [12.6, -23.2] : hp(10.2, 7.2 + chew * 0.5);
  const arm = (to, far) => {
    const a = capsule(armRoot[0] + (far ? 1.5 : 0), armRoot[1] - (far ? 0.8 : 0), 2.1, to[0] - 0.8, to[1] + 0.3, 1.45);
    fill(c, a, far ? mix(V.dark, L, 0.12) : mix(V.coat, V.dark, 0.5)); line(c, a, L, lw);
    const pw = oval(to[0], to[1], pose === 'grip' ? 1.7 : 2, pose === 'grip' ? 2.1 : 1.6, 0);
    fill(c, pw, far ? mix(V.pink, L, 0.2) : V.pink); line(c, pw, L, lw * 0.9);
  };
  if (up) arm(pawF, true);

  // body + head silhouette
  const snout = hp(6.4, 1.7 + nt * 0.2), cheek = hp(1.4, 4.2);
  const parts = [oval(bc[0], bc[1], rx, ry, 0), circle(h[0], h[1], 8.3), oval(snout[0], snout[1], 4.5, 3.9, hr), oval(cheek[0], cheek[1], 7 + ck * 2.4, 5.4 + ck * 1.8, hr + 0.1)];
  if (P.rump) parts.push(oval(bc[0] + P.rump[0] - P.bc[0], P.rump[1], P.rump[2], P.rump[3], 0));
  const sil = union(...parts), top = Math.min(h[1] - 8.3, bc[1] - ry);
  paint(c, sil, V, top, lw, () => {
    fill(c, oval(bc[0] + P.belly[0], bc[1] + P.belly[1], P.belly[2], P.belly[3], 0), V.belly);
    { const q = hp(-4.6, 3.2); fill(c, oval(q[0], q[1], 2.1, 5.6, hr + 0.3), alpha(V.dark, 0.6)); }
    { const q = hp(-7.4, 3.8); fill(c, oval(q[0], q[1], 2.2, 6, hr + 0.3), alpha(V.belly, 0.85)); }
    { const q = hp(3.6, 5); fill(c, oval(q[0], q[1], 7.6 + ck * 2, 5.4 + ck * 1.6, hr + 0.1), V.belly); }
    { const q = hp(7.6, 2.6); fill(c, oval(q[0], q[1], 4.8, 3.9, hr), V.belly); }
    { const q = hp(-1, -5.5); c.globalAlpha = 0.5; fill(c, oval(q[0], q[1], 5.5, 3, hr - 0.2), V.light); c.globalAlpha = 1; }
  });

  // ---- face ----
  c.save(); c.translate(h[0], h[1]); c.rotate(hr);
  const open = Math.max(gn, clamp(p.mouth ?? 0), chew * 0.35);
  if (open > 0.05) {
    const mo = oval(8.3, 4.5 + open * 0.7, 1.9, 0.5 + open * 1.7, -0.2); fill(c, mo, '#6a2424'); line(c, mo, L, lw * 0.7);
    c.fillStyle = '#fff3d6'; c.strokeStyle = L; c.lineWidth = lw * 0.5;
    c.beginPath(); c.rect(8.1, 3.5, 1.9, 1 + open * 1.4); c.fill(); c.stroke(); c.beginPath(); c.moveTo(9.05, 3.5); c.lineTo(9.05, 4.5 + open * 1.4); c.stroke();
  }
  const nose = oval(10.5, 0.7 + nt, 1.5, 1.15, 0.2); fill(c, nose, V.pink); line(c, nose, L, lw * 0.7);
  c.strokeStyle = L; c.lineWidth = lw * 0.75; c.beginPath(); c.moveTo(10.3, 1.9 + nt); c.lineTo(9.8, 3.4);
  c.quadraticCurveTo(8.4, 4.6 + (mood === 'happy' ? 0.7 : sc ? -0.3 : 0.2), 6.6, 3.9 - (mood === 'happy' ? 0.6 : 0)); c.stroke();
  whiskers(c, 8.4, 2.6, L, lw * 0.4, 1, nt * 3, WH);
  const er = 2.9 * (sc ? 1.16 : 1), lid = clamp(Math.max(p.lid ?? (mood === 'asleep' ? 1 : 0), p.blink ?? blink(t, seed + 2, 3.8)));
  const eo = { look: p.look || [0.3, 0.05], iris: V.iris, irisR: sc ? 0.62 : 0.84, lid, lidColor: mix(V.coat, V.light, 0.4), line: L, lw: lw * 0.8, happy: mood !== 'scared', low: mood === 'happy' ? 0.3 : 0 };
  eye(c, { ...eo, x: 6.9, y: -3.4, r: er * 0.72, lidAng: sc ? 0.35 : 0 });
  eye(c, { ...eo, x: 1.9, y: -2.5, r: er, lidAng: sc ? -0.35 : 0 });
  if (sc) { c.strokeStyle = mix(L, V.coat, 0.2); c.lineWidth = lw; c.beginPath(); c.moveTo(-0.8, -5.4); c.lineTo(3.6, -6.9); c.moveTo(5.6, -6.6); c.lineTo(8.6, -5.6); c.stroke(); }
  c.restore();
  // near ear
  { const q = hp(-3.4, -7), e = oval(q[0], q[1], 3.4, 4 * earK, earR);
    fill(c, e, V.ear); clipped(c, e, () => fill(c, oval(q[0] + 0.5, q[1] + 0.6, 2, 2.7 * earK, earR), V.pink)); line(c, e, L, lw); }
  // food + near arm
  if (pose === 'sit' && p.food !== false) {
    const q = hp(11.2, 6.2 + chew * 0.5);
    c.save(); c.translate(q[0], q[1]);
    if (typeof p.food === 'function') p.food(c);
    else {
      c.rotate(-0.9); const sd = blob([[-2.6, 0], [-0.6, -1.5], [2.6, 0, 1], [-0.6, 1.5]]);
      fill(c, sd, typeof p.food === 'string' ? p.food : '#4a4650'); clipped(c, sd, () => { c.strokeStyle = '#e4dfd4'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(-2.4, -0.5); c.lineTo(2.4, -0.1); c.moveTo(-2.4, 0.6); c.lineTo(2.4, 0.2); c.stroke(); });
      line(c, sd, L, lw * 0.8);
    }
    c.restore();
  }
  if (up) arm(pawN, false);
  c.restore();

  const W = (q) => [(p.x ?? 0) + q[0] * s * flip, (p.y ?? 0) + q[1] * s];
  return { head: W(h), eye: W(hp(1.9, -2.5)), nose: W(hp(11, 0.7)), mouth: W(hp(8.6, 4.4)), top: W([h[0], h[1] - 9]), paws: [W(pawN), W(pawF)] };
}

// ------------------------------------------------------------------ guinea pig
const GP = { coat: '#fbf4e8', light: '#ffffff', dark: '#d8cab6', line: '#4a3120', ginger: '#e2893a', black: '#3a2e2a', pink: '#f0a39a', ear: '#8a5a48', iris: '#33200f', shade: '#6d4a2c', rim: '#ffffff' };
const GG = { duty: 0.62, stride: SMALL_STRIDE.guineaPig, lift: 2.2 };

export function drawGuineaPig(c, p = {}) {
  const V = colours(GP, p.v), pose = poseName(p, ['stand', 'walk', 'call']), mood = moodName(p.mood);
  const t = p.t ?? 0, seed = p.seed ?? 0, s = Math.max(p.s ?? 1, 1e-3), flip = p.flip === -1 ? -1 : 1, lw = inkW(s, 1.4), L = V.line;
  const sc = mood === 'scared', call = pose === 'call', walk = pose === 'walk', ph = p.phase ?? 0;
  const hop = clamp(p.hop ?? 0), air = Math.sin(hop * Math.PI), twist = Math.sin(hop * TAU) * 0.36;
  const mouth = clamp(p.mouth ?? (call ? 0.45 + 0.55 * Math.max(0, Math.sin(t * 7 + seed)) : 0));
  const breath = Math.sin(t * 4.4 + seed) * 0.5 + 0.5, shiver = sc ? Math.sin(t * 43 + seed) * 0.2 : 0;
  const bob = walk ? -Math.abs(Math.sin(TAU * ph)) * 0.7 : 0;
  const bc = [-4 + shiver, -12 + bob], rx = 17, ry = 11.2 + breath * 0.35;
  const hr = (call ? -0.42 : 0) + (p.tilt ?? 0) - air * 0.12 - mouth * 0.04, h = [11.5 + shiver - (call ? 0.8 : 0), -13 + bob * 0.6 - (call ? 3 : 0) + Math.sin(t * 1.2 + seed) * 0.15];
  const ch = Math.cos(hr), sh = Math.sin(hr), hp = (x, y) => [h[0] + x * ch - y * sh, h[1] + x * sh + y * ch];
  const nt = Math.sin(t * 13 + seed) * 0.3 * (0.5 + 0.5 * Math.sin(t * 1.9 + seed));

  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(s * flip, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const shA = p.shadow ?? 0.3;
  if (shA > 0) shadow(c, bc[0] + 4, 0.5, (rx + 9) * (1 - air * 0.3), 3.6, shA * (1 - air * 0.5));
  // popcorn: lift and twist the whole animal about its middle
  c.translate(0, -air * 19); c.translate(-2, -12); c.rotate(twist); c.translate(2, 12);

  for (const [bx, off, far, len] of [[-11, 0.5, 1, 4], [10.5, 0, 1, 3.3], [-13.5, 0, 0, 4], [8.5, 0.5, 0, 3.3]]) {
    const d = walk ? gaitFoot(ph + off, GG) : [0, 0], kick = air * (bx < 0 ? -4 : 4);
    const fx = bx + d[0] + kick, fy = d[1] - 1.4 - far * 0.5 + air * 2.5;
    const leg = capsule(lerp(fx, bc[0], 0.2) - kick * 0.6, -6.5, 3.4, fx, fy - 0.6, 2);
    fill(c, leg, far ? mix(V.dark, L, 0.2) : V.dark); line(c, leg, L, lw);
    const paw = oval(fx + 1.2, fy, len, 1.6, d[1] < -0.5 ? 0.3 : air * (bx < 0 ? -0.5 : 0.5));
    fill(c, paw, far ? mix(V.pink, L, 0.2) : V.pink); line(c, paw, L, lw * 0.9);
  }
  { const q = hp(4, -9.2), e = oval(q[0], q[1], 3.6, 2.7, hr + 0.3); fill(c, e, mix(V.ear, L, 0.35)); line(c, e, L, lw); }

  const snout = hp(8, 1.6 + nt * 0.2), chin = hp(6.5, 5.6 + mouth * 2.6);
  const sil = union(oval(bc[0], bc[1], rx, ry, 0), oval(bc[0] - 7, bc[1] + 0.5, 10.5, 10.6, 0), oval(h[0], h[1], 10.4, 9.8, hr), circle(snout[0], snout[1], 6), oval(chin[0], chin[1], 4.6, 3.2, hr));
  paint(c, sil, V, bc[1] - ry - 3, lw, () => {
    fill(c, blob([[bc[0] - 6, -27], [bc[0] + 6, -27], [bc[0] + 8, -13], [bc[0] + 5, 2], [bc[0] - 4, 2], [bc[0] - 7.5, -12]]), V.black);
    fill(c, oval(bc[0] - 16, -13, 9.5, 13, 0.1), V.ginger);
    { const q = hp(-2.5, -3); fill(c, oval(q[0], q[1], 9.2, 9.4, hr), V.ginger); }
    { const q = hp(7.5, -1.5); fill(c, blob([hp(2.5, -11), hp(6.5, -10.5), hp(9, -5), hp(15, -3), hp(15, 9), hp(5, 9), hp(5.5, 1), hp(4, -5)]), V.coat); void q; }
    { const q = hp(9, 4.5); c.globalAlpha = 0.5; fill(c, oval(q[0], q[1], 5, 3, hr), V.light); c.globalAlpha = 1; }
  });

  c.save(); c.translate(h[0], h[1]); c.rotate(hr);
  if (mouth > 0.05) {
    const mo = oval(9.3, 5.2 + mouth * 1.2, 2.6, 0.6 + mouth * 2.2, -0.15); fill(c, mo, '#6a2424');
    clipped(c, mo, () => fill(c, oval(8.8, 6.6 + mouth * 2.2, 2, 1.4, 0), '#f08a98')); line(c, mo, L, lw * 0.7);
    c.fillStyle = '#fff3d6'; c.strokeStyle = L; c.lineWidth = lw * 0.5; c.beginPath(); c.rect(9.6, 4, 1.8, 0.8 + mouth * 1.1); c.fill(); c.stroke();
  }
  const nose = blob([[12.4, 0.2 + nt], [14.3, 0.9 + nt], [13.4, 2.6 + nt]]); fill(c, nose, mix(V.pink, L, 0.25)); line(c, nose, L, lw * 0.65);
  c.strokeStyle = L; c.lineWidth = lw * 0.75; c.beginPath(); c.moveTo(13.3, 2.7 + nt); c.lineTo(12.8, 4.3);
  c.quadraticCurveTo(10.8, 5.6 + (mood === 'happy' ? 0.8 : sc ? -0.3 : 0.2), 8, 4.6 - (mood === 'happy' ? 0.7 : 0)); c.stroke();
  whiskers(c, 10.8, 3.4, L, lw * 0.4, 1.15, nt * 3, WH);
  const er = 3.1 * (sc ? 1.15 : 1), lid = clamp(Math.max(p.lid ?? (mood === 'asleep' ? 1 : 0), p.blink ?? blink(t, seed + 3, 4)));
  const eo = { look: p.look || (call ? [0.4, -0.5] : [0.3, 0.05]), iris: V.iris, irisR: sc ? 0.62 : 0.84, lid, lidColor: mix(V.ginger, '#ffffff', 0.3), line: L, lw: lw * 0.8, happy: mood !== 'scared', low: mood === 'happy' ? 0.3 : 0 };
  eye(c, { ...eo, x: 9, y: -4.4, r: er * 0.72, lidAng: sc ? 0.35 : 0 });
  eye(c, { ...eo, x: 3.2, y: -3.2, r: er, lidAng: sc ? -0.35 : 0 });
  if (sc) { c.strokeStyle = mix(L, V.ginger, 0.2); c.lineWidth = lw; c.beginPath(); c.moveTo(0.2, -6.4); c.lineTo(5, -8); c.moveTo(7.6, -7.8); c.lineTo(10.8, -6.8); c.stroke(); }
  const ed = sc ? -1 : 0, ear = blob([[-6.4, -6.4], [-2.4, -8.6], [0.4, -6.6], [-0.2, -2.6 + ed], [-3.4, -1.2 + ed], [-6, -2.8 + ed]]);
  fill(c, ear, lin(c, 0, -9, 0, -1, [[0, mix(V.ear, V.pink, 0.2)], [1, V.ear]]));
  clipped(c, ear, () => fill(c, oval(-2.6, -4.2 + ed * 0.5, 2, 2.4, 0.3), mix(V.pink, V.ear, 0.35))); line(c, ear, L, lw);
  c.restore();
  c.restore();

  const ca = Math.cos(twist), sa = Math.sin(twist);
  const W = (q) => { const x = q[0] + 2, y = q[1] + 12, X = x * ca - y * sa - 2, Y = x * sa + y * ca - 12 - air * 19; return [(p.x ?? 0) + X * s * flip, (p.y ?? 0) + Y * s]; };
  return { head: W(h), eye: W(hp(3.2, -3.2)), nose: W(hp(14, 1.5)), mouth: W(hp(9.5, 5.5)), top: W([bc[0], bc[1] - ry]), paws: [W([8.5, -1.4]), W([10.5, -1.9])] };
}

// ------------------------------------------------------------------ mouse
const MOUSE = { coat: '#9b7654', light: '#c7a17c', dark: '#6f5139', belly: '#eadbc6', line: '#3d2a1c', pink: '#eab0a4', tail: '#d6a898', ear: '#b58a70', iris: '#1d1310', shade: '#4a3322' };
const MG = { duty: 0.42, stride: SMALL_STRIDE.mouse, lift: 1.7 };

export function drawMouse(c, p = {}) {
  const V = colours(MOUSE, p.v), pose = poseName(p, ['stand', 'sniff', 'run']), mood = moodName(p.mood);
  const t = p.t ?? 0, seed = p.seed ?? 0, s = Math.max(p.s ?? 1, 1e-3), flip = p.flip === -1 ? -1 : 1, lw = inkW(s, 0.95), L = V.line;
  const sc = mood === 'scared', run = pose === 'run', sniff = pose === 'sniff', ph = p.phase ?? 0;
  const breath = Math.sin(t * 6 + seed) * 0.5 + 0.5, shiver = sc ? Math.sin(t * 45 + seed) * 0.1 : 0;
  const bound = run ? Math.sin(TAU * ph) : 0, st = run ? 1 + bound * 0.07 : 1;
  const bc = [-2 + shiver, -4.4 - (run ? Math.abs(bound) * 0.5 : 0)], rx = 5.8 * st, ry = 4.2 / st + breath * 0.15;
  const hr = (sniff ? -0.25 : 0) + (p.tilt ?? 0) + (sniff ? Math.sin(t * 3.1 + seed) * 0.08 : 0), h = [3.6 * st + shiver, -4.9 + bc[1] + 4.4];
  const ch = Math.cos(hr), sh = Math.sin(hr), hp = (x, y) => [h[0] + x * ch - y * sh, h[1] + x * sh + y * ch];
  const nt = Math.sin(t * (sniff ? 24 : 16) + seed) * (sniff ? 0.3 : 0.16);
  const rear = sniff ? -0.5 + Math.sin(t * 1.7 + seed) * 0.04 : 0;

  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(s * flip, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const shA = p.shadow ?? 0.3;
  if (shA > 0) shadow(c, bc[0] + 1, 0.3, rx + 3.5, 1.5, shA);
  // tail (stays on the ground when rearing)
  const tx = bc[0] - rx + 1 + (sniff ? 1.5 : 0), ty = sniff ? -1.6 : -3, wv = Math.sin(t * 2.2 + seed) * 1.2 + (run ? Math.sin(TAU * ph) * 1.2 : 0);
  c.beginPath(); c.moveTo(tx, ty); c.bezierCurveTo(tx - 5, ty + 2 + (run ? -1.5 : 0), tx - 9, ty - 3 + wv, tx - 15, ty + (run ? -2 : 0.6) - wv * 0.6);
  c.strokeStyle = L; c.lineWidth = 1.05 + lw * 1.5; c.stroke(); c.strokeStyle = V.tail; c.lineWidth = 1.05; c.stroke();

  c.save(); c.translate(-4.5, -1); c.rotate(rear); c.translate(4.5, 1);
  for (const [bx, off, far, len] of [[-3.6, 0.5, 1, 2.2], [3.8, 0.06, 1, 1.6], [-4.8, 0.44, 0, 2.2], [2.8, 0, 0, 1.6]]) {
    const d = run ? gaitFoot(ph + off, MG) : [0, 0], fx = bx + d[0], fy = d[1] - 0.8 - far * 0.25 - (sniff && bx > 0 ? 0.6 : 0);
    const paw = union(capsule(lerp(fx, bc[0], 0.3), -2.6, 1.3, fx, fy - 0.2, 0.75), oval(fx + 0.7, fy, len, 0.8, d[1] < -0.3 ? 0.4 : sniff && bx > 0 ? 0.6 : 0));
    fill(c, paw, far ? mix(V.pink, L, 0.25) : V.pink); line(c, paw, L, lw * 0.9);
  }
  { const q = hp(1.7, -4.1), e = circle(q[0], q[1], 2.4); fill(c, e, mix(V.ear, L, 0.3)); line(c, e, L, lw); }
  const sn = blob([hp(1.5, -2.6), hp(5.2, -0.6 + nt * 0.3), hp(7, 0.9 + nt), hp(5.4, 2.4), hp(1.5, 3.2)]);
  const sil = union(oval(bc[0], bc[1], rx, ry, 0), oval(bc[0] - 1.6, bc[1] + 0.3, rx * 0.72, ry * 1.04, 0), circle(h[0], h[1], 3.5), sn);
  paint(c, sil, V, bc[1] - ry - 1.5, lw, () => {
    fill(c, oval(bc[0] + 1.5, bc[1] + ry * 0.85, rx * 1.1, ry * 0.62, 0), V.belly);
    { const q = hp(4, 2.4); fill(c, oval(q[0], q[1], 3.6, 1.7, hr + 0.1), V.belly); }
  });
  c.save(); c.translate(h[0], h[1]); c.rotate(hr);
  const nose = circle(7, 0.9 + nt, 0.75); fill(c, nose, V.pink); line(c, nose, L, lw * 0.7);
  whiskers(c, 5.4, 1.5, L, lw * 0.4, 0.62, nt * 5, WH);
  const lid = clamp(Math.max(p.lid ?? (mood === 'asleep' ? 1 : 0), p.blink ?? blink(t, seed + 4, 3.2)));
  eye(c, { x: 2.5, y: -0.7, r: 1.35 * (sc ? 1.18 : 1), look: p.look || [0.3, 0], iris: V.iris, irisR: sc ? 0.7 : 0.9, lid, lidColor: V.light, line: L, lw: lw * 0.75, happy: true });
  const e = circle(-1.3, -3.5, 2.95); fill(c, e, V.ear); clipped(c, e, () => fill(c, circle(-1, -3.2, 1.85), V.pink)); line(c, e, L, lw);
  c.restore();
  c.restore();
  c.restore();

  const ca = Math.cos(rear), sa = Math.sin(rear);
  const W = (q) => { const x = q[0] + 4.5, y = q[1] + 1, X = x * ca - y * sa - 4.5, Y = x * sa + y * ca - 1; return [(p.x ?? 0) + X * s * flip, (p.y ?? 0) + Y * s]; };
  return { head: W(h), eye: W(hp(2.5, -0.7)), nose: W(hp(7, 0.9)), mouth: W(hp(5.5, 2.2)), top: W([h[0], h[1] - 6]), paws: [W([2.8, -0.8]), W([3.8, -1])] };
}
