"""Render every cue type, write audition WAVs and spectrogram contact sheets.

  .venv-audio/bin/python audio/tools/sfx_sheet.py [--only REGEX] [--no-beds] [--no-oneshots] [--bed-dur 20]

WAVs go to build/audio/sfx/, sheets and a stats table to build/audio/qa/sheets/.
"""
import argparse
import json
import os
import re
import sys
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "audio"))

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import soundfile as sf  # noqa: E402
from scipy import signal  # noqa: E402

from lpaudio import registry  # noqa: E402
from lpaudio.dsp import SR, stable_seed, db, to_stereo  # noqa: E402
from lpaudio.dynamics import integrated_lufs, max_window_level  # noqa: E402

ONESHOT_CASES = [
    ("dog_bark", {}), ("dog_bark@small", {"size": "small", "dist": 0.05, "count": 3}),
    ("dog_bark@large", {"size": "large", "dist": 0.1, "count": 2}),
    ("dog_bark@far", {"size": "large", "dist": 0.9, "count": 3}),
    ("dog_bark@urgent", {"size": "medium", "urgency": 1.0, "count": 4, "dist": 0.3}),
    ("dog_whine", {}), ("dog_pant", {"dur": 2.5}), ("dog_howl", {"count": 3}),
    ("dog_howl@solo", {"count": 1, "dist": 0.2}), ("dog_growl", {}), ("puppy_yip", {"count": 3}), ("sniff", {"count": 5}),
    ("paws", {"surface": "floor"}), ("paws@asphalt", {"surface": "asphalt", "rate": 5}),
    ("paws@grass", {"surface": "grass"}), ("paws@leaves", {"surface": "leaves"}), ("door_scratch", {"dur": 2.5}),
    ("cat_meow", {"mood": "curious"}), ("cat_meow@sad", {"mood": "sad"}), ("cat_purr", {"dur": 5}), ("cat_hiss", {}),
    ("pounce", {}), ("mouse_squeak", {}), ("parrot_squawk", {}), ("parrot_squawk@far", {"dist": 0.9, "count": 2}),
    ("parrot_flock", {"dur": 5, "count": 8}), ("parrot_talk", {"id": "p_hello"}), ("wing_flaps", {"dur": 1.5}),
    ("wing_flaps@small", {"dur": 1.2, "size": "small"}), ("hawk_cry", {}), ("owl_hoot", {}),
    ("rabbit_thump", {"count": 2}), ("hop", {"count": 4}), ("munch", {"dur": 2.5}), ("hamster_wheel", {"dur": 3}),
    ("cage_rattle", {"dur": 2}), ("scurry", {"dur": 1.2}), ("ball_bounce", {"count": 6}), ("squeaky_toy", {}),
    ("plush_rustle", {"dur": 1.5}), ("feeder_beep", {"count": 3}), ("feeder_power_down", {}),
    ("electric_flicker", {}), ("power_down_big", {}), ("car_engine_die", {}), ("traffic_light_click", {}),
    ("vanish", {}), ("whoosh", {"dur": 0.8}), ("riser", {"dur": 3}), ("boom", {}), ("sub_drop", {}),
    ("shimmer", {"dur": 3}), ("time_tick", {"dur": 3, "accel": 8}), ("ui_pop", {}),
    ("glass_break", {}), ("metal_creak", {}), ("rumble_collapse", {}), ("leaves_rustle", {"dur": 2.5}),
    ("grass_rustle", {"dur": 2.5}), ("water_drip", {"count": 3}), ("thunder", {}), ("thunder@close", {"dist": 0.1}),
    ("paper_flutter", {}),
    # dry single events at high time resolution, to inspect the source-filter structure
    ("dog_bark@zoom_med", {"count": 1, "dist": 0.0}), ("dog_bark@zoom_large", {"count": 1, "dist": 0.0, "size": "large"}),
    ("dog_bark@zoom_small", {"count": 1, "dist": 0.0, "size": "small"}), ("puppy_yip@zoom", {"count": 1, "dist": 0.0}),
    ("parrot_squawk@zoom", {"count": 1, "dist": 0.0}), ("cat_meow@zoom", {"mood": "curious", "dist": 0.0}),
    ("dog_growl@zoom", {"dur": 0.6, "dist": 0.0}), ("cat_hiss@zoom", {"dist": 0.0}),
]
BED_CASES = [(k, {}) for k in registry.BEDS] + [("room_tone@clock", {"clock": True}), ("rain@heavy", {"intensity": 1.0}),
                                                ("birds_day@dense", {"density": 1.0})]


