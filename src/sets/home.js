// apartmentSet — the family living room on the 2nd floor of the red-brick building (hero location of the film).
//
//   apartmentSet(g, t, o)   o = {years = 0, look, power = years < 0.02, lampOn = power, tvOn = false, windowOpen 0..1,
//                                scratches 0..1 (claw marks on the door), plush = true, photo = true, clock (hour, e.g.
//                                16.6; ticks with t), view ('city' | 'forest', default from years), beam = true (sunbeam
//                                when the look is bright), actors(c), front(c)}
//   apartmentGlow(g, t, o)  emissive light for after g.grade(): lamp, TV, feeder LED, window shaft. Same `o`.
//   APT_LOOKS               {evening: warm lamp-lit dusk, moon: moonlit night with power off} interior looks.
//   APT                     anchors in world coordinates (main plane, depth 1):
//     floorY 920 · door {x0:-720, x1:-460, y0:380, handle:[-492,668]} (door hangs open from ~50 y, gone at 200)
//     dogBed [-200,920] (cushion top [-200,872]) · plush [-35,920] (teddy beside the bed) · clock [60,330]
//     lamp {x:180, shade:[180,440]} · sofa {x0:300, x1:1000, seat:[650,738], back:[650,600], armL:[335,682], armR:[965,682]}
//     window {x:400, y:170, w:500, h:400, sill:[650,578]} · fireEscape [790,606] (outside, through the open window)
//     coffeeTable {x0:560, x1:880, top:815} · perch [1110,574] (stand base [1110,920], rots away after ~40 y)
//     tv {x:1270, y:560, w:260, h:185} · cabinet {x0:1240, x1:1560, top:760} · shelf {x0:1660, x1:1880, top:330}
//     photo [1770,560] (on the shelf; on the floor at photoFloor [1530,936] once the shelf falls, ~70 y)
//     kitchen {x0:2000, x1:2220} · bowls {dog:[2360,924], cat:[2470,924]} · feeder [2585,924] (LED [2610,866])
//     wallGap {x0:250, x1:1050, y0:110, y1:870} (opening grows 85 → 190 y; at 200 it is the way in from the forest)
//     tree [1180,935] (grows through the floor 110 → 195 y)
// Ageing is continuous in years (aging() from nature.js plus smoothsteps), so a 100 → 200 time-lapse grows in smoothly.
import { Path2D } from '@napi-rs/canvas';
import { W, H } from '../engine/stage.js';
import { LOOKS, drawSky } from '../engine/sky.js';
import { TAU, clamp, lerp, mix, alpha, RNG, ss, tone, hash, noise1 } from '../engine/util.js';
import { P, blob, rrect, oval, circle, poly, union, fill, ink, clipped, lin, rad, glow, shadow, txt } from '../engine/draw.js';
import { tree, bush, ivy, vines, flowers, litter, moss, aging, wind, LEAF } from '../env/nature.js';
import { drawPlush, drawPhoto, drawFeeder, drawPerchStand, drawDogBed, drawBowl } from './props.js';

export const APT = {
  floorY: 920,
  door: { x0: -720, x1: -460, y0: 380, handle: [-492, 668] },
  dogBed: [-200, 920], bedTop: [-200, 872], plush: [-35, 920], clock: [60, 330],
  lamp: { x: 180, shade: [180, 440] },
  sofa: { x0: 300, x1: 1000, seat: [650, 738], back: [650, 600], armL: [335, 682], armR: [965, 682] },
  window: { x: 400, y: 170, w: 500, h: 400, sill: [650, 578] }, fireEscape: [790, 606],
  coffeeTable: { x0: 560, x1: 880, top: 815 },
  perch: [1110, 574], stand: [1110, 920],
  tv: { x: 1270, y: 560, w: 260, h: 185 }, cabinet: { x0: 1240, x1: 1560, top: 760 },
  shelf: { x0: 1660, x1: 1880, top: 330 }, photo: [1770, 560], photoFloor: [1530, 936],
  kitchen: { x0: 2000, x1: 2220 }, bowls: { dog: [2360, 924], cat: [2470, 924] }, feeder: [2585, 924], led: [2610, 866],
  wallGap: { x0: 250, x1: 1050, y0: 110, y1: 870 }, tree: [1180, 935],
};

export const APT_LOOKS = {
  evening: { ...LOOKS.dusk, grade: [['multiply', '#d9c4b0', 0.38], ['soft-light', '#ff9a50', 0.22]], vig: 0.46, dark: 0.6 },
  moon: { ...LOOKS.night, grade: [['multiply', '#7690d0', 0.62], ['soft-light', '#2a50a8', 0.22]], vig: 0.52 },
};

const FY = APT.floorY, X0 = -900, X1 = 2900, TOP = -700;

function K(years) {
  return {
    A: aging(years),
    dust: ss(0.5, 10, years), leaves: ss(2, 25, years), peel: ss(3, 45, years), plaster: ss(15, 90, years),
    ivyIn: ss(6, 80, years), pane: ss(2, 6, years), shelf: ss(55, 85, years), door: ss(30, 80, years),
    doorGone: ss(150, 195, years), ferns: ss(35, 150, years), holes: ss(70, 140, years), gap: ss(85, 190, years),
    tree: ss(110, 195, years), flowers: ss(130, 200, years), sofa: ss(30, 190, years), stand: ss(25, 70, years),
    tv: ss(40, 180, years), clockFall: ss(80, 140, years), green: ss(60, 200, years),
  };
}

