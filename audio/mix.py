"""Soundtrack mix for "The Last Pets on Earth": narration + ambience beds + sound cues + score -> one master WAV.

    node src/cli/timeline.js                                   # build/timeline.json from the scene files
    .venv-tts/bin/python audio/mix.py [--from 0 --to 60] [--out build/audio/mix.wav] [--lufs -15]

Inputs: build/timeline.json (beds, sfx cues, narration starts, markers), build/audio/narration.json + line WAVs
(audio/tts/narrate.py), build/audio/parrot/*.wav (used by `parrot_talk` cues). The score comes from audio/music.py.
Levels follow audio/lpaudio/registry.py: narration bus at REF_LUFS, cue gain_db relative to the narrator.
Rendered beds/cues are cached in build/audio/cache, so re-mixing after small timeline edits is quick.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import music  # noqa: E402
from lpaudio import registry  # noqa: E402
from lpaudio.cache import DiskCache  # noqa: E402
from lpaudio.dsp import SR, F32, eq_peak, fade, hp, pan, place, stable_seed, undb  # noqa: E402
from lpaudio.dynamics import compressor_gain, deess_gain, integrated_lufs, limiter_gain, true_peak_db  # noqa: E402

T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)


def load_wav(path):
    x, sr = sf.read(path, dtype="float32", always_2d=False)
    if x.ndim == 2:
        x = x.mean(axis=1)
    if sr != SR:
        g = np.gcd(sr, SR)
        x = signal.resample_poly(x, SR // g, sr // g).astype(F32)
    return x


def gain_to(x, target_lufs):
    lu = integrated_lufs(x)
    return (x * undb(target_lufs - lu)).astype(F32) if lu > -100 else x


def activity(x, attack=0.08, release=0.7, gate_db=-42.0):
    """0..1 envelope of where the narrator is speaking (for ducking)."""
    m = np.abs(x if x.ndim == 1 else x.mean(axis=1)).astype(np.float64)
    w = int(0.05 * SR)
    p = np.sqrt(np.convolve(m * m, np.ones(w) / w, mode="same"))
    on = (20 * np.log10(np.maximum(p, 1e-9)) > gate_db).astype(np.float64)
    # hold short gaps between words / sentences
    hold = int(0.45 * SR)
    on = np.convolve(on, np.ones(hold), mode="same") > 0
    on = on.astype(np.float64)
    a = np.exp(-1.0 / (attack * SR))
    r = np.exp(-1.0 / (release * SR))
    up = signal.lfilter([1 - a], [1, -a], on)
    down = signal.lfilter([1 - r], [1, -r], on)
    return np.clip(np.maximum(up, down), 0, 1).astype(F32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeline", default=os.path.join(ROOT, "build", "timeline.json"))
    ap.add_argument("--from", dest="t_from", type=float, default=0.0)
    ap.add_argument("--to", dest="t_to", type=float, default=None)
    ap.add_argument("--out", default=os.path.join(ROOT, "build", "audio", "mix.wav"))
    ap.add_argument("--lufs", type=float, default=-15.0)
    ap.add_argument("--music-lufs", type=float, default=-25.0, help="score level before ducking (narration = -18)")
    ap.add_argument("--stems", action="store_true")
    a = ap.parse_args()

    tl = json.load(open(a.timeline))
    dur_film = float(tl["duration"])
    t_from, t_to = a.t_from, (a.t_to if a.t_to is not None else dur_film)
    n = int(round((t_to - t_from) * SR))
    off = int(round(t_from * SR))
    cache = DiskCache(os.path.join(ROOT, "build", "audio", "cache"))
    missing = []

    # ---- narration ----
    narr = np.zeros(n, dtype=F32)
    nj_path = os.path.join(ROOT, "build", "audio", "narration.json")
    nj = json.load(open(nj_path)) if os.path.exists(nj_path) else {"lines": {}}
    placed = 0
    for ln in tl["narration"]:
        meta = nj["lines"].get(ln["id"])
        if not meta:
            missing.append(f"narration {ln['id']}")
            continue
        x = load_wav(os.path.join(ROOT, meta["file"]))
        s = int(round(ln["start"] * SR)) - off
        if s + len(x) < 0 or s > n:
            continue
        place(narr, x, s)
        placed += 1
    log(f"narration: {placed} lines placed")
    if placed:
        narr = hp(narr, 75.0, 2)
        band, g = deess_gain(narr, thresh_db=-34.0, max_red_db=5.0)
        narr = (narr + band * (g - 1.0)).astype(F32)
        narr = eq_peak(narr, 3200.0, 1.5, 0.9)
        narr = gain_to(narr, registry.REF_LUFS)
        narr = (narr * compressor_gain(narr, -26.0, ratio=2.2, knee_db=8.0, attack=0.006, release_db_s=60.0)).astype(F32)
        narr = gain_to(narr, registry.REF_LUFS)
    duck = activity(narr) if placed else np.zeros(n, dtype=F32)

    # ---- beds ----
    beds = np.zeros((n, 2), dtype=F32)
    for i, b in enumerate(tl["beds"]):
        s0, s1 = float(b["start"]), float(b["end"])
        if s1 <= t_from or s0 >= t_to or b["type"] not in registry.BEDS:
            if b["type"] not in registry.BEDS:
                missing.append(f"bed {b['type']}")
            continue
        d = s1 - s0
        x = registry.render_bed(b["type"], d, b.get("params", {}), stable_seed("bed", b["type"], round(s0, 2)), cache, log)
        x = x[: int(d * SR)]
        x = fade(x, float(b.get("fade_in", 1.2)), float(b.get("fade_out", 1.2)))
        place(beds, x, int(round(s0 * SR)) - off, undb(float(b.get("gain_db", -22.0))))
    log(f"beds: {len(tl['beds'])}")

    # ---- one-shot cues ----
    sfx = np.zeros((n, 2), dtype=F32)
    cnt = 0
    for i, e in enumerate(tl["sfx"]):
        t = float(e["t"])
        if t < t_from - 8 or t > t_to:
            continue
        if e["type"] not in registry.ONESHOTS:
            missing.append(f"sfx {e['type']}")
            continue
        try:
            x, pre = registry.render_oneshot(e["type"], e.get("params", {}), stable_seed("sfx", e["type"], round(t, 3), i), cache, ROOT)
        except Exception as ex:  # a broken generator must not sink the whole mix
            missing.append(f"sfx {e['type']} failed: {ex}")
            continue
        x = pan(x, float(e.get("pan", 0.0)))
        place(sfx, x, int(round((t - pre) * SR)) - off, undb(float(e.get("gain_db", -12.0))))
        cnt += 1
    log(f"sfx: {cnt} cues")

    # ---- score ----
    full = music.render_score(tl, dur_film, log)
    mus = np.zeros((n, 2), dtype=F32)
    place(mus, full, -off)
    mus = gain_to(mus, a.music_lufs)
    mus *= (1.0 - (1.0 - undb(-6.0)) * duck)[:, None]
    beds *= (1.0 - (1.0 - undb(-2.5)) * duck)[:, None]

    # ---- master ----
    mix = beds + sfx + mus
    mix[:, 0] += narr
    mix[:, 1] += narr
    mix = hp(mix, 25.0, 2)
    lu = integrated_lufs(mix)
    mix = mix * undb(-18.0 - lu)
    mix = mix * compressor_gain(mix, -14.0, ratio=1.8, knee_db=8.0, attack=0.02, release_db_s=40.0)[:, None]
    mix = gain_to(mix, a.lufs)
    for _ in range(2):
        mix = (mix * limiter_gain(mix, ceiling_db=-1.2)[:, None]).astype(F32)
    lu, tp = integrated_lufs(mix), true_peak_db(mix)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    sf.write(a.out, np.clip(mix, -1.0, 1.0), SR, subtype="PCM_24")
    if a.stems:
        base = os.path.splitext(a.out)[0]
        for name, x in (("narration", narr), ("beds", beds), ("sfx", sfx), ("music", mus)):
            sf.write(f"{base}_{name}.wav", np.clip(x, -1, 1), SR, subtype="PCM_24")
    log(f"wrote {a.out}: {n / SR:.1f}s  {lu:.1f} LUFS  true peak {tp:.1f} dBTP  (cache hits {cache.hits}, renders {cache.misses})")
    if missing:
        uniq = sorted(set(missing))
        log(f"WARN {len(missing)} missing/failed items: {', '.join(uniq[:12])}{' ...' if len(uniq) > 12 else ''}")


if __name__ == "__main__":
    main()
