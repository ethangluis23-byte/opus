"""Procedural score for "The Last Pets on Earth": soft piano, string pad, plucks, bells, low pulses.

    .venv-tts/bin/python audio/music.py [--timeline build/timeline.json] [--out build/audio/music.wav]

The film is ten fixed 60 s scenes. Cue boundaries are written as film seconds or as narration anchors
('2.4' = start of line 2.4, '2.4+1.5', 'm:vanish' = timeline marker), so the score follows the narration.
A recurring "bond" theme opens the film, returns for the photograph (scene 8) and carries the finale.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from lpaudio.beds import _polyblep_saw  # noqa: E402
from lpaudio.dsp import SR, F32, make_rng, pan_gains, place, reverb  # noqa: E402

NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7,
        "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
QUAL = {"": [0, 4, 7], "m": [0, 3, 7], "sus2": [0, 2, 7], "sus4": [0, 5, 7], "add9": [0, 4, 7, 14],
        "madd9": [0, 3, 7, 14], "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10], "dim": [0, 3, 6],
        "6": [0, 4, 7, 9], "5": [0, 7]}

# The bond theme in C major: (scale offset from the tonic, beats). Eight 4/4 bars.
THEME = [[(4, 1), (7, 1), (9, 2)], [(7, 1), (4, 1), (2, 2)], [(4, 1), (7, 1), (12, 1), (11, 1)], [(9, 3), (7, 1)],
         [(4, 1), (7, 1), (9, 2)], [(7, 1), (4, 1), (2, 1), (0, 1)], [(2, 2), (4, 1), (2, 1)], [(0, 4)]]
THEME_CHORDS = ["C", "Am", "F", "G", "C", "Am", "G", "C"]
MINOR_MAP = {4: 3, 9: 8, 11: 10, 16: 15, 21: 20}


def mtof(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def chord(sym):
    """'Am' -> (root pitch class, pitch classes, bass pitch class); supports slash chords 'C/E'."""
    bass = None
    if "/" in sym:
        sym, b = sym.split("/")
        bass = NOTE[b]
    root = sym[:2] if len(sym) > 1 and sym[1] in "#b" else sym[:1]
    r = NOTE[root]
    pcs = [r + i for i in QUAL[sym[len(root):]]]
    return r, pcs, (r if bass is None else bass)


def voicing(pcs, lo, hi):
    out = []
    for p in pcs:
        m = lo + ((p - lo) % 12)
        while m > hi:
            m -= 12
        out.append(m)
    return sorted(set(out))


# ------------------------------------------------------------------ instruments ---

_piano_cache = {}


def piano(m, vel, dur):
    """Additive piano tone: inharmonic partials, two-stage decay, string-pair beating, hammer, damper."""
    key = (int(m), round(vel * 10), round(min(dur, 6.0) * 4))
    if key in _piano_cache:
        return _piano_cache[key]
    rng = make_rng("piano", *key)
    dur = key[2] / 4.0
    f0 = mtof(m)
    tau0 = float(np.clip(3.6 * (261.6 / f0) ** 0.6, 0.45, 7.0))
    n = int((dur + 0.6) * SR) if dur < tau0 * 3 else int(tau0 * 3.2 * SR)
    n = max(n, int(0.3 * SR))
    x = np.zeros(n)
    B = 0.0004 * (1.0 + max(0, m - 60) / 30.0)
    bright = 0.45 + 0.55 * vel
    for k in range(1, 9):
        fk = k * f0 * np.sqrt(1.0 + B * k * k)
        if fk > 14000:
            break
        tau = tau0 / (1.0 + 0.6 * (k - 1))
        L = min(n, int(tau * 6.5 * SR) + 1)
        t = np.arange(L) / SR
        env = 0.55 * np.exp(-t / (0.22 * tau)) + 0.45 * np.exp(-t / tau)
        amp = 1.0 / k ** (2.1 - 1.0 * bright)
        ph = rng.uniform(0, 2 * np.pi)
        w = np.sin(2 * np.pi * fk * t + ph)
        if k <= 2:
            w = 0.62 * w + 0.38 * np.sin(2 * np.pi * fk * 1.0009 * t + ph + 1.1)
        x[:L] += amp * env * w
    h = int(0.025 * SR)
    hn = rng.standard_normal(h) * np.exp(-np.arange(h) / (0.003 * SR))
    hn = signal.sosfilt(signal.butter(2, [900, 4200], btype="band", fs=SR, output="sos"), hn)
    x[:h] += 0.05 * bright * hn
    a = int(0.0025 * SR)
    x[:a] *= np.linspace(0.0, 1.0, a)
    d0 = int(dur * SR)
    if d0 < n:
        x[d0:] *= np.exp(-np.arange(n - d0) / (0.16 * SR))
    y = (x * vel ** 1.4 * 0.32).astype(F32)
    _piano_cache[key] = y
    return y


def pluck(m, vel, dur=1.1):
    f0 = mtof(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k in range(1, 7):
        tau = 0.42 / (1.0 + 0.9 * (k - 1)) * (220.0 / f0) ** 0.25
        x += (1.0 / k ** 1.3) * np.exp(-t / tau) * np.sin(2 * np.pi * k * f0 * t)
    a = int(0.0015 * SR)
    x[:a] *= np.linspace(0.0, 1.0, a)
    return (x * vel * 0.30).astype(F32)


def bell(m, vel):
    f0 = mtof(m)
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for r, a, tau in ((1.0, 1.0, 1.4), (2.756, 0.32, 0.55), (5.404, 0.12, 0.22), (2.0, 0.18, 0.9)):
        if f0 * r < 16000:
            x += a * np.exp(-t / tau) * np.sin(2 * np.pi * f0 * r * t)
    a = int(0.002 * SR)
    x[:a] *= np.linspace(0.0, 1.0, a)
    return (x * vel * 0.16).astype(F32)


def thump(vel):
    """Soft low heartbeat / timpani-like pulse."""
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    f = 52.0 * (1.0 + 1.2 * np.exp(-t / 0.035))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2)
    return (x * vel * 0.55).astype(F32)


def pad(notes, dur, level, seed, bright=1800.0, attack=1.6, release=2.2, swell=False):
    """Warm string pad: three detuned band-limited saws per note, slow vibrato, low-passed, spread in stereo."""
    rng = make_rng("pad", seed)
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for m in notes:
        f0 = mtof(m)
        for det, pn in ((-0.0045, -0.7), (0.0, 0.0), (0.005, 0.7)):
            vib = 1.0 + 0.0022 * np.sin(2 * np.pi * rng.uniform(4.3, 5.4) * t + rng.uniform(0, 6.28))
            s = _polyblep_saw(f0 * (1.0 + det) * vib).astype(np.float64)
            gl, gr = pan_gains(pn)
            out[:, 0] += s * gl
            out[:, 1] += s * gr
    sos = signal.butter(2, bright, btype="low", fs=SR, output="sos")
    out = signal.sosfilt(sos, out, axis=0)
    out = signal.sosfilt(signal.butter(1, 90.0, btype="high", fs=SR, output="sos"), out, axis=0)
    env = np.ones(n)
    na = min(n, int(attack * SR))
    env[:na] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, na))
    d0 = int(dur * SR)
    if d0 < n:
        env[d0:] *= np.exp(-np.arange(n - d0) / (release / 4.0 * SR))
    if swell:
        env[:d0] *= np.linspace(0.25, 1.0, d0) ** 1.6
    return (out * env[:, None] * level * 0.11 / max(1.0, len(notes) ** 0.5)).astype(F32)


# --------------------------------------------------------------- arrangement ---

def S(n, rel):
    return (n - 1) * 60.0 + rel


# Each cue: (start, end, bpm, chords (one per bar, cycled), textures, options).
# textures: pad=(level, lo, hi, bright), piano=('theme'|'motif'|'arp'|'chords'|'sparse', level), bass=level,
#           pluck=('8ths'|'quarters'|'staccato'|'clock', level), pulse=level, drone=level, bell=level.
# options: key (semitone transpose of the theme), minor (theme in minor), fin, fout, cut (hard stop), swell.
CUES = [
    # 1 — the day humans disappeared
    (0.0, "m:vanish", 76, THEME_CHORDS, dict(pad=(0.45, 52, 72, 1700), piano=("theme", 0.72), bass=0.42, bell=0.18), dict(fin=1.5, cut=True)),
    (28.0, "1.9-0.6", 60, ["Am", "F", "C", "G"], dict(pad=(0.32, 50, 69, 1150), piano=("sparse", 0.55), drone=0.22), dict(fin=3.5, fout=0.8)),
    ("1.9-0.6", "m:main_title", 60, ["Fadd9"], dict(pad=(0.85, 48, 72, 2300)), dict(swell=True, cut=True)),
    ("m:main_title", 60.0, 60, ["Cadd9"], dict(pad=(0.9, 48, 76, 2600), piano=("chords", 0.6), drone=0.5, bell=0.35), dict(fout=1.6)),
    # 2 — the first 24 hours
    (60.3, "2.2", 66, ["Dm", "Bb", "F", "A"], dict(pad=(0.38, 50, 69, 1500), piano=("sparse", 0.45), pluck=("clock", 0.22)), dict(fin=2.0)),
    ("2.2", "2.4", 60, ["Gm", "Dm", "Eb", "A"], dict(pad=(0.42, 48, 67, 1100), drone=0.32, pulse=0.30), dict(fin=1.0)),
    ("2.4", "2.5", 80, ["Dm", "C", "Bb", "A"], dict(pad=(0.4, 50, 69, 1400), piano=("chords", 0.36), pulse=0.38), {}),
    ("2.5", "2.6", 92, ["Dm", "Bb", "Gm", "A"], dict(pad=(0.3, 50, 69, 1600), pluck=("8ths", 0.34), bell=0.22), {}),
    ("2.6", "2.7", 62, ["Bb", "Gm", "Eb", "D"], dict(pad=(0.4, 60, 79, 2300), piano=("sparse", 0.42), drone=0.3), {}),
    ("2.7", 116.6, 72, ["Gsus2", "D"], dict(pad=(0.45, 52, 72, 2000), piano=("arp", 0.4), bell=0.28), dict(fout=0.4)),
    (116.6, 120.0, 60, ["Dsus4"], dict(pad=(0.5, 50, 74, 2400)), dict(swell=True, cut=True)),
    # 3 — after 7 days
    (120.3, "3.3", 84, ["Em", "C", "G", "D"], dict(pad=(0.33, 52, 71, 1600), pluck=("8ths", 0.34), bass=0.36, piano=("sparse", 0.3)), dict(fin=1.5)),
    ("3.3", "3.4", 100, ["Em", "F"], dict(pad=(0.3, 48, 67, 1100), pulse=0.4, pluck=("staccato", 0.3)), {}),
    ("3.4", "3.6", 84, ["C", "G", "Am", "Em"], dict(pad=(0.35, 52, 71, 1800), pluck=("8ths", 0.3), piano=("chords", 0.3)), {}),
    ("3.6", "3.7", 76, ["G", "D", "Em", "C"], dict(pad=(0.4, 55, 74, 2600), piano=("arp", 0.45), bell=0.32), {}),
    ("3.7", 176.6, 60, ["Em", "Cmaj7", "Am", "B"], dict(pad=(0.4, 47, 67, 1000), piano=("sparse", 0.45), drone=0.3), dict(fin=1.5, fout=0.4)),
    (176.6, 180.0, 60, ["Bsus4"], dict(pad=(0.5, 50, 74, 2400)), dict(swell=True, cut=True)),
    # 4 — after 1 year
    (180.3, "4.3", 72, ["G", "D/F#", "Em", "C"], dict(pad=(0.42, 52, 72, 2100), piano=("arp", 0.5), bell=0.24, bass=0.34), dict(fin=1.5)),
    ("4.3", "4.4", 72, ["Em", "C", "Am", "D"], dict(pad=(0.35, 52, 71, 1700), piano=("chords", 0.34), pluck=("quarters", 0.25)), {}),
    ("4.4", "4.5", 60, ["Em", "Cmaj7"], dict(pad=(0.3, 47, 67, 1100), piano=("sparse", 0.45)), {}),
    ("4.5", "4.6", 96, ["G", "C", "G", "D"], dict(pad=(0.32, 55, 74, 2200), pluck=("8ths", 0.34), bell=0.28), {}),
    ("4.6", 236.6, 76, ["C", "G", "Am", "F"], dict(pad=(0.42, 52, 72, 2500), piano=("arp", 0.45), bell=0.3), dict(fout=0.4)),
    (236.6, 240.0, 60, ["Gsus4"], dict(pad=(0.5, 50, 74, 2400)), dict(swell=True, cut=True)),
    # 5 — after 5 years
    (240.3, "5.2", 66, ["Am", "F", "C", "E"], dict(pad=(0.4, 52, 71, 1700), piano=("sparse", 0.42)), dict(fin=1.5)),
    ("5.2", "5.4", 96, ["Am", "Bb"], dict(pad=(0.34, 45, 64, 1000), pulse=0.45, drone=0.38, pluck=("staccato", 0.3)), {}),
    ("5.4", "5.5", 60, ["Dm", "Am"], dict(pad=(0.3, 50, 69, 1300), piano=("sparse", 0.32), bell=0.15), {}),
    ("5.5", "5.7", 84, ["F", "C", "Dm", "Am"], dict(pad=(0.35, 52, 71, 1800), pluck=("8ths", 0.3)), {}),
    ("5.7", 296.6, 60, THEME_CHORDS, dict(pad=(0.33, 50, 69, 1300), piano=("motif", 0.58)), dict(key=-3, minor=True, fout=0.4)),
    (296.6, 300.0, 60, ["Esus4"], dict(pad=(0.5, 50, 74, 2400)), dict(swell=True, cut=True)),
    # 6 — after 20 years
    (300.3, "6.2", 70, ["F", "C/E", "Dm", "Bb"], dict(pad=(0.4, 53, 72, 2000), piano=("arp", 0.45), bell=0.3), dict(fin=1.5)),
    ("6.2", "6.3", 104, ["Dm", "Bb", "F", "C"], dict(pad=(0.35, 50, 69, 1700), pluck=("8ths", 0.35), pulse=0.24), {}),
    ("6.3", "6.4", 66, ["Dm", "Gm", "A", "Dm"], dict(pad=(0.35, 50, 69, 1400), piano=("chords", 0.3), drone=0.25), {}),
    ("6.4", "6.6", 84, ["F", "G", "Am", "C"], dict(pad=(0.33, 53, 72, 2000), pluck=("quarters", 0.3), bell=0.24), {}),
    ("6.6", 356.6, 64, THEME_CHORDS, dict(pad=(0.45, 53, 74, 2200), piano=("motif", 0.55), bell=0.3), dict(key=5, fout=0.4)),
    (356.6, 360.0, 60, ["Csus4"], dict(pad=(0.5, 50, 74, 2400)), dict(swell=True, cut=True)),
    # 7 — after 50 years
    (360.3, "7.3", 66, ["D", "A/C#", "Bm", "G"], dict(pad=(0.44, 50, 71, 1900), piano=("chords", 0.34), bass=0.34), dict(fin=1.5)),
    ("7.3", "7.4", 120, ["Bm", "G", "D", "A"], dict(pad=(0.4, 50, 71, 2400), pulse=0.4, pluck=("8ths", 0.4)), {}),
    ("7.4", "7.5", 92, ["Em", "Bm"], dict(pad=(0.3, 47, 66, 1300), pluck=("staccato", 0.34)), {}),
    ("7.5", "7.7", 72, ["G", "D", "Em", "C"], dict(pad=(0.35, 52, 71, 1900), piano=("arp", 0.35)), {}),
    ("7.7", 416.6, 70, ["D", "A", "Bm", "G"], dict(pad=(0.55, 50, 74, 3000), piano=("arp", 0.4), bell=0.3, drone=0.3), dict(fout=0.4)),
    (416.6, 420.0, 60, ["Asus4"], dict(pad=(0.5, 50, 74, 2400)), dict(swell=True, cut=True)),
    # 8 — after 100 years
    (420.3, "8.3", 60, ["Cm", "Ab", "Eb", "Bb"], dict(pad=(0.45, 48, 69, 1200), drone=0.4, piano=("sparse", 0.35)), dict(fin=1.5)),
    ("8.3", "8.4-1.5", 66, ["Ab", "Eb", "Fm", "G"], dict(pad=(0.3, 48, 69, 1300), piano=("sparse", 0.34)), dict(fout=3.0)),
    ("8.4", "8.5", 56, ["Cm", "Ab"], dict(pad=(0.24, 48, 67, 1000), piano=("sparse", 0.38)), dict(fin=2.0)),
    ("8.5", "8.6", 64, THEME_CHORDS, dict(pad=(0.4, 52, 74, 2400), piano=("motif", 0.55), bell=0.4), dict(fin=0.8)),
    ("8.6", 476.6, 60, ["Am", "F", "C", "G"], dict(pad=(0.35, 50, 69, 1400), piano=("sparse", 0.4)), dict(fout=0.4)),
    (476.6, 480.0, 60, ["Gsus4"], dict(pad=(0.5, 50, 74, 2400)), dict(swell=True, cut=True)),
    # 9 — after 200 years
    (480.3, "9.4", 60, ["C", "D/C", "C", "D/C", "Am", "G"], dict(pad=(0.55, 48, 74, 2800), piano=("arp", 0.34), bell=0.3, drone=0.35), dict(fin=2.0)),
    ("9.4", "9.5", 96, ["Am", "F", "C", "G"], dict(pad=(0.4, 50, 71, 2000), pluck=("8ths", 0.35), pulse=0.2), {}),
    ("9.5", "9.6", 66, ["F", "G", "Em", "Am"], dict(pad=(0.45, 50, 72, 2200), piano=("chords", 0.34), bell=0.25), {}),
    ("9.6", 532.0, 60, THEME_CHORDS, dict(pad=(0.35, 50, 70, 1600), piano=("motif", 0.5)), {}),
    (532.0, 540.0, 56, ["F", "C"], dict(pad=(0.45, 48, 72, 2000), piano=("sparse", 0.35)), dict(fout=3.0)),
    # 10 — the last memory (soft piano)
    (540.5, "10.4", 66, THEME_CHORDS, dict(piano=("theme", 0.6), bass=0.38), dict(fin=0.5)),
    ("10.4", "10.5", 66, ["F", "C/E", "Dm", "G"], dict(pad=(0.33, 52, 72, 1900), piano=("arp", 0.42), bell=0.3), dict(fin=1.0)),
    ("10.5", "10.6", 76, ["C", "G", "Am", "F"], dict(piano=("arp", 0.45), bass=0.34), {}),
    ("10.6", "10.9", 66, ["F", "G", "Em", "Am"], dict(pad=(0.3, 52, 71, 1700), piano=("chords", 0.34)), {}),
    ("10.9", 599.6, 62, THEME_CHORDS, dict(pad=(0.38, 50, 72, 1800), piano=("theme", 0.6), bass=0.36), dict(fout=4.0)),
]


class Anchors:
    def __init__(self, timeline):
        self.nar = {x["id"]: float(x["start"]) for x in (timeline or {}).get("narration", [])}
        self.mk = {k: float(v) for k, v in (timeline or {}).get("markers", {}).items()}

    def t(self, v):
        if isinstance(v, (int, float)):
            return float(v)
        m = re.match(r"^(m:)?([\w.]+?)([+-][\d.]+)?$", v)
        base, off = m.group(2), float(m.group(3) or 0.0)
        if m.group(1):
            return self.mk[base] + off
        if base in self.nar:
            return self.nar[base] + off
        # narration not measured yet: fall back to the scene's rough position
        sc = int(base.split(".")[0])
        return S(sc, 8.0) + off


def render_cue(i, t0, t1, bpm, chords, tex, opt):
    dur = t1 - t0
    if dur <= 0.2:
        return None, 0
    rng = make_rng("cue", i)
    beat = 60.0 / bpm
    bar = 4 * beat
    nbars = int(np.ceil(dur / bar)) + 1
    tail = 3.0
    n = int((dur + tail) * SR)
    buf = np.zeros((n, 2), dtype=F32)
    key = opt.get("key", 0)
    minor = opt.get("minor", False)

    def add(x, t, p=0.0, g=1.0):
        if t >= dur or x is None:
            return
        gl, gr = pan_gains(p)
        s = int(t * SR)
        place(buf, np.stack([x * gl, x * gr], axis=1) if x.ndim == 1 else x, s, g)

    if minor:
        chords = [{"C": "Cm", "Am": "Ab", "F": "Fm", "G": "G"}.get(c, c) for c in chords]
    chords = [transpose(c, key) for c in chords]
    for b in range(nbars):
        tb = b * bar
        if tb >= dur:
            break
        sym = chords[b % len(chords)]
        root, pcs, bass_pc = chord(sym)
        if "pad" in tex:
            lv, lo, hi, br = tex["pad"]
            notes = voicing(pcs, lo, hi)
            pd = min(bar + 0.6, dur - tb + 0.3)
            if opt.get("swell"):
                pd = dur - tb
            x = pad(notes, pd, lv, (i, b), bright=br, attack=min(1.6, pd * 0.4), release=2.0, swell=opt.get("swell", False))
            add(x, tb)
            if opt.get("swell"):
                break
    for b in range(nbars):
        tb = b * bar
        if tb >= dur:
            break
        sym = chords[b % len(chords)]
        root, pcs, bass_pc = chord(sym)
        if "bass" in tex:
            m = 36 + ((bass_pc - 36) % 12)
            add(piano(m, tex["bass"], bar * 0.95), tb, -0.25)
            add(piano(m + 7 if (m + 7) < 55 else m - 5, tex["bass"] * 0.7, bar * 0.45), tb + 2 * beat, -0.25)
        if "drone" in tex and b == 0:
            m = 36 + ((root - 36) % 12)
            x = pad([m, m + 12], dur, tex["drone"] * 1.6, (i, "drone"), bright=520, attack=2.0, release=2.5)
            add(x, 0.0)
        if "piano" in tex:
            mode, lv = tex["piano"]
            if mode in ("theme", "motif"):
                if mode == "motif" and b >= 4:
                    notes = voicing(pcs, 67, 84)
                    if rng.random() < 0.7:
                        add(piano(int(rng.choice(notes)), lv * 0.6, bar * 1.5), tb + beat * float(rng.choice([0, 1, 2])), 0.2)
                else:
                    tt = tb
                    for off, beats in THEME[b % len(THEME)]:
                        if minor:
                            off = MINOR_MAP.get(off, off)
                        m = 60 + key + off
                        while m > 79:
                            m -= 12
                        while m < 58:
                            m += 12
                        add(piano(m, lv * (1.0 if tt == tb else 0.86), beats * beat * 1.15), tt, 0.15)
                        tt += beats * beat
                    for k, m in enumerate(voicing(pcs, 48, 60)):
                        add(piano(m, lv * 0.42, bar * 0.9), tb + k * 0.012, -0.15)
            elif mode == "arp":
                notes = voicing(pcs, 55, 76)
                seq = notes + notes[-2:0:-1]
                for k in range(8):
                    m = seq[k % len(seq)]
                    add(piano(m, lv * (1.0 if k == 0 else 0.8 + 0.1 * (k % 2)), beat * 1.6), tb + k * beat / 2, 0.1 * (k % 3 - 1))
            elif mode == "chords":
                for k, m in enumerate(voicing(pcs, 52, 72)):
                    add(piano(m, lv, bar * 0.95), tb + k * 0.015, 0.0)
                for k, m in enumerate(voicing(pcs, 55, 72)):
                    add(piano(m, lv * 0.6, bar * 0.45), tb + 2 * beat + k * 0.012, 0.05)
            elif mode == "sparse":
                notes = voicing(pcs, 67, 86)
                for _ in range(1 + int(rng.random() < 0.45)):
                    m = int(rng.choice(notes))
                    add(piano(m, lv * float(rng.uniform(0.7, 1.0)), bar * 1.6), tb + beat * float(rng.choice([0, 1, 1.5, 2, 3])), float(rng.uniform(-0.4, 0.4)))
        if "pluck" in tex:
            mode, lv = tex["pluck"]
            lowv = voicing(pcs, 45, 64)
            pat = {"8ths": [0, 2, 1, 2, 0, 2, 1, 2], "quarters": [0, 1, 2, 1], "staccato": [0, 0, 1, 0], "clock": [0, 1, 0, 1]}[mode]
            step = {"8ths": beat / 2, "quarters": beat, "staccato": beat, "clock": beat}[mode]
            for k, idx in enumerate(pat):
                if mode == "clock":
                    m = 81 + (0 if idx == 0 else 5)
                    add(pluck(m, lv * 0.55, 0.25), tb + k * step, 0.35 if idx else -0.35)
                elif mode == "staccato":
                    m = lowv[min(idx, len(lowv) - 1)]
                    add(pluck(m, lv, 0.3), tb + k * step, -0.2)
                    add(pluck(m, lv * 0.7, 0.3), tb + k * step + step * 0.25, -0.2)
                else:
                    m = lowv[idx % len(lowv)]
                    add(pluck(m, lv * (1.0 if k % 4 == 0 else 0.78)), tb + k * step, -0.3 + 0.2 * (k % 3))
        if "pulse" in tex:
            for k in range(4):
                add(thump(tex["pulse"]), tb + k * beat, 0.0)
                if bpm < 90:
                    add(thump(tex["pulse"] * 0.55), tb + k * beat + 0.24, 0.0)
        if "bell" in tex:
            notes = voicing(pcs, 79, 96)
            for _ in range(int(rng.integers(0, 3))):
                add(bell(int(rng.choice(notes)), tex["bell"]), tb + beat * float(rng.choice([0.5, 1, 1.5, 2.5, 3])), float(rng.uniform(-0.6, 0.6)))

    # envelope: fades, optional hard stop at the cue end
    env = np.ones(n, dtype=F32)
    fin = opt.get("fin", 0.05)
    k = min(n, int(fin * SR))
    if k > 1:
        env[:k] = np.linspace(0.0, 1.0, k) ** 1.5
    e = int(dur * SR)
    if opt.get("cut"):
        c = int(0.05 * SR)
        env[max(0, e - c):e] *= np.linspace(1.0, 0.0, min(c, e))
        env[e:] = 0.0
    else:
        fo = opt.get("fout", 1.2)
        f = int(fo * SR)
        env[max(0, e - f):e] *= np.linspace(1.0, 0.25, min(f, e)) if fo < 2.5 else np.linspace(1.0, 0.0, min(f, e))
        env[e:] *= np.exp(-np.arange(n - e) / (0.8 * SR)).astype(F32) * (0.25 if fo < 2.5 else 0.0)
    return buf * env[:, None], int(t0 * SR)


def transpose(sym, k):
    if k == 0:
        return sym
    names = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
    base, slash = (sym.split("/") + [None])[:2]
    root = base[:2] if len(base) > 1 and base[1] in "#b" else base[:1]
    out = names[(NOTE[root] + k) % 12] + base[len(root):]
    if slash:
        out += "/" + names[(NOTE[slash] + k) % 12]
    return out


def render_score(timeline=None, duration=600.0, log=print):
    A = Anchors(timeline)
    n = int((duration + 4.0) * SR)
    bus = np.zeros((n, 2), dtype=F32)
    for i, (a, b, bpm, chords, tex, opt) in enumerate(CUES):
        t0, t1 = A.t(a), A.t(b)
        x, s = render_cue(i, t0, t1, bpm, chords, tex, opt)
        if x is not None:
            place(bus, x, s)
    log(f"score: {len(CUES)} cues, {len(_piano_cache)} piano tones; reverb...")
    wet = reverb(bus, "hall", wet=0.28, dry=1.0, tail=False)
    return wet[: int(duration * SR)].astype(F32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeline", default=os.path.join(ROOT, "build", "timeline.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "build", "audio", "music.wav"))
    a = ap.parse_args()
    tl = json.load(open(a.timeline)) if os.path.exists(a.timeline) else None
    y = render_score(tl, float((tl or {}).get("duration", 600.0)))
    import soundfile as sf
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    sf.write(a.out, y / max(1e-6, float(np.max(np.abs(y)))) * 0.89, SR, subtype="PCM_24")
    print("wrote", a.out, f"{len(y) / SR:.1f}s")


if __name__ == "__main__":
    main()