// ---------------------------------------------------------------- outside view ---
const BUILD = (() => {
  const r = RNG(808), out = [];
  let x = -1500;
  const cols = ['#c7765a', '#e3cfa8', '#9fb0c4', '#b5574a', '#d9b48a', '#8ea08a', '#cf9a6a'];
  while (x < 3600) {
    const w = r.range(260, 420), top = r.range(110, 330);
    const win = [];
    for (let y = top + 70; y < 1200; y += 118) for (let wx = x + 40; wx < x + w - 60; wx += 92) win.push([wx, y, r(), r()]);
    out.push({ x, w, top, col: cols[r.int(0, cols.length - 1)], win, seed: r.int(1, 999), cor: r() < 0.6 });
    x += w + r.range(6, 30);
  }
  return out;
})();

function outside(g, t, o, k, look) {
  const dark = look.dark ?? 0, lit = o.power && dark > 0.3;
  drawSky(g, look, { clouds: { n: 5, y0: 40, y1: 260, speed: 4 } });
  g.layer(0.3, (c) => {
    const r = RNG(31);
    for (let i = 0; i < 18; i++) {
      const x = -900 + i * 210 + r.range(-40, 40), h = r.range(300, 620), w = r.range(110, 190);
      const sag = k.green * r.range(0, 0.35) * h;
      fill(c, rrect(x, 760 - h + sag, w, h, 2), mix('#7d8fb0', '#6f8a6a', k.green * 0.6));
      if (k.green > 0.2) fill(c, rrect(x - 4, 760 - h + sag - 6, w + 8, 18 * k.green, 6), alpha(LEAF.olive, 0.7 * k.green));
    }
  }, { fog: [look.haze, 0.5] });
  g.layer(0.6, (c) => {
    for (const b of BUILD) {
      const drop = k.A.collapse * hash(b.seed) * 260;
      const top = b.top + drop, face = mix(b.col, '#7a7a68', k.A.grime * 0.5);
      c.fillStyle = lin(c, b.x, top, b.x + b.w, top, [[0, tone(face, 0.08)], [1, tone(face, -0.12)]]);
      c.fillRect(b.x, top, b.w, 1300 - top);
      if (b.cor) fill(c, rrect(b.x - 8, top - 4, b.w + 16, 16, 2), tone(face, -0.2));
      for (const [wx, wy, a, z] of b.win) {
        if (wy < top + 40) continue;
        const broken = a < k.A.broken;
        let col = broken ? '#20242c' : mix('#5a7898', '#a9c4dc', dark < 0.3 ? 0.5 : 0);
        if (lit && !broken && z < 0.72) col = z < 0.4 ? '#ffd27a' : '#ffbf5e';
        fill(c, rrect(wx - 3, wy - 3, 44, 66, 2), tone(face, -0.25));
        fill(c, rect(wx, wy, 38, 60), col);
        if (!broken && !(lit && z < 0.72)) fill(c, rect(wx, wy, 38, 22), alpha('#ffffff', 0.12));
      }
      if (k.A.vines > 0.05) ivy(c, b.x, top, b.w, 1200 - top, { cover: k.A.vines * (0.55 + 0.45 * hash(b.seed, 2)), seed: b.seed, t, density: 0.8 });
    }
    if (k.tree > 0 || k.green > 0.3) {
      for (let i = 0; i < 9; i++) tree(c, -900 + i * 520 + hash(i, 4) * 200, 1250, { h: 820 + 300 * hash(i, 5), grow: Math.max(k.tree, (k.green - 0.3) * 0.8), seed: 40 + i, t, kind: i % 3 === 1 ? 'pine' : 'round', shadow: 0 });
    }
  }, { fog: [look.haze, 0.16] });
}
const rect = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };

// ------------------------------------------------------------------ wall pieces ---
const gapCache = new Map();
function wallPath(k) {
  const q = Math.round(k.gap * 40), key = `${q}|${Math.round(k.door * 20)}|${Math.round(k.doorGone * 10)}`;
  if (gapCache.has(key)) return gapCache.get(key);
  const holes = [rect(APT.window.x, APT.window.y, APT.window.w, APT.window.h), rect(APT.door.x0, APT.door.y0, 260, FY - APT.door.y0), rect(APT.kitchen.x0, 380, 220, FY - 380)];
  const gk = q / 40;
  if (gk > 0.01) {
    const r = RNG(91), pts = [], cx = 650, cy = 470, n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, j = 0.82 + 0.3 * r();
      let x = cx + Math.cos(a) * 420 * j * lerp(0.62, 1, gk), y = cy + Math.sin(a) * 400 * j * lerp(0.58, 1, gk);
      y = Math.min(y, lerp(600, 868, gk));
      pts.push([x, y, 1]);
    }
    const s = gk;
    holes.push(poly(pts.map(([x, y]) => [lerp(650, x, s), lerp(370, y, s)])));
  }
  const u = union(...holes);
  const p = new Path2D();
  p.rect(X0, TOP, X1 - X0, FY - TOP);
  p.addPath(u);
  const out = { wall: p, holes: u };
  if (gapCache.size > 400) gapCache.clear();
  gapCache.set(key, out);
  return out;
}

