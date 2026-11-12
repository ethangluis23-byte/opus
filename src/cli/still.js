// Render stills or contact sheets of the film.
//   node src/cli/still.js --t 12.5 [--scale 0.5] [--out build/stills/x.jpg]
//   node src/cli/still.js --shot s01_city --p 0.5
//   node src/cli/still.js --times 3,12.5,40 --out build/sheets/a.jpg           (contact sheet)
//   node src/cli/still.js --scene 3 [--per 2] --out build/sheets/scene03.jpg   (contact sheet of every shot)
//   node src/cli/still.js --from 0 --to 60 --n 16 --out build/sheets/b.jpg
//   node src/cli/still.js --list [--scene 3]                                   (print the shot list)
import { getFilm } from '../film/index.js';
import { Renderer } from '../engine/film.js';
import { args, save, sheet, tc } from './common.js';

const a = args();
const film = await getFilm();

if (a.list) {
  for (const s of film.shots) if (!a.scene || s.scene === +a.scene) console.log(`${tc(s.start).padStart(7)}  ${s.dur.toFixed(2).padStart(6)}s  ${s.id}${s.trans ? `  [${s.trans.type} ${s.trans.dur}]` : ''}${s.pill ? `  {${s.pill}}` : ''}`);
  process.exit(0);
}

let items = null;
if (a.times) items = String(a.times).split(',').map(Number).map((T) => ({ T }));
else if (a.scene) {
  const per = +(a.per || 2), fr = per === 1 ? [0.5] : per === 2 ? [0.22, 0.8] : [0.1, 0.5, 0.9];
  items = film.shots.filter((s) => s.scene === +a.scene).flatMap((s) => fr.map((p) => ({ T: s.start + s.dur * p, id: s.id })));
} else if (a.from !== undefined && a.to !== undefined) {
  const n = +(a.n || 16), f = +a.from, t = +a.to;
  items = Array.from({ length: n }, (_, i) => ({ T: f + ((t - f) * (i + 0.5)) / n }));
}

if (items) {
  const tw = +(a.tw || 480), R = new Renderer(film, tw / 1920);
  for (const it of items) { const s = film.shots.find((x) => it.T >= x.start && it.T < x.end); it.label = `${tc(it.T)}  ${it.id || s?.id || ''}`; }
  const t0 = performance.now();
  const files = sheet(items, (it) => R.frame(it.T, { grain: 0 }), { cols: +(a.cols || 4), rows: +(a.rows || 4), tw, out: a.out || 'build/sheets/sheet.jpg' });
  console.log(`${items.length} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s ->`, files.join(' '));
} else {
  let T = +(a.t ?? 0);
  if (a.shot) {
    const s = film.shots.find((x) => x.id === a.shot);
    if (!s) { console.error('no such shot', a.shot); process.exit(1); }
    T = s.start + s.dur * +(a.p ?? 0.5);
  }
  const R = new Renderer(film, +(a.scale || 0.5));
  const t0 = performance.now();
  const cv = R.frame(T, a.clean ? { overlays: false } : {});
  const ms = performance.now() - t0;
  const out = save(cv, a.out || `build/stills/t${T.toFixed(2)}.jpg`, 92);
  console.log(`T=${tc(T)} rendered in ${ms.toFixed(0)}ms -> ${out}`);
}
