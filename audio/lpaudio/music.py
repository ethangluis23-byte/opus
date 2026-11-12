"""Original score for "The Last Pets on Earth", written as code.

compose(spec) turns section times (derived from the film timeline) into a Score:
MIDI notes / expression for FluidR3_GM instruments plus events for a few
numpy-synthesised layers (pad, sub, pulse, low drum, tick).

Key: D minor / F major. One recurring 8-bar theme over Dm - Bb - F - C:
    A4 D5 E5 F5 | F5 . . D5 | C5 F5 G5 A5 | G5 . . E5 |   (question)
    A5 . G5 F5  | D5 . F5 D5 | C5 F5 A5 . | G5 . . E5 |   (answer)
The "nature" variant starts the same motif on F major (F - C - Dm - Bb).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

_PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
       "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def N(name: str) -> int:
    """'A4' -> 69, 'Bb2' -> 46."""
    i = 2 if len(name) > 2 and name[1] in "#b" else 1
    return 12 * (int(name[i:]) + 1) + _PC[name[:i]]


# chord name -> (bass pitch class, pitch classes; the first three are the triad used for low voicings)
CHORDS = {
    "Dm": ("D", "D F A"), "Dm9": ("D", "D F A E"), "Dm/C": ("C", "D F A"), "Dm/F": ("F", "D F A"),
    "D5": ("D", "D A D"), "Dsus2": ("D", "D E A"),
    "Bb": ("Bb", "Bb D F"), "Bbmaj7": ("Bb", "Bb D F A"), "Bbadd9": ("Bb", "Bb D F C"),
    "F": ("F", "F A C"), "Fadd9": ("F", "F A C G"), "F/A": ("A", "F A C"), "F/C": ("C", "F A C"),
    "C": ("C", "C E G"), "Csus": ("C", "C F G"), "C/E": ("E", "C E G"),
    "Gm": ("G", "G Bb D"), "Gm7": ("G", "G Bb D F"),
    "A": ("A", "A C# E"), "Asus": ("A", "A D E"), "A7sus": ("A", "A D E G"), "Am": ("A", "A C E"),
}


def pcs(ch, triad=False):
    p = [_PC[x] for x in CHORDS[ch][1].split()]
    return p[:3] if triad else p


def tones(ch, lo, hi, triad=False):
    s = set(pcs(ch, triad))
    return [m for m in range(int(lo), int(hi) + 1) if m % 12 in s]


def bass(ch, lo=33):
    b = _PC[CHORDS[ch][0]]
    m = int(lo)
    while m % 12 != b:
        m += 1
    return m


def near(ch, target, triad=False):
    return min(tones(ch, target - 9, target + 9, triad), key=lambda m: (abs(m - target), m))


def voices(ch, targets, triad=False):
    """One chord tone near each target, preferring pitch classes not used yet."""
    out, used = [], set()
    for tg in targets:
        cand = sorted(tones(ch, tg - 8, tg + 8, triad), key=lambda m: (abs(m - tg), m))
        pick = next((m for m in cand if m % 12 not in used and m not in out), None)
        if pick is None:
            pick = next((m for m in cand if m not in out), cand[0])
        out.append(pick)
        used.add(pick % 12)
    return out


# ------------------------------------------------------------ instruments ---

@dataclass
class Track:
    group: str
    program: int
    pan: float
    latency: float = 0.0   # schedule earlier to compensate slow sample attacks
    jitter: float = 0.006  # timing humanisation (s, std)


TRACKS = {
    "piano": Track("piano", 0, 0.0, 0.0, 0.008),
    "celesta": Track("keys", 8, 0.3), "harp": Track("keys", 46, -0.35, 0.0, 0.007),
    "pizz": Track("keys", 45, 0.1, 0.06), "glock": Track("keys", 9, 0.2),
    "vln1": Track("strings", 48, -0.38, 0.08), "vln2": Track("strings", 48, -0.15, 0.08),
    "vla": Track("strings", 48, 0.12, 0.08), "vc": Track("strings", 48, 0.32, 0.08),
    "cb": Track("strings", 43, 0.2, 0.06), "trem": Track("strings", 44, -0.05, 0.1),
    "ost": Track("strings", 48, 0.15, 0.08, 0.004), "ost_lo": Track("strings", 43, 0.22, 0.06, 0.004),
    "flute": Track("winds", 73, -0.12, 0.035), "oboe": Track("winds", 68, 0.05, 0.02),
    "clar": Track("winds", 71, 0.16, 0.04), "bsn": Track("winds", 70, 0.22, 0.02),
    "horn1": Track("brass", 60, -0.2, 0.06), "horn2": Track("brass", 60, -0.32, 0.06),
    "choir": Track("choir", 52, 0.0, 0.15), "oohs": Track("choir", 53, 0.0, 0.08),
    "timp": Track("perc", 47, 0.1, 0.0, 0.004),
}
GROUPS = ("piano", "keys", "strings", "winds", "brass", "choir", "perc")


@dataclass
class Score:
    seed: int = 0
    notes: list = field(default_factory=list)   # (track, t, dur, pitch, vel)
    exprs: dict = field(default_factory=dict)   # track -> [(t0, t1, [(t, val), ...])]
    pedals: list = field(default_factory=list)  # (track, t_down, t_up)
    synth: list = field(default_factory=list)   # (kind, t, dur, pitches/hz, level, kwargs)
    sections: list = field(default_factory=list)  # (name, t0, t1, target dB re narration)
    gates: list = field(default_factory=list)   # (t0, t1) windows where the dry signal is muted

    def __post_init__(self):
        self.rng = np.random.default_rng(self.seed)

    def note(self, tr, t, dur, pitch, vel, jit=None):
        j = TRACKS[tr].jitter if jit is None else jit
        t = max(0.0, float(t) + (self.rng.normal(0.0, j) if j > 0 else 0.0))
        v = int(np.clip(round(vel + self.rng.normal(0.0, 2.5)), 1, 127))
        self.notes.append((tr, t, max(0.03, float(dur)), int(pitch), v))

    def chord(self, tr, t, dur, pitches, vel, roll=0.0, vstep=0.0):
        for i, p in enumerate(pitches):
            self.note(tr, t + i * roll, dur - i * roll, p, vel + i * vstep)

    def expr(self, tr, pts):
        pts = sorted((float(a), float(b)) for a, b in pts)
        self.exprs.setdefault(tr, []).append((pts[0][0], pts[-1][0], pts))

    def pedal(self, tr, t0, t1):
        self.pedals.append((tr, float(t0), float(t1)))

    def syn(self, kind, t, dur, what, level, **kw):
        self.synth.append((kind, float(t), float(dur), what, float(level), kw))

    def section(self, name, t0, t1, target):
        self.sections.append((name, float(t0), float(t1), float(target)))


# ------------------------------------------------------------------ themes ---
# (bar, beat, beats, pitch)
THEME_A = [(0, 0, 1, "A4"), (0, 1, 1, "D5"), (0, 2, 1, "E5"), (0, 3, 1, "F5"), (1, 0, 3, "F5"), (1, 3, 1, "D5"),
           (2, 0, 1, "C5"), (2, 1, 1, "F5"), (2, 2, 1, "G5"), (2, 3, 1, "A5"), (3, 0, 3, "G5"), (3, 3, 1, "E5")]
THEME_B = [(0, 0, 2, "A5"), (0, 2, 1, "G5"), (0, 3, 1, "F5"), (1, 0, 2, "D5"), (1, 2, 1, "F5"), (1, 3, 1, "D5"),
           (2, 0, 1, "C5"), (2, 1, 1, "F5"), (2, 2, 2, "A5"), (3, 0, 3, "G5"), (3, 3, 1, "E5")]
THEME_LIFT = [(0, 0, 2, "A5"), (0, 2, 1, "G5"), (0, 3, 1, "F5"), (1, 0, 2, "D5"), (1, 2, 1, "F5"), (1, 3, 1, "G5"),
              (2, 0, 1, "E5"), (2, 1, 1, "G5"), (2, 2, 2, "C6")]
THEME_END = [(0, 0, 1, "D5"), (0, 1, 1, "F5"), (0, 2, 2, "Bb5"), (1, 0, 3, "A5"), (1, 3, 1, "G5"),
             (2, 0, 1, "Bb5"), (2, 1, 1, "A5"), (2, 2, 2, "G5")]
NAT_A = [(0, 0, 1, "C5"), (0, 1, 1, "F5"), (0, 2, 1, "G5"), (0, 3, 1, "A5"), (1, 0, 3, "G5"), (1, 3, 1, "E5"),
         (2, 0, 1, "A4"), (2, 1, 1, "D5"), (2, 2, 1, "E5"), (2, 3, 1, "F5"), (3, 0, 3, "F5"), (3, 3, 1, "D5")]
NAT_B = [(0, 0, 2, "A5"), (0, 2, 1, "G5"), (0, 3, 1, "F5"), (1, 0, 2, "E5"), (1, 2, 1, "G5"), (1, 3, 1, "E5"),
         (2, 0, 1, "D5"), (2, 1, 1, "F5"), (2, 2, 2, "Bb5"), (3, 0, 2, "A5"), (3, 2, 2, "G5")]
CH_THEME = ["Dm", "Bb", "F", "C"]
CH_NAT_A = ["F", "C", "Dm", "Bb"]
CH_NAT_B = ["F", "C", "Bb", "Csus"]
# scene 6, 3/4
WALTZ = [(0, 0, 1, "C5"), (0, 1, 1, "F5"), (0, 2, 1, "G5"), (1, 0, 2, "A5"), (1, 2, 1, "G5"),
         (2, 0, 1, "F5"), (2, 1, 1, "E5"), (2, 2, 1, "D5"), (3, 0, 2, "D5"), (3, 2, 1, "F5"),
         (4, 0, 1, "A4"), (4, 1, 1, "C5"), (4, 2, 1, "F5"), (5, 0, 2, "G5"), (5, 2, 1, "F5"),
         (6, 0, 2, "F5"), (6, 2, 1, "E5"), (7, 0, 1, "E5"), (7, 1, 1, "D5"), (7, 2, 1, "C5")]
CH_WALTZ = ["F", "C/E", "Dm", "Bb", "F/A", "Gm7", "Csus", "C"]


def mel(S, tr, notes, t0, bar, vel, bpb=4, octv=0, legato=0.97, bar0=0, cresc=0.0, accent=4.0):
    """Play (bar, beat, beats, pitch) notes; cresc adds velocity per bar."""
    beat = bar / bpb
    for b, bt, d, p in notes:
        v = vel + cresc * b + (accent if bt == 0 else 0.0) + (3.0 if d >= 2 else 0.0)
        S.note(tr, t0 + (b + bar0) * bar + bt * beat, d * beat * legato, N(p) + 12 * octv, v)


def lh_arp(S, tr, ch, t, bar, vel, steps=8):
    """Flowing open-voiced broken chord: root, 5th, 8ve, 10th, 12th and back."""
    b = bass(ch, 33)
    T = tones(ch, b, b + 31, triad=True)
    order = [0, 2, 3, 4, 5, 4, 3, 2] if steps == 8 else ([0, 2, 3, 4] if steps == 4 else [0, 2, 3, 4, 3, 2])
    st = bar / len(order)
    for i, k in enumerate(order):
        S.note(tr, t + i * st, st * (2.2 if i else 3.0), T[min(k, len(T) - 1)], vel + (5 if i == 0 else 0) - (2 if i % 2 else 0))


def harp_arp(S, ch, t, bar, vel, steps=8, lo=36):
    b = bass(ch, lo)
    T = tones(ch, b, b + 36, triad=True)
    half = steps // 2
    order = list(range(0, half + 1)) + list(range(half - 1, 0, -1))
    order = [min(2 * k if k else 0, len(T) - 1) if False else min(k + (1 if k > 0 else 0), len(T) - 1) for k in order][:steps]
    st = bar / steps
    for i, k in enumerate(order):
        S.note("harp", t + i * st, st * 2.5, T[k], vel + (6 if i == 0 else 0))


def pad(S, ch, t, dur, vel, tracks=("cb", "vc", "vla", "vln2"), top=None):
    """Sustained open-voiced strings chord. Returns the pitches used."""
    out = {}
    if "cb" in tracks:
        out["cb"] = bass(ch, 28)
    if "vc" in tracks:
        out["vc"] = bass(ch, 40) if "cb" not in tracks else near(ch, bass(ch, 40) + 7, triad=True)
    v = voices(ch, [57, 64, 72], triad=len(pcs(ch)) == 3)
    for tr, p in zip(("vla", "vln2", "vln1"), v):
        if tr in tracks:
            out[tr] = p
    if top is not None and "vln1" in tracks:
        out["vln1"] = top
    for tr, p in out.items():
        S.note(tr, t, dur, p, vel)
    return out


def swell(S, tracks, pts):
    for tr in tracks:
        S.expr(tr, pts)


# ---------------------------------------------------------------- sections ---

def sec_opening(S, t0, t1):
    """Mysterious, curious, quietly warm; tension over the last ~4 s; hard stop at t1."""
    dur = t1 - t0
    if dur < 5.0:
        return
    nb = max(3, int(round(dur / 2.4)))
    bar = dur / nb
    beat = bar / 4
    e8 = beat / 2
    tens = t1 - min(4.0, 0.35 * dur)
    cyc = ["Dm9", "Dm9", "Bbmaj7", "Bbmaj7", "Fadd9", "Fadd9", "Csus", "C"]
    swell(S, ("vla", "vc"), [(t0, 48), (tens, 64)])
    for i in range(nb):
        tb = t0 + i * bar
        if tb >= tens - 0.05:
            break
        ch = cyc[i % 8]
        lvl = min(1.0, 0.45 + 0.3 * i)
        if i % 2 == 0:
            pe = min(tb + 2 * bar, tens)
            S.syn("pad", tb, pe - tb + 0.8, voices(ch, [50, 57, 62, 65]), 0.5 * lvl)
            S.note("vla", tb, pe - tb, near(ch, 57), 46)
            S.note("vc", tb, pe - tb, bass(ch, 40), 44)
        T = tones(ch, bass(ch, 45), bass(ch, 45) + 20, triad=True)
        for k, idx in enumerate([0, 2, 1, 2, 3, 2, 1, 2]):
            tk = tb + k * e8
            if tk < tens:
                S.syn("pulse", tk, 0.5, T[min(idx, len(T) - 1)], (0.55 if k % 2 == 0 else 0.4) * lvl)
        if i >= 1:
            for bt in (1, 3):
                if tb + bt * beat < tens:
                    S.chord("pizz", tb + bt * beat, 0.3, voices(ch, [64, 69]), 50 + 2 * i)
        if i % 2 == 1 and tb + 2 * beat < tens:
            for k, p in enumerate(tones(ch, 48, 84)[:6]):
                S.note("harp", tb + 2 * beat + k * e8 / 2, 1.2, p, 50 + 2 * k)
        motif = {2: ["A5", "D6", "E6", "F6"], 6: ["C6", "F6", "G6", "A6"]}.get(i)
        if motif and tb + bar < tens:  # the theme, foreshadowed
            for k, p in enumerate(motif):
                S.note("celesta", tb + k * beat, beat * (2.5 if k == 3 else 1.0), N(p), 56 + 2 * k)
    d = t1 - tens
    S.expr("trem", [(tens, 26), (t1 - 0.05, 122)])
    for p in (57, 62, 64):
        S.note("trem", tens, d - 0.03, p, 78)
    S.note("trem", tens + d * 0.45, d * 0.55 - 0.03, 70, 82)
    S.note("trem", tens + d * 0.72, d * 0.28 - 0.03, 75, 86)
    S.expr("cb", [(tens, 40), (t1 - 0.05, 118)])
    S.note("cb", tens, d - 0.03, 33, 82)
    S.syn("sub", tens, d, 55.0, 0.7, attack=d * 0.95, release=0.01)
    t, k = tens, 0
    seq = [57, 64, 69, 64, 62, 69, 74, 69]
    while t < t1 - 0.06:
        S.syn("pulse", t, 0.4, seq[k % 8], 0.5 + 0.45 * (t - tens) / d)
        t += e8 if t < t1 - 1.25 else e8 / 2
        k += 1
    run = [74, 76, 77, 79, 81, 82, 84, 86, 88, 89, 91, 93, 94]
    tr0 = t1 - min(1.7, d * 0.5)
    st = (t1 - 0.07 - tr0) / len(run)
    for i, p in enumerate(run):
        S.note("celesta", tr0 + i * st, 0.22, p, 48 + 4 * i, jit=0.002)
        S.note("harp", tr0 + i * st, 0.3, p - 12, 46 + 4 * i, jit=0.002)
    S.gates.append((t1, t1 + 3.9))
    S.section("opening", t0, t1, -10.5)


def sec_theme1(S, t0, t1, title):
    """Main theme on solo piano after the vanish; strings join; lands on the title."""
    if t1 - t0 < 12.0:
        return t1
    bar = (title - t0) / 7.0 if title and 3.1 <= (title - t0) / 7.0 <= 5.2 and title < t1 else (t1 - t0) / 8.0
    t7 = t0 + 7 * bar
    chs = CH_THEME + ["Dm", "Bb", "C"]
    for i, ch in enumerate(chs):
        tb = t0 + i * bar
        lh_arp(S, "piano", ch, tb, bar, 42 + (0 if i < 4 else 5 * (i - 3)))
        S.pedal("piano", tb + 0.04, tb + bar - 0.05)
    mel(S, "piano", THEME_A, t0, bar, 64)
    mel(S, "piano", THEME_LIFT, t0, bar, 72, bar0=4, cresc=6.0)
    # arrival: open D minor, melody on top
    S.pedal("piano", t7 + 0.03, t1 + 1.5)
    S.chord("piano", t7, t1 - t7 + 1.5, [38, 45, 50, 57, 65, 69, 74], 80, roll=0.018, vstep=1.0)
    S.note("piano", t7 + 0.14, t1 - t7 + 1.0, 86, 92)
    # strings from bar 5
    ts = t0 + 4 * bar
    swell(S, ("cb", "vc", "vla", "vln2", "vln1"), [(ts, 28), (t0 + 6 * bar, 62), (t7, 100), (t7 + 1.5, 86), (t1 + 2.0, 60)])
    for i, ch in enumerate(["Dm", "Bb", "C"]):
        pad(S, ch, ts + i * bar, bar * 1.02, 58 + 6 * i, tracks=("vc", "vla", "vln2") if i < 2 else ("cb", "vc", "vla", "vln2"))
    pad(S, "Dm", t7, t1 - t7 + 2.0, 82, tracks=("cb", "vc", "vla", "vln2", "vln1"), top=74)
    for k, p in enumerate(tones("C", 48, 84)[:9]):  # harp sweeps up into the title
        S.note("harp", t7 - 9 * bar / 16 + k * bar / 16, 1.5, p, 52 + 4 * k)
    S.note("timp", t7, 1.5, 38, 72)
    S.syn("sub", t7, min(6.0, t1 - t7 + 1.5), 36.71, 0.55, attack=0.03, release=2.5)
    S.section("theme1", t0, t1, -9.5)
    return t1 + 2.0  # strings ring this far into the next scene


def sec_scene2(S, t0, t1, t_power):
    """First 24 hours: tender, then the power fails and it turns uneasy; ends anxious."""
    dur = t1 - t0
    tp = float(np.clip(t_power, t0 + 8.0, t1 - 14.0)) if dur > 30 else t0 + dur / 3
    nA = max(2, int(round((tp - t0) / 4.0)))
    barA = (tp - t0) / nA
    beat = barA / 4
    prog = ["Dm", "Bb", "Gm", "Asus"]
    frag = [[(0, 0, 1, "A4"), (0, 1, 1, "D5"), (0, 2, 1, "E5"), (0, 3, 1, "F5")], [(0, 0, 3, "F5"), (0, 3, 1, "D5")],
            [(0, 0, 2, "Bb4"), (0, 2, 2, "D5")], [(0, 0, 4, "E5")]]
    swell(S, ("vc", "vla"), [(t0 + 1.0, 40), (t0 + barA, 56), (tp - 0.4, 50), (tp + 1.2, 20)])
    for i in range(nA):
        tb = t0 + i * barA
        ch = prog[i % 4] if i < nA - 1 else "Asus"
        lh_arp(S, "piano", ch, tb, barA, 40, steps=8 if i % 2 == 0 else 6)
        S.pedal("piano", tb + 0.04, tb + barA - 0.05 if i < nA - 1 else tp + 1.4)
        mel(S, "piano", frag[i % 4] if i < nA - 1 else frag[3], tb, barA, 58)
        if tb >= t0 + 1.0:
            pad(S, ch, tb, barA * 1.02, 50, tracks=("vc", "vla"))
    # --- power is out: low drone, tremolo, heartbeat
    tc = t1 - 6.0
    S.syn("sub", tp + 0.3, t1 - tp - 0.3, 36.71, 0.5, attack=2.5, release=0.3)
    S.syn("sub", tp + 0.3, t1 - tp - 0.3, 73.42, 0.3, attack=3.5, release=0.3)
    S.expr("cb", [(tp + 0.5, 30), (tc, 62), (t1 - 0.1, 112)])
    S.note("cb", tp + 0.5, tc - tp - 0.5, 38, 64)
    S.note("cb", tc, t1 - tc - 0.06, 33, 78)
    S.expr("trem", [(tp + 1.0, 24), (tp + 6.0, 46), (tc, 66), (t1 - 0.1, 118)])
    S.note("trem", tp + 1.0, t1 - tp - 1.06, 62, 62)
    S.note("trem", tp + 1.0, t1 - tp - 1.06, 69, 62)
    mid = tp + 0.5 * (tc - tp)
    S.note("trem", mid, t1 - mid - 0.06, 75, 60)       # Eb: the b2 rub
    S.note("trem", tc, t1 - tc - 0.06, 61, 66)         # C#: leading tone below
    S.note("trem", tc + 3.0, t1 - tc - 3.06, 77, 72)
    S.note("trem", tc + 4.5, t1 - tc - 4.56, 82, 78)
    t = tp + 2.5
    while t < t1 - 0.3:  # heartbeat, slowly speeding up
        u = (t - tp) / (t1 - tp)
        lv = 0.3 + 0.55 * u
        S.syn("drum", t, 0.5, 52.0, lv)
        S.syn("drum", t + 0.27, 0.5, 46.0, lv * 0.7)
        t += 1.9 - 0.85 * u if t < t1 - 2.0 else 0.6
    seq = ["A5", "D6", "Eb6", "D6", "A5", "Bb5", "Eb6", "F6"]
    t, k = tp + 4.0, 0
    while t < tc - 1.0:  # the motif, bent out of shape
        S.note("celesta", t, 2.5, N(seq[k % 8]), 46 + 2 * (k % 3))
        S.note("piano", t + 0.02, 2.5, N(seq[k % 8]) - 12, 34)
        t += S.rng.uniform(2.6, 3.6)
        k += 1
    S.section("scene2a", t0, tp, -10.5)
    S.section("scene2b", tp, t1, -10.0)


_OST_MIN = [[0, 0, 3, 0, 2, 0, 3, 2], [0, 0, 3, 0, 5, 3, 2, -2]]
_OST_MAJ = [[0, 0, 4, 0, 2, 0, 4, 2], [0, 0, 4, 0, 7, 4, 2, -1]]
_OST_DOM = [[0, 0, 4, 0, 1, 0, 4, 1], [0, 0, 4, 0, 7, 4, 1, 0]]


def _ost_pattern(ch, k):
    return (_OST_DOM if ch in ("A", "Asus") else (_OST_MAJ if ch in ("Bb", "F", "C") else _OST_MIN))[k % 2]


def sec_scene3(S, t0, t1):
    """After 7 days: suspense / survival. Low string ostinato, pulse, sparse drums."""
    dur = t1 - t0
    nb = max(8, int(round(dur / 2.6)))
    bar = dur / nb
    beat = bar / 4
    e8 = beat / 2
    cyc = ["Dm", "Dm", "Bb", "Bb", "Gm", "Gm", "A", "A"]
    build = nb - 4
    S.syn("sub", t0, dur, 36.71, 0.45, attack=1.5, release=0.3)
    S.syn("drum", t0 + 0.02, 0.6, 50.0, 0.8)
    S.expr("ost", [(t0, 84), (t0 + build * bar, 96), (t1, 122)])
    S.expr("ost_lo", [(t0, 84), (t0 + build * bar, 96), (t1, 122)])
    for i in range(nb):
        tb = t0 + i * bar
        ch = cyc[i % 8] if i < nb - 1 else "A"
        root = bass(ch, 45)
        hot = max(0.0, (i - build) / 4.0)
        for k in range(4):  # soft quarter-note pulse
            S.syn("pulse", tb + k * beat, 0.35, root - 12, 0.5 + 0.2 * hot)
        if i >= 2:
            pat = _ost_pattern(ch, i)
            for k, iv in enumerate(pat):
                S.note("ost", tb + k * e8, e8 * 0.6, root + iv, (82 if k % 4 == 0 else 64) + 14 * hot)
                if k % 2 == 0:
                    S.note("ost_lo", tb + k * e8, e8 * 0.9, root + iv - 12, 72 + 12 * hot)
        if i >= 6:
            for k in range(16):  # faint sixteenth ticks for motion
                if k % 2 == 1:
                    S.syn("tick", tb + k * beat / 4, 0.05, k % 4 - 1.5, 0.1 + 0.12 * hot)
        if i >= 4 and i % 2 == 0:
            S.syn("drum", tb, 0.6, 48.0, 0.6 + 0.3 * hot)
        if i >= 4 and i % 4 == 3:
            S.syn("drum", tb + 3.5 * beat, 0.4, 58.0, 0.35)
            S.syn("drum", tb + 3.75 * beat, 0.4, 54.0, 0.45)
        if i >= 6 and i % 2 == 0:  # tremolo swells
            v = voices(ch, [69, 74, 77] if i < build else [74, 77, 81])
            te = min(tb + 2 * bar, t1 - 0.05)
            S.expr("trem", [(tb, 28), (tb + bar, 80 + 30 * hot), (te, 34 + 60 * hot)])
            for p in v:
                S.note("trem", tb, te - tb, p, 66 + 10 * hot)
        if i in (4, 12) and i < build:  # the motif, plucked
            for k, p in enumerate(["A4", "D5", "E5", "F5"]):
                S.note("pizz", tb + (4 + k) * e8, 0.3, N(p), 66)
                S.note("harp", tb + (4 + k) * e8, 0.8, N(p), 58)
    line = ["D3", "F3", "G3", "A3", "D4"]
    t = t0 + 10 * bar
    for k, p in enumerate(line):  # low horn line climbing through the second half
        te = min(t + 2 * bar, t1 - 0.05)
        if t >= te - 0.5:
            break
        S.expr("horn1", [(t, 50), (t + bar, 88), (te, 60 + 8 * k)])
        S.note("horn1", t, te - t, N(p), 62 + 4 * k)
        t += 2 * bar
    tl = t1 - bar
    for k in range(16):  # timpani roll into the cut
        S.note("timp", tl + k * bar / 16, 0.3, 33, 38 + 4 * k, jit=0.003)
    S.section("scene3", t0, t1, -9.0)


def sec_scene4(S, t0, t1):
    """After 1 year: wonder as nature returns. Broad strings, harp, hopeful."""
    dur = t1 - t0
    nb = max(10, int(round(dur / 3.53)))
    bar = dur / nb
    chords = ["Fadd9", "Fadd9"] + CH_NAT_A + CH_NAT_B + CH_NAT_A
    while len(chords) < nb:
        chords.append(["Bb", "Csus", "C"][(len(chords) - 14) % 3])
    chords = chords[:nb]
    hi = min(10, nb - 4)  # bar where the big restatement starts
    swell(S, ("cb", "vc", "vla", "vln2"), [(t0, 34), (t0 + 2 * bar, 66), (t0 + 6 * bar, 78), (t0 + hi * bar, 96),
                                             (t0 + (hi + 2.5) * bar, 110), (t0 + (hi + 4) * bar, 84), (t1 - 0.3, 96)])
    S.expr("vln1", [(t0 + 2 * bar, 60), (t0 + 6 * bar, 84), (t0 + hi * bar, 100), (t0 + (hi + 2.5) * bar, 116),
                    (t0 + (hi + 4) * bar, 84), (t1 - 0.3, 98)])
    for i, ch in enumerate(chords):
        tb = t0 + i * bar
        harp_arp(S, ch, tb, bar, 54 + (8 if hi <= i < hi + 4 else 0), steps=8)
        pad(S, ch, tb, bar * 1.02, 62 + (10 if i >= hi else 0), tracks=("cb", "vc", "vla", "vln2"))
        if hi <= i < hi + 4:
            for p in voices(ch, [60, 65, 69]):
                S.note("oohs", tb, bar * 1.02, p, 54)
    if nb >= 10:
        mel(S, "flute", NAT_A, t0, bar, 70, bar0=2, octv=1)
        mel(S, "vln1", NAT_A, t0, bar, 62, bar0=2)
        mel(S, "vln1", NAT_B, t0, bar, 78, bar0=6, octv=1)
        mel(S, "oboe", NAT_B, t0, bar, 62, bar0=6)
        S.expr("horn1", [(t0 + 6 * bar, 50), (t0 + 8 * bar, 76), (t0 + hi * bar, 92), (t0 + (hi + 4) * bar, 70)])
        for i in range(6, min(nb, hi + 4)):
            S.note("horn1", t0 + i * bar, bar * 1.0, near(chords[i], 55, triad=True), 60 + (8 if i >= hi else 0))
    if nb >= hi + 4:
        mel(S, "vln1", NAT_A, t0, bar, 90, bar0=hi, octv=1)
        mel(S, "vln2", NAT_A, t0, bar, 84, bar0=hi)
        mel(S, "horn2", NAT_A, t0, bar, 72, bar0=hi, octv=-1)
        S.expr("horn2", [(t0 + hi * bar, 84), (t0 + (hi + 2.5) * bar, 104), (t0 + (hi + 4) * bar, 70)])
        for k in range(12):
            S.note("timp", t0 + (hi + 2) * bar - (12 - k) * bar / 16, 0.3, 41, 40 + 4 * k, jit=0.003)
        S.note("timp", t0 + (hi + 2) * bar, 1.5, 38, 84)
        S.note("timp", t0 + hi * bar, 1.5, 41, 76)
    for i in range(hi + 4, nb):  # floating outro
        tb = t0 + i * bar
        S.note("vln1", tb, bar * 1.02, near(chords[i], 77, triad=True), 66)
        S.note("flute", tb + bar / 2, bar / 2, near(chords[i], 84, triad=True), 56)
    S.syn("sub", t0, dur, 43.65, 0.3, attack=3.0, release=1.0)
    S.section("scene4", t0, t1, -8.0)


def sec_scene5(S, t0, t1):
    """After 5 years: territorial tension, a standoff that resolves without a fight."""
    dur = t1 - t0
    nb = max(14, int(round(dur / 2.31)))
    bar = dur / nb
    beat = bar / 4
    e8 = beat / 2
    n_res = max(3, int(round(nb * 0.16)))      # resolution
    n_std = max(3, int(round(nb * 0.15)))      # standoff
    b_std = nb - n_res - n_std
    b_res = nb - n_res
    cyc = ["Dm", "Dm", "Dm/C", "Dm/C", "Bb", "Bb", "A", "A"]
    S.syn("sub", t0, b_res * bar, 36.71, 0.4, attack=1.5, release=0.6)
    S.note("timp", t0 + 0.02, 1.5, 38, 70)
    S.expr("ost", [(t0, 80), (t0 + b_std * bar, 104), (t0 + b_res * bar - 0.1, 124)])
    S.expr("ost_lo", [(t0, 80), (t0 + b_std * bar, 104), (t0 + b_res * bar - 0.1, 124)])
    pat = [0, 0, 7, 0, 3, 0, 7, 5]
    for i in range(b_res):
        tb = t0 + i * bar
        stand = i >= b_std
        ch = "A" if stand else cyc[(i - 2) % 8]
        root = bass(ch, 45) if not stand else 45
        hot = min(1.0, max(0.0, (i - 10) / max(1.0, b_std - 10))) if not stand else 1.0
        if i >= 2:
            third = 4 if ch in ("Bb", "A") else 3
            for k, iv in enumerate(pat):
                p = root + (third if iv == 3 else iv) if not stand else 45 + (0 if k % 4 else (0, 1)[(i + k // 4) % 2])
                S.note("ost", tb + k * e8, e8 * 0.55, p, (86 if k % 4 == 0 else 66) + 12 * hot)
                S.syn("pulse", tb + k * e8, 0.2, p - 12, 0.32 + 0.2 * hot)
                if k % 2 == 0:
                    S.note("ost_lo", tb + k * e8, e8 * 0.9, p - 12, 74 + 10 * hot)
            for k in (2, 3, 6, 7, 10, 11, 14, 15):  # the gallop's sixteenths, plucked lightly
                S.note("pizz", tb + k * beat / 4, 0.15, root + 12, 50 + 10 * hot)
        if i >= 2 or stand:
            S.note("timp", tb, 0.8, root - 12 if root - 12 >= 33 else root, 52 + 16 * hot)
            S.syn("drum", tb, 0.5, 50.0, 0.5 + 0.3 * hot)
            S.syn("drum", tb + 2.5 * beat, 0.4, 56.0, 0.3 + 0.2 * hot)
        if 10 <= i < b_std and i % 2 == 0:  # horns lean in
            te = tb + 2 * bar
            v = voices(ch, [50, 57], triad=True)
            S.expr("horn1", [(tb, 54), (tb + bar, 92), (te, 62)])
            S.expr("horn2", [(tb, 54), (tb + bar, 92), (te, 62)])
            S.note("horn1", tb, te - tb, v[1], 66)
            S.note("horn2", tb, te - tb, v[0], 64)
    ts, tr_ = t0 + b_std * bar, t0 + b_res * bar
    S.expr("trem", [(ts, 30), (tr_ - 0.12, 124)])
    for k, p in enumerate((57, 64, 70, 74)):  # A E Bb D: the standoff
        S.note("trem", ts + k * (tr_ - ts) / 6, tr_ - ts - k * (tr_ - ts) / 6 - 0.12, p, 76)
    for k in range(16):
        S.note("timp", tr_ - bar + k * bar / 16, 0.3, 33, 36 + 4 * k, jit=0.003)
    # --- nobody fights: warm release
    res = ["Bbmaj7"] * max(1, n_res // 2) + ["Dm9"] * (n_res - max(1, n_res // 2))
    swell(S, ("cb", "vc", "vla", "vln2", "vln1"), [(tr_, 96), (tr_ + bar, 80), (t1 - 0.2, 44)])
    for i, ch in enumerate(res):
        tb = tr_ + i * bar
        pad(S, ch, tb, bar * 1.02, 70 - 5 * i, tracks=("cb", "vc", "vla", "vln2"))
        if i == 0:
            for k, p in enumerate(tones(ch, 46, 86)[:10]):
                S.note("harp", tb + k * 0.07, 2.5, p, 56 + 2 * k)
    frag = [(0, 0, 2, "A5"), (0, 2, 1, "G5"), (0, 3, 1, "F5"), (1, 0, 4, "D5")]
    mel(S, "vln1", frag, tr_, bar, 70)
    mel(S, "oboe", frag, tr_, bar, 60)
    S.section("scene5", t0, tr_, -9.0)
    S.section("scene5res", tr_, t1, -10.0)


def sec_scene6(S, t0, t1):
    """After 20 years: flowing, curious natural-history warmth in 3/4."""
    dur = t1 - t0
    nb = max(12, int(round(dur / 2.14)))
    bar = dur / nb
    n_out = nb - 8 * ((nb - 2) // 8)
    body = nb - n_out
    out_ch = ["Bb", "F/A", "Gm7", "Csus", "C", "Csus"]
    swell(S, ("cb", "vc", "vla", "vln2"), [(t0, 50), (t0 + 8 * bar, 62), (t0 + min(16, body) * bar, 84), (t0 + body * bar, 80), (t1 - 0.2, 60)])
    for i in range(nb):
        tb = t0 + i * bar
        ch = CH_WALTZ[i % 8] if i < body else out_ch[min(i - body, 5)]
        b = bass(ch, 36)
        T = tones(ch, b, b + 30, triad=True)
        for k, idx in enumerate([0, 2, 4, 3, 5, 3]):  # flowing harp
            S.note("harp", tb + k * bar / 6, bar / 2, T[min(idx, len(T) - 1)], 56 + (6 if k == 0 else 0))
        S.note("pizz", tb, 0.4, b, 60)
        if i >= 1:
            pad(S, ch, tb, bar * 1.02, 56 + (8 if i >= 16 else 0), tracks=("vc", "vla", "vln2") if i < 16 else ("cb", "vc", "vla", "vln2"))
    cyc = body // 8
    if cyc >= 1:
        mel(S, "clar", WALTZ, t0, bar, 70, bpb=3)
    if cyc >= 2:
        mel(S, "flute", WALTZ, t0, bar, 66, bpb=3, bar0=8, octv=1)
        for i in range(8, 16):
            S.note("oboe", t0 + i * bar, bar * 0.98, near(CH_WALTZ[i % 8], 67, triad=True), 56)
            if i % 2 == 0:
                S.note("glock", t0 + i * bar, 1.0, near(CH_WALTZ[i % 8], 84, triad=True), 44)
    if cyc >= 3:
        S.expr("vln1", [(t0 + 16 * bar, 80), (t0 + 20 * bar, 100), (t0 + 24 * bar, 84)])
        mel(S, "vln1", WALTZ, t0, bar, 80, bpb=3, bar0=16)
        mel(S, "clar", WALTZ, t0, bar, 58, bpb=3, bar0=16, octv=-1)
        for i in range(16, 24):
            if i % 2 == 1:
                p = near(CH_WALTZ[i % 8], 84, triad=True)
                S.note("flute", t0 + i * bar + 2 * bar / 3, bar / 3, p, 58)
    tb = t0 + body * bar
    tail = [(0, 0, 1, "C5"), (0, 1, 1, "F5"), (0, 2, 1, "G5"), (1, 0, 3, "A5"), (2, 0, 2, "G5"), (2, 2, 1, "F5"), (3, 0, 3, "G5")]
    mel(S, "clar", [x for x in tail if x[0] < n_out], tb, bar, 64, bpb=3)
    S.section("scene6", t0, t1, -10.0)


def sec_scene7(S, t0, t1):
    """After 50 years: epic-atmospheric, wider and grander; the theme on horns."""
    dur = t1 - t0
    nb = max(10, int(round(dur / 3.75)))
    bar = dur / nb
    beat = bar / 4
    chords = ["Dm", "Dm"] + CH_THEME + CH_THEME + CH_THEME
    chords = (chords + ["Dm", "Asus", "Asus"])[:nb] if nb > 14 else chords[:nb]
    if nb >= 16:
        chords[14:] = (["Dm", "Asus"] + ["Asus"] * 8)[:nb - 14]
    hi = 10
    swell(S, ("cb", "vc", "vla", "vln2"), [(t0, 60), (t0 + 2 * bar, 80), (t0 + hi * bar, 100), (t0 + (hi + 2.5) * bar, 116),
                                             (t0 + min(nb, hi + 4) * bar, 90), (t1 - 0.2, 70)])
    S.syn("sub", t0, dur, 36.71, 0.4, attack=1.0, release=1.0)
    for k in range(12):
        S.note("timp", t0 + 2 * bar - (12 - k) * bar / 16, 0.3, 38, 40 + 4 * k, jit=0.003)
    S.note("timp", t0 + 0.02, 1.5, 38, 78)
    S.expr("horn1", [(t0 + bar, 64), (t0 + 2 * bar, 96), (t0 + 6 * bar, 100), (t0 + hi * bar, 104), (t0 + min(nb, hi + 4) * bar, 84), (t1, 60)])
    S.expr("horn2", [(t0 + bar, 60), (t0 + 2 * bar, 90), (t0 + hi * bar, 100), (t0 + min(nb, hi + 4) * bar, 80), (t1, 56)])
    S.note("horn1", t0 + bar, 2 * beat * 0.97, N("A3"), 74)      # the call: a rising fifth
    S.note("horn1", t0 + bar + 2 * beat, 2 * beat * 0.97, N("D4"), 80)
    for i, ch in enumerate(chords):
        tb = t0 + i * bar
        pad(S, ch, tb, bar * 1.02, 66 + (10 if hi <= i < hi + 4 else 0), tracks=("cb", "vc", "vla", "vln2"))
        if i >= 2:
            harp_arp(S, ch, tb, bar, 56, steps=8)
            S.note("horn2", tb, bar * 0.99, near(ch, 50, triad=True), 66)
        if 2 <= i < hi + 4 and i % 2 == 0:
            S.note("timp", tb, 1.5, bass(ch, 36), 70 + (10 if i >= hi else 0))
        if 6 <= i < hi + 4:
            for p in voices(ch, [57, 62, 65]):
                S.note("choir", tb, bar * 1.02, p, 54 + (10 if i >= hi else 0))
    S.expr("vln1", [(t0 + 2 * bar, 44), (t0 + hi * bar - 0.3, 62), (t0 + hi * bar, 104), (t0 + (hi + 2.5) * bar, 120),
                    (t0 + min(nb, hi + 4) * bar, 86), (t1 - 0.2, 60)])
    if nb >= 10:
        mel(S, "horn1", THEME_A, t0, bar, 84, bar0=2, octv=-1)
        mel(S, "horn1", THEME_B, t0, bar, 88, bar0=6, octv=-1)
        for i in range(2, hi):  # high, still violins: the wide air above the horns
            S.note("vln1", t0 + i * bar, bar * 1.02, near(chords[i], 81, triad=True), 52)
    if nb >= hi + 4:
        mel(S, "vln1", THEME_A, t0, bar, 94, bar0=hi, octv=1)
        mel(S, "vln2", THEME_A, t0, bar, 88, bar0=hi)
        for k, p in enumerate(["D4", "F4", "A4", "C5"]):
            S.note("horn1", t0 + (hi + k) * bar, bar * 0.99, N(p), 84)
        for k in range(12):
            S.note("timp", t0 + (hi + 2) * bar - (12 - k) * bar / 16, 0.3, 41, 44 + 4 * k, jit=0.003)
    for i in range(hi + 4, nb):
        S.note("vln1", t0 + i * bar, bar * 1.02, near(chords[i], 76, triad=True), 60)
    if nb > hi + 4:
        tb = t0 + (hi + 4) * bar
        S.note("horn1", tb + bar, 2 * beat, N("A3"), 62)
        S.note("horn1", tb + bar + 2 * beat, min(2 * beat, t1 - tb - bar - 2 * beat - 0.1), N("D4"), 64)
    S.section("scene7", t0, t1, -7.5)


def sec_scene8(S, t0, t1, p0, p1):
    """After 100 years: majestic, thinning out; then the photograph - solo piano theme."""
    p0 = float(np.clip(p0, t0 + 8.0, t1 - 10.0))
    p1 = float(np.clip(p1, p0 + 8.0, t1))
    tA = p0 - 1.2
    nA = max(3, int(round((tA - t0) / 3.6)))
    bar = (tA - t0) / nA
    cyc = ["Bb", "F", "C", "Dm"]
    line = [[(0, 0, 2, "D5"), (0, 2, 2, "F5")], [(0, 0, 3, "A5"), (0, 3, 1, "G5")], [(0, 0, 2, "G5"), (0, 2, 2, "E5")], [(0, 0, 4, "F5")]]
    thin = max(1, nA - 2)
    swell(S, ("cb", "vc", "vla", "vln2"), [(t0, 96), (t0 + thin * bar, 84), (tA - 0.2, 26)])
    S.expr("vln1", [(t0, 100), (t0 + thin * bar, 88), (tA + 0.6, 22)])
    S.expr("horn1", [(t0, 92), (t0 + thin * bar, 60)])
    S.expr("horn2", [(t0, 88), (t0 + thin * bar, 56)])
    S.note("timp", t0 + 0.02, 1.8, 34, 82)
    S.syn("sub", t0, thin * bar, 58.27 / 2, 0.4, attack=0.2, release=2.0)
    for i in range(nA):
        tb = t0 + i * bar
        ch = cyc[i % 4]
        full = i < thin
        pad(S, ch, tb, bar * 1.02, 76 if full else 60, tracks=("cb", "vc", "vla", "vln2") if full else ("vla", "vln2"))
        mel(S, "vln1", line[i % 4], tb, bar, 86 if full else 64, octv=1 if full else 0)
        if full:
            v = voices(ch, [50, 57], triad=True)
            S.note("horn1", tb, bar, v[1], 72)
            S.note("horn2", tb, bar, v[0], 70)
            for p in voices(ch, [57, 62, 65]):
                S.note("choir", tb, bar * 1.02, p, 58)
            harp_arp(S, ch, tb, bar, 56, steps=8)
            if i == 2:
                S.note("timp", tb, 1.5, 36, 70)
    # --- the photograph
    nP = 4 * max(1, int(round((p1 - p0) / 16.0)))
    barp = (p1 - p0) / nP
    for i in range(nP):
        tb = p0 + i * barp
        ch = CH_THEME[i % 4]
        lh_arp(S, "piano", ch, tb, barp, 38, steps=4)
        S.pedal("piano", tb + 0.04, tb + barp - 0.06)
    for k in range(nP // 4):
        mel(S, "piano", THEME_A if k % 2 == 0 else THEME_B, p0, barp, 60, bar0=4 * k, cresc=0.6)
    if nP >= 8:
        swell(S, ("vln1", "vln2"), [(p0 + 4 * barp, 20), (p0 + 6 * barp, 46), (p1, 40), (t1 - 0.1, 96)])
        S.note("vln1", p0 + 4 * barp, p1 - p0 - 4 * barp, N("A5"), 50)
        S.note("vln2", p0 + 4 * barp, p1 - p0 - 4 * barp, N("F5"), 48)
    # --- arrival chord, then a swell into the next scene
    S.pedal("piano", p1 + 0.03, t1)
    S.chord("piano", p1, max(1.0, t1 - p1), [38, 45, 52, 57, 65, 69], 52, roll=0.03)
    if t1 - p1 > 1.0:
        swell(S, ("cb", "vc", "vla"), [(p1, 30), (t1 - 0.1, 104)])
        pad(S, "Asus", p1 + 0.1, t1 - p1 - 0.15, 70, tracks=("cb", "vc", "vla"))
        S.note("vln1", p1 + 0.1, t1 - p1 - 0.15, N("A5"), 62)
        S.note("vln2", p1 + 0.1, t1 - p1 - 0.15, N("E5"), 60)
        g = tones("Asus", 45, 88)
        st = (t1 - p1 - 0.3) / len(g)
        for k, p in enumerate(g):
            S.note("harp", p1 + 0.15 + k * st, 1.0, p, 48 + 2 * k, jit=0.002)
    S.section("scene8", t0, tA, -8.0)
    S.section("photo", p0 - 0.6, p1, -11.0)
    S.section("scene8out", p1, t1, -9.0)


def sec_scene9(S, t0, t1):
    """After 200 years: the climax. Full strings, choir, horns; settles by the end."""
    dur = t1 - t0
    nb = max(12, int(round(dur / 3.75)))
    bar = dur / nb
    beat = bar / 4
    chords = ["Dm", "Dm"] + CH_THEME + CH_THEME + CH_NAT_A
    tailc = ["Bb", "F/C", "Csus", "Dm9", "Dm9", "Dm9"]
    while len(chords) < nb:
        chords.append(tailc[min(len(chords) - 14, 5)])
    chords = chords[:nb]
    b_set = min(nb - 2, 14)  # settling starts
    swell(S, ("cb", "vc", "vla", "vln2"), [(t0, 110), (t0 + 2 * bar, 104), (t0 + 6 * bar, 116), (t0 + 10 * bar, 124),
                                             (t0 + 12 * bar, 112), (t0 + b_set * bar, 84), (t1 - 0.3, 34)])
    S.expr("vln1", [(t0, 104), (t0 + 2 * bar, 106), (t0 + 6 * bar, 118), (t0 + 10 * bar, 127), (t0 + 12 * bar, 114),
                    (t0 + b_set * bar, 84), (t1 - 0.3, 30)])
    for tr in ("horn1", "horn2", "choir"):
        S.expr(tr, [(t0, 100), (t0 + 6 * bar, 110), (t0 + 10 * bar, 122), (t0 + 12 * bar, 104), (t0 + b_set * bar, 70), (t1 - 0.3, 30)])
    S.syn("sub", t0, b_set * bar, 36.71, 0.5, attack=0.05, release=3.0)
    S.note("timp", t0 + 0.02, 2.0, 38, 100)
    S.syn("drum", t0 + 0.02, 0.8, 46.0, 0.9)
    for i, ch in enumerate(chords):
        tb = t0 + i * bar
        full = i < b_set
        pad(S, ch, tb, bar * 1.02, 84 if full else 62, tracks=("cb", "vc", "vla", "vln2") if full else ("vc", "vla", "vln2"))
        harp_arp(S, ch, tb, bar, 64 if full else 52, steps=8)
        if full:
            for p in voices(ch, [53, 57, 62, 65, 69]):
                S.note("choir", tb, bar * 1.02, p, 72)
            v = voices(ch, [50, 57], triad=True)
            S.note("horn2", tb, bar, v[0], 78)
            if i < 6 or i >= 10:
                S.note("horn1", tb, bar, v[1], 80)
            if i >= 2:
                S.note("timp", tb, 1.5, bass(ch, 36), 84 if i % 2 == 0 else 62)
        else:
            S.note("vln1", tb, bar * 1.02, near(ch, 77, triad=True), 58)
    for k, p in enumerate(["A3", "D4", "E4", "F4"]):  # the motif rises out of the arrival
        S.note("horn1", t0 + bar + k * beat, beat * 0.97, N(p), 92)
        S.note("vc", t0 + bar + k * beat, beat * 0.97, N(p), 88)
    for b0 in (2, 6, 10):
        for k in range(12):
            S.note("timp", t0 + b0 * bar - (12 - k) * bar / 16, 0.3, 38 if b0 != 10 else 41, 46 + 5 * k, jit=0.003)
    mel(S, "vln1", THEME_A, t0, bar, 100, bar0=2, octv=1)
    mel(S, "vln2", THEME_A, t0, bar, 94, bar0=2)
    mel(S, "vln1", THEME_B, t0, bar, 104, bar0=6, octv=1)
    mel(S, "vln2", THEME_B, t0, bar, 98, bar0=6)
    mel(S, "horn1", THEME_B, t0, bar, 96, bar0=6, octv=-1)
    if nb >= 14:
        mel(S, "vln1", NAT_A, t0, bar, 108, bar0=10, octv=1)
        mel(S, "vln2", NAT_A, t0, bar, 100, bar0=10)
        mel(S, "flute", NAT_A, t0, bar, 84, bar0=10, octv=1)
        S.note("timp", t0 + 10 * bar, 2.0, 41, 100)
        S.syn("drum", t0 + 10 * bar, 0.8, 46.0, 0.9)
    S.section("scene9", t0, t0 + b_set * bar, -6.0)
    S.section("scene9out", t0 + b_set * bar, t1, -9.5)


def sec_finale(S, t0, T, last_word, t_strings):
    """Soft piano theme, slower; strings for the last two lines; final F major fading to silence at T."""
    tc = min(last_word + 0.5, T - 4.5)
    if tc - t0 < 14.0:
        tc = max(t0 + 4.0, T - 4.5)
    span = tc - t0
    nb = 12 if 3.6 <= span / 12.0 <= 5.6 else 4 * max(1, int(round(span / 18.0)))
    bar = span / nb
    phr = {4: "C", 8: "AC", 12: "ABC", 16: "ABAC"}.get(nb, "A" * (nb // 4 - 1) + "C")
    end_ch = ["Bb", "F/A", "Gm7", "C"]
    for k, ph in enumerate(phr):
        tb = t0 + 4 * k * bar
        chs = end_ch if ph == "C" else CH_THEME
        for i, ch in enumerate(chs):
            lh_arp(S, "piano", ch, tb + i * bar, bar, 40 + (4 if ph == "C" else 0), steps=4)
            S.pedal("piano", tb + i * bar + 0.04, tb + (i + 1) * bar - 0.06)
        mel(S, "piano", {"A": THEME_A, "B": THEME_B, "C": THEME_END}[ph], tb, bar, 60 + (5 if ph == "C" else 0), legato=0.99)
    # strings join for the final lines
    ts = float(np.clip(t_strings, t0 + bar, tc - 2 * bar))
    ib = int(np.ceil((ts - t0) / bar - 1e-6))
    trs = ("cb", "vc", "vla", "vln2", "vln1")
    swell(S, trs, [(t0 + ib * bar, 24), (tc - bar, 64), (tc, 84), (tc + 1.2, 80), (T - 0.4, 8)])
    for i in range(ib, nb):
        ph = phr[i // 4]
        ch = (end_ch if ph == "C" else CH_THEME)[i % 4]
        pad(S, ch, t0 + i * bar, bar * 1.02, 60, tracks=trs)
    # final chord: F major, third on top
    S.pedal("piano", tc + 0.03, T)
    S.chord("piano", tc, T - tc, [N("F2"), N("C3"), N("F3"), N("A3"), N("C4"), N("F4"), N("A4")], 60, roll=0.035, vstep=0.5)
    S.note("piano", tc + 0.3, T - tc - 0.3, N("A5"), 66)
    for tr, p in zip(trs, [N("F1"), N("C3"), N("A3"), N("F4"), N("C5")]):
        S.note(tr, tc, T - tc, p, 66)
    S.note("vc", tc, T - tc, N("F2"), 64)
    g = [N(x) for x in ["F2", "C3", "F3", "A3", "C4", "F4", "A4", "C5", "F5", "A5"]]
    if T - tc > 3.5:
        for k, p in enumerate(g):
            S.note("harp", tc + 1.3 + k * 0.15, 3.0, p, 52 - 2 * k)
    if T - tc > 5.0:
        S.note("piano", tc + 3.4, T - tc - 3.4, N("C6"), 40)
        S.note("piano", tc + 4.1, T - tc - 4.1, N("F6"), 36)
    S.syn("sub", tc, T - tc, 43.65, 0.3, attack=0.5, release=max(1.0, T - tc - 1.0))
    S.section("finale", t0, tc, -10.5)
    S.section("final_chord", tc, T, -9.0)
    return tc


# ------------------------------------------------------------------ driver ---

def music_spec(timeline: dict) -> dict:
    """Everything in the timeline that the score depends on (also its cache key)."""
    dur = float(timeline.get("duration", 600.0))
    scenes = {}
    for sc in timeline.get("scenes", []):
        try:
            scenes[int(sc["n"])] = (float(sc["start"]), float(sc["end"]))
        except (KeyError, TypeError, ValueError):
            continue
    if not scenes:
        k = dur / 10.0
        scenes = {i + 1: (i * k, (i + 1) * k) for i in range(10)}
    m = timeline.get("markers", {}) or {}

    def mk(name, default):
        try:
            return float(m[name])
        except (KeyError, TypeError, ValueError):
            return float(default)

    s1 = scenes.get(1, (0.0, min(60.0, dur)))
    s2 = scenes.get(2)
    s8 = scenes.get(8)
    last = max(scenes)
    fin0 = mk("finale_start", scenes[last][0])
    vanish = mk("vanish", s1[0] + 0.4 * (s1[1] - s1[0]))
    spec = {
        "duration": round(dur, 3),
        "scenes": {str(k): [round(a, 3), round(b, 3)] for k, (a, b) in sorted(scenes.items())},
        "vanish": round(vanish, 3),
        "main_title": round(mk("main_title", s1[1] - 4.8), 3),
        "finale_start": round(fin0, 3),
        "last_word_end": round(mk("last_word_end", dur - 7.0), 3),
    }
    if s8:
        spec["photo_start"] = round(mk("photo_start", s8[0] + 0.43 * (s8[1] - s8[0])), 3)
        spec["photo_end"] = round(mk("photo_end", s8[1] - 2.0), 3)
    if s2:
        tp = s2[0] + (s2[1] - s2[0]) / 3.0
        for cue in timeline.get("sfx", []) or []:
            try:
                if cue.get("type") == "power_down_big" and s2[0] <= float(cue["t"]) < s2[1]:
                    tp = float(cue["t"])
                    break
            except (TypeError, ValueError, AttributeError):
                continue
        spec["power"] = round(tp, 1)
    nar = []
    for x in timeline.get("narration", []) or []:
        try:
            nar.append(float(x["start"]))
        except (KeyError, TypeError, ValueError):
            continue
    nar = sorted(t for t in nar if t >= fin0)
    spec["final_lines_start"] = round(nar[-2], 1) if len(nar) >= 2 else round(spec["last_word_end"] - 9.0, 1)
    return spec


def compose(spec: dict) -> Score:
    S = Score(seed=20261112)
    sc = {int(k): tuple(v) for k, v in spec["scenes"].items()}
    T = spec["duration"]
    if 1 in sc:
        a, b = sc[1]
        v = float(np.clip(spec["vanish"], a + 6.0, b - 18.0)) if b - a > 30 else None
        if v:
            sec_opening(S, a, v)
            sec_theme1(S, v + 4.0, b, spec.get("main_title"))
        else:
            sec_opening(S, a, b)
    if 2 in sc:
        sec_scene2(S, sc[2][0], sc[2][1], spec.get("power", sc[2][0] + 20.0))
    fin0 = spec["finale_start"]
    table = {3: sec_scene3, 4: sec_scene4, 5: sec_scene5, 6: sec_scene6, 7: sec_scene7, 9: sec_scene9}
    for n, fn in table.items():
        if n in sc and sc[n][1] - sc[n][0] >= 20.0:
            fn(S, sc[n][0], min(sc[n][1], fin0) if n == 9 else sc[n][1])
    if 8 in sc and sc[8][1] - sc[8][0] >= 30.0:
        sec_scene8(S, sc[8][0], sc[8][1], spec.get("photo_start", sc[8][0] + 26.0), spec.get("photo_end", sc[8][1] - 2.0))
    if T - fin0 >= 12.0:
        sec_finale(S, fin0, T, spec["last_word_end"], spec["final_lines_start"])
    return S