function wall(c, t, o, k, look) {
  const { wall: wp } = wallPath(k);
  const paper = mix(mix('#ead9b8', '#cdbb98', k.A.grime * 0.7), '#a7a08a', k.plaster * 0.5);
  c.save();
  c.fillStyle = lin(c, 0, TOP, 0, FY, [[0, tone(paper, -0.18)], [0.35, paper], [1, tone(paper, -0.08)]]);
  c.fill(wp, 'evenodd');
  c.clip(wp, 'evenodd');
  // wallpaper stripes + motif
  c.globalAlpha = 0.16 * (1 - k.plaster * 0.6);
  for (let x = X0; x < X1; x += 64) fill(c, rect(x, TOP, 22, FY - TOP), tone(paper, 0.25));
  c.globalAlpha = 0.1 * (1 - k.plaster * 0.6);
  for (let x = X0 + 43; x < X1; x += 64) for (let y = 40; y < 700; y += 74) fill(c, circle(x, y + ((x / 64) % 2) * 37, 4), tone(paper, -0.4));
  c.globalAlpha = 1;
  // wainscot + chair rail + baseboard
  const wain = mix('#b98a5e', '#7d6a52', k.A.grime * 0.6);
  c.fillStyle = lin(c, 0, 700, 0, FY, [[0, tone(wain, 0.1)], [1, tone(wain, -0.15)]]); c.fillRect(X0, 700, X1 - X0, FY - 700);
  for (let x = X0 + 30; x < X1; x += 180) { fill(c, rrect(x, 728, 140, 150, 4), tone(wain, -0.07)); fill(c, rrect(x + 6, 734, 128, 138, 3), tone(wain, 0.04)); }
  fill(c, rect(X0, 690, X1 - X0, 14), tone(wain, 0.25)); fill(c, rect(X0, 702, X1 - X0, 3), tone(wain, -0.3));
  fill(c, rect(X0, FY - 24, X1 - X0, 24), mix('#efe6d6', '#8f8a78', k.A.grime));
  fill(c, rect(X0, 30, X1 - X0, 18), alpha(tone(paper, 0.3), 0.8)); fill(c, rect(X0, 48, X1 - X0, 5), alpha(tone(paper, -0.4), 0.5));
  // light falloff: bright around the window, darker at the room ends and the ceiling
  c.fillStyle = rad(c, 650, 380, 1500, [[0, 'rgba(255,240,210,0.16)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(20,10,30,0.32)']]);
  c.fillRect(X0, TOP, X1 - X0, FY - TOP);
  // decay: stains, peeling paper, exposed brick, mould
  const r = RNG(17);
  if (k.A.grime > 0.05) {
    for (let i = 0; i < 14; i++) {
      const x = X0 + r() * (X1 - X0), y = 40 + r() * 300, w = 50 + r() * 110, hh = 120 + r() * 360;
      c.fillStyle = lin(c, 0, y, 0, y + hh, [[0, alpha('#6e5530', 0.45 * k.A.grime)], [1, alpha('#6e5530', 0)]]);
      c.fill(blob([[x, y], [x + w, y], [x + w * 0.7, y + hh * 0.6], [x + w * 0.45, y + hh], [x + w * 0.25, y + hh * 0.5]]));
    }
  }
  for (let i = 0; i < 16; i++) {
    const x = X0 + r() * (X1 - X0), y = 80 + r() * 560, s = (40 + r() * 90) * k.peel;
    if (s < 4) continue;
    fill(c, blob([[x, y], [x + s, y - s * 0.3], [x + s * 1.3, y + s * 0.5], [x + s * 0.4, y + s * 0.8], [x - s * 0.2, y + s * 0.4]]), mix('#d9d2c2', '#b7ad98', k.A.grime));
    fill(c, blob([[x + s, y - s * 0.3], [x + s * 1.25, y - s * 0.65], [x + s * 1.05, y + s * 0.05]]), tone(paper, 0.12));
  }
  if (k.plaster > 0.05) {
    for (let i = 0; i < 7; i++) {
      const x = X0 + 200 + r() * (X1 - X0 - 400), y = 120 + r() * 420, w = (80 + r() * 160) * k.plaster, hh = (60 + r() * 120) * k.plaster;
      const br = blob([[x, y], [x + w, y + hh * 0.1], [x + w * 1.1, y + hh], [x + w * 0.2, y + hh * 1.1], [x - w * 0.1, y + hh * 0.5]]);
      fill(c, br, '#9b4f3c');
      clipped(c, br, () => { c.strokeStyle = 'rgba(230,210,190,0.45)'; c.lineWidth = 2.5; c.beginPath(); for (let yy = y; yy < y + hh * 1.2; yy += 16) { c.moveTo(x - 20, yy); c.lineTo(x + w * 1.2, yy); } c.stroke(); });
    }
  }
  if (k.A.grime > 0.3) {
    c.fillStyle = lin(c, 0, 560, 0, FY, [[0, 'rgba(60,80,40,0)'], [1, alpha('#3d5530', 0.35 * ss(0.3, 1, k.A.grime))]]);
    c.fillRect(X0, 560, X1 - X0, FY - 560);
  }
  c.restore();
}

