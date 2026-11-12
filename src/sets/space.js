// Earth seen from orbit (night side with city lights that can black out) and a flat low-poly world map.
import { W, H } from '../engine/stage.js';
import { TAU, DEG, RNG, clamp, lerp, hash, alpha, mix, ss } from '../engine/util.js';
import { rad, glow, lin } from '../engine/draw.js';
import { drawStars } from '../engine/sky.js';
import { LAND, CITIES } from './geo.js';

export const EARTH = { x: 960, y: 560, r: 400 };

function ortho(lon, lat, lon0, lat0) {
  const l = (lon - lon0) * DEG, p = lat * DEG, p0 = lat0 * DEG;
  return [Math.cos(p) * Math.sin(l), -(Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)), Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l)];
}

let lights = null;
function buildLights() {
  const r = RNG(77);
  lights = CITIES.map(([lon, lat, w], i) => {
    const n = Math.round(10 + w * 34), dots = [];
    for (let k = 0; k < n; k++) {
      const a = r.range(0, TAU), d = Math.abs(r.gauss()) * (1.4 + w * 2.6);
      dots.push([lon + Math.cos(a) * d * 1.25, lat + Math.sin(a) * d, r.range(0.8, 2.1), r(), r.range(0, TAU)]);
    }
    return { lon, lat, w, dots, th: 0.1 + 0.62 * hash(i, 4) + 0.2 * ((lon + 180) / 360) };
  });
}

// Deep-space backdrop used behind the globe and behind infographics.
export function spaceBackdrop(g, t, o = {}) {
  g.screen((c) => {
    c.fillStyle = lin(c, 0, 0, W * 0.3, H, [[0, '#060a20'], [0.55, '#0a1233'], [1, '#101a44']]);
    c.fillRect(0, 0, W, H);
    c.fillStyle = rad(c, W * 0.22, H * 0.3, 720, [[0, 'rgba(60,80,170,0.20)'], [1, 'rgba(60,80,170,0)']]); c.fillRect(0, 0, W, H);
    c.fillStyle = rad(c, W * 0.85, H * 0.8, 620, [[0, 'rgba(120,60,150,0.12)'], [1, 'rgba(120,60,150,0)']]); c.fillRect(0, 0, W, H);
  });
  g.layer(o.depth ?? 0.04, (c) => { c.save(); c.translate(0, 120); c.scale(1, 1.25); drawStars(c, o.stars ?? 1, t, o.seed ?? 21); c.restore(); });
}

// o: {lit: 0..1 (share of city lights still on), lon (centre longitude), lat, day: 0..1 (0 night side, 1 sunlit), depth}
export function earthSet(g, t, o = {}) {
  if (!lights) buildLights();
  const lit = clamp(o.lit ?? 1), lon0 = o.lon ?? -30, lat0 = o.lat ?? 22, day = clamp(o.day ?? 0), E = EARTH, R = E.r, b = 1 - lit;
  spaceBackdrop(g, t, o);
  g.layer(o.depth ?? 1, (c) => {
    c.save();
    c.translate(E.x, E.y);
    glow(c, 0, 0, R * 1.42, '#3f7fe0', 0.55);
    glow(c, 0, 0, R * 1.13, '#8fc4ff', 0.5);
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
    c.fillStyle = rad(c, -R * 0.35, -R * 0.4, R * 1.7, [[0, mix('#102a5c', '#3d8fe0', day)], [0.6, mix('#0a1a3e', '#2467b8', day)], [1, mix('#050c22', '#143f7a', day)]]);
    c.fillRect(-R, -R, R * 2, R * 2);
    // land
    c.fillStyle = mix('#16324f', '#6fae52', day);
    c.strokeStyle = mix('#2c5578', '#8fca66', day); c.lineWidth = 2; c.lineJoin = 'round';
    for (const poly of Object.values(LAND)) {
      c.beginPath();
      let any = false;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], q = poly[(i + 1) % poly.length], steps = Math.max(1, Math.ceil(Math.hypot(q[0] - a[0], q[1] - a[1]) / 4));
        for (let k = 0; k < steps; k++) {
          let [x, y, z] = ortho(lerp(a[0], q[0], k / steps), lerp(a[1], q[1], k / steps), lon0, lat0);
          if (z < 0) { const d = Math.hypot(x, y) || 1; x /= d; y /= d; } else any = true;
          if (i === 0 && k === 0) c.moveTo(x * R, y * R); else c.lineTo(x * R, y * R);
        }
      }
      if (any) { c.closePath(); c.fill(); c.stroke(); }
    }
    // soft terminator: daylight creeping round the upper-left limb
    c.fillStyle = rad(c, -R * 0.95, -R * 0.75, R * 1.25, [[0, 'rgba(150,200,255,0.34)'], [0.5, 'rgba(110,160,240,0.10)'], [1, 'rgba(110,160,240,0)']]);
    c.fillRect(-R, -R, R * 2, R * 2);
    // limb darkening
    c.fillStyle = rad(c, 0, 0, R, [[0, 'rgba(0,0,0,0)'], [0.72, 'rgba(0,0,0,0)'], [1, 'rgba(2,4,14,0.62)']]);
    c.fillRect(-R, -R, R * 2, R * 2);
    // city lights
    if (day < 0.9) {
      c.globalCompositeOperation = 'screen';
      for (const L of lights) {
        const [cx, cy, cz] = ortho(L.lon, L.lat, lon0, lat0);
        if (cz < 0.05) continue;
        const fade = clamp(cz * 2.2) * (1 - day);
        const state = (off) => {
          const d = b - off;
          if (d > 0.03) return 0;
          if (d > -0.05) return 0.35 + 0.65 * (Math.sin(t * 34 + off * 90) > 0 ? 1 : 0.15); // flicker just before dying
          return 1;
        };
        const cs = state(L.th);
        if (cs > 0) glow(c, cx * R, cy * R, (16 + L.w * 26) * (0.6 + 0.4 * cz), '#ffcf7a', 0.5 * cs * fade * L.w + 0.1 * cs * fade);
        for (const [lo, la, s, v, ph] of L.dots) {
          const st = state(L.th + (v - 0.5) * 0.07);
          if (st <= 0) continue;
          const [x, y, z] = ortho(lo, la, lon0, lat0);
          if (z < 0.05) continue;
          c.globalAlpha = fade * st * (0.7 + 0.3 * Math.sin(t * 3 + ph));
          c.fillStyle = v > 0.7 ? '#fff3cf' : '#ffc766';
          c.beginPath(); c.arc(x * R, y * R, s * (0.55 + 0.45 * z), 0, TAU); c.fill();
        }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    c.restore();
  });
}

