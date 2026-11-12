// Shared shot builders used by every scene: time-jump transitions, title treatments, small helpers.
import { W, H } from '../engine/stage.js';
import { LOOKS, mixLooks } from '../engine/sky.js';
import { TAU, clamp, lerp, ease, ss } from '../engine/util.js';
import { bigTitle, counter } from '../engine/overlays.js';
import { txt, lin } from '../engine/draw.js';

export const DAY = 1 / 365;
export const ERA = { d0: 0, h24: DAY, d7: 7 * DAY, y1: 1, y5: 5, y20: 20, y50: 50, y100: 100, y200: 200 };
export const PILL = { today: 'TODAY', d0: 'DAY 0', d7: '+7 DAYS', y1: '+1 YEAR', y5: '+5 YEARS', y20: '+20 YEARS', y50: '+50 YEARS', y100: '+100 YEARS', y200: '+200 YEARS' };

export const fmtElapsed = (years) => (years < 0.98 ? `DAY ${Math.max(1, Math.round(years * 365))}` : `YEAR ${Math.round(years)}`);

// Time-lapse transition shot: years run from `from` to `to` (exponentially) while days and nights flicker past and a
// counter spins. `draw(g, tt, years, look, u)` must draw the location for that many years; tt is sped-up time for
// clouds / wind. The shot ends in a white flash: start the next shot with trans {type: 'flash', dur: 0.7}.
export function timeJump({ id, at, from, to, pill, label = 'TIME WITHOUT HUMANS', fmt = fmtElapsed, draw, cycles = 7, base = LOOKS.day }) {
  return {
    id, at, pill, kind: 'timejump', trans: { type: 'fade', dur: 0.45 },
    draw(g, t) {
      const d = g.dur, u = ease.io(clamp(t / (d - 0.2)));
      const a = Math.log1p(from * 365), b = Math.log1p(to * 365), years = Math.expm1(lerp(a, b, u)) / 365;
      const cyc = u * cycles, ph = cyc % 1, night = ss(0.62, 0.74, ph) * (1 - ss(0.9, 1, ph)) + (1 - ss(0, 0.08, ph)) * 0;
      const sunU = clamp(ph / 0.7);
      const dayLook = { ...base, sun: { ...(base.sun || LOOKS.day.sun), x: lerp(180, 1740, sunU), y: 620 - Math.sin(sunU * Math.PI) * 470 } };
      const look = mixLooks(dayLook, LOOKS.night, night * 0.85);
      draw(g, t * 22, years, look, u);
      g.grade(look);
      g.screen((c) => {
        const k = ss(0, 0.35, t) * (1 - ss(d - 0.45, d - 0.1, t));
        c.fillStyle = lin(c, 0, 0, 0, 330, [[0, `rgba(5,8,24,${0.62 * k})`], [1, 'rgba(5,8,24,0)']]); c.fillRect(0, 0, W, 330);
        counter(c, label, fmt(years), k, 178);
      });
      g.wash('#ffffff', ss(d - 0.4, d, t) * 0.9);
    },
  };
}

// Standard era title over an establishing shot: call inside draw() after g.grade().
export function eraTitle(g, t, text, sub, at = 0.35, dur = 3.1) {
  g.screen((c) => bigTitle(c, { text, sub, t: t - at, dur }));
}

// Question / statement lockup used at the top of the frame (white line + gold line), like the film's opening.
export function topLines(c, white, gold, a = 1, y = 118) {
  if (a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  c.fillStyle = lin(c, 0, 0, 0, 300, [[0, 'rgba(5,8,24,0.55)'], [1, 'rgba(5,8,24,0)']]); c.fillRect(0, 0, W, 300);
  txt(c, white, W / 2, y, { weight: 700, size: 52, track: 5, color: '#ffffff', shadow: ['rgba(0,0,0,0.6)', 10, 2] });
  txt(c, gold, W / 2, y + 62, { weight: 800, size: 66, track: 5, color: '#ffc247', glow: ['rgba(255,146,36,0.75)', 20] });
  c.restore();
}

// Move an actor along keyframed x positions and return {x, flip, phase, moving}: phase advances with distance so
// feet stay planted. keys: [[t, x], ...]; stride in px per gait cycle.
export function travel(t, keys, stride) {
  const n = keys.length;
  let x, v = 0;
  if (t <= keys[0][0]) x = keys[0][1];
  else if (t >= keys[n - 1][0]) x = keys[n - 1][1];
  else {
    let i = 1;
    while (keys[i][0] < t) i++;
    const a = keys[i - 1], b = keys[i], u = (t - a[0]) / (b[0] - a[0]), e = ease[b[2] || 'io'](u);
    x = lerp(a[1], b[1], e);
    v = b[1] - a[1];
  }
  // distance travelled so far (sum of completed segments + current)
  let dist = 0;
  for (let i = 1; i < n; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t >= b[0]) dist += Math.abs(b[1] - a[1]);
    else if (t > a[0]) { const u = (t - a[0]) / (b[0] - a[0]); dist += Math.abs(b[1] - a[1]) * ease[b[2] || 'io'](u); }
  }
  return { x, flip: v < 0 ? -1 : 1, phase: dist / stride, moving: v !== 0 };
}