function windowFrame(c, t, o, k, look) {
  const { x, y, w, h } = APT.window, gone = ss(0.25, 0.65, k.gap);
  if (gone >= 1) return;
  c.save(); c.globalAlpha = 1 - gone;
  const fr = mix('#f2ede2', '#9a9482', k.A.grime);
  const glassA = (look.dark ?? 0) > 0.5 ? 0.18 : 0.12;
  const open = clamp(o.windowOpen ?? 0) * 150;
  // upper sash glass (static) and lower sash (slides up)
  c.fillStyle = lin(c, x, y, x + w, y + h, [[0, `rgba(255,255,255,${glassA + 0.08})`], [0.4, `rgba(255,255,255,${glassA * 0.4})`], [0.6, `rgba(220,235,255,${glassA})`], [1, `rgba(255,255,255,${glassA * 0.3})`]]);
  if (k.pane < 1) c.fillRect(x + 10, y + 10, w / 2 - 14, h / 2 - 14);
  c.fillRect(x + w / 2 + 4, y + 10, w / 2 - 14, h / 2 - 14);
  c.fillRect(x + 10, y + h / 2 + 4 - open, w - 20, h / 2 - 14);
  if (k.pane > 0) {
    c.strokeStyle = alpha('#ffffff', 0.5 * k.pane); c.lineWidth = 2;
    c.beginPath(); c.moveTo(x + 10, y + 60); c.lineTo(x + 70, y + 40); c.lineTo(x + 40, y + 10); c.moveTo(x + w / 2 - 4, y + 120); c.lineTo(x + w / 2 - 50, y + h / 2 - 4); c.stroke();
  }
  c.fillStyle = fr;
  c.fillRect(x - 14, y - 14, w + 28, 24); c.fillRect(x - 14, y - 14, 24, h + 28); c.fillRect(x + w - 10, y - 14, 24, h + 28);
  c.fillRect(x + w / 2 - 6, y, 12, h / 2); c.fillRect(x, y + h / 2 - 8, w, 16);
  c.fillRect(x, y + h / 2 - 8 - open + h / 2 - 4, w, 14);
  c.fillRect(x + w / 2 - 6, y + h / 2 - open, 12, h / 2 - 4);
  // sill
  fill(c, rrect(x - 40, y + h + 2, w + 80, 18, 4), tone(fr, -0.05)); fill(c, rect(x - 36, y + h + 18, w + 72, 6), tone(fr, -0.35));
  // curtains, tied back
  const cur = mix('#7fa27a', '#6f7a64', k.A.grime), rot = ss(0.2, 0.8, k.A.grime);
  for (const side of [-1, 1]) {
    const cx = side < 0 ? x - 70 : x + w + 70;
    const p = blob([[cx - 46 * side, y - 40], [cx + 40 * side, y - 40], [cx + 30 * side + wind(t, cx) * 4, y + 200], [cx + 8 * side, y + 250], [cx + 26 * side, y + h + 60 - rot * 120], [cx - 44 * side, y + h + 80 - rot * 160], [cx - 30 * side, y + 230]]);
    fill(c, p, lin(c, cx - 40, 0, cx + 40, 0, side < 0 ? [[0, tone(cur, -0.2)], [0.6, cur], [1, tone(cur, 0.15)]] : [[0, tone(cur, 0.1)], [0.4, cur], [1, tone(cur, -0.25)]]));
    fill(c, rrect(cx - 10, y + 238, 24, 16, 6), '#d9b45a');
  }
  fill(c, rrect(x - 110, y - 52, w + 220, 12, 6), '#5d4a3a');
  // pot plant on the sill (dies, then wild growth takes over)
  const px = x + w - 60, py = y + h + 2;
  ink(c, blob([[px - 22, py - 34, 1], [px + 22, py - 34, 1], [px + 16, py, 1], [px - 16, py, 1]]), '#c96f45', '#6a3218', 2);
  if (k.A.years < 2) bush(c, px, py - 34, { w: 70, h: 54 * (1 - ss(0.1, 1.5, k.A.years) * 0.7), seed: 8, t, flowers: k.A.years < 0.5 ? '#ff8fb5' : null });
  c.restore();
}

function fireEscape(c, t, k) {
  const { x, y, w, h } = APT.window, m = mix('#2f3540', '#7a4a30', k.A.grime);
  const fy = y + h + 36;
  fill(c, rect(x - 160, fy, w + 320, 10), m);
  c.strokeStyle = m; c.lineWidth = 5;
  c.beginPath();
  c.moveTo(x - 160, fy - 120); c.lineTo(x + w + 160, fy - 120);
  for (let xx = x - 160; xx <= x + w + 160; xx += 26) { c.moveTo(xx, fy); c.lineTo(xx, fy - 120); }
  c.stroke();
  c.lineWidth = 3; c.beginPath();
  for (let xx = x - 150; xx < x + w + 160; xx += 18) { c.moveTo(xx, fy + 2); c.lineTo(xx + 10, fy + 8); }
  c.stroke();
  if (k.A.vines > 0.1) vines(c, x - 160, x + w + 160, fy - 120, { len: 140 * k.A.vines, seed: 5, t });
}

function door(c, t, o, k) {
  const { x0, x1, y0 } = APT.door, w = x1 - x0, hgt = FY - y0;
  // corridor seen through the doorway
  c.fillStyle = lin(c, 0, y0, 0, FY, [[0, '#4a4038'], [1, '#2a241f']]); c.fillRect(x0, y0, w, hgt);
  fill(c, rect(x0, FY - 70, w, 70), '#3b302a'); fill(c, rrect(x0 + 60, y0 + 70, 120, 230, 6), alpha('#6a5a48', 0.6));
  const trim = mix('#efe8da', '#8f8878', k.A.grime);
  // door leaf: swings open on its left hinge (drawn foreshortened), then falls away
  const open = k.door * 0.82, gone = k.doorGone;
  if (gone < 1) {
    c.save();
    c.globalAlpha = 1 - gone;
    c.translate(x0, y0);
    const sk = Math.cos(open * Math.PI / 2), droop = open * 0.06;
    c.transform(sk, droop * 0.4, 0, 1, 0, 0);
    if (gone > 0) c.rotate(gone * 0.25);
    const wood = mix('#a26c40', '#6e5a44', k.A.grime * 0.8);
    c.fillStyle = lin(c, 0, 0, w, 0, [[0, tone(wood, 0.12)], [1, tone(wood, -0.15)]]);
    c.fillRect(0, 0, w, hgt);
    for (const [px, py, pw, ph] of [[26, 30, 88, 200], [146, 30, 88, 200], [26, 270, 88, 236], [146, 270, 88, 236]]) {
      fill(c, rrect(px, py, pw, ph, 4), tone(wood, -0.12)); fill(c, rrect(px + 7, py + 7, pw - 14, ph - 14, 3), tone(wood, 0.06));
    }
    fill(c, circle(w - 32, 288, 11), '#d9b04a'); fill(c, circle(w - 35, 285, 4), '#fff1b0');
    fill(c, rrect(w - 40, 296, 18, 34, 4), '#b98f3a');
    fill(c, circle(w / 2, 120, 5), '#3a2a20');
    const sc = clamp(o.scratches ?? (k.A.years > 0.001 ? 1 : 0));
    if (sc > 0) {
      c.strokeStyle = alpha('#f3d9b0', 0.85 * sc); c.lineWidth = 2.4; c.lineCap = 'round';
      c.beginPath();
      for (let i = 0; i < 4; i++) { const xx = 70 + i * 13; c.moveTo(xx, 330); c.lineTo(xx + 6, 330 + 120 * sc); }
      for (let i = 0; i < 3; i++) { const xx = 150 + i * 14; c.moveTo(xx, 360); c.lineTo(xx + 4, 360 + 90 * sc); }
      c.stroke();
    }
    c.restore();
  }
  c.fillStyle = trim;
  c.fillRect(x0 - 22, y0 - 22, w + 44, 22); c.fillRect(x0 - 22, y0 - 22, 22, hgt + 22); c.fillRect(x1, y0 - 22, 22, hgt + 22);
  // coat hooks with the red leash and a scarf
  if (k.A.years < 60) {
    const hx = -390, hy = 470;
    fill(c, rrect(hx - 70, hy - 10, 140, 16, 4), '#7a5a3a');
    for (const dx of [-45, 0, 45]) fill(c, circle(hx + dx, hy + 12, 5), '#c9a14a');
    c.strokeStyle = mix('#d23a2e', '#6e4a3c', k.A.grime); c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(hx - 45, hy + 14); c.bezierCurveTo(hx - 60, hy + 140, hx - 20, hy + 190, hx - 30, hy + 100); c.stroke();
    fill(c, blob([[hx + 32, hy + 12], [hx + 62, hy + 12], [hx + 70, hy + 160], [hx + 52, hy + 178], [hx + 30, hy + 150]]), mix('#3f6fb0', '#5a6270', k.A.grime));
  }
}