// Flat map. o: {lon0, lat0 (top-left corner), k (px per degree), a}. Returns a projector via MAP.at(lon, lat).
export function mapSet(g, t, o = {}) {
  const lon0 = o.lon0 ?? -135, lat0 = o.lat0 ?? 68, k = o.k ?? 11.6, ys = 1.3;
  const at = (lon, lat) => [(lon - lon0) * k, (lat0 - lat) * k * ys];
  g.layer(0, (c) => {
    c.fillStyle = lin(c, 0, 0, 0, H, [[0, '#2467ad'], [1, '#184f8c']]); c.fillRect(0, 0, W, H);
  });
  g.layer(1, (c) => {
    const path = (dx, dy) => {
      c.beginPath();
      for (const poly of Object.values(LAND)) {
        poly.forEach((p, i) => { const [x, y] = at(p[0], p[1]); if (i) c.lineTo(x + dx, y + dy); else c.moveTo(x + dx, y + dy); });
        c.closePath();
      }
    };
    c.lineJoin = 'round';
    path(7, 10); c.fillStyle = 'rgba(8,28,60,0.45)'; c.fill();
    path(0, 0); c.fillStyle = lin(c, 0, 0, 0, H, [[0, '#86c35a'], [1, '#68a94b']]); c.fill();
    c.strokeStyle = 'rgba(214,240,170,0.5)'; c.lineWidth = 2.5; c.stroke();
    // faint graticule
    c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1.5;
    for (let lo = -180; lo <= 180; lo += 15) { const [x] = at(lo, 0); c.beginPath(); c.moveTo(x, -2000); c.lineTo(x, 3000); c.stroke(); }
    for (let la = -60; la <= 75; la += 15) { const [, y] = at(0, la); c.beginPath(); c.moveTo(-3000, y); c.lineTo(5000, y); c.stroke(); }
  });
  return at;
}

// Glowing map pin at a point (draw on the same layer as the map, depth 1). p: 0..1 pop-in.
export function mapPin(c, x, y, p, t) {
  const k = clamp(p);
  if (k <= 0) return;
  const pulse = (t * 0.8) % 1;
  c.save();
  c.strokeStyle = alpha('#ffc247', (1 - pulse) * 0.8 * k); c.lineWidth = 3;
  c.beginPath(); c.arc(x, y, 12 + pulse * 46, 0, TAU); c.stroke();
  glow(c, x, y, 60 * k, '#ffc247', 0.7);
  c.fillStyle = '#fff3cf'; c.beginPath(); c.arc(x, y, 9 * ss(0, 0.6, k), 0, TAU); c.fill();
  c.fillStyle = '#f2a52e'; c.beginPath(); c.arc(x, y, 5 * ss(0, 0.6, k), 0, TAU); c.fill();
  c.restore();
}