def logspec(x, fmin=40.0, fmax=16000.0, nbins=220):
    m = x.mean(axis=1) if x.ndim == 2 else x
    d = len(m) / SR
    nper = 2048 if d > 8 else (1024 if d > 2.5 else (512 if d > 0.5 else 256))
    if len(m) < nper * 2:
        m = np.concatenate([m, np.zeros(nper * 2 - len(m), dtype=m.dtype)])
    f, t, S = signal.spectrogram(m, fs=SR, nperseg=nper, noverlap=nper * 3 // 4, window="hann", mode="magnitude")
    S = 20 * np.log10(S + 1e-9)
    fl = np.geomspace(fmin, fmax, nbins)
    idx = np.clip(np.searchsorted(f, fl), 1, len(f) - 1)
    return t, fl, S[idx]


OCT_EDGES = [0, 125, 250, 500, 1000, 2000, 4000, 8000, 24000]


def octave_bands(x):
    """Share of energy per band, dB relative to the total."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    P = np.abs(np.fft.rfft(m.astype(np.float64))) ** 2
    f = np.fft.rfftfreq(len(m), 1.0 / SR)
    tot = P.sum() + 1e-30
    return [int(round(10 * np.log10(P[(f >= a) & (f < b)].sum() / tot + 1e-12))) for a, b in zip(OCT_EDGES[:-1], OCT_EDGES[1:])]


def sheet(items, path, cols=4):
    rows = int(np.ceil(len(items) / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(cols * 4.6, rows * 2.75), squeeze=False)
    for ax in axes.ravel():
        ax.axis("off")
    for ax, (label, x, info) in zip(axes.ravel(), items):
        ax.axis("on")
        t, fl, S = logspec(x)
        top = S.max()
        ax.imshow(S, origin="lower", aspect="auto", extent=[0, len(x) / SR, 0, len(fl)], vmin=top - 60, vmax=top, cmap="magma")
        ticks = [50, 100, 200, 500, 1000, 2000, 5000, 10000]
        ax.set_yticks([np.interp(np.log(v), np.log(fl), np.arange(len(fl))) for v in ticks])
        ax.set_yticklabels(["50", "100", "200", "500", "1k", "2k", "5k", "10k"], fontsize=6)
        ax.tick_params(axis="x", labelsize=6)
        ax.set_title(f"{label}  {info}", fontsize=7.5)
    fig.tight_layout()
    fig.savefig(path, dpi=80)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--no-beds", action="store_true")
    ap.add_argument("--no-oneshots", action="store_true")
    ap.add_argument("--bed-dur", type=float, default=20.0)
    ap.add_argument("--per-sheet", type=int, default=12)
    args = ap.parse_args()
    out_wav = os.path.join(ROOT, "build", "audio", "sfx")
    out_qa = os.path.join(ROOT, "build", "audio", "qa", "sheets")
    os.makedirs(out_wav, exist_ok=True)
    os.makedirs(out_qa, exist_ok=True)
    pat = re.compile(args.only) if args.only else None
    stats = []
    groups = []
    if not args.no_oneshots:
        groups.append(("oneshot", ONESHOT_CASES))
    if not args.no_beds:
        groups.append(("bed", BED_CASES))
    for kind, cases in groups:
        items = []
        for label, params in cases:
            if pat and not pat.search(label):
                continue
            typ = label.split("@")[0]
            seed = stable_seed("sheet", label)
            t0 = time.time()
            try:
                if kind == "oneshot":
                    x, pre = registry.render_oneshot(typ, params, seed, cache=None, root=ROOT)
                else:
                    x = registry.render_bed(typ, args.bed_dur, params, seed, cache=None)[:int(args.bed_dur * SR)]
            except Exception as e:  # keep going, report at the end
                import traceback
                traceback.print_exc()
                stats.append(dict(label=label, error=repr(e)))
                continue
            el = time.time() - t0
            lk, lz = max_window_level(x, 0.125)
            xs = to_stereo(x)
            st = dict(label=label, kind=kind, ch=1 if x.ndim == 1 else 2, dur=round(len(x) / SR, 2),
                      peak_db=round(db(np.abs(x).max()), 1), lmax_k=round(lk, 1), lmax_z=round(lz, 1),
                      lufs=round(integrated_lufs(xs), 1), dc=float(np.abs(xs.mean(axis=0)).max()),
                      ms=int(el * 1000), nan=bool(np.isnan(x).any()), bands=octave_bands(x))
            if kind == "bed":
                st["rt_factor"] = round(args.bed_dur / max(el, 1e-6), 1)
            stats.append(st)
            sf.write(os.path.join(out_wav, label.replace("@", "__") + ".wav"), xs, SR, subtype="PCM_16")
            items.append((label, x, f"{st['dur']}s pk{st['peak_db']} {st['ms']}ms"))
        for i in range(0, len(items), args.per_sheet):
            p = os.path.join(out_qa, f"{kind}_{i // args.per_sheet + 1:02d}.png")
            sheet(items[i:i + args.per_sheet], p)
            print("sheet", p)
    with open(os.path.join(out_qa, "stats.json"), "w") as f:
        json.dump(stats, f, indent=1)
    print(f"{'label':24} {'ch':>2} {'dur':>6} {'peak':>6} {'LmaxK':>6} {'LmaxZ':>6} {'LUFS':>6} {'dc':>8} {'ms':>6}  bands dB: <125 250 500 1k 2k 4k 8k >8k")
    for s in stats:
        if "error" in s:
            print(f"{s['label']:24} ERROR {s['error']}")
            continue
        extra = f" x{s['rt_factor']}rt" if "rt_factor" in s else ""
        print(f"{s['label']:24} {s['ch']:>2} {s['dur']:>6} {s['peak_db']:>6} {s['lmax_k']:>6} {s['lmax_z']:>6} {s['lufs']:>6} {s['dc']:>8.1e} {s['ms']:>6}  {' '.join(f'{b:>4}' for b in s['bands'])}{extra}{' NAN' if s['nan'] else ''}")


if __name__ == "__main__":
    main()