function clock(c, t, o, k) {
  const [cx, cy] = APT.clock;
  if (k.clockFall >= 1) { fill(c, circle(cx, cy, 48), alpha('#ffffff', 0.08)); return; }
  c.save();
  c.translate(cx, cy + k.clockFall * 520); c.rotate(k.clockFall * 1.3); c.globalAlpha = 1 - ss(0.7, 1, k.clockFall);
  shadow(c, 4, 6, 48, 48, 0.18);
  fill(c, circle(0, 0, 48), '#3a3a44'); fill(c, circle(0, 0, 41), mix('#fbf7ec', '#bdb5a0', k.A.grime));
  c.strokeStyle = '#3a3a44'; c.lineWidth = 3;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.beginPath(); c.moveTo(Math.cos(a) * 33, Math.sin(a) * 33); c.lineTo(Math.cos(a) * 38, Math.sin(a) * 38); c.stroke(); }
  const stopped = k.A.years > 0.8, hr = o.clock ?? 16.6, sec = stopped ? 23 : Math.floor(t);
  const hh = stopped ? 3.2 : hr + sec / 3600, mm = (hh % 1) * 60 + (stopped ? 0 : sec / 60);
  const hand = (a, L, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(a) * L, -Math.cos(a) * L); c.stroke(); };
  c.lineCap = 'round'; c.strokeStyle = '#2a2a33';
  hand(((hh % 12) / 12) * TAU, 20, 5); hand((mm / 60) * TAU, 30, 3.5);
  c.strokeStyle = '#d23a2e'; hand(((sec % 60) / 60) * TAU, 33, 1.6);
  fill(c, circle(0, 0, 4), '#2a2a33');
  c.restore();
}

function lamp(c, t, o, k) {
  const { x } = APT.lamp, on = o.lampOn ?? o.power;
  const met = mix('#3d3a3a', '#6a4a36', k.A.grime), fall = ss(60, 110, k.A.years);
  c.save();
  c.translate(x, FY); c.rotate(-fall * 1.25);
  fill(c, oval(0, -4, 46, 9), met);
  fill(c, rect(-4, -470, 8, 466), met);
  const sh = blob([[-44, -420, 1], [44, -420, 1], [58, -490, 1], [-58, -490, 1]]);
  fill(c, sh, on ? lin(c, 0, -490, 0, -420, [[0, '#fff3cf'], [1, '#ffd98a']]) : lin(c, 0, -490, 0, -420, [[0, mix('#f1e4c8', '#a39a84', k.A.grime)], [1, mix('#d9c7a2', '#8a8270', k.A.grime)]]));
  c.restore();
}

function shelf(c, t, o, k) {
  const { x0, x1, top } = APT.shelf, w = x1 - x0, wood = mix('#8a5e3c', '#5d5244', k.A.grime);
  c.save();
  c.translate(x0, FY); c.rotate(-k.shelf * 0.42);
  c.fillStyle = lin(c, 0, 0, w, 0, [[0, tone(wood, 0.1)], [1, tone(wood, -0.2)]]); c.fillRect(0, top - FY, w, FY - top);
  fill(c, rect(14, top - FY + 14, w - 28, FY - top - 28), tone(wood, -0.4));
  const r = RNG(61), cols = ['#b5473d', '#3f6fb0', '#e0b04a', '#4f8a5a', '#8a5aa0', '#d97a3a', '#eadfc8'];
  for (const sy of [450, 560, 680, 800]) {
    fill(c, rect(8, sy - FY, w - 16, 12), tone(wood, 0.05));
    if (sy === 560 && o.photo !== false && k.shelf < 0.3) continue;
    let bx = 18;
    while (bx < w - 30) {
      const bw = r.range(14, 26), bh = r.range(70, 100) * (1 - k.shelf * 0.2), tilt = r() < 0.15 ? 0.15 : 0;
      if (r() < k.shelf * 0.8) { bx += bw; continue; }
      c.save(); c.translate(bx, sy - FY); c.rotate(-tilt); fill(c, rect(0, -bh, bw, bh), mix(cols[r.int(0, 6)], '#7a7262', k.A.grime * 0.7)); c.restore();
      bx += bw + 2;
    }
  }
  c.restore();
  if (o.photo !== false && k.shelf < 0.3) drawPhoto(c, { x: APT.photo[0], y: APT.photo[1] - 2, s: 0.72, age: ss(1, 100, k.A.years) });
  if (k.shelf > 0.2) {
    const r2 = RNG(62);
    for (let i = 0; i < 9; i++) {
      const bx = 1420 + r2() * 420, a = ss(0.2, 0.8, k.shelf);
      c.save(); c.translate(bx, FY + 8 + r2() * 14); c.rotate(r2.range(-0.4, 0.4)); c.globalAlpha = a;
      fill(c, rect(-40, -14, 80, 14), mix(cols[r2.int(0, 6)], '#6a6656', 0.4 + 0.5 * k.A.grime)); c.restore();
    }
  }
}

function tvCabinet(c, t, o, k) {
  const { x, y, w, h } = APT.tv, cab = APT.cabinet, wood = mix('#6e4a33', '#5a5246', k.A.grime);
  const sink = k.tv * 60;
  c.save(); c.translate(0, sink * 0.5);
  fill(c, rect(cab.x0, cab.top, cab.x1 - cab.x0, FY - cab.top), lin(c, 0, cab.top, 0, FY, [[0, tone(wood, 0.1)], [1, tone(wood, -0.2)]]));
  fill(c, rrect(cab.x0 + 14, cab.top + 20, (cab.x1 - cab.x0) / 2 - 20, FY - cab.top - 44, 4), tone(wood, -0.1));
  fill(c, rrect(cab.x0 + (cab.x1 - cab.x0) / 2 + 6, cab.top + 20, (cab.x1 - cab.x0) / 2 - 20, FY - cab.top - 44, 4), tone(wood, -0.1));
  c.save(); c.translate(x + w / 2, y + h); c.rotate(k.tv * 0.18); c.translate(-(x + w / 2), -(y + h));
  fill(c, rrect(x + w / 2 - 40, y + h, 80, 14, 3), '#1d1f24');
  fill(c, rrect(x - 8, y - 8, w + 16, h + 16, 8), '#17191d');
  const on = o.tvOn && o.power;
  fill(c, rect(x, y, w, h), on ? lin(c, x, y, x + w, y + h, [[0, '#7fb3e8'], [0.5, '#4a7fc0'], [1, '#2a4f8a']]) : lin(c, x, y, x + w, y + h, [[0, '#30343c'], [0.5, '#1e2228'], [1, '#14171b']]));
  if (on) { const r = RNG(Math.floor(t * 0.5) + 3); for (let i = 0; i < 4; i++) fill(c, rect(x + 20 + r() * (w - 80), y + 20 + r() * (h - 60), 40 + r() * 60, 20 + r() * 30), alpha('#d9ecff', 0.25)); }
  else { c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill(poly([[x, y], [x + w * 0.45, y], [x, y + h * 0.7]])); }
  if (k.tv > 0.3) { c.strokeStyle = alpha('#c9d2dc', 0.4 * k.tv); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + w * 0.6, y + h * 0.3); c.lineTo(x + w * 0.4, y + h * 0.6); c.lineTo(x + w * 0.55, y + h * 0.95); c.moveTo(x + w * 0.6, y + h * 0.3); c.lineTo(x + w * 0.9, y + h * 0.15); c.stroke(); }
  c.restore();
  c.restore();
  if (k.tv > 0.4) vines(c, x - 30, x + w + 30, y - 10, { len: 210 * k.tv, seed: 21, t });
}

function sofa(c, t, o, k) {
  const { x0, x1 } = APT.sofa, rot = k.sofa, sag = rot * 60;
  const fab = mix(mix('#dba23e', '#a88a58', k.A.grime * 0.7), '#5d6a3f', ss(0.4, 1, rot) * 0.6);
  const dk = tone(fab, -0.25), lt = tone(fab, 0.18);
  c.save(); c.translate(0, sag * 0.4);
  fill(c, rrect(x0 + 40, 600 + sag, x1 - x0 - 80, 150, 26), lin(c, 0, 600, 0, 750, [[0, lt], [1, dk]]));
  for (let i = 0; i < 3; i++) fill(c, rrect(x0 + 50 + i * 207, 612 + sag, 196, 120 - sag * 0.3, 22), lin(c, 0, 612, 0, 740, [[0, lt], [0.6, fab], [1, dk]]));
  fill(c, rrect(x0 + 20, 760, x1 - x0 - 40, 118, 14), lin(c, 0, 760, 0, 880, [[0, fab], [1, tone(fab, -0.35)]]));
  for (let i = 0; i < 2; i++) fill(c, rrect(x0 + 60 + i * 300, 722 + sag * 0.6, 290, 50, 16), lin(c, 0, 722, 0, 772, [[0, lt], [1, fab]]));
  for (const ax of [x0, x1 - 74]) fill(c, rrect(ax, 668 + sag * 0.5, 74, 210 - sag * 0.5, 24), lin(c, ax, 0, ax + 74, 0, [[0, lt], [1, dk]]));
  for (const fx of [x0 + 30, x1 - 44]) fill(c, rect(fx, 876, 14, 44), '#4a3426');
  if (rot > 0.15) {
    const r = RNG(33);
    for (let i = 0; i < 5; i++) fill(c, blob([[x0 + 100 + i * 140, 730 + sag], [x0 + 140 + i * 140, 715 + sag], [x0 + 170 + i * 140, 745 + sag]]), alpha('#ece4d0', ss(0.15, 0.5, rot)));
    if (rot > 0.3) moss(c, x0 + 20, x1 - 20, 760, { seed: 4, h: 12 * rot });
  }
  c.restore();
}

function coffeeTable(c, k) {
  const { x0, x1, top } = APT.coffeeTable, wood = mix('#7a5236', '#5d5446', k.A.grime), fall = ss(90, 160, k.A.years);
  c.save(); c.translate(x1, FY); c.rotate(fall * 0.12); c.translate(-x1, -FY);
  fill(c, rect(x0 + 20, top + 18, 14, FY - top - 18), tone(wood, -0.3)); fill(c, rect(x1 - 34, top + 18, 14, FY - top - 18), tone(wood, -0.3));
  fill(c, rrect(x0, top, x1 - x0, 20, 5), lin(c, 0, top, 0, top + 20, [[0, tone(wood, 0.2)], [1, tone(wood, -0.1)]]));
  if (k.A.years < 1) { fill(c, rrect(x0 + 40, top - 16, 70, 16, 3), '#3f6fb0'); fill(c, rrect(x0 + 46, top - 26, 60, 10, 2), '#e0b04a'); ink(c, rrect(x1 - 110, top - 30, 30, 30, 4), '#f4f0e6', '#6a5a4a', 2); }
  c.restore();
}

function floor(c, t, k) {
  const wood = mix('#b07a4c', '#7a6a50', k.A.grime * 0.8);
  c.fillStyle = lin(c, 0, FY, 0, 1500, [[0, tone(wood, 0.08)], [0.4, wood], [1, tone(wood, -0.35)]]);
  c.fillRect(X0 - 400, FY, X1 - X0 + 800, 700);
  c.strokeStyle = alpha(tone(wood, -0.45), 0.45); c.lineWidth = 2;
  c.beginPath();
  for (const yy of [948, 984, 1030, 1090, 1170, 1270]) { c.moveTo(X0 - 400, yy); c.lineTo(X1 + 400, yy); }
  c.stroke();
  c.beginPath();
  const rows = [920, 948, 984, 1030, 1090, 1170, 1270];
  for (let i = 0; i < rows.length - 1; i++) for (let xx = X0 - 400 + (i % 2) * 160; xx < X1 + 400; xx += 330) { c.moveTo(xx, rows[i]); c.lineTo(xx - (i + 1) * 4, rows[i + 1]); }
  c.stroke();
  if (k.A.years < 30) {
    const rug = mix('#4f8a8a', '#6a6a5a', k.A.grime);
    c.save(); c.globalAlpha = 1 - ss(10, 30, k.A.years) * 0.7;
    fill(c, blob([[360, 936, 1], [960, 936, 1], [1010, 990, 1], [310, 990, 1]]), rug);
    c.strokeStyle = alpha('#f1e6cf', 0.6); c.lineWidth = 3; c.stroke(blob([[372, 944, 1], [948, 944, 1], [992, 982, 1], [328, 982, 1]]));
    c.restore();
  }
}

function fern(c, x, y, h, k, seed, t) {
  if (k <= 0.03) return;
  const r = RNG(seed), n = 5 + r.int(0, 3), sw = wind(t, x) * 0.04;
  const pa = new Path2D(), pb = new Path2D();
  c.strokeStyle = LEAF.dark; c.lineWidth = 2.4; c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42 + r.range(-0.12, 0.12) + sw, L = h * k * r.range(0.7, 1.05);
    const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L * 0.85 + L * 0.15;
    const mx = x + Math.cos(a) * L * 0.55, my = y + Math.sin(a) * L * 0.75;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
    for (let j = 1; j <= 8; j++) {
      const u = j / 9, iu = 1 - u;
      const bx = iu * iu * x + 2 * iu * u * mx + u * u * ex, by = iu * iu * y + 2 * iu * u * my + u * u * ey;
      const tx = 2 * iu * (mx - x) + 2 * u * (ex - mx), ty = 2 * iu * (my - y) + 2 * u * (ey - my), ang = Math.atan2(ty, tx);
      const len = L * 0.13 * (1 - u * 0.7);
      pa.ellipse(bx + Math.cos(ang - 1.2) * len * 0.6, by + Math.sin(ang - 1.2) * len * 0.6, len * 0.62, len * 0.2, ang - 1.2, 0, TAU);
      pb.ellipse(bx + Math.cos(ang + 1.2) * len * 0.6, by + Math.sin(ang + 1.2) * len * 0.6, len * 0.62, len * 0.2, ang + 1.2, 0, TAU);
    }
  }
  fill(c, pa, LEAF.mid); fill(c, pb, LEAF.light);
}

function overgrowth(c, t, o, k) {
  const y = FY + 6;
  if (k.leaves > 0.02) litter(c, X0, X1, y + 4, { n: Math.round(160 * k.leaves), seed: 3, yVar: 18 });
  if (k.ferns > 0.02) {
    const spots = [[-560, 1], [-330, 0.7], [140, 1.1], [420, 0.8], [1080, 1.2], [1420, 0.9], [1640, 1], [1980, 0.8], [2300, 1.1], [2700, 0.9]];
    spots.forEach(([x, sz], i) => fern(c, x, y + 8, 150 * sz, clamp(k.ferns * 1.4 - i * 0.05), 50 + i, t));
  }
  if (k.flowers > 0.02) flowers(c, 200, 1500, y + 12, { n: Math.round(40 * k.flowers), seed: 7, t, yVar: 14, h: 30 });
  if (k.green > 0.3) moss(c, X0, X1, y + 2, { seed: 9, h: 14 * k.green });
}

// --------------------------------------------------------------------- the set ---
export function apartmentSet(g, t, o = {}) {
  const years = o.years ?? 0, look = o.look ?? LOOKS.day, k = K(years);
  const power = o.power ?? years < 0.02;
  const so = { ...o, power, lampOn: o.lampOn ?? power };
  outside(g, t, so, k, look);
  g.layer(1, (c) => {
    fireEscape(c, t, k);
    door(c, t, so, k);
    // kitchen through its doorway
    const kx = APT.kitchen.x0;
    c.fillStyle = lin(c, 0, 380, 0, FY, [[0, mix('#dfe8ea', '#8a948a', k.A.grime)], [1, mix('#b9c6c8', '#6a746a', k.A.grime)]]); c.fillRect(kx, 380, 220, FY - 380);
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1.5; c.beginPath();
    for (let yy = 400; yy < 700; yy += 30) { c.moveTo(kx, yy); c.lineTo(kx + 220, yy); }
    c.stroke();
    fill(c, rect(kx, 700, 220, 220), mix('#7a8a9a', '#5a5a52', k.A.grime)); fill(c, rect(kx, 690, 220, 14), '#e8e2d6');
    wall(c, t, so, k, look);
    windowFrame(c, t, so, k, look);
    const dtrim = mix('#efe8da', '#8f8878', k.A.grime);
    c.fillStyle = dtrim; c.fillRect(kx - 20, 360, 260, 20); c.fillRect(kx - 20, 360, 20, FY - 360); c.fillRect(kx + 220, 360, 20, FY - 360);
    clock(c, t, so, k);
    shelf(c, t, so, k);
    tvCabinet(c, t, so, k);
    lamp(c, t, so, k);
    floor(c, t, k);
    if (k.ivyIn > 0.02) ivy(c, APT.window.x - 120, APT.window.y - 60, APT.window.w + 240, 700, { cover: k.ivyIn * (1 - k.gap * 0.5), seed: 12, t, density: 0.9 });
    if (k.holes > 0.02) vines(c, -600, 2600, 40, { len: 260 * k.holes, seed: 14, t });
    // furniture
    const bedAge = ss(0.5, 200, years);
    const bedTop = drawDogBed(c, { x: APT.dogBed[0], y: FY, s: 1, age: bedAge });
    APT.bedTop = bedTop;
    if (so.plush !== false) drawPlush(c, { x: APT.plush[0], y: FY, s: 1.05, age: ss(0.5, 200, years) });
    if (k.stand < 1) { c.save(); c.globalAlpha = 1 - k.stand; drawPerchStand(c, { x: APT.stand[0], y: FY, s: 1, age: ss(0, 30, years) }); c.restore(); }
    sofa(c, t, so, k);
    coffeeTable(c, k);
    drawBowl(c, { x: APT.bowls.dog[0], y: FY + 4, s: 0.95, age: ss(1, 200, years) });
    drawBowl(c, { x: APT.bowls.cat[0], y: FY + 4, s: 0.7, age: ss(1, 200, years), name: '' });
    drawFeeder(c, { x: APT.feeder[0], y: FY + 4, s: 0.9, led: o.led ?? (power ? 1 : 0), age: ss(1, 200, years) });
    if (o.photo !== false && k.shelf >= 0.3) drawPhoto(c, { x: APT.photoFloor[0], y: APT.photoFloor[1], s: 0.72, rot: -0.12, age: ss(1, 100, years), frame: years < 150 });
    overgrowth(c, t, so, k);
    if (k.tree > 0.02) tree(c, APT.tree[0], APT.tree[1], { h: 1050, grow: k.tree, seed: 23, t, kind: 'round', spread: 1.25 });
    // daylight through the window/gap
    const bright = 1 - (look.dark ?? 0);
    if ((o.beam ?? true) && bright > 0.45) {
      c.save(); c.globalCompositeOperation = 'screen';
      c.fillStyle = lin(c, 650, 200, 900, 1000, [[0, alpha(look.key || '#fff6d8', 0.22 * bright)], [1, alpha(look.key || '#fff6d8', 0)]]);
      c.fill(poly([[APT.window.x + 20, APT.window.y + 20], [APT.window.x + APT.window.w - 20, APT.window.y + 20], [1320, 1000], [760, 1000]]));
      c.restore();
    }
    if (so.lampOn) { c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = rad(c, APT.lamp.x, 470, 420, [[0, 'rgba(255,200,120,0.35)'], [1, 'rgba(255,200,120,0)']]); c.fillRect(APT.lamp.x - 420, 50, 840, 900); c.restore(); }
    if (o.actors) o.actors(c);
    if (o.front) o.front(c);
  });
  if (k.green > 0.4) g.layer(1.35, (c) => { const v = g.view(1.35, 200); fern(c, v.x0 + 120, 1130, 380, ss(0.4, 1, k.green), 90, t); fern(c, v.x1 - 160, 1150, 330, ss(0.4, 1, k.green), 91, t); }, { blur: 5, tint: ['#10240f', 0.35] });
}

// Emissive bits for after g.grade(): lamp halo, TV glow, feeder LED, window light.
export function apartmentGlow(g, t, o = {}) {
  const years = o.years ?? 0, power = o.power ?? years < 0.02, look = o.look ?? LOOKS.day;
  g.layer(1, (c) => {
    if (o.lampOn ?? power) { glow(c, APT.lamp.x, 455, 260, '#ffcf8a', 0.55); glow(c, APT.lamp.x, 900, 320, '#ffb766', 0.18); }
    if (o.tvOn && power) { const f = 0.75 + 0.25 * noise1(t * 3, 4); glow(c, APT.tv.x + APT.tv.w / 2, APT.tv.y + APT.tv.h / 2, 420, '#7fb6ff', 0.32 * f); }
    const led = o.led ?? (power ? 1 : 0);
    if (led > 0.02) glow(c, APT.led[0], APT.led[1], 26, '#7dff9e', 0.9 * led);
    if ((look.dark ?? 0) > 0.6 && !power) glow(c, APT.window.x + APT.window.w / 2, APT.window.y + APT.window.h / 2, 520, '#9fb8ff', 0.16);
  });
}
